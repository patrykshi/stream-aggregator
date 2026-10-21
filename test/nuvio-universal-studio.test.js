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
 it('importa formatos variados de coleções (objeto único, groups, name, sources, BOM) e detecta JSON combinado ou invertido',()=>{
   const singleWithBom='\uFEFF'+JSON.stringify({
     name:'Coleção Única',
     folders:[{name:'Destaques',sources:[{addon_id:'provider-a',type:'movie',catalog_id:'latest'}]}]
   });
   const p1=previewWorkspaceChange({collections:singleWithBom,mode:'append'});
   assert.equal(p1.stats.newCollections,1);
   const rev1=applyWorkspaceChange(p1.payload,p1.expectedRevision).revision;
   const saved1=loadStudioImport();
   const addedCol=saved1.collections.find(x=>x.title==='Coleção Única');
   assert.ok(addedCol);
   assert.equal(addedCol.folders[0].title,'Destaques');
   assert.equal(addedCol.folders[0].catalogSources[0].catalogId,'latest');
   assert.equal(addedCol.folders[0].catalogSources[0].addonId,'provider-a');

   // JSON combinado (collections + catalogs) enviado no campo collections
   const combined={
     collections:[{id:'combo-col',title:'Combo',folders:[{id:'combo-f',title:'Pasta Combo',catalogSources:[]}]}],
     catalogs:[{id:'combo-cat',type:'series',name:'Séries Combo'}]
   };
   const p2=previewWorkspaceChange({collections:combined,mode:'append'});
   const rev2=applyWorkspaceChange(p2.payload,rev1).revision;
   const saved2=loadStudioImport();
   assert.ok(saved2.collections.some(x=>x.id==='combo-col'));
   assert.ok(saved2.manifest.catalogs.some(x=>x.id==='combo-cat'));

   // Manifesto de catálogos enviado acidentalmente quando o seletor estava em "collections"
   const misplacedManifest={id:'provider-c',name:'Provider C',catalogs:[{id:'scifi',type:'movie',name:'Sci-Fi'}]};
   const p3=previewWorkspaceChange({collections:misplacedManifest,mode:'append'});
   applyWorkspaceChange(p3.payload,rev2);
   assert.ok(loadStudioImport().manifest.catalogs.some(x=>x.id==='scifi'&&x.addonId==='provider-c'));
 });
 it('openImport no frontend aplica importação sem bloquear em window.confirm no iframe',()=>{
   const appSource=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
   const openImportIdx=appSource.indexOf('function openImport()');
   assert.ok(openImportIdx>0);
   const openImportBlock=appSource.slice(openImportIdx,openImportIdx+2200);
   assert.ok(!openImportBlock.includes('if(!confirm('),'openImport não deve usar confirm() nativo bloqueado em iframe');
   assert.ok(openImportBlock.includes('/api/nuvio-studio/workspace/apply'));
   assert.ok(openImportBlock.includes('iPreviewFeedback'));
 });
 it('valida chaves obrigatórias (ex.: name e items) na importação de coleções antes de salvar',async()=>{
   const {validateCollectionImportStructure}=await import('../src/aggregator/studio-import.js');
   // Carrega public/app.js para testar validateCollectionImportJson exposta no frontend
   await import('../public/app.js');
   const validateFrontend=globalThis.validateCollectionImportJson;
   assert.equal(typeof validateFrontend,'function');

   // Objetos sem chaves obrigatórias devem falhar com mensagem clara indicando "name" e "items"
   const emptyRes=validateFrontend({});
   assert.equal(emptyRes.valid,false);
   assert.match(emptyRes.error,/"name"/);
   assert.match(emptyRes.error,/"items"/);

   const missingItems=validateFrontend({name:'Minha Coleção'});
   assert.equal(missingItems.valid,false);
   assert.match(missingItems.error,/"items"/);

   const missingName=validateFrontend({items:[{name:'Pasta 1'}]});
   assert.equal(missingName.valid,false);
   assert.match(missingName.error,/"name"/);

   // Também deve falhar no backend antes de salvar
   assert.throws(()=>previewWorkspaceChange({collections:{foo:'bar'},mode:'append'}),/"name"/);
   assert.throws(()=>previewWorkspaceChange({collections:{name:'Sem Itens'},mode:'append'}),/"items"/);

   // Objeto válido com "name" e "items" (lista de títulos ou pastas) deve validar e importar com sucesso
   const validWithItems={
     name:'Favoritos Sci-Fi',
     items:[
       {id:'tt0133093',name:'Matrix',type:'movie'},
       {id:'tt0816692',name:'Interestelar',type:'movie'}
     ]
   };
   assert.equal(validateFrontend(validWithItems).valid,true);
   assert.equal(validateCollectionImportStructure(validWithItems).valid,true);
   const preview=previewWorkspaceChange({collections:validWithItems,mode:'append'});
   applyWorkspaceChange(preview.payload,preview.expectedRevision);
   const saved=loadStudioImport();
   assert.ok(saved.collections.some(x=>x.title==='Favoritos Sci-Fi'));
   assert.ok(saved.manifest.catalogs.some(x=>x.name==='Favoritos Sci-Fi'&&x.metas?.length===2));
 });
});
