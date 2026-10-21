import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-cover-tests-'));
const {normalizeShape,dimensions,renderCover,registerCover,prepareCoverCollections,getPreparedCover,supportedCover,getCoverAdapterStatus}=await import('../src/aggregator/cover-adapter.js');
const U='https://image.tmdb.org/x/test.webP?v=100';
const U2='https://image.tmdb.org/x/test.webP?v=101';
const src=[{id:'g1',title:'Streaming',folders:[{id:'f1',title:'Netflix',tileShape:'LANDSCAPE',coverImageUrl:U,customCoverImageUrl:U}]}];
describe('Nuvio TV Cover Adapter',()=>{
 it('adapta 4 formatos sem cortar a imagem',async()=>{
   const vertical=await sharp({create:{width:360,height:600,channels:3,background:'#ff0000'}}).png().toBuffer();
   for(const shape of ['LANDSCAPE','POSTER','PORTRAIT','SQUARE']){
     const img=await renderCover(vertical,shape);
     const meta=await sharp(img).metadata();
     assert.equal(meta.width,dimensions(shape).width);
     assert.equal(meta.height,dimensions(shape).height);
     assert.equal(meta.format,'webp');
     const center=await sharp(img).extract({left:Math.floor(meta.width/2),top:Math.floor(meta.height/2),width:1,height:1}).raw().toBuffer();
     assert.ok(center[0]>210&&center[1]<70&&center[2]<70,shape+' perdeu a imagem central');
     if(shape==='LANDSCAPE'){
       const edge=await sharp(img).extract({left:2,top:3,width:1,height:1}).raw().toBuffer();
       assert.ok(edge[0]<150,'Backdrop escurecido não foi aplicado');
     }
   }
 });
 it('reconhece fontes públicas e recusa imagens internas e URLs inseguras',()=>{
   assert.equal(supportedCover('http://image.tmdb.org/a.png'),false);
   assert.equal(supportedCover('https://localhost/private.png'),false);
   assert.equal(supportedCover('https://192.168.0.1/secrets'),false);
   assert.equal(supportedCover('https://evil.example/icon.png'),false);
   assert.equal(supportedCover(U),true);
   assert.equal(supportedCover('https://image.tmdb.org/t/p/w500/file.jpg'),true);
   assert.equal(normalizeShape('INVALID'),'LANDSCAPE');
 });
 it('adapta somente a exportação da TV e mantém fonte original',()=>{
   const {collections,adapted,unsupported}=prepareCoverCollections(src);
   assert.equal(adapted,1);assert.equal(unsupported,0);
   const converted=collections[0].folders[0];
   assert.match(converted.coverImageUrl,/https:\/\/stream\.patrykrocha\.com\/api\/hub\/artwork\/LANDSCAPE\/[a-f0-9]{32}\.webp/);
   assert.equal(converted.coverImageUrl,converted.customCoverImageUrl);
   assert.equal(src[0].folders[0].coverImageUrl,U);
   assert.equal(src[0].folders[0].customCoverImageUrl,U);
   assert.equal(converted.tileShape,'LANDSCAPE');
 });
 it('compatibiliza Portrait com Poster no Legacy sem alterar a configuração original',()=>{
   const groups=structuredClone(src);
   groups[0].folders[0].tileShape='PORTRAIT';
   const {collections}=prepareCoverCollections(groups);
   const adapted=collections[0].folders[0];
   assert.equal(adapted.tileShape,'POSTER','Legacy só reconhece LANDSCAPE, POSTER e SQUARE');
   assert.match(adapted.coverImageUrl,/\/artwork\/POSTER\//);
   assert.equal(groups[0].folders[0].tileShape,'PORTRAIT');
 });
 it('muda hash ao alterar formato ou imagem original',()=>{
   const a=registerCover(U,'LANDSCAPE'),b=registerCover(U,'POSTER'),c=registerCover(U2,'LANDSCAPE');
   assert.notEqual(a,b);assert.notEqual(a,c);assert.notEqual(b,c);
 });
 it('gera só uma vez por URL e serve cache, mantendo cabeçalhos e dimensões',async()=>{
   const target=registerCover(U,'SQUARE');
   const id=target.match(/([a-f\d]{32})\.webp/)[1];
   let called=0;
   const raw=await sharp({create:{width:350,height:200,channels:3,background:'#1555bb'}}).png().toBuffer();
   const fetchFn=async()=>{
     called++;
     return {ok:true,headers:new Headers({'content-type':'image/png','content-length':String(raw.length)}),
       body:(async function*(){yield raw})()};
   };
   const [a,b]=await Promise.all([
     getPreparedCover('SQUARE',id,{fetchFn}),
     getPreparedCover('SQUARE',id,{fetchFn})
   ]);
   assert.equal(called,1);
   assert.equal(a.data.length,b.data.length);
   const meta=await sharp(a.data).metadata();
   assert.equal(meta.width,800);assert.equal(meta.height,800);
   const again=await getPreparedCover('SQUARE',id,{fetchFn});
   assert.equal(called,1);assert.equal(again.cached,true);
   assert.ok(getCoverAdapterStatus().cacheHits>0);
   assert.equal(await getPreparedCover('LANDSCAPE',id,{fetchFn}),null);
   assert.equal(await getPreparedCover('SQUARE','a'.repeat(32),{fetchFn}),null);
 });
});
