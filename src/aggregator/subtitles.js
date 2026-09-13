import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';

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
  const parsed = parseAddonUrl(addon.url);
  if (!parsed) return [];

  const subUrl = parsed.getSubtitleUrl(type, id, extra);
  const timeoutMs = addon.timeoutMs || 10000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch(subUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      console.warn(`[Subtitles: ${addon.name}] HTTP ${res.status} após ${elapsed}ms`);
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.subtitles)) {
      return [];
    }

    console.log(`[Subtitles: ${addon.name}] ✅ ${data.subtitles.length} legendas recebidas em ${elapsed}ms`);
    return data.subtitles.map(sub => ({
      ...sub,
      lang: normalizeLang(sub.lang),
      id: sub.id || `${addon.name}-${Math.random().toString(36).slice(2, 8)}`
    }));
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[Subtitles: ${addon.name}] Falha ou timeout: ${err.message}`);
    return [];
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
  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      allSubtitles.push(...item.value);
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

  const result = { subtitles: deduplicated };
  subtitleCache.set(cacheKey, result);
  return result;
}

