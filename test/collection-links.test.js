import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import '../public/collection-links.js';
const {createResolver}=globalThis.NuvioCollectionLinks;
const BRIDGE='community.streamaggregator.unified';
const original={addonId:'br.cinebra.abc',type:'movie',catalogId:'trending_movies',genre:null};
const provider={url:'https://example.org/cinebra/manifest.json',name:'Cinebra',addonId:'br.cinebra.abc',
 enabled:true,status:'ok',catalogs:[{id:'trending_movies',type:'movie',key:'bx123',name:'Em alta'},
 {id:'trending_series',type:'series',key:'bx456',name:'Em alta'}]};
const proxy={addonId:BRIDGE,id:'bx123',sourceId:'trending_movies',
 sourceAddonId:provider.addonId,sourceUrl:provider.url,type:'movie',name:'Cinebra · Em alta'};
describe('Vínculos de coleções importadas',()=>{
 it('identifica referência Cinebra original mesmo sem o catálogo adicionado no Hub',()=>{
  const r=createResolver({addons:[provider],loaded:true});
  const found=r.resolve(original);
  assert.equal(found.status,'ready');
  assert.equal(found.source,'addon');
  assert.equal(found.label,'Em alta');
  assert.equal(found.provider,'Cinebra');
 });
 it('identifica referência original com proxy incluído, sem modificar a referência',()=>{
  const before=JSON.stringify(original);
  const r=createResolver({addons:[provider],catalogs:[proxy],loaded:true});
  assert.equal(r.resolve(original).status,'ready');
  assert.equal(r.resolve(original).source,'hub-and-addon');
  assert.equal(r.resolve(original).label,'Cinebra · Em alta');
  assert.equal(JSON.stringify(original),before);
  assert.equal(r.resolve({addonId:BRIDGE,type:'movie',catalogId:proxy.id}).status,'ready');
 });
 it('identifica catálogo criado no próprio Hub sem depender de addon externo',()=>{
  const manual={addonId:BRIDGE,id:'studio_custom',type:'series',name:'Minha lista',
   metas:[{id:'tt1234567',type:'series',name:'Série'}],manual:true};
  const r=createResolver({catalogs:[manual],loaded:true});
  assert.equal(r.resolve({addonId:BRIDGE,type:'series',catalogId:'studio_custom'}).status,'ready');
  assert.equal(r.candidates('series').length,1);
 });
 it('não identifica tipo errado nem adiciona catálogos de fontes suspensas',()=>{
  const bad={...provider,enabled:false};
  const r=createResolver({addons:[bad],loaded:true});
  assert.equal(r.resolve(original).status,'missing');
  assert.equal(r.candidates('movie').length,0);
  assert.equal(createResolver({addons:[provider],loaded:true})
   .resolve({...original,type:'series'}).status,'missing');
 });
 it('estado não verificado não deve acusar falsamente ausência definitiva',()=>{
  const r=createResolver({addons:[],loaded:false});
  assert.equal(r.resolve(original).status,'pending');
 });
 it('alerta por pasta e coleção e indica catálogos possíveis do mesmo tipo',()=>{
  const r=createResolver({addons:[provider],loaded:true});
  const collections=[{id:'abc',folders:[
   {id:'p1',catalogSources:[original,{...original,catalogId:'retirado'}]},
   {id:'p2',catalogSources:[{addonId:provider.addonId,type:'series',catalogId:'trending_series'}]}
  ]}];
  const before=JSON.stringify(collections);
  const result=r.summary(collections);
  assert.equal(result.total,3);
  assert.equal(result.ready,2);
  assert.equal(result.missing,1);
  assert.equal(result.affectedFolders,1);
  assert.equal(result.byGroup.abc.missing,1);
  assert.equal(r.candidates('movie').length,1);
  assert.equal(JSON.stringify(collections),before);
 });
 it('reconcilia grande conjunto sem alterar automaticamente coleções importadas',()=>{
  const catalogs=Array.from({length:930},(_,i)=>({id:'id'+i,type:'movie',name:'Cat '+i}));
  const big={...provider,catalogs};
  const sources=catalogs.map(c=>({addonId:provider.addonId,type:'movie',catalogId:c.id}));
  const collections=[{id:'large',folders:[{id:'f',catalogSources:sources}]}];
  const originalJSON=JSON.stringify(collections);
  const summary=createResolver({addons:[big],loaded:true}).summary(collections);
  assert.equal(summary.ready,930);
  assert.equal(summary.missing,0);
  assert.equal(JSON.stringify(collections),originalJSON);
 });
});
