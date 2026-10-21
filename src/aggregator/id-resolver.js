import {getIntegrationKey} from '../config/hub-integrations.js';
// Compatibilidade entre catálogos TMDb e provedores Stremio que aceitam somente IMDb.
const cache = new Map();
const inFlight = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 300;

export function requiresImdbConversion(addon, id) {
  if (!/^tmdb:\d+(?::\d+:\d+)?$/.test(id)) return false;
  const prefixes = addon.idPrefixes;
  if (!Array.isArray(prefixes) || prefixes.length === 0) return false;
  const supports = (candidate) => prefixes.some(prefix =>
    typeof prefix === 'string' && candidate.startsWith(prefix)
  );
  return supports('tt1234567') && !supports(id);
}

async function lookupImdb(mediaType, tmdbId, options) {
  const apiKey = options.apiKey ?? getIntegrationKey('tmdb');
  if (!apiKey) return null;
  const fetchFn = options.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  let imdb = null;
  let successful = false;
  try {
    if (apiKey) {
      const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids`);
      url.searchParams.set('api_key', apiKey);
      const response = await fetchFn(url.toString(), {
        signal: controller.signal, headers: { Accept: 'application/json' }
      });
      if (response.ok) {
        successful = true;
        const data = await response.json();
        if (/^tt\d+$/.test(data?.imdb_id || '')) imdb = data.imdb_id;
      }
    }
  } catch {
    // A falha de resolução não bloqueia as outras fontes do agregador.
  } finally {
    clearTimeout(timer);
  }
  if (successful) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(mediaType + ':' + tmdbId, { value: imdb, expiry: Date.now() + CACHE_TTL_MS });
  }
  return imdb;
}

export async function resolveAddonId(addon, type, id, options = {}) {
  if (!requiresImdbConversion(addon, id)) return id;
  const match = /^tmdb:(\d+)(?::(\d+):(\d+))?$/.exec(id);
  const mediaType = type === 'series' || type === 'tv' ? 'tv' : type === 'movie' ? 'movie' : null;
  if (!match || !mediaType) return id;
  const key = mediaType + ':' + match[1];
  const cached = cache.get(key);
  let imdb;
  if (cached && cached.expiry > Date.now()) {
    imdb = cached.value;
  } else {
    if (!inFlight.has(key)) {
      const pending = lookupImdb(mediaType, match[1], options)
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    imdb = await inFlight.get(key);
  }
  return imdb ? imdb + (match[2] !== undefined ? `:${match[2]}:${match[3]}` : '') : id;
}
