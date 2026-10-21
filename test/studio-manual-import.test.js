import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const data=fs.mkdtempSync(path.join(os.tmpdir(),'studio-manual-input-'));
process.env.DATA_DIR=data;
const {validateStudioImport,saveStudioImport,loadStudioImport,getStudioImportStatus} =
  await import('../src/aggregator/studio-import.js');
const {bridgeSnapshot,invalidateBridgeCache} =
  await import('../src/aggregator/catalog-service.js');
const manifest={id:'br.test.offline',name:'Meus catálogos',catalogs:[
  {id:'top',type:'movie',name:'Top 10'},{id:'dramas',type:'series',name:'Dramas'}
]};
const collections=[{id:'grupo1',title:'NETFLIX',folders:[{
  id:'netflix',title:'Netflix',coverImageUrl:'https://cinebra.pages.dev/example.jpg',
  catalogSources:[{addonId:'br.test.offline',type:'movie',catalogId:'top',genre:null}]
}]}];
describe('Importação manual independente',()=>{
 it('valida manifesto ou array, coleções e IDs sem consultar URLs',()=>{
   const valid=validateStudioImport({catalogs:manifest,collections});
   assert.equal(valid.stats.groups,1);assert.equal(valid.stats.folders,1);
   assert.equal(valid.manifest.catalogs.length,2);
   assert.equal(validateStudioImport({catalogs:manifest.catalogs,collections}).manifest.id,'catalogs.imported');
   assert.throws(()=>validateStudioImport({catalogs:{catalogs:[]},collections}),/lista catalogs/);
   assert.throws(()=>validateStudioImport({catalogs:manifest,collections:[{id:'A',title:'A'}]}),/Coleção inválida/);
   assert.throws(()=>validateStudioImport({catalogs:manifest,collections:[...collections,...collections]}),/duplicados/);
 });
 it('salva versão local, preserva dados ao recarregar e não faz fetch do Cinebra',async()=>{
   const fresh=saveStudioImport({catalogs:manifest,collections},0);
   assert.equal(fresh.revision,1);
   assert.equal(getStudioImportStatus().ready,true);
   const originalFetch=globalThis.fetch;
   globalThis.fetch=async()=>{throw Error('Proibido consultar Cinebra ou outro endereço após importação');};
   try{
     const snap=await bridgeSnapshot({force:true});
     assert.equal(snap.collections.length,1);
     assert.equal(snap.collections[0].folders[0].catalogSources[0].title,'Top 10');
     assert.equal(snap.importRevision,1);
     const cached=await bridgeSnapshot({force:true});
     assert.equal(cached.collections.length,1);
   }finally {globalThis.fetch=originalFetch;}
 });
 it('substitui apenas sob revisão esperada, com backup e sem modificar original remoto',async()=>{
   const newCollections=structuredClone(collections);
   newCollections[0].title='Minha Netflix';
   const saved=saveStudioImport({catalogs:manifest,collections:newCollections},1);
   assert.equal(saved.revision,2);
   assert.equal(loadStudioImport().collections[0].title,'Minha Netflix');
   assert.equal(collections[0].title,'NETFLIX');
   assert.throws(()=>saveStudioImport({catalogs:manifest,collections},1),/Outra importação/);
   invalidateBridgeCache();
   const snap=await bridgeSnapshot();
   assert.equal(snap.collections[0].title,'Minha Netflix');
   const backupDir=path.join(data,'studio-import-backups');
   assert.ok(fs.readdirSync(backupDir).some(f=>f.endsWith('.json')));
 });
});
