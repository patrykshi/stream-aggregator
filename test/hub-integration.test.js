import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-hub-integration-'));
process.env.DATA_DIR=dir;
const {saveStudioImport,loadStudioImport}=await import('../src/aggregator/studio-import.js');
const {bridgeSnapshot,bridgeManifestExtras,bridgeCatalogStream,catalogKey,invalidateBridgeCache}=await import('../src/aggregator/catalog-service.js');
const {generateManifest}=await import('../src/aggregator/manifest.js');
const {getPublication,publishedMeta}=await import('../src/aggregator/nuvio-publication.js');
const addonId='community.streamaggregator.unified';
describe('Nuvio Hub: biblioteca e agregador únicos',()=>{
 it('catálogo convencional criado no editor passa ao manifesto e serve seus títulos',async()=>{
  const id='studio_favorites';
  const catalogs=[{id,type:'movie',name:'Meus favoritos',addonId,manual:true,
    metas:[{id:'tt0133093',type:'movie',name:'Matrix',poster:'https://image.tmdb.org/t/p/w500/matrix.jpg'}]}];
  const collections=[{id:'minha-colecao',title:'Minha coleção',folders:[{
    id:'favoritos',title:'Favoritos',tileShape:'POSTER',
    catalogSources:[{provider:'addon',addonId,type:'movie',catalogId:id,title:'Meus favoritos',genre:null}]
  }]}];
  saveStudioImport({catalogs:{id:'nuvio.studio',name:'Hub',catalogs},collections},0);
  const snapshot=await bridgeSnapshot({force:true});
  assert.equal(snapshot.collections.length,1);
  assert.equal(snapshot.manualCatalogs.length,1);
  const manifest=bridgeManifestExtras(generateManifest({addons:[]}),snapshot);
  assert.ok(manifest.catalogs.some(c=>c.id===id&&c.name==='Meus favoritos'));
  assert.ok(manifest.resources.some(r=>r==='catalog'||r.name==='catalog'));
  const items=await bridgeCatalogStream(snapshot,'movie',id);
  assert.deepEqual(items.metas.map(x=>x.name),['Matrix']);
  const details=await publishedMeta('movie','tt0133093',{metaProviders:[]});
  assert.equal(details.meta.name,'Matrix');
  const publication=await getPublication({config:{addons:[]},baseManifest:manifest,collections:snapshot.collections,force:true});
  assert.equal(publication.status.unresolved,0);
  assert.equal(publication.status.native,1);
 });
 it('catálogo de outro addon passa do Hub ao manifesto e ao endpoint do catálogo',async()=>{
  const url='https://cataddon.example/manifest.json';
  const key=catalogKey(url,'movie','top');
  const prev=loadStudioImport();
  const incoming={id:key,type:'movie',name:'Tendências externas',addonId,sourceUrl:url,sourceId:'top'};
  const nextCollections=structuredClone(prev.collections);
  nextCollections[0].folders[0].catalogSources.push({
    provider:'addon',addonId,type:'movie',catalogId:key,title:incoming.name,genre:null
  });
  saveStudioImport({
    catalogs:{id:'nuvio.studio',name:'Hub',catalogs:[...prev.manifest.catalogs,incoming]},
    collections:nextCollections
  },prev.revision);
  invalidateBridgeCache();
  const orig=globalThis.fetch;
  globalThis.fetch=async urlString=>{
    const u=String(urlString);
    let value;
    if(u==='https://cataddon.example/manifest.json')
      value={id:'external.catalog',name:'Addon de catálogos',resources:['catalog'],
        catalogs:[{type:'movie',id:'top',name:'Top do provedor'}]};
    else if(u.includes('/catalog/movie/top.json'))
      value={metas:[{id:'tt999',name:'Item externo'}]};
    else throw Error('URL não prevista '+u);
    return {ok:true,status:200,headers:{get:()=>null},body:(async function*(){yield Buffer.from(JSON.stringify(value))})()};
  };
  try{
    const snap=await bridgeSnapshot({force:true});
    assert.equal(snap.external.length,1);
    const mf=bridgeManifestExtras(generateManifest({addons:[]}),snap);
    assert.ok(mf.catalogs.some(x=>x.id===key));
    const result=await bridgeCatalogStream(snap,'movie',key);
    assert.equal(result.metas[0].name,'Item externo');
  }finally{globalThis.fetch=orig;}
 });
 it('dados editados permanecem separados dos addons e a substituição exige revisão correta',()=>{
  assert.equal(loadStudioImport().collections.length,1);
  assert.equal(loadStudioImport().manifest.catalogs.length,2);
  assert.throws(()=>saveStudioImport({catalogs:loadStudioImport().manifest,collections:loadStudioImport().collections},0),/Outra importação/);
 });
});
