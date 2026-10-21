import {createHash} from 'node:crypto';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';
import {collectCatalogPages} from './catalog-pages.js';

/**
 * IDs de catálogos estáveis mesmo quando o usuário troca a prioridade dos
 * addons. IDs antigos baseados em índice continuam aceitos na rota de leitura.
 */
export function stableCatalogId(url, originalId, type='movie') {
  const hash=createHash('sha256').update(String(url)).digest('hex').slice(0,12);
  return 'src'+hash+'_'+type+'__'+String(originalId);
}
/**
 * Cria o ID com namespace para um catálogo de um addon específico.
 * Se o tipo for fornecido, inclui no namespace para evitar colisão entre catálogos de tipos diferentes com mesmo ID.
 */
export function buildCatalogId(addonIndex, originalId, type = '') {
  return type ? `a${addonIndex}_${type}__${originalId}` : `a${addonIndex}__${originalId}`;
}

/**
 * Faz o parse de um ID de catálogo com namespace para identificar o addon, ID original e tipo (se presente).
 */
export function parseCatalogId(namespacedId) {
  const parts = String(namespacedId).split('__');
  if (parts.length >= 2 && parts[0].startsWith('a')) {
    const prefix = parts[0].slice(1);
    const subParts = prefix.split('_');
    const addonIndex = parseInt(subParts[0], 10);
    const catalogType = subParts.length > 1 ? subParts[1] : null;
    const originalId = parts.slice(1).join('__');
    return { addonIndex, originalId, catalogType };
  }
  return { addonIndex: -1, originalId: namespacedId, catalogType: null };
}

/**
 * Intercala e desduplica listas de itens de múltiplos catálogos (round-robin).
 */
export function mergeAndDeduplicateMetas(metasArrays) {
  if (!Array.isArray(metasArrays) || metasArrays.length === 0) {
    return [];
  }

  const seenIds = new Set();
  const merged = [];

  // Encontra o tamanho máximo de lista
  const maxLen = Math.max(...metasArrays.map(arr => (Array.isArray(arr) ? arr.length : 0)));

  for (let i = 0; i < maxLen; i++) {
    for (const arr of metasArrays) {
      if (Array.isArray(arr) && i < arr.length) {
        const item = arr[i];
        if (!item) continue;

        const uniqueKey = item.id || item.imdb_id;
        if (uniqueKey) {
          const lowerKey = String(uniqueKey).toLowerCase();
          if (seenIds.has(lowerKey)) continue;
          seenIds.add(lowerKey);
        }

        merged.push(item);
      }
    }
  }

  return merged;
}

/**
 * Encaminha a consulta de catálogo para o addon correspondente ou processa catálogo mesclado.
 */
export async function fetchCatalog(config, type, namespacedId, extra = '') {
  // 1. Catálogo Mesclado (Merged Catalog)
  if (String(namespacedId).startsWith('merged__')) {
    const mergedId = String(namespacedId).replace('merged__', '');
    const customCatalogs = config.customCatalogs || [];
    const mergedConfig = customCatalogs.find(c => c.id === mergedId || c.id === namespacedId);

    if (!mergedConfig || !Array.isArray(mergedConfig.sourceCatalogIds) || mergedConfig.sourceCatalogIds.length === 0) {
      console.warn(`[Catalog Merged] Catálogo mesclado "${namespacedId}" não encontrado ou sem fontes.`);
      return { metas: [] };
    }

    console.log(`[Catalog Merged] Consultando ${mergedConfig.sourceCatalogIds.length} fontes para "${mergedConfig.name}"...`);

    const promises = mergedConfig.sourceCatalogIds.map(srcId =>
      fetchCatalog(config, type, srcId, extra).then(res => res.metas || []).catch(() => [])
    );

    const settled = await Promise.allSettled(promises);
    const validArrays = settled
      .filter(s => s.status === 'fulfilled' && Array.isArray(s.value))
      .map(s => s.value);

    const mergedMetas = mergeAndDeduplicateMetas(validArrays);
    console.log(`[Catalog Merged] Total consolidado: ${mergedMetas.length} itens.`);
    return { metas: mergedMetas };
  }

  // 2. Catálogo Normal de Addon
  const addons = config.addons || [];
  const isStable=String(namespacedId).match(/^src([0-9a-f]{12})_(movie|series|anime|other)__(.+)$/);
  let addon,originalId;
  if(isStable){
    addon=addons.find(item=>createHash('sha256').update(String(item.url))
      .digest('hex').slice(0,12)===isStable[1]);
    originalId=isStable[3];
    if(isStable[2]!==type)return {metas:[]};
  }else{
    const legacy=parseCatalogId(namespacedId);
    addon=addons[legacy.addonIndex];
    originalId=legacy.originalId;
  }
  if (!addon || addon.enabled === false || (addon.resourceSelectionConfigured && !(addon.resources||['stream']).includes('catalog'))) {
    console.warn("[Catalog] Addon não encontrado ou desativado.");
    return { metas: [] };
  }

  const parsed = parseAddonUrl(addon.url);
  if (!parsed) return { metas: [] };

  const catalogUrl = parsed.getCatalogUrl(type, originalId, extra);
  const timeoutMs = Number.isInteger(addon.requestTimeoutMs)
    ? Math.min(Math.max(addon.requestTimeoutMs,3000),30000) : 7500;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(catalogUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Catalog: ${addon.name}] HTTP ${res.status} ao consultar catálogo ${originalId}`);
      return { metas: [] };
    }

    const data = await res.json();
    const metas = Array.isArray(data.metas) ? [...data.metas] : [];
    const hasExplicitSkip = /(^|&)skip=\d+/.test(extra || '');
    if (!hasExplicitSkip && metas.length>=20) {
      const extraBase = extra ? extra + '&' : '';
      const completed = await collectCatalogPages(metas, {
        fetchPage:async(skip)=>{
          const url=parsed.getCatalogUrl(type,originalId,extraBase+'skip='+skip);
          const response=await fetch(url,{headers:DEFAULT_FETCH_HEADERS,
            signal:AbortSignal.timeout(Math.min(timeoutMs,9000)),redirect:'error'});
          if(!response.ok||Number(response.headers.get('content-length')||0)>8_000_000)return [];
          const body=await response.json();
          return Array.isArray(body?.metas)?body.metas:[];
        }
      });
      return {metas:completed};
    }
    return { metas };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Catalog] Falha na consulta da origem.');
    return { metas: [] };
  }
}

/**
 * Encaminha a consulta de metadados para os addons habilitados que fornecem `meta`.
 */
export async function fetchMeta(config, type, id) {
  const metaAddons = (config.addons || []).filter(a => {
    if (a.enabled === false) return false;
    const resources = a.resources || ['stream'];
    return resources.includes('meta');
  });

  // Prioriza o Emby local para metadados, garantindo que o catálogo próprio tenha prioridade
  const sortedAddons = [...metaAddons].sort((a, b) => {
    const aIsEmby = (a.name || '').toLowerCase().includes('emby') || (a.url || '').includes('bridge.patrykrocha.com');
    const bIsEmby = (b.name || '').toLowerCase().includes('emby') || (b.url || '').includes('bridge.patrykrocha.com');
    if (aIsEmby && !bIsEmby) return -1;
    if (!aIsEmby && bIsEmby) return 1;
    return 0;
  });

  let fallbackMeta = null;

  for (const addon of sortedAddons) {
    const parsed = parseAddonUrl(addon.url);
    if (!parsed) continue;

    const metaUrl = parsed.getMetaUrl(type, id);
    const controller = new AbortController();
    const limit=Number.isInteger(addon.requestTimeoutMs)
      ? Math.min(Math.max(addon.requestTimeoutMs,3000),30000) : 8000;
    const timeoutId = setTimeout(() => controller.abort(), limit);

    try {
      const res = await fetch(metaUrl, {
        signal: controller.signal,
        headers: DEFAULT_FETCH_HEADERS,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const meta = data?.meta;
        if (meta && typeof meta === 'object') {
          // Detecta se é stub inválido (ex: BestCine com name === id e sem detalhes)
          const isDummyName = !meta.name || meta.name === id || meta.name === `tmdb:${id}` || meta.name.trim() === '';
          const hasVideos = Array.isArray(meta.videos) && meta.videos.length > 0;

          if (isDummyName && !hasVideos) {
            continue;
          }

          // Para séries, metadado com episódios é a melhor resposta possível
          if (type === 'series' || type === 'tv') {
            if (hasVideos) {
              return data;
            }
            // Guarda como fallback caso nenhum outro addon tenha episódios
            if (!fallbackMeta && !isDummyName) {
              fallbackMeta = data;
            }
          } else {
            // Para filmes
            if (!isDummyName) {
              return data;
            }
          }
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
    }
  }

  return fallbackMeta || { meta: null };
}
