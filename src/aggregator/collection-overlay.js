import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile, validatePublicHttpsUrl } from '../config/json-store.js';

const DATA = resolveDataDir();
const FILE = path.join(DATA, 'hub-overlays.json');
const HISTORY = path.join(DATA, 'hub-overlays-history.json');
const UPSTREAM = path.join(DATA, 'hub-import-events.json');
const MAX_VERSIONS = 20;
const MAX_CHANGES = 65;
const GROUP_FIELDS = ['title','backdropImageUrl','pinToTop','focusGlowEnabled','viewMode','showAllTab','hidden'];
const FOLDER_FIELDS = ['title','coverImageUrl','customCoverImageUrl','heroBackdropUrl','titleLogoUrl','focusGifUrl','coverEmoji','tileShape','hideTitle','focusGifEnabled','hidden'];
const URL_FIELDS = new Set(['backdropImageUrl','coverImageUrl','customCoverImageUrl','heroBackdropUrl','titleLogoUrl','focusGifUrl']);
const FLAGS = new Set(['pinToTop','focusGlowEnabled','showAllTab','hideTitle','focusGifEnabled','hidden']);
const ENUMS = { viewMode:['TABBED_GRID','GRID','ROW'], tileShape:['LANDSCAPE','PORTRAIT','POSTER','SQUARE'] };
const idOK = id => typeof id === 'string' && /^[\w-]{1,125}$/.test(id);
const hash = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const defaults = () => ({ revision:0, updatedAt:null, groups:{}, folders:{}, addedGroups:[], addedFolders:{}, sourceAdds:{}, sourceHides:{}, sourceOrder:{}, catalogAddons:[], groupOrder:[], folderOrder:{} });
const read = (file, fallback) => readJsonFile(file, fallback);
const write = (file, obj) => writeAtomicJsonFile(file, obj);
function validatedPatch(raw, fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Personalização inválida');
  const patch={};
  for(const [k,v] of Object.entries(raw)) {
    if (!fields.includes(k)) throw Error('Campo não permitido: '+k);
    if (FLAGS.has(k)) {
      if(typeof v !== 'boolean') throw Error('O campo '+k+' deve ser booleano');
    } else if (ENUMS[k]) {
      if (!ENUMS[k].includes(v)) throw Error('Valor inválido: '+k);
    } else if (URL_FIELDS.has(k)) {
      if (v!==null && (typeof v!=='string' || v.length>1500 || (v && !/^https:\/\/[^\s]+$/i.test(v)))) {
        throw Error('Imagem deve ser HTTPS ou campo vazio');
      }
    } else if (typeof v !== 'string' || v.length>160 || /[<>]/.test(v)) {
      throw Error('Texto inválido para '+k);
    }
    patch[k]=v;
  }
  return patch;
}
function catalogSources(raw) {
  if(!Array.isArray(raw)||raw.length>25) throw Error('São permitidas até 25 fontes por pasta');
  return raw.map(s=>{
    if (!s || s.provider && s.provider !== 'addon' || typeof s.addonId!=='string' ||
      !/^[a-zA-Z0-9._-]{1,150}$/.test(s.addonId) || !['movie','series','anime','other'].includes(s.type) ||
      typeof s.catalogId!=='string' || s.catalogId.length>160) throw Error('Fonte de catálogo inválida');
    const result={provider:'addon',addonId:s.addonId,type:s.type,catalogId:s.catalogId,genre:null};
    if (s.title) result.title=String(s.title).slice(0,150);
    if (s.addonBaseUrl && /^https:\/\//.test(s.addonBaseUrl))result.addonBaseUrl=s.addonBaseUrl;
    return result;
  });
}
function newFolder(raw) {
  if(!raw || !idOK(raw.id))throw Error('ID da pasta inválido');
  const f=validatedPatch(Object.fromEntries(Object.entries(raw).filter(([k])=>FOLDER_FIELDS.includes(k))),FOLDER_FIELDS);
  if (!f.title)throw Error('Título da pasta é obrigatório');
  return {id:raw.id,title:f.title,tileShape:f.tileShape||'LANDSCAPE',...f,catalogSources:catalogSources(raw.catalogSources||[])};
}
function validateOrder(list) {
  if(!Array.isArray(list)||list.length>1000||list.some(x=>!idOK(x)))throw Error('Ordem de itens inválida');
  return [...new Set(list)];
}
export function validateStudioDocument(doc) {
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw Error('Documento inválido');
  const normalized=defaults();
  for(const [key,fields] of [['groups',GROUP_FIELDS],['folders',FOLDER_FIELDS]]) {
    if(doc[key] && (typeof doc[key]!=='object'||Array.isArray(doc[key])||Object.keys(doc[key]).length>1000))throw Error('Limite de alterações excedido');
    for(const [id,patch] of Object.entries(doc[key]||{})) {
      if(!idOK(id))throw Error('ID inválido');
      normalized[key][id]=validatedPatch(patch,fields);
    }
  }
  if(!Array.isArray(doc.addedGroups||[])||(doc.addedGroups||[]).length>100)throw Error('Limite de coleções próprias excedido');
  const ids=new Set();
  for(const group of doc.addedGroups||[]) {
    if(!idOK(group.id)||!group.id.startsWith('studio-')||ids.has(group.id))throw Error('ID de coleção própria inválido');
    ids.add(group.id);
    const meta=validatedPatch(Object.fromEntries(Object.entries(group).filter(([k])=>GROUP_FIELDS.includes(k))), GROUP_FIELDS);
    if(!meta.title)throw Error('Coleção própria sem título');
    normalized.addedGroups.push({id:group.id,...meta,folders:[]});
  }
  if(doc.addedFolders && (typeof doc.addedFolders!=='object'||Array.isArray(doc.addedFolders)))throw Error('Pastas inválidas');
  for(const [groupId,list] of Object.entries(doc.addedFolders||{})) {
    if(!idOK(groupId)||!Array.isArray(list)||list.length>80) throw Error('Limite de pastas excedido');
    const seen=new Set();
    normalized.addedFolders[groupId]=list.map(f=>{
      const checked=newFolder(f);
      if(!checked.id.startsWith('studio-')||seen.has(checked.id))throw Error('ID de pasta própria inválido');
      seen.add(checked.id);
      return checked;
    });
  }
  // Adicionar/ocultar fontes por ID, em vez de sobrescrever a lista original:
  // assim, novos catálogos do fonte importada continuam chegando automaticamente.
  if(doc.sourceAdds && (typeof doc.sourceAdds!=='object'||Array.isArray(doc.sourceAdds)))throw Error('Fontes inválidas');
  for(const [folderId,list] of Object.entries(doc.sourceAdds||{})) {
    if(!idOK(folderId))throw Error('ID de pasta inválido');
    normalized.sourceAdds[folderId]=catalogSources(list);
  }
  if(doc.sourceHides && (typeof doc.sourceHides!=='object'||Array.isArray(doc.sourceHides)))throw Error('Fontes ocultas inválidas');
  for(const [folderId,list] of Object.entries(doc.sourceHides||{})) {
    if(!idOK(folderId)||!Array.isArray(list)||list.length>100||list.some(x=>typeof x!=='string'||x.length>350))throw Error('Fonte oculta inválida');
    normalized.sourceHides[folderId]=[...new Set(list)];
  }
  // A ordem é persistida por identidade completa do catálogo e não por índice:
  // catálogos novos do fonte importada permanecem no final, sem perder o resto.
  if(doc.sourceOrder && (typeof doc.sourceOrder!=='object'||Array.isArray(doc.sourceOrder)))throw Error('Ordem de catálogos inválida');
  for(const [folderId,list] of Object.entries(doc.sourceOrder||{})) {
    if(!idOK(folderId)||!Array.isArray(list)||list.length>120 ||
       list.some(x=>typeof x!=='string'||x.length>350||!x.includes('::')))throw Error('Ordem de catálogos inválida');
    normalized.sourceOrder[folderId]=[...new Set(list)];
  }
  const included=doc.catalogAddons||[];
  if(!Array.isArray(included)||included.length>12)throw Error('Limite de addons com catálogos excedido');
  const addonURLs=new Set();
  for(const item of included) {
    if(!item || typeof item.url!=='string'||item.url.length>1500)throw Error('URL de addon inválida');
    const urlStr = validatePublicHttpsUrl(item.url, 'URL de addon inválida ou duplicada');
    if(addonURLs.has(urlStr))throw Error('URL de addon inválida ou duplicada');
    addonURLs.add(urlStr);
    if(!Array.isArray(item.selected)||item.selected.length>10000||
      item.selected.some(x=>typeof x!=='string'||!/^(movie|series|anime|other)::.{1,220}$/.test(x)))
      throw Error('Seleção de catálogos inválida');
    normalized.catalogAddons.push({url:urlStr,selected:[...new Set(item.selected)]});
  }
  normalized.groupOrder=validateOrder(doc.groupOrder||[]);
  if(doc.folderOrder && (typeof doc.folderOrder!=='object'||Array.isArray(doc.folderOrder)))throw Error('Ordem de pastas inválida');
  for(const [k,v] of Object.entries(doc.folderOrder||{})) {
    if(!idOK(k))throw Error('ID inválido de coleção');
    normalized.folderOrder[k]=validateOrder(v);
  }
  return normalized;
}
export function getStudioDocument() {
  return {...defaults(), ...read(FILE,{})};
}
export function applyStudioOverlay(upstream, doc=getStudioDocument()) {
  if(!Array.isArray(upstream))throw Error('Coleções inválidas');
  const collections=structuredClone(upstream);
  const created=(doc.addedGroups||[]).map(g=>({...g,folders:[]}));
  collections.push(...created);
  const patched=collections.filter(g=>{
    const diff=doc.groups?.[g.id]||{};
    Object.assign(g,structuredClone(diff));
    return !g.hidden;
  }).map(g=>{
    const own=(doc.addedFolders||{})[g.id]||[];
    g.folders=[...(g.folders||[]),...structuredClone(own)].filter(f=>{
      Object.assign(f,structuredClone(doc.folders?.[f.id]||{}));
      const identity = s => [s.addonId,s.type,s.catalogId,s.genre||''].join('::');
      const extra = doc.sourceAdds?.[f.id]||[];
      const hidden = new Set(doc.sourceHides?.[f.id]||[]);
      const sources = [...(f.catalogSources||f.sources||[])];
      const keys = new Set(sources.map(identity));
      for(const s of extra) if(!keys.has(identity(s))) {sources.push(structuredClone(s));keys.add(identity(s));}
      f.catalogSources=sources.filter(s=>!hidden.has(identity(s)));
      const order=doc.sourceOrder?.[f.id]||[];
      if(order.length)f.catalogSources.sort((a,b)=>{
        const ia=order.indexOf(identity(a)),ib=order.indexOf(identity(b));
        return (ia<0?100000:ia)-(ib<0?100000:ib);
      });
      if ('sources' in f) delete f.sources;
      return !f.hidden;
    });
    const order=doc.folderOrder?.[g.id]||[];
    if(order.length)g.folders.sort((a,b)=>{
      const ai=order.indexOf(a.id),bi=order.indexOf(b.id);
      return (ai<0?100000:ai)-(bi<0?100000:bi);
    });
    return g;
  });
  const order=doc.groupOrder||[];
  if(order.length)patched.sort((a,b)=>{
    const ai=order.indexOf(a.id),bi=order.indexOf(b.id);
    return (ai<0?100000:ai)-(bi<0?100000:bi);
  });
  return patched;
}
export function saveStudioDocument(input,expectedRevision) {
  const previous=getStudioDocument();
  if(expectedRevision!==previous.revision) {
    const error=new Error('Outro salvamento ocorreu. Recarregue antes de continuar.');
    error.status=409;throw error;
  }
  const candidate=validateStudioDocument(input);
  const current={...candidate, revision:previous.revision+1, updatedAt:new Date().toISOString()};
  const history=read(HISTORY,[]);
  history.unshift({revision:previous.revision, savedAt:new Date().toISOString(), document:previous});
  write(HISTORY,history.slice(0,MAX_VERSIONS));
  write(FILE,current);
  return current;
}
export function getStudioHistory() {
  return read(HISTORY,[]).map(({revision,savedAt})=>({revision,savedAt}));
}
export function restoreStudioRevision(revision,expectedRevision) {
  const h=read(HISTORY,[]).find(h=>h.revision===revision);
  if(!h)throw Error('Revisão não encontrada');
  return saveStudioDocument(h.document,expectedRevision);
}
function indexOfSources(collections,manifest) {
  const groups={},folders={};
  for(const c of collections) {
    if (!c?.id)continue;
    groups[c.id]=hash(Object.fromEntries(Object.entries(c).filter(([k])=>k!=='folders')));
    for(const f of c.folders||[]) {
      if(!f?.id)continue;
      folders[f.id]={
        group:c.id,
        signature:hash(f),
        cover:hash([f.coverImageUrl,f.customCoverImageUrl,f.heroBackdropUrl,f.titleLogoUrl])
      };
    }
  }
  return {
    groups,folders,
    catalogs:hash((manifest.catalogs||[]).map(c=>[c.type,c.id,c.name])),
    capturedAt:new Date().toISOString()
  };
}
export function upstreamChanges(before,next) {
  if(!before) return { initial:true,addedGroups:Object.keys(next.groups).length, addedFolders:Object.keys(next.folders).length, removedGroups:0,removedFolders:0,updatedGroups:0,updatedFolders:0,updatedCovers:0,catalogListChanged:false };
  const delta=(a,b)=>Object.keys(b).filter(k=>!(k in a)).length;
  const common=(a,b)=>Object.keys(b).filter(k=>k in a);
  return {
    initial:false,
    addedGroups:delta(before.groups,next.groups),removedGroups:delta(next.groups,before.groups),
    updatedGroups:common(before.groups,next.groups).filter(k=>before.groups[k]!==next.groups[k]).length,
    addedFolders:delta(before.folders,next.folders),removedFolders:delta(next.folders,before.folders),
    updatedFolders:common(before.folders,next.folders).filter(k=>before.folders[k].signature!==next.folders[k].signature).length,
    updatedCovers:common(before.folders,next.folders).filter(k=>before.folders[k].cover!==next.folders[k].cover).length,
    catalogListChanged:before.catalogs!==next.catalogs
  };
}
export function observeStudioUpstream(collections,manifest) {
  const next=indexOfSources(collections,manifest);
  const db=read(UPSTREAM,{latest:null,events:[]});
  const stats=upstreamChanges(db.latest,next);
  const hadChanges=stats.initial||Object.entries(stats).some(([k,v])=>k!=='initial'&&v!==0&&v!==false);
  if(hadChanges){
    db.events.unshift({at:next.capturedAt,stats});
    db.events=db.events.slice(0,MAX_CHANGES);
  }
  db.latest=next;
  write(UPSTREAM,db);
  return {changed:hadChanges,stats};
}
export function getStudioStatus() {
  const doc=getStudioDocument(),up=read(UPSTREAM,{latest:null,events:[]});
  return {
    revision:doc.revision, editedAt:doc.updatedAt,
    localGroups:(doc.addedGroups||[]).length,
    overriddenGroups:Object.keys(doc.groups||{}).length,
    overriddenFolders:Object.keys(doc.folders||{}).length,
    lastChecked:up.latest?.capturedAt||null,
    recentUpstreamChanges:(up.events||[]).slice(0,20)
  };
}
