import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAddonUrl } from '../src/aggregator/url-helper.js';

describe('URL Helper', () => {
  it('deve fazer parse de URL comum de addon', () => {
    const parsed = parseAddonUrl('https://torrentio.strem.fun/manifest.json');
    assert.equal(parsed.manifestUrl, 'https://torrentio.strem.fun/manifest.json');
    assert.equal(parsed.baseUrl, 'https://torrentio.strem.fun');
    assert.equal(parsed.getStreamUrl('movie', 'tt123'), 'https://torrentio.strem.fun/stream/movie/tt123.json');
  });

  it('deve converter protocolo stremio:// para https://', () => {
    const parsed = parseAddonUrl('stremio://bestcine.online/manifest.json');
    assert.equal(parsed.manifestUrl, 'https://bestcine.online/manifest.json');
    assert.equal(parsed.baseUrl, 'https://bestcine.online');
    assert.equal(parsed.getStreamUrl('series', 'tt456:1:1'), 'https://bestcine.online/stream/series/tt456%3A1%3A1.json');
  });

  it('deve adicionar manifest.json se omitido', () => {
    const parsed = parseAddonUrl('https://bestcine.online');
    assert.equal(parsed.manifestUrl, 'https://bestcine.online/manifest.json');
    assert.equal(parsed.baseUrl, 'https://bestcine.online');
    assert.equal(parsed.getStreamUrl('movie', 'tt123'), 'https://bestcine.online/stream/movie/tt123.json');
  });

  it('deve preservar query parameters na rota de stream', () => {
    const parsed = parseAddonUrl('https://myaddon.xyz/manifest.json?api_key=secret123');
    assert.equal(parsed.manifestUrl, 'https://myaddon.xyz/manifest.json?api_key=secret123');
    assert.equal(parsed.baseUrl, 'https://myaddon.xyz');
    assert.equal(parsed.getStreamUrl('movie', 'tt123'), 'https://myaddon.xyz/stream/movie/tt123.json?api_key=secret123');
  });

  it('deve preservar subpastas/tokens na URL', () => {
    const parsed = parseAddonUrl('https://torrentio.strem.fun/providers=yts/manifest.json');
    assert.equal(parsed.manifestUrl, 'https://torrentio.strem.fun/providers=yts/manifest.json');
    assert.equal(parsed.baseUrl, 'https://torrentio.strem.fun/providers=yts');
    assert.equal(parsed.getStreamUrl('movie', 'tt123'), 'https://torrentio.strem.fun/providers=yts/stream/movie/tt123.json');
  });

  it('deve auto-corrigir domínio descontinuado do OpenSubtitles de strem.fun para strem.io', () => {
    const parsed = parseAddonUrl('https://opensubtitles-v3.strem.fun/manifest.json');
    assert.equal(parsed.manifestUrl, 'https://opensubtitles-v3.strem.io/manifest.json');
    assert.equal(parsed.baseUrl, 'https://opensubtitles-v3.strem.io');
    assert.equal(parsed.getSubtitleUrl('movie', 'tt0137523'), 'https://opensubtitles-v3.strem.io/subtitles/movie/tt0137523.json');
  });
});

