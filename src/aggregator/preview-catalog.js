// Consultas de amostra para o simulador do Nuvio. Nenhuma escrita no workspace.
import {parseAddonUrl,DEFAULT_FETCH_HEADERS} from './url-helper.js';
import {decorateCatalogResponse} from './artwork-erdb.js';

const TYPES=new Set(['movie','series']);
const MAX_ITEMS=12;
// O preview mostra amostras, não navega de 12 em 12 pela biblioteca inteira.
// Catálogos Stremio com extra skip, como Cinebra, podem paginar em janelas de 100.
const REMOTE_SAMPLE_STRIDE=MAX_ITEMS;
export function validatePreviewRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Seleção inválida.');
 const {addonId,type,catalogId,genre}=body;
 if(typeof addonId!=='string'||addonId.length>210||!addonId||
    !TYPES.has(type)||typeof catalogId!=='string'||!catalogId||catalogId.length>200)
  throw Error('Identificação de catálogo inválida.');
 if(genre!=null&&(typeof genre!=='string'||genre.length>90||/[\\/\x00-\x1f]/.test(genre)))
  throw Error('Filtro de gênero inválido.');
 if(body.refresh!==undefined&&typeof body.refresh!=='boolean')throw Error('Atualização inválida.');
 const page=Number(body.page??0);
 if(!Number.isInteger(page)||page<0||page>50)throw Error('Página inválida.');
 return {addonId,type,catalogId,genre:genre||'',page,refresh:body.refresh===true};
}
export function pickProvider(source,installed,manifests){
 for(const addon of installed||[]){
  if(addon.enabled===false||!addon.url)continue;
  const manifest=(manifests||[]).find(m=>m.url===addon.url&&m.addonId===source.addonId);
  if(!manifest)continue;
  const catalog=(manifest.catalogs||[]).find(c=>c.type===source.type&&c.id===source.catalogId);
  if(catalog)return {addon,manifest,catalog};
 }
 return null;
}
function safeImage(value){
 if(typeof value!=='string'||value.length>1700)return null;
 try{const u=new URL(value);return u.protocol==='https:'?u.toString():null;}catch{return null;}
}
export function normalizePreviewItems(metas,type){
 const items=[],used=new Set();
 for(const row of metas||[]){
  if(!row||typeof row!=='object'||!row.id||typeof row.id!=='string')continue;
  const id=row.id.slice(0,145);
  if(used.has(id))continue;
  used.add(id);
  items.push({id,type:row.type==='movie'||row.type==='series'?row.type:type,
   name:typeof row.name==='string'?row.name.slice(0,190):id,
   poster:safeImage(row.poster),background:safeImage(row.background),
   year:typeof row.year==='number'?row.year:null,
   description:typeof row.description==='string'?row.description.slice(0,900):'',
   imdbRating:Number.isFinite(Number(row.imdbRating))?Number(row.imdbRating):null});
  if(items.length>=MAX_ITEMS)break;
 }
 return items;
}
export async function fetchPreviewSample({selection,provider,fetchImpl=globalThis.fetch,timeout=11000}){
 const source=validatePreviewRequest(selection);
 const matched=provider?.catalog;
 if(!matched||matched.id!==source.catalogId||matched.type!==source.type)
  throw Error('Catálogo não encontrado no manifesto ativo.');
 const parsed=parseAddonUrl(provider.manifest.url);
 if(!parsed)throw Error('URL do fornecedor inválida.');
 const started=Date.now();
 const hasSkip=matched.extra?.some(e=>e.name==='skip')===true;
 const declaredGenre=matched.extra?.find(e=>e.name==='genre');
 const genre=source.genre||(declaredGenre?.isRequired&&declaredGenre.options?.includes('None')?'None':'');
 const makeExtra=skip=>[...(genre?['genre='+encodeURIComponent(genre)]:[]),
   ...(skip?['skip='+skip]:[])].join('&');
 const query=async skip=>{
  const endpoint=parsed.getCatalogUrl(source.type,source.catalogId,makeExtra(skip));
  let response;
  try{response=await fetchImpl(endpoint,{redirect:'error',headers:DEFAULT_FETCH_HEADERS,
   signal:AbortSignal.timeout(Math.min(Math.max(timeout,1000),14000))});}
  catch{throw Error('O addon não respondeu à consulta de títulos dentro do tempo esperado.');}
  if(!response?.ok)throw Error('Catálogo retornou HTTP '+(response?.status||'desconhecido')+'.');
  if(Number(response.headers?.get('content-length')||0)>3_000_000)
   throw Error('A resposta do catálogo excedeu 3 MB.');
  let payload;
  try{
   const raw=await response.text();
   if(Buffer.byteLength(raw,'utf8')>3_000_000)throw Error('A resposta do catálogo excedeu 3 MB.');
   payload=JSON.parse(raw);
  }catch(e){throw Error(e.message.includes('3 MB')?e.message:'O addon retornou um catálogo JSON inválido.');}
  if(!Array.isArray(payload?.metas))throw Error('O addon não retornou uma lista metas válida.');
  return payload.metas;
 };
 // O número lógico da página avança de 12 em 12; o tamanho de página do addon
 // é descoberto pela primeira resposta. Assim não pulamos 88 títulos quando a
 // origem retorna 100 itens, nem 8 quando retorna páginas de 20.
 const first=await query(0);
 const batchSize=first.length;
 const offset=source.page*MAX_ITEMS;
 const remoteSkip=batchSize?Math.floor(offset/batchSize)*batchSize:0;
 let rows=remoteSkip ? await query(remoteSkip) : first;
 let localOffset=batchSize?offset-remoteSkip:0;
 let pageUnsupported=false;
 // Se a página atravessa o limite do lote remoto, buscar a página seguinte.
 // Nunca misturar páginas repetidas nem inventar títulos ausentes na origem.
 if(hasSkip&&batchSize&&rows.length&&localOffset+MAX_ITEMS>=rows.length){
  const nextSkip=remoteSkip+rows.length;
  const next=await query(nextSkip);
  const firstIds=rows.map(x=>String(x?.type||source.type)+'::'+String(x?.id||''));
  const repeated=next.length===rows.length&&next.every((x,i)=>
   String(x?.type||source.type)+'::'+String(x?.id||'')===firstIds[i]);
  if(repeated)pageUnsupported=true;
  else if(next.length)rows=[...rows,...next];
 }
 const sample=rows.slice(localOffset,localOffset+MAX_ITEMS);
 const original=normalizePreviewItems(sample,source.type);
 const modified=normalizePreviewItems(decorateCatalogResponse({metas:sample},source.type).metas,source.type);
 const moreWithinBatch=rows.length>localOffset+MAX_ITEMS;
 const hasMore=!pageUnsupported&&(moreWithinBatch||
   (hasSkip&&rows.length>0&&rows.length>=localOffset+MAX_ITEMS&&
    (remoteSkip+rows.length)%batchSize===0));
 return {status:original.length?'loaded':'empty',items:original,decorated:modified,
  count:original.length,duplicates:sample.length-new Set(sample.map(m=>m?.id).filter(Boolean)).size,
  missingPosters:original.filter(x=>!x.poster).length,
  page:source.page,sampleStride:REMOTE_SAMPLE_STRIDE,hasMore,pageUnsupported,
  durationMs:Date.now()-started,origin:'addon',provider:provider.manifest.name||provider.addon.name};
}
export function localPreviewSample(selection,catalog){
 const source=validatePreviewRequest(selection);
 if(!catalog||catalog.id!==source.catalogId||catalog.type!==source.type)
  throw Error('Catálogo local não encontrado.');
 const start=source.page*MAX_ITEMS;
 const rows=Array.isArray(catalog.metas)?catalog.metas.slice(start,start+MAX_ITEMS):[];
 const items=normalizePreviewItems(rows,source.type);
 const decorated=normalizePreviewItems(decorateCatalogResponse({metas:rows},source.type).metas,source.type);
 return {status:items.length?'loaded':'empty',items,decorated,
  count:items.length,duplicates:0,missingPosters:items.filter(x=>!x.poster).length,
  page:source.page,sampleStride:MAX_ITEMS,
  hasMore:(catalog.metas||[]).length>start+MAX_ITEMS,
  durationMs:0,origin:'hub',provider:'Catálogo do Hub'};
}

// Alguns addons ignoram o extra skip e retornam a primeira página novamente.
export function repeatedPreviewPage(first,second){
 if(!Array.isArray(first?.items)||!Array.isArray(second?.items)||
    first.items.length<2||second.items.length!==first.items.length)return false;
 return first.items.every((item,i)=>item.id===second.items[i].id);
}
