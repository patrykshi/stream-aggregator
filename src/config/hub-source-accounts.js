// Perfis pessoais das origens. Segredos em arquivo local (0600), sem retorno via API.
import path from 'node:path';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from './json-store.js';
const DATA=resolveDataDir();
const FILE=path.join(DATA,'hub-source-accounts.json');
const FIELDS={
 traktUsername:{type:'username'},tvmazeUsername:{type:'username'},
 tvmazeKey:{type:'secret'},tmdbAccountId:{type:'numeric'},
 tmdbSessionId:{type:'secret'}
};
function read(){
 return readJsonFile(FILE,{},{strict:true,requireObject:true,errorMessage:'Erro ao ler conexões de fontes.'});
}
export function getSourceAccount(field){
 if(!Object.hasOwn(FIELDS,field))throw Error('Campo de origem desconhecido.');
 return String(read()[field]||'');
}
export function sourceAccountStatus(){
 const v=read();
 return {
  trakt:{username:v.traktUsername||'',configured:!!v.traktUsername},
  tvmaze:{username:v.tvmazeUsername||'',configured:!!(v.tvmazeUsername&&v.tvmazeKey),
   premiumKeyConfigured:!!v.tvmazeKey},
  tmdb:{accountId:v.tmdbAccountId||'',configured:!!(v.tmdbAccountId&&v.tmdbSessionId),
   sessionConfigured:!!v.tmdbSessionId}
 };
}
export function updateSourceAccounts(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Configuração inválida.');
 const fields=Object.keys(payload);
 if(!fields.length||fields.some(field=>!Object.hasOwn(FIELDS,field)))
  throw Error('Opção de conexão desconhecida.');
 const next={...read()};
 for(const [field,value] of Object.entries(payload)){
  if(value===null){delete next[field];continue;}
  if(typeof value!=='string')throw Error('Valor de conexão inválido.');
  const v=value.trim();
  if(!v){delete next[field];continue;}
  const kind=FIELDS[field].type;
  if(kind==='username'&&!/^[\p{L}\p{N}_.-]{1,80}$/u.test(v))
   throw Error('Nome de usuário inválido.');
  if(kind==='numeric'&&!/^\d{1,16}$/.test(v))
   throw Error('ID da conta TMDB precisa ser numérico.');
  if(kind==='secret'&&(v.length<8||v.length>512||/[\s\x00-\x1f\x7f]/.test(v)))
   throw Error('Token de integração inválido.');
  next[field]=v;
 }
 writeAtomicJsonFile(FILE,next);
 return sourceAccountStatus();
}
