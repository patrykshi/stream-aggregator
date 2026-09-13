import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogId, parseCatalogId, mergeAndDeduplicateMetas } from '../src/aggregator/catalogs.js';
import { generateManifest } from '../src/aggregator/manifest.js';

describe('Catalogs Module', () => {
  it('deve gerar e fazer parse do catalogId com namespace', () => {
    const namespaced = buildCatalogId(2, 'top_movies');
    assert.equal(namespaced, 'a2__top_movies');

    const parsed = parseCatalogId(namespaced);
    assert.equal(parsed.addonIndex, 2);
    assert.equal(parsed.originalId, 'top_movies');
  });

  it('deve intercalar e desduplicar listas de itens (round-robin + deduplicação por IMDb/ID)', () => {
    const listA = [
      { id: 'tt100', name: 'Filme 1' },
      { id: 'tt200', name: 'Filme 2' },
      { id: 'tt300', name: 'Filme 3' }
    ];
    const listB = [
      { id: 'tt200', name: 'Filme 2 Duplicado' }, // Deve ser ignorado
      { id: 'tt400', name: 'Filme 4' },
      { id: 'tt500', name: 'Filme 5' }
    ];

    const merged = mergeAndDeduplicateMetas([listA, listB]);
    assert.equal(merged.length, 5);
    // Ordem round-robin: listA[0], listB[0](ignorado pois tt200 está em listA), listA[1], listB[1], listA[2], listB[2]
    const ids = merged.map(m => m.id);
    assert.deepEqual(ids, ['tt100', 'tt200', 'tt400', 'tt300', 'tt500']);
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

  it('deve priorizar customCatalogs no manifest quando fornecidos (incluindo mesclados)', () => {
    const config = {
      addons: [
        { name: 'Addon1', enabled: true, catalogs: [{ id: 'cat1', name: 'Cat 1' }] }
      ],
      customCatalogs: [
        {
          id: 'merged_123',
          name: 'Super Populares',
          customName: '🔥 Filmes em Alta',
          type: 'movie',
          enabled: true,
          isMerged: true,
          sourceCatalogIds: ['a0__cat1']
        },
        {
          id: 'a0__cat1',
          name: '[Addon1] Cat 1',
          type: 'movie',
          enabled: false // desativado
        }
      ]
    };

    const manifest = generateManifest(config);
    assert.equal(manifest.catalogs.length, 1);
    assert.equal(manifest.catalogs[0].id, 'merged__merged_123');
    assert.equal(manifest.catalogs[0].name, '🔥 Filmes em Alta');
  });

  it('deve incluir showInHome para compatibilidade com Coleções do Nuvio e priorizar isFavorite: true', () => {
    const config = {
      customCatalogs: [
        {
          id: 'cat_normal',
          name: 'Normal',
          type: 'movie',
          enabled: true,
          showOnHome: true,
          isFavorite: false
        },
        {
          id: 'cat_fav',
          name: 'Favorito VIP',
          type: 'movie',
          enabled: true,
          showOnHome: true,
          isFavorite: true
        },
        {
          id: 'cat_hidden_home',
          name: 'Oculto da Home (Apenas Coleção Nuvio)',
          type: 'movie',
          enabled: true,
          showOnHome: false, // Oculto da tela inicial, mas presente na central de Coleções do Nuvio
          isFavorite: false
        },
        {
          id: 'cat_disabled',
          name: 'Desativado Geral',
          type: 'movie',
          enabled: false,
          showOnHome: false
        }
      ]
    };

    const manifest = generateManifest(config);
    // cat_disabled não deve constar, mas os 3 ativos devem
    assert.equal(manifest.catalogs.length, 3);
    // cat_fav deve vir antes de cat_normal por ser favorito
    assert.equal(manifest.catalogs[0].id, 'cat_fav');
    assert.equal(manifest.catalogs[0].showInHome, true);
    assert.equal(manifest.catalogs[1].id, 'cat_normal');
    assert.equal(manifest.catalogs[1].showInHome, true);
    // cat_hidden_home deve ter showInHome: false para o Nuvio exibir apenas em Coleções
    assert.equal(manifest.catalogs[2].id, 'cat_hidden_home');
    assert.equal(manifest.catalogs[2].showInHome, false);
  });
});


