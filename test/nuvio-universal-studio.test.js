import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const DATA=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-studio-universal-'));
process.env.DATA_DIR=DATA;
const {previewWorkspaceChange,applyWorkspaceChange,loadStudioImport}=await import('../src/aggregator/studio-import.js');
const {correctCollections,previewExternalAddon}=await import('../src/aggregator/catalog-service.js');
const c={id:'filmes',title:'Minha coleção',folders:[{id:'folder',title:'Filmes',catalogSources:[]}]};
const manifest={id:'provider-a',catalogs:[{id:'latest',type:'movie',name:'Em alta'}]};
describe('Nuvio Collection Studio universal',()=>{
 it('permite iniciar biblioteca vazia e criar coleções depois',()=>{
   const preview=previewWorkspaceChange({mode:'new'});
   assert.equal(preview.stats.groups,0);assert.equal(preview.stats.catalogs,0);
   const status=applyWorkspaceChange(preview.payload,0);
   assert.equal(status.ready,true);assert.equal(status.revision,1);
 });
 it('importa somente uma coleção sem exigir JSON de catálogos',()=>{
   const v=previewWorkspaceChange({collections:[c],mode:'append'});
   assert.equal(v.stats.groups,1);assert.equal(v.stats.catalogs,0);
   applyWorkspaceChange(v.payload,1);
   assert.equal(loadStudioImport().collections[0].title,'Minha coleção');
 });
 it('acrescenta coleção de outra origem mesmo com IDs repetidos, sem sobrescrever',()=>{
   const v=previewWorkspaceChange({collections:{collections:[c]},mode:'append'});
   assert.equal(v.stats.groups,2);assert.equal(v.stats.renamedIds,2);
   applyWorkspaceChange(v.payload,2);
   const saved=loadStudioImport();
   assert.equal(saved.collections.length,2);
   assert.notEqual(saved.collections[0].id,saved.collections[1].id);
   assert.notEqual(saved.collections[0].folders[0].id,saved.collections[1].folders[0].id);
 });
 it('importa somente manifestos de fornecedores distintos com IDs iguais',()=>{
   let proposal=previewWorkspaceChange({catalogs:manifest,mode:'append'});
   applyWorkspaceChange(proposal.payload,3);
   const b={id:'provider-b',catalogs:[{id:'latest',type:'movie',name:'Últimos'}]};
   proposal=previewWorkspaceChange({catalogs:b,mode:'append'});
   applyWorkspaceChange(proposal.payload,4);
   const saved=loadStudioImport();
   assert.equal(saved.manifest.catalogs.length,2);
   assert.equal(saved.manifest.catalogs[0].addonId,'provider-a');
   assert.equal(saved.manifest.catalogs[1].addonId,'provider-b');
 });
 it('rótulos de catálogos respeitam addonId, mesmo com IDs iguais',()=>{
   const m=loadStudioImport().manifest;
   const data=[{id:'mix',title:'Mix',folders:[{id:'p',title:'Pasta',catalogSources:[
     {addonId:'provider-a',type:'movie',catalogId:'latest'},
     {addonId:'provider-b',type:'movie',catalogId:'latest'}
   ]}]}];
   const result=correctCollections(data,m);
   assert.deepEqual(result.collections[0].folders[0].catalogSources.map(s=>s.title),['Em alta','Últimos']);
 });
 it('addon de metadados sem catálogos é reconhecido e não tratado como catálogo',async()=>{
   const before=globalThis.fetch;
   globalThis.fetch=async()=>({ok:true,status:200,headers:{get:()=>null},body:(async function*(){
     yield Buffer.from(JSON.stringify({id:'aio.meta',name:'AIO Metadata',resources:[{name:'meta'}]}));
   })()});
   try{
     const found=await previewExternalAddon('https://metadata.example/manifest.json');
     assert.deepEqual(found.resources,['meta']);assert.deepEqual(found.catalogs,[]);
   }finally{globalThis.fetch=before;}
 });
 it('substituição continua protegida por revisão e backup',()=>{
   const preview=previewWorkspaceChange({collections:[c],mode:'replace'});
   assert.equal(preview.stats.groups,1);
   applyWorkspaceChange(preview.payload,5);
   assert.throws(()=>applyWorkspaceChange(preview.payload,5),/Outra importação/);
   assert.ok(fs.readdirSync(path.join(DATA,'studio-import-backups')).length>=1);
 });
});
