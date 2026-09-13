import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';

/**
 * Cria o ID com namespace para um catálogo de um addon específico.
 */
export function buildCatalogId(addonIndex, originalId) {
  return `a${addonIndex}__${originalId}`;
}

/**
 * Faz o parse de um ID de catálogo com namespace para identificar o addon e o ID original.
 */
export function parseCatalogId(namespacedId) {
  const parts = String(namespacedId).split('__');
  if (parts.length >= 2 && parts[0].startsWith('a')) {
    const addonIndex = parseInt(parts[0].slice(1), 10);
    const originalId = parts.slice(1).join('__');
    return { addonIndex, originalId };
  }
  return { addonIndex: -1, originalId: namespacedId };
}

/**
 * Encaminha a consulta de catálogo para o addon correspondente.
 */
export async function fetchCatalog(config, type, namespacedId, extra = '') {
  const { addonIndex, originalId } = parseCatalogId(namespacedId);
  const addons = config.addons || [];

  const addon = addons[addonIndex];
  if (!addon || addon.enabled === false) {
    console.warn(`[Catalog] Addon no índice ${addonIndex} não encontrado ou desativado.`);
    return { metas: [] };
  }

  const parsed = parseAddonUrl(addon.url);
  if (!parsed) return { metas: [] };

  const catalogUrl = parsed.getCatalogUrl(type, originalId, extra);
  const timeoutMs = addon.timeoutMs || 10000;

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
    return { metas: data.metas || [] };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[Catalog: ${addon.name}] Falha na consulta do catálogo:`, err.message);
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

  for (const addon of metaAddons) {
    const parsed = parseAddonUrl(addon.url);
    if (!parsed) continue;

    const metaUrl = parsed.getMetaUrl(type, id);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), addon.timeoutMs || 8000);

    try {
      const res = await fetch(metaUrl, {
        signal: controller.signal,
        headers: DEFAULT_FETCH_HEADERS,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.meta) {
          return data;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
    }
  }

  return { meta: null };
}

