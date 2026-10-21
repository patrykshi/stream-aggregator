/* Nuvio Hub — TV Studio. Navegação exploratória, sem mutações ou reprodução.
 * Base: estrutura local em memória e amostras de metadados reais sob demanda. */
(()=>{
'use strict';
const ui={active:false,stage:'home',groupId:null,folderId:null,sourceIndex:0,page:0,
 device:'tv',layout:'modern',analyze:false,art:'published',search:'',loading:false,result:null,
 error:'',titleIndex:0,cache:new Map(),requestSerial:0,controller:null,focusedFolder:null,
 featured:null};
let ctx=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const url=v=>{
 if(typeof v!=='string'||v.length>1800)return '';
 try{const u=new URL(v,location.origin);return u.protocol==='https:'||u.protocol==='http:'&&u.origin===location.origin?u.href:'';}
 catch{return '';}
};
const groups=()=>ctx?.state?.workspace?.collections||[];
const group=()=>groups().find(x=>x.id===ui.groupId);
const folder=()=>group()?.folders?.find(x=>x.id===ui.folderId);
const sources=()=>folder()?.catalogSources||folder()?.sources||[];
const source=()=>sources()[ui.sourceIndex];
const allSources=f=>f?.catalogSources||f?.sources||[];
const imgOf=f=>url(f?.customCoverImageUrl||f?.coverImageUrl||'');
const heroOf=f=>url(f?.heroBackdropUrl||f?.customCoverImageUrl||f?.coverImageUrl||'');
const totalFolders=()=>groups().reduce((n,g)=>n+(g.folders||[]).length,0);
const totalSources=()=>groups().reduce((n,g)=>n+(g.folders||[]).reduce((s,f)=>s+allSources(f).length,0),0);
const resolver=()=>globalThis.NuvioCollectionLinks.createResolver({
 catalogs:ctx.state.workspace.catalogs||[],addons:ctx.state.providers||[],
 loaded:ctx.state.collectionInventory==='ready'
});
const sourceStatus=s=>s?resolver().resolve(s):{status:'missing',label:'Nenhum catálogo',provider:''};
const shape=f=>['POSTER','PORTRAIT'].includes(f?.tileShape)?'poster':f?.tileShape==='SQUARE'?'square':'landscape';
const keyOf=s=>[s?.addonId,s?.type,s?.catalogId||s?.catalog_id,s?.genre||''].join('::')+'|'+ui.page;
function cover(src,format='landscape',fallback='Imagem não configurada'){
 const u=url(src);
 return '<span class="nuvio-preview-art '+esc(format)+'">'+
  (u?'<img src="'+esc(u)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">'+
   '<span class="nuvio-preview-empty" hidden>'+esc(fallback)+'</span>':
   '<span class="nuvio-preview-empty">'+esc(fallback)+'</span>')+'</span>';
}
function poster(item,i){
 const published=ui.result?.decorated?.[i]?.poster;
 return ui.art==='published'&&published||item.poster||'';
}
function abort(){ui.controller?.abort();ui.controller=null;ui.requestSerial++;}
function draw({resetScroll=false,focus=false}={}){
 if(!ui.active||!ctx||ctx.state.view!=='collections')return;
 const active=document.activeElement;
 const old=active?.closest?.('[data-pv-action]');
 const action=old?.dataset.pvAction, id=old?.dataset.id, index=old?.dataset.index, val=old?.dataset.value;
 const searchFocus=active?.matches?.('[data-pv-search]');
 const caret=searchFocus?active.selectionStart:0;
 const scroll=resetScroll?0:document.querySelector('.nuvio-preview-screen')?.scrollTop||0;
 ctx.render();
 const screen=document.querySelector('.nuvio-preview-screen');
 if(screen)screen.scrollTop=scroll;
 if(searchFocus){const node=document.querySelector('[data-pv-search]');if(node){node.focus({preventScroll:true});node.setSelectionRange(caret,caret);}}
 else if(focus&&action){
  const buttons=[...document.querySelectorAll('[data-pv-action]')];
  const match=buttons.find(b=>b.dataset.pvAction===action&&b.dataset.id===id&&b.dataset.index===index&&b.dataset.value===val);
  match?.focus({preventScroll:true});
 }
 syncFeature();
}
function setPage(stage,groupId,folderId,{loadSample=false}={}){
 abort();ui.loading=false;ui.result=null;ui.error='';ui.page=0;ui.titleIndex=0;
 ui.stage=stage;
 if(stage!=='library')ui.search='';
 if(groupId!==undefined)ui.groupId=groupId;
 if(folderId!==undefined)ui.folderId=folderId;
 if(stage==='collection')ui.focusedFolder=group()?.showAllTab?'all':group()?.folders?.[0]?.id||null;
 if(stage==='folder'||stage==='catalog')ui.focusedFolder=ui.folderId;
 if(loadSample&&sources().length){ui.stage='catalog';ui.sourceIndex=0;draw({resetScroll:true});void load();}
 else draw({resetScroll:true});
}
function open(state){
 if(state)ctx.state=state;
 ui.active=true;ui.stage='home';ui.groupId=null;ui.folderId=null;ui.focusedFolder=null;
 ui.sourceIndex=0;ui.page=0;ui.result=null;ui.error='';ui.search='';
 ui.art='published';ui.featured=null;draw({resetScroll:true});
}
function close(){
 abort();ui.active=false;ui.loading=false;ui.result=null;
 if(ctx.state.view==='collections')ctx.render();
}
function back(){
 if(ui.stage==='title'){ui.stage='catalog';draw({focus:true});return;}
 if(ui.stage==='catalog'){setPage('folder');return;}
 if(ui.stage==='folder'){setPage('collection',ui.groupId,null);return;}
 if(ui.stage==='collection'){setPage('home',null,null);return;}
 if(ui.stage==='library'){setPage('home',null,null);return;}
 close();
}
async function load(refresh=false){
 if(ui.stage!=='catalog'||!source())return;
 const cacheKey=keyOf(source());
 if(!refresh&&ui.cache.has(cacheKey)){
  ui.result=ui.cache.get(cacheKey);ui.loading=false;ui.error='';draw();return;
 }
 abort();const request=ui.requestSerial;
 ui.controller=new AbortController();ui.loading=true;ui.result=null;ui.error='';draw();
 const s=source();
 try{
  const res=await fetch('/api/hub/preview/catalog-items',{
   method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
   signal:ui.controller.signal,
   body:JSON.stringify({addonId:s.addonId,type:s.type,catalogId:s.catalogId||s.catalog_id,
     genre:s.genre||'',page:ui.page,refresh})});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Falha ao consultar catálogo.');
  if(request!==ui.requestSerial||!ui.active)return;
  ui.result=data;ui.cache.set(cacheKey,data);
 }catch(e){
  if(request!==ui.requestSerial||e.name==='AbortError')return;
  ui.error=e.message||'O catálogo não pôde ser consultado.';
 }finally{
  if(request===ui.requestSerial){ui.loading=false;draw();}
 }
}
function tile(g,i){
 const first=(g.folders||[])[0],src=url(g.backdropImageUrl)||heroOf(first);
 return '<button type="button" class="nuvio-preview-tile" data-pv-action="collection" data-id="'+esc(g.id)+'"'+
  ' data-pv-feature-title="'+esc(g.title)+'" data-pv-feature-desc="'+(g.folders?.length||0)+' pastas nesta coleção"'+
  ' data-pv-feature-image="'+esc(src)+'" aria-label="Abrir coleção '+esc(g.title)+'">'+
  cover(src,'landscape','Sem capa')+
  '<span class="nuvio-preview-tile-info"><strong>'+esc(g.title)+'</strong>'+
  '<small>'+(g.folders?.length||0)+' pastas <span aria-hidden="true">↗</span></small></span></button>';
}
function folderCard(g,f,i){
 const image=imgOf(f);
 return '<button type="button" class="nuvio-preview-folder-card '+(g.focusGlowEnabled?'with-glow':'')+
  '" data-pv-action="folder" data-group-id="'+esc(g.id)+'" data-id="'+esc(f.id)+'"'+
  ' data-pv-feature-title="'+esc(f.title)+'" data-pv-feature-desc="'+allSources(f).length+' catálogos · '+esc(g.title)+'"'+
  ' data-pv-feature-image="'+esc(heroOf(f))+'" aria-label="Abrir pasta '+esc(f.title)+'">'+
  cover(image,shape(f),'Capa não configurada')+
  '<span class="nuvio-preview-folder-label">'+(f.hideTitle?'<span class="sr-only">'+esc(f.title)+'</span>':'<strong>'+esc(f.title)+'</strong>')+
  '<small>'+allSources(f).length+' fontes</small></span></button>';
}
function collectionRail(g){
 const folders=g.folders||[];
 return '<section class="nuvio-preview-rail-block" aria-label="Coleção '+esc(g.title)+'">'+
  '<div class="nuvio-preview-rail-heading"><div><span class="nuvio-preview-overline">COLEÇÃO</span>'+
   '<h3>'+esc(g.title)+'</h3></div>'+
   '<button data-pv-action="collection" data-id="'+esc(g.id)+'">Ver todas <span aria-hidden="true">→</span></button></div>'+
  '<div class="nuvio-preview-rail" data-pv-rail>'+folders.slice(0,12).map((f,i)=>folderCard(g,f,i)).join('')+
  (folders.length>12?'<button class="nuvio-preview-more" data-pv-action="collection" data-id="'+esc(g.id)+'">+'+
    (folders.length-12)+' pastas <span>Ver coleção →</span></button>':'')+'</div></section>';
}
function banner({eyebrow,title,subtitle,image,button=''}){return '<section class="nuvio-preview-hero">'+
  (url(image)?'<img class="nuvio-preview-hero-image" src="'+esc(url(image))+'" alt="">':'')+
  '<div class="nuvio-preview-hero-shade"></div><div class="nuvio-preview-hero-copy">'+
  '<span class="nuvio-preview-overline">'+esc(eyebrow)+'</span>'+
  '<h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p>'+button+'</div></section>';}
function feature(stage){
 const g=group(),f=folder(),s=source(),match=sourceStatus(s);
 if(stage==='home'||stage==='library'){
  const first=groups()[0],f0=first?.folders?.[0];
  return {eyebrow:'SUA BIBLIOTECA · PRÉ-VISUALIZAÇÃO',
   title:first?.title||'Suas coleções no Nuvio',
   subtitle:first?first.folders.length+' pastas · Organizadas por você':
    'Comece criando uma coleção no editor',
   image:url(first?.backdropImageUrl)||heroOf(f0)};
 }
 if(stage==='collection')return {eyebrow:'MINHAS COLEÇÕES',title:g?.title||'Coleção',
  subtitle:(g?.folders?.length||0)+' pastas · '+(g?.viewMode==='ROWS'?'Organização por linhas':'Organização por abas'),
  image:url(g?.backdropImageUrl)||heroOf(g?.folders?.[0])};
 if(stage==='folder')return {eyebrow:'PASTA',title:f?.title||'Pasta',
  subtitle:allSources(f).length+' catálogos vinculados',image:heroOf(f)};
 if(stage==='title'){
  const item=ui.result?.items?.[ui.titleIndex];
  return {eyebrow:'DETALHES',title:item?.name||'Título',
   subtitle:(item?.type==='series'?'Série':'Filme')+(item?.year?' · '+item.year:''),
   image:item?.background||poster(item||{},ui.titleIndex)};
 }
 const first=ui.result?.items?.[0];
 return {eyebrow:'CATÁLOGO · '+(s?.type==='series'?'SÉRIES':'FILMES'),
  title:ui.layout==='modern'&&first?.name||match.label||'Explorar catálogo',
  subtitle:ui.layout==='modern'&&first?
   (first.description||'Títulos obtidos da fonte configurada.'):
   (match.provider||'Selecione um cartaz para inspecionar os metadados'),
  image:ui.layout==='modern'&&first?(first.background||poster(first,0)):heroOf(f)};
}
function home(){
 const ordered=[...groups()].sort((a,b)=>Number(!!b.pinToTop)-Number(!!a.pinToTop));
 const f=feature('home');
 return banner({...f,button:ordered.length?'<button class="nuvio-preview-hero-cta" data-pv-action="collection" data-id="'+esc(ordered[0].id)+'">Explorar coleção <span>→</span></button>':''})+
  '<div class="nuvio-preview-rail-heading nuvio-preview-index-heading"><div><span class="nuvio-preview-overline">HOME / COLEÇÕES CONFIGURADAS</span>'+
  '<h3>Suas coleções no Nuvio <span>'+ordered.length+'</span></h3></div>'+
  '<button data-pv-action="library">Abrir biblioteca →</button></div>'+
  ordered.map(collectionRail).join('');
}
function library(){
 const found=groups().filter(g=>(g.title+' '+(g.folders||[]).map(f=>f.title).join(' ')).toLocaleLowerCase('pt-BR').includes(ui.search.toLocaleLowerCase('pt-BR')));
 return banner({eyebrow:'BIBLIOTECA',title:'Tudo o que você organizou',
  subtitle:groups().length+' coleções · '+totalFolders()+' pastas · '+totalSources()+' catálogos vinculados',
  image:feature('home').image})+
  '<div class="nuvio-preview-library-grid">'+found.map(tile).join('')+'</div>'+
  (found.length?'':'<div class="nuvio-preview-message">Nenhuma coleção corresponde à busca.</div>');
}
function collectionView(){
 const g=group();if(!g)return '<div class="nuvio-preview-message">Coleção indisponível.</div>';
 const folders=g.folders||[];
 const selected=ui.focusedFolder==='all'&&g.showAllTab?null:folders.find(f=>f.id===ui.focusedFolder)||folders[0];
 const rows=g.viewMode==='ROWS'||g.viewMode==='HORIZONTAL';
 const content=rows?folders.map(f=>'<div class="nuvio-preview-collection-folder-row">'+
  '<div class="nuvio-preview-rail-heading"><div><h3>'+esc(f.title)+'</h3><small>'+allSources(f).length+' fontes</small></div>'+
  '<button data-pv-action="folder" data-id="'+esc(f.id)+'">Abrir →</button></div>'+
  '<div class="nuvio-preview-rail">'+folderCard(g,f,0)+'</div></div>').join(''):
  '<div class="nuvio-preview-tabs" role="group" aria-label="Pastas da coleção">'+(g.showAllTab?'<button class="nuvio-preview-tab '+(ui.focusedFolder==='all'?'active':'')+'" data-pv-action="focus-folder" data-id="all" aria-pressed="'+(ui.focusedFolder==='all')+'">Todas</button>':'')+folders.map((f,i)=>
   '<button type="button" class="nuvio-preview-tab '+(f.id===selected?.id?'active':'')+
   '" data-pv-action="focus-folder" data-id="'+esc(f.id)+'" aria-pressed="'+(f.id===selected?.id)+'">'+
   esc(f.title)+'</button>').join('')+'</div>'+
  (selected?'<div class="nuvio-preview-feature-folder"><div>'+cover(imgOf(selected),shape(selected))+'</div>'+
   '<div><span class="nuvio-preview-overline">PASTA '+(folders.indexOf(selected)+1)+' / '+folders.length+'</span>'+
   '<h3>'+esc(selected.title)+'</h3><p>'+allSources(selected).length+' catálogos configurados. Abra a pasta para inspecionar as abas e os cartazes reais.</p>'+
   '<button class="nuvio-preview-hero-cta" data-pv-action="folder" data-id="'+esc(selected.id)+'">Abrir pasta →</button></div></div>':'')+
  '<div class="nuvio-preview-rail-heading"><h3>Pastas desta coleção</h3></div>'+
  '<div class="nuvio-preview-rail">'+folders.map((f,i)=>folderCard(g,f,i)).join('')+'</div>';
 return banner(feature('collection'))+
  '<div class="nuvio-preview-mode-hint">'+(rows?'Visualização por linhas':'Visualização por abas')+
  ' · configuração de '+esc(g.title)+'</div>'+content;
}
function folderView(){
 const f=folder();if(!f)return '<div class="nuvio-preview-message">Pasta não encontrada.</div>';
 const links=allSources(f);
 return banner(feature('folder'))+
  '<div class="nuvio-preview-rail-heading"><h3>Abas / catálogos nesta pasta</h3><span>'+
    links.length+' fontes · ordem atual</span></div>'+
  '<div class="nuvio-preview-source-cards">'+links.map((s,i)=>{
   const status=sourceStatus(s);
   return '<button class="nuvio-preview-source-card" data-pv-action="open-source" data-index="'+i+'">'+
    '<span class="nuvio-preview-source-order">'+String(i+1).padStart(2,'0')+'</span>'+
    '<span><strong>'+esc(status.label)+'</strong>'+
    '<small>'+esc(status.provider||s.addonId)+' · '+(s.type==='series'?'Série':'Filme')+'</small></span>'+
    '<span class="nuvio-preview-dot '+status.status+'" aria-label="'+esc(status.status)+'"></span><b aria-hidden="true">→</b></button>';
  }).join('')+'</div>'+
  (!links.length?'<div class="nuvio-preview-message">Pasta vazia. Vincule um catálogo no editor para aparecer no Nuvio.</div>':'');
}
function mediaCards(){
 if(ui.loading)return '<div class="nuvio-preview-loading" role="status"><span class="spinner"></span><span>Buscando títulos reais na origem…</span></div>';
 if(ui.error)return '<div class="nuvio-preview-message is-warning" role="alert">'+esc(ui.error)+
  '<button data-pv-action="reload">Tentar novamente ↻</button></div>';
 if(!ui.result)return '<div class="nuvio-preview-message">Selecione um catálogo para carregar seus títulos.</div>';
 if(!ui.result.items?.length)return '<div class="nuvio-preview-message is-warning">O catálogo respondeu sem títulos nesta amostra.</div>';
 return '<div class="nuvio-preview-poster-rail">'+ui.result.items.map((item,i)=>
  '<button class="nuvio-preview-title" data-pv-action="title" data-index="'+i+'"'+
  ' data-pv-feature-title="'+esc(item.name)+'" data-pv-feature-desc="'+esc(item.description||'')+'"'+
  ' data-pv-feature-image="'+esc(item.background||poster(item,i))+'">'+
  cover(poster(item,i),'poster','Cartaz ausente')+
  '<strong>'+esc(item.name)+'</strong><small>'+(item.type==='series'?'Série':'Filme')+
  (item.year?' · '+esc(item.year):'')+'</small></button>').join('')+'</div>'+
  '<div class="nuvio-preview-pagination">'+
  '<button data-pv-action="previous" '+(ui.page===0?'disabled':'')+'>← Amostra anterior</button>'+
  '<span>Amostra '+(ui.page+1)+' · '+ui.result.items.length+' cartazes · até '+ui.result.sampleStride+
  ' posições por intervalo</span>'+
  '<button data-pv-action="next" '+(!ui.result.hasMore?'disabled':'')+'>Próxima amostra →</button></div>'+
  (ui.result.sampleStride>ui.result.items.length?
  '<p class="nuvio-preview-sample-note">Esta é uma amostra visual da fonte, não a listagem completa dos títulos intermediários.</p>':'');
}
function catalogView(){
 const s=source(),f=folder();if(!s)return folderView();
 const ref=sourceStatus(s);
 return banner(feature('catalog'))+
  '<div class="nuvio-preview-mode-hint">Pasta: '+esc(f?.title||'')+
   ' <span>·</span> '+(s.type==='series'?'Séries':'Filmes')+' <span>·</span> '+
   esc(ref.provider||'Fonte não identificada')+'</div>'+
  '<div class="nuvio-preview-tabs" role="group" aria-label="Catálogos da pasta">'+sources().map((row,i)=>{
   const r=sourceStatus(row);
   return '<button class="nuvio-preview-tab '+(i===ui.sourceIndex?'active':'')+
    '" aria-pressed="'+(i===ui.sourceIndex)+'" data-pv-action="source" data-index="'+i+'">'+
    esc(r.label)+' <span class="nuvio-preview-dot '+r.status+'"></span></button>';
  }).join('')+'</div>'+
  '<div class="nuvio-preview-rail-heading"><div><span class="nuvio-preview-overline">AMOSTRA DO ADDON</span>'+
  '<h3>'+esc(ref.label)+'</h3></div>'+
  '<button data-pv-action="reload">Atualizar títulos ↻</button></div>'+mediaCards();
}
function titleView(){
 const item=ui.result?.items?.[ui.titleIndex];
 if(!item)return '<div class="nuvio-preview-message">Título não disponível nesta amostra.</div>';
 return banner(feature('title'))+'<div class="nuvio-preview-title-detail">'+
  cover(poster(item,ui.titleIndex),'poster','Sem cartaz')+
  '<div><span class="nuvio-preview-overline">FICHA DO TÍTULO · SEM REPRODUÇÃO</span>'+
  '<h3>'+esc(item.name)+'</h3><p>'+(item.type==='series'?'Série':'Filme')+
  (item.year?' · '+esc(item.year):'')+'</p><p>'+esc(item.description||'Sinopse não fornecida pelo addon.')+
  '</p><button class="nuvio-preview-hero-cta" data-pv-action="back">← Voltar aos cartazes</button></div></div>';
}
function results(){
 if(!ui.search.trim())return null;
 const q=ui.search.trim().toLocaleLowerCase('pt-BR');
 const filtered=groups().flatMap(g=>(g.folders||[]).filter(f=>(g.title+' '+f.title).toLocaleLowerCase('pt-BR').includes(q)).map(f=>({g,f})));
 return '<div class="nuvio-preview-search-results">'+
  '<div class="nuvio-preview-rail-heading"><h3>Resultados: '+esc(ui.search)+'</h3><span>'+filtered.length+' pastas</span></div>'+
  '<div class="nuvio-preview-library-grid">'+filtered.slice(0,50).map(x=>folderCard(x.g,x.f,0)).join('')+'</div>'+
  (!filtered.length?'<div class="nuvio-preview-message">Nenhuma pasta encontrada. Ajuste a busca.</div>':'')+
  '</div>';
}
function crumbs(){
 const g=group(),f=folder();
 return '<div class="nuvio-preview-trail"><button data-pv-action="home">Início</button>'+
  (g?'<span>›</span><button data-pv-action="collection" data-id="'+esc(g.id)+'">'+esc(g.title)+'</button>':'')+
  (f?'<span>›</span><button data-pv-action="folder" data-id="'+esc(f.id)+'">'+esc(f.title)+'</button>':'')+
  (ui.stage==='catalog'||ui.stage==='title'?'<span>›</span><b>'+esc(sourceStatus(source()).label)+'</b>':'')+'</div>';
}
function audit(){
 const g=group(),f=folder(),s=source(),info=s?sourceStatus(s):null,issues=[];
 if(g&&!(g.folders||[]).length)issues.push('Coleção sem pastas.');
 if(f&&!allSources(f).length)issues.push('Pasta sem catálogos.');
 if(info?.status==='missing')issues.push('Origem não reconhecida: '+info.reason);
 if(ui.error)issues.push('Falha na consulta: '+ui.error);
 if(ui.result?.status==='empty')issues.push('O addon respondeu sem títulos.');
 if(ui.result?.pageUnsupported)issues.push('O addon repetiu a primeira amostra ao paginar.');
 if(ui.result?.missingPosters)issues.push(ui.result.missingPosters+' cartazes ausentes nesta amostra.');
 if(ui.result?.duplicates)issues.push(ui.result.duplicates+' referências repetidas nesta amostra.');
 if(ui.art==='published'&&ui.result?.items?.length&&ui.result.items.every((x,i)=>x.poster===ui.result.decorated?.[i]?.poster))
  issues.push('Nenhuma alteração ERDB detectada nesta amostra.');
 return '<aside class="nuvio-preview-inspector" aria-label="Análise da configuração">'+
  '<div class="nuvio-preview-inspector-top"><span class="nuvio-preview-overline">INSPEÇÃO</span>'+
  '<h3>O que será exibido?</h3><p>Confira a estrutura e os dados realmente consultados.</p></div>'+
  '<div class="nuvio-preview-inspector-stats"><span><b>'+groups().length+'</b>Coleções</span>'+
  '<span><b>'+totalFolders()+'</b>Pastas</span><span><b>'+totalSources()+'</b>Vínculos</span></div>'+
  (g?'<div class="nuvio-preview-audit-section"><b>Coleção</b><span>'+esc(g.title)+'</span></div>':'')+
  (f?'<div class="nuvio-preview-audit-section"><b>Pasta</b><span>'+esc(f.title)+'</span>'+
    '<small>Formato: '+esc(f.tileShape||'LANDSCAPE')+'</small></div>':'')+
  (info?'<div class="nuvio-preview-audit-section"><b>Catálogo</b><span>'+esc(info.label)+'</span>'+
   '<small>'+esc(info.provider||s.addonId)+'</small>'+
   '<small>Manifesto: '+(info.status==='ready'?'reconhecido':info.status==='pending'?'não verificado':'não localizado')+'</small>'+
   '<small>Títulos consultados: '+(ui.result?.count??'não consultados')+'</small>'+
   '<small>Resposta: '+(ui.result?ui.result.durationMs+' ms':'—')+'</small></div>':'')+
  (issues.length?'<div class="nuvio-preview-issues"><strong>Pontos de atenção</strong>'+issues.map(s=>
    '<p>'+esc(s)+'</p>').join('')+'</div>':
    '<div class="nuvio-preview-ok">Sem problemas detectados na seleção. A reprodução não foi testada.</div>')+
  '<button data-pv-action="edit-selection" class="nuvio-preview-inspect-edit">Abrir no editor →</button>'+
  '<p class="nuvio-preview-audit-footer">Prévia de estrutura e metadados. O Nuvio pode variar conforme versão e tema.</p></aside>';
}
function render(){
 if(!ui.active||!ctx)return '';
 const filtered=results();
 const section=filtered||({home,library,collection:collectionView,folder:folderView,catalog:catalogView,title:titleView}[ui.stage]||home)();
 const status=ctx.state.dirty?'Rascunho com mudanças não salvas':'Sincronizado com o editor';
 return '<div class="nuvio-preview-root" data-preview-active="true">'+
  '<div class="nuvio-preview-toolbar">'+
   '<button class="nuvio-preview-back-editor" data-pv-action="exit">← Voltar ao editor</button>'+
   '<div class="nuvio-preview-toolbar-title"><span class="nuvio-preview-overline">COLLECTION STUDIO / SIMULAÇÃO</span>'+
   '<strong>Experiência Nuvio <span>TV</span></strong><small>'+esc(status)+'</small></div>'+
   '<div class="nuvio-preview-toolbar-controls" role="group" aria-label="Visualização">'+
    '<button data-pv-action="device" data-value="tv" aria-pressed="'+(ui.device==='tv')+'">▣ TV</button>'+
    '<button data-pv-action="device" data-value="mobile" aria-pressed="'+(ui.device==='mobile')+'">▯ Celular</button>'+
    '<span class="nuvio-preview-control-separator"></span>'+
    '<button data-pv-action="layout" data-value="modern" aria-pressed="'+(ui.layout==='modern')+'">Moderno</button>'+
    '<button data-pv-action="layout" data-value="classic" aria-pressed="'+(ui.layout==='classic')+'">Clássico</button>'+
    '<button data-pv-action="layout" data-value="grid" aria-pressed="'+(ui.layout==='grid')+'">Grade</button>'+
    '<button data-pv-action="analyze" aria-pressed="'+ui.analyze+'">◉ Analisar</button>'+
    '<button data-pv-action="art" aria-pressed="'+(ui.art==='published')+'" title="Alternar capas originais / publicadas">'+
     (ui.art==='published'?'Capas publicadas':'Capas originais')+'</button>'+
    '<button data-pv-action="fullscreen" title="Abrir TV em tela cheia" aria-label="Tela cheia">⛶</button>'+
   '</div></div>'+
   '<div class="nuvio-preview-context"><span class="nuvio-preview-draft-indicator"></span>'+
    'Prévia com '+groups().length+' coleções · '+totalFolders()+' pastas · '+totalSources()+' fontes'+
    '<span>· alterações aqui não modificam o Nuvio</span></div>'+
   '<div class="nuvio-preview-layout '+(ui.analyze?'with-inspector':'')+'">'+
    '<div class="nuvio-preview-device '+esc(ui.device)+' nuvio-preview-layout-'+esc(ui.layout)+'">'+
     '<div class="nuvio-preview-screen" tabindex="-1" aria-label="Simulação do aplicativo Nuvio">'+
      '<div class="nuvio-preview-tv-nav"><strong class="nuvio-preview-brand">nuvio<span>●</span></strong>'+
       '<button data-pv-action="home" class="'+(ui.stage==='home'?'active':'')+'">⌂ Início</button>'+
       '<button data-pv-action="library" class="'+(ui.stage==='library'?'active':'')+'">▦ Coleções</button>'+
       '<span class="nuvio-preview-tv-spacer"></span>'+
       '<span class="nuvio-preview-screen-caption">SIMULAÇÃO · NÃO É O PLAYER</span>'+
      '</div>'+
      '<div class="nuvio-preview-body" data-preview-step="'+esc(ui.stage)+'">'+
       crumbs()+section+'</div>'+
      '<div class="nuvio-preview-tv-footer"><span>◂ ▸ Navegar · Enter selecionar · Esc voltar</span>'+
       '<button data-pv-action="back">← Voltar</button></div>'+
     '</div></div>'+(ui.analyze?audit():'')+'</div>'+
   '<div class="nuvio-preview-underbar"><label>⌕ <input data-pv-search type="search" aria-label="Buscar coleção ou pasta" '+
    'placeholder="Buscar coleções ou pastas..." value="'+esc(ui.search)+'"></label>'+
    '<span>Modo '+(ui.layout==='modern'?'Moderno: destaque acompanha o foco':ui.layout==='grid'?'Grade: cartazes organizados em colunas':'Clássico: destaque fixo')+
    ' · '+(ui.device==='tv'?'TV 16:9':'Celular')+'</span>'+
   '</div></div>';
}
function syncFeature(target=document.activeElement){
 if(ui.layout!=='modern')return;
 const active=target?.closest?.('[data-pv-feature-title]');
 if(!active||!active.closest('.nuvio-preview-screen'))return;
 const hero=document.querySelector('.nuvio-preview-hero');
 if(!hero)return;
 const title=hero.querySelector('h2'),sub=hero.querySelector('p');
 if(title)title.textContent=active.dataset.pvFeatureTitle||title.textContent;
 if(sub&&active.dataset.pvFeatureDesc)sub.textContent=active.dataset.pvFeatureDesc;
 const src=url(active.dataset.pvFeatureImage);
 const previous=hero.querySelector('.nuvio-preview-hero-image');
 if(src){if(previous)previous.src=src;else{
   const image=document.createElement('img');image.className='nuvio-preview-hero-image';
   image.alt='';image.src=src;hero.prepend(image);}}
}
function handle(action,target){
 switch(action){
  case 'exit':return close();
  case 'home':return setPage('home',null,null);
  case 'library':return setPage('library',null,null);
  case 'collection':return setPage('collection',target.dataset.id,null);
  case 'focus-folder':ui.focusedFolder=target.dataset.id;return draw({focus:true});
  case 'folder':return setPage('folder',target.dataset.groupId||ui.groupId,target.dataset.id);
  case 'open-source':ui.sourceIndex=Number(target.dataset.index);return setPage('catalog',ui.groupId,ui.folderId,{loadSample:true});
  case 'source':ui.sourceIndex=Number(target.dataset.index);ui.page=0;ui.result=null;ui.error='';draw({focus:true});return void load();
  case 'reload':return void load(true);
  case 'previous':if(ui.page>0)ui.page--;ui.result=null;return void load();
  case 'next':if(!ui.result?.hasMore)return;ui.page++;ui.result=null;return void load();
  case 'title':ui.titleIndex=Number(target.dataset.index);ui.stage='title';return draw({resetScroll:true});
  case 'back':return back();
  case 'device':ui.device=target.dataset.value==='mobile'?'mobile':'tv';return draw({focus:true});
  case 'layout':ui.layout=['modern','classic','grid'].includes(target.dataset.value)?target.dataset.value:'modern';return draw({focus:true});
  case 'analyze':ui.analyze=!ui.analyze;return draw({focus:true});
  case 'art':ui.art=ui.art==='published'?'original':'published';return draw({focus:true});
  case 'fullscreen':{
   const device=document.querySelector('.nuvio-preview-device');
   if(document.fullscreenElement)void document.exitFullscreen();
   else if(device?.requestFullscreen)void device.requestFullscreen().catch(()=>{});
   return;
  }
  case 'edit-selection':
   if(ui.groupId)ctx.state.selectedGroup=ui.groupId;
   ctx.state.selectedFolder=ui.folderId||ui.focusedFolder||null;
   return close();
 }
}
function spatialNav(e){
 const focus=document.activeElement;
 if(!focus||!focus.closest?.('.nuvio-preview-screen'))return;
 const scope=document.querySelector('.nuvio-preview-screen');
 const candidates=[...scope.querySelectorAll('button:not([disabled])')].filter(el=>{
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0&&!el.hidden;
 });
 const center=el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
 const current=center(focus),horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight';
 const sign=e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1;
 const possibilities=candidates.filter(x=>x!==focus).map(el=>{
  const c=center(el),dx=c.x-current.x,dy=c.y-current.y;
  const forward=(horizontal?dx:dy)*sign;
  if(forward<8)return null;
  const parallel=Math.abs(horizontal?dy:dx);
  return {el,score:forward+parallel*2.3};
 }).filter(Boolean).sort((a,b)=>a.score-b.score);
 if(possibilities[0]){
  e.preventDefault();possibilities[0].el.focus({preventScroll:true});
  possibilities[0].el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
 }
}
function install(state,renderApp){
 ctx={state,render:renderApp};
 document.getElementById('app').addEventListener('click',e=>{
  const el=e.target.closest('[data-pv-action]');if(!ui.active||!el)return;
  e.preventDefault();e.stopImmediatePropagation();handle(el.dataset.pvAction,el);
 },true);
 document.getElementById('app').addEventListener('input',e=>{
  if(!ui.active||!e.target.matches('[data-pv-search]'))return;
  ui.search=e.target.value;draw();
 },true);
 document.addEventListener('focusin',e=>{
  if(ui.active&&e.target.closest?.('.nuvio-preview-screen'))syncFeature(e.target);
 },true);
 document.getElementById('app').addEventListener('pointerover',e=>{
  if(ui.active&&e.target.closest?.('.nuvio-preview-screen'))syncFeature(e.target);
 },true);
 document.addEventListener('keydown',e=>{
  if(!ui.active||!document.getElementById('modal').hidden)return;
  if(e.key==='Escape'||e.key==='Backspace'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){
   if(document.fullscreenElement&&e.key==='Escape')return;
   e.preventDefault();back();return;
  }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))spatialNav(e);
 },true);
}
globalThis.NuvioPreview={install,open,close,render,isActive:()=>ui.active};
})();