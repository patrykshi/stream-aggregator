import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublication, formatCatalogLabel, publishedCatalog, invalidatePublication } from '../src/aggregator/nuvio-publication.js';
import { BRIDGE_ADDON_ID } from '../src/aggregator/catalog-service.js';

describe('Nuvio Catalog Titles & Completeness', () => {
  const baseManifest = { id: BRIDGE_ADDON_ID, resources: ['stream'], catalogs: [] };

  it('formatCatalogLabel disambiguates movies and series when names match folder or siblings', () => {
    // When name matches folder
    assert.equal(formatCatalogLabel('Top 100 de hoje', 'Para você (Top 100 de hoje)', 'movie'), 'Top 100 de hoje · Filmes');
    assert.equal(formatCatalogLabel('Top 100 de hoje', 'Para você (Top 100 de hoje)', 'series'), 'Top 100 de hoje · Séries');

    // When folder is identical to label
    assert.equal(formatCatalogLabel('Em alta', 'Em alta', 'movie'), 'Em alta · Filmes');
    assert.equal(formatCatalogLabel('Em alta', 'Em alta', 'series'), 'Em alta · Séries');

    // When label already has type
    assert.equal(formatCatalogLabel('Filmes Populares', 'Populares', 'movie'), 'Filmes Populares');
    assert.equal(formatCatalogLabel('Séries em Alta', 'Em alta', 'series'), 'Séries em Alta');
  });

  it('buildPublication assigns original disambiguated titles to catalogSources in collections', () => {
    const provider = {
      addonId: 'br.cinebra.test',
      url: 'https://catalog.example/addon/test/manifest.json',
      catalogs: [
        { type: 'movie', id: 'top100_movies', name: 'Top 100 de hoje', extra: [{ name: 'skip' }] },
        { type: 'series', id: 'top100_series', name: 'Top 100 de hoje', extra: [{ name: 'skip' }] }
      ]
    };

    const collections = [
      {
        id: 'home',
        title: 'Home',
        folders: [
          {
            id: 'top100_folder',
            title: 'Para você (Top 100 de hoje)',
            catalogSources: [
              { addonId: 'br.cinebra.test', type: 'movie', catalogId: 'top100_movies' },
              { addonId: 'br.cinebra.test', type: 'series', catalogId: 'top100_series' }
            ]
          }
        ]
      }
    ];

    const result = buildPublication({ collections, baseManifest, providers: [provider] });
    const sources = result.collections[0].folders[0].catalogSources;

    // Both sources must have explicit, distinct titles and names
    assert.equal(sources[0].title, 'Top 100 de hoje · Filmes');
    assert.equal(sources[0].name, 'Top 100 de hoje · Filmes');
    assert.equal(sources[0].catalogName, 'Top 100 de hoje');

    assert.equal(sources[1].title, 'Top 100 de hoje · Séries');
    assert.equal(sources[1].name, 'Top 100 de hoje · Séries');
    assert.equal(sources[1].catalogName, 'Top 100 de hoje');

    // Manifest catalogs must also have disambiguated names
    assert.equal(result.manifest.catalogs[0].name, 'Top 100 de hoje · Filmes');
    assert.equal(result.manifest.catalogs[1].name, 'Top 100 de hoje · Séries');
  });

  it('publishedCatalog auto-aggregates pages up to 100 items when skip is omitted and upstream returns 20', async () => {
    invalidatePublication();

    // Simulate an upstream addon with 60 total items in 3 pages of 20
    const pages = {
      'skip=0': Array.from({ length: 20 }, (_, i) => ({ id: `tt${1000 + i}`, name: `Movie ${i}` })),
      'skip=20': Array.from({ length: 20 }, (_, i) => ({ id: `tt${2000 + i}`, name: `Movie ${20 + i}` })),
      'skip=40': Array.from({ length: 20 }, (_, i) => ({ id: `tt${3000 + i}`, name: `Movie ${40 + i}` })),
      'skip=60': [] // Page 4 is empty
    };

    const mockFetch = async (url) => {
      const decoded = decodeURIComponent(url);
      const parts = decoded.split('/');
      const last = parts[parts.length - 1]; // e.g. "skip=20.json" or "test_cat.json"
      let skipKey = 'skip=0';
      if (last.includes('skip=')) {
        const match = last.match(/skip=(\d+)/);
        if (match) skipKey = `skip=${match[1]}`;
      }
      const metas = pages[skipKey] || [];
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => ({ metas })
      };
    };

    const publication = {
      routes: new Map([
        ['movie::proxy123', {
          url: 'https://mock.addon/manifest.json',
          id: 'test_cat',
          name: 'Test Catalog',
          type: 'movie',
          extra: [{ name: 'skip', isRequired: false }],
          requestTimeoutMs: 5000
        }]
      ])
    };

    const result = await publishedCatalog('movie', 'proxy123', '', publication, { fetchImpl: mockFetch });
    // Must contain all 60 items across the 3 pages, not just 20!
    assert.equal(result.metas.length, 60);
    assert.equal(result.metas[0].id, 'tt1000');
    assert.equal(result.metas[20].id, 'tt2000');
    assert.equal(result.metas[40].id, 'tt3000');
  });

  it('publishedCatalog respects explicit skip when provided', async () => {
    const mockFetch = async (url) => {
      assert.ok(decodeURIComponent(url).includes('skip=20'));
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          metas: [{ id: 'tt2000', name: 'Movie 20' }]
        })
      };
    };

    const publication = {
      routes: new Map([
        ['movie::proxy123', {
          url: 'https://mock.addon/manifest.json',
          id: 'test_cat',
          name: 'Test Catalog',
          type: 'movie',
          extra: [{ name: 'skip', isRequired: false }],
          requestTimeoutMs: 5000
        }]
      ])
    };

    const result = await publishedCatalog('movie', 'proxy123', 'skip=20', publication, { fetchImpl: mockFetch });
    // Must return only the single requested page (1 item)
    assert.equal(result.metas.length, 1);
    assert.equal(result.metas[0].id, 'tt2000');
  });
});
