import path from 'node:path';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from '../config/json-store.js';
import { BRIDGE_ADDON_ID, catalogKey, previewExternalAddon } from './catalog-service.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';
import {collectCatalogPages} from './catalog-pages.js';
import { loadStudioImport } from './studio-import.js';

const DATA = resolveDataDir();
const PROVIDERS = path.join(DATA, 'nuvio-publication-providers.json');
const TTL = 10 * 60_000;
const CATALOG_CACHE_TTL = 10 * 60_000;
const BASE = 'https://stream.patrykrocha.com';
let cache = null;
let cacheUntil = 0;
const manifests = new Map();
const catalogItemCache = new Map();

function readProviders() {
  const data = readJsonFile(PROVIDERS, []);
  return Array.isArray(data) ? data : [];
}
function writeProviders(data) {
  writeAtomicJsonFile(PROVIDERS, data);
}
export function listPublicationProviders() {
  return readProviders().map(({ addonId, name, url }) => ({ addonId, name, url }));
}
export function invalidatePublication() {
  cache = null;
  cacheUntil = 0;
  catalogItemCache.clear();
}
export async function registerPublicationProvider(url) {
  const manifest = await previewExternalAddon(url);
  if (!manifest.catalogs.length) throw Error('Este addon não declarou catálogos. Use um manifesto com catalogs.');
  const current = readProviders();
  if (current.some(x => x.addonId === manifest.addonId && x.url !== manifest.url))
    throw Error('Já existe um provedor com o mesmo ID e outro endereço.');
  if (!current.some(x => x.url === manifest.url) && current.length >= 15)
    throw Error('Limite de 15 provedores vinculados.');
  const record = { addonId: manifest.addonId, name: manifest.name, url: manifest.url };
  const next = current.filter(x => x.addonId !== manifest.addonId && x.url !== manifest.url);
  next.push(record);
  writeProviders(next);
  invalidatePublication();
  return { addonId: record.addonId, name: record.name, catalogCount: manifest.catalogs.length };
}
export function removePublicationProvider(addonId) {
  const current = readProviders();
  const next = current.filter(x => x.addonId !== addonId);
  if (next.length === current.length) throw Error('Provedor não encontrado.');
  writeProviders(next);
  invalidatePublication();
}
async function inspect(url) {
  const item = manifests.get(url);
  if (item && Date.now() < item.until) return item.promise;
  const promise = previewExternalAddon(url).catch(() => null);
  manifests.set(url, { until: Date.now() + TTL, promise });
  return promise;
}
function indexSources(collections) {
  const counts = new Map();
  for (const group of collections)
    for (const folder of group.folders || [])
      for (const s of folder.catalogSources || folder.sources || []) {
        if (s.provider && s.provider !== 'addon') continue;
        const key = String(s.addonId || '') + '::' + s.type + '::' + (s.catalogId || s.catalog_id || '');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
  return counts;
}
export function formatCatalogLabel(rawName, folderTitle, type, isMultiSource = false, hasSameNameSibling = false) {
  const name = String(rawName || '').trim();
  if (!name) return type === 'series' ? 'Séries' : 'Filmes';
  const lowerName = name.toLowerCase();
  const lowerFolder = String(folderTitle || '').toLowerCase();
  const alreadyTyped = /\b(filmes?|s[eé]ries?|movies?|shows?)\b/i.test(name);
  if (alreadyTyped) return name;
  const suffix = type === 'series' ? ' · Séries' : ' · Filmes';
  if (hasSameNameSibling || lowerFolder.includes(lowerName) || lowerName.includes(lowerFolder) || isMultiSource) {
    return name + suffix;
  }
  return name;
}

/**
 * Publica somente as fontes de catálogos efetivamente referenciadas.
 * Não altera o workspace nem instala nada na conta Nuvio.
 */
export function buildPublication({ collections, baseManifest, providers }) {
  const references = indexSources(collections);
  const names = new Map();
  const ambiguous = new Set();
  for (const p of providers) for (const c of p.catalogs || []) {
    const key = p.addonId + '::' + c.type + '::' + c.id;
    if (names.has(key) && names.get(key).url !== p.url) ambiguous.add(key);
    names.set(key, { url: p.url, type: c.type, id: c.id, name: c.name, extra: c.extra,
      requestTimeoutMs:p.requestTimeoutMs||null });
  }
  const native = new Set((baseManifest.catalogs || []).map(c => c.type + '::' + c.id));
  const mappings = new Map();
  const routes = new Map();
  const catalogs = [];
  const metaProviders = providers.filter(p => p.resources?.includes('meta')).slice(0, 4);
  const missing = new Map();
  let mapped = 0, existing = 0, nonAddon = 0;
  const output = structuredClone(collections);
  for (const group of output) for (const folder of group.folders || []) {
    const sources = folder.catalogSources || folder.sources || [];
    const rawNameCounts = new Map();
    for (const s of sources) {
      const k = String(s.addonId || '') + '::' + s.type + '::' + String(s.catalogId || s.catalog_id || '');
      const p = names.get(k);
      if (p?.name) {
        rawNameCounts.set(p.name, (rawNameCounts.get(p.name) || 0) + 1);
      }
    }

    for (const source of sources) {
      if (source.provider && source.provider !== 'addon') { nonAddon++; continue; }
      const id = String(source.catalogId || source.catalog_id || '');
      const original = String(source.addonId || '');
      if (original === BRIDGE_ADDON_ID && native.has(source.type + '::' + id)) {
        existing++; continue;
      }
      const key = original + '::' + source.type + '::' + id;
      const provider = !ambiguous.has(key) ? names.get(key) : null;
      if (!provider) {
        missing.set(original || '(sem addonId)', (missing.get(original || '(sem addonId)') || 0) + 1);
        continue;
      }
      const proxyId = catalogKey(provider.url, source.type, id);
      const routeKey = source.type + '::' + proxyId;

      const hasSameNameSibling = (rawNameCounts.get(provider.name) || 0) > 1;
      const label = source.title && source.title !== source.catalogId && source.title !== id
        ? source.title
        : formatCatalogLabel(provider.name || id, folder.title, source.type, sources.length > 1, hasSameNameSibling);

      source.title = label;
      source.name = label;
      source.catalogName = provider.name || id;

      if (!routes.has(routeKey)) {
        routes.set(routeKey, { ...provider, id, proxyId });
        if (!native.has(routeKey)) catalogs.push({
          type: source.type, id: proxyId, name: label,
          extra: provider.extra || [], showInHome: false
        });
      }
      mappings.set(key, proxyId);
      source.provider = 'addon';
      source.addonId = BRIDGE_ADDON_ID;
      source.addonBaseUrl = BASE;
      source.catalogId = proxyId;
      if ('catalog_id' in source) delete source.catalog_id;
      mapped++;
    }
  }
  const already = (baseManifest.catalogs || []).length;
  const resources = [...(baseManifest.resources || [])];
  const exists = name => resources.some(r => (typeof r === 'string' ? r : r.name) === name);
  if (catalogs.length && !exists('catalog')) resources.push('catalog');
  if (metaProviders.length && !exists('meta')) resources.push({
    name:'meta',types:['movie','series','anime','other'],
    idPrefixes:['tt','kitsu','tmdb','tvdb','emby']
  });
  const manifest = { ...baseManifest, resources,
    catalogs: [...(baseManifest.catalogs || []), ...catalogs] };
  return {
    collections: output, manifest, routes, metaProviders,
    status: { total: [...references.values()].reduce((a,b) => a+b, 0),
      routed: mapped, native: existing, unresolved: [...missing.values()].reduce((a,b) => a+b, 0),
      nonAddon, catalogsExposed: catalogs.length + already, metadataProviders: metaProviders.length,
      unresolvedProviders: [...missing].map(([addonId,count]) => ({ addonId, count })),
      ready: missing.size === 0
    }
  };
}
export async function getPublication({ config, baseManifest, collections, force = false }) {
  if (!force && cache && Date.now() < cacheUntil) return cache;
  const needed = new Set(indexSources(collections).keys());
  const uniqueProviders = new Map();
  // Provedores vinculados manualmente têm prioridade; não sincronizam coleções.
  const registered = readProviders();
  for (const p of registered) uniqueProviders.set(p.url, p);
  let manifestsFound = (await Promise.all([...uniqueProviders.keys()].map(inspect))).filter(Boolean);
  const covered = new Set(manifestsFound.flatMap(m => m.catalogs.map(c => m.addonId + '::' + c.type + '::' + c.id)));
  // Só consulta outros addons instalados caso existam fontes ainda sem resolução.
  if ([...needed].some(k => !covered.has(k))) {
    const urls = [...new Set((config.addons || []).filter(a => a.enabled !== false && a.url)
      .map(a => a.url).filter(url => !uniqueProviders.has(url)))];
    manifestsFound = [...manifestsFound, ...(await Promise.all(urls.map(inspect))).filter(Boolean)];
  }
  // Para configs antigas, preservar roteamentos já usados. Após configurar
  // recursos explicitamente, respeitar só o que o usuário selecionou.
  const allowed=manifestsFound.map(provider=>{
    const addon=(config.addons||[]).find(a=>a.url===provider.url);
    if(!addon||!addon.resourceSelectionConfigured)return {...provider,
      requestTimeoutMs:addon?.requestTimeoutMs||null};
    const enabled=addon.enabled!==false;
    return {...provider,
      requestTimeoutMs:addon.requestTimeoutMs||null,
      catalogs:enabled && (addon.resources||[]).includes('catalog') ? provider.catalogs:[],
      resources:enabled?(provider.resources||[]).filter(r=>(addon.resources||[]).includes(r)):[]
    };
  });
  const result = buildPublication({ collections, baseManifest, providers: allowed });
  cache = result;
  cacheUntil = Date.now() + TTL;
  return result;
}
export async function publishedCatalog(type, id, extra, publication, { fetchImpl = globalThis.fetch } = {}) {
  const entry = publication.routes.get(type + '::' + id);
  if (!entry) return null;
  const parsed = parseAddonUrl(entry.url);
  if (!parsed) return { metas: [] };

  const cacheKey = `${entry.url}::${type}::${entry.id}::${extra || ''}`;
  const cached = catalogItemCache.get(cacheKey);
  if (cached && Date.now() < cached.until) {
    return cached.data;
  }

  const timeoutMs = entry.requestTimeoutMs || 14000;
  const hasExplicitSkip = /(^|&)skip=\d+/.test(extra || '');

  if (hasExplicitSkip) {
    try {
      const response = await fetchImpl(parsed.getCatalogUrl(type, entry.id, extra || ''), {
        headers: DEFAULT_FETCH_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error'
      });
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 8_000_000) {
        return { metas: [] };
      }
      const body = await response.json();
      const result = { metas: Array.isArray(body?.metas) ? body.metas : [] };
      catalogItemCache.set(cacheKey, { until: Date.now() + CATALOG_CACHE_TTL, data: result });
      return result;
    } catch {
      return { metas: [] };
    }
  }

  // Consulta da primeira página
  let p1Response;
  try {
    p1Response = await fetchImpl(parsed.getCatalogUrl(type, entry.id, extra || ''), {
      headers: DEFAULT_FETCH_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    });
  } catch {
    return { metas: [] };
  }
  if (!p1Response.ok || Number(p1Response.headers.get('content-length') || 0) > 8_000_000) {
    return { metas: [] };
  }
  let p1Body;
  try { p1Body = await p1Response.json(); } catch { return { metas: [] }; }
  const metas = Array.isArray(p1Body?.metas) ? [...p1Body.metas] : [];

  // Nuvio sem skip: coletar enquanto a origem devolver páginas novas,
  // sem encerrar em 100 títulos. A origem pode ainda expor skip explícito.
  const supportsSkip=(entry.extra||[]).some(x=>x?.name==='skip')||metas.length>=20;
  if(supportsSkip&&metas.length>=20){
    const extraBase=extra?extra+'&':'';
    const combined=await collectCatalogPages(metas,{
      fetchPage:async(skip)=>{
        const url=parsed.getCatalogUrl(type,entry.id,extraBase+'skip='+skip);
        const response=await fetchImpl(url,{
          headers:DEFAULT_FETCH_HEADERS,
          signal:AbortSignal.timeout(Math.min(timeoutMs,9000)),redirect:'error'
        });
        if(!response.ok||Number(response.headers.get('content-length')||0)>8_000_000)return [];
        const data=await response.json();
        return Array.isArray(data?.metas)?data.metas:[];
      }
    });
    metas.length=0;metas.push(...combined);
  }

  const result = { metas };
  catalogItemCache.set(cacheKey, { until: Date.now() + CATALOG_CACHE_TTL, data: result });
  return result;
}

export function localMetadata(type, id) {
  const manual = loadStudioImport()?.manifest?.catalogs || [];
  for (const catalog of manual) {
    if (!catalog.manual || catalog.type !== type) continue;
    const meta = (catalog.metas || []).find(item => item.id === id);
    if (meta) return { meta: { ...meta, type } };
  }
  return null;
}

export async function publishedMeta(type, id, publication) {
  // Catálogos criados diretamente no Hub já possuem metadados suficientes
  // para o Nuvio abrir a ficha básica, mesmo sem provedor metadata externo.
  const local = localMetadata(type, id);
  if (local) return local;
  for (const provider of publication.metaProviders || []) {
    const parsed = parseAddonUrl(provider.url);
    if (!parsed) continue;
    try {
      const response = await fetch(parsed.getMetaUrl(type, id), {
        headers: DEFAULT_FETCH_HEADERS, signal: AbortSignal.timeout(provider.requestTimeoutMs||9000), redirect:'error'
      });
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 5_000_000) continue;
      const data = await response.json();
      if (data?.meta?.id && data.meta.name) return data;
    } catch { /* Falha em metadata não deve interromper o agregador. */ }
  }
  return { meta:null };
}
