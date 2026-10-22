import path from 'node:path';
import {resolveDataDir,readJsonFile,writeAtomicJsonFile} from '../config/json-store.js';
import {getIntegrationKey} from '../config/hub-integrations.js';

const FILE=path.join(resolveDataDir(),'mosaic-categories.json');
const GROUP_KIND={generos:'genre',temas:'keyword',streaming:'provider',estudios:'company',decadas:'decade',mundo:'country'};
export function customMosaicGroups(){
 const saved=readJsonFile(FILE,{groups:{}},{strict:true,requireObject:true});
 return Object.fromEntries(Object.keys(GROUP_KIND).map(k=>[k,
   (Array.isArray(saved.groups?.[k])?saved.groups[k]:[]).filter(v=>v&&typeof v.name==='string').slice(0,250)]));
}
function normalizeQuery(value){
 const q=String(value||'').trim().slice(0,80);
 if(q.length<2||/[\u0000-\u001f]/.test(q))throw Error('Digite pelo menos dois caracteres para pesquisar.');
 return q;
}
export async function searchMosaicOptions({group,q}={}, {fetchImpl=globalThis.fetch}={}){
 const kind=GROUP_KIND[group];if(!kind)throw Error('Origem não reconhecida.');
 const query=normalizeQuery(q);
 const apiKey=getIntegrationKey('tmdb');if(!apiKey)throw Error('Configure uma chave TMDB para pesquisar novas categorias.');
 const get=async endpoint=>{
  const u=new URL(`https://api.themoviedb.org/3${endpoint}`);
  u.searchParams.set('api_key',apiKey);
  u.searchParams.set('language','pt-BR');
  const r=await fetchImpl(u.toString(),{headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!r.ok)throw Error(`TMDB retornou HTTP ${r.status}.`);
  return r.json();
 };
 let values=[];
 if(kind==='genre'){
  const [movies,tv]=await Promise.all([get('/genre/movie/list'),get('/genre/tv/list')]);
  values=[...(movies.genres||[]).map(x=>({name:x.name,id:String(x.id),kind,media:'movie'})),
   ...(tv.genres||[]).map(x=>({name:x.name+' · Séries',id:String(x.id),kind,media:'tv'}))];
  // O TMDB tem gêneros fixos. Para não limitar a criação, aceitar também
  // palavras-chave oficiais como subgêneros livres.
  const keywords=await get('/search/keyword?query='+encodeURIComponent(query));
  values.push(...(keywords.results||[]).map(x=>({name:x.name,id:String(x.id),kind:'keyword',media:'movie'})));
 }else if(kind==='keyword'){
  const data=await get('/search/keyword?query='+encodeURIComponent(query));
  values=(data.results||[]).map(x=>({name:x.name,id:String(x.id),kind,media:'movie'}));
 }else if(kind==='provider'){
  const data=await get('/watch/providers/movie?watch_region=BR');
  values=(data.results||[]).map(x=>({name:x.provider_name,id:String(x.provider_id),kind,media:'movie'}));
 }else if(kind==='company'){
  const data=await get('/search/company?query='+encodeURIComponent(query));
  values=(data.results||[]).map(x=>({name:x.name,id:String(x.id),kind,media:'movie'}));
 }else if(kind==='country'){
  const data=await get('/configuration/countries');
  values=(Array.isArray(data)?data:[]).map(x=>({name:x.native_name||x.english_name,id:x.iso_3166_1,kind,media:'movie'}));
 }else if(kind==='decade'){
  const match=query.match(/(?:18|19|20)\d0/);
  if(match){const year=Number(match[0]);values=[{name:`Anos ${year}`,id:String(year),kind,media:'movie'}];}
 }
 const match=values.filter(x=>x.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))||x.id.toLowerCase()===query.toLowerCase());
 return {group,query,items:match.slice(0,30)};
}
export async function addCustomMosaicCategory({group,option}={}, {search=searchMosaicOptions}={}){
 if(!GROUP_KIND[group]||!option||typeof option!=='object'||Array.isArray(option))throw Error('Categoria inválida.');
 const requestedName=String(option.name||'').trim();
 const id=String(option.id||'');
 if(requestedName.length<2||requestedName.length>100||id.length>20||!id)throw Error('Categoria inválida.');
 // Verify against the real TMDB index, never write fabricated provider/genre IDs.
 const found=(await search({group,q:requestedName})).items.find(x=>x.id===id&&x.name===requestedName&&
   (x.kind===GROUP_KIND[group]||(group==='generos'&&x.kind==='keyword'))&&x.media===option.media);
 if(!found)throw Error('A seleção não está no catálogo atual do TMDB; faça uma nova pesquisa.');
 const groups=customMosaicGroups();
 if(groups[group].some(x=>x.id===found.id&&x.media===found.media))return {groups,added:false};
 if(groups[group].length>=250)throw Error('Limite de 250 categorias personalizadas nesta lista.');
 groups[group].push(found);
 writeAtomicJsonFile(FILE,{groups});
 return {groups,added:true};
}
export function getCustomMosaicCategory(group,name){
 return customMosaicGroups()[group]?.find(x=>x.name===name)||null;
}
