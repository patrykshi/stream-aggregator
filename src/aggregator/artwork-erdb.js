// Reescrita opcional dos cartazes do Nuvio com o serviço ERDB.
import {erdbConfig} from '../config/hub-artwork-erdb.js';
import {createHmac,timingSafeEqual} from 'node:crypto';
const MEDIA=new Set(['movie','series']);
const IDENTIFIER=/^(?:tt\d{6,12}|tmdb:\d{1,12}|tvdb:\d{1,12}|anilist:\d{1,12}|mal:\d{1,12}|kitsu:\d{1,12})$/;
function chooseId(meta){
 const ids=meta?.ids||{};
 const candidates=[meta?.imdb_id,meta?.imdbId,ids.imdb,
  Number.isInteger(meta?.tmdb_id)?'tmdb:'+meta.tmdb_id:null,
  Number.isInteger(meta?.tmdbId)?'tmdb:'+meta.tmdbId:null,
  Number.isInteger(ids.tmdb)?'tmdb:'+ids.tmdb:null,
  meta?.id];
 return candidates.find(x=>typeof x==='string'&&IDENTIFIER.test(x))||null;
}
export function makeErdbImage(config,kind,type,id,shape=''){
 if(!config?.enabled||!config.token||!config[kind]||!MEDIA.has(type)||
   !(IDENTIFIER.test(id)||(kind==='thumbnail'&&/^(?:tt\d{6,12}|tmdb:\d{1,12}|tvdb:\d{1,12}):\d{1,3}:\d{1,3}$/.test(id))))return null;
 const host=config.baseUrl.replace(/\/+$/,'');
 const tail=shape==='landscape'&&kind==='poster'?'?shape=landscape':'';
 return host+'/'+encodeURIComponent(config.token)+'/'+kind+'/'+type+'/'+
  encodeURIComponent(id)+'.jpg'+tail;
}
const POSTER_TYPES=new Set(['poster','backdrop','logo','thumbnail']);
function validErdbRequest(kind,type,id){
 return POSTER_TYPES.has(kind)&&MEDIA.has(type)&&
  (IDENTIFIER.test(id)||(kind==='thumbnail'&&/^(?:tt\d{6,12}|tmdb:\d{1,12}|tvdb:\d{1,12}):\d{1,3}:\d{1,3}$/.test(id)));
}
function signature(config,kind,type,id,shape){
 return createHmac('sha256',config.token)
   .update(JSON.stringify([kind,type,id,shape])).digest('hex').slice(0,32);
}
export function makeErdbPublicImage(config,kind,type,id,shape=''){
 if(!config?.enabled||!config.token||!config[kind]||
    !validErdbRequest(kind,type,id))return null;
 const mode=shape==='landscape'&&kind==='poster'?'landscape':'';
 const sig=signature(config,kind,type,id,mode);
 return 'https://stream.patrykrocha.com/artwork/erdb/'+kind+'/'+type+'/'+encodeURIComponent(id)+'/'+sig+'.jpg'+
   (mode?'?shape=landscape':'');
}
export function verifyErdbImageRequest(config,kind,type,id,sig,shape=''){
 if(!config?.enabled||!config.token||!config[kind]||
    !validErdbRequest(kind,type,id)||!/^[a-f0-9]{32}$/.test(sig))return false;
 const expected=signature(config,kind,type,id,shape==='landscape'&&kind==='poster'?'landscape':'');
 return timingSafeEqual(Buffer.from(sig),Buffer.from(expected));
}
export function decorateMeta(meta,config=erdbConfig(),mediaType=meta?.type){
 if(!meta||!MEDIA.has(mediaType)||!config.enabled)return meta;
 const id=chooseId(meta);
 if(!id)return meta;
 const modified={...meta};
 for(const [kind,field] of [['poster','poster'],['backdrop','background'],['logo','logo']]){
  const uri=makeErdbPublicImage(config,kind,mediaType,id,
   kind==='poster'&&meta.posterShape==='landscape'?'landscape':'');
  if(uri)modified[field]=uri;
 }
 if(config.thumbnail&&meta.type==='series'&&Array.isArray(meta.videos)){
  modified.videos=meta.videos.map(video=>{
   const season=Number(video?.season),episode=Number(video?.episode??video?.episodeNumber);
   if(!Number.isInteger(season)||season<0||season>999||
      !Number.isInteger(episode)||episode<1||episode>999)return video;
   const picture=makeErdbPublicImage(config,'thumbnail','series',id+':'+season+':'+episode);
   return picture?{...video,thumbnail:picture}:video;
  });
 }
 return modified;
}
export function decorateCatalogResponse(result,mediaType,config=erdbConfig()){
 if(!config.enabled||!result||!Array.isArray(result.metas))return result;
 return {...result,metas:result.metas.map(meta=>decorateMeta(meta,config,meta.type||mediaType))};
}
export function decorateMetaResponse(result,mediaType,config=erdbConfig()){
 if(!config.enabled||!result?.meta)return result;
 return {...result,meta:decorateMeta(result.meta,config,result.meta.type||mediaType)};
}
