(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BASE='https://stream.patrykrocha.com';
const EXPORT=BASE+'/collections.json';
const MANIFEST=BASE+'/manifest.json';
const BRIDGE_ID='community.streamaggregator.unified';
const NAMES={overview:'Visão geral',addons:'Addons',catalogs:'Catálogos',collections:'Coleções',monitor:'Monitoramento',publish:'Publicar no Nuvio',settings:'Configurações'};
const state={view:'overview',editable:false,workspace:{revision:0,collections:[],catalogs:[]},profile:{addons:[],filters:{}},providers:[],monitor:null,
 selectedGroup:null,selectedFolder:null,filter:'all',search:'',dirty:false,ready:false,addonFilter:'all',addonBusy:false,openAddons:new Set(),openCatalogs:new Set(),catalogPage:0,catalogBusy:false,settings:null,settingsError:'',collectionInventory:'idle',collectionInventoryError:''};
let toastTimeout;
function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3800);}
async function request(url,init={}){
 const r=await fetch(url,{cache:'no-store',...init,headers:{...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 let body;try{body=await r.json();}catch{body=null;}
 if(!r.ok){
  const error=Error(body?.error||('Falha HTTP '+r.status));
  if(['movie','series'].includes(body?.suggestedType))error.suggestedType=body.suggestedType;
  throw error;
 }
 return body;
}
function uuid(prefix='studio'){
 return prefix+'_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2,10)).replace(/-/g,'_');
}
function writable(){if(state.editable)return true;notify('Para editar sem token, abra http://127.0.0.1:7001 no computador.');return false;}
function markDirty(){state.dirty=true;updateChrome();}
function updateChrome(){
 $('saveButton').disabled=!state.editable||!state.dirty;
 $('saveHint').textContent=state.dirty?'Alterações não salvas':'';
 $('editAccess').textContent=state.editable?'● Edição local, sem senha':'◉ Acesso público: leitura';
 $('navAddonCount').textContent=state.profile.addons?.length||0;
 $('navCatalogCount').textContent=state.workspace.catalogs.length;
 $('navCollectionCount').textContent=state.workspace.collections.length;
 $('viewLabel').textContent=NAMES[state.view];
 document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
}
function groups(){return state.workspace.collections;}
function catalogs(){return state.workspace.catalogs;}
function group(){return groups().find(x=>x.id===state.selectedGroup);}
function folder(){return group()?.folders?.find(f=>f.id===state.selectedFolder);}
function editableSources(f){
 if(!Array.isArray(f.catalogSources)){
   f.catalogSources=Array.isArray(f.sources)?structuredClone(f.sources):[];
   delete f.sources;
 }
 return f.catalogSources;
}
function paginateItems(items,page,pageSize){
 const totalPages=Math.max(1,Math.ceil(items.length/pageSize));
 const safePage=Math.max(0,Math.min(page,totalPages-1));
 const offset=safePage*pageSize;
 return {page:safePage,totalPages,offset,slice:items.slice(offset,offset+pageSize)};
}
function renderPagerButtons({page,totalPages,attr,summaryText='',prevLabel='← Anterior',nextLabel='Próxima →',includeMiddlePage=false}){
 return '<span>'+summaryText+'</span><div>'+
  '<button type="button" '+attr+'="-1" '+(page===0?'disabled':'')+'>'+prevLabel+'</button>'+
  (includeMiddlePage?'<span>Página '+(page+1)+' de '+totalPages+'</span>':'')+
  '<button type="button" '+attr+'="1" '+(page>=totalPages-1?'disabled':'')+'>'+nextLabel+'</button></div>';
}
function sourceKey(s){return [s.addonId,s.type,s.catalogId||s.catalog_id,s.genre||''].join('::');}
function collectionResolver(){
 const ready=state.collectionInventory==='ready';
 return globalThis.NuvioCollectionLinks.createResolver({
  catalogs:catalogs(),addons:state.providers,loaded:ready
 });
}
async function refreshCollectionInventory(force=false){
 if(state.collectionInventory==='loading')return;
 if(!force&&state.collectionInventory==='ready')return;
 state.collectionInventory='loading';state.collectionInventoryError='';
 if(state.view==='collections'&&!state.collectionDragging)render();
 try{
  const payload=await request('/api/hub/provider-inventory'+(force?'?refresh=1':''));
  state.providers=payload.addons||[];
  state.collectionInventory='ready';
 }catch(e){
  state.collectionInventory='error';state.collectionInventoryError=e.message;
 }
 if(state.view==='collections'&&!state.collectionDragging)render();
}
function detail(s){const c=catalogs().find(c=>c.type===s.type&&c.id===s.catalogId&&(c.addonId||'nuvio.studio')===s.addonId);return c?.name||s.title||s.catalogName||s.catalogId;}
function makeBtn(label,action,cls='btn btn-subtle',extra=''){return `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;}
const pen=(id,value,placeholder='')=>`<input class="search" id="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
const textarea=(id,value='',rows=7)=>`<textarea id="${id}" rows="${rows}">${esc(value)}</textarea>`;
const select=(id,options,chosen)=>`<select id="${id}">${options.map(([v,name])=>`<option value="${esc(v)}" ${v===chosen?'selected':''}>${esc(name)}</option>`).join('')}</select>`;
const cap=(name,ok)=>`<span class="cap ${ok?'on':''}">${esc(name)}</span>`;
function addonInitials(name){
 const parts=String(name||'').replace(/\([^)]*\)/g,' ').trim().split(/\s+/).filter(Boolean);
 const letters=parts.length>1
  ? parts.slice(0,2).map(x=>Array.from(x)[0]||'').join('')
  : Array.from(parts[0]||'?').slice(0,2).join('');
 return letters.toLocaleUpperCase('pt-BR');
}
function confirmLoss(){return !state.dirty||confirm('Você tem alterações não salvas. Descartá-las?');}
function navigate(view){
 if(globalThis.NuvioPreview?.isActive())globalThis.NuvioPreview.close();
 if(!(view in NAMES))view='overview';
 state.view=view;
 history.replaceState(null,'','/?view='+encodeURIComponent(view));
 state.search='';render();
 if(view==='settings')void loadHubSettings();
 if(view==='collections')void refreshCollectionInventory();
}
function showModal(title,body,onSubmit,{confirmText='Confirmar',danger=false}={}){
 document.querySelector('#modal .modal')?.classList.remove('catalog-builder-modal');
 $('modalTitle').textContent=title;
 $('modalContent').innerHTML=body;
 $('modalActions').innerHTML='<button class="btn btn-ghost" id="modalCancel">Cancelar</button>'+
  `<button class="btn ${danger?'btn-danger':'btn-primary'}" id="modalSubmit">${esc(confirmText)}</button>`;
 $('modal').hidden=false;$('modal').setAttribute('aria-hidden','false');
 $('modalCancel').onclick=closeModal;
 $('modalSubmit').onclick=async()=>{
  const b=$('modalSubmit');b.disabled=true;
  try{const done=await onSubmit();if(done!==false)closeModal();}
  catch(err){notify(err.message);}
  finally{b.disabled=false;}
 };
}
function closeModal(){$('modal').hidden=true;$('modal').setAttribute('aria-hidden','true');}
function mandatory(id,label){const v=$(id)?.value.trim();if(!v)throw Error('Informe '+label);return v;}
async function initial(){
 try{
  const [access,profile,workspace]=await Promise.all([
    request('/api/hub/access'),request('/api/profiles/main'),request('/api/hub/workspace')
  ]);
  state.editable=access.canEdit;
  state.profile=profile.profile?.config||{addons:[],filters:{}};
  state.workspace=workspace;
  state.selectedGroup=groups()[0]?.id||null;
  state.ready=true;
  state.view=new URLSearchParams(location.search).get('view')||'overview';
  if(!(state.view in NAMES))state.view='overview';
  updateChrome();render();
  if(state.view==='settings')void loadHubSettings();
  if(state.view==='collections')void refreshCollectionInventory();
  // Monitor verifica manifestos no servidor a cada 5 min, painel consulta
  // o último resultado a cada 25 s enquanto estiver na aba.
  void refreshAddonMonitor();
 }catch(e){$('app').innerHTML='<div class="empty"><b>Não foi possível abrir o Hub</b><span>'+esc(e.message)+'</span>'+makeBtn('Tentar novamente','reload')+'</div>';}
}
async function reload(){
 if(!confirmLoss())return;
 const [profile,workspace]=await Promise.all([request('/api/profiles/main'),request('/api/hub/workspace')]);
 state.profile=profile.profile.config;state.workspace=workspace;state.dirty=false;
 if(!groups().some(x=>x.id===state.selectedGroup))state.selectedGroup=groups()[0]?.id||null;
 if(!group()?.folders?.some(x=>x.id===state.selectedFolder))state.selectedFolder=null;
 render();notify('Dados atualizados.');
}
async function save(){
 if(!writable()||!state.dirty)return;
 const b=$('saveButton');b.disabled=true;
 try{
  const body={revision:state.workspace.revision,catalogs:catalogs(),collections:groups()};
  const result=await request('/api/hub/workspace',{method:'PUT',body:JSON.stringify(body)});
  state.workspace.revision=result.revision;state.dirty=false;updateChrome();
  notify('Alterações salvas! JSON de coleções atualizado para o Nuvio.');
 }catch(e){notify('Erro ao salvar: '+e.message);}
 finally{updateChrome();}
}
function pageTitle(label,title,subtitle,buttons=''){
 return `<div class="page-title"><p class="eyebrow">${esc(label)}</p><div class="section-head"><h1>${esc(title)}</h1><div class="actions">${buttons}</div></div><p>${esc(subtitle)}</p></div>`;
}
function render(){
 if(!state.ready)return;
 updateChrome();
 const output={
  overview:renderOverview,addons:renderAddons,catalogs:renderCatalogs,
  collections:renderCollections,monitor:renderMonitor,publish:renderPublish,
  settings:renderSettings
 };
 $('app').innerHTML=state.view==='collections'&&globalThis.NuvioPreview?.isActive()?
  globalThis.NuvioPreview.render():output[state.view]();
}
function renderOverview(){
 const add=state.profile.addons||[];
 const monitorItems=state.monitor?.items||[];
 const working=add.filter((a,index)=>{
   const item=monitorItems[index];
   return item?item.effectiveEnabled:a.enabled!==false;
 });
 const total=working.length;
 const folders=groups().reduce((v,g)=>v+(g.folders?.length||0),0);
 return pageTitle('NUVIO HUB / PAINEL','Tudo em um só lugar',
  'Gerencie addons, coleções, catálogos e a publicação do Nuvio no mesmo aplicativo.')+
 `<div class="inline-info">${state.editable?'Edição habilitada no PC, sem token nem etapas de desbloqueio.':'Você está vendo a versão pública de leitura. Para editar sem token, abra http://127.0.0.1:7001 no PC.'}</div>
 <div class="stat-grid">
  <div class="stat"><div class="value">${total}</div><span class="descriptor">Addons ativos</span></div>
  <div class="stat"><div class="value">${groups().length}</div><span class="descriptor">Coleções próprias</span></div>
  <div class="stat"><div class="value">${folders}</div><span class="descriptor">Pastas organizadas</span></div>
  <div class="stat"><div class="value">${catalogs().length}</div><span class="descriptor">Catálogos na biblioteca</span></div>
 </div>
 <div class="section-head"><h2>Seu fluxo de trabalho</h2></div>
 <div class="cards-grid">
  ${[
   {icon:'▦',title:'1. Conecte seus addons',text:'Inclua manifests JSON e mantenha streams, metadata e catálogos no mesmo Agregador.',view:'addons'},
   {icon:'▤',title:'2. Organize catálogos',text:'Descubra o que os addons oferecem ou crie um catálogo convencional com títulos próprios.',view:'catalogs'},
   {icon:'▣',title:'3. Construa coleções',text:'Crie coleções e pastas do zero, cole JSON ou misture fontes de vários addons.',view:'collections'},
   {icon:'↗',title:'4. Use no Nuvio',text:'Copie o link do addon unificado e exporte seu JSON de coleções.',view:'publish'}
  ].map(x=>`<div class="info-card"><span class="card-icon">${x.icon}</span><strong>${esc(x.title)}</strong><p>${esc(x.text)}</p>${makeBtn('Abrir →','nav-'+x.view,'btn btn-ghost')}</div>`).join('')}
 </div>
 <div class="two-cols" style="margin-top:19px">
  <div class="panel"><div class="section-head"><h2>Suas coleções</h2>${makeBtn('Ver todas →','nav-collections','btn btn-small')}</div>
  ${groups().length?groups().slice(0,5).map(g=>`<button class="collection-item" data-open-group="${esc(g.id)}"><span>${esc(g.title)}</span><small class="item-count">${g.folders?.length||0} pastas</small></button>`).join(''):
  '<div class="empty"><b>Nenhuma coleção criada</b><span>Comece em Coleções → Nova coleção</span></div>'}</div>
  <div class="panel"><div class="section-head"><h2>Conectados ao Agregador</h2>${makeBtn('Gerenciar →','nav-addons','btn btn-small')}</div>
  ${working.slice(0,6).map(a=>`<div class="source-row"><b class="source-text">${esc(a.name)}</b><span class="badge ok">Em operação</span></div>`).join('')||'<p class="muted">Nenhum addon em operação.</p>'}
  </div>
 </div>`;
}
function renderAddons(){
 const list=state.profile.addons||[];
 const observed=state.monitor?.items||[];
 const status=new Map(observed.map((item,i)=>[list[i]?.url,item]));
 const effective=a=>{
  const item=status.get(a.url);
  if(item)return item.effectiveEnabled!==undefined?item.effectiveEnabled:a.enabled!==false&&
    (!item.health||item.health.status==='online');
  return a.enabled!==false;
 };
 const active=list.filter(effective);
 const suspended=list.filter(a=>a.enabled!==false&&!effective(a));
 const manualOff=list.filter(a=>a.enabled===false);
 const q=state.search.trim().toLocaleLowerCase('pt-BR');
 const matched=list.filter(a=>
  (state.addonFilter==='all'||(state.addonFilter==='active'&&effective(a))||
   (state.addonFilter==='disabled'&&!effective(a)))&&
  (a.name+' '+a.url).toLocaleLowerCase('pt-BR').includes(q));
 const rank=new Map(active.map((a,i)=>[a.url,i+1]));
 const canSort=state.editable&&state.addonFilter==='all'&&!q&&!state.addonBusy;
 const capLabels={stream:'Reprodução',meta:'Metadados',catalog:'Catálogos',subtitles:'Legendas'};
 const metric=(n,label,cls='')=>'<div class="addon-metric '+cls+'"><strong>'+
   n+'</strong><span>'+label+'</span></div>';
 const filter=(key,label,count)=>'<button type="button" class="addon-filter '+
   (state.addonFilter===key?'selected':'')+'" data-addon-filter="'+key+
   '" aria-pressed="'+(state.addonFilter===key)+'">'+label+' <span>'+count+'</span></button>';
 const button=(label,action,cls,url,enabled,title)=>'<button type="button" class="'+cls+
   '" data-action="'+action+'" data-url="'+esc(url)+'" title="'+esc(title)+'" aria-label="'+
   esc(title)+'" '+(enabled?'':'disabled')+'>'+label+'</button>';
 const cards=matched.map(a=>{
  const i=list.findIndex(x=>x.url===a.url),isConfigured=a.enabled!==false;
  const item=status.get(a.url),health=item?.health,search=item?.search;
  const art=item?.artworkUrl?.startsWith('https://')?item.artworkUrl:null;
  const isEffective=effective(a),autoSuspended=isConfigured&&!isEffective;
  const pending=isConfigured&&!health;
  const type=autoSuspended?'automatic':!isConfigured?'manual':pending?'pending':'ready';
  const label=autoSuspended?'SUSPENSO AUTOMATICAMENTE':!isConfigured?'DESATIVADO MANUALMENTE':
    pending?'AGUARDANDO VERIFICAÇÃO':'ATIVO';
  const n=rank.get(a.url);
  const expanded=state.openAddons.has(a.url);
  const checked=health?.at?new Date(health.at).toLocaleTimeString('pt-BR'):'Ainda não';
  const avg=search?.averageMs!=null?(search.averageMs/1000).toFixed(1)+' s':'Sem buscas reais';
  const originLabel=health?.status==='online'?'Manifesto acessível':
    health?'Falha no manifesto: '+health.status:'Manifesto ainda não verificado';
  const caps=(a.resources||[]).map(c=>cap(capLabels[c]||c,true)).join('')||
    '<span class="cap">Sem recursos selecionados</span>';
  const remote=(health?.resources||[]).map(c=>cap(capLabels[c]||c,true)).join('')||
    '<span class="cap">Aguardando detecção</span>';
  return '<article class="addon-mini '+(isEffective?'is-ready':type==='automatic'?'is-failed':
    type==='manual'?'is-manual':'is-waiting')+
    '" data-addon-url="'+esc(a.url)+'">'+
   '<details '+(expanded?'open':'')+'>'+
   '<summary data-addon-summary="'+esc(a.url)+'" draggable="'+canSort+'"'+
     ' title="'+(canSort?'Arraste a linha para alterar a prioridade ou clique para ver os detalhes':'Clique para ver os detalhes')+'"'+
     ' aria-label="Detalhes de '+esc(a.name)+'">'+
    '<span class="addon-mini-drag" aria-hidden="true" title="Arraste para mudar a prioridade">⠿</span>'+
    '<span class="addon-mini-avatar" title="'+esc(a.name)+(n?' · Prioridade '+n:'')+'">'+
      '<span class="addon-mini-initials" aria-hidden="true">'+esc(addonInitials(a.name))+'</span>'+
      (art?'<img src="'+esc(art)+'" alt="" draggable="false" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
      (n?'<span class="addon-mini-rank" aria-label="Prioridade '+n+'">'+n+'</span>':'')+
    '</span>'+
    '<span class="addon-mini-identity"><strong>'+esc(a.name)+'</strong>'+
      '<small>'+esc(health?.message||'Detalhes da origem e configurações')+'</small></span>'+
    '<span class="addon-mini-status addon-mini-status-'+type+'"><i></i>'+label+'</span>'+
    '<span class="addon-mini-latency">'+(health?.durationMs!=null?health.durationMs+' ms':'—')+
      '<small>manifesto</small></span>'+
    '<span class="addon-mini-chevron" aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span>'+
   '</summary>'+
   '<div class="addon-mini-expanded">'+
    '<div class="addon-mini-meta"><b>Endereço</b><code>'+esc(a.url)+'</code></div>'+
    '<div class="addon-mini-panes">'+
     '<div class="addon-mini-pane"><b>Situação operacional</b>'+
       '<span>'+esc(originLabel)+'</span>'+
       '<small>Última consulta: '+esc(checked)+' · Tempo: '+
         (health?.durationMs!=null?health.durationMs+' ms':'—')+'</small>'+
       (autoSuspended?'<small class="addon-mini-warning">Busca e reprodução suspensas até a próxima verificação positiva. Sua preferência foi preservada.</small>':'')+
     '</div>'+
     '<div class="addon-mini-pane"><b>Buscas reais</b>'+
       '<span>'+avg+'</span><small>'+(search?.samples||0)+' amostras · '+
       (search?.status||'Sem consulta recente')+'</small></div>'+
     '<div class="addon-mini-pane"><b>Limite configurado</b>'+
       '<span>'+((item?.configuredTimeoutMs||a.requestTimeoutMs||7500)/1000).toFixed(1)+' segundos</span>'+
       '<small>Por solicitação</small></div>'+
     '<div class="addon-mini-pane"><b>Catálogos declarados</b>'+
       '<span>'+(health?.catalogCount??'—')+'</span><small>Manifesto de origem</small></div>'+
    '</div>'+
    '<div class="addon-mini-capabilities"><div><b>Recursos escolhidos</b>'+caps+'</div>'+
       '<div><b>Recursos disponíveis na origem</b>'+remote+'</div></div>'+
    '<div class="addon-mini-actions">'+
     '<div class="addon-mini-order-actions">'+
       button('↑','priority-up','addon-arrow',a.url,canSort&&i>0,'Subir '+a.name)+
       button('↓','priority-down','addon-arrow',a.url,canSort&&i<list.length-1,'Descer '+a.name)+
       button('Primeiro','priority-first','addon-first',a.url,canSort&&i>0,'Priorizar '+a.name)+
     '</div>'+
     button('Configurar','configure-addon','addon-settings',a.url,state.editable&&!state.addonBusy,'Configurar '+a.name)+
     button(isConfigured?'Desativar manualmente':'Ativar quando disponível','toggle-addon',
       'addon-switch '+(isConfigured?'switch-on':'switch-off'),a.url,state.editable&&!state.addonBusy,
       (isConfigured?'Desativar ':'Ativar ')+a.name)+
     button('Remover','remove-addon','addon-remove',a.url,state.editable&&!state.addonBusy,'Remover '+a.name)+
    '</div>'+
   '</div></details></article>';
 }).join('');
 const last=state.monitor?.lastCheckFinished;
 const when=last?new Date(last).toLocaleString('pt-BR'):'Aguardando verificação';
 return pageTitle('RECURSOS / GERENCIAR ADDONS','Addons e prioridades',
  'Lista compacta: clique em um addon para ver todos os detalhes. Falhas na origem suspendem sua utilização automaticamente; a recuperação também é automática.',
  makeBtn('+ Adicionar addon','new-addon','btn btn-primary',state.editable?'':'disabled'))+
 '<div class="addons-summary addon-summary-four">'+
   metric(list.length,'Configurados')+
   metric(active.length,'Em operação','addon-metric-active')+
   metric(suspended.length,'Suspensos automaticamente','addon-metric-inactive')+
   metric(manualOff.length,'Desativados por você')+
 '</div>'+
 '<section class="panel addon-panel">'+
  '<div class="section-head addon-section-head"><div><h2>Ordem de consulta</h2>'+
   '<p class="addon-explain">Arraste uma linha pela alça ⠿ para definir a prioridade. Clique para expandir e configurar. As setas continuam disponíveis.</p></div>'+
   makeBtn('Ver capacidades','scan','btn btn-subtle',state.editable?'':'disabled')+'</div>'+
  '<div class="addon-controls"><div class="addon-filters" role="group" aria-label="Filtrar addons">'+
    filter('all','Todos',list.length)+filter('active','Em operação',active.length)+
    filter('disabled','Suspensos ou desativados',list.length-active.length)+
   '</div><div class="addon-search">'+pen('searchAddons',state.search,'Buscar por nome ou endereço...')+'</div></div>'+
  '<div class="addon-monitor-toolbar"><span><b>Monitor automático</b> · A cada '+
   ((state.monitor?.intervalSeconds||300)/60)+' min · Última: '+esc(when)+
   ' · Suspensão temporária por falha no manifesto; nova verificação tenta recuperar.</span>'+
   makeBtn('Verificar agora','addons-health-check','btn btn-subtle',state.editable?'':'disabled')+
  '</div>'+
  '<div class="addon-priority-list">'+(cards||'<div class="empty"><b>Nenhum addon encontrado</b></div>')+'</div>'+
  '<p class="addon-footnote">O monitor suspende o uso em falhas de manifesto (incluindo timeout e incompatibilidade), mas mantém a configuração salva. O serviço pode oferecer streams mesmo com a verificação de manifesto falhando; reavalie quando necessário. Buscas em cache no Nuvio podem levar até o vencimento do cache para refletir a mudança.</p>'+
 '</section>';
}
function catalogIdentity(c){return JSON.stringify([c.addonId||'nuvio.studio',c.type,c.id]);}
function catalogOrigin(c){
 if(c.listSource?.provider==='imdb')return 'IMDb · lista importada';
 if(c.listSource?.provider==='trakt')return 'Trakt · lista vinculada';
 if(c.listSource?.provider==='mdblist')return 'MDBList · lista pública';
 if(c.listSource?.provider==='tmdb')return 'TMDB · catálogo personalizado';
 if(c.manual)return 'Nuvio Collection Studio';
 if(c.sourceUrl){
  const app=(state.profile.addons||[]).find(a=>a.url===c.sourceUrl);
  const external=state.providers.find(a=>a.url===c.sourceUrl);
  return app?.name||external?.name||c.sourceAddonId||'Addon externo';
 }
 if(c.sourceAddonId){
  const addon=(state.profile.addons||[]).find(a=>(a.addonId||a.id)===c.sourceAddonId);
  return addon?.name||c.sourceAddonId;
 }
 return c.addonId&&c.addonId!=='community.streamaggregator.unified'?c.addonId:'JSON importado';
}
function renderCatalogs(){
 const all=catalogs(),providers=state.providers,q=state.search.toLocaleLowerCase('pt-BR').trim();
 const matches=all.filter(c=>(c.name+' '+c.id+' '+catalogOrigin(c)+' '+c.type).toLocaleLowerCase('pt-BR').includes(q));
 const paged=paginateItems(matches,state.catalogPage,50);
 state.catalogPage=paged.page;
 const pages=paged.totalPages,part=paged.slice;
 const mayReorder=state.editable&&!q&&!state.dirty&&!state.catalogBusy;
 const controls=(id,index)=>{
  const e=esc(id);
  return '<button type="button" data-action="catalog-up" data-catalog-key="'+e+'" aria-label="Subir catálogo" '+
   (mayReorder&&index>0?'':'disabled')+'>↑</button>'+
   '<button type="button" data-action="catalog-down" data-catalog-key="'+e+'" aria-label="Descer catálogo" '+
   (mayReorder&&index<all.length-1?'':'disabled')+'>↓</button>';
 };
 const rows=part.map((c,j)=>{
  const id=catalogIdentity(c),index=all.findIndex(x=>catalogIdentity(x)===id);
  const expanded=state.openCatalogs.has(id);
  const origin=catalogOrigin(c),kind=c.type==='series'?'Série':'Filme';
  const identity=esc(id),basicName=c.name.replace(/^(.+?) · /,'');
  const sourceLabel=origin;
  return '<article class="hub-catalog-card" data-catalog-key="'+identity+'">'+
   '<details '+(expanded?'open':'')+'>'+
    '<summary data-catalog-summary="'+identity+'">'+
     '<span class="hub-catalog-drag" title="Arraste para mudar a prioridade" aria-hidden="true">⠿</span>'+
     '<span class="hub-catalog-rank">'+String(index+1).padStart(2,'0')+'</span>'+
     '<span class="hub-catalog-main"><b>'+esc(basicName)+'</b><small>'+esc(sourceLabel)+'</small></span>'+
     '<span class="hub-catalog-type '+(c.type==='series'?'is-series':'is-movie')+'">'+
     kind+'</span>'+
     '<span class="hub-catalog-chevron">'+(expanded?'⌃':'⌄')+'</span>'+
    '</summary>'+
    '<div class="hub-catalog-expanded">'+
     '<p><strong>Fornecedor:</strong> '+esc(sourceLabel)+'</p>'+
     '<p><strong>Identificador:</strong> '+esc(c.id)+'</p>'+
     (c.manual?'<p><strong>Títulos:</strong> '+(c.metas||[]).length+'</p>':'')+
     (c.listSource?.url?'<p><strong>Lista original:</strong> '+esc(c.listSource.url)+'</p>':'')+
     '<div class="hub-catalog-actions">'+
      controls(id,index)+
      (c.manual?makeBtn('Adicionar título','new-meta','btn btn-small','data-cat="'+esc(c.id)+'"'):'')+
      (c.listSource&&['trakt','mdblist','tmdb','tvmaze'].includes(c.listSource.provider)?
       makeBtn('Atualizar títulos','refresh-trakt','btn btn-small','data-cat="'+esc(c.id)+'"'):'')+
      (c.manual?makeBtn('Configurar fonte','edit-catalog-builder','btn btn-small','data-cat="'+esc(c.id)+'"'):'')+
      makeBtn('Editar JSON','edit-catalog-json','btn btn-small','data-cat="'+esc(c.id)+'"')+
      makeBtn('Excluir','remove-catalog','btn btn-small btn-danger','data-cat="'+esc(c.id)+'"')+
     '</div>'+
    '</div>'+
   '</details></article>';
 }).join('');
 return pageTitle('BIBLIOTECA / CATÁLOGOS','Catálogos e metadados',
  'Organize por prioridade, identifique a origem e crie catálogos próprios usando listas IMDb ou Trakt.',
  makeBtn('+ Novo catálogo','new-catalog','btn btn-primary',state.editable?'':'disabled')+
  makeBtn('Descobrir catálogos','scan','btn btn-subtle',state.editable?'':'disabled'))+
 '<div class="stat-grid"><div class="stat"><div class="value">'+all.length+'</div><span class="descriptor">Na biblioteca</span></div>'+
 '<div class="stat"><div class="value">'+providers.reduce((n,p)=>n+(p.catalogs?.length||0),0)+
 '</div><span class="descriptor">Detectados nos addons</span></div>'+
 '<div class="stat"><div class="value">'+all.filter(c=>c.manual).length+'</div><span class="descriptor">Catálogos próprios</span></div>'+
 '<div class="stat"><div class="value">'+all.filter(c=>c.listSource).length+'</div><span class="descriptor">Criados por listas</span></div></div>'+
 '<div class="panel hub-catalog-panel"><div class="section-head"><div><h2>Minha biblioteca · ordem de prioridade</h2>'+
  '<p class="muted">Arraste pela alça ou use as setas. A ordem é salva no Agregador; a ordem das pastas é editada em Coleções.</p></div>'+
   pen('searchCatalogs',state.search,'Buscar nome, tipo ou origem...')+'</div>'+
 '<div class="addon-order-notice">'+(mayReorder?
  'Arraste para reorganizar. A ordem é gravada imediatamente.':
  'Para ordenar, limpe a busca e salve primeiro quaisquer alterações pendentes.')+'</div>'+
 '<div class="hub-catalog-list">'+(rows||'<div class="empty">Nenhum catálogo nesta pesquisa. Use Novo catálogo ou Descobrir.</div>')+'</div>'+
 '<div class="hub-catalog-pages"><span>'+matches.length+' catálogos · página '+(state.catalogPage+1)+' de '+pages+'</span>'+
 '<div><button type="button" data-action="catalog-page-prev" '+(state.catalogPage===0?'disabled':'')+'>← Anterior</button>'+
 '<button type="button" data-action="catalog-page-next" '+(state.catalogPage>=pages-1?'disabled':'')+'>Próxima →</button></div></div></div>'+
 '<div class="panel" style="margin-top:15px"><div class="section-head"><h2>Catálogos descobertos nos addons</h2>'+
 '<span class="muted">Selecione um, vários ou todos os catálogos de cada addon.</span></div>'+
 (providers.length?providers.filter(p=>p.catalogs?.length).map(p=>'<div class="catalog-row"><div class="provider-main">'+
  '<h3>'+esc(p.name)+'</h3><div class="catalog-details">'+p.catalogs.length+' catálogos encontrados</div></div>'+
  '<div class="row-actions">'+makeBtn('Ver catálogos','choose-provider','btn btn-small','data-provider="'+esc(p.url)+'"')+
  '</div></div>').join('')||'<div class="empty">Nenhum addon apresentou catálogos.</div>':
 '<div class="empty"><b>Fontes ainda não consultadas</b><span>Use Descobrir catálogos para detectar os manifestos.</span></div>')+
 '</div>';
}
function renderCollections(){
 const g=group(),f=folder();
 const resolver=collectionResolver(),stats=resolver.summary(groups()),
  checked=state.collectionInventory==='ready',groupStats=g?stats.byGroup[g.id]:null;
 const statusPanel='<div class="panel collection-link-health">'+
  '<div class="section-head"><h2>Reconhecimento dos catálogos</h2>'+
  makeBtn('Verificar novamente','collection-rescan','btn btn-subtle btn-small',
    state.collectionInventory==='loading'?'disabled':'')+'</div>'+
  (checked?
   '<div class="collection-health-counts"><span class="collection-health-ready">'+stats.ready+
    ' referências reconhecidas</span><span class="'+(stats.missing?'collection-health-missing':'collection-health-muted')+'">'+
    stats.missing+' não localizadas</span><span>'+stats.folders+' pastas verificadas</span></div>'+
   (stats.missing?'<div class="inline-info warning" role="alert">'+stats.affectedFolders+
    ' pastas contêm catálogos indisponíveis. Abra a pasta, veja as fontes marcadas e use Substituir antes de exportar.</div>':
    '<p class="muted">Todas as referências foram identificadas em catálogos criados ou nos manifestos de addons ativos. Isso não garante que estejam retornando títulos nem reprodução.</p>')+
   (!stats.ready&&stats.total?'<div class="inline-info warning" role="alert">Nenhum catálogo da coleção foi reconhecido. Substitua os vínculos por fontes disponíveis em Catálogos ou Addons antes de exportar.</div>':'')
  :'<div class="inline-info '+(state.collectionInventory==='error'?'warning':'')+'">'+
    (state.collectionInventory==='error'?'Não foi possível verificar os addons: '+esc(state.collectionInventoryError):
     'Consultando os manifestos dos addons para reconhecer as referências importadas...')+'</div>')+
  '<p class="muted">A conferência não altera a coleção. Substituições só são aplicadas quando você confirma e salva.</p></div>';
 const sourceChoices=catalogs().map(c=>`<option value="${esc((c.addonId||'nuvio.studio')+'::'+c.type+'::'+c.id)}">${esc(c.name)} · ${esc(c.type)}</option>`).join('');
 const top=pageTitle('BIBLIOTECA / COLEÇÕES','Editor de coleções',
  'Coleções, pastas, capas e fontes editadas no mesmo lugar em que você gerencia os addons.',
  makeBtn('+ Nova coleção','new-group','btn btn-primary',state.editable?'':'disabled')+
  makeBtn('Importar JSON','import-json','btn btn-subtle',state.editable?'':'disabled')+
  makeBtn('▶ Simular no Nuvio','preview-open','btn btn-primary'))+
  '<div class="collection-preview-workflow" role="group" aria-label="Etapas de edição de coleções">'+
   '<span><strong>Organize → Simule → Publique</strong>'+
    '<small>Veja suas pastas, catálogos e cartazes numa TV virtual antes de salvar.</small></span>'+
   '<span class="collection-workflow-step">'+groups().length+' coleções · '+stats.folders+' pastas</span>'+
   makeBtn('Abrir simulador de TV →','preview-open','btn btn-primary')+'</div>'+
   statusPanel;
 const list=`<div class="panel"><div class="section-head"><h2>Minhas coleções</h2><span class="badge">${groups().length}</span></div>
 <p class="muted collection-sort-hint">Arraste pela alça ⠿ para ordenar coleções. Também é possível usar ↑ e ↓ sobre a alça.</p>
 <div class="collection-list" data-sort-list="group">
 ${groups().map((item,i)=>`<div class="collection-sort-item" data-sort-level="group" data-sort-id="${esc(item.id)}">
  <span class="collection-sort-handle" role="button" tabindex="${state.editable?'0':'-1'}" aria-label="Reordenar coleção ${esc(item.title)}. Use as setas para mover." title="Arraste para reorganizar ou use ↑ ↓" aria-disabled="${!state.editable}">⠿</span>
  <button class="collection-item ${g?.id===item.id?'active':''}" data-group="${esc(item.id)}">
  <span class="collection-slot-rank" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>
  <span class="collection-slot-identity"><strong>${esc(item.title)}</strong>
   <small>${item.folders?.length||0} pastas · ${stats.byGroup[item.id]?.total||0} fontes</small></span>
  <span class="collection-slot-chevron ${checked&&stats.byGroup[item.id]?.missing?'has-alert':''}" title="${checked?(stats.byGroup[item.id]?.ready+' reconhecidos, '+stats.byGroup[item.id]?.missing+' ausentes'):'Aguardando verificação'}" aria-hidden="true">${checked&&stats.byGroup[item.id]?.missing?'!':'›'}</span></button></div>`).join('')||'<div class="empty">Crie uma coleção para começar.</div>'}
 </div><hr>${makeBtn('+ Criar coleção','new-group','btn btn-small',state.editable?'':'disabled')}</div>`;
 const folderList=`<div class="panel"><div class="section-head"><h2>Pastas ${g?'· '+esc(g.title):''}</h2>
 ${makeBtn('+ Nova pasta','new-folder','btn btn-small',g&&state.editable?'':'disabled')}</div>
 <p class="muted collection-sort-hint">Arraste ⠿ para organizar as pastas desta coleção.</p>
 <div class="folder-list" data-sort-list="folder">
 ${g?(g.folders||[]).map((item,i)=>`<div class="collection-sort-item" data-sort-level="folder" data-sort-id="${esc(item.id)}">
  <span class="collection-sort-handle" role="button" tabindex="${state.editable?'0':'-1'}" aria-label="Reordenar pasta ${esc(item.title)}. Use as setas para mover." title="Arraste para reorganizar ou use ↑ ↓" aria-disabled="${!state.editable}">⠿</span>
  <button class="folder-item ${f?.id===item.id?'active':''}" data-folder="${esc(item.id)}">
 <div class="folder-card"><span class="collection-folder-index" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>${item.customCoverImageUrl||item.coverImageUrl?`<img class="cover-thumb ${item.tileShape==='POSTER'?'poster':''}" src="${esc(item.customCoverImageUrl||item.coverImageUrl)}" alt="" loading="lazy">`:
 '<div class="cover-thumb" style="display:grid;place-items:center">▣</div>'}
 <span><strong>${esc(item.title)}</strong><small>${editableSources(item).length} fontes · ${esc(item.tileShape||'LANDSCAPE')}</small></span>
 ${checked&&editableSources(item).some(src=>resolver.resolve(src).status==='missing')?'<span class="collection-folder-warning" title="Catálogos não localizados">!</span>':'<span class="collection-slot-chevron" aria-hidden="true">›</span>'}</div>
 </button></div>`).join('')||'<div class="empty"><b>Sem pastas ainda</b><span>Adicione uma pasta para reunir catálogos.</span></div>':
 '<div class="empty"><b>Selecione ou crie uma coleção</b></div>'}
 </div></div>`;
 let properties='';
 if(!g)properties='<div class="panel properties"><h2>Detalhes da coleção</h2><div class="empty">Escolha uma coleção para editar.</div></div>';
 else if(!f)properties=`<div class="panel properties">
 <div class="section-head"><h2>Editar coleção</h2>${makeBtn('Excluir','delete-group','btn btn-small btn-danger',state.editable?'':'disabled')}</div>
 ${checked&&groupStats?'<p class="panel-sub collection-health-inline">'+groupStats.ready+' reconhecidos · '+groupStats.missing+' não localizados em '+groupStats.folders+' pastas</p>':''}
 <p class="panel-sub">As alterações só serão exportadas depois de salvar.</p>
 <div class="editor-section"><label class="field"><span>Nome da coleção</span>${pen('groupTitle',g.title,'Ex.: Netflix')}</label></div>
 <div class="editor-section"><label class="field"><span>Imagem de fundo (HTTPS)</span>${pen('groupBackdrop',g.backdropImageUrl||'','https://...')}</label></div>
 <div class="editor-section"><label class="field"><span>Modo de visualização</span>${select('groupViewMode',[['TABBED_GRID','Grade por abas'],['ROWS','Linhas por pasta'],['FOLLOW_LAYOUT','Seguir layout do Nuvio'],['GRID','Grade (legado)'],['HORIZONTAL','Horizontal (legado)']],g.viewMode||'TABBED_GRID')}</label></div>
 <div class="editor-section"><div class="section-head"><h3>Organizar coleção</h3></div>
 ${makeBtn('Subir ↑','move-group-up','btn btn-small',state.editable?'':'disabled')}
 ${makeBtn('Descer ↓','move-group-down','btn btn-small',state.editable?'':'disabled')}
 </div></div>`;
 else properties=`<div class="panel properties">
 <div class="section-head"><h2>Editar pasta</h2>${makeBtn('Excluir','delete-folder','btn btn-small btn-danger',state.editable?'':'disabled')}</div>
 <div class="editor-section"><label class="field"><span>Nome da pasta</span>${pen('folderTitle',f.title,'Nome da pasta')}</label></div>
 <div class="editor-section"><label class="field"><span>Imagem da capa (HTTPS)</span>${pen('folderCover',f.customCoverImageUrl||f.coverImageUrl||'','https://...imagem.jpg')}</label>
 ${(f.customCoverImageUrl||f.coverImageUrl)?`<div class="art-preview" style="aspect-ratio:${f.tileShape==='POSTER'?'2/3':f.tileShape==='SQUARE'?'1':'16/9'}"><img src="${esc(f.customCoverImageUrl||f.coverImageUrl)}" alt="Capa da pasta"></div>`:''}</div>
 <div class="editor-section"><label class="field"><span>Proporção para Nuvio Legacy</span>
 ${select('folderShape',[['LANDSCAPE','Landscape · 16:9'],['POSTER','Poster · 2:3'],['SQUARE','Square · 1:1'],['PORTRAIT','Portrait · 3:4 (converte para Poster no Legacy)']],f.tileShape||'LANDSCAPE')}</label></div>
 <div class="editor-section"><div class="section-head"><h3>Catálogos da pasta</h3><span class="badge">${editableSources(f).length}</span></div>
 <p class="panel-sub">Arraste ⠿ para ordenar os catálogos (abas) nesta pasta. A posição será publicada depois de Salvar alterações.</p>
 <div class="collection-sources-sort" data-sort-list="source">
 ${editableSources(f).map((s,i)=>{
  const match=resolver.resolve(s);
  const label=match.status==='ready'?'Reconhecido':match.status==='missing'?'Não localizado':'Verificando';
  return `<div class="source-row source-row-${match.status}" data-sort-level="source" data-sort-index="${i}" data-source-key="${esc(sourceKey(s))}">
  <span class="collection-sort-handle" role="button" tabindex="${state.editable?'0':'-1'}" aria-label="Reordenar catálogo ${esc(match.label)}. Use as setas para mover." title="Arraste para reorganizar ou use ↑ ↓" aria-disabled="${!state.editable}">⠿</span>
  <span class="collection-slot-rank" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>
  <div class="source-text"><b>${esc(match.label)}</b>
   <small>${esc(s.type==='series'?'Séries':'Filmes')} · ${esc(match.provider||s.addonId||'Fonte importada')}</small>
   <span class="collection-source-status ${match.status}" title="${esc(match.reason)}">${label}</span>
   ${match.status==='missing'?'<span class="collection-source-reason">'+esc(match.reason)+'</span>':''}
  </div>
  <div class="tiny-actions">
   <button class="tiny-btn source-change-btn" data-source-replace="${i}" aria-label="Substituir catálogo" title="Escolher outra origem">Substituir</button>
   <button class="tiny-btn" data-source-move="${i}" data-delta="-1" aria-label="Subir" ${i===0||!state.editable?'disabled':''}>↑</button>
   <button class="tiny-btn" data-source-move="${i}" data-delta="1" aria-label="Descer" ${i===editableSources(f).length-1||!state.editable?'disabled':''}>↓</button>
   <button class="tiny-btn" data-source-remove="${i}" aria-label="Remover">×</button>
  </div></div>`}).join('')||'<p class="muted">Esta pasta ainda não contém catálogos.</p>'}</div>
 <label class="field" style="margin-top:13px"><span>Adicionar catálogo da biblioteca</span>
 <select id="addSourceSelect"><option value="">Escolha um catálogo...</option>${sourceChoices}</select></label>
 ${makeBtn('+ Vincular à pasta','attach-catalog','btn btn-small',state.editable&&catalogs().length?'':'disabled')}
 ${makeBtn('+ Buscar em Addons ou no Hub','collection-attach-external','btn btn-small',state.editable?'':'disabled')}
 <div style="margin-top:10px">${makeBtn('Descobrir catálogos dos addons →','nav-catalogs','btn btn-small')}</div>
 </div>
 <div class="editor-section">${makeBtn('Subir pasta ↑','move-folder-up','btn btn-small',state.editable?'':'disabled')}
 ${makeBtn('Descer pasta ↓','move-folder-down','btn btn-small',state.editable?'':'disabled')}</div>
 </div>`;
 return top+(groups().length===0?'<div class="inline-info">Biblioteca vazia. Crie uma coleção do zero ou importe um JSON — sem depender de fornecedor ou metadados específicos.</div>':'')+
 `<div class="layout-collections">${list}${folderList}${properties}</div>`;
}
function renderMonitor(){
 const report=state.monitor;
 return pageTitle('OPERAÇÃO / MONITOR','Saúde dos addons',
  'Os testes mostram se os manifestos respondem e o histórico de buscas. Um manifesto online não garante resultados para todo título.',
  makeBtn('Verificar agora','monitor-check','btn btn-primary',state.editable?'':'disabled')+
  makeBtn('Atualizar','monitor-refresh'))+
 (report?`<div class="stat-grid">
 <div class="stat"><div class="value">${(report.items||[]).filter(x=>x.health?.status==='online').length}</div><span class="descriptor">Manifestos online</span></div>
 <div class="stat"><div class="value">${(report.items||[]).filter(x=>x.health&&x.health.status!=='online').length}</div><span class="descriptor">Com problemas</span></div>
 <div class="stat"><div class="value">${(report.items||[]).filter(x=>x.enabled).length}</div><span class="descriptor">Ativos</span></div>
 <div class="stat"><div class="value">${report.latestSearch?.durationMs||'—'}</div><span class="descriptor">Última busca (ms)</span></div></div>
 <div class="panel"><div class="table-wrap"><table><thead><tr><th>Addon</th><th>Manifesto</th><th>Tempo</th><th>Última consulta</th></tr></thead>
 <tbody>${(report.items||[]).map(a=>`<tr><td><b>${esc(a.name)}</b><small>${esc((a.resources||[]).join(' · '))}</small></td>
 <td><span class="badge ${a.health?.status==='online'?'ok':a.health?'error':'off'}">${esc(a.health?.status||'Aguardando')}</span></td>
 <td>${a.health?.durationMs==null?'—':a.health.durationMs+' ms'}</td>
 <td>${esc(a.search?.status||'Nenhuma busca registrada')}</td></tr>`).join('')}</tbody></table></div></div>`:
 '<div class="panel"><div class="empty"><b>Monitor ainda não consultado</b><span>Use Atualizar para consultar os dados de desempenho.</span></div></div>');
}
function renderPublish(){
 return pageTitle('DISTRIBUIÇÃO / NUVIO','Tudo pronto para o Nuvio',
 'O Agregador e suas coleções trabalham juntos, mas a instalação do manifesto e o carregamento do JSON dependem das opções oferecidas pela versão do Nuvio.')+
 `<div class="inline-info">O Hub usa um único conjunto de addons e sua biblioteca de coleções. Editar aqui atualiza os links abaixo depois de salvar. Nenhuma publicação automática na sua conta foi habilitada.</div>
 <div class="two-cols" style="margin-top:19px">
 <div class="panel"><div class="section-head"><h2>1. Addon do Agregador</h2><span class="badge ok">Link estável</span></div>
 <p class="panel-sub">Um manifesto para as fontes de reprodução, metadados e os catálogos expostos pelo Hub.</p>
 <div class="link-box"><code id="manifestLink">${MANIFEST}</code>${makeBtn('Copiar','copy-manifest','btn btn-small')}</div>
 <a class="btn btn-subtle" href="/manifest.json" target="_blank" rel="noopener">Abrir manifesto ↗</a></div>
 <div class="panel"><div class="section-head"><h2>2. Suas coleções</h2><span class="badge ok">JSON dinâmico</span></div>
 <p class="panel-sub">Inclui a organização das pastas, as fontes que você escolheu e as capas adaptadas para Legacy.</p>
 <div class="link-box"><code id="collectionsLink">${EXPORT}</code>${makeBtn('Copiar','copy-collections','btn btn-small')}</div>
 <a class="btn btn-subtle" href="/api/hub/collections.json" target="_blank" rel="noopener">Visualizar JSON ↗</a></div>
 </div>
 <div class="panel" style="margin-top:16px"><h2>Guia de utilização</h2>
 ${[
 'Cadastre os addons no Hub e mantenha habilitados os que quiser utilizar.',
 'Crie suas coleções, defina as pastas e vincule os catálogos. Clique em Salvar alterações.',
 'No Nuvio, instale o manifesto do Agregador e importe o JSON de coleções na função oferecida pelo aplicativo.'
 ].map((x,i)=>`<div class="step"><span class="step-number">${i+1}</span><span>${esc(x)}</span></div>`).join('')}
 <div class="inline-info warning">O formato atual do Nuvio Legacy não garante que um único link de addon instale também coleções pessoais. A exportação oferece os dois links necessários, sem afirmar que a instalação na TV foi testada.</div>
 </div>`;
}

async function loadHubSettings(){
 if(!state.editable){state.settingsError='Configurações disponíveis somente no acesso local do PC.';render();return;}
 try{state.settings=await request('/api/hub/settings');state.settingsError='';}
 catch(e){state.settingsError=e.message;}
 if(state.view==='settings')render();
}
function renderSettings(){
 const s=state.settings;
 if(!state.editable)return pageTitle('NUVIO HUB / SISTEMA','Configurações',
  'Credenciais e operações estão disponíveis apenas no PC local.')+
  '<div class="inline-info warning">Abra http://127.0.0.1:7001/?view=settings no próprio PC para editar as integrações. Nenhuma chave pode ser consultada publicamente.</div>';
 if(!s)return pageTitle('NUVIO HUB / SISTEMA','Configurações',
  'Central de integrações e preferências do Agregador.')+
  '<div class="panel">'+esc(state.settingsError||'Carregando configurações do servidor...')+'</div>';
 const names=[
  {id:'tmdb',title:'TMDB',info:'Necessária para descoberta de filmes e séries, posters e resolução de IDs TMDB.',
   help:'https://www.themoviedb.org/settings/api'},
  {id:'trakt',title:'Trakt',info:'Client ID de uma aplicação Trakt para importar listas públicas; não é a senha da conta.',
   help:'https://trakt.tv/oauth/applications'},
  {id:'mdblist',title:'MDBList',info:'Opcional para a API de listas. Feeds JSON públicos podem funcionar sem chave.',
   help:'https://mdblist.com/preferences/'}
 ];
 const integrations=names.map(x=>{
  const entry=s.integrations?.[x.id]||{};
  const desc=entry.configured?'Configurado ('+
   (entry.origin==='ambiente'?'variável de ambiente':'armazenado no Hub')+')':'Não configurado';
  return '<div class="settings-provider"><div class="section-head"><h3>'+x.title+
   '</h3><span class="badge '+(entry.configured?'ok':'off')+'">'+esc(desc)+'</span></div>'+
   '<p class="panel-sub">'+esc(x.info)+'</p>'+
   '<label class="field"><span>Chave / Client ID</span><input id="integration-'+x.id+
    '" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="'+
    (entry.configured?'•••••••• (mantida, se ficar em branco)':'Cole a chave aqui')+'"></label>'+
   '<div class="settings-actions"><button type="button" class="btn btn-primary btn-small" data-action="settings-key-save" data-provider="'+
     x.id+'">Salvar chave</button>'+
   (entry.origin==='local'?'<button type="button" class="btn btn-subtle btn-small" data-action="settings-key-clear" data-provider="'+x.id+'">Remover chave local</button>':'')+
   '<a href="'+esc(x.help)+'" target="_blank" rel="noopener noreferrer">Obter chave ↗</a></div></div>';
 }).join('');
 const f=s.playback?.filters||{};
 const checked=r=>(f.resolutions||[]).includes(r)?'checked':'';
 return pageTitle('NUVIO HUB / SISTEMA','Configurações',
   'Gerencie credenciais, reprodução e componentes do Hub em uma área central.')+
  '<div class="settings-layout">'+
   '<section class="panel settings-panel"><div class="section-head"><h2>Integrações e chaves API</h2>'+
    '<span class="badge">Somente no PC</span></div>'+
    '<p class="panel-sub">As chaves ficam no servidor, não são mostradas novamente e passam a valer sem reiniciar o Docker. Campo em branco mantém a chave existente.</p>'+
    '<div class="settings-providers">'+integrations+'</div>'+
    '<div class="inline-info">IMDb CSV/IDs e TVmaze não requerem chave. Addons podem precisar de URLs ou parâmetros individuais, gerenciados em Addons.</div></section>'+
   '<section class="panel settings-panel"><div class="section-head"><h2>Minhas contas e listas</h2>'+
    '<span class="badge">Somente no PC</span></div>'+
    '<p class="panel-sub">Identifique suas contas para localizar listas pessoais quando a API permitir. Tokens opcionais são gravados somente no servidor e nunca exibidos.</p>'+
    '<div class="settings-providers">'+
     '<div class="settings-provider"><h3>Trakt.tv</h3>'+
      '<p class="panel-sub">Busca as listas públicas do usuário com o Client ID já configurado. Listas privadas exigem OAuth, ainda não conectado.</p>'+
      '<label class="field"><span>Meu usuário Trakt</span><input id="accountTraktUser" value="'+esc(s.accounts?.trakt?.username||'')+'" placeholder="Nome de usuário"></label>'+
      '<button type="button" class="btn btn-primary" data-action="settings-account-trakt">Salvar usuário</button></div>'+
     '<div class="settings-provider"><h3>TMDB</h3>'+
      '<p class="panel-sub">Para consultar as listas da sua conta, informe o ID da conta e uma sessão autorizada. A chave API sozinha não dá acesso à conta.</p>'+
      '<label class="field"><span>ID numérico da conta</span><input id="accountTmdbId" inputmode="numeric" value="'+esc(s.accounts?.tmdb?.accountId||'')+'" placeholder="ID da conta"></label>'+
      '<label class="field"><span>Session ID da conta</span><input id="accountTmdbSession" type="password" autocomplete="new-password" placeholder="'+(s.accounts?.tmdb?.sessionConfigured?'Sessão configurada':'Sessão autorizada')+'"></label>'+
      '<button type="button" class="btn btn-primary" data-action="settings-tmdb-begin">Conectar minha conta TMDB</button>'+
      '<div class="settings-tmdb-connection" id="settingsTmdbConnect" role="status"></div>'+
      '<button type="button" class="btn btn-subtle" data-action="settings-account-tmdb">Salvar ID e sessão manualmente</button>'+
      '<a href="https://developer.themoviedb.org/docs/authentication-user" target="_blank" rel="noopener noreferrer">Como autorizar uma sessão ↗</a></div>'+
     '<div class="settings-provider"><h3>TVmaze Premium</h3>'+
      '<p class="panel-sub">A API de usuário requer TVmaze Premium. Com nome de usuário e chave pessoal, importe as séries seguidas na conta.</p>'+
      '<label class="field"><span>Usuário TVmaze</span><input id="accountTvmazeUser" value="'+esc(s.accounts?.tvmaze?.username||'')+'" placeholder="Usuário TVmaze"></label>'+
      '<label class="field"><span>API key Premium</span><input id="accountTvmazeKey" type="password" autocomplete="new-password" placeholder="'+(s.accounts?.tvmaze?.premiumKeyConfigured?'Chave configurada':'Chave do painel TVmaze')+'"></label>'+
      '<button type="button" class="btn btn-primary" data-action="settings-account-tvmaze">Salvar TVmaze Premium</button>'+
      '<a href="https://www.tvmaze.com/api" target="_blank" rel="noopener noreferrer">Documentação TVmaze ↗</a></div>'+
    '</div><div class="inline-info">IMDb: exporte suas listas em CSV na própria conta e importe no Criador. Não solicitamos a senha do IMDb.</div></section>'+
   '<section class="panel settings-panel"><div class="section-head"><h2>Capas com avaliações · Easy Ratings Database</h2>'+
    '<span class="badge '+(s.artwork?.enabled?'ok':'off')+'">'+(s.artwork?.enabled?'Ativo':'Desativado')+'</span></div>'+
    '<p class="panel-sub">Adicione notas do IMDb, Rotten Tomatoes, TMDB e outras fontes aos cartazes que o Nuvio recebe. O design e as fontes de nota são definidos no configurador do ERDB, não nas chaves do Hub.</p>'+
    '<div class="settings-providers"><div class="settings-provider">'+
      '<label class="settings-check"><input id="erdbEnabled" type="checkbox" '+(s.artwork?.requested?'checked':'')+'> Ativar capas ERDB nos metadados publicados para o Nuvio</label>'+
      '<label class="field"><span>Meu token Easy Ratings Database</span><input id="erdbToken" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="'+(s.artwork?.configured?'Token configurado (em branco mantém)':'Tk-... gerado no ERDB')+'"></label>'+
      '<label class="field"><span>Servidor de imagens ERDB (HTTPS)</span><input id="erdbBaseUrl" value="'+esc(s.artwork?.baseUrl||'https://easyratingsdb.com')+'" placeholder="https://easyratingsdb.com"></label>'+
      '<p class="panel-sub">Quais imagens substituir na exportação? As capas originais permanecem armazenadas.</p>'+
      '<div class="settings-resolutions">'+
       [['poster','Cartazes (pôsteres)'],['backdrop','Fundos (backdrops)'],['logo','Logos dos títulos'],['thumbnail','Miniaturas de episódios']].map(([id,label])=>
        '<label><input type="checkbox" data-erdb-kind="'+id+'" '+(s.artwork?.[id]?'checked':'')+'> '+label+'</label>').join('')+
      '</div><p class="muted">Títulos sem identificador IMDb/TMDB compatível mantêm a capa original. Imagens de coleção e miniaturas de addon não são substituídas.</p>'+
      '<div class="inline-info warning">O renderer ERDB usa o token no endereço público da imagem. Se ativado, esse token poderá aparecer nos URLs enviados ao Nuvio. Utilize um token próprio para renderização; nunca cole uma senha de conta.</div>'+
      '<div class="settings-actions"><button type="button" class="btn btn-primary" data-action="settings-erdb-save">Salvar configuração de capas</button>'+
        (s.artwork?.configured?'<button type="button" class="btn btn-subtle" data-action="settings-erdb-clear">Desativar e remover token</button>':'')+
        '<a href="https://easyratingsdb.com/configurator" target="_blank" rel="noopener noreferrer">Configurar meu estilo no ERDB ↗</a>'+
        '<a href="https://easyratingsdb.com/docs" target="_blank" rel="noopener noreferrer">Documentação da integração ↗</a>'+
      '</div></div></div></section>'+
   '<section class="panel settings-panel"><div class="section-head"><h2>Reprodução e legendas</h2>'+
    '<span class="badge">Perfil principal</span></div>'+
    '<p class="panel-sub">Preferências aplicadas ao agregador. Não alteram nem excluem addons ou catálogos.</p>'+
    '<div class="settings-resolutions"><strong>Resoluções aceitas</strong>'+
     ['4k','1080p','720p','480p'].map(x=>'<label><input type="checkbox" data-settings-resolution="'+x+'" '+checked(x)+'> '+x+'</label>').join('')+
     '</div>'+
    '<div class="builder-inline">'+
     '<label class="field"><span>Máximo por addon</span><input id="settings-max-addon" type="number" min="1" max="200" value="'+esc(f.maxStreamsPerAddon??10)+'"></label>'+
     '<label class="field"><span>Máximo total</span><input id="settings-max-total" type="number" min="1" max="200" value="'+esc(f.maxTotalStreams??30)+'"></label>'+
     '<label class="field"><span>Legendas preferidas (ISO 639-2)</span><input id="settings-languages" value="'+esc((f.subtitleLanguages||[]).join(', '))+'" placeholder="pob, por, eng"></label>'+
     '<label class="field"><span>Identificação dos streams</span><select id="settings-badge">'+
       [['addon','Nome do addon'],['clean','Limpa'],['none','Sem identificação']].map(([id,title])=>
        '<option value="'+id+'" '+(s.playback?.badgeFormat===id?'selected':'')+'>'+title+'</option>').join('')+'</select></label>'+
    '</div>'+
    '<label class="settings-check"><input id="settings-cams" type="checkbox" '+(f.removeCams?'checked':'')+'> Remover CAMs</label>'+
    '<label class="settings-check"><input id="settings-dedupe" type="checkbox" '+(s.playback?.deduplicate?'checked':'')+'> Remover streams duplicados</label>'+
    '<div class="settings-actions"><button class="btn btn-primary" data-action="settings-playback-save">Salvar reprodução e legendas</button></div></section>'+
   '<section class="panel settings-panel"><h2>Outras áreas de configuração</h2>'+
    '<p class="panel-sub">Mapa das configurações encontradas na aplicação. Os atalhos levam aos editores existentes, sem recriar os parâmetros.</p>'+
    '<div class="settings-links">'+
     [['addons','Addons e prioridades','URLs, recursos, ativação, timeout e status por origem'],
      ['catalogs','Catálogos e fontes','Biblioteca, listas, filtros, prioridade e publicação na Home'],
      ['collections','Coleções e aparência','Pastas, formatos, capas e vínculos de catálogos'],
      ['monitor','Saúde e diagnóstico','Disponibilidade, tempo de resposta e falhas'],
      ['publish','Publicação Nuvio','Manifesto, links, importação e compatibilidade']].map(([id,name,desc])=>
      '<button data-action="nav-'+id+'" class="settings-link"><strong>'+name+' →</strong><small>'+desc+'</small></button>').join('')+
    '</div><div class="inline-info">Em acompanhamento para próximas etapas: preferência de arte e metadados, cache, backups, catálogo Home e sincronizações opcionais. Nenhuma sincronização automática foi ativada.</div></section>'+
   '<section class="panel settings-panel"><h2>Créditos das fontes</h2>'+
    '<p class="panel-sub">Este produto usa a API do TMDB, mas não é endossado, certificado ou aprovado pelo TMDB.</p>'+
    '<p class="panel-sub">Os símbolos dos fornecedores servem apenas para identificar a origem. '+
    'Os respectivos nomes e marcas pertencem aos seus titulares.</p>'+
    '<div class="settings-actions"><a href="https://www.themoviedb.org/about/logos-attribution" target="_blank" rel="noopener noreferrer">Logos e atribuição TMDB ↗</a>'+
     '<a href="https://www.tvmaze.com/api" target="_blank" rel="noopener noreferrer">Créditos e API TVmaze ↗</a></div></section>'+
  '</div>';
}
async function updateSettingsKey(provider,clear=false){
 if(!writable())return;
 const field=$('integration-'+provider);
 if(!clear&&!field?.value.trim())return notify('Informe uma chave para salvar.');
 if(clear&&!confirm('Remover a chave local? Se existir variável de ambiente, ela voltará a ser usada.'))return;
 const payload={[provider]:clear?{clear:true}:{value:field.value}};
 try{
  await request('/api/hub/settings/integrations',{method:'POST',body:JSON.stringify(payload)});
  await loadHubSettings();notify(clear?'Chave local removida.':'Integração salva no servidor.');
 }catch(e){notify(e.message);}
}
let pendingTmdbRequest=null;
async function tmdbBeginAuthorization(){
 try{
  const result=await request('/api/hub/settings/tmdb/authorize',{method:'POST',body:'{}'});
  pendingTmdbRequest=result.requestToken;
  const box=$('settingsTmdbConnect');
  if(box){
   box.innerHTML='<p>1. Autorize o Nuvio Hub na página oficial do TMDB. '+
    '2. Retorne aqui e clique em Concluir conexão.</p>'+
    '<a href="'+esc(result.approvalUrl)+'" target="_blank" rel="noopener noreferrer" '+
     'class="btn btn-subtle">Abrir autorização oficial TMDB ↗</a>'+
    '<button type="button" class="btn btn-primary" data-action="settings-tmdb-complete">'+
     'Concluir conexão autorizada</button>';
  }
 }catch(e){notify(e.message);}
}
async function tmdbCompleteAuthorization(){
 if(!pendingTmdbRequest)return notify('Inicie a autorização TMDB novamente.');
 try{
  const result=await request('/api/hub/settings/tmdb/complete',{method:'POST',
   body:JSON.stringify({requestToken:pendingTmdbRequest})});
  pendingTmdbRequest=null;
  await loadHubSettings();notify('Conta TMDB vinculada'+(result.username?' ('+result.username+')':'')+'.');
 }catch(e){notify('Não foi possível concluir a autorização: '+e.message);}
}
async function saveArtworkErdb(clear=false){
 if(!writable())return;
 if(clear&&!confirm('Desativar o ERDB e remover seu token salvo? Os cartazes voltarão a usar as URLs originais.'))return;
 const payload=clear?{clearToken:true}:{
  enabled:$('erdbEnabled').checked,
  token:$('erdbToken').value.trim(),
  baseUrl:$('erdbBaseUrl').value.trim(),
  ...Object.fromEntries(['poster','backdrop','logo','thumbnail'].map(kind=>
   [kind,!!document.querySelector('[data-erdb-kind="'+kind+'"]')?.checked]))
 };
 try{
  await request('/api/hub/settings/artwork',{method:'POST',body:JSON.stringify(payload)});
  await loadHubSettings();
  notify(clear?'Capas ERDB desativadas. Token removido.':
   'Preferências de capas salvas. As próximas consultas do Nuvio usarão esta configuração.');
 }catch(e){notify(e.message);}
}
async function saveSourceAccount(provider){
 if(!writable())return;
 let payload={};
 if(provider==='trakt')payload={traktUsername:$('accountTraktUser').value.trim()||null};
 if(provider==='tmdb'){
  const id=$('accountTmdbId').value.trim(),session=$('accountTmdbSession').value.trim();
  payload={tmdbAccountId:id||null};
  if(session)payload.tmdbSessionId=session;
 }
 if(provider==='tvmaze'){
  const username=$('accountTvmazeUser').value.trim(),key=$('accountTvmazeKey').value.trim();
  payload={tvmazeUsername:username||null};
  if(key)payload.tvmazeKey=key;
 }
 try{
  await request('/api/hub/settings/accounts',{method:'POST',body:JSON.stringify(payload)});
  await loadHubSettings();notify('Conexão pessoal atualizada no servidor.');
 }catch(e){notify(e.message);}
}
async function saveHubPlayback(){
 if(!writable()||state.dirty)return notify('Salve primeiro as alterações pendentes da biblioteca.');
 const resolutions=[...document.querySelectorAll('[data-settings-resolution]:checked')].map(e=>e.dataset.settingsResolution);
 const languages=$('settings-languages').value.toLowerCase().split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
 const config={filters:{resolutions,removeCams:$('settings-cams').checked,
  maxStreamsPerAddon:Number($('settings-max-addon').value),
  maxTotalStreams:Number($('settings-max-total').value),
  subtitleLanguages:languages},
  badgeFormat:$('settings-badge').value,deduplicate:$('settings-dedupe').checked};
 try{
  const result=await request('/api/hub/settings/playback',{method:'POST',body:JSON.stringify(config)});
  state.profile.filters=result.playback.filters;
  state.profile.badgeFormat=result.playback.badgeFormat;
  state.profile.deduplicate=result.playback.deduplicate;
  await loadHubSettings();notify('Preferências de reprodução salvas.');
 }catch(e){notify(e.message);}
}
async function scanProviders(){
 if(!writable())return;
 notify('Consultando recursos dos addons instalados...');
 try{
  const result=await request('/api/hub/providers');
  state.providers=result.addons||[];
  render();notify(state.providers.length+' addons classificados por recursos e catálogos.');
 }catch(e){notify('Erro na identificação: '+e.message);}
}
async function reorderAddons(ordered){
 if(!writable()||state.addonBusy)return;
 const before=state.profile.addons||[];
 const order=ordered.map(a=>a.url),expectedOrder=before.map(a=>a.url);
 if(order.length!==expectedOrder.length||order.every((u,i)=>u===expectedOrder[i]))return;
 state.addonBusy=true;render();
 try{
  const result=await request('/api/hub/addons',{method:'POST',body:JSON.stringify({
   action:'reorder',order,expectedOrder
  })});
  state.profile.addons=result.addons;state.providers=[];
  await refreshAddonMonitor({renderNow:false});
  notify('Prioridade salva. A próxima consulta no Nuvio seguirá a nova ordem.');
 }catch(e){
  notify('Não foi possível mudar a prioridade: '+e.message);
  if(/outra sessão/.test(e.message))await reload();
 }finally{state.addonBusy=false;render();}
}
function priorityMove(url,placement){
 const addons=state.profile.addons||[];
 const index=addons.findIndex(a=>a.url===url);
 if(index<0)return;
 const target=placement==='first'?0:index+(placement==='up'?-1:1);
 if(target<0||target>=addons.length||index===target)return;
 const next=[...addons];next.splice(target,0,next.splice(index,1)[0]);
 return reorderAddons(next);
}
function priorityDragTo(src,dst){
 if(!src||!dst||src===dst||state.addonFilter!=='all'||state.search.trim())return;
 const addons=state.profile.addons||[];
 const from=addons.findIndex(a=>a.url===src),to=addons.findIndex(a=>a.url===dst);
 if(from<0||to<0)return;
 const result=[...addons];result.splice(to,0,result.splice(from,1)[0]);
 return reorderAddons(result);
}
function configureAddon(url){
 if(!writable())return;
 const addon=(state.profile.addons||[]).find(x=>x.url===url);
 if(!addon)return notify('Addon não encontrado.');
 const index=(state.profile.addons||[]).indexOf(addon);
 const check=(state.monitor?.items||[])[index]?.health;
 const desired=addon.resources||['stream'];
 const hints=check?.resources||[];
 const names={stream:'Reprodução (streams)',catalog:'Catálogos',meta:'Metadados (fichas)',subtitles:'Legendas'};
 const choices=Object.entries(names).map(([key,label])=>
  '<label class="addon-resource-choice"><input type="checkbox" name="addonResource" value="'+key+'" '+
  (desired.includes(key)?'checked ':'')+'>'+
  '<span><b>'+label+'</b><small>'+(hints.includes(key)?'Detectado no manifesto':'Não confirmado na origem')+
  '</small></span></label>').join('');
 const configured=Number.isInteger(addon.requestTimeoutMs)?addon.requestTimeoutMs:7500;
 showModal('Configurar · '+addon.name,
  '<p class="muted">Estas opções controlam o que o Agregador solicita a este addon. '+
   'O estado do serviço na origem é medido separadamente, sem ativar ou desativar automaticamente.</p>'+
  '<label class="field"><span>Tempo limite por busca (3 a 30 segundos)</span>'+
   '<input id="addonTimeout" type="number" min="3" max="30" step="0.5" value="'+(configured/1000)+'">'+
   '<small class="muted">O limite vale para streams, legendas e catálogos. Mais tempo pode aumentar a espera no Nuvio.</small></label>'+
  '<fieldset class="addon-resource-fieldset"><legend>Recursos permitidos neste addon</legend>'+
   choices+'</fieldset>'+
  '<label class="addon-resource-choice addon-include"><input type="checkbox" id="addonIncludeCatalogs" '+
    (addon.includeCatalogs&&desired.includes('catalog')?'checked ':'')+
   '><span><b>Expor diretamente catálogos configurados no manifesto do Agregador</b>'+
   '<small>Opcional. Para escolher catálogos individuais, use a aba Catálogos do Studio. '+
   'A opção direta só funciona para catálogos já reconhecidos na configuração.</small></span></label>'+
  '<div class="inline-info">Origem: '+esc(check?.status||'não verificada')+
   ' · '+esc(check?.message||'aguardando')+
   ' · Declarados: '+esc(hints.join(', ')||'não detectados')+
   ' · '+(check?.catalogCount??0)+' catálogos na última consulta.</div>',
 async()=>{
  const seconds=Number($('addonTimeout').value);
  if(!Number.isFinite(seconds)||seconds<3||seconds>30)
   throw Error('O tempo limite deve estar entre 3 e 30 segundos.');
  const timeoutMs=Math.round(seconds*1000);
  const resources=[...document.querySelectorAll('#modal input[name="addonResource"]:checked')]
   .map(c=>c.value);
  if(resources.length===0&&!confirm('Nenhum recurso selecionado. O addon não fornecerá conteúdo ao Agregador. Continuar?'))return false;
  const missing=resources.filter(r=>hints.length&&!hints.includes(r));
  if(missing.length&&!confirm('A origem não declarou: '+missing.join(', ')+
   '. O addon poderá não responder a esse tipo de consulta. Salvar mesmo assim?'))return false;
  const includeCatalogs=$('addonIncludeCatalogs').checked;
  const response=await request('/api/hub/addons',{method:'POST',
   body:JSON.stringify({action:'configure',url,resources,requestTimeoutMs:timeoutMs,includeCatalogs})
  });
  state.profile.addons=response.addons;
  await refreshAddonMonitor({renderNow:false});
  render();notify('Configuração salva. A origem permanece independente da ativação.');
 },{confirmText:'Salvar configuração'});
}
async function refreshAddonMonitor({renderNow=true,force=false}={}){
 try{
  state.monitor=await request(force?'/api/monitor/check':'/api/monitor',
    force?{method:'POST',body:'{}'}:{});
  // Nunca reconstruir as linhas no meio de um drag-and-drop: isso cancelaria
  // o evento drop quando o monitor concluísse sua consulta assíncrona.
  if(renderNow && state.view==='addons' && $('modal').hidden && !draggedAddon && document.activeElement?.id!=='searchAddons')render();
  if(force)notify('Verificação concluída. O manifesto online não garante fontes de reprodução para todo título.');
 }catch(e){notify('Monitoramento: '+e.message);}
}
async function addonAction(action,url,enabled){
 if(!writable())return;
 if(action==='remove'&&!confirm('Remover este addon do Agregador? Os outros serão preservados.'))return;
 if(action==='toggle'&&enabled===true){
   const addon=(state.profile.addons||[]).find(a=>a.url===url);
   const i=(state.profile.addons||[]).indexOf(addon);
   const status=(state.monitor?.items||[])[i]?.health?.status;
   if(status&&status!=='online'&&
     !confirm('O addon apresenta status "'+status+'" na origem. Ativá-lo aqui não restaura o serviço externo. Deseja habilitar mesmo assim?'))return;
 }
 try{
  const result=await request('/api/hub/addons',{method:'POST',body:JSON.stringify({action,url,enabled})});
  state.profile.addons=result.addons;
  state.providers=[];state.collectionInventory='idle';
  await refreshAddonMonitor({renderNow:false});render();notify('Lista do Agregador atualizada. O editor usará a mesma configuração.');
 }catch(e){notify(e.message);}
}
function addAddon(){
 if(!writable())return;
 showModal('Adicionar addon ao Agregador',`
  <label class="field"><span>URL do manifesto JSON</span><input id="aUrl" placeholder="https://.../manifest.json"></label>
  <label class="field"><span>Nome de identificação</span><input id="aName" placeholder="Ex.: Meu provedor"></label>
  <div class="inline-info">O mesmo addon aparecerá no Agregador e na biblioteca de fontes para suas coleções.</div>`,async()=>{
  const url=mandatory('aUrl','a URL do manifesto'),name=mandatory('aName','um nome');
  if(!/^https:\/\//.test(url))throw Error('Use URL HTTPS.');
  // validar antes de registrar
  const test=await request('/api/validate-addon',{method:'POST',body:JSON.stringify({url})});
  if(!test.valid)throw Error('Manifesto inválido: '+test.error);
  await request('/api/hub/addons',{method:'POST',body:JSON.stringify({action:'add',url,name,resources:test.resources,catalogs:test.catalogs})});
  state.profile=(await request('/api/profiles/main')).profile.config;
  render();notify('Addon adicionado. Abra Catálogos para identificar seus recursos.');
 },{confirmText:'Adicionar ao Hub'});
}
// Substituição deliberada: mantém tipo filme/série e nunca altera o JSON importado
// antes de confirmar o modal e clicar no botão geral Salvar alterações.
function replaceCollectionSource(index=null){
 if(!writable()||!folder())return;
 const adding=index===null;
 if(state.collectionInventory!=='ready'){
  notify('Aguarde o reconhecimento dos catálogos antes de substituir.');
  return;
 }
 const targetGroup=group().id,targetFolder=folder().id;
 const current=editableSources(folder()),original=adding?null:current[index];
 if(!adding&&!original)return notify('A referência não existe mais. Atualize a pasta.');
 const originalKey=original?sourceKey(original):null;
 const resolver=collectionResolver(),type=original?.type||null;
 const choices=(adding?[...resolver.candidates('movie'),...resolver.candidates('series')]:
  resolver.candidates(type)).filter(candidate=>{
  const c=candidate.catalog;
  const addonId=candidate.from==='hub'?(c.addonId||'nuvio.studio'):candidate.addon.addonId;
  const identity=[addonId,candidate.type,c.id,''].join('::');
  return !current.some((src,i)=>i!==index&&sourceKey(src)===identity);
 });
 if(!choices.length)return notify('Nenhum catálogo reconhecido está disponível para este vínculo.');
 let selected=null,page=0,term='',kind='all',media='all';
 const pageSize=24;
 showModal(adding?'Adicionar catálogo à pasta':'Substituir catálogo da coleção',
  (adding?'<p class="panel-sub">Escolha um catálogo dos addons ou da biblioteca do Hub.</p>':
   '<p class="panel-sub">Original: <strong>'+esc(original.title||original.catalogId||original.catalog_id)+'</strong>'+
   ' · '+(type==='series'?'Séries':'Filmes')+'</p>')+
  '<div class="inline-info">Escolha um catálogo '+(adding?'de filmes ou séries':'do mesmo tipo')+', criado no Hub ou anunciado por um addon ativo. '+
   'Isso não confirma títulos nem reprodução. A alteração só será gravada depois de Salvar alterações.</div>'+
  (original?.genre?'<div class="inline-info warning">A substituição removerá o filtro de gênero associado ao vínculo original.</div>':'')+
  '<div class="collection-repair-controls">'+
   '<label class="field"><span>Procurar catálogo</span><input id="repairCatalogSearch" type="search" placeholder="Nome ou origem"></label>'+
   '<label class="field"><span>Origem</span><select id="repairCatalogOrigin">'+
    '<option value="all">Todas</option><option value="hub">Catálogos criados no Hub</option>'+
    '<option value="addon">Catálogos dos addons</option></select></label>'+
   (adding?'<label class="field"><span>Tipo</span><select id="repairCatalogType">'+
    '<option value="all">Filmes e séries</option><option value="movie">Filmes</option>'+
    '<option value="series">Séries</option></select></label>':'')+'</div>'+
  '<p id="repairCatalogSummary" class="muted"></p>'+
  '<div id="repairCatalogChoices" class="collection-repair-options"></div>'+
  '<div id="repairCatalogPages" class="addon-bulk-pages"></div>',
  ()=>{
   if(!selected)throw Error('Escolha primeiro o catálogo de substituição.');
   const g=groups().find(g=>g.id===targetGroup),f=g?.folders?.find(f=>f.id===targetFolder);
   if(!f)throw Error('A pasta foi alterada. Abra novamente.');
   const list=editableSources(f);
   if(!adding&&sourceKey(list[index])!==originalKey)
    throw Error('O vínculo original mudou. Abra novamente para evitar sobrescrever outra alteração.');
   const entry=selected.catalog;
   const replacement=selected.from==='hub'
    ?{provider:'addon',addonId:entry.addonId||'nuvio.studio',
       type:selected.type, catalogId:entry.id,genre:null,title:entry.name,
       ...(entry.sourceUrl?{addonBaseUrl:BASE}:{})}
    :{provider:'addon',addonId:selected.addon.addonId,
       type:selected.type,catalogId:entry.id,genre:null,title:entry.name};
   if(list.some((s,i)=>i!==index&&sourceKey(s)===sourceKey(replacement)))
    throw Error('Esse catálogo já está vinculado à pasta.');
   if(adding)list.push(replacement);
   else list[index]=replacement;
   markDirty();render();
   notify((adding?'Catálogo vinculado':'Catálogo substituído')+
    ' nesta pasta. Clique em Salvar alterações para publicar.');
  },{confirmText:adding?'Adicionar catálogo':'Usar catálogo selecionado'});
 const submit=$('modalSubmit'),search=$('repairCatalogSearch'),
  origin=$('repairCatalogOrigin'),mediaFilter=$('repairCatalogType'),
  rows=$('repairCatalogChoices'),pages=$('repairCatalogPages'),
  summary=$('repairCatalogSummary');
 submit.disabled=true;
 function matched(){
  const q=term.toLocaleLowerCase('pt-BR');
  return choices.filter(c=>(kind==='all'||c.from===kind)&&
   (media==='all'||c.type===media)&&
   (!q||(c.name+' '+c.provider+' '+c.catalog.id).toLocaleLowerCase('pt-BR').includes(q)));
 }
 function update(){
  const items=matched(),paged=paginateItems(items,page,pageSize);
  page=paged.page;
  const {slice,offset,totalPages:pagesCount}=paged;
  rows.innerHTML=slice.map((c,i)=>
   '<button type="button" class="collection-repair-choice '+
    (selected?.key===c.key?'is-selected':'')+
    '" data-repair-choice="'+(offset+i)+'" aria-pressed="'+(selected?.key===c.key)+'">'+
    '<strong>'+esc(c.name)+'</strong><small>'+esc(c.provider)+' · '+
     (c.type==='series'?'Séries':'Filmes')+' · '+
     (c.from==='hub'?'Biblioteca do Hub':'Manifesto do addon')+'</small></button>').join('')||
   '<div class="inline-info warning">Nenhum catálogo desse tipo foi encontrado para os filtros selecionados.</div>';
  summary.textContent=items.length+' opções disponíveis · '+(selected?'Selecionado: '+selected.name:'Nenhum selecionado');
  pages.innerHTML=renderPagerButtons({page,totalPages:pagesCount,attr:'data-repair-page',
   summaryText:'Página '+(page+1)+' de '+pagesCount,prevLabel:'Anterior',nextLabel:'Próxima'});
  submit.disabled=!selected;
  submit.textContent=selected?'Usar '+selected.name.slice(0,45):'Escolha um catálogo';
 }
 search.oninput=()=>{term=search.value.trim();page=0;update();};
 origin.onchange=()=>{kind=origin.value;page=0;update();};
 if(mediaFilter)mediaFilter.onchange=()=>{media=mediaFilter.value;page=0;update();};
 rows.onclick=e=>{
  const entry=e.target.closest('[data-repair-choice]');
  if(!entry)return;
  selected=matched()[Number(entry.dataset.repairChoice)]||null;
  update();
 };
 pages.onclick=e=>{
  const btn=e.target.closest('[data-repair-page]');
  if(!btn)return;
  page+=Number(btn.dataset.repairPage);update();
 };
 update();
}

function createGroup(){
 if(!writable())return;
 showModal('Nova coleção',`
 <label class="field"><span>Nome da coleção</span><input id="newGroupName" placeholder="Ex.: Filmes para o fim de semana" maxlength="100"></label>
 <label class="field"><span>Organização inicial</span><select id="newGroupMode"><option value="TABBED_GRID">Pastas em abas</option><option value="GRID">Grade</option></select></label>`,()=>{
  const title=mandatory('newGroupName','o nome da coleção');
  const id=uuid('collection');
  groups().push({id,title,viewMode:$('newGroupMode').value,folders:[]});
  state.selectedGroup=id;state.selectedFolder=null;markDirty();navigate('collections');
 },{confirmText:'Criar coleção'});
}
function createFolder(){
 if(!writable()||!group())return;
 showModal('Nova pasta',`
 <label class="field"><span>Nome da pasta</span><input id="newFolderName" placeholder="Ex.: Documentários" maxlength="100"></label>
 <label class="field"><span>Formato da capa</span>
 <select id="newFolderShape"><option>LANDSCAPE</option><option>POSTER</option><option>SQUARE</option><option>PORTRAIT</option></select></label>`,()=>{
   const title=mandatory('newFolderName','o nome da pasta');
   const id=uuid('folder');group().folders.push({id,title,tileShape:$('newFolderShape').value,catalogSources:[]});
   state.selectedFolder=id;markDirty();render();
 },{confirmText:'Criar pasta'});
}
function move(array,index,diff){
 const dest=index+diff;
 if(index<0||dest<0||dest>=array.length)return false;
 array.splice(dest,0,array.splice(index,1)[0]);markDirty();render();return true;
}
async function createCatalog(existing=null){
 if(!writable())return;
 if(existing&&(!existing.listSource||existing.listSource.provider==='manual'))return editCatalog(existing.id);
 const capabilities=await request('/api/hub/lists/capabilities').catch(()=>({
  sources:[{id:'imdb',label:'IMDb'},
   {id:'mdblist',label:'MDBList'},{id:'tvmaze',label:'TVmaze'},{id:'trakt',label:'Trakt'},
   {id:'tmdb',label:'TMDB'},{id:'addon',label:'Addons'}],
  keys:{trakt:false,tmdb:false,mdblist:false}
 }));
 const providers=[
  {id:'mdblist',title:'MDBList',logo:'/provider-logos/mdblist.svg',subtitle:'Listas públicas e curadores.'},
  {id:'tvmaze',title:'TVmaze',logo:'/provider-logos/tvmaze.png',subtitle:'Pesquisa e programação de séries, sem chave.'},
  {id:'trakt',title:'Trakt.tv',logo:'/provider-logos/trakt.svg',subtitle:'Listas de usuários.'},
  {id:'imdb',title:'IMDb',logo:'/provider-logos/imdb.svg',subtitle:'Listas CSV, JSON ou IDs.'},
  {id:'tmdb',title:'TMDB',logo:'/provider-logos/tmdb.svg',subtitle:'Populares, tendências e filtros.'},
  {id:'addon',title:'Addons',logo:'/provider-logos/addons.svg',subtitle:'Catálogos dos provedores.'}
 ];
 let source=existing?.listSource?.provider||'mdblist',preview=null;
 const addonSelected=new Set();let addonPicker=null,addonOrigin='',addonLoading=null;
 let ownMDBLists=[],ownTraktLists=[],ownTmdbLists=[];
 const selected=existing?.listSource||{};
 const filters=selected.filters||{};
 const srcButtons=providers.map(item=>'<button type="button" class="builder-source source-'+
   item.id+'" data-builder-source="'+item.id+'" aria-pressed="false">'+
   '<span class="builder-source-mark" aria-hidden="true">'+
   '<span class="builder-source-fallback">'+
    ({mdblist:'M',tvmaze:'TV',trakt:'T',imdb:'IMDb',tmdb:'TMDB',addon:'▦'}[item.id])+
   '</span><img class="builder-source-logo" src="'+esc(item.logo)+
   '" alt="" loading="eager" decoding="async"></span><b>'+esc(item.title)+'</b><small>'+esc(item.subtitle)+
   (['trakt','tmdb'].includes(item.id)&&!capabilities.keys?.[item.id]?' · API pendente':'')+
   '</small></button>').join('');
 const genreOptions=(capabilities.genres||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 const markup=
  '<div class="builder-intro"><div class="builder-steps" role="tablist" aria-label="Etapas do criador">'+
   ['Fonte','Preferências','Prévia','Salvar'].map((name,i)=>
    '<button type="button" class="builder-step" id="builderTab'+(i+1)+'" data-builder-step="'+(i+1)+
    '" role="tab" aria-controls="builderPanel'+(i+1)+'" aria-selected="false"><span>'+
    (i+1)+'</span>'+name+'</button>').join('')+'</div>'+
   '<p>Configure seu catálogo e confira o conteúdo antes de adicioná-lo à biblioteca do Nuvio.</p></div>'+
  '<section class="builder-pane" data-builder-panel="1" id="builderPanel1" role="tabpanel" aria-labelledby="builderTab1">'+
  '<div class="builder-section-title"><strong>Escolha a origem e identifique o catálogo</strong></div>'+
  '<div id="builderSourceGrid" class="builder-sources">'+srcButtons+'</div>'+
  '<div class="builder-fields">'+
   '<label class="field" id="builderNameField"><span>Nome do catálogo</span><input id="catName" maxlength="90" placeholder="Ex.: Melhores filmes de ficção científica" value="'+
     esc(existing?.name||'')+'"></label>'+
   '<div class="builder-inline" id="builderSourceMetaFields">'+
    '<label class="field"><span>Tipo de conteúdo</span>'+
     '<select id="catType"><option value="movie">Somente filmes</option><option value="series">Somente séries</option>'+
     '<option value="both">Filmes e séries (lista completa)</option></select></label>'+
    '<label class="field"><span>Quantidade de títulos</span><select id="builderLimitMode">'+
      '<option value="all" '+(filters.limit==null||filters.limit===0?'selected':'')+'>Todos os disponíveis (sem corte)</option>'+
      '<option value="custom" '+(filters.limit>0?'selected':'')+'>Definir quantidade máxima</option></select></label>'+
    '<label class="field" id="builderLimitField" '+(filters.limit>0?'':'hidden')+'><span>Máximo de títulos</span>'+
      '<input id="builderLimit" type="number" min="1" max="20000" value="'+
       esc(filters.limit||100)+'"></label>'+
   '</div>'+
   '<p class="muted" id="builderUnlimitedHint">Todos os disponíveis percorre as páginas da origem sem o corte de 100 ou 1.000. Por segurança, o Hub processa até 20.000 títulos por catálogo e respeita os limites oficiais de cada API.</p>'+
   '<div id="builderSourceOptions" class="builder-source-options"></div></div></section>'+
   '<section class="builder-pane" data-builder-panel="2" id="builderPanel2" role="tabpanel" aria-labelledby="builderTab2" hidden>'+
   '<div class="builder-fields" id="builderStandardPreferences"><div class="builder-section-title"><strong>Personalização dos resultados</strong><small>Opcional, aplicada antes de importar</small></div>'+
   '<div class="builder-inline">'+
    '<label class="field"><span>Ordenação</span><select id="builderSort">'+
     '<option value="source">Ordem original da fonte</option><option value="title-asc">Título: A → Z</option>'+
     '<option value="title-desc">Título: Z → A</option><option value="year-desc">Mais recentes</option>'+
     '<option value="year-asc">Mais antigos</option><option value="rating-desc">Melhores avaliações</option>'+
     '<option value="rating-asc">Menores avaliações</option></select></label>'+
    '<label class="field"><span>Nota mínima (0 a 10)</span>'+
      '<input id="builderRating" type="number" min="0" max="10" step="0.5" placeholder="Opcional" value="'+
       esc(filters.minRating??'')+'"></label>'+
   '</div>'+
   '<div class="builder-inline">'+
    '<label class="field"><span>Ano inicial</span><input id="builderYearFrom" type="number" min="1900" max="2100" placeholder="Ex.: 2015" value="'+
       esc(filters.yearFrom??'')+'"></label>'+
    '<label class="field"><span>Ano final</span><input id="builderYearTo" type="number" min="1900" max="2100" placeholder="Ex.: 2026" value="'+
       esc(filters.yearTo??'')+'"></label>'+
   '</div>'+
   '<div class="builder-inline" id="builderTmdbExtra" hidden>'+
    '<label class="field"><span>Mínimo de avaliações (votos)</span>'+
     '<input id="builderMinVotes" type="number" min="0" max="1000000" placeholder="Ex.: 100" value="'+
      esc(filters.minVotes??'')+'"></label>'+
    '<label class="field"><span>Idioma original (ISO 639-1)</span>'+
     '<input id="builderLanguage" maxlength="2" placeholder="pt, en, th..." value="'+
      esc(filters.originalLanguage||'')+'"></label></div>'+
   '<label class="builder-check"><input type="checkbox" id="builderShowHome" '+
    (existing?.showInHome?'checked':'')+'><span>Mostrar também como catálogo independente na página inicial do Nuvio (se o player oferecer suporte).</span></label></div>'+
    '<div id="builderAddonPreferences" hidden></div></section>'+
   '<section class="builder-pane" data-builder-panel="3" id="builderPanel3" role="tabpanel" aria-labelledby="builderTab3" hidden>'+
   '<div class="builder-step-heading"><strong>Confira os títulos antes de salvar</strong>'+
    '<small>A pré-visualização não altera sua biblioteca.</small></div>'+
   '<div class="builder-preview-actions"><button type="button" class="btn btn-subtle" id="builderPreviewBtn">Pré-visualizar títulos</button>'+
    '<span id="builderPreviewStatus" role="status" class="muted">Configure a origem e visualize os títulos antes de criar.</span></div>'+
   '<div class="builder-preview" id="builderPreviewResults" aria-live="polite"></div>'+
   '</section>'+
   '<section class="builder-pane" data-builder-panel="4" id="builderPanel4" role="tabpanel" aria-labelledby="builderTab4" hidden>'+
    '<div class="builder-step-heading"><strong>Revisão final</strong>'+
     '<small>Revise suas escolhas. Nada será publicado até usar Salvar alterações no Hub.</small></div>'+
    '<div class="builder-final-summary" id="builderFinalSummary"></div>'+
   '</section>';
 showModal(existing?'Editar fonte · '+existing.name:'Criador avançado de catálogos',markup,async()=>{
  if(source==='addon'){
   if(!preview||preview.signature!==addonSignature())
    throw Error('Revise novamente a seleção dos catálogos antes de adicioná-los.');
   const items=addonPicker?.getSelected()||[];
   if(!items.length)throw Error('Nenhum catálogo de addon selecionado.');
   const result=includeAddonCatalogBatch(items);
   if(!result.added)throw Error('Nenhum catálogo novo disponível para adicionar.');
   navigate('catalogs');
   notify(result.added+' catálogos adicionados à biblioteca'+
    (result.skipped?' · '+result.skipped+' ignorados':'')+
    '. Clique em Salvar alterações para publicar.');
   return;
  }
  const name=mandatory('catName','o nome do catálogo');
  const type=$('catType').value;
  if(source==='addon')return false;
  let metas=[];
  if(source!=='manual'){
   const payload=await readPayload();
   if(!preview||preview.signature!==JSON.stringify(payload))
    throw Error('Clique em Pré-visualizar novamente para confirmar suas configurações.');
   metas=preview.result.metas;
   if(!metas.length)throw Error('Nenhum título encontrado para este catálogo.');
  }else if(existing?.manual&&(!existing.listSource||existing.listSource.provider==='manual')){
   metas=existing.metas||[];
  }
  const settings=buildFilters(),opts=sourceOptions();
  const selectedBoth=['mdblist','tmdb','imdb','trakt'].includes(source)&&type==='both';
  const outputs=selectedBoth?['movie','series'].map(mediaType=>({
   type:mediaType,metas:metas.filter(x=>x.type===mediaType)
  })).filter(x=>x.metas.length):[{type,metas}];
  if(!outputs.length)throw Error('Não há filmes ou séries compatíveis para adicionar.');
  if(existing&&selectedBoth&&!outputs.some(x=>x.type===existing.type))
   throw Error('A lista mista não contém títulos do tipo do catálogo em edição. Crie um catálogo novo.');
  const existingType=existing?.type||null;
  for(const output of outputs){
   const catalogue=existing&&output.type===existingType?existing:
    {id:uuid('studio'),addonId:BRIDGE_ID,manual:true};
   catalogue.name=selectedBoth?name+' ('+(output.type==='movie'?'Filmes':'Séries')+')':name;
   catalogue.type=output.type;catalogue.metas=output.metas;
   catalogue.showInHome=$('builderShowHome').checked;
   if(source==='manual'){
    catalogue.listSource={provider:'manual',mode:'manual',filters:settings,
     updatedAt:new Date().toISOString()};
   }else{
    catalogue.listSource={
     provider:source,url:preview.result.url||opts.url||null,
     ...(['mdblist','tmdb'].includes(source)&&opts.listId?{listId:opts.listId}:{}),
     ...(source==='tmdb'&&opts.listVersion?{listVersion:opts.listVersion}:{}),
     ...(selectedBoth?{importSelection:'both'}:{}),
     ...(source==='trakt'&&els('builderTraktUser')?.value?.trim()?
       {username:els('builderTraktUser').value.trim()}:{}),
     query:source==='tvmaze'?opts.query:null,
     mode:opts.mode||'snapshot',filters:settings,
     updatedAt:new Date().toISOString(),method:preview.result.method||null};
   }
   if(catalogue!==existing)catalogs().push(catalogue);
  }
  state.catalogPage=Math.max(0,Math.ceil(catalogs().length/50)-1);
  markDirty();navigate('catalogs');
  notify((existing?'Catálogo atualizado':'Catálogo adicionado')+
   ': '+outputs.length+' '+(outputs.length===1?'catálogo':'catálogos')+
   ' com '+metas.length+' títulos. Salve as alterações para publicar no Nuvio.');
 },{confirmText:existing?'Salvar catálogo':'Adicionar à biblioteca'});
 const modal=document.querySelector('#modal .modal');
 modal?.classList.add('catalog-builder-modal');
 const submit=$('modalSubmit');
 // Uma única etapa por vez: ações contextuais no rodapé fixo.
 const backButton=document.createElement('button');
 backButton.type='button';backButton.id='builderBack';backButton.className='btn btn-subtle';
 backButton.textContent='← Voltar';
 const nextButton=document.createElement('button');
 nextButton.type='button';nextButton.id='builderNext';nextButton.className='btn btn-primary';
 nextButton.textContent='Continuar →';
 $('modalActions').insertBefore(backButton,submit);
 $('modalActions').insertBefore(nextButton,submit);
 let currentStep=1;
 submit.disabled=true;
 const builderSources=[...document.querySelectorAll('#builderSourceGrid [data-builder-source]')];
 document.querySelectorAll('#builderSourceGrid .builder-source-logo').forEach(img=>{
  img.addEventListener('error',()=>img.closest('.builder-source-mark')?.classList.add('logo-missing'));
 });
 const els=id=>$(id);
 const selectedType=existing?.type||'movie';
 els('catType').value=selectedType;
 els('builderSort').value=filters.sort||'source';
 const status=els('builderPreviewStatus');
 function addonSignature(){return JSON.stringify([...addonSelected].sort());}
 function currentAddonItems(){
  const keys=new Set(addonSelected);
  return availableAddonCatalogs().filter(item=>keys.has(item.key)&&!item.existing);
 }
 async function prepareAddonPicker(){
  if(addonLoading)return addonLoading;
  const load=async()=>{
   try{
    await loadAddonCatalogInventory();
    if(source!=='addon'||$('modal').hidden)return;
    const select=els('builderAddonOrigin'),label=els('builderAddonLoadStatus'),
     container=els('builderAddonPreferences');
    if(!select||!container)return;
    const p=state.providers.filter(x=>x.enabled!==false&&x.status==='ok'&&x.catalogs?.length);
    select.innerHTML='<option value="">Todos os addons</option>'+
     p.map(x=>'<option value="'+esc(x.url)+'">'+esc(x.name)+
       ' ('+x.catalogs.length+' catálogos)</option>').join('');
    select.value=addonOrigin;
    select.onchange=()=>{
     addonOrigin=select.value;
     addonPicker=mountAddonCatalogPicker(container,{selected:addonSelected,
      providerUrl:addonOrigin,onChange:changed=>{if(preview){
       preview=null;els('builderPreviewResults').innerHTML='';
       status.textContent='Seleção alterada. Revise a prévia novamente.';
      }updateBuilderStep();}});
    };
    label.textContent=availableAddonCatalogs().length+' catálogos disponíveis em '+
     p.length+' addons. Os que já foram adicionados não serão duplicados.';
    select.onchange();
   }catch(error){
    if(source==='addon'&&els('builderAddonLoadStatus'))
     els('builderAddonLoadStatus').textContent='Não foi possível consultar addons: '+error.message;
    notify('Erro ao consultar catálogos dos addons.');
   }
  };
  addonLoading=load().finally(()=>{addonLoading=null;});
  return addonLoading;
 }
 function showAddonPreview(items){
  const resultPanel=els('builderPreviewResults');
  let page=0,term='';const perPage=40;
  const supplier=[...new Set(items.map(x=>x.provider.name))];
  resultPanel.innerHTML='<div class="builder-preview-summary"><b>'+
   items.length+' catálogos prontos para incorporar</b>'+
   '<span>'+items.filter(x=>x.source.type==='movie').length+' filmes · '+
   items.filter(x=>x.source.type==='series').length+' séries · '+
   supplier.length+' addons</span></div>'+
   '<div class="inline-info">Esta prévia confere os catálogos anunciados nos manifestos dos addons. Os títulos e pôsteres de cada catálogo são carregados do respectivo addon no Nuvio.</div>'+
   '<label class="field"><span>Pesquisar na seleção</span>'+
   '<input type="search" id="builderAddonReviewSearch" placeholder="Nome ou addon"></label>'+
   '<div id="builderAddonReviewRows" class="addon-bulk-results"></div>'+
   '<div id="builderAddonReviewPages" class="addon-bulk-pages"></div>';
  const results=els('builderAddonReviewRows'),pages=els('builderAddonReviewPages'),
   search=els('builderAddonReviewSearch');
  function update(){
   const match=items.filter(x=>(x.source.name+' '+x.provider.name+' '+x.source.id)
    .toLocaleLowerCase('pt-BR').includes(term));
   const paged=paginateItems(match,page,perPage);
   page=paged.page;
   results.innerHTML=paged.slice.map(item=>
    '<div class="addon-bulk-row"><span><strong>'+esc(item.source.name)+
    '</strong><small>'+esc(item.provider.name)+' · '+
    (item.source.type==='movie'?'Filme':'Série')+' · '+esc(item.source.id)+
    '</small></span></div>').join('')||
    '<p class="inline-info">Nenhum catálogo corresponde à pesquisa.</p>';
   pages.innerHTML=renderPagerButtons({page,totalPages:paged.totalPages,attr:'data-review-page',
    summaryText:match.length+' catálogos · Página '+(page+1)+' de '+paged.totalPages,
    prevLabel:'Anterior',nextLabel:'Próxima'});
  }
  search.oninput=e=>{e.stopPropagation();term=search.value.trim().toLocaleLowerCase('pt-BR');page=0;update();};
  pages.onclick=e=>{e.stopPropagation();
   const btn=e.target.closest('[data-review-page]');
   if(btn){page+=Number(btn.dataset.reviewPage);update();}
  };
  update();
 }

 function sourceOptions(){
  return {url:els('builderUrl')?.value?.trim()||'',mode:els('builderMode')?.value||'',
    text:els('builderText')?.value||'',query:els('builderQuery')?.value?.trim()||'',
    listId:source==='mdblist'?(Number(els('builderOwnList')?.value)||null):
      source==='tmdb'?(els('builderOwnTmdb')?.value||els('builderListId')?.value?.trim()||null):null,
    listVersion:source==='tmdb'?(els('builderOwnTmdb')?.selectedOptions?.[0]?.dataset.version||
      els('builderListVersion')?.value||'v4'):null};
 }
 function buildFilters(){
  return {
   sort:els('builderSort').value,
   limit:els('builderLimitMode').value==='all'?null:Number(els('builderLimit').value),
   minRating:els('builderRating').value,
   yearFrom:els('builderYearFrom').value,
   yearTo:els('builderYearTo').value,
   genre:els('builderGenre')?.value||'',
   region:els('builderRegion')?.value||'BR',
   watchProvider:els('builderWatchProvider')?.value||'',
   excludeGenre:source==='tmdb'?(els('builderExcludeGenre')?.value||''):'',
   minVotes:source==='tmdb'?(els('builderMinVotes')?.value||''):'',
   originalLanguage:source==='tmdb'?(els('builderLanguage')?.value||''):''
  };
 }
 async function readPayload(){
  const opts=sourceOptions();
  let text=opts.text;
  if(source==='imdb'){
   const file=els('builderFile')?.files?.[0];
   if(file){if(file.size>3_000_000)throw Error('O arquivo ultrapassa 3 MB.');text=await file.text();}
  }
  return {source,type:els('catType').value,url:opts.url,listId:opts.listId,
   listVersion:opts.listVersion,text,query:opts.query,
   mode:opts.mode||(source==='tvmaze'?'search':'popular'),filters:buildFilters()};
 }
 function resetPreview(){
  preview=null;submit.disabled=true;
  els('builderPreviewResults').innerHTML='';
  status.textContent=source==='addon'?
   'Após selecionar os catálogos, confira o resumo antes de adicionar.':
   'Clique em Pré-visualizar para consultar e conferir o catálogo.';
 }
 function displayOptions(){
  builderSources.forEach(el=>{
   const active=el.dataset.builderSource===source;
   el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));
  });
  const option=els('builderSourceOptions');
  els('builderNameField').hidden=source==='addon';
  els('builderSourceMetaFields').hidden=source==='addon';
  els('builderStandardPreferences').hidden=source==='addon';
  els('builderAddonPreferences').hidden=source!=='addon';
  if(source==='addon')els('builderStandardPreferences').hidden=true;
  els('catType').disabled=source==='tvmaze';
  els('catType').querySelector('option[value="both"]').disabled=!['mdblist','trakt','imdb','tmdb'].includes(source);
  if(source==='tvmaze')els('catType').value='series';
  else if(!['mdblist','trakt','imdb','tmdb'].includes(source)&&els('catType').value==='both')els('catType').value='movie';
  els('builderTmdbExtra').hidden=source!=='tmdb';
  if(source==='manual'){
   option.innerHTML='<div class="inline-info">Comece vazio, adicione títulos pela aba Catálogos ou edite o JSON do catálogo.</div>';
  }else if(source==='imdb'){
   option.innerHTML='<label class="field"><span>Endereço da lista IMDb (opcional, apenas referência)</span>'+
    '<input id="builderUrl" placeholder="https://www.imdb.com/list/ls..."></label>'+
    '<label class="field"><span>Arquivo da lista exportada (.csv / .json / .txt)</span>'+
     '<input id="builderFile" type="file" accept=".csv,.json,.txt"></label>'+
    '<label class="field"><span>Ou cole CSV, JSON ou IDs IMDb</span>'+
     '<textarea id="builderText" rows="4" placeholder="tt0133093&#10;tt0111161"></textarea></label>'+
    '<div class="inline-info">Sua lista pessoal do IMDb: abra sua Watchlist ou lista no site, escolha Exportar CSV e carregue o arquivo acima. O IMDb não oferece aqui conexão de conta por API; sua senha nunca será solicitada.</div>'+
    '<a class="builder-config-link" href="https://www.imdb.com/list/" target="_blank" rel="noopener noreferrer">Abrir minhas listas no IMDb ↗</a>';
  }else if(source==='mdblist'){
   option.innerHTML='<div class="builder-step-heading"><strong>Importar uma lista MDBList</strong>'+
    '<small>Escolha uma lista da sua conta ou informe uma URL pública.</small></div>'+
    '<button type="button" class="btn btn-subtle" id="builderLoadOwnLists" '+
      (capabilities.keys?.mdblist?'':'disabled')+'>Buscar minhas listas MDBList</button>'+
    '<label class="field"><span>Minhas listas</span><select id="builderOwnList">'+
     '<option value="">Usar URL informada manualmente</option>'+
     (selected.listId?'<option value="'+esc(selected.listId)+'">Lista pessoal vinculada</option>':'')+
     '</select></label>'+
    '<span id="builderOwnListStatus" class="muted" role="status">'+
     (capabilities.keys?.mdblist?'Chave MDBList configurada.':'Configure a chave MDBList para carregar suas listas privadas.')+'</span>'+
    '<label class="field"><span>Ou URL pública da lista MDBList</span>'+
     '<input id="builderUrl" placeholder="https://mdblist.com/lists/usuario/lista"></label>'+
    '<p class="muted">Listas mistas: selecione Filmes e séries para incluir todos os títulos. O Hub criará dois catálogos separados, um de cada tipo, compatíveis com o Nuvio. Limite aplicado ao total.</p>'+
    '<a class="builder-config-link" href="/?view=settings" target="_blank" rel="noopener">Configurar API MDBList no Nuvio Hub ↗</a>';
  }else if(source==='tvmaze'){
   option.innerHTML='<div class="builder-inline">'+
    '<label class="field"><span>Tipo de catálogo</span><select id="builderMode">'+
     '<option value="search">Pesquisar série pelo nome</option>'+
     '<option value="web">Lançamentos de hoje no streaming</option></select></label>'+
    '<label class="field"><span>Pesquisa de séries (modo pesquisar)</span>'+
     '<input id="builderQuery" maxlength="80" placeholder="Ex.: Severance, Love in the Air"></label></div>'+
    '<div class="builder-inline">'+
     '<label class="field"><span>Gênero (opcional; texto em inglês)</span>'+
      '<input id="builderGenre" maxlength="40" placeholder="Drama, Comedy, Thriller..."></label>'+
     '<label class="field"><span>Região para programação</span><select id="builderRegion">'+
      '<option value="BR">Brasil</option><option value="US">Estados Unidos</option>'+
      '<option value="GB">Reino Unido</option><option value="TH">Tailândia</option></select></label></div>'+
    '<button type="button" id="builderTvmazeFollow" class="btn btn-subtle">Usar séries seguidas na minha conta Premium</button>'+
    '<p id="builderTvmazeFollowStatus" class="muted">O acesso pessoal precisa de usuário e chave TVmaze Premium em Configurações.</p>'+
    '<p class="muted">TVmaze usa uma API pública sem chave. Somente séries com ID IMDb entram no Nuvio.'+
     ' Programação de hoje: usa a região configurada (Brasil por padrão) e pode ser atualizada manualmente.'+
     ' Dados TVmaze licenciados sob CC BY-SA.</p>';
   if(selected.provider==='tvmaze'){
    if(selected.mode)els('builderMode').value=selected.mode;
    if(selected.query)els('builderQuery').value=selected.query;
    if(filters.genre)els('builderGenre').value=filters.genre;
    if(filters.region)els('builderRegion').value=filters.region;
   }
  }else if(source==='trakt'){
   option.innerHTML='<label class="field"><span>Endereço público da lista Trakt</span>'+
    '<input id="builderUrl" placeholder="https://trakt.tv/users/usuario/lists/nome"></label>'+
    '<p class="muted">'+(capabilities.keys?.trakt?
     'API Trakt disponível. Atualizações posteriores poderão ser solicitadas manualmente.':
     'Trakt requer um Client ID para consultar listas. Nenhuma senha é necessária.')+'</p>'+
    '<label class="field"><span>Usuário Trakt para localizar minhas listas públicas</span>'+
     '<input id="builderTraktUser" placeholder="Nome de usuário" value="'+esc(selected.username||'')+'"></label>'+
    '<button type="button" class="btn btn-subtle" id="builderLoadTraktLists">Buscar listas do usuário</button>'+
    '<label class="field"><span>Listas encontradas</span><select id="builderOwnTrakt"><option value="">Escolher lista manualmente por URL</option></select></label>'+
    '<p id="builderTraktStatus" class="muted">Acesso às listas públicas com o Client ID configurado. Listas privadas exigem OAuth.</p>'+
    '<a class="builder-config-link" href="/?view=settings" target="_blank" rel="noopener">Configurar usuário e Client ID Trakt ↗</a>';
  }else if(source==='tmdb'){
   option.innerHTML='<div class="builder-inline">'+
    '<label class="field"><span>Modelo de catálogo</span><select id="builderMode">'+
     '<option value="popular">Mais populares</option><option value="trending">Em alta esta semana</option>'+
     '<option value="top_rated">Melhores avaliados</option><option value="now_playing">Novidades / no ar</option>'+
     '<option value="discover">Descoberta personalizada</option>'+
     '<option value="list">Minha lista / lista compartilhada (por ID)</option></select></label>'+
    '<label class="field"><span>Gênero (descoberta)</span><select id="builderGenre">'+
     '<option value="">Todos os gêneros</option>'+genreOptions+'</select></label></div>'+
    '<label class="field"><span>Excluir gênero (descoberta)</span><select id="builderExcludeGenre">'+
     '<option value="">Não excluir gênero</option>'+genreOptions+'</select></label>'+
    '<div class="builder-inline">'+
     '<label class="field"><span>Região</span><select id="builderRegion">'+
      '<option value="BR">Brasil</option><option value="US">Estados Unidos</option><option value="GB">Reino Unido</option><option value="TH">Tailândia</option></select></label>'+
     '<label class="field"><span>ID do streaming no TMDB (opcional)</span>'+
      '<input id="builderWatchProvider" inputmode="numeric" placeholder="Ex.: 8 (Netflix)" maxlength="7"></label></div>'+
    '<div class="builder-inline">'+
     '<label class="field"><span>ID de lista TMDB</span><input id="builderListId" inputmode="numeric" placeholder="ID da lista" value="'+esc(selected.listId||'')+'"></label>'+
     '<label class="field"><span>Versão da lista</span><select id="builderListVersion"><option value="v4">Lista TMDB v4 / pública</option><option value="v3">Lista legada TMDB v3</option></select></label></div>'+
    '<button type="button" class="btn btn-subtle" id="builderLoadTmdbLists">Buscar listas da minha conta TMDB</button>'+
    '<label class="field"><span>Minhas listas encontradas</span><select id="builderOwnTmdb">'+
      '<option value="">Usar o ID preenchido manualmente</option></select></label>'+
    '<p class="muted" id="builderTmdbStatus">Listas da conta requerem ID e sessão TMDB autorizada em Configurações.</p>'+
    '<p class="muted">Este produto utiliza TMDB e sua API, mas não é endossado, certificado ou aprovado pelo TMDB.</p>'+
    '<p class="muted">'+(capabilities.keys?.tmdb?'TMDB conectado.':
      'Configure sua chave TMDB em Configurações → Integrações.')+
     ' Para filtrar por streaming ou gênero, use Descoberta personalizada. As informações de capa são retornadas pelo TMDB.</p>'+
    '<a class="builder-config-link" href="/?view=settings" target="_blank" rel="noopener">Abrir Configurações de integração ↗</a>';
  }else if(source==='addon'){
   option.innerHTML='<div class="inline-info">Use os catálogos que seus addons já oferecem, sem recriá-los ou consultar um fornecedor diferente. Na etapa Preferências você poderá selecionar um, vários ou todos.</div>'+
    '<label class="field"><span>Origem inicial</span><select id="builderAddonOrigin"><option value="">Todos os addons</option></select></label>'+
    '<p class="muted" id="builderAddonLoadStatus" role="status">Consultando addons instalados...</p>';
   void prepareAddonPicker();
  }
  if(source!=='manual'&&source!=='addon'&&selected.url&&els('builderUrl'))els('builderUrl').value=selected.url;
  if(source==='mdblist')bindMDBListSelector();
  if(source==='trakt')bindTraktSelector();
  if(source==='tvmaze')bindTvmazeFollowed();
  if(source==='tmdb'){
   if(selected.mode&&els('builderMode'))els('builderMode').value=selected.mode;
   bindTmdbSelector();
   if(filters.genre&&els('builderGenre'))els('builderGenre').value=filters.genre;
   if(filters.region&&els('builderRegion'))els('builderRegion').value=filters.region;
   if(filters.watchProvider&&els('builderWatchProvider'))els('builderWatchProvider').value=filters.watchProvider;
   if(filters.excludeGenre&&els('builderExcludeGenre'))els('builderExcludeGenre').value=filters.excludeGenre;
  }
  els('builderLimitMode').onchange=()=>{
   els('builderLimitField').hidden=els('builderLimitMode').value==='all';
   resetPreview();updateBuilderStep();
  };
  els('builderPreviewBtn').textContent=source==='addon'?'Conferir catálogos selecionados':
   'Pré-visualizar títulos';
  els('builderPreviewBtn').disabled=false;
  resetPreview();
  updateBuilderStep();
 }
 function bindTraktSelector(){
  const username=els('builderTraktUser'),button=els('builderLoadTraktLists'),
   list=els('builderOwnTrakt'),message=els('builderTraktStatus');
  if(!username||!button)return;
  // Nome salvo no servidor; não configura tokens no navegador.
  request('/api/hub/settings').then(data=>{
   if(source==='trakt'&&username.isConnected&&!username.value&&!selected.username)
    username.value=data.accounts?.trakt?.username||'';
  }).catch(()=>{});
  button.onclick=async()=>{
   const name=username.value.trim();
   if(!name)return notify('Informe seu nome de usuário Trakt.');
   button.disabled=true;message.textContent='Consultando listas públicas desse usuário...';
   try{
    const r=await request('/api/hub/lists/trakt/mine?username='+encodeURIComponent(name));
    ownTraktLists=r.lists||[];
    list.innerHTML='<option value="">Usar URL manual</option>'+
      ownTraktLists.map(item=>'<option value="'+esc(item.url)+'">'+esc(item.name)+
       (item.count!=null?' · '+item.count+' títulos':'')+'</option>').join('');
    message.textContent=ownTraktLists.length+' listas públicas encontradas. Escolha uma para preencher o endereço.';
   }catch(e){message.textContent=e.message;}
   finally{button.disabled=false;}
  };
  list.onchange=()=>{
   if(list.value){
    els('builderUrl').value=list.value;
    els('builderUrl').dispatchEvent(new Event('input',{bubbles:true}));
   }
  };
  els('builderUrl').addEventListener('input',()=>{
   if(list.value!==els('builderUrl').value)list.value='';
  });
 }
 function bindTmdbSelector(){
  const list=els('builderOwnTmdb'),button=els('builderLoadTmdbLists'),
   message=els('builderTmdbStatus'),mode=els('builderMode'),
   listId=els('builderListId'),version=els('builderListVersion');
  if(!list||!button)return;
  if(selected.listVersion)version.value=selected.listVersion;
  const updateMode=()=>{
   const isList=mode.value==='list';
   els('catType').querySelector('option[value="both"]').disabled=!isList;
   if(!isList&&els('catType').value==='both')els('catType').value='movie';
   listId.closest('.field').hidden=!isList;
   version.closest('.field').hidden=!isList;
   button.hidden=!isList;list.closest('.field').hidden=!isList;message.hidden=!isList;
  };
  mode.onchange=()=>{updateMode();resetPreview();updateBuilderStep();};
  updateMode();
  listId.addEventListener('input',()=>{if(list.value!==listId.value)list.value='';});
  button.onclick=async()=>{
   button.disabled=true;message.textContent='Consultando listas da conta TMDB...';
   try{
    const r=await request('/api/hub/lists/tmdb/mine');
    ownTmdbLists=r.lists||[];
    list.innerHTML='<option value="">Usar ID manualmente</option>'+
     ownTmdbLists.map(item=>'<option data-version="'+esc(item.version)+'" value="'+esc(item.id)+'">'+
      esc(item.name)+(item.count!=null?' · '+item.count+' títulos':'')+'</option>').join('');
    message.textContent=ownTmdbLists.length+' listas encontradas.';
   }catch(e){message.textContent=e.message;}
   finally{button.disabled=false;}
  };
  list.onchange=()=>{
   if(!list.value)return;
   listId.value=list.value;version.value=list.selectedOptions[0]?.dataset.version||'v3';
   els('catType').value=ownTmdbLists.find(x=>x.id===list.value)?.type||'both';
   listId.dispatchEvent(new Event('input',{bubbles:true}));
  };
 }
 function bindTvmazeFollowed(){
  const button=els('builderTvmazeFollow'),message=els('builderTvmazeFollowStatus'),
   mode=els('builderMode');
  if(!button)return;
  if(!mode.querySelector('[value="followed"]')){
   mode.insertAdjacentHTML('beforeend','<option value="followed">Minhas séries seguidas (TVmaze Premium)</option>');
  }
  const onModeChange=()=>{
   const followed=mode.value==='followed';
   els('builderQuery').closest('.field').hidden=followed||mode.value==='web';
   message.textContent=followed?'Serão importadas as séries seguidas na conta Premium configurada.':
    'Para usar uma conta pessoal, configure TVmaze Premium em Configurações.';
  };
  mode.onchange=()=>{onModeChange();resetPreview();updateBuilderStep();};
  button.onclick=()=>{
   mode.value='followed';mode.dispatchEvent(new Event('change',{bubbles:true}));
  };
  if(selected.mode==='followed')mode.value='followed';
  onModeChange();
 }
 function bindMDBListSelector(){
  const select=els('builderOwnList'),load=els('builderLoadOwnLists'),info=els('builderOwnListStatus');
  if(!select||!load)return;
  select.onchange=()=>{
   const item=ownMDBLists.find(x=>String(x.id)===select.value);
   if(!item)return;
   els('builderUrl').value=item.url;
   els('catType').value=item.type||'both';
   els('catType').dispatchEvent(new Event('change',{bubbles:true}));
   info.textContent='Lista selecionada: '+(item.type==='movie'?'Filmes':
    item.type==='series'?'Séries':'tipo indefinido/misto')+
    '. Você pode escolher somente filmes, somente séries ou ambos.';
  };
  els('builderUrl').oninput=()=>{
   if(select.value)select.value='';
  };
  load.onclick=async()=>{
   load.disabled=true;info.textContent='Consultando suas listas com a chave salva no servidor...';
   try{
    const data=await request('/api/hub/lists/mdblist/mine');
    ownMDBLists=data.lists||[];
    const before=select.value;
    select.innerHTML='<option value="">Usar URL informada manualmente</option>'+
     ownMDBLists.map(item=>'<option value="'+item.id+'">'+esc(item.name)+
      ' · '+(item.type==='series'?'Séries':item.type==='movie'?'Filmes':'Mista')+
      (item.count!=null?' · '+item.count+' títulos':'')+
      (item.private?' · Privada':'')+'</option>').join('');
    if(before&&ownMDBLists.some(item=>String(item.id)===before))select.value=before;
    info.textContent=ownMDBLists.length+' listas encontradas. Escolha uma para importar.';
   }catch(e){info.textContent=e.message;}
   finally{load.disabled=false;}
  };
  if(selected.listId&&select.querySelector('option[value="'+selected.listId+'"]'))
   select.value=String(selected.listId);
 }
 builderSources.forEach(btn=>btn.onclick=()=>{
  source=btn.dataset.builderSource;displayOptions();
 });
 // Qualquer mudança após prévia invalida a seleção confirmada.
 els('modalContent').addEventListener('input',event=>{
  if(event.target.id==='builderPreviewBtn')return;
  if(preview){
   preview=null;
   submit.disabled=true;
   els('builderPreviewResults').innerHTML='';
   status.textContent='Preferências alteradas. Pré-visualize novamente antes de criar.';
  }
  updateBuilderStep();
 });
 els('modalContent').addEventListener('change',()=>{
  if(preview){preview=null;els('builderPreviewResults').innerHTML='';
   status.textContent='Preferências alteradas. Pré-visualize novamente antes de criar.';}
  updateBuilderStep();
 });
 els('builderPreviewBtn').onclick=async()=>{
  if(source==='addon'){
   const items=addonPicker?.getSelected()||[];
   if(!items.length)return notify('Selecione ao menos um catálogo na etapa Preferências.');
   preview={result:{items,count:items.length},signature:addonSignature()};
   showAddonPreview(items);
   status.textContent='Seleção pronta: '+items.length+' catálogos. Revise e continue.';
   updateBuilderStep();
   return;
  }
  const button=els('builderPreviewBtn');
  button.disabled=true;
  const resultPanel=els('builderPreviewResults');
  status.textContent='Consultando a origem e montando a prévia...';
  try{
   const payload=await readPayload();
   const result=await request('/api/hub/lists/preview',{
    method:'POST',body:JSON.stringify(payload)});
   preview={result,signature:JSON.stringify(payload)};
   renderTitlePreview(resultPanel,result);
   status.textContent='Prévia pronta. Revise os resultados e clique em Adicionar à biblioteca.';
   updateBuilderStep();
  }catch(error){
   preview=null;submit.disabled=true;
   resultPanel.innerHTML='<div class="inline-info warning">'+esc(error.message)+'</div>'+
    (source==='mdblist'&&error.suggestedType?
     '<button type="button" id="builderCorrectType" class="btn btn-primary">Alterar para '+
      (error.suggestedType==='series'?'Séries':'Filmes')+' e tentar novamente</button>':'');
   if(source==='mdblist'&&error.suggestedType){
    els('builderCorrectType').onclick=()=>{
     els('catType').value=error.suggestedType;
     els('catType').dispatchEvent(new Event('change',{bubbles:true}));
     button.click();
    };
   }
   status.textContent='Não foi possível concluir a prévia.';
  }finally{button.disabled=source==='manual';}
 };
 function renderTitlePreview(resultPanel,result){
  const all=result.metas||[];
  let page=0,mode='grid',term='';
  const counts={movie:all.filter(x=>x.type==='movie').length,
   series:all.filter(x=>x.type==='series').length};
  resultPanel.innerHTML='<div class="builder-preview-summary"><b>'+all.length+
   ' títulos para incluir</b><span>'+counts.movie+' filmes · '+counts.series+
   ' séries</span><span>'+esc(result.notice||'')+'</span></div>'+
   '<div class="builder-preview-toolbar">'+
   '<label class="field"><span>Pesquisar nos títulos da prévia</span>'+
   '<input id="builderPreviewSearch" type="search" placeholder="Título, ano ou IMDb ID"></label>'+
   '<label class="field"><span>Mostrar</span><select id="builderPreviewKind">'+
    '<option value="all">Filmes e séries</option><option value="movie">Só filmes</option>'+
    '<option value="series">Só séries</option></select></label>'+
   '<label class="field"><span>Exibição</span><select id="builderPreviewMode">'+
    '<option value="grid">Capas</option><option value="list">Lista de títulos</option></select></label>'+
   '<button type="button" class="btn btn-subtle" id="builderExportInventory">Exportar CSV (filtro atual)</button></div>'+
   '<div id="builderPreviewItems" aria-live="polite"></div>'+
   '<div class="builder-preview-pagination" id="builderPreviewPagination"></div>'+
   '<p class="muted builder-preview-note">Busca e filtros desta prévia são apenas para conferência. Todos os '+
   all.length+' títulos selecionados serão incluídos conforme o tipo escolhido na etapa Fonte.</p>';
  const search=els('builderPreviewSearch'),kind=els('builderPreviewKind'),
   modeSelect=els('builderPreviewMode'),out=els('builderPreviewItems'),pages=els('builderPreviewPagination');
  const filtered=()=>all.filter(item=>
   (kind.value==='all'||item.type===kind.value)&&
   (!term||[item.name,item.id,String(item.year||'')].some(v=>
    String(v||'').toLocaleLowerCase('pt-BR').includes(term))));
  const typeLabel=item=>item.type==='movie'?'Filme':'Série';
  const poster=item=>item.poster?
   '<img loading="lazy" referrerpolicy="no-referrer" alt="Capa de '+esc(item.name)+
   '" src="'+esc(item.poster)+'">':
   '<span class="builder-preview-placeholder" aria-label="Capa indisponível">▤</span>';
  function update(){
   const selected=filtered(),pageSize=mode==='grid'?24:30,
    paged=paginateItems(selected,page,pageSize);
   page=paged.page;
   const shown=paged.slice,totalPages=paged.totalPages;
   out.className=mode==='grid'?'builder-preview-grid':'builder-preview-table';
   out.innerHTML=shown.map(item=>mode==='grid'?
    '<div class="builder-preview-card">'+poster(item)+
     '<span class="builder-media-tag">'+typeLabel(item)+'</span>'+
     '<strong>'+esc(item.name)+'</strong><small>'+esc(item.year||'Ano desconhecido')+
     ' · '+esc(item.id)+'</small></div>':
    '<div class="builder-preview-row">'+poster(item)+
     '<div><strong>'+esc(item.name)+'</strong><small>'+esc(item.year||'Ano desconhecido')+
     ' · '+esc(item.id)+'</small></div><span class="builder-media-tag">'+typeLabel(item)+'</span></div>').join('')||
    '<div class="inline-info">Nenhum título corresponde à pesquisa. A lista importada não foi alterada.</div>';
   pages.innerHTML=renderPagerButtons({
    page,totalPages,attr:'data-preview-page',prevLabel:'Anterior',nextLabel:'Próxima',includeMiddlePage:true,
    summaryText:'Exibindo '+(selected.length?page*pageSize+1:0)+'–'+
     Math.min((page+1)*pageSize,selected.length)+' de '+selected.length+' títulos'+
     (selected.length!==all.length?' (filtrados de '+all.length+')':'')
   });
  }
  function stop(e){e.stopPropagation();}
  search.addEventListener('input',e=>{stop(e);term=search.value.trim().toLocaleLowerCase('pt-BR');page=0;update();});
  for(const select of [kind,modeSelect])select.addEventListener('change',e=>{
   stop(e);page=0;mode=modeSelect.value;update();
  });
  pages.addEventListener('click',e=>{
   stop(e);const btn=e.target.closest('[data-preview-page]');
   if(btn){page+=Number(btn.dataset.previewPage);update();}
  });
  els('builderExportInventory').addEventListener('click',e=>{
   stop(e);const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
   const rows=[['Tipo','Título','Ano','IMDb ID','Nota','Capa'],
    ...filtered().map(item=>[typeLabel(item),item.name,item.year||'',item.id,item.rating||'',item.poster||''])];
   const csv='\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n');
   const link=document.createElement('a'),file=new Blob([csv],{type:'text/csv;charset=utf-8'});
   link.href=URL.createObjectURL(file);link.download='nuvio-catalogo-previa.csv';
   link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });
  resultPanel.addEventListener('error',e=>{
   if(e.target?.tagName==='IMG'&&e.target.closest('.builder-preview-card,.builder-preview-row')){
    const el=document.createElement('span');
    el.className='builder-preview-placeholder';el.textContent='▤';
    el.setAttribute('aria-label','Capa indisponível');e.target.replaceWith(el);
   }
  },true);
  update();
 }
 function validateSourceStep(){
  if(source==='addon'){
   if(!state.providers.length){notify('Aguarde a consulta dos addons instalados.');return false;}
   return true;
  }
  const name=els('catName');
  if(!name.value.trim()){name.focus();notify('Dê um nome para o catálogo.');return false;}
  if(source==='mdblist'||source==='trakt'){
   if(!els('builderUrl')?.value.trim()&&!sourceOptions().listId){
    els('builderUrl').focus();notify('Informe a URL ou escolha uma lista da sua conta.');return false;
   }
  }
  if(source==='tmdb'&&els('builderMode')?.value==='list'&&
    !/^\d{1,12}$/.test(String(sourceOptions().listId||''))){
   notify('Informe um ID de lista TMDB ou escolha uma lista da conta.');
   els('builderListId').focus();return false;
  }
  if(source==='tvmaze'&&els('builderMode')?.value==='search'&&
     (els('builderQuery')?.value.trim().length||0)<2){
   els('builderQuery').focus();notify('Pesquise uma série com ao menos dois caracteres.');return false;
  }
  if(source==='imdb'&&!els('builderText')?.value.trim()&&!els('builderFile')?.files?.length){
   els('builderText').focus();notify('Cole IDs ou escolha um arquivo exportado do IMDb.');return false;
  }
  return true;
 }
 function validatePreferenceStep(){
  if(source==='addon'){
   if(!(addonPicker?.getSelected().length)){
    notify('Selecione os catálogos desejados, ou use Selecionar todos disponíveis.');
    return false;
   }
   return true;
  }
  for(const input of document.querySelectorAll('#builderPanel2 input,#builderPanel2 select')){
   if(!input.checkValidity()){input.reportValidity();return false;}
  }
  const start=Number(els('builderYearFrom').value),end=Number(els('builderYearTo').value);
  if(start&&end&&start>end){els('builderYearTo').focus();
   notify('O ano final não pode ser menor que o inicial.');return false;}
  return true;
 }
 function renderFinal(){
  if(source==='addon'){
   const items=addonPicker?.getSelected()||[];
   const sources=[...new Set(items.map(x=>x.provider.name))];
   els('builderFinalSummary').innerHTML=
    '<div><small>Origem</small><strong>Catálogos dos addons</strong></div>'+
    '<div><small>Selecionados</small><strong>'+items.length+' catálogos</strong></div>'+
    '<div><small>Filmes</small><strong>'+items.filter(x=>x.source.type==='movie').length+'</strong></div>'+
    '<div><small>Séries</small><strong>'+items.filter(x=>x.source.type==='series').length+'</strong></div>'+
    '<div class="wide"><small>Fornecedores</small><strong>'+esc(sources.join(', '))+'</strong></div>'+
    '<p class="muted">Apenas referências aos catálogos originais serão adicionadas à biblioteca. Os títulos e posters continuam sendo fornecidos pelos addons. Depois use Salvar alterações no Nuvio Hub para publicar.</p>';
   return;
  }
  const opts=sourceOptions();
  const sourceName=providers.find(p=>p.id===source)?.title||source;
  const selectedMedia=els('catType').value;
  const type=selectedMedia==='movie'?'Filmes':selectedMedia==='series'?'Séries':'Filmes e séries';
  const count=source==='manual'?(existing?.metas?.length||0):(preview?.result?.count||0);
  const movieCount=preview?.result?.counts?.movie||0,seriesCount=preview?.result?.counts?.series||0;
  els('builderFinalSummary').innerHTML=
   '<div><small>Nome</small><strong>'+esc(els('catName').value.trim())+'</strong></div>'+
   '<div><small>Fonte</small><strong>'+esc(sourceName)+'</strong></div>'+
   '<div><small>Tipo</small><strong>'+esc(type)+'</strong></div>'+
   '<div><small>Títulos</small><strong>'+count+'</strong></div>'+
   (selectedMedia==='both'?'<div><small>Catálogos para o Nuvio</small><strong>'+
    (movieCount>0&&seriesCount>0?'2 (Filmes e Séries)':'1 (somente tipo disponível)')+
    '</strong></div><div><small>Distribuição</small><strong>'+
    movieCount+' filmes · '+seriesCount+' séries</strong></div>':'')+
   '<div><small>Quantidade configurada</small><strong>'+
    (els('builderLimitMode').value==='all'?'Todos disponíveis':esc(els('builderLimit').value))+'</strong></div>'+
   '<div><small>Página inicial</small><strong>'+(els('builderShowHome').checked?'Sim, se compatível':'Não')+'</strong></div>'+
   (opts.url?'<div class="wide"><small>Origem</small><strong>'+esc(opts.url)+'</strong></div>':'')+
   '<p class="muted">Os demais filtros ficarão registrados junto da fonte para atualizações manuais.</p>';
 }
 function updateBuilderStep(){
  document.querySelectorAll('[data-builder-panel]').forEach(panel=>{
   const active=Number(panel.dataset.builderPanel)===currentStep;
   panel.hidden=!active;
  });
  document.querySelectorAll('[data-builder-step]').forEach(tab=>{
   const index=Number(tab.dataset.builderStep);
   const active=index===currentStep;
   tab.classList.toggle('active',active);
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
  });
  backButton.hidden=currentStep===1;
  nextButton.hidden=currentStep===4;
  submit.hidden=currentStep!==4;
  submit.disabled=currentStep!==4||
   (source==='addon'?(!preview||!preview.result?.items?.length):
    (!preview||!preview.result?.metas?.length));
  nextButton.disabled=currentStep===3&&!preview;
  nextButton.textContent=currentStep===3?'Revisar e salvar →':'Continuar →';
  if(currentStep===4)renderFinal();
 }
 function goStep(target){
  if(target<1||target>4||target===currentStep)return;
  if(target>currentStep){
   target=Math.min(target,currentStep+1);
   if(currentStep<=1&&!validateSourceStep()){currentStep=1;updateBuilderStep();return;}
   if(currentStep<=2&&!validatePreferenceStep()){currentStep=2;updateBuilderStep();return;}
   if(target>=4&&!preview){
    currentStep=3;updateBuilderStep();notify('Confira a prévia antes de salvar.');return;
   }
  }
  currentStep=target;
  updateBuilderStep();
  els('modalContent').scrollTop=0;
 }
 backButton.onclick=()=>goStep(currentStep-1);
 nextButton.onclick=()=>goStep(currentStep+1);
 document.querySelectorAll('[data-builder-step]').forEach(button=>{
  button.onclick=()=>goStep(Number(button.dataset.builderStep));
  button.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   const index=Number(button.dataset.builderStep);
   const next=event.key==='Home'?1:event.key==='End'?4:
    Math.min(4,Math.max(1,index+(event.key==='ArrowLeft'?-1:1)));
   document.getElementById('builderTab'+next)?.focus();
   goStep(next);
  });
 });
 displayOptions();updateBuilderStep();
}
async function refreshTraktCatalog(id){
 if(!writable()||state.dirty)return notify('Salve as alterações pendentes antes de atualizar listas.');
 const c=catalogs().find(x=>x.id===id);
 const listSource=c?.listSource;
 if(!listSource||!['trakt','mdblist','tmdb','tvmaze'].includes(listSource.provider))return;
 try{
  const result=await request('/api/hub/lists/preview',{method:'POST',
   body:JSON.stringify({source:listSource.provider,type:c.type,url:listSource.url,
    listId:listSource.listId||null,listVersion:listSource.listVersion||'v4',
    query:listSource.query||'',mode:listSource.mode||'popular',
    filters:listSource.filters||{}})});
  if(!confirm('Atualizar '+c.name+' com '+result.count+' títulos da origem?'))return;
  c.metas=result.metas;c.listSource.updatedAt=new Date().toISOString();
  markDirty();render();
  notify('Lista atualizada. Clique em Salvar alterações para publicar.');
 }catch(error){notify('Falha ao atualizar a lista: '+error.message);}
}
async function moveCatalogTo(src,dst){
 if(!state.editable||state.catalogBusy||state.dirty||state.search.trim())return;
 const list=catalogs(),from=list.findIndex(c=>catalogIdentity(c)===src),
  to=list.findIndex(c=>catalogIdentity(c)===dst);
 if(from<0||to<0||from===to)return;
 const ordered=[...list];
 ordered.splice(to,0,ordered.splice(from,1)[0]);
 state.catalogBusy=true;
 try{
   const result=await request('/api/hub/catalogs/reorder',{method:'POST',
     body:JSON.stringify({expectedRevision:state.workspace.revision,order:ordered.map(catalogIdentity)})
   });
   state.workspace.catalogs=ordered;state.workspace.revision=result.revision;
   notify('Ordem salva no Agregador.');
 }catch(e){
   notify('Não foi possível alterar a ordem: '+e.message);
   if(/mudou/.test(e.message))await reload();
 }finally{state.catalogBusy=false;render();}
}
function moveCatalog(id,delta){
 const list=catalogs(),i=list.findIndex(c=>catalogIdentity(c)===id);
 if(i<0||i+delta<0||i+delta>=list.length)return;
 return moveCatalogTo(id,catalogIdentity(list[i+delta]));
}
// Mesmo inventário da aba Catálogos, compartilhado pelo wizard e pela descoberta.
function availableAddonCatalogs(providerList=state.providers){
 const already=new Set(catalogs().map(c=>c.type+'::'+c.id));
 const rows=[];
 for(const p of providerList){
  if(p.enabled===false||p.status!=='ok'||!p.url)continue;
  for(const c of p.catalogs||[]){
   if(!['movie','series'].includes(c.type)||typeof c.key!=='string'||!c.key)continue;
   rows.push({key:JSON.stringify([p.url,c.type,c.key]),provider:p,source:c,
    existing:already.has(c.type+'::'+c.key)});
  }
 }
 return rows;
}
function includeAddonCatalogBatch(items){
 if(!writable())return {added:0,skipped:items.length};
 const all=catalogs(),known=new Set(all.map(c=>c.type+'::'+c.id));
 let added=0,skipped=0;
 for(const item of items){
  const p=item.provider,c=item.source;
  if(!p?.url||!['movie','series'].includes(c?.type)||typeof c?.key!=='string'||
    p.enabled===false||p.status!=='ok'||!((p.catalogs||[]).some(x=>x.key===c.key&&x.type===c.type))){
   skipped++;continue;
  }
  const identity=c.type+'::'+c.key;
  if(known.has(identity)){skipped++;continue;}
  all.push({id:c.key,type:c.type,name:p.name+' · '+c.name,addonId:BRIDGE_ID,
   sourceUrl:p.url,sourceId:c.id,sourceAddonId:p.addonId,manual:false});
  known.add(identity);added++;
 }
 if(added){state.catalogPage=Math.max(0,Math.ceil(all.length/50)-1);markDirty();}
 return {added,skipped};
}
async function loadAddonCatalogInventory(){
 if(state.providers.length)return state.providers;
 const res=await request('/api/hub/provider-inventory');
 state.providers=res.addons||[];
 return state.providers;
}
// Seleção é global a todas as páginas e não muda a biblioteca antes da confirmação.
function mountAddonCatalogPicker(root,{selected,onChange,providerUrl='',readonly=false}={}){
 const rows=availableAddonCatalogs();
 const keys=new Set(rows.map(x=>x.key));
 for(const key of selected)if(!keys.has(key))selected.delete(key);
 root.innerHTML='<div class="addon-bulk-picker">'+
  '<div class="addon-bulk-tools">'+
   '<label class="field"><span>Origem</span><select data-bulk-provider><option value="">Todos os addons</option>'+
    state.providers.filter(p=>p.enabled!==false&&p.status==='ok'&&p.catalogs?.length)
     .map(p=>'<option value="'+esc(p.url)+'" '+(p.url===providerUrl?'selected':'')+'>'+
       esc(p.name)+' · '+p.catalogs.length+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>Tipo</span><select data-bulk-type>'+
    '<option value="">Filmes e séries</option><option value="movie">Filmes</option>'+
    '<option value="series">Séries</option></select></label>'+
   '<label class="field addon-bulk-search"><span>Buscar</span>'+
    '<input type="search" data-bulk-search placeholder="Nome ou ID do catálogo..."></label>'+
  '</div>'+
  '<div class="addon-bulk-actions">'+
   '<button type="button" class="btn btn-subtle" data-bulk-action="select-filtered">Selecionar filtrados</button>'+
   '<button type="button" class="btn btn-subtle" data-bulk-action="select-all">Selecionar todos dos addons</button>'+
   '<button type="button" class="btn btn-subtle" data-bulk-action="clear-filtered">Desmarcar filtrados</button>'+
   '<button type="button" class="btn btn-subtle" data-bulk-action="clear">Limpar seleção</button></div>'+
  '<p class="addon-bulk-summary" data-bulk-summary role="status"></p>'+
  '<div class="addon-bulk-results" data-bulk-results></div>'+
  '<div class="addon-bulk-pages" data-bulk-pages></div>'+
  '<p class="muted addon-bulk-help">Itens já presentes na biblioteca não serão duplicados. Seleções de outras páginas e addons permanecem marcadas.</p>'+
  '</div>';
 const provider=root.querySelector('[data-bulk-provider]'),
  type=root.querySelector('[data-bulk-type]'),search=root.querySelector('[data-bulk-search]'),
  summary=root.querySelector('[data-bulk-summary]'),results=root.querySelector('[data-bulk-results]'),
  pages=root.querySelector('[data-bulk-pages]');
 let page=0;const pageSize=40;
 const candidates=()=>rows.filter(x=>!x.existing&&(!provider.value||x.provider.url===provider.value));
 const matched=()=>{
  const q=search.value.trim().toLocaleLowerCase('pt-BR');
  return rows.filter(x=>
   (!provider.value||x.provider.url===provider.value)&&
   (!type.value||x.source.type===type.value)&&
   (!q||(x.source.name+' '+x.source.id+' '+x.provider.name)
      .toLocaleLowerCase('pt-BR').includes(q)));
 };
 function update(){
  root.querySelector('[data-bulk-action="select-all"]').textContent=
   provider.value?'Selecionar todos deste addon':'Selecionar todos os addons';
  const matches=matched(),paged=paginateItems(matches,page,pageSize);
  page=paged.page;
  const slice=paged.slice,totalPages=paged.totalPages;
  const chosen=rows.filter(x=>selected.has(x.key));
  summary.textContent=chosen.length+' selecionados · '+
   chosen.filter(x=>x.source.type==='movie').length+' filmes · '+
   chosen.filter(x=>x.source.type==='series').length+' séries · '+
   matches.length+' encontrados neste filtro · '+
   rows.filter(x=>x.existing).length+' já incluídos';
  results.innerHTML=slice.map(x=>
   '<label class="addon-bulk-row '+(x.existing?'already-included':'')+'">'+
    '<input type="checkbox" data-bulk-item="'+esc(x.key)+'" '+
      (selected.has(x.key)?'checked':'')+(x.existing||readonly?' disabled':'')+'>'+
    '<span><strong>'+esc(x.source.name||x.source.id)+'</strong>'+
     '<small>'+esc(x.provider.name)+' · '+(x.source.type==='movie'?'Filme':'Série')+
      ' · '+esc(x.source.id)+'</small></span>'+
    (x.existing?'<span class="addon-bulk-tag">Já incluído</span>':'')+
    '</label>').join('')||'<p class="inline-info">Nenhum catálogo corresponde aos filtros.</p>';
  pages.innerHTML=renderPagerButtons({page,totalPages,attr:'data-bulk-page',
   summaryText:'Página '+(page+1)+' de '+totalPages});
  onChange?.(chosen);
 }
 for(const field of [provider,type,search]){
  field.addEventListener(field===search?'input':'change',e=>{e.stopPropagation();page=0;update();});
 }
 root.querySelector('.addon-bulk-picker').addEventListener('change',e=>{
  const el=e.target.closest('[data-bulk-item]');
  if(!el||el.disabled)return;
  e.stopPropagation();
  if(el.checked)selected.add(el.dataset.bulkItem);else selected.delete(el.dataset.bulkItem);
  update();
 });
 root.querySelector('.addon-bulk-picker').addEventListener('click',e=>{
  const paging=e.target.closest('[data-bulk-page]');
  if(paging){e.stopPropagation();page+=Number(paging.dataset.bulkPage);update();return;}
  const action=e.target.closest('[data-bulk-action]')?.dataset.bulkAction;
  if(!action||readonly)return;
  e.stopPropagation();
  if(action==='clear')selected.clear();
  if(action==='select-all'){
   for(const x of candidates())selected.add(x.key);
  }
  if(action==='select-filtered'||action==='clear-filtered'){
   for(const x of matched())if(!x.existing){
    if(action==='select-filtered')selected.add(x.key);else selected.delete(x.key);
   }
  }
  update();
 });
 update();
 return {getSelected:()=>rows.filter(x=>selected.has(x.key)),update};
}

async function chooseProvider(url){
 if(!writable())return;
 try{await loadAddonCatalogInventory();}
 catch(e){notify('Não foi possível descobrir catálogos: '+e.message);return;}
 const prov=state.providers.find(p=>p.url===url&&p.enabled!==false);
 if(!prov)return notify('O addon não está disponível para importar catálogos.');
 const selected=new Set();
 showModal('Catálogos de '+prov.name,
  '<p class="panel-sub">Selecione um ou vários catálogos; a escolha permanece marcada ao navegar pelas páginas.</p>'+
  '<div id="providerBulkPicker"></div>',()=>{
   const items=picker.getSelected();
   if(!items.length)throw Error('Selecione ao menos um catálogo ainda não incluído.');
   const result=includeAddonCatalogBatch(items);
   if(!result.added)throw Error('Nenhum catálogo novo para incluir.');
   navigate('catalogs');
   notify(result.added+' catálogos incluídos'+
    (result.skipped?' · '+result.skipped+' ignorados':'')+
    '. Clique em Salvar alterações para publicar.');
  },{confirmText:'Adicionar selecionados'});
 const picker=mountAddonCatalogPicker($('providerBulkPicker'),{
  selected,providerUrl:url,onChange:items=>{
   $('modalSubmit').disabled=items.length===0;
   $('modalSubmit').textContent='Adicionar selecionados ('+items.length+')';
  }
 });
}
function addMeta(id){
 if(!writable())return;
 const c=catalogs().find(x=>x.id===id);if(!c)return;
 showModal('Adicionar título a '+c.name,`
 <label class="field"><span>Identificador do filme ou série</span><input id="mId" placeholder="Ex.: tt0133093 ou tmdb:603"></label>
 <label class="field"><span>Nome do título</span><input id="mTitle" placeholder="Ex.: Matrix"></label>
 <label class="field"><span>Poster (link HTTPS, opcional)</span><input id="mPoster" placeholder="https://.../poster.jpg"></label>
 <label class="field"><span>Descrição (opcional)</span><textarea id="mDesc" rows="3"></textarea></label>`,()=>{
  const id=mandatory('mId','um identificador'),name=mandatory('mTitle','um nome');
  const poster=$('mPoster').value.trim(),description=$('mDesc').value.trim();
  if(poster && !poster.startsWith('https://'))throw Error('Poster precisa de HTTPS.');
  if(!Array.isArray(c.metas))c.metas=[];
  if(c.metas.some(x=>x.id===id))throw Error('Título já existe no catálogo.');
  c.metas.push({id,name,type:c.type,poster,description});markDirty();render();
 },{confirmText:'Adicionar título'});
}
function editCatalog(id){
 if(!writable())return;
 const c=catalogs().find(x=>x.id===id);if(!c)return;
 showModal('Editar JSON de '+c.name,`
 <div class="inline-info">Edite os campos do catálogo ou a lista "metas". É possível colar JSON completo.</div>
 <label class="field"><span>Catálogo em JSON</span>${textarea('catJson',JSON.stringify(c,null,2),14)}</label>`,()=>{
  const newCat=JSON.parse($('catJson').value);
  if(!newCat||!newCat.id||!newCat.type||!newCat.name||!['movie','series'].includes(newCat.type))throw Error('Informe id, tipo e nome válidos.');
  if(newCat.metas&&!Array.isArray(newCat.metas))throw Error('metas deve ser uma lista.');
  const i=catalogs().indexOf(c);
  catalogs()[i]=newCat;markDirty();render();
 },{confirmText:'Atualizar catálogo'});
}
function openImport(){
 if(!writable())return;
 showModal('Importar JSON de coleções ou catálogos',`
 <div class="inline-info">Cole JSON de qualquer fornecedor compatível com o formato Nuvio, ou selecione um arquivo. Você escolhe acrescentar ou substituir. Não há conexão automática com nenhuma fonte.</div>
 <label class="field"><span>O que importar?</span><select id="iKind"><option value="collections">Coleções do Nuvio</option><option value="catalogs">Manifesto / catálogos</option></select></label>
 <label class="field"><span>Como aplicar?</span><select id="iMode"><option value="append">Acrescentar, preservando as atuais</option><option value="replace">Substituir importados (com backup)</option><option value="new">Começar uma nova biblioteca vazia</option></select></label>
 <label class="field"><span>Colar JSON</span>${textarea('iRaw','',10)}</label>
 <label class="field"><span>Ou selecionar arquivo .json</span><input id="iFile" type="file" accept=".json,application/json"></label>
 <label class="field"><span>Ou colar endereço HTTPS do JSON</span><input id="iUrl" placeholder="https://.../collections.json"></label>
 <small class="muted">Fonte sem permissão CORS? Baixe o JSON e selecione o arquivo.</small>`,
 async()=>{
  const mode=$('iMode').value,kind=$('iKind').value;
  const file=$('iFile').files?.[0],raw=$('iRaw').value.trim(),url=$('iUrl').value.trim();
  let value;
  if(mode==='new'&&!file&&!raw&&!url)value=null;
  else if(file){if(file.size>10e6)throw Error('Arquivo excede 10 MB.');value=JSON.parse(await file.text());}
  else if(raw)value=JSON.parse(raw);
  else if(url){
   if(!url.startsWith('https://'))throw Error('Use URL HTTPS.');
   const r=await fetch(url,{cache:'no-store',credentials:'omit'});
   if(!r.ok)throw Error('A URL retornou '+r.status);
   value=await r.json();
  }else throw Error('Forneça JSON, arquivo ou endereço.');
  const payload={mode,[kind]:value};
  const check=await request('/api/nuvio-studio/workspace/preview',{method:'POST',body:JSON.stringify(payload)});
  if(!confirm(`Pré-visualização: ${check.stats.groups} coleções, ${check.stats.folders} pastas e ${check.stats.catalogs} catálogos no resultado.\n\nConfirmar importação?`))return false;
  const saved=await request('/api/nuvio-studio/workspace/apply',{method:'POST',
    body:JSON.stringify({...payload,expectedRevision:check.expectedRevision})});
  const work=await request('/api/hub/workspace');
  state.workspace=work;state.dirty=false;state.selectedGroup=groups()[0]?.id||null;state.selectedFolder=null;
  render();notify('Importação concluída, sem token e sem consultar outra fonte automaticamente.');
  return true;
 },{confirmText:'Pré-visualizar e importar'});
}

async function onAction(action,el){
 if(action.startsWith('nav-'))return navigate(action.slice(4));
 switch(action){
 case 'reload':return reload();
 case 'settings-key-save':return updateSettingsKey(el.dataset.provider);
 case 'settings-key-clear':return updateSettingsKey(el.dataset.provider,true);
 case 'settings-playback-save':return saveHubPlayback();
 case 'settings-erdb-save':return saveArtworkErdb();
 case 'settings-erdb-clear':return saveArtworkErdb(true);
 case 'settings-account-trakt':return saveSourceAccount('trakt');
 case 'settings-account-tmdb':return saveSourceAccount('tmdb');
 case 'settings-tmdb-begin':return tmdbBeginAuthorization();
 case 'settings-tmdb-complete':return tmdbCompleteAuthorization();
 case 'settings-account-tvmaze':return saveSourceAccount('tvmaze');
 case 'preview-open':return globalThis.NuvioPreview.open(state);
 case 'collection-rescan':return refreshCollectionInventory(true);
 case 'collection-attach-external':return replaceCollectionSource();
 case 'new-group':return createGroup();
 case 'new-folder':return createFolder();
 case 'new-addon':return addAddon();
 case 'new-catalog':return createCatalog();
 case 'edit-catalog-builder':return createCatalog(catalogs().find(c=>c.id===el.dataset.cat));
 case 'catalog-page-prev':state.catalogPage=Math.max(0,state.catalogPage-1);return render();
 case 'catalog-page-next':state.catalogPage+=1;return render();
 case 'catalog-up':return moveCatalog(el.dataset.catalogKey,-1);
 case 'catalog-down':return moveCatalog(el.dataset.catalogKey,1);
 case 'refresh-trakt':return refreshTraktCatalog(el.dataset.cat);
 case 'import-json':return openImport();
 case 'scan':return scanProviders();
 case 'choose-provider':return chooseProvider(el.dataset.provider);
 case 'configure-addon':return configureAddon(el.dataset.url);
 case 'addons-health-check':return refreshAddonMonitor({force:true});
 case 'priority-up':return priorityMove(el.dataset.url,'up');
 case 'priority-down':return priorityMove(el.dataset.url,'down');
 case 'priority-first':return priorityMove(el.dataset.url,'first');
 case 'toggle-addon':return addonAction('toggle',el.dataset.url,
    state.profile.addons.find(a=>a.url===el.dataset.url)?.enabled===false);
 case 'remove-addon':return addonAction('remove',el.dataset.url);
 case 'new-meta':return addMeta(el.dataset.cat);
 case 'edit-catalog-json':return editCatalog(el.dataset.cat);
 case 'remove-catalog':{
   if(!writable())return;
   const c=catalogs().find(x=>x.id===el.dataset.cat);
   if(!c||!confirm('Excluir o catálogo '+c.name+'? Também será desvinculado das pastas.'))return;
   const k=(c.addonId||'nuvio.studio')+'::'+c.type+'::'+c.id;
   for(const g of groups())for(const f of g.folders||[])
     f.catalogSources=editableSources(f).filter(s=>sourceKey(s)!==k);
   state.workspace.catalogs=catalogs().filter(x=>x!==c);markDirty();render();return;
 }
 case 'delete-group':{
   if(!writable()||!group()||!confirm('Excluir esta coleção?'))return;
   state.workspace.collections=groups().filter(x=>x!==group());state.selectedGroup=groups()[0]?.id||null;
   state.selectedFolder=null;markDirty();render();return;
 }
 case 'delete-folder':{
   if(!writable()||!folder()||!confirm('Excluir esta pasta da coleção?'))return;
   group().folders=group().folders.filter(x=>x!==folder());
   state.selectedFolder=null;markDirty();render();return;
 }
 case 'move-group-up':return move(groups(),groups().indexOf(group()),-1);
 case 'move-group-down':return move(groups(),groups().indexOf(group()),1);
 case 'move-folder-up':return move(group().folders,group().folders.indexOf(folder()),-1);
 case 'move-folder-down':return move(group().folders,group().folders.indexOf(folder()),1);
 case 'attach-catalog':{
   if(!writable()||!folder())return;
   const value=$('addSourceSelect').value;
   const c=catalogs().find(c=>(c.addonId||'nuvio.studio')+'::'+c.type+'::'+c.id===value);
   if(!c)return notify('Selecione um catálogo.');
   const src={provider:'addon',addonId:c.addonId||'nuvio.studio',
     type:c.type,catalogId:c.id,genre:null,title:c.name,
     ...(c.sourceUrl?{addonBaseUrl:BASE}:{})};
   const all=editableSources(folder());
   if(all.some(x=>sourceKey(x)===sourceKey(src)))return notify('Catálogo já está na pasta.');
   all.push(src);markDirty();render();return;
 }
 case 'copy-manifest':return copy(MANIFEST);
 case 'copy-collections':{
   if(state.collectionInventory==='ready'){
    const checked=collectionResolver().summary(groups());
    if(checked.missing&&!confirm('A biblioteca tem '+checked.missing+
      ' vínculos de catálogos não localizados. O Nuvio pode mostrar pastas vazias. Deseja copiar o link mesmo assim?'))return;
   }
   return copy(EXPORT);
 }
 case 'monitor-refresh':return fetchMonitor();
 case 'monitor-check':{
   if(!writable())return;
   try{
    notify('Verificando addons; esta operação pode demorar.');
    state.monitor=await request('/api/monitor/check',{method:'POST',body:'{}'});render();
   }catch(e){notify(e.message);}
   return;
 }
 }
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);notify('Link copiado.');}
 catch{showModal('Copiar endereço',`<label class="field"><span>Endereço</span><input id="copyInput" value="${esc(text)}" readonly></label>`,()=>true,{confirmText:'Concluir'});}
}
async function fetchMonitor(){
 try{state.monitor=await request('/api/monitor');render();}
 catch(e){notify('Monitor indisponível: '+e.message);}
}
async function onClick(event){
 if(performance.now()<collectionSuppressClickUntil&&event.target.closest('.collection-sort-item,.source-row'))
  return;
 const catalogHeader=event.target.closest('[data-catalog-summary]');
 if(catalogHeader){
  event.preventDefault();
  if(performance.now()<skipCatalogClickUntil)return;
  const key=catalogHeader.dataset.catalogSummary;
  if(state.openCatalogs.has(key))state.openCatalogs.delete(key);else state.openCatalogs.add(key);
  return render();
 }
 const summary=event.target.closest('[data-addon-summary]');
 if(summary){
  // Native details guardam estado no navegador apenas; renderizações de
  // monitoramento não devem recolher os addons abertos.
  event.preventDefault();
  const key=summary.dataset.addonSummary;
  if(state.openAddons.has(key))state.openAddons.delete(key);
  else state.openAddons.add(key);
  return render();
 }
 const addonFilter=event.target.closest('[data-addon-filter]');
 if(addonFilter){state.addonFilter=addonFilter.dataset.addonFilter;return render();}
 const nav=event.target.closest('#nav [data-view]');
 if(nav)return navigate(nav.dataset.view);
 const choose=event.target.closest('[data-group]');
 if(choose){state.selectedGroup=choose.dataset.group;state.selectedFolder=null;return render();}
 const nextFolder=event.target.closest('[data-folder]');
 if(nextFolder){state.selectedFolder=nextFolder.dataset.folder;return render();}
 const repair=event.target.closest('[data-source-replace]');
 if(repair)return replaceCollectionSource(Number(repair.dataset.sourceReplace));
 const shift=event.target.closest('[data-source-move]');
 if(shift&&writable()&&folder())return move(editableSources(folder()),Number(shift.dataset.sourceMove),Number(shift.dataset.delta));
 const remove=event.target.closest('[data-source-remove]');
 if(remove&&writable()&&folder()){
   editableSources(folder()).splice(Number(remove.dataset.sourceRemove),1);markDirty();return render();
 }
 const open=event.target.closest('[data-open-group]');
 if(open){state.selectedGroup=open.dataset.openGroup;state.selectedFolder=null;return navigate('collections');}
 const button=event.target.closest('[data-action]');
 if(button)return onAction(button.dataset.action,button);
}
function onField(event){
 const t=event.target,field=t.id;
 if(['searchAddons','searchCatalogs'].includes(field)){
   state.search=t.value;
   if(field==='searchCatalogs')state.catalogPage=0;
   // Não recriar input durante digitação: atualizar resultados após pequena pausa.
   clearTimeout(state.searchTimer);
   state.searchTimer=setTimeout(()=>{
     const position=t.selectionStart;const id=t.id;render();
     const input=$(id);input?.focus();input?.setSelectionRange(position,position);
   },190);
   return;
 }
 if(!writable())return;
 const mapGroup={groupTitle:'title',groupBackdrop:'backdropImageUrl',groupViewMode:'viewMode'};
 const mapFolder={folderTitle:'title',folderCover:'coverImageUrl',folderShape:'tileShape'};
 if(field in mapGroup&&group()){
   group()[mapGroup[field]]=t.value;
   markDirty();if(field==='groupTitle')render();return;
 }
 if(field in mapFolder&&folder()){
   folder()[mapFolder[field]]=t.value;
   if(field==='folderCover')folder().customCoverImageUrl=t.value;
   markDirty();if(field!=='folderTitle')render();return;
 }
}
$('nav').addEventListener('click',onClick);
$('app').addEventListener('click',onClick);
// Arrastar pela alça usa Pointer Events: também funciona no touchscreen,
// independente da implementação HTML5 DnD do <summary> no Chromium.
// DnD de Coleções, Pastas e Catálogos: usa Pointer Events em uma única alça,
// incluindo mouse/caneta/toque. Somente reordena irmãos, sem escrita automática.
let collectionPointer=null;
let collectionSuppressClickUntil=0;
function reorderCollectionSlots(level,source,target,after=false,scopeGroup=null,scopeFolder=null){
 if(!state.editable||state.view!=='collections'||!globalThis.NuvioCollectionLinks)return false;
 const g=group(),f=folder();
 if(level!=='group'&&(!g||scopeGroup!==g.id))return false;
 if(level==='source'&&(!f||scopeFolder!==f.id))return false;
 const rows=level==='group'?groups():level==='folder'?g.folders:editableSources(f);
 if(!Array.isArray(rows))return false;
 const from=level==='source'?Number(source):rows.findIndex(r=>r.id===source);
 const to=level==='source'?Number(target):rows.findIndex(r=>r.id===target);
 if(!globalThis.NuvioCollectionLinks.reorder(rows,from,to,after))return false;
 markDirty();render();
 notify('Ordem atualizada. Clique em Salvar alterações para publicar no Nuvio.');
 return true;
}
function clearCollectionDrag(){
 if(collectionPointer?.scrollFrame)cancelAnimationFrame(collectionPointer.scrollFrame);
 if(collectionPointer?.handle?.hasPointerCapture?.(collectionPointer.id)){
  try{collectionPointer.handle.releasePointerCapture(collectionPointer.id);}catch{}
 }
 document.querySelectorAll('.collection-sort-item.is-dragging,.collection-sort-item.is-drop-before,'+
  '.collection-sort-item.is-drop-after,.source-row.is-dragging,.source-row.is-drop-before,'+
  '.source-row.is-drop-after').forEach(el=>
  el.classList.remove('is-dragging','is-drop-before','is-drop-after'));
 collectionPointer=null;state.collectionDragging=false;
}
function collectionDropTarget(p,x,y){
 const elem=document.elementFromPoint(x,y);
 const row=elem?.closest('[data-sort-level]');
 const list=row?.closest('[data-sort-list]');
 if(!row||list!==p.list||row.dataset.sortLevel!==p.level)return;
 const rect=row.getBoundingClientRect();
 const after=y>rect.top+rect.height/2;
 return {key:p.level==='source'?row.dataset.sortIndex:row.dataset.sortId,
  row,after};
}
function paintCollectionDrag(p,x,y){
 const candidate=collectionDropTarget(p,x,y);
 p.destination=candidate?.key??null;p.after=candidate?.after||false;
 p.list.querySelectorAll('.is-drop-before,.is-drop-after')
  .forEach(el=>el.classList.remove('is-drop-before','is-drop-after'));
 if(candidate&&candidate.row!==p.row)
  candidate.row.classList.add(candidate.after?'is-drop-after':'is-drop-before');
}
function autoscrollCollectionDrag(p){
 if(collectionPointer!==p||!p.moving)return;
 const edge=64,y=p.y;
 const velocity=y<edge?-Math.min(18,(edge-y)/2):
  y>innerHeight-edge?Math.min(18,(y-(innerHeight-edge))/2):0;
 if(velocity)window.scrollBy(0,velocity);
 paintCollectionDrag(p,p.x,p.y);
 p.scrollFrame=requestAnimationFrame(()=>autoscrollCollectionDrag(p));
}
$('app').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('.collection-sort-handle');
 if(!handle||event.button!==0||!state.editable||state.view!=='collections')return;
 const row=handle.closest('[data-sort-level]');
 const list=row?.closest('[data-sort-list]');
 if(!row||!list)return;
 event.preventDefault();
 clearCollectionDrag();
 collectionPointer={
  id:event.pointerId,handle,row,list,level:row.dataset.sortLevel,
  src:row.dataset.sortLevel==='source'?row.dataset.sortIndex:row.dataset.sortId,
  groupId:group()?.id||null,folderId:folder()?.id||null,
  x:event.clientX,y:event.clientY,
  startX:event.clientX,startY:event.clientY,moving:false,destination:null,after:false,
  scrollFrame:0
 };
 try{handle.setPointerCapture(event.pointerId);}catch{clearCollectionDrag();return;}
 state.collectionDragging=true;
});
$('app').addEventListener('pointermove',event=>{
 const p=collectionPointer;
 if(!p||event.pointerId!==p.id)return;
 p.x=event.clientX;p.y=event.clientY;
 if(!p.moving&&Math.hypot(p.x-p.startX,p.y-p.startY)<6)return;
 if(!p.moving){
  p.moving=true;p.row.classList.add('is-dragging');
  p.scrollFrame=requestAnimationFrame(()=>autoscrollCollectionDrag(p));
 }
 paintCollectionDrag(p,p.x,p.y);
 event.preventDefault();
});
$('app').addEventListener('pointerup',event=>{
 const p=collectionPointer;
 if(!p||event.pointerId!==p.id)return;
 const {level,src,destination,after,groupId,folderId,moving}=p;
 if(moving)collectionSuppressClickUntil=performance.now()+200;
 clearCollectionDrag();
 if(moving&&destination!==null){
  reorderCollectionSlots(level,src,destination,after,groupId,folderId);
 }else if(state.view==='collections'){
  // Reaplicar resultado da consulta, se o inventário mudou durante o arraste.
  render();
 }
 if(moving)event.preventDefault();
});
$('app').addEventListener('pointercancel',()=>{
 if(collectionPointer){clearCollectionDrag();if(state.view==='collections')render();}
});
$('app').addEventListener('keydown',event=>{
 const handle=event.target.closest('.collection-sort-handle');
 if(!handle||!state.editable||state.view!=='collections')return;
 if(!['ArrowUp','ArrowDown'].includes(event.key))return;
 event.preventDefault();event.stopPropagation();
 const row=handle.closest('[data-sort-level]'),level=row?.dataset.sortLevel;
 const list=level==='group'?groups():level==='folder'?group()?.folders:folder()?editableSources(folder()):null;
 if(!row||!list)return;
 const src=level==='source'?Number(row.dataset.sortIndex):list.findIndex(x=>x.id===row.dataset.sortId);
 const down=event.key==='ArrowDown',dest=src+(down?1:-1);
 if(dest<0||dest>=list.length)return;
 const srcId=level==='source'?src:row.dataset.sortId;
 const destId=level==='source'?dest:list[dest].id;
 if(reorderCollectionSlots(level,srcId,destId,down,group()?.id,folder()?.id)){
  const key=level==='source'?String(dest):srcId;
  const newRow=[...document.querySelectorAll('[data-sort-level="'+level+'"]')]
   .find(el=>level==='source'?el.dataset.sortIndex===key:el.dataset.sortId===key);
  newRow?.querySelector('.collection-sort-handle')?.focus({preventScroll:true});
 }
});

let catalogPointer=null;
let skipCatalogClickUntil=0;
function cleanupCatalogPointer(){

 document.querySelectorAll('.hub-catalog-card.is-dragging,.hub-catalog-card.is-drop-target')
  .forEach(e=>e.classList.remove('is-dragging','is-drop-target'));
 catalogPointer=null;
}
$('app').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('.hub-catalog-drag');
 if(!handle||event.button!==0||!state.editable||state.dirty||state.catalogBusy||state.search.trim())return;
 const card=handle.closest('.hub-catalog-card');
 if(!card)return;
 event.preventDefault(); // impedir drag nativo, clique e seleção de texto
 catalogPointer={id:event.pointerId,src:card.dataset.catalogKey,
  startX:event.clientX,startY:event.clientY,moving:false,dst:null};
 handle.setPointerCapture(event.pointerId);
});
$('app').addEventListener('pointermove',event=>{
 const p=catalogPointer;
 if(!p||p.id!==event.pointerId)return;
 if(!p.moving&&Math.hypot(event.clientX-p.startX,event.clientY-p.startY)<6)return;
 p.moving=true;
 const card=document.querySelector('.hub-catalog-card[data-catalog-key="'+CSS.escape(p.src)+'"]');
 card?.classList.add('is-dragging');
 const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('.hub-catalog-card');
 const key=hit?.dataset.catalogKey;
 p.dst=key&&key!==p.src?key:null;
 document.querySelectorAll('.hub-catalog-card.is-drop-target')
  .forEach(e=>e.classList.remove('is-drop-target'));
 if(p.dst)hit.classList.add('is-drop-target');
 event.preventDefault();
});
$('app').addEventListener('pointerup',event=>{
 const p=catalogPointer;
 if(!p||p.id!==event.pointerId)return;
 const dest=p.dst,src=p.src,moving=p.moving;
 if(moving)skipCatalogClickUntil=performance.now()+120;
 cleanupCatalogPointer();
 if(moving&&dest)moveCatalogTo(src,dest);
 if(moving)event.preventDefault();
});
$('app').addEventListener('pointercancel',cleanupCatalogPointer);
let draggedAddon=null;
function clearAddonDragFeedback(){
 document.querySelectorAll('.addon-mini.is-dragging,.addon-mini.is-drop-target')
  .forEach(card=>card.classList.remove('is-dragging','is-drop-target'));
}
// Se a imagem do manifesto não existir mais, exibir as iniciais.
$('app').addEventListener('error',event=>{
 const img=event.target;
 if(img instanceof HTMLImageElement && img.closest('.addon-mini-avatar'))img.hidden=true;
},true);
$('app').addEventListener('dragstart',event=>{
 // Só o cabeçalho compacto é arrastável. Os detalhes expandidos não devem
 // interferir nos botões de configuração, ativação ou prioridade.
 const summary=event.target.closest('.addon-mini summary[data-addon-summary]');
 const card=summary?.closest('.addon-mini');
 if(!card||!summary.draggable||!state.editable||state.addonBusy){
  event.preventDefault();return;
 }
 draggedAddon=card.dataset.addonUrl;
 if(!draggedAddon){event.preventDefault();return;}
 event.dataTransfer.effectAllowed='move';
 event.dataTransfer.setData('text/plain',draggedAddon);
 card.classList.add('is-dragging');
});
$('app').addEventListener('dragover',event=>{
 if(!draggedAddon)return;
 const card=event.target.closest('.addon-mini[data-addon-url]');
 if(!card)return;
 event.preventDefault();
 event.dataTransfer.dropEffect='move';
 document.querySelectorAll('.addon-mini.is-drop-target').forEach(c=>
  c.classList.remove('is-drop-target'));
 if(card.dataset.addonUrl!==draggedAddon)
  card.classList.add('is-drop-target');
});
$('app').addEventListener('drop',event=>{
 const card=event.target.closest('.addon-mini[data-addon-url]');
 if(!card||!draggedAddon)return;
 event.preventDefault();
 const src=draggedAddon,dst=card.dataset.addonUrl;
 draggedAddon=null;
 clearAddonDragFeedback();
 // priorityDragTo já usa a API de prioridade persistida no perfil main.
 priorityDragTo(src,dst);
});
$('app').addEventListener('dragend',()=>{
 draggedAddon=null;
 clearAddonDragFeedback();
});
$('modal').addEventListener('click',onClick);
$('app').addEventListener('change',onField);
$('app').addEventListener('input',e=>{
 if(['searchAddons','searchCatalogs'].includes(e.target.id))onField(e);
});
$('saveButton').addEventListener('click',save);
$('reloadButton').addEventListener('click',reload);
$('modalClose').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').hidden)closeModal();if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save();}});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
globalThis.NuvioPreview.install(state,render);
initial();
setInterval(()=>{
 if(state.view==='addons'&&!document.hidden&&$('modal').hidden)
  void refreshAddonMonitor();
},25000);
})();
