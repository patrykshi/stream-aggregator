import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile, validatePublicHttpsUrl } from '../config/json-store.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS, buildAddonFetchHeaders } from './url-helper.js';
import { mergeAndDeduplicateMetas } from './catalogs.js';
import { applyStudioOverlay, getStudioDocument } from './collection-overlay.js';
import { loadStudioImport, getStudioImportStatus } from './studio-import.js';

export const BRIDGE_ADDON_ID = 'community.streamaggregator.unified';
const DATA = resolveDataDir();
const CONFIG_FILE = path.join(DATA, 'hub-catalog-settings.json');
const CACHE_FILE = path.join(DATA, 'hub-catalog-cache.json');
const SECRET_FILE = path.join(DATA, 'legacy-unused-admin-key');
const DEFAULTS = {
  collectionsInputUrl: 'https://example.org/collections.json',
  catalogInputUrl: 'https://example.org/manifest.json',
  extraCollectionName: 'Catálogos complementares',
  extraPlacement: 'separate',
  externalAddons: [],
  mergedCatalogs: []
};
const TTL = 10 * 60 * 1000;
const MAX_JSON_BYTES = 14 * 1024 * 1024;
let cache = null, cacheTime = 0, fetching = null, lastError = null, lastSuccess = null;
let adminToken;

function ensureDir() { fs.mkdirSync(DATA, { recursive: true }); }
const readJSON = (file, fallback) => readJsonFile(file, fallback);
const atomicJSON = (file, value) => writeAtomicJsonFile(file, value);
export function getBridgeSettings() {
  return { ...DEFAULTS, ...readJSON(CONFIG_FILE, {}) };
}
const checkURL = raw => validatePublicHttpsUrl(raw);
function safeText(value, max = 100) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}
export function validateBridgeSettings(next) {
  if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Configuração inválida');
  const cfg = {
    collectionsInputUrl: checkURL(next.collectionsInputUrl),
    catalogInputUrl: checkURL(next.catalogInputUrl),
    extraCollectionName: safeText(next.extraCollectionName, 90) || DEFAULTS.extraCollectionName,
    extraPlacement: next.extraPlacement === 'streaming' ? 'streaming' : 'separate',
    externalAddons: [],
    mergedCatalogs: []
  };
  const source = Array.isArray(next.externalAddons) ? next.externalAddons : [];
  if (source.length > 12) throw new Error('Limite de 12 addons de catálogos');
  const seen = new Set();
  for (const a of source) {
    const url = checkURL(a.url);
    if (seen.has(url)) throw new Error('URL de addon duplicada');
    seen.add(url);
    const selected = Array.isArray(a.selected) ? a.selected : [];
    if (selected.length > 10000 || selected.some(s => typeof s !== 'string' || s.length > 350)) {
      throw new Error('Selecione no máximo 10.000 catálogos por addon');
    }
    cfg.externalAddons.push({ url, enabled: a.enabled === true, selected: [...new Set(selected)] });
  }
  const merges = Array.isArray(next.mergedCatalogs) ? next.mergedCatalogs : [];
  if (merges.length > 24) throw new Error('Limite de 24 catálogos mesclados');
  for (const m of merges) {
    const id = safeText(m.id, 64);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('ID de mescla inválido');
    const type = m.type === 'series' ? 'series' : 'movie';
    const sources = Array.isArray(m.sources) ? m.sources : [];
    if (sources.length < 2 || sources.length > 12 || sources.some(k => typeof k !== 'string' || !/^bx[a-f0-9]{12}_[a-f0-9]{16}$/.test(k))) {
      throw new Error('A mescla exige 2 a 12 catálogos disponíveis');
    }
    cfg.mergedCatalogs.push({ id, type, name: safeText(m.name, 100) || 'Catálogo mesclado', sources: [...new Set(sources)] });
  }
  return cfg;
}
export function saveBridgeSettings(raw) {
  const cfg = validateBridgeSettings(raw);
  atomicJSON(CONFIG_FILE, cfg);
  cacheTime = 0;
  return cfg;
}
export function getBridgeToken() {
  if (adminToken) return adminToken;
  ensureDir();
  try { adminToken = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {
    adminToken = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, adminToken + '\n', { mode: 0o600, flag: 'wx' });
  }
  return adminToken;
}
export function authorizedBridge(req) {
  const token = req.get('X-Bridge-Token') || '';
  const expected = getBridgeToken();
  return token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
async function pullJSON(url) {
  const checkedUrl = checkURL(url);
  const response = await fetch(checkedUrl, {
    headers: buildAddonFetchHeaders(checkedUrl, { extraHeaders: { 'Cache-Control': 'no-cache' } }),
    signal: AbortSignal.timeout(18000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error('Fonte HTTP ' + response.status);
  if (Number(response.headers.get('content-length') || 0) > MAX_JSON_BYTES) throw new Error('JSON excessivamente grande');
  const parts = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new Error('JSON excede limite de 14 MB');
    }
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function previewExternalAddon(url) {
  const parsed = parseAddonUrl(checkURL(url));
  if (!parsed) throw new Error('URL não é um manifesto Stremio');
  const data = await pullJSON(parsed.manifestUrl);
  if (!data.id || (data.catalogs!=null && !Array.isArray(data.catalogs))) throw new Error('Manifesto inválido');
  return {
    url: checkURL(url), addonId: data.id, name: safeText(data.name, 90),
    resources:[...new Set((Array.isArray(data.resources)?data.resources:[])
      .map(r=>typeof r==='string'?r:r?.name).filter(Boolean))],
    catalogs: (data.catalogs||[]).filter(c => c?.id && c?.type && c?.name)
      .map(c => ({
        id: String(c.id), type: String(c.type), name: safeText(c.name, 100),
        extra: Array.isArray(c.extra) ? c.extra : [],
        key: catalogKey(url, c.type, c.id), selectionKey: c.type + '::' + c.id
      }))
  };
}
function digest(value, n) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, n); }
export function catalogKey(url, type, originalId) {
  return 'bx' + digest(url, 12) + '_' + digest(type + '|' + originalId, 16);
}
function classifyName(label, folder, type) {
  if (String(label).toLocaleLowerCase('pt-BR') === String(folder).toLocaleLowerCase('pt-BR')) {
    return label + (type === 'series' ? ' · Séries' : ' · Filmes');
  }
  return label;
}
export function correctCollections(collections, inputManifest, external = [], cfg = {}) {
  if (!Array.isArray(collections) || !Array.isArray(inputManifest?.catalogs)) {
    throw new Error('JSON de coleções ou catálogo principal inválido');
  }
  const names = new Map(inputManifest.catalogs.filter(c => c?.id && c?.type && c?.name)
    .map(c => [(c.addonId || inputManifest.id) + '::' + c.type + '::' + c.id, c.name]));
  const transformed = structuredClone(collections);
  let labelsAdded = 0, missed = 0;
  for (const group of transformed) {
    for (const folder of (group.folders || [])) {
      for (const source of (folder.catalogSources || folder.sources || [])) {
        if (source.provider && source.provider !== 'addon') continue;
        const key = (source.addonId || inputManifest.id) + '::' + source.type + '::' +
          (source.catalogId || source.catalog_id);
        const label = names.get(key);
        if (!label) { missed++; continue; }
        // Nunca sobrescrever personalizações explícitas do usuário.
        if (source.title && source.title !== source.catalogId && source.title !== label) continue;
        source.title = classifyName(label, folder.title, source.type);
        labelsAdded++;
      }
    }
  }
  if (!external.length) return { collections: transformed, labelsAdded, missed, extraCatalogs: 0 };
  const title = cfg.extraCollectionName || DEFAULTS.extraCollectionName;
  const base = 'https://stream.patrykrocha.com';
  const folders = [];
  for (const addon of external) {
    const sources = addon.catalogs.map(cat => ({
      provider: 'addon', addonId: BRIDGE_ADDON_ID, addonBaseUrl: base,
      type: cat.type, catalogId: cat.key, genre: null, title: cat.name
    }));
    if (sources.length) folders.push({
      id: 'bridge-' + digest(addon.url, 16), title: addon.name || 'Addon adicional',
      catalogSources: sources
    });
  }
  const mergeDefs = cfg.mergedCatalogs || [];
  const keys = new Map(external.flatMap(a => a.catalogs.map(c => [c.key, c])));
  for (const m of mergeDefs) {
    const matches = m.sources.map(k => keys.get(k)).filter(x => x && x.type === m.type);
    if (matches.length < 2) continue;
    folders.push({
      id: 'bridge-merged-' + m.id, title: m.name,
      catalogSources: [{
        provider: 'addon', addonId: BRIDGE_ADDON_ID, addonBaseUrl: base,
        type: m.type, catalogId: 'bm_' + m.id, title: m.name + ' · ' + (m.type === 'series' ? 'Séries' : 'Filmes'), genre: null
      }]
    });
  }
  if (folders.length) {
    if (cfg.extraPlacement === 'streaming') {
      const streaming = transformed.find(g => /streaming/i.test(g.title));
      if (streaming) streaming.folders.push(...folders);
      else transformed.push({ id: 'bridge-extras', title, folders });
    } else {
      transformed.push({ id: 'bridge-extras', title, folders });
    }
  }
  return { collections: transformed, labelsAdded, missed, extraCatalogs: external.reduce((s, a) => s + a.catalogs.length, 0) };
}
async function getFresh() {
  const imported=loadStudioImport();
  if(!imported)throw Error('Nenhum par de JSONs foi importado no Studio.');
  const cfg=getBridgeSettings();
  const localDoc=getStudioDocument();
  const fromBridge=(cfg.externalAddons||[]).filter(a=>a.enabled&&a.selected?.length);
  const fromStudio=(localDoc.catalogAddons||[]).filter(a=>a.selected?.length);
  // Catálogos vinculados diretamente no editor único. O catálogo contém a
  // identidade original e o URL do addon, sem precisar de outro painel de edição.
  const selectedFromWorkspace=(imported.manifest?.catalogs||[])
    .filter(c=>c.sourceUrl && c.sourceId && c.type && c.id)
    .map(c=>({url:c.sourceUrl,selected:[c.type+'::'+c.sourceId]}));
  const urls=[...new Set([...fromBridge,...fromStudio,...selectedFromWorkspace].map(x=>x.url))];
  // Buscas de addons externos são somente para resolver catálogos que o
  // usuário incluiu. NUNCA consultar o fonte importada/manifesto de origem novamente.
  const other=await Promise.all(urls.map(url=>
    previewExternalAddon(url).catch(e=>({url,error:e.message,catalogs:[]}))
  ));
  const external=other.filter(x=>!x.error).map(item=>{
    const selected=new Set([...fromBridge,...fromStudio,...selectedFromWorkspace].filter(a=>a.url===item.url).flatMap(a=>a.selected));
    return {...item,catalogs:item.catalogs.filter(c=>selected.has(c.selectionKey))};
  }).filter(a=>a.catalogs.length);
  const extraFolders=external.map(item=>{
    const selected=fromBridge.find(a=>a.url===item.url);
    return {...item,catalogs:selected?item.catalogs.filter(c=>selected.selected.includes(c.selectionKey)):[]};
  }).filter(a=>a.catalogs.length);
  const {collections,manifest}=imported;
  const corrected=correctCollections(collections,manifest,extraFolders,cfg);
  const finalCollections=applyStudioOverlay(corrected.collections);
  const sourceHash=crypto.createHash('sha256').update(JSON.stringify([collections,manifest])).digest('hex').slice(0,16);
  const catalogOptions=manifest.catalogs.filter(c=>c?.id&&c?.type&&c?.name).map(c=>({
    type:c.type,id:c.id,name:c.name,addonId:c.addonId||manifest.id
  }));
  return {...corrected,baseCollections:corrected.collections,collections:finalCollections,catalogOptions,settings:cfg,external,
    sourceHash,sourceChanged:false,importRevision:imported.revision,
    importedAt:imported.importedAt,fetchedAt:imported.importedAt,
    catalogCount:manifest.catalogs.length,manualCatalogs:manifest.catalogs.filter(c=>c.manual===true)};
}

export function invalidateBridgeCache() { cacheTime = 0; }

export async function bridgeSnapshot({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheTime < TTL) return { ...cache, stale: false };
  if (fetching) return fetching;
  fetching = (async () => {
    try {
      const updated = await getFresh();
      cache = updated; cacheTime = Date.now(); lastSuccess = updated.fetchedAt; lastError = null;
      try { atomicJSON(CACHE_FILE, updated); } catch (e) { console.warn('Cache do catálogo:', e.message); }
      return { ...updated, stale: false };
    } catch (e) {
      // O status é público: nunca incluir URL de addon, token ou fragmento do JSON.
      lastError = /^Fonte HTTP [0-9]{3}$/.test(e.message) ? e.message : 'Falha ao consultar ou interpretar uma fonte';
      if (!cache) cache = readJSON(CACHE_FILE, null);
      if (cache) return { ...cache, stale: true };
      throw e;
    } finally { fetching = null; }
  })();
  return fetching;
}
export async function bridgeStatus() {
  return {
    configured: true,
    lastSuccess: lastSuccess || cache?.fetchedAt || null,
    lastError,
    freshnessSeconds: cacheTime ? Math.round((Date.now() - cacheTime) / 1000) : null,
    catalogs: cache?.catalogCount ?? null,
    labelsAdded: cache?.labelsAdded ?? null,
    extras: cache?.extraCatalogs ?? null,
    sourceChanged: cache?.sourceChanged ?? null,
    sourceHash: cache?.sourceHash ?? null,
    sourceCheckedAt: cache?.importedAt ?? null,
    imported: getStudioImportStatus()
  };
}
export function bridgeCatalogs(snapshot) {
  const entries = snapshot.external.flatMap(addon => addon.catalogs.map(c => ({
    type: c.type, id: c.key, name: addon.name + ' · ' + c.name,
    extra: c.extra, showInHome: false
  })));
  const index = new Map(snapshot.external.flatMap(a => a.catalogs.map(c => [c.key, { addon:a, cat:c }])));
  for (const m of snapshot.settings.mergedCatalogs || []) {
    const src = m.sources.map(k => index.get(k)).filter(v => v?.cat.type === m.type);
    if (src.length < 2) continue;
    entries.push({ type: m.type, id: 'bm_' + m.id, name: m.name, extra: [{ name: 'skip', isRequired: false }], showInHome: false });
  }
  for(const cat of snapshot.manualCatalogs||[]){
    entries.push({
      type:cat.type,id:cat.id,name:cat.name,
      extra:[{name:'skip',isRequired:false}],showInHome:cat.showInHome===true
    });
  }
  // A UI bloqueia catálogos repetidos; defesa extra para manifestos importados.
  return [...new Map(entries.map(c=>[c.type+'::'+c.id,c])).values()];
}
export async function bridgeCatalogStream(snapshot, type, key, extra = '') {
  const local=(snapshot.manualCatalogs||[]).find(c=>c.type===type&&c.id===key);
  if(local){
    const rows=Array.isArray(local.metas)?local.metas:[];
    const params=new URLSearchParams(String(extra||''));
    const skipRaw=params.get('skip');
    if(skipRaw!==null){
      const offset=Math.max(0,Math.min(Number(skipRaw)||0,rows.length));
      return {metas:rows.slice(offset,offset+100)};
    }
    return {metas:rows}; // sem corte artificial de 500 títulos
  }
  if (key.startsWith('bm_')) {
    const m = snapshot.settings.mergedCatalogs.find(x => 'bm_' + x.id === key && x.type === type);
    if (!m) return null;
    const selected = m.sources.filter(k => {
      const item = snapshot.external.flatMap(a => a.catalogs).find(c => c.key === k);
      return item?.type === type;
    }).slice(0, 12);
    const fetched = await Promise.all(selected.map(k => bridgeCatalogStream(snapshot, type, k, extra).catch(() => ({ metas: [] }))));
    return { metas: mergeAndDeduplicateMetas(fetched.map(x => x?.metas || [])) };
  }
  for (const addon of snapshot.external) {
    const cat = addon.catalogs.find(c => c.key === key && c.type === type);
    if (!cat) continue;
    const parsed = parseAddonUrl(addon.url);
    if (!parsed) throw new Error('Addon inválido');
    const url = parsed.getCatalogUrl(type, cat.id, extra);
    const response = await pullJSON(url);
    return { metas: Array.isArray(response?.metas) ? response.metas : [] };
  }
  return null;
}
export function bridgeManifestExtras(manifest, snapshot) {
  const catalogs = bridgeCatalogs(snapshot);
  if (!catalogs.length) return manifest;
  return {
    ...manifest,
    version: '1.3.3',
    resources: [...manifest.resources, ...(manifest.resources.some(r => (typeof r === 'string' ? r : r.name) === 'catalog') ? [] : ['catalog'])],
    catalogs: [...manifest.catalogs, ...catalogs]
  };
}
