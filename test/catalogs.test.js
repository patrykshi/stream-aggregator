import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogId, parseCatalogId } from '../src/aggregator/catalogs.js';
import { generateManifest } from '../src/aggregator/manifest.js';

describe('Catalogs Module', () => {
  it('deve gerar e fazer parse do catalogId com namespace', () => {
    const namespaced = buildCatalogId(2, 'top_movies');
    assert.equal(namespaced, 'a2__top_movies');

    const parsed = parseCatalogId(namespaced);
    assert.equal(parsed.addonIndex, 2);
    assert.equal(parsed.originalId, 'top_movies');
  });

  it('deve incluir recursos subtitles e catalogs no manifest dinâmico', () => {
    const config = {
      addons: [
        {
          name: 'Torrentio',
          enabled: true,
          resources: ['stream']
        },
        {
          name: 'OpenSubtitles v3',
          enabled: true,
          resources: ['subtitles']
        },
        {
          name: 'CyberFlix',
          enabled: true,
          resources: ['catalog', 'meta'],
          catalogs: [
            { type: 'movie', id: 'cyberflix_popular', name: 'Populares' }
          ]
        }
      ]
    };

    const manifest = generateManifest(config);
    const resourceNames = manifest.resources.map(r => r.name);

    assert.ok(resourceNames.includes('stream'));
    assert.ok(resourceNames.includes('subtitles'));
    assert.ok(resourceNames.includes('meta'));

    assert.equal(manifest.catalogs.length, 1);
    assert.equal(manifest.catalogs[0].id, 'a2__cyberflix_popular');
    assert.match(manifest.catalogs[0].name, /CyberFlix/);
  });
});

