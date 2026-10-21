import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 validatePreviewRequest,pickProvider,normalizePreviewItems,
 fetchPreviewSample,localPreviewSample,repeatedPreviewPage
} from '../src/aggregator/preview-catalog.js';
const manifest={url:'https://example.com/manifest.json',addonId:'cinebra.test',
 name:'Cinebra Test',catalogs:[{id:'movies-trending',type:'movie',name:'Tendências',extra:[{name:'skip',isRequired:false}]},
 {id:'shows-trending',type:'series',name:'Séries'}]};
const source={addonId:manifest.addonId,type:'movie',catalogId:'movies-trending'};
const provider={addon:{url:manifest.url,enabled:true,name:'Cinebra Test'},
 manifest,catalog:manifest.catalogs[0]};
const reply=(metas,status=200)=>({ok:status===200,status,headers:{get:()=>null},
 text:async()=>JSON.stringify({metas})});
describe('Amostra segura de catálogo no Preview do Nuvio',()=>{
 it('sinaliza paginação ignorada pelo addon sem inventar novos títulos',()=>{
  const a={items:[{id:'tt1234567'},{id:'tt7654321'}]};
  assert.equal(repeatedPreviewPage(a,{items:[...a.items]}),true);
  assert.equal(repeatedPreviewPage(a,{items:[{id:'tt1234567'},{id:'tt1111111'}]}),false);
 });

 it('aceita identificadores com gênero e página; recusa entradas incorretas',()=>{
  assert.deepEqual(validatePreviewRequest({...source,genre:'Comedy',page:2,refresh:false}),
   {...source,genre:'Comedy',page:2,refresh:false});
  for(const body of [{...source,type:'other'},{...source,page:999},
   {...source,catalogId:''},{...source,genre:'../../tmp'},
   {...source,addonId:''}])assert.throws(()=>validatePreviewRequest(body));
 });
 it('resolve apenas fornecedor instalado e ativo com mesmo catálogo declarado',()=>{
  const installed=[{url:manifest.url,enabled:true}];
  assert.ok(pickProvider(source,installed,[manifest]));
  assert.equal(pickProvider({...source,catalogId:'fake'},installed,[manifest]),null);
  assert.equal(pickProvider(source,[{url:manifest.url,enabled:false}],[manifest]),null);
  assert.equal(pickProvider(source,[{url:'https://elsewhere/manifest.json',enabled:true}],[manifest]),null);
 });
 it('retorna amostra de doze com IDs originais, capas e URL do addon derivada do manifesto',async()=>{
  const metas=Array.from({length:20},(_,i)=>({id:'tt'+String(1000000+i),type:'movie',
   name:'Título '+i,poster:'https://image.example/a'+i+'.jpg',year:2025}));
  let received='',opts=null;
  const result=await fetchPreviewSample({selection:source,provider,fetchImpl:async(u,o)=>{
   received=u;opts=o;return reply(metas);
  }});
  assert.equal(result.count,12);
  assert.equal(result.status,'loaded');
  assert.equal(result.missingPosters,0);
  assert.equal(result.hasMore,true);
  assert.equal(result.items[0].poster,'https://image.example/a0.jpg');
  assert.equal(result.items[0].id,'tt1000000');
  assert.match(received,/example.com\/catalog\/movie\/movies-trending.json/);
  assert.equal(opts.redirect,'error');
 });
 it('envia genre=None quando o manifesto do catálogo exige esse parâmetro',async()=>{
  let requested='';
  const required={...provider,catalog:{...provider.catalog,
   extra:[{name:'genre',isRequired:true,options:['None','Drama']},{name:'skip',isRequired:false}]}};
  await fetchPreviewSample({selection:{...source,page:1},provider:required,fetchImpl:async(url)=>{
   requested=url;return reply([{id:'tt1234567',name:'Teste'}]);
  }});
  assert.ok(requested.includes('genre=None'));
  assert.ok(requested.includes('skip=100'));
 });
  it('preserva somente imagens HTTPS e mostra capa ausente de forma explícita',()=>{
  const result=normalizePreviewItems([{id:'abc',poster:'javascript:alert(1)',name:'x'},
   {id:'def',poster:'http://insecure/p.jpg',name:'y'}],'movie');
  assert.equal(result[0].poster,null);
  assert.equal(result[1].poster,null);
 });
 it('catálogo vazio e erro HTTP são diferenciados',async()=>{
  const empty=await fetchPreviewSample({selection:source,provider,fetchImpl:async()=>reply([])});
  assert.equal(empty.status,'empty');
  await assert.rejects(fetchPreviewSample({selection:source,provider,fetchImpl:async()=>reply([],503)}),/HTTP 503/);
 });
 it('metadados locais permanecem intactos após consulta paginada',()=>{
  const metas=Array.from({length:27},(_,i)=>({id:'tt'+String(2000000+i),name:'Local '+i,
   type:'movie',poster:'https://image.example/x.jpg'}));
  const local={id:'movie-local',type:'movie',metas};
  const sample=localPreviewSample({...source,catalogId:local.id,page:1},local);
  assert.equal(sample.count,12);
  assert.equal(sample.items[0].id,'tt2000012');
  assert.equal(sample.hasMore,true);
  assert.equal(local.metas.length,27);
 });
 it('filtro e página são transportados sem URL arbitrária do cliente',async()=>{
  let url;
  await fetchPreviewSample({selection:{...source,genre:'Adventure',page:1, url:'https://evil/manifest.json'},
   provider,fetchImpl:async(u)=>{url=u;return reply([]);}});
  assert.ok(url.startsWith('https://example.com/catalog/'));
  assert.ok(url.includes('genre'));
  assert.ok(url.includes('skip=100'), 'o preview usa janelas Stremio de 100 em vez de skip=12');
  assert.ok(!url.includes('evil'));
 });
});
