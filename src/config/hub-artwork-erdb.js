// Configuração local e privada do renderer ERDB.
// Não gravar o token na biblioteca, perfis de addons ou payloads GET.
import path from 'node:path';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from './json-store.js';

const DATA=resolveDataDir();
const FILE=path.join(DATA,'hub-artwork-erdb.json');
export const DEFAULT_ERDB_BASE='https://easyratingsdb.com';
const CATEGORIES=['poster','backdrop','logo','thumbnail'];
const DEFAULTS=Object.freeze({enabled:false,baseUrl:DEFAULT_ERDB_BASE,
 poster:true,backdrop:false,logo:false,thumbnail:false,token:''});

function read(){
 const value=readJsonFile(FILE,null,{strict:true,requireObject:true,errorMessage:'Não foi possível ler a configuração privada de capas.'});
 return value?{...DEFAULTS,...value}:{...DEFAULTS};
}
function normalizeBaseUrl(input){
 if(typeof input!=='string')throw Error('Endereço ERDB inválido.');
 const value=input.trim().replace(/\/+$/,'');
 let url;
 try{url=new URL(value);}catch{throw Error('Informe a URL HTTPS do ERDB.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
   url.pathname!=='/'&&!/^[a-z0-9/_-]{1,100}$/i.test(url.pathname)||
   !url.hostname||value.length>230)
  throw Error('Use um endereço HTTPS do ERDB, sem credenciais ou parâmetros.');
 return url.origin+url.pathname.replace(/\/$/,'');
}
export function erdbConfig(){
 const config=read();
 return {...config,baseUrl:normalizeBaseUrl(config.baseUrl||DEFAULT_ERDB_BASE)};
}
export function erdbStatus(){
 const config=erdbConfig();
 return {
  enabled:config.enabled===true&&!!config.token,
  requested:config.enabled===true,configured:!!config.token,
  baseUrl:config.baseUrl,
  poster:config.poster===true,backdrop:config.backdrop===true,
  logo:config.logo===true,thumbnail:config.thumbnail===true,
  artworkTypes:CATEGORIES
 };
}
export function saveErdbSettings(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Configuração inválida.');
 if(Object.keys(body).some(k=>!['enabled','token','clearToken','baseUrl',...CATEGORIES].includes(k)))
  throw Error('Opção de imagem desconhecida.');
 const config=read(),next={...config};
 if(body.baseUrl!==undefined)next.baseUrl=normalizeBaseUrl(body.baseUrl);
 for(const item of ['enabled',...CATEGORIES]){
  if(body[item]===undefined)continue;
  if(typeof body[item]!=='boolean')throw Error('Escolha inválida para '+item+'.');
  next[item]=body[item];
 }
 if(body.clearToken!==undefined){
  if(body.clearToken!==true)throw Error('Remoção de token inválida.');
  next.token='';
  next.enabled=false;
 }
 if(body.token!==undefined){
  if(typeof body.token!=='string')throw Error('Token ERDB inválido.');
  const v=body.token.trim();
  if(v&&!/^Tk-[A-Za-z0-9_-]{6,160}$/.test(v))
   throw Error('Informe o token ERDB Tk-... gerado no site oficial.');
  if(v)next.token=v;
 }
 if(next.enabled&&!next.token)throw Error('Configure o token ERDB antes de ativar as capas.');
 if(next.enabled&&!CATEGORIES.some(x=>next[x]))throw Error('Escolha pelo menos um tipo de imagem.');
 writeAtomicJsonFile(FILE,next);
 return erdbStatus();
}
