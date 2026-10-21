import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';
import { recordSearch, recordSearchDelivery } from './monitor.js';

// Cache LRU em memória para legendas (30s)
class SimpleSubtitleCache {
  constructor(maxSize = 200, ttlMs = 30000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
  }
}

const subtitleCache = new SimpleSubtitleCache();

/**
 * Normaliza o código de idioma para o padrão ISO comum.
 */
export function normalizeLang(lang) {
  if (!lang || typeof lang !== 'string') return 'unknown';
  const clean = lang.trim().toLowerCase();
  if (['pt-br', 'pob', 'portuguese (brazil)', 'brazilian portuguese', 'brazilian'].includes(clean)) return 'pob';
  if (['pt', 'por', 'portuguese', 'portugues'].includes(clean)) return 'por';
  if (['en', 'eng', 'english', 'ingles'].includes(clean)) return 'eng';
  if (['es', 'spa', 'spanish', 'espanol'].includes(clean)) return 'spa';
  return clean;
}

/**
 * Consulta legendas de um addon com timeout.
 */
async function fetchAddonSubtitles(addon, type, id, extra = '') {
  const started = Date.now();
  const parsed = parseAddonUrl(addon.url);
  const report = (status, count = 0, httpStatus = null) => recordSearch(addon, {
    status, count, httpStatus, durationMs: Date.now() - started,
    resource: 'subtitles'
  });
  if (!parsed) {
    report('invalid_url');
    return [];
  }

  const subUrl = parsed.getSubtitleUrl(type, id, extra);
  const timeoutMs = Number.isInteger(addon.requestTimeoutMs)
    ? Math.min(Math.max(addon.requestTimeoutMs,3000),30000) : 7500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(subUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });
    if (!res.ok) {
      report('http_error', 0, res.status);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data?.subtitles)) {
      report('invalid_response');
      return [];
    }
    report(data.subtitles.length ? 'results' : 'empty', data.subtitles.length);
    return data.subtitles.map(sub => ({
      ...sub,
      lang: normalizeLang(sub.lang),
      id: sub.id || `${addon.name}-${Math.random().toString(36).slice(2, 8)}`
    }));
  } catch (err) {
    report(controller.signal.aborted || err?.name === 'AbortError' ? 'timeout' : 'network_error');
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Agrega legendas de múltiplos addons e ordena por prioridade de idioma.
 */
export async function aggregateSubtitles(config, type, id, extra = '') {
  // Filtra addons habilitados que fornecem legendas
  const subtitleAddons = (config.addons || []).filter(a => {
    if (a.enabled === false) return false;
    const resources = a.resources || ['stream'];
    return resources.includes('subtitles');
  });

  if (subtitleAddons.length === 0) {
    return { subtitles: [] };
  }

  const cacheKey = `sub:${type}:${id}:${extra}:${JSON.stringify(config.addons)}`;
  const cached = subtitleCache.get(cacheKey);
  if (cached) return cached;

  const promises = subtitleAddons.map(addon => fetchAddonSubtitles(addon, type, id, extra));
  const settled = await Promise.allSettled(promises);

  let allSubtitles = [];
  const subtitleSources = new WeakMap();
  for (const [index, item] of settled.entries()) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      for (const sub of item.value) {
        subtitleSources.set(sub, subtitleAddons[index].url);
        allSubtitles.push(sub);
      }
    }
  }

  // Desduplicação por URL de legenda
  const seenUrls = new Set();
  const deduplicated = [];
  for (const sub of allSubtitles) {
    if (sub.url) {
      if (seenUrls.has(sub.url)) continue;
      seenUrls.add(sub.url);
    }
    deduplicated.push(sub);
  }

  // Ordenação por preferências de idioma (padrão: pob, por, eng)
  const preferredLangs = config.filters?.subtitleLanguages || ['pob', 'por', 'eng'];
  const langPriority = new Map();
  preferredLangs.forEach((lang, idx) => {
    langPriority.set(normalizeLang(lang), idx);
  });

  deduplicated.sort((a, b) => {
    const prioA = langPriority.has(a.lang) ? langPriority.get(a.lang) : 999;
    const prioB = langPriority.has(b.lang) ? langPriority.get(b.lang) : 999;
    return prioA - prioB;
  });

  for (const addon of subtitleAddons) {
    recordSearchDelivery(addon, deduplicated.filter(sub => subtitleSources.get(sub) === addon.url).length);
  }
  const result = { subtitles: deduplicated };
  subtitleCache.set(cacheKey, result);
  return result;
}

