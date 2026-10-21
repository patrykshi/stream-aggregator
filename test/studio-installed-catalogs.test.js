import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-ext-cat-'));
process.env.DATA_DIR=dataDir;
const {getBridgeSettings,bridgeSnapshot,bridgeManifestExtras,bridgeCatalogStream,catalogKey}=await import('../src/aggregator/catalog-service.js');
const {saveStudioDocument,applyStudioOverlay}=await import('../src/aggregator/collection-overlay.js');
const {saveStudioImport}=await import('../src/aggregator/studio-import.js');
const externalURL='https://addon.example/manifest.json';
const addonCatalogId='latest';
const proxyId=catalogKey(externalURL,'movie',addonCatalogId);
const cinebra={id:'cinebra',catalogs:[{type:'movie',id:'top',name:'Top'}]};
const original=[{id:'streaming',title:'Streaming',folders:[{id:'netflix',title:'Netflix',
  catalogSources:[
    {addonId:'cinebra',type:'movie',catalogId:'top',genre:null,title:'Top'},
    {addonId:'cinebra',type:'series',catalogId:'original',genre:null,title:'Originais'}
  ]}]}];
const key=s=>[s.addonId,s.type,s.catalogId,s.genre||''].join('::');
const linked={addonId:'community.streamaggregator.unified',type:'movie',catalogId:proxyId,
  addonBaseUrl:'https://stream.patrykrocha.com',genre:null,title:'Addon · Em alta'};
describe('Addon instalado: catálogo da pasta / proxy / ordenação',()=>{
 it('aplica o catálogo do addon e mantém novas fontes do Cinebra em segundo plano',async()=>{
  const doc={
    catalogAddons:[{url:externalURL,selected:['movie::latest']}],
    sourceAdds:{netflix:[linked]},
    sourceOrder:{netflix:[key(linked),key(original[0].folders[0].catalogSources[1]),key(original[0].folders[0].catalogSources[0])]}
  };
  saveStudioDocument(doc,0);
  saveStudioImport({catalogs:cinebra,collections:original},0);
  const before=globalThis.fetch;const calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    let data;
    if(String(url)===externalURL)data={id:'addon',name:'Addon Externo',catalogs:[
      {type:'movie',id:'latest',name:'Em alta'},
      {type:'series',id:'episodes',name:'Episódios'}
    ]};
    else if(String(url).includes('/catalog/movie/latest.json'))data={metas:[{id:'tt1',name:'Exemplo'}]};
    else throw Error('Unexpected URL '+String(url));
    return {ok:true,status:200,headers:{get:()=>null},body:(async function*(){yield Buffer.from(JSON.stringify(data))})()};
  };
  try{
    const snap=await bridgeSnapshot({force:true});
    assert.equal(snap.stale,false);
    assert.equal(snap.external.length,1);
    assert.equal(snap.extraCatalogs,0,'não injeta pasta complementar quando só selecionado no Studio');
    assert.equal(snap.collections.length,1);
    const sources=snap.collections[0].folders[0].catalogSources;
    assert.deepEqual(sources.map(s=>s.catalogId),[proxyId,'original','top']);
    const mf=bridgeManifestExtras({resources:['stream'],catalogs:[]},snap);
    assert.equal(mf.catalogs.length,1);
    assert.equal(mf.catalogs[0].id,proxyId);
    const result=await bridgeCatalogStream(snap,'movie',proxyId);
    assert.equal(result.metas[0].id,'tt1');
    const next=structuredClone(original);
    next[0].folders[0].catalogSources.push({addonId:'cinebra',type:'movie',catalogId:'new',genre:null,title:'Novidades'});
    const reordered=applyStudioOverlay(next,doc);
    assert.deepEqual(reordered[0].folders[0].catalogSources.map(s=>s.catalogId),[proxyId,'original','top','new']);
    assert.ok(calls.some(x=>x.includes('catalog/movie/latest.json')));
  }finally{globalThis.fetch=before;}
 });
});
