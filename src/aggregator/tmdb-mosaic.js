/* The user's own diagonal TMDB mosaic generator, reused in read-only form. */
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import {getIntegrationKey} from '../config/hub-integrations.js';
import {getStudioShapeSpec,saveDataUrlArtwork,applyUploadedMark,buildOverlaySvg} from './artwork-studio.js';

const BRIDGE='/app/python-mosaic/bridge.py';
export function originalMosaicStatus(){
 return {configured:process.env.PYTHON_MOSAIC_ENABLED==='1',
  tmdbConfigured:Boolean(getIntegrationKey('tmdb')),
  engine:'TMDB Mosaicos — gerador original do PC',
  source:'gerar_mosaicos.py',style:'fileiras diagonais de backdrops'};
}
export function runOriginalMosaic(input,{spawnImpl=spawn,timeoutMs=180000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawnImpl('python3',[process.env.PYTHON_MOSAIC_BRIDGE||BRIDGE],{
   stdio:['pipe','pipe','pipe'],
   env:{PATH:process.env.PATH||'/usr/bin:/bin',
     PYTHON_MOSAIC_SOURCE:process.env.PYTHON_MOSAIC_SOURCE||'/app/python-mosaic-source'}
  });
  let stdout='',settled=false;
  const cleanup=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);
    if(err)reject(err);else resolve(value);};
  const timer=setTimeout(()=>{child.kill('SIGKILL');cleanup(Error('A renderização do mosaico excedeu três minutos.'))},timeoutMs);
  child.on('error',()=>cleanup(Error('Criador original de mosaicos Python indisponível.')));
  child.stdout.on('data',chunk=>{stdout+=chunk.toString('utf8');if(stdout.length>13_000_000){child.kill('SIGKILL');cleanup(Error('Mosaico retornou arquivo grande demais.'));}});
  child.on('close',code=>{
   if(code!==0)return cleanup(Error('O criador original não conseguiu buscar imagens do TMDB ou compor o mosaico. Verifique a categoria e a chave.'));
   try{cleanup(null,JSON.parse(stdout));}catch{cleanup(Error('Resposta inválida do gerador de mosaicos.'));}
  });
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify(input));
 });
}
export async function getOriginalMosaicCategories({runner=runOriginalMosaic}={}){
 if(!originalMosaicStatus().configured)
  return {groups:{},...originalMosaicStatus()};
 const result=await runner({operation:'list'});
 return {...originalMosaicStatus(),groups:result.groups||{}};
}
export async function composeOriginalMosaic(options,{runner=runOriginalMosaic}={}){
 if(!originalMosaicStatus().configured){const err=Error('Mosaicos originais TMDB não configurados no PC.');err.status=503;throw err;}
 const tmdbKey=getIntegrationKey('tmdb');
 if(!tmdbKey){const err=Error('Adicione sua chave TMDB em Configurações → Integrações.');err.status=503;throw err;}
 if(typeof options?.category!=='string'||options.category.length>100 ||
    typeof options?.group!=='string'||options.group.length>40)throw Error('Categoria de mosaico inválida.');
 const spec=getStudioShapeSpec(options.shape);
 const cards=Number(options.cards||16);
 if(![12,16,20,28].includes(cards))throw Error('Quantidade de imagens inválida.');
 const result=await runner({operation:'create',tmdbKey,group:options.group,category:options.category,cards});
 if(typeof result.data!=='string'||result.data.length>12_000_000)
  throw Error('O renderizador original não retornou uma imagem válida.');
 const raw=Buffer.from(result.data,'base64');
 if(raw.length<1000||raw.length>9_000_000)throw Error('Imagem retornada pelo gerador é inválida.');
 const title=options.hideTitle?'':String(options.title||'').slice(0,75);
 const subtitle=options.hideTitle?'':String(options.subtitle||'').slice(0,75);
 const badge=typeof options.badge==='string'?options.badge.slice(0,8):'';
 let img=await sharp(raw,{limitInputPixels:25_000_000,animated:false})
  .resize(spec.width,spec.height,{fit:'cover',position:'attention'}).webp({quality:87}).toBuffer();
 if(title||subtitle||badge){
  const overlay=buildOverlaySvg({width:spec.width,height:spec.height,
   title,subtitle,badge,primary:'#162233',secondary:'#080b12',accent:'#b9dcf9',
   mode:'mosaic',hideTitle:Boolean(options.hideTitle)});
  img=await sharp(img).composite([{input:Buffer.from(overlay),left:0,top:0}])
   .webp({quality:87}).toBuffer();
 }
 img=await applyUploadedMark(img,options.logoDataUrl||'',spec.width,spec.height);
 const dataUrl='data:image/webp;base64,'+img.toString('base64');
 if(options.save===false)return {ok:true,provider:'tmdb-original-python',
  category:options.category,cards:result.cards,shape:spec.key,tileShape:spec.tileShape,
  width:spec.width,height:spec.height,dataUrl};
 return {ok:true,provider:'tmdb-original-python',category:options.category,cards:result.cards,
  ...(await saveDataUrlArtwork(dataUrl,{shape:spec.key,title,mode:'tmdb-original-python'})),dataUrl};
}
