import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeConfig, decodeConfig, getDefaultConfig } from '../src/config/codec.js';
import { filterStreams, deduplicateStreams, extractResolution, isCamStream, enrichStreamBadge } from '../src/aggregator/filter.js';
import { generateManifest } from '../src/aggregator/manifest.js';

describe('Config Codec', () => {
  it('deve codificar e decodificar a configuração perfeitamente', () => {
    const original = {
      addons: [
        { name: 'Torrentio', url: 'https://torrentio.strem.fun/manifest.json', enabled: true },
        { name: 'Emby Bridge', url: 'http://localhost:7000/manifest.json', enabled: true }
      ],
      filters: {
        resolutions: ['4k', '1080p'],
        removeCams: true,
        excludeRegex: 'ita|hindi',
        maxStreamsPerAddon: 5,
        maxTotalStreams: 15
      },
      badgeFormat: 'addon',
      deduplicate: true
    };

    const token = encodeConfig(original);
    assert.ok(typeof token === 'string' && token.length > 0);

    const decoded = decodeConfig(token);
    assert.equal(decoded.addons.length, 2);
    assert.equal(decoded.addons[0].name, 'Torrentio');
    assert.equal(decoded.addons[1].name, 'Emby Bridge');
    assert.deepEqual(decoded.filters.resolutions, ['4k', '1080p']);
    assert.equal(decoded.filters.removeCams, true);
    assert.equal(decoded.filters.excludeRegex, 'ita|hindi');
    assert.equal(decoded.filters.maxStreamsPerAddon, 5);
    assert.equal(decoded.filters.maxTotalStreams, 15);
  });

  it('deve lidar com token inválido retornando configuração padrão', () => {
    const decoded = decodeConfig('token_invalido_123');
    assert.deepEqual(decoded.addons, []);
    assert.equal(decoded.filters.removeCams, true);
  });
});

describe('Filter & Quality Detection', () => {
  it('deve detectar resoluções corretamente', () => {
    assert.equal(extractResolution({ name: 'Torrentio\n4K HDR' }), '4k');
    assert.equal(extractResolution({ title: 'Fight Club 1999 1080p BluRay' }), '1080p');
    assert.equal(extractResolution({ title: 'Movie 720p WEB-DL' }), '720p');
    assert.equal(extractResolution({ title: 'Old show 480p DVD' }), '480p');
    assert.equal(extractResolution({ title: 'Unknown quality video' }), 'unknown');
  });

  it('deve identificar gravações CAM / TeleSync', () => {
    assert.equal(isCamStream({ title: 'Deadpool 3 CAMRip x264' }), true);
    assert.equal(isCamStream({ title: 'Movie 2024 HDCAM 720p' }), true);
    assert.equal(isCamStream({ title: 'Movie TELESYNC V2' }), true);
    assert.equal(isCamStream({ title: 'Fight Club 1080p BluRay x264' }), false);
  });

  it('deve filtrar streams por CAM e resolução', () => {
    const streams = [
      { name: 'Torrentio', title: 'Gladiator II 2024 CAMRip' },
      { name: 'Torrentio', title: 'Gladiator II 2024 1080p WEBRip' },
      { name: 'Torrentio', title: 'Gladiator II 2024 720p WEBRip' },
      { name: 'Torrentio', title: 'Gladiator II 2024 480p SD' }
    ];

    const filtered = filterStreams(streams, {
      removeCams: true,
      resolutions: ['1080p']
    });

    assert.equal(filtered.length, 1);
    assert.match(filtered[0].title, /1080p/);
  });

  it('deve filtrar por regex de exclusão', () => {
    const streams = [
      { name: 'Comet', title: 'Movie 1080p [ITA Dublado]' },
      { name: 'Comet', title: 'Movie 1080p Dual Audio Eng/Por' },
      { name: 'Comet', title: 'Movie 1080p Hindi Dub' }
    ];

    const filtered = filterStreams(streams, {
      excludeRegex: 'ita|hindi'
    });

    assert.equal(filtered.length, 1);
    assert.match(filtered[0].title, /Dual Audio/);
  });
});

describe('Deduplication & Badges', () => {
  it('deve desduplicar streams com o mesmo infoHash', () => {
    const streams = [
      { name: 'Torrentio', infoHash: 'abc123hash', title: 'Release 1' },
      { name: 'MediaFusion', infoHash: 'abc123hash', title: 'Release 1 (duplicado)' },
      { name: 'Comet', infoHash: 'def456hash', title: 'Release 2' }
    ];

    const deduplicated = deduplicateStreams(streams);
    assert.equal(deduplicated.length, 2);
    assert.equal(deduplicated[0].infoHash, 'abc123hash');
    assert.equal(deduplicated[1].infoHash, 'def456hash');
  });

  it('deve desduplicar streams com a mesma URL', () => {
    const streams = [
      { name: 'Direct 1', url: 'https://example.com/video.mp4?token=123' },
      { name: 'Direct 2', url: 'https://example.com/video.mp4?token=456' },
      { name: 'Direct 3', url: 'https://other.com/video2.mp4' }
    ];

    const deduplicated = deduplicateStreams(streams);
    assert.equal(deduplicated.length, 2);
  });

  it('deve enriquecer badges com o nome do addon', () => {
    const stream = { name: '1080p RealDebrid', title: 'Movie' };
    const enriched = enrichStreamBadge(stream, 'Torrentio', 'addon');
    assert.equal(enriched.name, '[Torrentio] 1080p RealDebrid');
  });
});

describe('Manifest Generator', () => {
  it('deve gerar manifest válido do Stremio', () => {
    const manifest = generateManifest({
      addons: [{ name: 'Torrentio', enabled: true }]
    });

    assert.equal(manifest.id, 'community.streamaggregator.unified');
    assert.ok(manifest.resources.some(r => r.name === 'stream'));
    assert.ok(manifest.types.includes('movie'));
    assert.ok(manifest.types.includes('series'));
  });
});

