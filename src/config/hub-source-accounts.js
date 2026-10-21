// Perfis pessoais das origens. Segredos em arquivo local (0600), sem retorno via API.
import fs from 'node:fs';
import path from 'node:path';
const DATA=process.env.DATA_DIR||path.resolve('data');
const FILE=path.join(DATA,'hub-source-accounts.json');
const FIELDS={
 traktUsername:{type:'username'},tvmazeUsername:{type:'username'},
 tvmazeKey:{type:'secret'},tmdbAccountId:{type:'numeric'},
 tmdbSessionId:{type:'secret'}
};
function read(){try{
 const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
 return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
}catch(e){if(e.code==='ENOENT')return {};throw Error('Erro ao ler conexões de fontes.');}}
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
 fs.mkdirSync(DATA,{recursive:true,mode:0o700});
 const tmp=FILE+'.'+process.pid+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,FILE);fs.chmodSync(FILE,0o600);
 }finally{try{fs.unlinkSync(tmp);}catch{}}
 return sourceAccountStatus();
}
