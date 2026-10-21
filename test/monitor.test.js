import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addonKey, checkAddons, getMonitorReport, recordAggregate, recordSearch, recordSearchDelivery } from '../src/aggregator/monitor.js';
import { deduplicateStreams, enrichStreamBadge } from '../src/aggregator/filter.js';

describe('Monitoramento de provedores', () => {
  const a = { url: 'https://teste-monitor.example/secret/manifest.json', name: 'Teste A', resources: ['stream'], enabled: true };
  const b = { url: 'https://teste-monitor-outro.example/manifest.json', name: 'Teste B', resources: ['stream'], enabled: false };

  it('mantém identificador anônimo estável sem publicar URL privada', () => {
    assert.equal(addonKey(a.url), addonKey(a.url));
    assert.notEqual(addonKey(a.url), addonKey(b.url));
    const report = getMonitorReport({ addons: [a] });
    assert.equal(report.items[0].enabled, true);
    assert.equal(report.items[0].key.length, 16);
    assert.equal(JSON.stringify(report).includes('/secret/'), false);
  });

  it('distingue online de incompatível, inclusive addon desativado', async () => {
    const before = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('outro')) return { ok: true, status: 200, json: async () => ({ id: 'any', resources: ['catalog'] }) };
      return { ok: true, status: 200, json: async () => ({ id: 'demo', resources: [{ name: 'stream' }] }) };
    };
    try {
      await checkAddons(() => ({ addons: [a,b] }), { force: true });
      const result = getMonitorReport({ addons: [a,b] });
      assert.equal(result.items[0].health.status, 'online');
      assert.equal(result.items[1].health.status, 'incompatible');
      assert.equal(result.items[1].enabled, false);
    } finally {
      globalThis.fetch = before;
    }
  });

  it('registra tempo bruto, percentil, erro e fontes entregues', () => {
    recordSearch(a, { status: 'results', durationMs: 230, count: 5, idConverted: true });
    recordSearchDelivery(a, 2);
    recordSearch(b, { status: 'timeout', durationMs: 7500, count: 0 });
    recordAggregate({ type: 'movie', activeProviders: 1, delivered: 2, durationMs: 7500 });
    const status = getMonitorReport({ addons: [a,b] });
    assert.equal(status.items[0].search.delivered, 2);
    assert.equal(status.items[0].search.averageMs, 230);
    assert.equal(status.items[0].search.idConverted, true);
    assert.equal(status.items[1].search.timeouts, 1);
    assert.equal(status.latestSearch.delivered, 2);
  });
});

describe('Identificação visual no Nuvio', () => {
  it('identifica provedor em name e title sem apagar resolução', () => {
    const s = enrichStreamBadge({ name: '1080p', title: 'Filme 1080p' }, 'BestCine', 'addon');
    assert.match(s.name, /BestCine/);
    assert.match(s.title, /BestCine/);
    assert.match(s.title, /1080p/);
    assert.equal(enrichStreamBadge(s, 'BestCine', 'addon').name, s.name);
  });

  it('apresenta origem em texto simples e detalhes compativeis com Nuvio Legacy', () => {
    const original = {
      name: 'Emby 🌐',
      title: 'Filme 1080p',
      url: 'https://example.com/video.mkv'
    };
    const tagged = enrichStreamBadge(original, 'Emby (Patryk)', 'addon');
    assert.match(tagged.name, /^Agregador \| Emby \(Patryk\) \| Emby/);
    assert.match(tagged.title, /^Agregador \| Emby \(Patryk\) \| Filme 1080p/);
    assert.match(tagged.description, /^Origem: Emby \(Patryk\)\nFilme 1080p/);
    assert.equal(tagged.url, original.url);
    assert.equal(enrichStreamBadge(tagged, 'Emby (Patryk)', 'addon').description, tagged.description);
    assert.equal(original.description, undefined);
  });

  it('mantem a descricao existente e acrescenta origem no inicio', () => {
    const tagged = enrichStreamBadge({
      name: 'BestCine 720p',
      description: 'Liberacao WebDL\nTamanho 3.2 GB',
      infoHash: 'abc123'
    }, 'BestCine', 'addon');
    assert.equal(tagged.name, 'Agregador | BestCine | BestCine 720p');
    assert.equal(tagged.description, 'Origem: BestCine\nLiberacao WebDL\nTamanho 3.2 GB');
    assert.equal(tagged.infoHash, 'abc123');
  });

  it('preserva duas origens distintas para a mesma fonte, mas remove repetição interna', () => {
    const streams = [
      { name: 'Fonte 1', infoHash: 'a' },
      { name: 'Fonte 2', infoHash: 'a' },
      { name: 'Fonte 3', infoHash: 'a' }
    ];
    const result = deduplicateStreams(streams, x => x.name === 'Fonte 3' ? 'addonB' : 'addonA');
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Fonte 1');
    assert.equal(result[1].name, 'Fonte 3');
  });
});
