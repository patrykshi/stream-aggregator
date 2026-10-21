// Credenciais do Nuvio Hub: persistência local, sem envio de segredos ao navegador.
import fs from 'node:fs';
import path from 'node:path';
const DIR=process.env.DATA_DIR||path.resolve('data');
const FILE=path.join(DIR,'hub-integrations.json');
const KEYS={tmdb:'TMDB_API_KEY',trakt:'TRAKT_CLIENT_ID',mdblist:'MDBLIST_API_KEY'};
function read(){try{const v=JSON.parse(fs.readFileSync(FILE,'utf8'));return v&&typeof v==='object'?v:{};}catch(e){if(e.code==='ENOENT')return {};throw Error('Não foi possível ler a configuração das integrações.');}}
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
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 const temp=FILE+'.'+process.pid+'.tmp';
 try{
  fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(temp,FILE);
  fs.chmodSync(FILE,0o600);
 }finally{try{fs.unlinkSync(temp);}catch{}}
 return integrationStatuses();
}
