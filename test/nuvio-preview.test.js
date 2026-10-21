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
 it('mantém apenas o botão "Prévia no Nuvio" na aba Coleções e abre pasta direto nas abas com grade e skeletons',async()=>{
  const fs=await import('node:fs');
  const appCode=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const previewCode=fs.readFileSync(new URL('../public/nuvio-preview.js',import.meta.url),'utf8');
  assert.ok(appCode.includes('Prévia no Nuvio'),'Deve exibir o botão "Prévia no Nuvio"');
  assert.ok(!appCode.includes('Abrir simulador de TV'),'Não deve manter o slot redundante "Abrir simulador de TV"');
  assert.ok(appCode.includes('open-artwork-studio'),'Deve incluir gatilho para o Estúdio de Capas e Ícones');
  assert.ok(previewCode.includes('Prévia da tela inicial do Nuvio'),'Modal deve exibir título fiel ao vídeo');
  assert.ok(previewCode.includes('nuvio-preview-hero'),'Home deve renderizar o carrossel Hero');
  assert.ok(previewCode.includes('nuvio-preview-tab'),'Pasta deve renderizar abas de fontes horizontais');
  assert.ok(previewCode.includes('nuvio-preview-skeleton-card'),'Grade deve exibir 12 skeletons durante carregamento');
 });
 it('vincula seletores de proporção (16:9, 2:3, 3:4, 1:1) do Artwork Studio ao estado da coleção ou pasta e atualiza tileShape',async()=>{
  const fs=await import('node:fs');
  const appCode=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  await import('../public/app.js');
  const binding=globalThis.ArtworkStudioShapeBinding;
  assert.ok(binding,'ArtworkStudioShapeBinding deve estar exposto para sincronizar proporções');
  assert.equal(binding.normalizeTileShape('16:9'),'LANDSCAPE');
  assert.equal(binding.normalizeTileShape('2:3'),'POSTER');
  assert.equal(binding.normalizeTileShape('3:4'),'PORTRAIT');
  assert.equal(binding.normalizeTileShape('1:1'),'SQUARE');
  assert.equal(binding.tileShapeCssAspectRatio('POSTER'),'2/3');
  assert.equal(binding.tileShapeCssAspectRatio('PORTRAIT'),'3/4');
  assert.equal(binding.tileShapeCssAspectRatio('SQUARE'),'1/1');
  assert.equal(binding.tileShapeCssAspectRatio('LANDSCAPE'),'16/9');

  const folderState={id:'f-test',title:'Destaques',tileShape:'LANDSCAPE'};
  for(const [ratio,expectedShape] of [['16:9','LANDSCAPE'],['2:3','POSTER'],['3:4','PORTRAIT'],['1:1','SQUARE']]){
   const applied=binding.applyTargetTileShape(folderState,ratio,{isGroup:false});
   assert.equal(applied,expectedShape);
   assert.equal(folderState.tileShape,expectedShape);
  }

  const groupState={id:'g-test',title:'Streaming',folders:[{id:'f-sub',title:'Catálogo'}]};
  const groupApplied=binding.applyTargetTileShape(groupState,'2:3',{isGroup:true});
  assert.equal(groupApplied,'POSTER');
  assert.equal(groupState.tileShape,'POSTER');
  assert.equal(groupState.folders[0].tileShape,'POSTER');

  assert.ok(appCode.includes('data-tile-shape='),'Botões de proporção do Studio devem expor data-tile-shape');
  assert.ok(appCode.includes('data-art-ratio='),'Botões de proporção do Studio devem expor data-art-ratio');
 });
});


