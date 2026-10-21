import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeConfig} from '../src/config/codec.js';
import {generateManifest} from '../src/aggregator/manifest.js';
import {stableCatalogId,fetchCatalog} from '../src/aggregator/catalogs.js';
import {checkAddons,getMonitorReport} from '../src/aggregator/monitor.js';

const url='https://example-provider.test/manifest.json';
const a={name:'Fornecedor',url,enabled:true,resources:['catalog'],includeCatalogs:true,
  requestTimeoutMs:18000,resourceSelectionConfigured:true,catalogs:[
    {type:'movie',id:'top',name:'Em alta'}
  ]};
describe('Configurações de addon / monitoramento',()=>{
 it('preserva timeout configurado e seleção apenas de catálogo',()=>{
   const cfg=sanitizeConfig({addons:[a]});
   assert.equal(cfg.addons[0].requestTimeoutMs,18000);
   assert.deepEqual(cfg.addons[0].resources,['catalog']);
   assert.equal(cfg.addons[0].resourceSelectionConfigured,true);
   assert.equal(getMonitorReport(cfg).items[0].configuredTimeoutMs,18000);
   assert.equal(sanitizeConfig({addons:[{...a,requestTimeoutMs:999999}]}).addons[0].requestTimeoutMs,null);
 });
 it('seleção catalog-only não publica recursos de legendas e metadados',()=>{
   const m=generateManifest({addons:[a]});
   assert.equal(m.catalogs.length,1);
   assert.equal(m.catalogs[0].id,stableCatalogId(url,'top','movie'));
   assert.ok(!m.resources.some(r=>r.name==='subtitles'));
   assert.ok(!m.resources.some(r=>r.name==='meta'));
 });
 it('IDs estáveis de catálogos resistem à reordenação do perfil e roteiam corretamente',async()=>{
   const second={name:'Outro',url:'https://outro.example/manifest.json',enabled:true,
     resources:['stream'],includeCatalogs:false,resourceSelectionConfigured:true};
   const mf1=generateManifest({addons:[a,second]});
   const mf2=generateManifest({addons:[second,a]});
   assert.equal(mf1.catalogs[0].id,mf2.catalogs[0].id);
   const prev=globalThis.fetch;let fetchUrl='';
   globalThis.fetch=async endpoint=>{
     fetchUrl=String(endpoint);
     return {ok:true,json:async()=>({metas:[{id:'tt1',name:'Teste'}]})};
   };
   try{
     const result=await fetchCatalog({addons:[second,a]},'movie',mf1.catalogs[0].id);
     assert.equal(result.metas[0].name,'Teste');
     assert.match(fetchUrl,/\/catalog\/movie\/top\.json/);
   }finally{globalThis.fetch=prev;}
 });
 it('manifesto de origem é verificado inclusive quando uso local está desativado',async()=>{
   const disabled={...a,enabled:false};
   const prev=globalThis.fetch;
   globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({
     id:'remote-origin',resources:['stream','catalog','meta'],types:['movie','series'],
     catalogs:[{type:'movie',id:'top'},{type:'series',id:'series'}]
   })});
   try{
     await checkAddons(()=>({addons:[disabled]}),{force:true});
     const r=getMonitorReport({addons:[disabled]}).items[0];
     assert.equal(r.enabled,false);
     assert.equal(r.health.status,'online');
     assert.equal(r.health.catalogCount,2);
     assert.deepEqual(r.health.resources,['stream','catalog','meta']);
     assert.equal(r.configuredTimeoutMs,18000);
   }finally{globalThis.fetch=prev;}
 });
 it('seleção de recurso não declarado é incompatível, sem mudar a escolha de ativação',async()=>{
   const prev=globalThis.fetch;
   globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({id:'remote-origin',resources:['stream']})});
   try{
     await checkAddons(()=>({addons:[a]}),{force:true});
     const result=getMonitorReport({addons:[a]}).items[0];
     assert.equal(result.enabled,true);
     assert.equal(result.health.status,'incompatible');
   }finally{globalThis.fetch=prev;}
 });
});
