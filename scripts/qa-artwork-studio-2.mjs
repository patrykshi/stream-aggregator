/** Visual and functional smoke test for Artwork Studio 2.0 in Headless Chrome via CDP. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvio-studio2-qa-'));
const dataDir = path.join(sandbox, 'data');
const profileDir = path.join(sandbox, 'chrome');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

fs.writeFileSync(path.join(dataDir, 'studio-import.json'), JSON.stringify({
  revision: 1,
  importedAt: new Date().toISOString(),
  stats: {},
  manifest: {
    id: 'nuvio.studio',
    name: 'Biblioteca QA',
    catalogs: [{
      id: 'qa-movies',
      addonId: 'nuvio.studio',
      name: 'Filmes QA',
      type: 'movie',
      manual: true,
      metas: [{ id: 'tt1', name: 'Filme 1', type: 'movie' }]
    }]
  },
  collections: [{
    id: 'qa-group',
    title: 'Coleção Teste',
    folders: [{
      id: 'qa-folder',
      title: 'Minha Pasta QA',
      tileShape: 'LANDSCAPE',
      catalogSources: [{ addonId: 'nuvio.studio', type: 'movie', catalogId: 'qa-movies' }]
    }]
  }]
}), { mode: 0o600 });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (fn, label, attempts = 100) => {
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await sleep(150);
  }
  throw Error('Timeout: ' + label);
};

const openPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

let backend, chrome, ws;
try {
  const port = await openPort();
  const debuggerPort = await openPort();
  const base = `http://127.0.0.1:${port}`;

  backend = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      NODE_ENV: 'test'
    },
    stdio: 'ignore'
  });

  await wait(async () => {
    const res = await fetch(`${base}/health`).catch(() => null);
    return res && res.ok;
  }, 'backend startup');

  const chromeBinary = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  chrome = spawn(chromeBinary, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const tab = await wait(async () => {
    const res = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`).catch(() => null);
    if (!res || !res.ok) return null;
    const list = await res.json();
    return list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  }, 'chrome startup');

  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let idSeq = 1;
  const pending = new Map();
  const errors = [];

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Exception';
      errors.push(desc);
      console.log('Browser exception:', desc);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = idSeq++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: base + '/?view=collections' });

  const ev = async expr => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };

  const click = async sel => {
    const ok = await ev(`(()=>{ const el = document.querySelector(${JSON.stringify(sel)}); if(el){ el.click(); return true; } return false; })()`);
    if (!ok) throw Error(`Element not found for click: ${sel}`);
  };

  // 1. Wait for collections view to load
  await wait(() => ev("document.querySelector('[data-action=preview-open]') !== null"), 'collections editor');
  await wait(() => ev("document.querySelector('[data-group]') !== null"), 'group in list');

  // 2. Click collection group to open its editor
  await click('[data-group]');
  await wait(() => ev("!!document.querySelector('[data-action=open-artwork-studio-v2][data-target=group]')"), 'group editor');

  // 3. Click primary "✦ Criar capa (Studio 2.0)"
  await click('[data-action=open-artwork-studio-v2][data-target=group]');
  await wait(() => ev("!document.getElementById('artworkStudioWorkspace')?.hidden"), 'Studio 2.0 Workspace open');

  // 5. Verify Workspace components
  assert.equal(await ev("!!document.querySelector('.artwork-topbar')"), true, 'Topbar exists');
  assert.equal(await ev("!!document.querySelector('.artwork-tool-rail')"), true, 'Left tool rail exists');
  assert.equal(await ev("!!document.querySelector('.artwork-tool-drawer')"), true, 'Tool drawer exists');
  assert.equal(await ev("!!document.querySelector('.artwork-right-sidebar')"), true, 'Right sidebar exists');
  assert.equal(await ev("!!document.getElementById('artworkFabricCanvas')"), true, 'Fabric canvas mounted');

  // 6. Test Shape change in Studio 2.0
  await click('[data-art-shape=POSTER]');
  await sleep(150);
  assert.equal(await ev("document.querySelector('[data-art-shape=POSTER]').classList.contains('active')"), true, 'Poster active');

  // 7. Test Nuvio Preview mode switch
  await click('#artBtnViewNuvio');
  await sleep(200);
  assert.equal(await ev("!document.getElementById('artworkNuvioSimView')?.hidden"), true, 'Nuvio simulation visible');

  // 8. Test TV simulation sub-mode
  await click('[data-nuvio-sub=tv]');
  await sleep(250);
  assert.equal(await ev("!!document.querySelector('.nuvio-sim-tv-bezel')"), true, 'TV bezel rendered');

  // 9. Return to Editor
  await click('#artBtnViewEditor');
  await sleep(150);
  assert.equal(await ev("document.getElementById('artworkNuvioSimView')?.hidden"), true, 'Editor view active');

  // 10. Close Studio and confirm clean return
  await click('#artBtnBack');
  await sleep(150);
  assert.equal(await ev("document.getElementById('artworkStudioWorkspace')?.hidden"), true, 'Studio closed cleanly');

  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(JSON.stringify({ success: true, studioVersion: '2.0', testCount: 10, errors: 0 }));
} finally {
  try { ws?.close(); } catch {}
  try { chrome?.kill('SIGTERM'); } catch {}
  try { backend?.kill('SIGTERM'); } catch {}
  await sleep(200);
  fs.rmSync(sandbox, { recursive: true, force: true });
}
