import { buildCatalogId } from './catalogs.js';

/**
 * Gera o manifest.json compatível com o Stremio para uma dada configuração,
 * incluindo dinamicamente recursos de stream, legendas e catálogos.
 */
export function generateManifest(config = {}) {
  const activeAddons = (config.addons || []).filter(a => a.enabled !== false);
  const count = activeAddons.length;
  const addonListSummary = activeAddons.map(a => a.name).join(', ');

  const hasSubtitles = activeAddons.some(a => (a.resources || ['stream']).includes('subtitles'));
  const hasMeta = activeAddons.some(a => (a.resources || ['stream']).includes('meta'));

  // Compila catálogos
  const aggregatedCatalogs = [];
  activeAddons.forEach((addon, idx) => {
    if (addon.includeCatalogs !== false && Array.isArray(addon.catalogs) && addon.catalogs.length > 0) {
      addon.catalogs.forEach(cat => {
        aggregatedCatalogs.push({
          type: cat.type || 'movie',
          id: buildCatalogId(idx, cat.id),
          name: `[${addon.name}] ${cat.name || cat.id}`,
          extra: cat.extra || [{ name: 'skip', isRequired: false }]
        });
      });
    }
  });

  const resources = [
    {
      name: 'stream',
      types: ['movie', 'series', 'anime', 'other'],
      idPrefixes: ['tt', 'kitsu', 'tmdb']
    }
  ];

  if (hasSubtitles) {
    resources.push({
      name: 'subtitles',
      types: ['movie', 'series', 'anime', 'other'],
      idPrefixes: ['tt', 'kitsu', 'tmdb']
    });
  }

  if (hasMeta) {
    resources.push({
      name: 'meta',
      types: ['movie', 'series', 'anime', 'other'],
      idPrefixes: ['tt', 'kitsu', 'tmdb']
    });
  }

  const description = count > 0
    ? `Agregando ${count} provedor(es): ${addonListSummary}`
    : 'Agregador universal de streams, legendas e catálogos para Stremio.';

  return {
    id: 'community.streamaggregator.unified',
    version: '1.2.0',
    name: 'Unified Stream Aggregator',
    description,
    logo: 'https://cdn-icons-png.flaticon.com/512/3845/3845868.png',
    background: 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?auto=format&fit=crop&w=1600&q=80',
    resources,
    types: ['movie', 'series', 'anime', 'other'],
    catalogs: aggregatedCatalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}
