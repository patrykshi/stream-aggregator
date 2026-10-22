/** End-to-end visual smoke test. Runs an isolated fixture, never loads the live data directory. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvio-tv-qa-'));
const dataDir = path.join(sandbox, 'data');
const profileDir = path.join(sandbox, 'chrome');
fs.mkdirSync(dataDir, {recursive: true, mode: 0o700});
const metas = Array.from({length: 28}, (_, i) => ({
  id: `tt${String(9200000 + i)}`, type: 'movie', name: `QA Filme ${String(i + 1).padStart(2, '0')}`,
  year: 2024 + i % 3, poster: '', description: `Descrição do filme ${i + 1}.`
}));
fs.writeFileSync(path.join(dataDir, 'studio-import.json'), JSON.stringify({
  revision: 1, importedAt: new Date().toISOString(), stats: {},
  manifest: {id: 'nuvio.studio', name: 'Biblioteca QA', catalogs: [{
    id: 'qa-movies', addonId: 'nuvio.studio', name: 'Filmes para QA', type: 'movie', manual: true, metas
  }]},
  collections: [{id: 'qa-group', title: 'Coleção de Teste', folders: [{
    id: 'qa-folder', title: 'Filmes QA', tileShape: 'LANDSCAPE',
    catalogSources: [{addonId: 'nuvio.studio', type: 'movie', catalogId: 'qa-movies', title: 'Filmes para QA'}]
  }]}]
}), {mode: 0o600});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (fn, label, attempts = 120) => {
  for (let i = 0; i < attempts; i++) {
    try { const value = await fn(); if (value) return value; } catch {}
    await sleep(150);
  }
  throw Error('Timeout: ' + label);
};
const openPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const {port} = server.address(); server.close(() => resolve(port));
  });
});
let backend, chrome, ws;
try {
  const port = await openPort();
  const debuggerPort = await openPort();
  const publicPort = await openPort();
  const base = `http://127.0.0.1:${port}`;
  backend = spawn(process.execPath, ['src/server.js'], {
    cwd: root, env: {...process.env, PORT: String(port), BIND_HOST: '127.0.0.1', PUBLIC_PORT: String(publicPort), DATA_DIR: dataDir},
    stdio: 'ignore'
  });
  await wait(async () => (await fetch(base + '/health')).ok, 'isolated backend');
  const readonly = `http://127.0.0.1:${publicPort}`;
  await wait(async () => (await fetch(readonly + '/health')).ok, 'isolated public ingress');
  assert.equal((await fetch(readonly + '/manifest.json')).status, 200, 'public manifest');
  assert.equal((await fetch(readonly + '/collections.json')).status, 200, 'public collections');
  for (const route of ['/api/profiles/main', '/api/hub/workspace', '/api/hub/settings']) {
    const r = await fetch(readonly + route, {headers: {Host: `localhost:${port}`}});
    assert.equal(r.status, 404, `Public ingress must block ${route}`);
  }
  assert.equal((await fetch(readonly + '/manifest.json', {method: 'POST'})).status, 404);

  const chromeBinary = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  chrome = spawn(chromeBinary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--remote-allow-origins=*', `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`, 'about:blank'], {stdio: 'ignore'});
  const tab = await wait(async () => {
    const response = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`);
    return (await response.json()).find(x => x.type === 'page');
  }, 'Chrome DevTools');
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const pending = new Map(); let serial = 0;
  const requests = [], errors = [];
  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.id && pending.has(data.id)) {
      const {resolve, reject} = pending.get(data.id); pending.delete(data.id);
      data.error ? reject(Error(data.error.message)) : resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown')
      errors.push(data.params.exceptionDetails?.text || 'Unexpected browser exception');
    if (data.method === 'Network.requestWillBeSent' && /^(POST|PUT|PATCH|DELETE)$/.test(data.params.request.method))
      requests.push({method: data.params.request.method, path: new URL(data.params.request.url).pathname});
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
  const ev = async expression => {
    const res = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };
  const click = selector => ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing ${selector}');el.click();return true})()`);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 1360, height: 920, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: base + '/?view=collections'});
  await wait(() => ev("document.querySelector('[data-action=preview-open]') !== null"), 'collections editor');
  await click('[data-action=preview-open]');
  await wait(() => ev("document.querySelector('.nuvio-preview-rails-container') !== null"), 'TV home');
  assert.equal(await ev("document.body.textContent.includes('The Last of Us')"), false, 'No unrelated demo titles');
  assert.equal(await ev("document.querySelectorAll('.nuvio-preview-rail-block').length"), 1);
  for (const mode of ['classic','grid','modern']) {
    await click(`[data-pv-action=layout][data-value=${mode}]`);
    await wait(() => ev(`document.querySelector('.nuvio-preview-device')?.classList.contains('layout-${mode}')`), 'mode '+mode);
    assert.equal(await ev("document.querySelectorAll('.nuvio-preview-rail-block').length"),1);
  }

  await click('[data-pv-action=folder]');
  await wait(() => ev("document.querySelectorAll('.nuvio-preview-title').length===12"), 'first poster page');
  assert.equal(await ev("document.querySelector('.nuvio-preview-title strong')?.textContent"), 'QA Filme 01');
  await click('[data-pv-action=next]');
  await wait(() => ev("document.querySelector('.nuvio-preview-title strong')?.textContent==='QA Filme 13'"), 'second poster page');
  await click('[data-pv-action=previous]');
  await wait(() => ev("document.querySelector('.nuvio-preview-title strong')?.textContent==='QA Filme 01'"), 'previous poster page');
  await click('[data-pv-action=analyze]');
  assert.equal(await ev("!!document.querySelector('.nuvio-preview-inspector')"), true);
  await click('[data-pv-action=device][data-value=mobile]');
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await sleep(200);
  const mobile = await ev("({width:innerWidth,scroll:document.documentElement.scrollWidth,device:Math.ceil(document.querySelector('.nuvio-preview-device').getBoundingClientRect().width)})");
  assert.ok(mobile.scroll <= mobile.width + 1 && mobile.device <= mobile.width + 1, JSON.stringify(mobile));
  await click('[data-pv-action=title]');
  await wait(() => ev("document.querySelector('.nuvio-preview-title-detail') !== null"), 'title details');
  await click('[data-pv-action=back]');
  await click('[data-pv-action=edit-selection]');
  await wait(() => ev("document.querySelector('.nuvio-preview-root') === null"), 'return to editor');
  assert.ok(requests.length >= 1, 'Preview should load title samples');
  assert.deepEqual(requests.filter(x => x.path !== '/api/hub/preview/catalog-items'), [], 'No writes to workspace');
  assert.deepEqual(errors, [], 'Browser JS exceptions');
  await click('[data-group]');
  await wait(() => ev("!!document.querySelector('[data-action=open-artwork-studio][data-target=group]')"), 'group editor');
  await click('[data-action=open-artwork-studio][data-target=group]');
  await wait(() => ev("!!document.querySelector('#artMarkMode')"), 'Artwork Studio editor');
  assert.equal(await ev("document.querySelector('#artMarkMode').value"),'none');
  await click('[data-art-mode=preset]');
  assert.equal(await ev("Array.from(document.querySelectorAll('.artwork-preset-badge')).every(el=>!el.textContent.trim())"),true,
    'Streaming preset cannot show simulated logos');
  await ev("(()=>{const e=document.querySelector('#artMarkMode');e.value='text';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await wait(() => ev("!document.querySelector('#artMarkTextBox').hidden"), 'Keyboard symbol editor');
  await click('[data-art-glyph="★"]');
  assert.equal(await ev("document.querySelector('#artBadgeInput').value"),'★');
  await ev("(()=>{const e=document.querySelector('#artMarkMode');e.value='draw';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await ev("!!document.querySelector('#artIconCanvas')"),true);
  await click('[data-art-mode=ai]');
  await sleep(200);
  assert.equal(requests.some(x=>x.path==='/api/hub/artwork/generate-ai'),false,
    'AI billing must only happen after explicit click');
  assert.match(await ev("document.querySelector('#artPaneAi').innerText"),/Gemini/);
  await click('[data-art-mode=python]');
  await wait(() => ev("!document.querySelector('#artPanePython').hidden"), 'Original Python cover engine');
  assert.equal(await ev("!!document.querySelector('#artPythonColor')"),true);
  await click('#modalCancel');
  await wait(() => ev("document.querySelector('#modal').hidden"), 'close Artwork Studio');

  await click('[data-view=settings]');
  await wait(() => ev("document.querySelector('#catalogAutoRefresh') !== null"), 'refresh settings');
  assert.equal(await ev("document.querySelector('#catalogAutoRefresh').checked"),false,'Refresh opt-in default');
  assert.equal(await ev("document.querySelector('[data-action=catalog-refresh-preview]') !== null"),true);

  console.log(JSON.stringify({success: true, home: 1, loadedPages: 2, itemsPerPage: 12,
    mobile, apiRequests: requests.length, writesToLibrary: 0, javascriptErrors: 0}));
} finally {
  try { ws?.close(); } catch {}
  try { chrome?.kill('SIGTERM'); } catch {}
  try { backend?.kill('SIGTERM'); } catch {}
  await sleep(200);
  fs.rmSync(sandbox, {recursive: true, force: true});
}
