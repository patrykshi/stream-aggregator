import { filterStreams, deduplicateStreams, enrichStreamBadge } from './filter.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';

// Cache LRU em memória simples com TTL
class SimpleCache {
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
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs
    });
  }
}

const streamCache = new SimpleCache(300, 25000); // 25s TTL

/**
 * Normaliza a URL base do addon removendo `/manifest.json` se presente.
 */
export function normalizeAddonBaseUrl(rawUrl) {
  const parsed = parseAddonUrl(rawUrl);
  return parsed ? parsed.baseUrl : rawUrl.trim().replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
}

/**
 * Consulta os streams de um addon específico com timeout.
 */
async function fetchAddonStreams(addon, type, id) {
  const parsed = parseAddonUrl(addon.url);
  if (!parsed) {
    console.warn(`[${addon.name}] URL de addon inválida: ${addon.url}`);
    return [];
  }

  const streamUrl = parsed.getStreamUrl(type, id);
  const timeoutMs = addon.timeoutMs || 8000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(streamUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[${addon.name}] HTTP ${res.status} ao consultar ${streamUrl}`);
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.streams)) {
      return [];
    }

    return data.streams;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn(`[${addon.name}] Timeout de ${timeoutMs}ms excedido.`);
    } else {
      console.warn(`[${addon.name}] Falha na requisição:`, err.message);
    }
    return [];
  }
}

/**
 * Executa a agregação de streams de múltiplos addons.
 */
export async function aggregateStreams(config, type, id) {
  const activeAddons = config.addons.filter(a => a.enabled !== false);
  if (activeAddons.length === 0) {
    return { streams: [] };
  }

  const cacheKey = `${type}:${id}:${JSON.stringify(config)}`;
  const cached = streamCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Dispara consultas paralelas a todos os addons
  const fetchPromises = activeAddons.map(async addon => {
    try {
      let streams = await fetchAddonStreams(addon, type, id);

      // Limita streams por addon
      if (config.filters?.maxStreamsPerAddon && streams.length > config.filters.maxStreamsPerAddon) {
        streams = streams.slice(0, config.filters.maxStreamsPerAddon);
      }

      // Enriquece streams com o nome do addon
      return streams.map(s => enrichStreamBadge(s, addon.name, config.badgeFormat));
    } catch (err) {
      console.error(`Erro ao processar streams do addon ${addon.name}:`, err);
      return [];
    }
  });

  const settled = await Promise.allSettled(fetchPromises);

  // Combina streams respeitando a ordem de prioridade definida pelo usuário
  let combinedStreams = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      combinedStreams.push(...item.value);
    }
  }

  // Aplica filtros (resolução, cams, regex)
  if (config.filters) {
    combinedStreams = filterStreams(combinedStreams, config.filters);
  }

  // Desduplica se configurado
  if (config.deduplicate) {
    combinedStreams = deduplicateStreams(combinedStreams);
  }

  // Limite total de streams
  if (config.filters?.maxTotalStreams && combinedStreams.length > config.filters.maxTotalStreams) {
    combinedStreams = combinedStreams.slice(0, config.filters.maxTotalStreams);
  }

  const result = { streams: combinedStreams };
  streamCache.set(cacheKey, result);
  return result;
}

