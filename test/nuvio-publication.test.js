import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublication } from '../src/aggregator/nuvio-publication.js';
import { BRIDGE_ADDON_ID } from '../src/aggregator/catalog-service.js';

const baseManifest = { id: BRIDGE_ADDON_ID, resources: ['stream'], catalogs: [] };
const source = (addonId, type, catalogId) => ({ addonId, type, catalogId, provider: 'addon' });
const original = [ { id:'home', title:'Home', folders:[{
  id:'favorites', title:'Favoritos', catalogSources:[source('br.cinebra.test','movie','popular'),
    source('br.cinebra.test','series','popular'),source('unknown','movie','other')]
}] } ];
const provider = { addonId:'br.cinebra.test', url:'https://catalog.example/addon/test/manifest.json',
  catalogs:[{type:'movie',id:'popular',name:'Filmes populares'},
    {type:'series',id:'popular',name:'Séries populares'}] };
test('publicação usa somente manifestos correspondentes, preserva origem e ordem',()=>{
  const result=buildPublication({collections:original,baseManifest,providers:[provider]});
  assert.equal(result.status.routed,2);
  assert.equal(result.status.unresolved,1);
  assert.equal(result.status.ready,false);
  assert.equal(result.manifest.catalogs.length,2);
  assert.ok(result.manifest.resources.includes('catalog'));
  const sources=result.collections[0].folders[0].catalogSources;
  assert.equal(sources[0].addonId,BRIDGE_ADDON_ID);
  assert.match(sources[0].catalogId,/^bx[a-f0-9]{12}_[a-f0-9]{16}$/);
  assert.notEqual(sources[0].catalogId,sources[1].catalogId);
  assert.equal(sources[2].addonId,'unknown');
  assert.equal(original[0].folders[0].catalogSources[0].catalogId,'popular');
  assert.equal(result.routes.size,2);
});
test('catálogos nativos permanecem intactos',()=>{
  const native={...baseManifest,catalogs:[{type:'movie',id:'custom',name:'Original'}]};
  const c=[{id:'group',title:'Home',folders:[{id:'f',title:'Pasta',catalogSources:[source(BRIDGE_ADDON_ID,'movie','custom')]}]}];
  const result=buildPublication({collections:c,baseManifest:native,providers:[]});
  assert.equal(result.status.native,1);
  assert.equal(result.status.unresolved,0);
  assert.equal(result.status.ready,true);
  assert.equal(result.manifest.catalogs.length,1);
});
test('mesmo addonId em URLs diferentes não pode ser roteado de modo ambíguo',()=>{
  const result=buildPublication({collections:original,baseManifest,providers:[provider,{...provider,url:'https://other.example/manifest.json'}]});
  assert.equal(result.status.routed,0);
  assert.equal(result.status.unresolved,3);
});
test('fontes TMDB e Trakt não são convertidas em catálogos de addon',()=>{
  const c=[{id:'g',title:'Home',folders:[{id:'f',title:'F',catalogSources:[{provider:'tmdb',type:'movie',title:'Popular'}]}]}];
  const result=buildPublication({collections:c,baseManifest,providers:[]});
  assert.equal(result.status.nonAddon,1);
  assert.equal(result.status.unresolved,0);
  assert.deepEqual(result.collections,c);
});
