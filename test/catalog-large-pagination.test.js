import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {collectCatalogPages,distinctCatalogMetas} from '../src/aggregator/catalog-pages.js';
import {publishedCatalog,invalidatePublication} from '../src/aggregator/nuvio-publication.js';

const block=(start,count=20)=>Array.from({length:count},(_,i)=>({
 id:'tt'+String(start+i).padStart(7,'0'),type:'movie',name:'Item '+(start+i),
 poster:'https://example.com/'+(start+i)+'.jpg'
}));
describe('Catálogos completos maiores que 100 títulos',()=>{
 it('coleta todas as páginas de catálogo com 340 itens',async()=>{
  const first=block(0),rows=block(0,340);
  const skips=[];
  const all=await collectCatalogPages(first,{fetchPage:async skip=>{
   skips.push(skip);return rows.slice(skip,skip+20);
  }});
  assert.equal(all.length,340);
  assert.deepEqual(skips.slice(0,4),[20,40,60,80]);
  assert.ok(skips.some(x=>x>100));
  assert.equal(new Set(all.map(x=>x.id)).size,340);
 });
 it('suporta catálogos cuja origem retorna páginas de 100',async()=>{
  const all=await collectCatalogPages(block(0,100),{
   fetchPage:async skip=>block(skip,Math.max(0,Math.min(100,720-skip)))});
  assert.equal(all.length,720);
 });
 it('corrige origins que repetem skip=20 mas avançam em 100',async()=>{
  const calls=[];
  const all=await collectCatalogPages(block(0),{fetchPage:async skip=>{
   calls.push(skip);return skip<100?block(0):skip<300?block(skip):[];
  }});
  assert.deepEqual(calls.slice(0,2),[20,100]);
  assert.ok(all.some(x=>x.id==='tt0000100'));
  assert.equal(new Set(all.map(x=>x.id)).size,all.length);
 });
 it('interrompe ao receber páginas repetidas sem fazer loops',async()=>{
  let count=0;
  const result=await collectCatalogPages(block(0,100),{fetchPage:async()=>{count++;return block(0,100);}});
  assert.equal(result.length,100);
  assert.equal(count,1);
 });
 it('respeita orçamento e limite operacional sem bloquear paginação explícita',async()=>{
  let value=0;
  const result=await collectCatalogPages(block(0,100),{
   maxItems:250,fetchPage:async skip=>block(skip,100),now:()=>value++});
  assert.equal(result.length,250);
 });
 it('publishedCatalog expõe 320 títulos e permite consultar páginas remotas explicitamente',async()=>{
  invalidatePublication();
  const rows=block(0,320),calls=[];
  const mock=async(url)=>{
   const match=decodeURIComponent(String(url)).match(/skip=(\d+)/);
   const skip=match?Number(match[1]):0;calls.push(skip);
   return {ok:true,headers:{get:()=>null},json:async()=>({
    metas:rows.slice(skip,skip+20)})};
  };
  const publication={routes:new Map([['movie::big',{
   url:'https://example.com/manifest.json',id:'test_big',type:'movie',
   extra:[{name:'skip',isRequired:false}],requestTimeoutMs:4000
  }]])};
  const result=await publishedCatalog('movie','big','',publication,{fetchImpl:mock});
  assert.equal(result.metas.length,320);
  assert.ok(calls.some(x=>x>=300));
  const explicit=await publishedCatalog('movie','big','skip=200',publication,{fetchImpl:mock});
  assert.equal(explicit.metas.length,20);
  assert.equal(explicit.metas[0].id,rows[200].id);
 });
 it('deduplicação não remove títulos de mídias distintas com mesmo ID',()=>{
  assert.equal(distinctCatalogMetas([
   {id:'id1',type:'movie'},{id:'id1',type:'series'},{id:'id1',type:'movie'}
  ]).length,2);
 });
});
