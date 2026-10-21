import {getBuilderCapabilities,previewBuilderSource,fetchMDBOwnLists,listTraktUserLists,listTMDBAccountLists} from './aggregator/catalog-builder.js';
import {integrationStatuses,updateIntegrationSettings} from './config/hub-integrations.js';
import {getSourceAccount,sourceAccountStatus,updateSourceAccounts} from './config/hub-source-accounts.js';
import {erdbConfig,erdbStatus,saveErdbSettings} from './config/hub-artwork-erdb.js';
import {decorateCatalogResponse,decorateMetaResponse,makeErdbImage,verifyErdbImageRequest} from './aggregator/artwork-erdb.js';
import {validatePreviewRequest,pickProvider,fetchPreviewSample,localPreviewSample,repeatedPreviewPage} from './aggregator/preview-catalog.js';
import {beginTMDBAuthorization,finishTMDBAuthorization} from './aggregator/tmdb-connection.js';
import {parseImdbList,fetchTraktList,validateListURL} from './aggregator/list-import.js';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { encodeConfig, decodeConfig, getDefaultConfig } from './config/codec.js';
import { listProfiles, getProfile, getProfileConfig, saveProfile, deleteProfile } from './config/profiles.js';
import { aggregateStreams, normalizeAddonBaseUrl } from './aggregator/engine.js';
import { generateManifest } from './aggregator/manifest.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './aggregator/url-helper.js';
import { aggregateSubtitles } from './aggregator/subtitles.js';
import { fetchCatalog, fetchMeta } from './aggregator/catalogs.js';
import { checkAddons, getMonitorReport, startMonitor, effectiveConfig, monitorRevision } from './aggregator/monitor.js';
import { getBridgeSettings, saveBridgeSettings, previewExternalAddon, catalogKey, bridgeSnapshot, bridgeStatus, invalidateBridgeCache, bridgeCatalogs, bridgeCatalogStream, bridgeManifestExtras } from './aggregator/catalog-service.js';
import { getStudioDocument, saveStudioDocument, getStudioHistory, restoreStudioRevision, getStudioStatus } from './aggregator/collection-overlay.js';
import { loadStudioImport, getStudioImportStatus, saveStudioImport, validateStudioImport, previewWorkspaceChange, applyWorkspaceChange } from './aggregator/studio-import.js';
import { prepareCoverCollections, getPreparedCover, registerCover, getCoverAdapterStatus, supportedCover, normalizeShape } from './aggregator/cover-adapter.js';
import { getPublication, publishedCatalog, publishedMeta, registerPublicationProvider, removePublicationProvider, listPublicationProviders, invalidatePublication } from './aggregator/nuvio-publication.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7001;

// Middlewares
// Não registrar URLs: podem incluir tokens de configuração e IDs de addons.
app.use((req, res, next) => {
  const started=Date.now();
  res.on('finish', () => console.log(`[${new Date().toISOString()}] ${req.method} ${res.statusCode} ${Date.now()-started}ms`));
  next();
});
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Imagens ERDB: renderer de arte, sem divulgar token nas URLs da biblioteca.
const erdbImageCache=new Map();
let erdbImageCacheBytes=0;
app.get('/artwork/erdb/:kind/:type/:id/:sig.jpg',async(req,res)=>{
 const {kind,type,id,sig}=req.params;
 const shape=req.query.shape==='landscape'?'landscape':'';
 const conf=erdbConfig();
 if(!verifyErdbImageRequest(conf,kind,type,id,sig,shape))
  return res.status(404).end();
 const url=makeErdbImage(conf,kind,type,id,shape);
 const key=[kind,type,id,sig,shape].join('::');
 const cached=erdbImageCache.get(key);
 if(cached&&cached.expires>Date.now()){
  res.setHeader('Content-Type',cached.mime);
  res.setHeader('Cache-Control','public, max-age=3600');
  return res.end(cached.data);
 }
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});
  const mime=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!r.ok||!['image/jpeg','image/png','image/webp'].includes(mime)||
     Number(r.headers.get('content-length')||0)>5_000_000)
   return res.status(502).end();
  const bytes=Buffer.from(await r.arrayBuffer());
  if(bytes.length>5_000_000)return res.status(502).end();
  while(erdbImageCache.size>=40||erdbImageCacheBytes+bytes.length>24_000_000){
   const old=erdbImageCache.keys().next().value;
   if(!old)break;
   erdbImageCacheBytes-=erdbImageCache.get(old).data.length;
   erdbImageCache.delete(old);
  }
  erdbImageCache.set(key,{data:bytes,mime,expires:Date.now()+3600_000});
  erdbImageCacheBytes+=bytes.length;
  res.setHeader('Content-Type',mime);
  res.setHeader('Cache-Control','public, max-age=3600');
  res.end(bytes);
 }catch{return res.status(502).end();}
});
// Rota de Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Disponibilidade do manifesto NÃO é sinônimo de conteúdo disponível.
// O monitor registra separadamente o resultado e a latência de cada busca.
startMonitor(() => getProfileConfig('main'), () => {
  invalidatePublication();
  installedCatalogsCache=null;installedCatalogsAt=0;
});
app.get('/api/monitor', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getMonitorReport(getProfileConfig('main')));
});
let lastManualCheck = 0;
app.post('/api/monitor/check', requireLocalEdit, async (req, res) => {
  const now = Date.now();
  if (now - lastManualCheck < 60_000) {
    return res.status(429).json({ error: 'Aguarde um minuto entre verificações manuais.' });
  }
  lastManualCheck = now;
  try {
    const previous=monitorRevision();
    await checkAddons(() => getProfileConfig('main'), { force: true });
    if(previous!==monitorRevision())invalidatePublication();
    res.setHeader('Cache-Control', 'no-store');
    res.json(getMonitorReport(getProfileConfig('main')));
  } catch {
    res.status(503).json({ error: 'Não foi possível completar a verificação.' });
  }
});

// Edição livre NO COMPUTADOR, sem senha ou token. Cloudflare continua
// oferecendo APIs de playback e JSON em modo público somente-leitura.
// O Host deve ser loopback: cabeçalhos Cloudflare jamais dão acesso à edição.
function localEditor(req) {
  const host=(req.get('host')||'').split(':')[0].toLowerCase();
  const local=['127.0.0.1','localhost','[::1]'].includes(host);
  if(!local || req.get('cf-connecting-ip'))return false;
  const origin=req.get('origin');
  if(origin) {
    try {
      const u=new URL(origin);
      if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))return false;
      if(u.port && !['7001',String(PORT)].includes(u.port))return false;
    }catch{return false;}
  }
  return true;
}
function requireLocalEdit(req,res,next){
  if(!localEditor(req))return res.status(403).json({
    error:'Edição local: abra http://127.0.0.1:7001 no computador. No domínio público, a edição é somente leitura.'
  });
  next();
}
const requireBridgeAdmin=requireLocalEdit;
app.get('/api/hub/access',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({canEdit:localEditor(req),mode:localEditor(req)?'local':'read-only',tokenRequired:false});
});
const handleBridgeError = (res, err) => {
  console.error('[Catalog Bridge]', err.message);
  res.status(503).json({ error: 'Falha ao atualizar catálogos. Consulte o status e tente novamente.' });
};
app.get('/api/catalog-bridge/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await bridgeStatus());
});
app.get('/api/catalog-bridge/settings', requireBridgeAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getBridgeSettings());
});
app.post('/api/catalog-bridge/settings', requireBridgeAdmin, (req, res) => {
  try { res.json({ success: true, settings: saveBridgeSettings(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/catalog-bridge/addon-preview', requireBridgeAdmin, async (req, res) => {
  try { res.json(await previewExternalAddon(req.body?.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get(['/api/catalog-bridge/collections.json','/api/hub/collections.json'], async (req, res) => {
  if (req.query.refresh === '1' && !localEditor(req)) {
    return res.status(401).json({ error: 'Atualização forçada exige a chave administrativa.' });
  }
  try {
    const snapshot = await bridgeSnapshot({ force: req.query.refresh === '1' });
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('X-Catalog-Bridge-State', snapshot.stale ? 'stale' : 'fresh');
    const output=prepareCoverCollections((await publication()).collections);
    res.setHeader('X-Nuvio-Artwork-Prepared', String(output.adapted));
    res.setHeader('X-Nuvio-Sources-Routed', String((await publication()).status.routed));
    res.json(output.collections);
  } catch (e) { handleBridgeError(res, e); }
});
app.get('/api/catalog-bridge/report', requireBridgeAdmin, async (req, res) => {
  try {
    const snapshot = await bridgeSnapshot();
    res.json({
      fetchedAt: snapshot.fetchedAt, stale: snapshot.stale,
      groups: snapshot.collections.length, labelsAdded: snapshot.labelsAdded,
      missed: snapshot.missed, catalogCount: snapshot.catalogCount,
      extraCatalogs: snapshot.extraCatalogs, external: snapshot.external.map(a => ({
        name: a.name, selected: a.catalogs.length
      }))
    });
  } catch (e) { handleBridgeError(res, e); }
});

// Mantém a manifestação atual como streams/legendas quando não há extras;
// só acrescenta catalog quando o usuário escolheu explicitamente extras.
async function mainManifestWithBridge(config) {
  const base = generateManifest(config);
  const cfg = getBridgeSettings();
  const workspace=loadStudioImport();
  if (!(cfg.externalAddons || []).some(a => a.enabled && a.selected?.length) &&
      !(getStudioDocument().catalogAddons || []).some(a => a.selected?.length) &&
      !(workspace?.manifest?.catalogs||[]).some(c=>c.manual || c.sourceUrl))return base;
  try {
    const result=bridgeManifestExtras(base, await bridgeSnapshot());
    const manual=(workspace?.manifest?.catalogs||[]).some(c=>c.manual&&c.metas?.length);
    if(manual && !result.resources.some(r=>(typeof r==='string'?r:r.name)==='meta')){
      result.resources.push({name:'meta',types:['movie','series','anime','other']});
    }
    return result;
  } catch (e) { console.warn('[Catalog Hub] Manifesto preservado:', e.message); return base; }
}
function localMetadata(type,id){
  const workspace=loadStudioImport();
  for(const catalog of workspace?.manifest?.catalogs||[]){
    if(!catalog.manual || catalog.type!==type)continue;
    const meta=(catalog.metas||[]).find(item=>item.id===id);
    if(meta)return {meta:{...meta,type}};
  }
  return null;
}
async function publication() {
  const config = effectiveConfig(getProfileConfig('main') || getDefaultConfig());
  const snapshot = await bridgeSnapshot();
  const result=await getPublication({ config, baseManifest: await mainManifestWithBridge(config),
    collections: snapshot.collections });
  // Ordem global dos catálogos no manifesto: somente catálogos expostos.
  // Catálogos presentes apenas na biblioteca não são instalados implicitamente.
  const workspace=loadStudioImport();
  const keys=(workspace?.manifest?.catalogs||[]).map((cat,index)=>{
    const key=cat.sourceUrl && cat.sourceId
      ? catalogKey(cat.sourceUrl,cat.type,cat.sourceId) : cat.id;
    return [cat.type+'::'+key,index];
  });
  const positions=new Map(keys);
  const ordered=[...(result.manifest.catalogs||[])].sort((a,b)=>{
    const ia=positions.get(a.type+'::'+a.id),ib=positions.get(b.type+'::'+b.id);
    return (ia??Number.MAX_SAFE_INTEGER)-(ib??Number.MAX_SAFE_INTEGER);
  });
  return {...result,manifest:{...result.manifest,catalogs:ordered}};
}
export function resolveExtraParam(paramsExtra, query) {
  if (paramsExtra) return paramsExtra;
  const entries = Object.entries(query || {}).filter(([k]) => k !== 'extra');
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function mainCatalogWithBridge(config, type, id, extra) {
  if (/^(bx[a-f0-9]{12}_[a-f0-9]{16}|bm_[a-zA-Z0-9_-]{1,64}|studio_[a-z0-9_-]{1,100})$/.test(id)) {
    const resolved = await publishedCatalog(type, id, extra, await publication());
    if (resolved) return resolved;
    const extraCatalog = await bridgeCatalogStream(await bridgeSnapshot(), type, id, extra || '');
    return extraCatalog || { metas: [] };
  }
  return fetchCatalog(config, type, id, extra || '');
}



// O Studio só altera uma camada de preferências isolada dos dados recebidos.
app.get('/api/hub/studio-status', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getStudioStatus());
});
app.get('/api/hub/edit-document', requireBridgeAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getStudioDocument());
});
app.put('/api/hub/edit-document', requireBridgeAdmin, (req, res) => {
  try {
    checkStudioInstalledSelection(req.body?.document);
    const saved = saveStudioDocument(req.body?.document, req.body?.revision);
    invalidateBridgeCache(); invalidatePublication();
    res.json({ success: true, document: saved });
  } catch(e) { res.status(e.status || 400).json({ error:e.message }); }
});
app.get('/api/hub/edit-history', requireBridgeAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ history: getStudioHistory() });
});
app.post('/api/hub/edit-restore', requireBridgeAdmin, (req, res) => {
  try {
    const restored = restoreStudioRevision(req.body?.restoreRevision, req.body?.revision);
    invalidateBridgeCache(); invalidatePublication();
    res.json({ success: true, document: restored });
  } catch(e) { res.status(e.status || 400).json({ error:e.message }); }
});
// Consulta somente addons JÁ instalados no perfil principal; manifestos podem
// falhar ou oferecer apenas stream/legendas. Nenhuma ativação automática.
let installedCatalogsCache=null, installedCatalogsAt=0;
app.get('/api/hub/provider-inventory', requireBridgeAdmin, async (req,res) => {
  const now=Date.now();
  if(req.query?.refresh!=='1'&&installedCatalogsCache && now-installedCatalogsAt<5*60_000)return res.json(installedCatalogsCache);
  const installed=(getProfileConfig('main')?.addons||[]).filter(a=>a?.url);
  const output=[];
  // Lotes pequenos não sobrecarregam serviços de terceiros.
  for(let i=0;i<installed.length;i+=4){
    const batch=await Promise.all(installed.slice(i,i+4).map(async a=>{
      try{
        const manifest=await previewExternalAddon(a.url);
        return {name:a.name||manifest.name,url:a.url,addonId:manifest.addonId,enabled:a.enabled!==false,
          status:'ok',resources:manifest.resources||[],
          capabilities:{
            catalog:manifest.catalogs.some(c=>['movie','series'].includes(c.type)),
            metadata:(manifest.resources||[]).includes('meta'),
            stream:(manifest.resources||[]).includes('stream'),
            subtitles:(manifest.resources||[]).includes('subtitles')
          },
          catalogs:manifest.catalogs.filter(c=>['movie','series'].includes(c.type))};
      }catch(e) {
        return {name:a.name||'Addon',enabled:a.enabled!==false,status:'indisponivel',
          capabilities:{catalog:false,metadata:false,stream:false,subtitles:false},
          resources:[],catalogs:[]};
      }
    }));
    output.push(...batch);
  }
  const response={addons:output,catalogsAvailable:output.reduce((s,a)=>s+(a.enabled?a.catalogs.length:0),0),
    checkedAt:new Date().toISOString()};
  installedCatalogsCache=response;installedCatalogsAt=now;
  res.setHeader('Cache-Control','no-store');
  res.json(response);
});
function checkStudioInstalledSelection(doc){
  const allowed=new Set((getProfileConfig('main')?.addons||[]).filter(a=>a.enabled!==false).map(a=>a.url));
  for(const addon of (doc?.catalogAddons||[]))if(!allowed.has(addon.url))
    throw Error('Catálogo de addon não habilitado ou não instalado no Agregador principal.');
  // IDs proxy apenas para catálogos cujos URLs foram explicitamente selecionados.
  const valid=new Set((doc?.catalogAddons||[]).flatMap(a=>a.selected.map(x=>{
    const [type,...id]=x.split('::'); return catalogKey(a.url,type,id.join('::'));
  })));
  for(const sources of Object.values(doc?.sourceAdds||{}))
    for(const s of sources)if(s.addonId==='community.streamaggregator.unified'&&
      s.catalogId?.startsWith('bx')&&!valid.has(s.catalogId))
      throw Error('Seleção de addon não corresponde ao catálogo solicitado.');
}
app.get('/api/hub/catalog-options', requireBridgeAdmin, async (req,res) => {
  try {
    const snapshot = await bridgeSnapshot();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      catalogs: snapshot.catalogOptions || [],
      groups: snapshot.collections.length,
      stale: snapshot.stale,
      fetchedAt: snapshot.fetchedAt
    });
  } catch(e) { handleBridgeError(res,e); }
});
// Capas verdadeiramente adaptadas (WebP): o player não precisa saber fazer
// object-fit contain. URL muda quando origem ou formato mudam.
app.get('/api/hub/artwork/status', (_req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.json(getCoverAdapterStatus());
});
app.post('/api/hub/artwork/preview', requireBridgeAdmin, (req,res) => {
  const {url,shape}=req.body||{};
  if(!supportedCover(url))return res.status(400).json({error:'Imagem não suportada. Utilize uma fonte HTTPS permitida.'});
  res.json({url:registerCover(url,normalizeShape(shape)),shape:normalizeShape(shape)});
});
app.get('/api/hub/artwork/:shape/:key.webp', async (req,res) => {
  try {
    const image=await getPreparedCover(req.params.shape,req.params.key);
    if(!image)return res.status(404).end();
    res.setHeader('Content-Type','image/webp');
    // Máximo de 10 min no cliente; novas capas mudam o hash da URL e invalidam cache.
    res.setHeader('Cache-Control','public, max-age=600, stale-while-revalidate=600');
    res.setHeader('X-Artwork-Cache',image.stale?'stale':image.cached?'hit':'generated');
    res.end(image.data);
  }catch(e) {
    console.warn('[Nuvio artwork]',e.message);
    res.status(502).json({error:'Capa temporariamente indisponível'});
  }
});
// UI unificada: biblioteca de coleções editável diretamente, revisão e backup.
// Simulação Nuvio: lê 12 títulos por solicitação. Somente fornecedores instalados,
 // identificados por manifesto, sem URL arbitrária, sem gravação ou sincronização.
const previewCache=new Map();
let previewConcurrent=0;
app.post('/api/hub/preview/catalog-items',requireLocalEdit,async(req,res)=>{
 try{
  const source=validatePreviewRequest(req.body);
  res.setHeader('Cache-Control','no-store');
  const saved=loadStudioImport();
  const local=(saved?.manifest?.catalogs||[]).find(c=>c.type===source.type&&
   c.id===source.catalogId&&[c.addonId||'nuvio.studio','community.streamaggregator.unified'].includes(source.addonId));
  if(local&&Array.isArray(local.metas))
   return res.json(localPreviewSample(source,local));
  const installed=(getProfileConfig('main')?.addons||[]).filter(a=>a?.url&&a.enabled!==false);
  const candidate=installed.filter(a=>
   (installedCatalogsCache?.addons||[]).some(p=>p.url===a.url&&
    p.addonId===source.addonId&&p.catalogs?.some(c=>c.type===source.type&&c.id===source.catalogId)));
  let found=null;
  if(candidate.length&&installedCatalogsCache){
   found=pickProvider(source,installed,installedCatalogsCache.addons);
  } else {
   // Apenas URLs já instaladas e autorizadas no perfil: nunca seguir URL do cliente.
   for(const addon of installed){
    const manifest=await previewExternalAddon(addon.url).catch(()=>null);
    if(!manifest||manifest.addonId!==source.addonId)continue;
    found=pickProvider(source,installed,[manifest]);if(found)break;
   }
  }
  if(!found)return res.status(404).json({error:'Referência não localizada nos catálogos dos addons ativos.'});
  const cacheKey=JSON.stringify([found.manifest.url,source.type,source.catalogId,source.genre,source.page]);
  const cached=previewCache.get(cacheKey);
  if(!source.refresh&&cached&&cached.until>Date.now())return res.json({...cached.result,cache:'hit'});
  if(previewConcurrent>=3)return res.status(429).json({error:'Muitas prévias simultâneas. Aguarde alguns segundos.'});
  previewConcurrent++;
  try {
   const result=await fetchPreviewSample({selection:source,provider:found});
   if(source.page>0){
    const firstKey=JSON.stringify([found.manifest.url,source.type,source.catalogId,source.genre,0]);
    if(repeatedPreviewPage(previewCache.get(firstKey)?.result,result)){
     result.pageUnsupported=true;
     result.hasMore=false;
    }
   }
   if(previewCache.size>180)previewCache.clear();
   previewCache.set(cacheKey,{result,until:Date.now()+120000});
   res.json(result);
  }finally{previewConcurrent--;}
 }catch(e){
  res.status(e.message.includes('inválid')||e.message.includes('Página')?400:502)
   .json({error:e.message||'Não foi possível consultar este catálogo.'});
 }
});
app.get('/api/hub/workspace',requireLocalEdit,(req,res)=>{
  const data=loadStudioImport();
  res.setHeader('Cache-Control','no-store');
  res.json(data?{
    revision:data.revision,catalogs:data.manifest?.catalogs||[],collections:data.collections||[],
    importedAt:data.importedAt
  }:{revision:0,catalogs:[],collections:[]});
});
// Ordena apenas os catálogos, preservando coleções e todo o conteúdo.
// A revisão evita sobrescrever outra edição feita em paralelo.
function catalogIdentity(c){
  return JSON.stringify([c?.addonId||'nuvio.studio',c?.type,c?.id]);
}
// Importar listas: pré-visualização isolada sem modificar a biblioteca.
// IMDb usa o CSV/IDs exportados pelo usuário; Trakt usa API oficial com client id.
// Central de integração: apenas PC local. Nunca retornar o valor das chaves.
app.get('/api/hub/settings',requireLocalEdit,(_req,res)=>{
 try{
  const config=getProfileConfig('main')||getDefaultConfig();
  res.setHeader('Cache-Control','no-store');
  res.json({integrations:integrationStatuses(),accounts:sourceAccountStatus(),artwork:erdbStatus(),playback:{
   filters:config.filters,badgeFormat:config.badgeFormat,deduplicate:config.deduplicate
  },inventory:{addons:config.addons?.length||0,collections:loadStudioImport()?.collections?.length||0,
   catalogs:loadStudioImport()?.manifest?.catalogs?.length||0},
   sections:['integrations','playback','addons','catalogs','collections','artwork','publication','monitoring']});
 }catch(e){res.status(503).json({error:'Configurações indisponíveis.'});}
});
app.post('/api/hub/settings/integrations',requireLocalEdit,(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  res.json({success:true,integrations:updateIntegrationSettings(req.body)});
 }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/hub/settings/artwork',requireLocalEdit,(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  res.json({success:true,artwork:saveErdbSettings(req.body)});
 }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/hub/settings/playback',requireLocalEdit,(req,res)=>{
 try{
  const raw=req.body;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).some(k=>!['filters','badgeFormat','deduplicate'].includes(k)))
   throw Error('Configuração de reprodução inválida.');
  const config=getProfileConfig('main')||getDefaultConfig();
  const next=structuredClone(config);
  if(raw.filters){
   const f=raw.filters;
   if(typeof f!=='object'||Array.isArray(f)||
    Object.keys(f).some(k=>!['resolutions','removeCams','maxStreamsPerAddon',
     'maxTotalStreams','subtitleLanguages'].includes(k)))throw Error('Filtros desconhecidos.');
   if(f.resolutions!==undefined){
    if(!Array.isArray(f.resolutions)||f.resolutions.length<1||f.resolutions.length>6||
      f.resolutions.some(x=>!['4k','1080p','720p','480p'].includes(x)))
     throw Error('Resoluções inválidas.');
    next.filters.resolutions=[...new Set(f.resolutions)];
   }
   if(f.subtitleLanguages!==undefined){
    if(!Array.isArray(f.subtitleLanguages)||f.subtitleLanguages.length>10||
     f.subtitleLanguages.some(x=>typeof x!=='string'||!/^[a-z]{3}$/.test(x)))
     throw Error('Use códigos de idioma com três letras.');
    next.filters.subtitleLanguages=[...new Set(f.subtitleLanguages)];
   }
   if(f.removeCams!==undefined){
    if(typeof f.removeCams!=='boolean')throw Error('Filtro CAM inválido.');
    next.filters.removeCams=f.removeCams;
   }
   for(const field of ['maxStreamsPerAddon','maxTotalStreams']){
    if(f[field]!==undefined){
     if(!Number.isInteger(f[field])||f[field]<1||f[field]>200)
      throw Error('Limite de streams deve estar entre 1 e 200.');
     next.filters[field]=f[field];
    }
   }
  }
  if(raw.badgeFormat!==undefined){
   if(!['addon','clean','none'].includes(raw.badgeFormat))throw Error('Formato de identificação inválido.');
   next.badgeFormat=raw.badgeFormat;
  }
  if(raw.deduplicate!==undefined){
   if(typeof raw.deduplicate!=='boolean')throw Error('Deduplicação inválida.');
   next.deduplicate=raw.deduplicate;
  }
  const done=saveProfile('main',{name:'Principal',config:next});
  if(!done.success)throw Error('Falha ao salvar perfil.');
  res.json({success:true,playback:{filters:done.config.filters,
   badgeFormat:done.config.badgeFormat,deduplicate:done.config.deduplicate}});
 }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/hub/lists/capabilities',requireLocalEdit,(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({...getBuilderCapabilities(),imdbCsv:true,imdbIds:true,
    traktApiConfigured:integrationStatuses().trakt.configured});
});
// Consulta somente leitura de listas da conta, protegida pelo acesso local.
// Perfis das fontes: só retornam IDs e estado, nunca API keys/tokens.
app.post('/api/hub/settings/accounts',requireLocalEdit,(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  res.json({success:true,accounts:updateSourceAccounts(req.body)});
 }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/hub/settings/tmdb/authorize',requireLocalEdit,async(_req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  res.json(await beginTMDBAuthorization());
 }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/hub/settings/tmdb/complete',requireLocalEdit,async(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  res.json(await finishTMDBAuthorization(req.body?.requestToken));
 }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/hub/lists/trakt/mine',requireLocalEdit,async(req,res)=>{
 try{
  const username=String(req.query?.username||getSourceAccount('traktUsername'));
  res.setHeader('Cache-Control','no-store');
  res.json(await listTraktUserLists(username));
 }catch(e){res.status(400).json({error:'Não foi possível consultar listas públicas Trakt: '+e.message});}
});
app.get('/api/hub/lists/tmdb/mine',requireLocalEdit,async(_req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  res.json(await listTMDBAccountLists(getSourceAccount('tmdbAccountId'),
   {sessionId:getSourceAccount('tmdbSessionId')}));
 }catch(e){res.status(400).json({error:'Não foi possível consultar listas da conta TMDB: '+e.message});}
});
app.get('/api/hub/lists/mdblist/mine',requireLocalEdit,async(_req,res)=>{
 try{
  res.setHeader('Cache-Control','private, no-store');
  res.json(await fetchMDBOwnLists());
 }catch(error){res.status(400).json({error:error.message});}
});
app.post('/api/hub/lists/preview',requireLocalEdit,async(req,res)=>{
  try{
    const preview=await previewBuilderSource(req.body);
    res.setHeader('Cache-Control','no-store');
    res.json(preview);
  }catch(error){res.status(error.status||400).json({error:error.message,
   ...(error.suggestedType?{suggestedType:error.suggestedType}:{} )});}
});
app.post('/api/hub/catalogs/reorder',requireLocalEdit,(req,res)=>{
  try{
    const current=loadStudioImport();
    if(!current)return res.status(409).json({error:'Biblioteca ainda não foi importada.'});
    if(req.body?.expectedRevision!==current.revision)
      return res.status(409).json({error:'A biblioteca mudou. Atualize antes de reorganizar.'});
    const cats=current.manifest?.catalogs||[];
    const existing=cats.map(catalogIdentity),order=req.body?.order;
    if(!Array.isArray(order)||order.length!==existing.length||
       order.some(k=>typeof k!=='string')||new Set(order).size!==order.length||
       existing.some(k=>!order.includes(k))||new Set(existing).size!==existing.length)
      return res.status(400).json({error:'A ordem deve conter todos os catálogos, sem repetição.'});
    const dict=new Map(cats.map(c=>[catalogIdentity(c),c]));
    const next=order.map(key=>dict.get(key));
    const result=applyWorkspaceChange({
      catalogs:{...current.manifest,catalogs:next},
      collections:current.collections,allowEmpty:true
    },current.revision);
    invalidateBridgeCache();invalidatePublication();
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,revision:result.revision});
  }catch(e){res.status(e.status||400).json({error:e.message});}
});
app.put('/api/hub/workspace',requireLocalEdit,(req,res)=>{
  try{
    const current=loadStudioImport();
    if(!Number.isInteger(req.body?.revision)||req.body.revision!==(current?.revision||0))
      return res.status(409).json({error:'Outra edição foi salva. Recarregue os dados antes de sobrescrever.'});
    const catalogs=req.body.catalogs,collections=req.body.collections;
    if(!Array.isArray(catalogs)||!Array.isArray(collections))
      throw Error('Coleções e catálogos devem ser listas.');
    // Fonte única para edição e exportação; sem overlays legados.
    const status=applyWorkspaceChange({
      catalogs:{id:'nuvio.studio',name:'Minha biblioteca',catalogs},
      collections,allowEmpty:true
    },req.body.revision);
    invalidateBridgeCache();invalidatePublication();
    res.json({success:true,revision:status.revision,status});
  }catch(e){res.status(e.status||400).json({error:e.message});}
});
app.post('/api/hub/addons',requireLocalEdit,async(req,res)=>{
  try{
    const config=getProfileConfig('main')||getDefaultConfig();
    const {action,url,name,enabled,resources,catalogs,order,expectedOrder,
      requestTimeoutMs,includeCatalogs}=req.body||{};
    if(!['add','remove','toggle','reorder','configure'].includes(action))throw Error('Ação desconhecida.');
    if(action==='reorder'){
      // A prioridade é a ordem persistida do array de addons de main.
      // Uma requisição nunca pode remover, duplicar ou adicionar URLs.
      const original=config.addons.map(a=>a.url);
      const proposed=Array.isArray(order)?order:[];
      if(!Array.isArray(expectedOrder) ||
        JSON.stringify(expectedOrder)!==JSON.stringify(original)){
        return res.status(409).json({error:'A ordem foi modificada por outra sessão. Atualize antes de reorganizar.'});
      }
      if(proposed.length!==original.length ||
        proposed.some(x=>typeof x!=='string') ||
        new Set(proposed).size!==original.length ||
        proposed.some(x=>!original.includes(x)))
        return res.status(400).json({error:'Ordem inválida: todos os addons devem aparecer uma única vez.'});
      const byUrl=new Map(config.addons.map(a=>[a.url,a]));
      config.addons=proposed.map(url=>byUrl.get(url));
    }else{
      const canonical=typeof url==='string'?url.trim().replace(/\/$/,''):'';
      if(!canonical || !/^https:\/\//.test(canonical))throw Error('Informe URL HTTPS do manifesto.');
      if(action==='add'){
      if(config.addons.some(a=>a.url===canonical))throw Error('Este addon já está configurado.');
      if(config.addons.length>=60)throw Error('Limite de 60 addons.');
      if(Array.isArray(catalogs)&&catalogs.length>10000)
        throw Error('Quantidade de catálogos excede o limite de segurança de 10.000.');
      const recognized=['stream','subtitles','meta','catalog'];
      const declared=Array.isArray(resources)?resources.filter(r=>recognized.includes(r)):[];
      config.addons.push({url:canonical,name:String(name||'Novo addon').slice(0,90),
        enabled:true,resources:[...new Set(declared)],
        catalogs:Array.isArray(catalogs)?catalogs:[],includeCatalogs:false});
    }else{
      const addon=config.addons.find(a=>a.url===canonical);
      if(!addon)throw Error('Addon não está no Agregador.');
      if(action==='toggle')addon.enabled=enabled===true;
      else if(action==='configure'){
        const accepted=['stream','subtitles','meta','catalog'];
        if(!Array.isArray(resources)||resources.length>4||
           resources.some(r=>!accepted.includes(r))||
           new Set(resources).size!==resources.length)
          throw Error('Seleção de recursos inválida.');
        if(!Number.isInteger(requestTimeoutMs)||requestTimeoutMs<3000||requestTimeoutMs>30000)
          throw Error('Tempo limite precisa estar entre 3 e 30 segundos.');
        if(typeof includeCatalogs!=='boolean')throw Error('Configuração de catálogos inválida.');
        if(includeCatalogs&&resources.includes('catalog')){
          // Publicação direta exige manifesto real e IDs conhecidos.
          const source=await previewExternalAddon(canonical);
          if(!source.catalogs.length)
            throw Error('A origem não declarou catálogos para publicar. Desmarque a publicação direta e utilize a biblioteca de catálogos.');
          addon.catalogs=source.catalogs.map(c=>({
            id:c.id,type:c.type,name:c.name,extra:c.extra
          }));
        }
        addon.resources=resources;
        addon.requestTimeoutMs=requestTimeoutMs;
        addon.includeCatalogs=includeCatalogs && resources.includes('catalog');
        addon.resourceSelectionConfigured=true;
        // Não confundir manifesto saudável com resposta real; monitor separado.
      } else config.addons=config.addons.filter(a=>a.url!==canonical);
      }
    }
    const done=saveProfile('main',{name:'Principal',config});
    installedCatalogsCache=null;installedCatalogsAt=0;
    invalidateBridgeCache();invalidatePublication();
    res.json({success:done.success,addons:done.config.addons});
  }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/hub/providers',requireLocalEdit,async(req,res)=>{
  // Usa mesmo cache e mesmo perfil principal da descoberta no editor.
  res.redirect(307,'/api/hub/provider-inventory');
});
// Nuvio Collection Studio: criação independente e importação de qualquer origem.
app.get('/api/nuvio-studio/workspace',(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json(getStudioImportStatus());
});
app.post('/api/nuvio-studio/workspace/preview',requireBridgeAdmin,(req,res)=>{
  try{
    const proposal=previewWorkspaceChange(req.body||{});
    res.json({valid:true,stats:proposal.stats,mode:proposal.mode,
      expectedRevision:proposal.expectedRevision});
  }catch(e){res.status(e.status||400).json({error:e.message});}
});
app.post('/api/nuvio-studio/workspace/apply',requireBridgeAdmin,(req,res)=>{
  try{
    const proposal=previewWorkspaceChange(req.body||{});
    if(proposal.expectedRevision!==req.body?.expectedRevision)
      return res.status(409).json({error:'Biblioteca mudou desde a pré-visualização.'});
    const status=applyWorkspaceChange(proposal.payload,proposal.expectedRevision);
    if(proposal.mode==='new') {
      // Novo projeto realmente vazio: arquiva as preferências anteriores
      // no histórico antes de começar, sem apagar backups do workspace.
      const previous=getStudioDocument();
      saveStudioDocument({},previous.revision);
    }
    invalidateBridgeCache(); invalidatePublication();
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,status,details:proposal.stats});
  }catch(e){res.status(e.status||400).json({error:e.message});}
});
app.get('/api/nuvio-studio/publication',async(_req,res)=>{
  try {
    res.setHeader('Cache-Control','no-store');
    const config=getProfileConfig('main')||getDefaultConfig();
    const data=await publication();
    res.json({
      title:'Publicação manual Nuvio Collection Studio', mode:'manual',
      addonManifestUrl:'https://stream.patrykrocha.com/manifest.json',
      collectionsUrl:'https://stream.patrykrocha.com/collections.json',
      accountCollectionsUrl:'https://nuvio.tv/account?tab=collections',
      accountAddonsUrl:'https://nuvio.tv/account?tab=addons',
      addonCount:(config.addons||[]).filter(a=>a.enabled!==false).length,
      ...data.status, studio:'/studio',
      note:'O manifesto e as coleções exigem duas ações de importação na conta Nuvio. Nenhum perfil é modificado automaticamente.'
    });
  } catch(e) { handleBridgeError(res,e); }
});
app.get('/api/nuvio-studio/providers',requireBridgeAdmin,(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({providers:listPublicationProviders()});
});
app.post('/api/nuvio-studio/providers',requireBridgeAdmin,async(req,res)=>{
  try {
    const result = req.body?.removeAddonId
      ? (removePublicationProvider(req.body.removeAddonId), { removed:true })
      : await registerPublicationProvider(req.body?.url);
    res.json({ success:true, result, providers:listPublicationProviders() });
  } catch(e) { res.status(400).json({error:e.message}); }
});
app.get('/nuvio-studio',(_req,res)=>res.redirect(302,'/?view=collections'));
// O Editor trabalha exclusivamente com os arquivos importados. Não há
// atualização automática ou solicitação aos endereços do origem anterior.
app.get('/api/hub/import-status', (_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json(getStudioImportStatus());
});
app.post('/api/hub/import-preview', requireBridgeAdmin, (req,res)=>{
  try {
    const v=validateStudioImport(req.body);
    res.json({valid:true,stats:v.stats,catalogs:v.manifest.catalogs.length,
      addonId:v.manifest.id,addonName:v.manifest.name});
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/hub/import-apply', requireBridgeAdmin, (req,res)=>{
  try{
    const status=saveStudioImport(req.body,req.body?.expectedRevision);
    invalidateBridgeCache(); invalidatePublication();
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,status});
  }catch(e){res.status(e.status||400).json({error:e.message});}
});
app.get('/api/hub/collection-base', async (_req,res)=>{
  try{
    const snapshot=await bridgeSnapshot();
    res.setHeader('Cache-Control','no-store');
    // O editor aplica localmente o overlay, inclusive enquanto houver edições
    // ainda não salvas. Evita duplicar coleções/pastas do próprio Studio.
    res.json(snapshot.baseCollections || snapshot.collections);
  }catch(e){handleBridgeError(res,e);}
});
app.get('/studio', (_req,res) => res.redirect(302,'/?view=collections'));
// Importação e publicação são manuais. Não existe timer de sincronização.

// Validador de Addons (usado pela UI)
app.post('/api/validate-addon', requireLocalEdit, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ valid: false, error: 'URL inválida ou vazia.' });
  }

  const parsed = parseAddonUrl(url);
  if (!parsed) {
    return res.status(400).json({ valid: false, error: 'Formato de URL inválido.' });
  }

  const manifestUrl = parsed.manifestUrl;
  console.log('[Validate Addon] Consulta de manifesto');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos para scrapers lentos

  try {
    const response = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[Validate Addon] HTTP não OK');
      return res.status(200).json({
        valid: false,
        error: `O servidor retornou HTTP ${response.status}`
      });
    }

    const manifest = await response.json();
    if (!manifest || !manifest.id || !manifest.name) {
      console.warn('[Validate Addon] Manifesto inválido');
      return res.status(200).json({
        valid: false,
        error: 'JSON retornado não é um manifest Stremio válido (faltando id ou name).'
      });
    }

    const resources = Array.isArray(manifest.resources)
      ? manifest.resources.map(r => typeof r === 'string' ? r : r.name)
      : [];

    const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];

    console.log(`[Validate Addon] Sucesso: "${manifest.name}" (recursos: ${resources.join(', ')})`);

    return res.json({
      valid: true,
      name: manifest.name,
      description: manifest.description || '',
      resources,
      hasStreamResource: resources.includes('stream'),
      hasSubtitlesResource: resources.includes('subtitles'),
      hasCatalogResource: catalogs.length > 0 || resources.includes('catalog'),
      catalogs,
      types: manifest.types || []
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[Validate Addon] Falha de conexão');
    return res.status(200).json({
      valid: false,
      error: err.name === 'AbortError'
        ? 'Tempo limite esgotado (15s). O servidor do addon demorou muito para responder.'
        : 'Erro de conexão com o addon.'
    });
  }
});

// API Helper para codificar/decodificar
app.post('/api/encode-config', requireLocalEdit, (req, res) => {
  const token = encodeConfig(req.body);
  res.json({ token });
});

app.get('/api/decode-config/:token', requireLocalEdit, (req, res) => {
  const config = decodeConfig(req.params.token);
  res.json({ config });
});

// ==========================================================================
// API REST DE PERFIS (Sincronização Direta)
// ==========================================================================

// Lista todos os perfis
app.get('/api/profiles', (req, res) => {
  res.json({ profiles: listProfiles() });
});

// Obtém um perfil específico
app.get('/api/profiles/:id', requireLocalEdit, (req, res) => {
  const profile = getProfile(req.params.id);
  if (!profile) {
    return res.status(404).json({ error: 'Perfil não encontrado.' });
  }
  res.json({ profile });
});

// Salva ou atualiza um perfil
app.post('/api/profiles/:id', requireLocalEdit, (req, res) => {
  const { name, config } = req.body;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Objeto de configuração inválido.' });
  }
  const result = saveProfile(req.params.id, { name, config });
  res.json(result);
});

// Exclui um perfil
app.delete('/api/profiles/:id', requireLocalEdit, (req, res) => {
  const result = deleteProfile(req.params.id);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Helper para resolver configuração: se vier 'main' ou perfil salvo, usa do banco; senão, decodifica token
function resolveConfig(param) {
  if (!param) return getProfileConfig('main');
  // Se existir perfil salvo com esse nome
  const profileConfig = getProfileConfig(param);
  if (profileConfig) {
    return profileConfig;
  }
  // Fallback: decodifica como token
  return decodeConfig(param);
}

// ==========================================================================
// ROTAS DE PERFIS (URLs Curtas & Sincronizadas: /p/:profileId/...)
// ==========================================================================

app.get('/p/:profileId/manifest.json', async (req, res) => {
  const config = getProfileConfig(req.params.profileId) || getDefaultConfig();
  res.json(req.params.profileId === 'main' ? await mainManifestWithBridge(config) : generateManifest(config));
});

app.get('/p/:profileId/stream/:type/:id.json', async (req, res) => {
  const { profileId, type, id } = req.params;
  const config = getProfileConfig(profileId) || getDefaultConfig();
  try {
    const result = await aggregateStreams(config, type, id);
    res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=120');
    res.json(result);
  } catch (err) {
    console.error(`[Profile ${profileId}] Erro ao agregar streams:`, err);
    res.status(500).json({ streams: [], error: err.message });
  }
});

app.get(['/p/:profileId/subtitles/:type/:id.json', '/p/:profileId/subtitles/:type/:id/:extra.json'], async (req, res) => {
  const { profileId, type, id, extra } = req.params;
  const config = getProfileConfig(profileId) || getDefaultConfig();
  try {
    const result = await aggregateSubtitles(config, type, id, extra || '');
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error(`[Profile ${profileId}] Erro ao agregar legendas:`, err);
    res.status(500).json({ subtitles: [], error: err.message });
  }
});

app.get(['/p/:profileId/catalog/:type/:id.json', '/p/:profileId/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { profileId, type, id, extra } = req.params;
  const config = getProfileConfig(profileId) || getDefaultConfig();
  const extraParam = resolveExtraParam(extra, req.query);
  try {
    const result = await (profileId === 'main'
      ? mainCatalogWithBridge(config, type, id, extraParam)
      : fetchCatalog(config, type, id, extraParam));
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(profileId==='main'?decorateCatalogResponse(result,type):result);
  } catch (err) {
    console.error(`[Profile ${profileId}] Erro ao consultar catálogo:`, err);
    res.status(500).json({ metas: [], error: err.message });
  }
});

app.get('/p/:profileId/meta/:type/:id.json', async (req, res) => {
  const { profileId, type, id } = req.params;
  const config = getProfileConfig(profileId) || getDefaultConfig();
  try {
    const manual=profileId==='main'?localMetadata(type,id):null;
    const result = manual || await fetchMeta(config, type, id);
    const fallback = !result?.meta && profileId === 'main' ? await publishedMeta(type, id, await publication()) : result;
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=7200');
    res.json(profileId==='main'?decorateMetaResponse(fallback,type):fallback);
  } catch (err) {
    console.error(`[Profile ${profileId}] Erro ao consultar metadados:`, err);
    res.status(500).json({ meta: null, error: err.message });
  }
});

app.get('/p/:profileId/collections.json', async (req, res) => {
  if (req.params.profileId === 'main') {
    try {
      const output=prepareCoverCollections((await publication()).collections);
      res.setHeader('Cache-Control','public, max-age=60');
      return res.json(output.collections);
    }catch(e){return handleBridgeError(res,e);}
  }
  const config=getProfileConfig(req.params.profileId)||getDefaultConfig();
  res.json(config.nuvioCollections||[]);
});

// ==========================================================================
// ROTAS GLOBAIS RAIZ (Apontam para o Perfil 'main' por padrão)
// ==========================================================================

// Stremio: Manifest raiz (perfil main)
app.get('/manifest.json', async (req, res) => {
  try {
    const data=await publication();
    res.setHeader('Cache-Control','public, max-age=60');
    res.json(data.manifest);
  } catch(e) { handleBridgeError(res,e); }
});

// Stremio: Stream raiz (perfil main)
app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const config = effectiveConfig(getProfileConfig('main') || getDefaultConfig());
  try {
    const result = await aggregateStreams(config, type, id);
    res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=120');
    res.json(result);
  } catch (err) {
    console.error('[Root Stream] Erro ao agregar streams:', err);
    res.status(500).json({ streams: [], error: err.message });
  }
});

// Stremio: Subtitles raiz (perfil main)
app.get(['/subtitles/:type/:id.json', '/subtitles/:type/:id/:extra.json'], async (req, res) => {
  const { type, id, extra } = req.params;
  const config = effectiveConfig(getProfileConfig('main') || getDefaultConfig());
  try {
    const result = await aggregateSubtitles(config, type, id, extra || '');
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error('[Root Subtitles] Erro ao agregar legendas:', err);
    res.status(500).json({ subtitles: [], error: err.message });
  }
});

// Stremio: Catalog raiz (perfil main)
app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { type, id, extra } = req.params;
  const config = effectiveConfig(getProfileConfig('main') || getDefaultConfig());
  const extraParam = resolveExtraParam(extra, req.query);
  try {
    const result = await mainCatalogWithBridge(config, type, id, extraParam);
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(decorateCatalogResponse(result,type));
  } catch (err) {
    console.error('[Root Catalog] Erro ao consultar catálogo:', err);
    res.status(500).json({ metas: [], error: err.message });
  }
});

// Stremio: Meta raiz (perfil main)
app.get('/meta/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const config = effectiveConfig(getProfileConfig('main') || getDefaultConfig());
  try {
    const result = localMetadata(type,id) || await fetchMeta(config, type, id);
    const fallback = result?.meta ? result : await publishedMeta(type, id, await publication());
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=7200');
    res.json(decorateMetaResponse(fallback,type));
  } catch (err) {
    console.error('[Root Meta] Erro ao consultar metadados:', err);
    res.status(500).json({ meta: null, error: err.message });
  }
});

// Nuvio: Collections raiz (perfil main)
app.get('/collections.json', async (req, res) => {
  try{
    const output=prepareCoverCollections((await publication()).collections);
    res.setHeader('Cache-Control','public, max-age=60');
    res.json(output.collections);
  }catch(e){handleBridgeError(res,e);}
});

// ==========================================================================
// ROTAS PARAMÉTRICAS COM TOKEN OU ALIAS DE PERFIL (Retrocompatibilidade 100%)
// ==========================================================================

// Stremio: Manifest configurado via token ou perfil
app.get('/:config/manifest.json', (req, res) => {
  const config = resolveConfig(req.params.config);
  res.json(generateManifest(req.params.config==='main'?effectiveConfig(config):config));
});

// Stremio: Stream endpoint
app.get('/:config/stream/:type/:id.json', async (req, res) => {
  const { config: rawConfig, type, id } = req.params;
  const config = rawConfig==='main'?effectiveConfig(resolveConfig(rawConfig)):resolveConfig(rawConfig);

  try {
    const result = await aggregateStreams(config, type, id);
    res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=120');
    res.json(result);
  } catch (err) {
    console.error('Erro ao agregar streams:', err);
    res.status(500).json({ streams: [], error: err.message });
  }
});

// Stremio: Subtitles endpoint
app.get(['/:config/subtitles/:type/:id.json', '/:config/subtitles/:type/:id/:extra.json'], async (req, res) => {
  const { config: rawConfig, type, id, extra } = req.params;
  const config = rawConfig==='main'?effectiveConfig(resolveConfig(rawConfig)):resolveConfig(rawConfig);

  try {
    const result = await aggregateSubtitles(config, type, id, extra || '');
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error('Erro ao agregar legendas:', err);
    res.status(500).json({ subtitles: [], error: err.message });
  }
});

// Stremio: Catalog endpoint
app.get(['/:config/catalog/:type/:id.json', '/:config/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { config: rawConfig, type, id, extra } = req.params;
  const config = rawConfig==='main'?effectiveConfig(resolveConfig(rawConfig)):resolveConfig(rawConfig);
  const extraParam = resolveExtraParam(extra, req.query);

  try {
    const result = await fetchCatalog(config, type, id, extraParam);
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(rawConfig==='main'?decorateCatalogResponse(result,type):result);
  } catch (err) {
    console.error('Erro ao consultar catálogo:', err);
    res.status(500).json({ metas: [], error: err.message });
  }
});

// Stremio: Meta endpoint
app.get('/:config/meta/:type/:id.json', async (req, res) => {
  const { config: rawConfig, type, id } = req.params;
  const config = rawConfig==='main'?effectiveConfig(resolveConfig(rawConfig)):resolveConfig(rawConfig);

  try {
    const result = await fetchMeta(config, type, id);
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=7200');
    res.json(rawConfig==='main'?decorateMetaResponse(result,type):result);
  } catch (err) {
    console.error('Erro ao consultar metadados:', err);
    res.status(500).json({ meta: null, error: err.message });
  }
});

// Nuvio Collections Endpoint com token ou perfil
app.get('/:config/collections.json', (req, res) => {
  const { config: rawConfig } = req.params;
  const config = rawConfig==='main'?effectiveConfig(resolveConfig(rawConfig)):resolveConfig(rawConfig);
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  res.json(config.nuvioCollections || []);
});

// Página de configuração
app.get('/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback para SPA
app.get('*', (req, res, next) => {
  if (req.path.endsWith('.json')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Stream Aggregator rodando em http://localhost:${PORT}`);
});

