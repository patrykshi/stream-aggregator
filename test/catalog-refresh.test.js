import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-refresh-test-'));
process.env.DATA_DIR=isolated;
const {refreshableCatalogs,safeRefresh,computeRefresh,applyRefreshPlan,
 saveRefreshSettings,refreshSettings,runScheduledCatalogRefresh}=await import('../src/aggregator/catalog-refresh.js');
const film=id=>({id:'tt'+String(8000000+id),type:'movie',name:'Filme '+id});
const catalog=(id,count=100)=>({id,addonId:'nuvio.studio',name:'Lista '+id,
 type:'movie',manual:true,listSource:{provider:'trakt',url:'https://trakt.tv/users/a/lists/b',mode:'snapshot'},
 metas:Array.from({length:count},(_,n)=>film(n))});
const makeCurrent=(num=1)=>({revision:4,manifest:{id:'nuvio.studio',name:'QA',catalogs:Array.from({length:num},(_,i)=>catalog('cat'+i))},
 collections:[{id:'g',title:'Coleção',folders:[{id:'f',title:'Filmes',catalogSources:[{addonId:'nuvio.studio',catalogId:'cat0',type:'movie'}]}]}]});
describe('Atualização de listas sem sobrescrever coleções',()=>{
 it('desligada por padrão e sem dependência de usuário logado no Nuvio',async()=>{
  assert.equal(refreshSettings().automatic,false);
  assert.deepEqual(await runScheduledCatalogRefresh(),{skipped:true});
  assert.equal(saveRefreshSettings(true).automatic,true);
  assert.equal(saveRefreshSettings(false).automatic,false);
  assert.throws(()=>saveRefreshSettings('true'));
 });
 it('bloqueia lista vazia, duplicada e queda superior a 25%',()=>{
  const old=catalog('x',100);
  assert.equal(safeRefresh(old,[]).safe,false);
  assert.equal(safeRefresh(old,Array.from({length:74},(_,i)=>film(i))).safe,false);
  assert.equal(safeRefresh(old,[film(1),film(1)]).safe,false);
  assert.equal(safeRefresh(old,Array.from({length:75},(_,i)=>film(i))).safe,true);
 });
 it('prévia considera ordem, preserva IDs e informa erros sem interromper demais listas',async()=>{
  const current=makeCurrent(3);
  const fetchPreview=async input=>{
   if(input.url.includes('/b'))return Array.from({length:100},(_,i)=>film(i+10));
   return [];
  };
  const plan=await computeRefresh(current,{maxCatalogs:3,fetchPreview:async()=>({metas:Array.from({length:100},(_,i)=>film(i+10))})});
  assert.equal(plan.total,3);
  assert.equal(plan.changes.length,3);
  const updated=applyRefreshPlan(current,plan);
  assert.deepEqual(updated.collections,current.collections);
  assert.equal(updated.catalogs.catalogs[0].id,'cat0');
  assert.equal(updated.catalogs.catalogs[0].metas[0].id,film(10).id);
  assert.deepEqual(current.manifest.catalogs[0].metas[0],film(0),'Prévia não pode mutar biblioteca');
  assert.throws(()=>applyRefreshPlan({...current,revision:5},plan),/mudou/);
  const partial=await computeRefresh(current,{maxCatalogs:2,offset:2,fetchPreview:async()=>({metas:[film(0)]})});
  assert.equal(partial.scanned,2);
  assert.equal(partial.limited,true);
  assert.equal(partial.errors.length,2);
 });
 it('ignora snapshots iguais, fontes não compatíveis e evita commits desnecessários',async()=>{
  const current=makeCurrent();
  const plan=await computeRefresh(current,{fetchPreview:async()=>({metas:current.manifest.catalogs[0].metas})});
  assert.equal(plan.changes.length,0);
  assert.equal(refreshableCatalogs({manifest:{catalogs:[{manual:true,listSource:{provider:'imdb'}}]}}).length,0);
 });
});
process.on('exit',()=>fs.rmSync(isolated,{recursive:true,force:true}));
