import { filterStreams, deduplicateStreams, enrichStreamBadge } from './filter.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';
import { resolveAddonId } from './id-resolver.js';
import { recordSearch, recordSearchDelivery, recordAggregate } from './monitor.js';

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
  const started = Date.now();
  const parsed = parseAddonUrl(addon.url);
  if (!parsed) {
    return { streams: [], status: 'invalid_url', durationMs: 0 };
  }

  // Orçamento total por provedor, configurável de 3 a 30 segundos.
  // Instalações antigas mantêm o limite efetivo de 7,5 segundos.
  let resolvedId = id;
  try {
    resolvedId = await resolveAddonId(addon, type, id);
  } catch {
    // O ID original continua válido para provedores que não precisam da tradução.
  }
  const converted = resolvedId !== id;
  const streamUrl = parsed.getStreamUrl(type, resolvedId);
  const totalBudget = Number.isInteger(addon.requestTimeoutMs)
    ? Math.min(Math.max(addon.requestTimeoutMs,3000),30000) : 7500;
  const remaining = Math.max(1, totalBudget - (Date.now() - started));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(streamUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });
    if (!response.ok) {
      console.warn(`[${addon.name}] HTTP ${response.status} em ${Date.now() - started}ms`);
      return {
        streams: [], status: 'http_error', httpStatus: response.status,
        idConverted: converted, durationMs: Date.now() - started
      };
    }
    const data = await response.json();
    if (!Array.isArray(data?.streams)) {
      return {
        streams: [], status: 'invalid_response',
        idConverted: converted, durationMs: Date.now() - started
      };
    }
    const count = data.streams.length;
    console.log(`[${addon.name}] ${count} fonte(s) em ${Date.now() - started}ms`);
    return {
      streams: data.streams, status: count ? 'results' : 'empty',
      idConverted: converted, durationMs: Date.now() - started
    };
  } catch (error) {
    const timeout = controller.signal.aborted || error.name === 'AbortError' || error.name === 'TimeoutError';
    console.warn(`[${addon.name}] ${timeout ? 'timeout' : 'falha de rede'} em ${Date.now() - started}ms`);
    return {
      streams: [], status: timeout ? 'timeout' : 'network_error',
      idConverted: converted, durationMs: Date.now() - started
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Executa a agregação de streams de múltiplos addons.
 */
export async function aggregateStreams(config, type, id) {
  const activeAddons = (config.addons || []).filter(a => {
    if (a.enabled === false) return false;
    const resources = a.resources || ['stream'];
    return resources.includes('stream');
  });
  if (activeAddons.length === 0) {
    return { streams: [] };
  }

  const cacheKey = `${type}:${id}:${JSON.stringify(config)}`;
  const cached = streamCache.get(cacheKey);
  if (cached) {
    recordAggregate({ type, cacheHit: true, activeProviders: activeAddons.length, delivered: cached.streams.length });
    return cached;
  }

  const started = Date.now();
  const streamSources = new WeakMap();

  // Prioridade = ordem persistida no perfil main. Consultas continuam
  // paralelas, mas começam com pequeno intervalo para garantir que provedores
  // de maior prioridade recebam primeiro a solicitação sem serializar a busca.
  const fetchPromises = activeAddons.map(async (addon,priorityIndex) => {
    if(priorityIndex>0)
      await new Promise(resolve=>setTimeout(resolve,Math.min(priorityIndex*55,880)));
    let outcome;
    try {
      outcome = await fetchAddonStreams(addon, type, id);
    } catch {
      outcome = { streams: [], status: 'network_error', durationMs: 0 };
    }
    const rawCount = outcome.streams.length;
    recordSearch(addon, { ...outcome, count: rawCount });
    let streams = outcome.streams;
    if (config.filters?.maxStreamsPerAddon && streams.length > config.filters.maxStreamsPerAddon) {
      streams = streams.slice(0, config.filters.maxStreamsPerAddon);
    }
    return streams.map(s => {
      const enriched = enrichStreamBadge(s, addon.name, config.badgeFormat);
      streamSources.set(enriched, addon.url);
      return enriched;
    });
  });

  const settled = await Promise.allSettled(fetchPromises);
  let combinedStreams = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      combinedStreams.push(...item.value);
    }
  }
  const received = combinedStreams.length;

  // Aplica filtros (resolução, cams, regex)
  if (config.filters) {
    combinedStreams = filterStreams(combinedStreams, config.filters);
  }

  // Desduplica se configurado
  if (config.deduplicate) {
    combinedStreams = deduplicateStreams(combinedStreams, stream => streamSources.get(stream));
  }

  // Limite total de streams
  if (config.filters?.maxTotalStreams && combinedStreams.length > config.filters.maxTotalStreams) {
    combinedStreams = combinedStreams.slice(0, config.filters.maxTotalStreams);
  }

  for (const addon of activeAddons) {
    const delivered = combinedStreams.filter(stream => streamSources.get(stream) === addon.url).length;
    recordSearchDelivery(addon, delivered);
  }
  recordAggregate({
    type,
    cacheHit: false,
    activeProviders: activeAddons.length,
    receivedBeforeFilters: received,
    delivered: combinedStreams.length,
    durationMs: Date.now() - started
  });
  const result = { streams: combinedStreams };
  streamCache.set(cacheKey, result);
  return result;
}

