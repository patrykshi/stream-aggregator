import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../public/app.js';
import {
  isLocalEditorRequest,
  validateAddonManifestOnServer,
  buildAddonFetchHeaders,
  ADDON_USER_AGENT,
  DEFAULT_FETCH_HEADERS,
  MANIFEST_FETCH_PROFILES
} from '../src/aggregator/url-helper.js';
import { checkAddons } from '../src/aggregator/monitor.js';

const {
  validateAddonManifestUrl,
  applyAddonUrlFeedback,
  bindAddonUrlLiveValidation
} = globalThis.NuvioAddonValidator || {};

function createMockElement(initialValue = '') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  return {
    value: initialValue,
    textContent: '',
    disabled: false,
    dataset: {},
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: c => classes.has(c)
    },
    setAttribute: (k, v) => attrs.set(k, v),
    getAttribute: k => attrs.get(k),
    removeAttribute: k => attrs.delete(k),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch: type => {
      for (const fn of listeners.get(type) || []) fn({ type, target: this });
    },
    focus: () => {}
  };
}

describe('Validador unificado de URL de addon (public/app.js)', () => {
  it('expõe validateAddonManifestUrl, applyAddonUrlFeedback e bindAddonUrlLiveValidation no escopo global', () => {
    assert.equal(typeof validateAddonManifestUrl, 'function');
    assert.equal(typeof globalThis.validateAddonManifestUrl, 'function');
    assert.equal(typeof applyAddonUrlFeedback, 'function');
    assert.equal(typeof bindAddonUrlLiveValidation, 'function');
  });

  it('valida URL canônica HTTPS terminando em /manifest.json', () => {
    const res = validateAddonManifestUrl('https://torrentio.strem.fun/providers=yts/manifest.json?key=1');
    assert.equal(res.valid, true);
    assert.equal(res.status, 'valid');
    assert.equal(res.normalizedUrl, 'https://torrentio.strem.fun/providers=yts/manifest.json?key=1');
    assert.match(res.message, /torrentio\.strem\.fun/);
  });

  it('normaliza protocolo stremio://, domínio sem protocolo e sufixo /manifest.json ausente', () => {
    const fromStremio = validateAddonManifestUrl('stremio://bestcine.online/manifest.json');
    assert.equal(fromStremio.valid, true);
    assert.equal(fromStremio.status, 'normalized');
    assert.equal(fromStremio.normalizedUrl, 'https://bestcine.online/manifest.json');

    const withoutManifest = validateAddonManifestUrl('https://bestcine.online/custom-token/');
    assert.equal(withoutManifest.valid, true);
    assert.equal(withoutManifest.status, 'normalized');
    assert.equal(withoutManifest.normalizedUrl, 'https://bestcine.online/custom-token/manifest.json');

    const bareDomain = validateAddonManifestUrl('opensubtitles-v3.strem.fun');
    assert.equal(bareDomain.valid, true);
    assert.equal(bareDomain.status, 'normalized');
    assert.equal(bareDomain.normalizedUrl, 'https://opensubtitles-v3.strem.io/manifest.json');
  });

  it('rejeita URL vazia, HTTP inseguro, protocolos inválidos, hosts locais e outros arquivos JSON', () => {
    assert.equal(validateAddonManifestUrl('   ').valid, false);
    assert.equal(validateAddonManifestUrl('   ').status, 'empty');

    const httpRes = validateAddonManifestUrl('http://addon.example.com/manifest.json');
    assert.equal(httpRes.valid, false);
    assert.equal(httpRes.status, 'insecure');

    const badProto = validateAddonManifestUrl('javascript:alert(1)');
    assert.equal(badProto.valid, false);
    assert.equal(badProto.status, 'invalid-protocol');

    for (const localUrl of [
      'https://localhost/manifest.json',
      'https://127.0.0.1:7001/manifest.json',
      'https://192.168.1.50/manifest.json',
      'https://servidor.local/manifest.json'
    ]) {
      const localRes = validateAddonManifestUrl(localUrl);
      assert.equal(localRes.valid, false, `Deveria rejeitar ${localUrl}`);
      assert.equal(localRes.status, 'local-host');
    }

    const otherJson = validateAddonManifestUrl('https://stream.patrykrocha.com/collections.json');
    assert.equal(otherJson.valid, false);
    assert.equal(otherJson.status, 'not-manifest');
  });

  it('rejeita addon duplicado já presente na lista do perfil', () => {
    const existing = [{ url: 'https://torrentio.strem.fun/manifest.json', name: 'Torrentio' }];
    const dup = validateAddonManifestUrl('stremio://torrentio.strem.fun', existing);
    assert.equal(dup.valid, false);
    assert.equal(dup.status, 'duplicate');
    assert.equal(dup.normalizedUrl, 'https://torrentio.strem.fun/manifest.json');
  });

  it('atualiza feedback visual do formulário alternando entre is-neutral, is-valid e is-error', () => {
    const inputEl = createMockElement('');
    const feedbackEl = createMockElement();

    const empty = applyAddonUrlFeedback(inputEl, feedbackEl, '', []);
    assert.equal(empty.valid, false);
    assert.equal(feedbackEl.classList.contains('is-neutral'), true);
    assert.equal(feedbackEl.classList.contains('is-valid'), false);
    assert.equal(feedbackEl.classList.contains('is-error'), false);

    inputEl.value = 'stremio://meuaddon.org';
    const ok = applyAddonUrlFeedback(inputEl, feedbackEl, inputEl.value, [], { normalizeInput: true });
    assert.equal(ok.valid, true);
    assert.equal(inputEl.value, 'https://meuaddon.org/manifest.json');
    assert.equal(inputEl.classList.contains('is-valid'), true);
    assert.equal(feedbackEl.classList.contains('is-valid'), true);
    assert.equal(feedbackEl.classList.contains('is-neutral'), false);
    assert.equal(feedbackEl.classList.contains('is-error'), false);
    assert.equal(inputEl.getAttribute('aria-invalid'), 'false');

    const bad = applyAddonUrlFeedback(inputEl, feedbackEl, 'http://inseguro.org/manifest.json', []);
    assert.equal(bad.valid, false);
    assert.equal(inputEl.classList.contains('is-invalid'), true);
    assert.equal(feedbackEl.classList.contains('is-error'), true);
    assert.equal(feedbackEl.classList.contains('is-valid'), false);
    assert.equal(inputEl.getAttribute('aria-invalid'), 'true');
  });

  it('executa validação com debounce no evento input, verifica acessibilidade, autopreenche nome e controla botão', async () => {
    const urlInput = createMockElement('');
    const nameInput = createMockElement('');
    const feedbackEl = createMockElement();
    const submitBtn = createMockElement();
    const remoteCalls = [];

    bindAddonUrlLiveValidation({
      urlInput,
      nameInput,
      feedbackEl,
      submitBtn,
      existingAddons: () => [],
      debounceMs: 40,
      validateRemote: async url => {
        remoteCalls.push(url);
        if (url.includes('offline.example')) {
          return { valid: false, error: 'O servidor retornou HTTP 503' };
        }
        return {
          valid: true,
          name: 'Provedor Oficial',
          resources: ['stream', 'catalog'],
          catalogs: [{ id: 'top', type: 'movie' }]
        };
      }
    });

    // Inicialmente o botão deve estar desabilitado
    assert.equal(submitBtn.disabled, true);

    // 1. Digitação rápida: deve cancelar timers anteriores e permanecer em is-neutral antes do debounce
    urlInput.value = 'https://';
    urlInput.dispatch('input');
    assert.equal(feedbackEl.classList.contains('is-neutral'), true);
    assert.equal(submitBtn.disabled, true);

    urlInput.value = 'stremio://provedor.example';
    urlInput.dispatch('input');
    assert.equal(remoteCalls.length, 0, 'Não deve chamar servidor antes do debounce');

    // Aguarda debounce (40ms + margem)
    await new Promise(r => setTimeout(r, 70));

    assert.equal(remoteCalls.length, 1);
    assert.equal(remoteCalls[0], 'https://provedor.example/manifest.json');
    assert.equal(feedbackEl.classList.contains('is-valid'), true);
    assert.equal(feedbackEl.classList.contains('is-neutral'), false);
    assert.equal(feedbackEl.classList.contains('is-error'), false);
    assert.equal(nameInput.value, 'Provedor Oficial', 'Deve autopreencher o nome quando vazio');
    assert.equal(submitBtn.disabled, false, 'Deve habilitar o botão após validação remota positiva');

    // 2. Se o usuário digitar um nome próprio, não deve sobrescrever na próxima validação
    nameInput.value = 'Meu Nome Customizado';
    urlInput.value = 'https://outro.example/manifest.json';
    urlInput.dispatch('input');
    assert.equal(submitBtn.disabled, true, 'Deve desabilitar botão enquanto valida nova URL');
    await new Promise(r => setTimeout(r, 70));
    assert.equal(feedbackEl.classList.contains('is-valid'), true);
    assert.equal(nameInput.value, 'Meu Nome Customizado');
    assert.equal(submitBtn.disabled, false);

    // 3. URL com erro de sintaxe após debounce -> is-error sem chamar validateRemote
    const callsBeforeInvalid = remoteCalls.length;
    urlInput.value = 'http://inseguro.example/manifest.json';
    urlInput.dispatch('input');
    await new Promise(r => setTimeout(r, 70));
    assert.equal(remoteCalls.length, callsBeforeInvalid, 'Não deve consultar servidor quando sintaxe falha');
    assert.equal(feedbackEl.classList.contains('is-error'), true);
    assert.equal(submitBtn.disabled, true);

    // 4. URL com sintaxe válida mas inacessível na origem -> is-error
    urlInput.value = 'https://offline.example/manifest.json';
    urlInput.dispatch('input');
    await new Promise(r => setTimeout(r, 70));
    assert.equal(feedbackEl.classList.contains('is-error'), true);
    assert.match(feedbackEl.textContent, /HTTP 503/);
    assert.equal(submitBtn.disabled, true);
  });

  it('orienta o usuário quando a URL aponta para collections.json em vez de manifest.json', () => {
    const colRes = validateAddonManifestUrl('https://stream.patrykrocha.com/collections.json');
    assert.equal(colRes.valid, false);
    assert.equal(colRes.status, 'not-manifest');
    assert.match(colRes.message, /Coleções → Importar JSON/);
  });

  it('permite POST local e proxy de preview em isLocalEditorRequest, bloqueando Cloudflare Tunnel e origens externas', () => {
    // Loopback direto
    assert.equal(isLocalEditorRequest({
      headers: { host: '127.0.0.1:7001', origin: 'http://127.0.0.1:7001' }
    }, 7001), true);

    // Proxy local de preview (Nginx -> localhost:3000 com X-Forwarded-Host autenticado)
    assert.equal(isLocalEditorRequest({
      headers: {
        host: 'localhost:3000',
        origin: 'https://ais-dev-yvvc33zdqgn56vifkpdpjq-487571618487.us-east1.run.app',
        'x-forwarded-host': 'ais-dev-yvvc33zdqgn56vifkpdpjq-487571618487.us-east1.run.app'
      }
    }, 3000), true);

    // Bloqueia se vier pelo Cloudflare Tunnel (cf-connecting-ip presente)
    assert.equal(isLocalEditorRequest({
      headers: {
        host: 'localhost:3000',
        'cf-connecting-ip': '203.0.113.10',
        origin: 'https://ais-dev-yvvc33zdqgn56vifkpdpjq-487571618487.us-east1.run.app',
        'x-forwarded-host': 'ais-dev-yvvc33zdqgn56vifkpdpjq-487571618487.us-east1.run.app'
      }
    }, 3000), false);

    // Bloqueia origem externa não correspondente (CSRF protection)
    assert.equal(isLocalEditorRequest({
      headers: {
        host: 'localhost:3000',
        origin: 'https://evil.example.com',
        'x-forwarded-host': 'ais-dev-yvvc33zdqgn56vifkpdpjq-487571618487.us-east1.run.app'
      }
    }, 3000), false);
  });

  it('validateAddonManifestOnServer rotaciona User-Agent quando recebe HTTP 403 e envia cabeçalho Authorization', async () => {
    const seenHeaders = [];
    const res = await validateAddonManifestOnServer('https://protected.example/manifest.json', {
      authorization: 'secret-token-123',
      fetchImpl: async (_url, opts) => {
        seenHeaders.push(opts.headers);
        if (seenHeaders.length === 1) {
          return { ok: false, status: 403 };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'org.protected.addon',
            name: 'Addon Protegido',
            resources: ['stream', 'subtitles'],
            catalogs: []
          })
        };
      }
    });

    assert.equal(seenHeaders.length, 2, 'Deve tentar o segundo perfil de User-Agent após 403 inicial');
    assert.ok(seenHeaders[0]['User-Agent'].includes('NuvioHub/1.0'));
    assert.ok(seenHeaders[0]['User-Agent'].includes('Chrome/'));
    assert.ok(seenHeaders[1]['User-Agent'].includes('NuvioHub/1.0'));
    assert.ok(seenHeaders[1]['User-Agent'].includes('Stremio/'));
    assert.equal(seenHeaders[0]['Authorization'], 'Bearer secret-token-123');
    assert.equal(seenHeaders[1]['Authorization'], 'Bearer secret-token-123');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.name, 'Addon Protegido');
    assert.deepEqual(res.body.resources, ['stream', 'subtitles']);

    // Testa extração de Basic Auth embutida na URL pelo buildAddonFetchHeaders
    const basicHeaders = buildAddonFetchHeaders('https://usuario:senha123@privado.example/manifest.json');
    assert.match(basicHeaders['Authorization'], /^Basic /);
    assert.match(basicHeaders['User-Agent'], /NuvioHub\/1\.0/);
  });

  it('inclui o User-Agent customizado NuvioHub/1.0 em todas as requisições de manifesto (DEFAULT_FETCH_HEADERS, perfis e monitor)', async () => {
    assert.match(ADDON_USER_AGENT, /NuvioHub\/1\.0/);
    assert.match(DEFAULT_FETCH_HEADERS['User-Agent'], /NuvioHub\/1\.0/);
    for (const profile of MANIFEST_FETCH_PROFILES) {
      assert.match(profile['User-Agent'], /NuvioHub\/1\.0/);
    }

    const prevFetch = globalThis.fetch;
    let monitorHeaders = null;
    globalThis.fetch = async (_url, opts) => {
      monitorHeaders = opts?.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'test.addon', name: 'Test Addon', resources: ['stream'] })
      };
    };
    try {
      await checkAddons(() => ({
        addons: [{ url: 'https://addon-ua-test.example/manifest.json', name: 'UA Test', enabled: true, resources: ['stream'] }]
      }), { force: true });
      assert.ok(monitorHeaders, 'Monitor deve enviar headers na requisição de manifesto');
      assert.match(monitorHeaders['User-Agent'], /NuvioHub\/1\.0/);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});


