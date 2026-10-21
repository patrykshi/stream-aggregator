import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requiresImdbConversion, resolveAddonId } from '../src/aggregator/id-resolver.js';
import { sanitizeConfig } from '../src/config/codec.js';

const imdbOnly = { name: 'BestCine', idPrefixes: ['tt', 'bestcine_tv_'] };
const both = { name: 'Emby', idPrefixes: ['tt', 'tmdb:', 'emby:'] };

describe('TMDb -> IMDb para provedores legados', () => {
  it('identifica apenas provedores que dependem de IMDb', () => {
    assert.equal(requiresImdbConversion(imdbOnly, 'tmdb:603'), true);
    assert.equal(requiresImdbConversion(both, 'tmdb:603'), false);
    assert.equal(requiresImdbConversion(imdbOnly, 'tt0133093'), false);
    assert.equal(requiresImdbConversion({ idPrefixes: [] }, 'tmdb:603'), false);
  });

  it('traduz filme e mantém o restante do identificador intacto', async () => {
    let called = 0;
    const fetchFn = async (url) => {
      called++;
      assert.match(url, /\/movie\/98765\/external_ids/);
      return { ok: true, json: async () => ({ imdb_id: 'tt0133093' }) };
    };
    const first = await resolveAddonId(imdbOnly, 'movie', 'tmdb:98765', { apiKey: 'test-only', fetchFn });
    const cached = await resolveAddonId(imdbOnly, 'movie', 'tmdb:98765', { apiKey: 'test-only', fetchFn });
    assert.equal(first, 'tt0133093');
    assert.equal(cached, first);
    assert.equal(called, 1);
  });

  it('preserva temporada e episódio ao traduzir séries', async () => {
    const fetchFn = async (url) => {
      assert.match(url, /\/tv\/98766\/external_ids/);
      return { ok: true, json: async () => ({ imdb_id: 'tt0944947' }) };
    };
    assert.equal(
      await resolveAddonId(imdbOnly, 'series', 'tmdb:98766:2:4', { apiKey: 'test-only', fetchFn }),
      'tt0944947:2:4'
    );
  });

  it('não traduz provedores que já aceitam TMDb', async () => {
    const unexpected = () => { throw new Error('lookup desnecessário'); };
    assert.equal(
      await resolveAddonId(both, 'movie', 'tmdb:603', { apiKey: 'test-only', fetchFn: unexpected }),
      'tmdb:603'
    );
  });

  it('não altera IDs sem equivalência ou chave', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ imdb_id: null }) });
    assert.equal(
      await resolveAddonId(imdbOnly, 'movie', 'tmdb:98767', { apiKey: 'test-only', fetchFn }),
      'tmdb:98767'
    );
    assert.equal(
      await resolveAddonId(imdbOnly, 'movie', 'tmdb:98768', { apiKey: '', fetchFn }),
      'tmdb:98768'
    );
  });

  it('não usa provedores externos de metadados sem configuração explícita', async () => {
    const fetchFn = async (url) => {
      assert.match(url, /\/meta\/movie\/tmdb%3A98769\.json/);
      return { ok: true, json: async () => ({ meta: { id: 'tt22526100' } }) };
    };
    assert.equal(
      await resolveAddonId(imdbOnly, 'movie', 'tmdb:98769', {
        apiKey: '', fetchFn
      }),
      'tmdb:98769'
    );
  });

  it('retém idPrefixes na sanitização do perfil', () => {
    const c = sanitizeConfig({ addons: [{ url: 'https://example.com/manifest.json', idPrefixes: ['tt'] }] });
    assert.deepEqual(c.addons[0].idPrefixes, ['tt']);
  });
});
