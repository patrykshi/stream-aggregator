/**
 * Gera o manifest.json compatível com o Stremio para uma dada configuração.
 */
export function generateManifest(config = {}) {
  const count = (config.addons || []).filter(a => a.enabled !== false).length;
  const addonListSummary = (config.addons || [])
    .filter(a => a.enabled !== false)
    .map(a => a.name)
    .join(', ');

  const description = count > 0
    ? `Agregando ${count} provedor(es): ${addonListSummary}`
    : 'Agregador universal de streams para Stremio. Configure seus addons para começar.';

  return {
    id: 'community.streamaggregator.unified',
    version: '1.0.0',
    name: 'Unified Stream Aggregator',
    description,
    logo: 'https://cdn-icons-png.flaticon.com/512/3845/3845868.png',
    background: 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?auto=format&fit=crop&w=1600&q=80',
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series', 'anime', 'other'],
        idPrefixes: ['tt', 'kitsu', 'tmdb']
      }
    ],
    types: ['movie', 'series', 'anime', 'other'],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}

