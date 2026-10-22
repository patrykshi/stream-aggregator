/* Atualização opcional dos snapshots de listas. Sem acesso à conta Nuvio. */
import crypto from 'node:crypto';
import path from 'node:path';
import {resolveDataDir,readJsonFile,writeAtomicJsonFile} from '../config/json-store.js';
import {loadStudioImport,applyWorkspaceChange} from './studio-import.js';
import {previewBuilderSource} from './catalog-builder.js';

const FILE = path.join(resolveDataDir(), 'catalog-refresh-settings.json');
const PROVIDERS = new Set(['trakt','mdblist','tmdb','tvmaze']);
const DAY = 24 * 60 * 60 * 1000;
const plans = new Map();
let running = false;
const identity = c => [c.addonId || 'nuvio.studio',c.type,c.id].join('::');
export function refreshableCatalogs(current) {
 return (current?.manifest?.catalogs || []).filter(c=>c?.manual === true && PROVIDERS.has(c?.listSource?.provider));
}
export function refreshSettings() {
 const raw = readJsonFile(FILE, {});
 return {automatic:raw?.automatic===true,cursor:Number.isInteger(raw?.cursor)?raw.cursor:0,lastRunAt:raw?.lastRunAt||null,
  lastResult:raw?.lastResult||null,intervalHours:24};
}
export function saveRefreshSettings(automatic) {
 if(typeof automatic!=='boolean')throw Error('Escolha explicitamente ativar ou desativar a atualização automática.');
 const next={...refreshSettings(),automatic};
 writeAtomicJsonFile(FILE,next);
 return next;
}
function oldTitleCount(c){return Array.isArray(c.metas)?c.metas.length:0;}
export function safeRefresh(oldCat,metas) {
 if(!Array.isArray(metas)||!metas.length)return {safe:false,reason:'A origem respondeu sem títulos.'};
 const valid=metas.filter(m=>m&&typeof m.id==='string'&&m.id.length>0&&m.type===oldCat.type);
 const unique = new Set(valid.map(x=>x.type+'::'+x.id));
 if(valid.length!==metas.length||unique.size!==valid.length)
  return {safe:false,reason:'A origem retornou títulos inválidos ou duplicados.'};
 const before=oldTitleCount(oldCat);
 if(before>=20&&valid.length<Math.ceil(before*.75))
  return {safe:false,reason:'Redução acima de 25% exige revisão manual antes de atualizar.'};
 return {safe:true,oldCount:before,count:valid.length};
}
function sourcePayload(c) {
 const s=c.listSource||{};
 return {source:s.provider,type:c.type,url:s.url||'',listId:s.listId||null,
  listVersion:s.listVersion||'v4',query:s.query||'',mode:s.mode||'popular',filters:s.filters||{}};
}
export async function computeRefresh(current,{fetchPreview=previewBuilderSource,maxCatalogs=20,offset=0}={}) {
 const eligible=refreshableCatalogs(current);
 const start=eligible.length?offset%eligible.length:0;
 const candidates=eligible.length?Array.from({length:Math.min(maxCatalogs,eligible.length)},(_,i)=>eligible[(start+i)%eligible.length]):[];
 const changes=[],errors=[];
 for (const catalog of candidates) {
  try {
   const result=await fetchPreview(sourcePayload(catalog));
   const metas=Array.isArray(result?.metas)?result.metas:[];
   const safe=safeRefresh(catalog,metas);
   if(!safe.safe){errors.push({id:catalog.id,name:catalog.name,reason:safe.reason});continue;}
   if(JSON.stringify(catalog.metas||[])===JSON.stringify(metas))continue;
   // Preserva tipo e identidade do catálogo publicado; revisões e coleções não mudam.
   changes.push({key:identity(catalog),id:catalog.id,name:catalog.name,
     oldCount:safe.oldCount,count:safe.count,metas});
  }catch{errors.push({id:catalog.id,name:catalog.name,reason:'Fonte indisponível ou credencial ausente.'});}
 }
 return {revision:current.revision,changes,errors,total:eligible.length,scanned:candidates.length,
  limited:eligible.length>candidates.length};
}
export function applyRefreshPlan(current,plan,clock=new Date().toISOString()) {
 if(!current||current.revision!==plan.revision) {
  const error=Error('A biblioteca mudou após a prévia; gere uma nova revisão.');error.status=409;throw error;
 }
 const byKey=new Map(plan.changes.map(c=>[c.key,c]));
 const cats=current.manifest.catalogs.map(c=>{
  const change=byKey.get(identity(c));
  if(!change)return c;
  if(!safeRefresh(c,change.metas).safe)throw Error('Alteração insegura detectada antes da publicação.');
  return {...c,metas:change.metas,listSource:{...c.listSource,updatedAt:clock}};
 });
 return {catalogs:{...current.manifest,catalogs:cats},collections:current.collections,allowEmpty:true};
}
export async function previewCatalogRefresh() {
 if(running){const e=Error('Outra atualização de listas já está em andamento.');e.status=429;throw e;}
 const current=loadStudioImport();
 if(!current){const e=Error('Importe ou crie uma biblioteca antes de atualizar as listas.');e.status=409;throw e;}
 running=true;
 try {
  const result=await computeRefresh(current);
  const token=crypto.randomUUID();
  plans.clear();plans.set(token,{plan:result,expires:Date.now()+5*60_000});
  return {token,expectedRevision:result.revision,total:result.total,limited:result.limited,
   changes:result.changes.map(({id,name,oldCount,count})=>({id,name,oldCount,count})),errors:result.errors};
 }finally{running=false;}
}
export function commitCatalogRefresh(token,expectedRevision) {
 const entry=plans.get(token);plans.delete(token);
 if(!entry||entry.expires<Date.now()) {const e=Error('Prévia expirada. Consulte novamente antes de aplicar.');e.status=409;throw e;}
 const current=loadStudioImport();
 if(expectedRevision!==entry.plan.revision||current?.revision!==entry.plan.revision){
  const e=Error('A biblioteca mudou depois da consulta.');e.status=409;throw e;
 }
 if(!entry.plan.changes.length)return {updated:0,revision:current.revision};
 const payload=applyRefreshPlan(current,entry.plan);
 const status=applyWorkspaceChange(payload,current.revision);
 return {updated:entry.plan.changes.length,revision:status.revision};
}
export async function runScheduledCatalogRefresh({now=Date.now()}={}) {
 const setting=refreshSettings();
 if(!setting.automatic||running)return {skipped:true};
 if(setting.lastRunAt&&now-Date.parse(setting.lastRunAt)<DAY)return {skipped:true};
 const current=loadStudioImport();
 if(!current)return {skipped:true};
 running=true;
 try {
  const plan=await computeRefresh(current,{maxCatalogs:10,offset:setting.cursor||0});
  // Um único commit atômico, se outro editor alterou a biblioteca, abortar sem sobrescrever.
  if(plan.changes.length)applyWorkspaceChange(applyRefreshPlan(current,plan),current.revision);
  const record={...setting,cursor:plan.total?((setting.cursor||0)+plan.scanned)%plan.total:0,lastRunAt:new Date(now).toISOString(),
   lastResult:{updated:plan.changes.length,failed:plan.errors.length,limited:plan.limited}};
  writeAtomicJsonFile(FILE,record);
  return {updated:plan.changes.length,failed:plan.errors.length,limited:plan.limited};
 }finally{running=false;}
}
export function startCatalogRefreshScheduler(onChange=()=>{}) {
 const timer=setInterval(()=>void runScheduledCatalogRefresh()
  .then(result=>{if(result.updated)onChange();})
  .catch(e=>console.warn('Catalog refresh:',e.message)),60*60*1000);
 timer.unref();
 return timer;
}
