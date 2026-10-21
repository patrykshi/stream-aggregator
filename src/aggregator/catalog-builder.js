// Nuvio Catalog Studio: previews de provedores e transformações de listas.
// Implementação independente inspirada no padrão de configuração do AIO Metadata.
import {parseImdbList,fetchTraktList,validateListURL} from './list-import.js';
import {getIntegrationKey} from '../config/hub-integrations.js';
import {getSourceAccount} from '../config/hub-source-accounts.js';

const LIMIT=20000; // proteção operacional; sem limite de seleção artificial por padrão
const safeString=(value,max=180)=>String(value??'').trim().slice(0,max);
const imdbId=/^tt\d{6,11}$/;
const SORTS=new Set(['source','title-asc','title-desc','year-desc','year-asc','rating-desc','rating-asc']);
const TYPES=new Set(['movie','series']);
const PRESETS={
 popular:{movie:'movie/popular',series:'tv/popular'},
 trending:{movie:'trending/movie/week',series:'trending/tv/week'},
 top_rated:{movie:'movie/top_rated',series:'tv/top_rated'},
 now_playing:{movie:'movie/now_playing',series:'tv/on_the_air'}
};
const GENRES=[
 {id:28,name:'Ação'},{id:12,name:'Aventura'},{id:16,name:'Animação'},
 {id:35,name:'Comédia'},{id:80,name:'Crime'},{id:99,name:'Documentário'},
 {id:18,name:'Drama'},{id:14,name:'Fantasia'},{id:27,name:'Terror'},
 {id:10749,name:'Romance'},{id:878,name:'Ficção científica'},
 {id:53,name:'Suspense'},{id:9648,name:'Mistério'},{id:37,name:'Faroeste'}
];
export function getBuilderCapabilities(){
 return {
  sources:[
   {id:'imdb',label:'IMDb',available:true,requiresKey:false},
   {id:'mdblist',label:'MDBList',available:true,requiresKey:false,
    note:'Feeds JSON públicos dispensam chave; API privada precisa de chave.'},
   {id:'tvmaze',label:'TVmaze',available:true,requiresKey:false,
    note:'Pesquisa e programação de séries; somente títulos com ID IMDb são importados.'},
   {id:'trakt',label:'Trakt',available:Boolean(getIntegrationKey('trakt')),requiresKey:true},
   {id:'tmdb',label:'TMDB',available:Boolean(getIntegrationKey('tmdb')),requiresKey:true},
   {id:'addon',label:'Catálogos de addons',available:true,requiresKey:false}
  ],
  keys:{trakt:Boolean(getIntegrationKey('trakt')),tmdb:Boolean(getIntegrationKey('tmdb')),
   mdblist:Boolean(getIntegrationKey('mdblist'))},
  genres:GENRES,presets:Object.keys(PRESETS),sorts:[...SORTS],maxImport:LIMIT
 };
}
function validMDBSegment(segment){
 try{
  const decoded=decodeURIComponent(segment);
  return decoded.length>0&&decoded.length<=80&&
   /^[\p{L}\p{M}\p{N}_-]+$/u.test(decoded);
 }catch{return false;}
}
export function parseMDBListURL(raw){
 let u;try{u=new URL(safeString(raw,600));}catch{throw Error('Cole uma URL pública do MDBList.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
   !['mdblist.com','www.mdblist.com'].includes(u.hostname))throw Error('Use uma URL https://mdblist.com/lists/usuario/nome-da-lista');
 const parts=u.pathname.split('/').filter(Boolean);
 const official=parts[0]==='lists'&&parts[1]==='official'&&
   ['movies','shows'].includes(parts[2])&&parts.length>=4&&
   validMDBSegment(parts[3]);
 if(official){
   if(![4,5].includes(parts.length)||(parts.length===5&&parts[4]!=='json'))
     throw Error('Endereço de lista oficial MDBList inválido.');
   const base='https://mdblist.com/lists/official/'+parts[2]+'/'+parts[3];
   return {url:base,feed:base+'/json',apiPath:'official/'+parts[3]};
 }
 if(parts.length<3||parts[0]!=='lists'||parts.length>4||
   (parts.length===4&&parts[3]!=='json')||
   !parts.slice(1,3).every(validMDBSegment))
   throw Error('URL de lista MDBList inválida; informe /lists/usuario/nome');
 return {
  url:'https://mdblist.com/lists/'+parts[1]+'/'+parts[2],
  feed:'https://mdblist.com/lists/'+parts[1]+'/'+parts[2]+'/json',
  apiPath:parts[1]+'/'+parts[2]
 };
}
function mdblistSafePoster(value){
 let raw=value;
 if(raw&&typeof raw==='object')raw=raw.url||raw.poster||raw.path;
 if(typeof raw!=='string'||raw.length>500)return undefined;
 if(/^\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/.test(raw))
  return 'https://image.tmdb.org/t/p/w342'+raw;
 try{
  const uri=new URL(raw);
  if(uri.protocol==='https:'&&['image.tmdb.org','images.metahub.space','image.tmdb.org'].includes(uri.hostname))
   return uri.toString();
 }catch{}
 return undefined;
}
export function normalizeMDBItems(rows,type){
 if(!['movie','series','both'].includes(type))throw Error('Tipo MDBList inválido.');
 const source=Array.isArray(rows)?rows:
  rows&&typeof rows==='object'?[
   ...(Array.isArray(rows.movies)?rows.movies.map(x=>({...x,_mdbMedia:'movie'})):[]),
   ...(Array.isArray(rows.shows)?rows.shows.map(x=>({...x,_mdbMedia:'series'})):[]),
   ...(Array.isArray(rows.items)?rows.items:[])]:[];
 const results=[],found=new Set();
 for(const item of source){
  if(!item||typeof item!=='object')continue;
  const mediaType=String(item.mediatype||item.media_type||item.type||'').toLowerCase();
  const mediaIs=/(tv|show|series)/.test(mediaType)?'series':
   /(movie|film)/.test(mediaType)?'movie':item._mdbMedia||null;
  if(!mediaIs||(type!=='both'&&mediaIs!==type))continue;
  const id=String(item.imdb_id||item.imdbid||item.ids?.imdb||item.imdb||'');
  const signature=mediaIs+'::'+id;
  if(!imdbId.test(id)||found.has(signature)||item.adult===true||item.adult===1)continue;
  found.add(signature);
  results.push({
   id,name:safeString(item.title||item.name)||id,type:mediaIs,
   year:Number(item.release_year||item.year)||undefined,
   poster:mdblistSafePoster(item.poster||item.poster_path)||undefined,
   description:safeString(item.description||item.overview,1800)||undefined,
   rating:Number(item.rating||item.rating_average||item.ratings?.imdb?.value||item.ratings?.imdb)||undefined,
   genres:Array.isArray(item.genres)?item.genres.map(x=>typeof x==='string'?safeString(x,60):safeString(x?.name,60)).filter(Boolean):[]
  });
  if(results.length>=LIMIT)break;
 }
 return results;
}
async function readJSONLimited(url,{fetchImpl=globalThis.fetch,headers={},maxBytes=3_000_000,timeout=10000}={}){
 // Nunca recebe endpoints de origem arbitrária, somente URLs construídas pela integração.
 const response=await fetchImpl(url,{headers:{Accept:'application/json',...headers},
  redirect:'error',signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error('A origem retornou HTTP '+response.status);
 const length=Number(response.headers?.get?.('content-length')||0);
 if(length>maxBytes)throw Error('Lista maior que o limite permitido.');
 if(!response.body){
  const value=await response.json();
  if(JSON.stringify(value).length>maxBytes)throw Error('JSON excede o limite.');
  return value;
 }
 const chunks=[];let bytes=0;
 for await(const chunk of response.body){
  bytes+=chunk.byteLength;
  if(bytes>maxBytes)throw Error('JSON excede o limite de '+Math.round(maxBytes/1000000)+' MB.');
  chunks.push(chunk);
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
// Consulta opcional somente leitura: retorna metadados das listas pertencentes à conta.
export async function fetchMDBOwnLists({key=getIntegrationKey('mdblist'),
 fetchImpl=globalThis.fetch}={}){
 if(!key)throw Error('Configure sua chave MDBList em Configurações → Integrações.');
 const endpoint=new URL('https://api.mdblist.com/lists/user/');
 endpoint.searchParams.set('apikey',key);
 let rows;
 try{rows=await readJSONLimited(endpoint.toString(),{fetchImpl,timeout:12000,maxBytes:1_000_000});}
 catch(e){throw mdblistSafeError(e,'Não foi possível consultar suas listas MDBList');}
 if(!Array.isArray(rows))throw Error('O MDBList retornou um formato inesperado para suas listas.');
 return {lists:rows.filter(x=>Number.isSafeInteger(x?.id)&&x.id>0&&
    validMDBSegment(encodeURIComponent(String(x.user_name||'')))&&
    validMDBSegment(encodeURIComponent(String(x.slug||''))))
   .slice(0,250).map(x=>({
    id:x.id,name:safeString(x.name||x.slug,100),
    type:/(show|tv|series)/i.test(String(x.mediatype||''))?'series':
     /(movie|film)/i.test(String(x.mediatype||''))?'movie':null,
    count:Number.isSafeInteger(x.items)?x.items:null,
    private:x.private===true,
    url:'https://mdblist.com/lists/'+encodeURIComponent(x.user_name)+'/'+encodeURIComponent(x.slug)
   }))};
}
function mdblistSafeError(error,context){
 const m=String(error?.message||'');
 if(/HTTP 401|HTTP 403/.test(m))return Error(
  context+': chave sem autorização (HTTP '+(m.includes('401')?'401':'403')+'). Confira as permissões da conta.');
 if(/HTTP 404/.test(m))return Error(context+': lista não encontrada (HTTP 404).');
 if(/HTTP 429/.test(m))return Error(context+': limite de chamadas da API atingido (HTTP 429).');
 if(/HTTP 5\d\d/.test(m))return Error(context+': instabilidade no servidor MDBList.');
 if(/limite|excede/.test(m))return Error(context+': resposta excedeu o limite de tamanho.');
 return Error(context+': verifique o acesso à fonte e tente novamente.');
}
function mdblistWrongType(type,oppositeCount){
 const requested=type==='movie'?'filmes':'séries';
 const available=type==='movie'?'séries':'filmes';
 const error=Error('A lista não contém '+requested+' compatíveis, mas possui '+available+
  '. Escolha '+(type==='movie'?'Séries':'Filmes')+' na etapa Fonte e faça a prévia novamente.');
 error.suggestedType=type==='movie'?'series':'movie';
 error.availableCount=oppositeCount;
 return error;
}
export async function fetchMDBList(raw,type,{key=getIntegrationKey('mdblist'),
 fetchImpl=globalThis.fetch,listId=null}={}){
 if(!['movie','series','both'].includes(type))throw Error('Tipo inválido.');
 const ownId=listId==null||listId===''?null:Number(listId);
 if(ownId!=null&&(!Number.isSafeInteger(ownId)||ownId<1))
  throw Error('Identificador da lista MDBList inválido.');
 const parsed=parseMDBListURL(raw);
 // A seleção de uma lista da conta usa o ID, inclusive para listas privadas.
 // URL pública continua suportada sem autenticação.
 let feedIssue=null,opposite=0,publicFallback=null;
 if(ownId==null){
  try{
   const data=await readJSONLimited(parsed.feed,{fetchImpl});
   const metas=normalizeMDBItems(data,type);
   if(metas.length){
    publicFallback={source:'mdblist',url:parsed.url,metas,method:'feed',
     notice:'Lista importada do feed público MDBList. Atualização manual disponível.'};
    // Sem uma chave, não forçamos API. Com chave, buscamos arte e detalhes
    // adicionais do mesmo catálogo; em falha, mantemos a lista pública.
    if(!key||metas.some(m=>m.poster))return publicFallback;
   }
   opposite=type==='both'?0:normalizeMDBItems(data,type==='movie'?'series':'movie').length;
   feedIssue='Nenhum título compatível no feed público.';
  }catch(e){feedIssue=e.message;}
 }
 if(!key){
  if(opposite)throw mdblistWrongType(type,opposite);
  throw Error('Não foi possível usar o feed público MDBList: '+feedIssue+
   ' Configure a chave MDBList para consultar também a API.');
 }
 const base='https://api.mdblist.com/lists/'+(ownId??parsed.apiPath)+'/items';
 const metas=[],seen=new Set();let oppositeCount=opposite,received=0;
 for(let page=0;page<Math.ceil(LIMIT/1000)&&metas.length<LIMIT;page++){
  const endpoint=new URL(base);
  endpoint.searchParams.set('apikey',key);
  endpoint.searchParams.set('limit','1000');
  endpoint.searchParams.set('offset',String(page*1000));
  endpoint.searchParams.set('append_to_response','genres,poster,description,ratings');
  let data;
  try{data=await readJSONLimited(endpoint.toString(),{fetchImpl,timeout:15000,maxBytes:5_000_000});}
  catch(e){
   if(publicFallback)return publicFallback;
   throw mdblistSafeError(e,'Falha ao consultar itens do MDBList');
  }
  const raw=Array.isArray(data)?data:[...(Array.isArray(data?.movies)?data.movies.map(x=>({...x,_mdbMedia:'movie'})):[]),
   ...(Array.isArray(data?.shows)?data.shows.map(x=>({...x,_mdbMedia:'series'})):[]),
   ...(Array.isArray(data?.items)?data.items:[])];
  if(!Array.isArray(raw))throw Error('Resposta MDBList em formato não reconhecido.');
  received+=raw.length;
  if(type!=='both')oppositeCount+=normalizeMDBItems(raw,type==='movie'?'series':'movie').length;
  for(const item of normalizeMDBItems(raw,type)){
   if(!seen.has(item.id)){metas.push(item);seen.add(item.id);}
   if(metas.length===LIMIT)break;
  }
  if(raw.length<1000)break;
 }
 if(!metas.length){
  if(publicFallback)return publicFallback;
  if(oppositeCount)throw mdblistWrongType(type,oppositeCount);
  if(received)throw Error('A lista foi encontrada, mas os itens não possuem IDs IMDb válidos para o Nuvio.');
  throw Error('A lista não possui títulos disponíveis. Confira se ela já terminou de atualizar no MDBList.');
 }
 return {source:'mdblist',url:parsed.url,metas,listId:ownId,method:'api',
  notice:'Lista importada pela API MDBList com chave armazenada no servidor. Atualização manual disponível.'};
}
// Listagem pessoal e importação por IDs oficiais, com autenticação somente no servidor.
function cleanUser(value){
 const v=String(value||'').trim();
 if(!/^[\p{L}\p{N}_.-]{1,80}$/u.test(v))throw Error('Usuário Trakt inválido.');
 return v;
}
export async function listTraktUserLists(username,{clientId=getIntegrationKey('trakt'),
 fetchImpl=globalThis.fetch}={}){
 if(!clientId)throw Error('Configure o Client ID Trakt nas Configurações.');
 const user=cleanUser(username);
 const rows=[];
 for(let page=1;page<=20;page++){
  const endpoint='https://api.trakt.tv/users/'+encodeURIComponent(user)+
   '/lists?limit=100&page='+page;
  const result=await readJSONLimited(endpoint,{fetchImpl,timeout:12000,headers:{
   'trakt-api-version':'2','trakt-api-key':clientId},maxBytes:2_000_000});
  if(!Array.isArray(result))throw Error('Trakt retornou listas em formato inesperado.');
  for(const item of result){
   if(!/^[\p{L}\p{N}_.-]{1,100}$/u.test(String(item?.ids?.slug||'')))continue;
   rows.push({id:String(item.ids.slug),name:safeString(item.name,110),
    count:Number(item.item_count)||null,privacy:item.privacy||'public',
    url:'https://trakt.tv/users/'+encodeURIComponent(user)+'/lists/'+encodeURIComponent(item.ids.slug)});
  }
  if(result.length<100)break;
 }
 return {username:user,lists:rows};
}
function tmdbAuth(key,url){
 const headers={};
 if(String(key).startsWith('eyJ'))headers.Authorization='Bearer '+key;
 else url.searchParams.set('api_key',String(key));
 return headers;
}
export async function listTMDBAccountLists(accountId,{sessionId,apiKey=getIntegrationKey('tmdb'),
 fetchImpl=globalThis.fetch}={}){
 if(!/^\d{1,16}$/.test(String(accountId||''))||!String(sessionId||'').trim()||!apiKey)
  throw Error('Configure ID de conta e sessão TMDB nas Configurações.');
 const rows=[];
 for(let page=1;page<=50;page++){
  const url=new URL('https://api.themoviedb.org/3/account/'+accountId+'/lists');
  url.searchParams.set('page',String(page));
  url.searchParams.set('session_id',sessionId);
  const headers=tmdbAuth(apiKey,url);
  const payload=await readJSONLimited(url.toString(),{fetchImpl,
   headers,timeout:12000,maxBytes:3_000_000});
  const part=Array.isArray(payload.results)?payload.results:[];
  rows.push(...part.filter(x=>Number.isSafeInteger(Number(x.id))&&Number(x.id)>0)
   .map(x=>({id:String(x.id),name:safeString(x.name,100),count:Number(x.item_count)||null,
    type:x.list_type==='movie'?'movie':x.list_type==='tv'?'series':null,
    version:'v3'})));
  if(page>=Math.min(50,Number(payload.total_pages)||1)||!part.length)break;
 }
 return {lists:rows};
}
function normalizeTMDBListRow(row,type){
 const mediaType=String(row.media_type||row.type||'').toLowerCase();
 const media=mediaType==='movie'?'movie':mediaType==='tv'?'series':type;
 if(!['movie','series'].includes(media)||row.adult===true||!Number.isSafeInteger(Number(row.id)))return null;
 const poster=typeof row.poster_path==='string'&&row.poster_path.startsWith('/')?
  'https://image.tmdb.org/t/p/w500'+row.poster_path:undefined;
 return {id:'tmdb:'+row.id,type:media,name:safeString(row.title||row.name)||'tmdb:'+row.id,
  year:Number(String(row.release_date||row.first_air_date||'').slice(0,4))||undefined,
  poster,description:safeString(row.overview,1200)||undefined,
  rating:Number(row.vote_average)||undefined,voteCount:Number(row.vote_count)||0,
  originalLanguage:safeString(row.original_language,2),genres:Array.isArray(row.genre_ids)?row.genre_ids.map(String):[]};
}
export async function fetchTMDBList(listId,type,{version='v4',
 apiKey=getIntegrationKey('tmdb'),fetchImpl=globalThis.fetch}={}){
 const id=String(listId||'').trim();
 if(!/^\d{1,12}$/.test(id))throw Error('Informe um identificador de lista TMDB numérico.');
 if(!apiKey)throw Error('Configure a chave TMDB antes de importar.');
 if(!['movie','series','both'].includes(type))throw Error('Tipo TMDB inválido.');
 if(!['v3','v4'].includes(version))throw Error('Versão da lista TMDB inválida.');
 const items=[],known=new Set();
 for(let page=1;page<=500&&items.length<LIMIT;page++){
  const url=new URL('https://api.themoviedb.org/'+(version==='v3'?'3':'4')+'/list/'+id);
  url.searchParams.set('page',String(page));url.searchParams.set('language','pt-BR');
  const headers=tmdbAuth(apiKey,url);
  const result=await readJSONLimited(url.toString(),{fetchImpl,
   headers,timeout:12000,maxBytes:3_000_000});
  const rows=Array.isArray(result.results)?result.results:
   Array.isArray(result.items)?result.items:[];
  for(const row of rows){
   const m=normalizeTMDBListRow(row,version==='v3'?'movie':null);
   if(!m||(type!=='both'&&m.type!==type)||known.has(m.type+'::'+m.id))continue;
   known.add(m.type+'::'+m.id);items.push(m);
   if(items.length>=LIMIT)break;
  }
  if(!rows.length||page>=Math.min(500,Number(result.total_pages)||1))break;
 }
 return {source:'tmdb',metas:items,mode:'list',version,listId:id,
  notice:'Lista TMDB importada por ID. Listas privadas requerem autenticação específica do proprietário.'};
}
export async function fetchTVMazeFollowed({username,apiKey,fetchImpl=globalThis.fetch}={}){
 if(!username||!apiKey)throw Error('Configure usuário e chave de API TVmaze Premium.');
 const endpoint='https://api.tvmaze.com/v1/user/follows/shows?embed=show';
 const auth=Buffer.from(username+':'+apiKey).toString('base64');
 const rows=await readJSONLimited(endpoint,{fetchImpl,timeout:15000,maxBytes:10_000_000,
  headers:{Authorization:'Basic '+auth}});
 if(!Array.isArray(rows))throw Error('TVmaze Premium retornou dados inválidos.');
 const metas=[],seen=new Set();
 for(const entry of rows){
  const show=entry?._embedded?.show||entry?.show;
  const id=String(show?.externals?.imdb||'');
  if(!imdbId.test(id)||seen.has(id))continue;seen.add(id);
  const image=show.image?.medium||show.image?.original;
  let poster;
  try{const u=new URL(image);if(u.protocol==='https:'&&u.hostname==='static.tvmaze.com')
   poster=u.toString();}catch{}
  metas.push({id,type:'series',name:safeString(show.name)||id,
   poster,year:Number(String(show.premiered||'').slice(0,4))||undefined,
   rating:Number(show.rating?.average)||undefined,
   genres:Array.isArray(show.genres)?show.genres.map(x=>safeString(x,60)):[],
   description:safeString(String(show.summary||'').replace(/<[^>]+>/g,' '),1200)});
  if(metas.length>=LIMIT)break;
 }
 return {source:'tvmaze',type:'series',metas,mode:'followed',
  notice:'Séries seguidas na conta TVmaze Premium, com atribuição TVmaze (CC BY-SA).'};
}

function normalizeBuilderFilters(raw={}){
 const f=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const sort=SORTS.has(f.sort)?f.sort:'source';
 const yearFrom=Number.isInteger(Number(f.yearFrom))&&Number(f.yearFrom)>=1900&&Number(f.yearFrom)<=2100?
  Number(f.yearFrom):null;
 const yearTo=Number.isInteger(Number(f.yearTo))&&Number(f.yearTo)>=1900&&Number(f.yearTo)<=2100?
  Number(f.yearTo):null;
 if(yearFrom&&yearTo&&yearFrom>yearTo)throw Error('Ano inicial maior que o final.');
 const minRating=f.minRating===''||f.minRating==null?null:Number(f.minRating);
 if(minRating!=null&&(!Number.isFinite(minRating)||minRating<0||minRating>10))
  throw Error('A nota mínima deve estar entre 0 e 10.');
 const unlimited=f.limit==null||f.limit===''||f.limit==='all'||f.limit===0||f.limit==='0';
 const limit=unlimited?null:Number(f.limit);
 if(limit!==null&&(!Number.isInteger(limit)||limit<1||limit>LIMIT))
  throw Error('Escolha Todos os disponíveis ou limite entre 1 e '+LIMIT+'.');
 const genre=f.genre==null?'':safeString(f.genre,40);
 const excludeGenre=f.excludeGenre==null?'':safeString(f.excludeGenre,40);
 const minVotes=f.minVotes===''||f.minVotes==null?null:Number(f.minVotes);
 if(minVotes!=null&&(!Number.isInteger(minVotes)||minVotes<0||minVotes>1000000))
  throw Error('O mínimo de votos deve estar entre 0 e 1.000.000.');
 const originalLanguage=String(f.originalLanguage??'').trim().toLowerCase();
 if(originalLanguage&&!/^[a-z]{2}$/.test(originalLanguage))
  throw Error('O idioma original deve ter duas letras, como pt, en ou th.');
 const region=/^[A-Z]{2}$/.test(String(f.region||'BR').toUpperCase())?String(f.region||'BR').toUpperCase():'BR';
 const watchProvider=f.watchProvider==null?'':String(f.watchProvider).trim();
 if(watchProvider&&!/^\d{1,7}$/.test(watchProvider))throw Error('O provedor de streaming exige o ID TMDB numérico.');
 return {sort,yearFrom,yearTo,minRating,minVotes,limit,genre,excludeGenre,
  originalLanguage,region,watchProvider,
  includeUnknownYears:f.includeUnknownYears!==false};
}
export {normalizeBuilderFilters};
export function applyBuilderFilters(items,raw={}){
 const f=normalizeBuilderFilters(raw);
 let list=Array.isArray(items)?items.slice():[];
 list=list.filter(m=>{
  const y=Number(m.year)||null;
  if((f.yearFrom||f.yearTo)&&!y&&!f.includeUnknownYears)return false;
  if(y&&f.yearFrom&&y<f.yearFrom)return false;
  if(y&&f.yearTo&&y>f.yearTo)return false;
  if(f.minRating!=null&&(!Number.isFinite(Number(m.rating))||Number(m.rating)<f.minRating))return false;
  if(f.minVotes!=null&&(!Number.isFinite(Number(m.voteCount))||Number(m.voteCount)<f.minVotes))return false;
  if(f.originalLanguage&&m.originalLanguage!==f.originalLanguage)return false;
  if(f.excludeGenre&&Array.isArray(m.genres)&&m.genres.some(g=>
   String(g).toLowerCase()===f.excludeGenre.toLowerCase()))return false;
  if(f.genre&&Array.isArray(m.genres)&&m.genres.length){
   if(!m.genres.some(g=>String(g).toLowerCase().includes(f.genre.toLowerCase())))return false;
  }
  return true;
 });
 const sort=f.sort;
 if(sort==='title-asc')list.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 if(sort==='title-desc')list.sort((a,b)=>b.name.localeCompare(a.name,'pt-BR'));
 if(sort==='year-desc'||sort==='year-asc')list.sort((a,b)=>((b.year||0)-(a.year||0))*(sort==='year-desc'?1:-1));
 if(sort==='rating-desc'||sort==='rating-asc')list.sort((a,b)=>
  ((Number(b.rating)||0)-(Number(a.rating)||0))*(sort==='rating-desc'?1:-1));
 return f.limit===null?list:list.slice(0,f.limit);
}
// TVmaze oferece API pública sem chave. Importamos apenas séries mapeadas para IMDb,
// pois esse identificador é compatível com o resolvedor de catálogo do Nuvio.
export async function fetchTVMazeCatalog(type,mode,rawQuery,filters={},{
 fetchImpl=globalThis.fetch}={}){
 if(type!=='series')throw Error('TVmaze oferece apenas séries. Selecione Séries.');
 if(!['search','web'].includes(mode))throw Error('Modo TVmaze inválido.');
 const f=normalizeBuilderFilters(filters);
 const query=safeString(rawQuery,80);
 if(mode==='search'&&(query.length<2||query.length>80))
  throw Error('Para pesquisar no TVmaze, informe ao menos dois caracteres.');
 const endpoint=new URL('https://api.tvmaze.com/'+
  (mode==='search'?'search/shows':'schedule/web'));
 if(mode==='search')endpoint.searchParams.set('q',query);
 else endpoint.searchParams.set('country',f.region);
 const rows=await readJSONLimited(endpoint.toString(),{fetchImpl,timeout:11000,maxBytes:3_000_000});
 if(!Array.isArray(rows))throw Error('TVmaze retornou dados incompatíveis.');
 const metas=[],ids=new Set();
 for(const row of rows){
  const show=mode==='search'?row?.show:row?._embedded?.show||row?.show;
  if(!show||typeof show!=='object')continue;
  const id=String(show.externals?.imdb||'');
  if(!imdbId.test(id)||ids.has(id))continue;
  ids.add(id);
  const rawPoster=show.image?.medium||show.image?.original;
  let poster;
  try{
   const u=new URL(rawPoster);
   if(u.protocol==='https:'&&u.hostname==='static.tvmaze.com')poster=u.toString();
  }catch{}
  metas.push({id,type:'series',name:safeString(show.name)||id,
   year:Number(String(show.premiered||'').slice(0,4))||undefined,
   rating:Number(show.rating?.average)||undefined,
   genres:Array.isArray(show.genres)?show.genres.map(g=>safeString(g,60)):[],
   description:safeString(String(show.summary||'').replace(/<[^>]*>/g,' '),1800)||undefined,
   poster,language:safeString(show.language,40)||undefined});
  if(metas.length>=LIMIT)break;
 }
 return {source:'tvmaze',type:'series',mode,query:mode==='search'?query:null,
  url:mode==='search'?'https://www.tvmaze.com/search?q='+encodeURIComponent(query):null,
  metas,notice:'Dados: TVmaze (CC BY-SA). Apenas séries com ID IMDb; atualização manual.'};
}
function tmdbRequest(type,mode,filters,page){
 const preset=PRESETS[mode]?.[type];
 const location=preset||'discover/'+(type==='series'?'tv':'movie');
 const url=new URL('https://api.themoviedb.org/3/'+location);
 url.searchParams.set('language','pt-BR');
 url.searchParams.set('page',String(page));
 if(!preset){
  const sorts={source:'popularity.desc','title-asc':type==='series'?'name.asc':'title.asc',
   'title-desc':type==='series'?'name.desc':'title.desc','year-desc':type==='series'?'first_air_date.desc':'primary_release_date.desc',
   'year-asc':type==='series'?'first_air_date.asc':'primary_release_date.asc',
   'rating-desc':'vote_average.desc','rating-asc':'vote_average.asc'};
  url.searchParams.set('sort_by',sorts[filters.sort]||'popularity.desc');
  if(filters.genre&&/^\d+$/.test(filters.genre))url.searchParams.set('with_genres',filters.genre);
  if(filters.excludeGenre&&/^\d+$/.test(filters.excludeGenre))
   url.searchParams.set('without_genres',filters.excludeGenre);
  if(filters.originalLanguage)url.searchParams.set('with_original_language',filters.originalLanguage);
  if(filters.minVotes!=null)url.searchParams.set('vote_count.gte',String(filters.minVotes));
  if(filters.yearFrom)url.searchParams.set(type==='series'?'first_air_date.gte':'primary_release_date.gte',filters.yearFrom+'-01-01');
  if(filters.yearTo)url.searchParams.set(type==='series'?'first_air_date.lte':'primary_release_date.lte',filters.yearTo+'-12-31');
  if(filters.minRating!=null)url.searchParams.set('vote_average.gte',String(filters.minRating));
  if(filters.watchProvider){
   url.searchParams.set('with_watch_providers',filters.watchProvider);
   url.searchParams.set('watch_region',filters.region);
   url.searchParams.set('with_watch_monetization_types','flatrate');
  }
 }
 url.searchParams.set('include_adult','false');
 return url;
}
export async function fetchTMDBCatalog(type,mode,filters={},{
 apiKey=getIntegrationKey('tmdb'),fetchImpl=globalThis.fetch}={}){
 if(!TYPES.has(type))throw Error('Tipo inválido.');
 if(!apiKey)throw Error('Configure TMDB_API_KEY no servidor para criar catálogos TMDB.');
 const f=normalizeBuilderFilters(filters);
 if(!Object.hasOwn(PRESETS,mode)&&mode!=='discover')throw Error('Modelo TMDB não reconhecido.');
 if(f.watchProvider&&mode!=='discover')
  throw Error('Para filtrar por streaming, escolha Descoberta personalizada.');
 const items=[],used=new Set();
 for(let page=1;page<=Math.min(500,Math.ceil((f.limit??LIMIT)/20));page++){
  const url=tmdbRequest(type,mode,f,page);
  const key=String(apiKey).trim();
  const headers={};
  if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
  else url.searchParams.set('api_key',key);
  const result=await readJSONLimited(url.toString(),{fetchImpl,headers,timeout:11000});
  const rows=Array.isArray(result.results)?result.results:[];
  for(const row of rows){
   if(row.adult===true||!Number.isInteger(row.id))continue;
   const id='tmdb:'+row.id;
   if(used.has(id))continue;used.add(id);
   const poster=typeof row.poster_path==='string'&&row.poster_path.startsWith('/')?
    'https://image.tmdb.org/t/p/w500'+row.poster_path:undefined;
   items.push({id,type,name:safeString(row.title||row.name)||id,
    poster,description:safeString(row.overview,1800),year:Number(String(row.release_date||row.first_air_date||'').slice(0,4))||undefined,
    rating:Number(row.vote_average)||undefined,voteCount:Number(row.vote_count)||0,
    originalLanguage:safeString(row.original_language,2).toLowerCase(),
    genres:Array.isArray(row.genre_ids)?row.genre_ids.map(String):[]});
  }
  if(rows.length<20||page>=Math.ceil((f.limit??LIMIT)/20)||page>=500)break;
 }
 const normalized=applyBuilderFilters(items,{...f,genre:mode==='discover'?'':f.genre});
 return {source:'tmdb',type,metas:normalized,mode,
  notice:'Catálogo TMDB criado como prévia; atualize manualmente quando desejar novos resultados.',
  filters:f};
}
export async function previewBuilderSource(input,{fetchImpl=globalThis.fetch,keys={}}={}){
 const source=input?.source;
 const type=input?.type;
 if(!TYPES.has(type)&&!(type==='both'&&(['mdblist','imdb','trakt'].includes(source)||source==='tmdb'&&input.mode==='list')))
  throw Error('Selecione Filmes ou Séries; Ambos funciona para MDBList, IMDb, Trakt e listas TMDB.');
 const filters=normalizeBuilderFilters(input.filters);
 let result;
 if(source==='manual')return {source,type,metas:[],count:0,notice:'Catálogo manual vazio.'};
 if(source==='imdb'){
  const list=String(input.text||'');
  if(input.url)validateListURL('imdb',input.url);
  result={source,type,metas:parseImdbList(list,type),url:input.url||null,
    notice:'CSV/IDs importados como snapshot. Não acessamos o IMDb automaticamente.'};
 }else if(source==='trakt'){
  result=await fetchTraktList(input.url,type,{clientId:keys.trakt??getIntegrationKey('trakt'),fetchImpl});
 }else if(source==='mdblist'){
  result=await fetchMDBList(input.url,type,{key:keys.mdblist??getIntegrationKey('mdblist'),fetchImpl,listId:input.listId});
 }else if(source==='tvmaze'){
  result=input.mode==='followed'
   ?await fetchTVMazeFollowed({username:getSourceAccount('tvmazeUsername'),
     apiKey:getSourceAccount('tvmazeKey'),fetchImpl})
   :await fetchTVMazeCatalog(type,input.mode||'search',input.query,filters,{fetchImpl});
 }else if(source==='tmdb'){
  result=input.mode==='list'
   ?await fetchTMDBList(input.listId,type,{
     version:input.listVersion||'v4',apiKey:keys.tmdb??getIntegrationKey('tmdb'),fetchImpl})
   :await fetchTMDBCatalog(type,input.mode||'popular',filters,{
     apiKey:keys.tmdb??getIntegrationKey('tmdb'),fetchImpl});
 }else throw Error('Fonte de catálogo desconhecida.');
 const metas=source==='tmdb'&&input.mode!=='list'?
  result.metas:applyBuilderFilters(result.metas,filters);
 if(!metas.length)throw Error('Nenhum título compatível com os filtros foi encontrado.');
 return {...result,source,type,metas,count:metas.length,
  counts:{movie:metas.filter(m=>m.type==='movie').length,
   series:metas.filter(m=>m.type==='series').length},
  filters,refreshedAt:new Date().toISOString()};
}
