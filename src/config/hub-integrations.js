// Credenciais do Nuvio Hub: persistência local, sem envio de segredos ao navegador.
import path from 'node:path';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from './json-store.js';
const DIR=resolveDataDir();
const FILE=path.join(DIR,'hub-integrations.json');
const KEYS={tmdb:'TMDB_API_KEY',trakt:'TRAKT_CLIENT_ID',mdblist:'MDBLIST_API_KEY'};
function read(){
 return readJsonFile(FILE,{},{strict:true,requireObject:true,errorMessage:'Não foi possível ler a configuração das integrações.'});
}
export function getIntegrationKey(provider){
 const env=KEYS[provider];
 if(!env)throw Error('Integração desconhecida.');
 const saved=read()[provider];
 return typeof saved==='string'&&saved.trim()?saved.trim():String(process.env[env]||'').trim();
}
export function integrationStatuses(){
 const saved=read();
 return Object.fromEntries(Object.keys(KEYS).map(name=>[name,{
  configured:Boolean(getIntegrationKey(name)),
  origin:typeof saved[name]==='string'&&saved[name].trim()?'local':(process.env[KEYS[name]]?'ambiente':'ausente')
 }]));
}
export function updateIntegrationSettings(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Configuração inválida.');
 const keys=Object.keys(input);
 if(!keys.length||keys.some(k=>!Object.hasOwn(KEYS,k)))throw Error('Provedor não reconhecido.');
 const current=read();const next={...current};
 for(const [provider,action] of Object.entries(input)){
  if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Ação inválida.');
  if(action.clear===true){
   if(Object.keys(action).some(k=>k!=='clear'))throw Error('Ação de remoção inválida.');
   delete next[provider];continue;
  }
  if(Object.keys(action).some(k=>k!=='value')||typeof action.value!=='string')throw Error('Formato de chave inválido.');
  const secret=action.value.trim();
  if(!secret||secret.length>512||secret.length<8||/[\s\u0000-\u001f\u007f]/.test(secret))
   throw Error('A chave deve ter 8 a 512 caracteres, sem espaços ou controles.');
  next[provider]=secret;
 }
 writeAtomicJsonFile(FILE,next);
 return integrationStatuses();
}
