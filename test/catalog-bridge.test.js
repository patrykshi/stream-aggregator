import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
process.env.DATA_DIR = testDir;
const {
  validateBridgeSettings, getBridgeSettings, saveBridgeSettings, correctCollections,
  catalogKey, bridgeSnapshot, bridgeCatalogs, bridgeCatalogStream, bridgeManifestExtras,
  getBridgeToken
} = await import('../src/aggregator/catalog-service.js');

const {saveStudioImport}=await import('../src/aggregator/studio-import.js');
const U = 'https://media.example.net/manifest.json';
const manifest = {
  name: 'Cinebra', id: 'br.cinebra.test', catalogs: [
    { type:'movie',id:'streaming_netflix_movies',name:'Netflix' },
    { type:'series',id:'streaming_netflix_series',name:'Netflix' },
    { type:'movie',id:'netflix_top10_movies',name:'Netflix · Top 10' },
    { type:'series',id:'netflix_top10_series',name:'Netflix · Top 10' }
  ]
};
const source = [{
  id:'cinebra-streaming',title:'🎬 Streaming',backdropImageUrl:'https://cdn.example.net/banner.jpg',
  folders:[{ id:'netflix', title:'Netflix',coverImageUrl:'https://cdn.example.net/cover.jpg',
    catalogSources: manifest.catalogs.map(c => ({ addonId:manifest.id,type:c.type,catalogId:c.id,genre:null }))}]
}];
const otherCatalogs = [
  { type:'movie', id:'comet_best', name:'Melhores', extra:[{name:'skip',isRequired:false}] },
  { type:'movie', id:'comet_new', name:'Novidades', extra:[{name:'skip',isRequired:false}] }
];

describe('Cinebra (fonte da verdade) → Agregador → Nuvio', () => {
  it('preserva capa, IDs e a ordem, acrescentando os nomes legíveis', () => {
    const output = correctCollections(source,manifest);
    assert.equal(output.labelsAdded,4);
    assert.equal(output.collections.length,1);
    assert.equal(output.collections[0].backdropImageUrl,source[0].backdropImageUrl);
    assert.equal(output.collections[0].folders[0].coverImageUrl,source[0].folders[0].coverImageUrl);
    const labels = output.collections[0].folders[0].catalogSources.map(x => x.title);
    assert.deepEqual(labels,['Netflix · Filmes','Netflix · Séries','Netflix · Top 10','Netflix · Top 10']);
    assert.equal(source[0].folders[0].catalogSources[0].title,undefined);
  });
  it('não sobrescreve título customizado pelo usuário', () => {
    const manual=structuredClone(source);
    manual[0].folders[0].catalogSources[2].title='Meu Top Favorito';
    const out=correctCollections(manual,manifest);
    assert.equal(out.collections[0].folders[0].catalogSources[2].title,'Meu Top Favorito');
  });
  it('incorpora catálogo externo sem alterar o Cinebra', () => {
    const key = catalogKey(U,'movie','comet_best');
    const extra = [{ url:U,name:'Addon Extra',catalogs:[{ id:'comet_best',type:'movie',name:'Melhores',key,extra:[] }] }];
    const out = correctCollections(source,manifest,extra,{
      extraCollectionName:'Catálogos Complementares',extraPlacement:'separate'
    });
    assert.equal(out.collections.length,2);
    assert.equal(out.collections[0].folders[0].catalogSources.length,4);
    const x=out.collections[1].folders[0].catalogSources[0];
    assert.equal(x.addonId,'community.streamaggregator.unified');
    assert.equal(x.catalogId,key);
    assert.equal(x.title,'Melhores');
  });
  it('aceita mescla sem substituir fontes nem imagens originais', () => {
    const extra=[{
      url:U,name:'Outro',catalogs:otherCatalogs.map(c=>({ ...c,key:catalogKey(U,c.type,c.id) }))
    }];
    const m={id:'movie_all',name:'Mesclados',type:'movie',sources:extra[0].catalogs.map(c=>c.key)};
    const out=correctCollections(source,manifest,extra,{mergedCatalogs:[m],extraPlacement:'streaming'});
    assert.equal(out.collections.length,1);
    assert.equal(out.collections[0].folders.length,3);
    assert.equal(out.collections[0].folders.at(-1).catalogSources[0].catalogId,'bm_movie_all');
  });
  it('valida HTTPS, credenciais e limite de addons', () => {
    const cfg=getBridgeSettings();
    assert.equal(cfg.externalAddons.length,0);
    assert.throws(()=>validateBridgeSettings({...cfg,catalogInputUrl:'http://127.0.0.1/admin'}),/HTTPS/);
    assert.throws(()=>validateBridgeSettings({...cfg,catalogInputUrl:'https://localhost/manifest.json'}),/HTTPS/);
    assert.throws(()=>validateBridgeSettings({...cfg,externalAddons:[{url:'https://root:password@evil.example.org/manifest.json'}]}),/HTTPS/);
    assert.equal(getBridgeToken().length,64);
  });
  it('busca fontes online, persiste cache e permite mescla de dois catálogos', async () => {
    const cfg=getBridgeSettings();
    const selected=otherCatalogs.map(x=>x.type+'::'+x.id);
    const keys=otherCatalogs.map(x=>catalogKey(U,x.type,x.id));
    saveBridgeSettings({...cfg,externalAddons:[{url:U,enabled:true,selected}],
      mergedCatalogs:[{id:'all',type:'movie',name:'Tudo',sources:keys}]
    });
    saveStudioImport({catalogs:manifest,collections:source},0);
    const beforeFetch=globalThis.fetch;
    const calls=[];
    globalThis.fetch=async url=>{
      calls.push(String(url));
      let obj;
      if(String(url).includes('media.example.net/manifest.json')) obj={
        id:'extra',name:'Addon Extra',catalogs:otherCatalogs};
      else if(String(url).includes('/catalog/movie/comet_best.json')) obj={metas:[{id:'tt1'},{id:'tt2'}]};
      else if(String(url).includes('/catalog/movie/comet_new.json')) obj={metas:[{id:'tt2'},{id:'tt3'}]};
      else throw Error('unexpected URL '+String(url));
      return {ok:true,status:200,headers:{get:()=>null},body:(async function*(){yield Buffer.from(JSON.stringify(obj))})()};
    };
    try {
      const s=await bridgeSnapshot({force:true});
      assert.equal(s.stale,false);
      assert.equal(s.collections.length,2);
      assert.equal(s.external.length,1);
      assert.equal(s.extraCatalogs,2);
      assert.equal(s.collections[1].folders.length,2);
      const cats=bridgeCatalogs(s);
      assert.equal(cats.length,3);
      assert.equal(cats[2].id,'bm_all');
      const merged=await bridgeCatalogStream(s,'movie','bm_all');
      assert.deepEqual(merged.metas.map(x=>x.id),['tt1','tt2','tt3']);
      const raw=await bridgeCatalogStream(s,'movie',keys[0]);
      assert.equal(raw.metas.length,2);
      assert.equal(bridgeManifestExtras({resources:['stream'],catalogs:[]},s).catalogs.length,3);
      assert.ok(calls.some(x=>x.includes('comet_best')));
      const another=await bridgeSnapshot();
      assert.equal(another.fetchedAt,s.fetchedAt);
    } finally { globalThis.fetch=beforeFetch; }
  });
});
