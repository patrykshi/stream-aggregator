import { createHash } from 'node:crypto';
import path from 'node:path';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from '../config/json-store.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './url-helper.js';

const HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const MANIFEST_TIMEOUT_MS = 6000;
const MAX_HISTORY = 25;
const health = new Map();
const searches = new Map();
// Guardar apenas URLs de imagem validadas, por hash do manifesto. Assim o
// ícone permanece visível durante falhas temporárias e reinícios do contêiner.
const visuals = new Map();
let visualsLoadedFrom = null;
function artworkFile(){
  return path.join(resolveDataDir(),'addon-visuals.json');
}
function readArtworkCache(){
  const filename=artworkFile();
  if(filename===visualsLoadedFrom)return;
  visuals.clear();visualsLoadedFrom=filename;
  const doc=readJsonFile(filename,null);
  for(const [key,url] of Object.entries(doc||{})){
    if(/^[a-f0-9]{16}$/.test(key) && typeof url==='string' &&
       url.length<=1500 && url.startsWith('https://'))visuals.set(key,url);
  }
}
function writeArtworkCache(){
  try{
    writeAtomicJsonFile(artworkFile(),Object.fromEntries(visuals));
  }catch(error){
    console.warn('Cache de imagens de addon não atualizado:',error.message);
  }
}
export function manifestArtwork(manifest,manifestURL){
  for(const raw of [manifest?.logo,manifest?.icon]){
    if(typeof raw!=='string'||raw.length>1400||!raw.trim())continue;
    try{
      const u=new URL(raw,manifestURL);
      if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||
         u.hostname==='localhost'||u.hostname.endsWith('.local'))continue;
      if(/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.includes(':'))continue;
      if(u.href.length>1500)continue;
      return u.href;
    }catch{ /* A imagem inválida não pode comprometer a consulta. */ }
  }
  return null;
}

let lastCheckStarted = null;
let lastCheckFinished = null;
let checkRunning = null;
let latestSearch = null;

export function addonKey(url) {
  return createHash('sha256').update(String(url)).digest('hex').slice(0, 16);
}

function latencyStats(samples) {
  if (!samples?.length) return { averageMs: null, p95Ms: null, samples: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    averageMs: Math.round(sorted.reduce((n, v) => n + v, 0) / sorted.length),
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    samples: sorted.length
  };
}

export function recordSearch(addon, result) {
  const key = addonKey(addon.url);
  const old = searches.get(key) || { samples: [], requests: 0, results: 0, errors: 0, timeouts: 0 };
  const durationMs = Math.max(0, Math.round(result.durationMs ?? 0));
  old.samples.push(durationMs);
  if (old.samples.length > MAX_HISTORY) old.samples.shift();
  old.requests++;
  if (result.count > 0) old.results++;
  if (result.status === 'timeout') old.timeouts++;
  if (['timeout', 'http_error', 'network_error', 'invalid_response', 'invalid_url'].includes(result.status)) old.errors++;
  old.last = {
    at: new Date().toISOString(),
    status: result.status,
    durationMs,
    count: result.count ?? 0,
    httpStatus: result.httpStatus ?? null,
    resource: result.resource || 'stream',
    idConverted: Boolean(result.idConverted),
    delivered: result.delivered ?? 0
  };
  searches.set(key, old);
}

export function recordSearchDelivery(addon, delivered) {
  const item = searches.get(addonKey(addon.url));
  if (item?.last) item.last.delivered = delivered;
}

export function recordAggregate(info) {
  latestSearch = { at: new Date().toISOString(), ...info };
}

export async function checkAddons(getConfig, { force = false } = {}) {
  if (checkRunning) return checkRunning;
  if (!force && lastCheckFinished && Date.now() - Date.parse(lastCheckFinished) < HEALTH_INTERVAL_MS - 10000) {
    return null;
  }

  checkRunning = (async () => {
    lastCheckStarted = new Date().toISOString();
    const addons = getConfig()?.addons || [];
    readArtworkCache();
    let visualsChanged=false;
    let current = 0;
    const workers = Array.from({ length: Math.min(4, addons.length) }, async () => {
      while (current < addons.length) {
        const addon = addons[current++];
        const key = addonKey(addon.url);
        const started = Date.now();
        let status = 'offline', message = 'Sem resposta', httpStatus = null, resources = [];
        let catalogCount=0, addonId=null, declaredTypes=[];
        const parsed = parseAddonUrl(addon.url);
        if (!parsed) {
          status = 'invalid';
          message = 'URL inválida';
        } else {
          try {
            const response = await fetch(parsed.manifestUrl, {
              signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
              headers: DEFAULT_FETCH_HEADERS
            });
            httpStatus = response.status;
            if (!response.ok) {
              status = response.status === 429 ? 'rate_limited' : 'http_error';
              message = 'HTTP ' + response.status;
            } else {
              const manifest = await response.json();
              if (typeof manifest?.id !== 'string' || !Array.isArray(manifest.resources)) {
                status = 'invalid';
                message = 'Manifesto inválido';
              } else {
                const logo=manifestArtwork(manifest,parsed.manifestUrl);
                if((visuals.get(key)||null)!==logo){
                  if(logo)visuals.set(key,logo);
                  else visuals.delete(key);
                  visualsChanged=true;
                }
                resources = [...new Set(manifest.resources.map(r => typeof r === 'string' ? r : r?.name).filter(Boolean))];
                catalogCount=Array.isArray(manifest.catalogs)?manifest.catalogs.length:0;
                addonId=manifest.id;
                declaredTypes=Array.isArray(manifest.types)?manifest.types.filter(x=>typeof x==='string').slice(0,12):[];
                const wanted=addon.resources||['stream'];
                status=wanted.length===0||wanted.some(r=>resources.includes(r))?'online':'incompatible';
                message = status === 'online' ? 'Manifesto acessível' : 'Recursos selecionados não oferecidos';
              }
            }
          } catch (error) {
            status = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'offline';
            message = status === 'timeout' ? 'Tempo esgotado' : 'Sem conexão';
          }
        }
        const item = health.get(key) || { checks: 0, failures: 0, consecutiveFailures: 0 };
        item.checks++;
        if (status === 'online') {
          item.consecutiveFailures = 0;
        } else {
          item.failures++;
          item.consecutiveFailures++;
        }
        item.last = {
          at: new Date().toISOString(), status, message,
          httpStatus, resources,catalogCount,addonId,declaredTypes,
          durationMs: Date.now() - started
        };
        health.set(key, item);
      }
    });
    await Promise.all(workers);
    if(visualsChanged)writeArtworkCache();
    lastCheckFinished = new Date().toISOString();
  })().finally(() => { checkRunning = null; });
  return checkRunning;
}

// Não alterar enabled persistido: a suspensão é uma decisão operacional
// temporária que se recupera quando a origem volta a responder.
export function effectiveAddonState(addon){
  const configured=addon.enabled!==false;
  const last=health.get(addonKey(addon.url))?.last||null;
  const failed=Boolean(last && last.status!=='online');
  return {
    configuredEnabled:configured,
    effectiveEnabled:configured&&!failed,
    autoSuspended:configured&&failed,
    healthStatus:last?.status||'pending'
  };
}
export function effectiveConfig(config){
  if(!config||!Array.isArray(config.addons))return config;
  return {...config,addons:config.addons.map(a=>({
    ...a,enabled:effectiveAddonState(a).effectiveEnabled
  }))};
}
export function monitorRevision(){
  return [...health.entries()].map(([key,item])=>key+':'+item.last?.status).sort().join('|');
}
export function startMonitor(getConfig, onCheck = ()=>{}) {
  const perform=async()=>{
    const previous=monitorRevision();
    await checkAddons(getConfig);
    if(previous!==monitorRevision())onCheck();
  };
  const initial = setTimeout(() => { void perform().catch(err => console.warn('Monitor:', err.message)); }, 3000);
  initial.unref();
  const timer = setInterval(() => { void perform().catch(err => console.warn('Monitor:', err.message)); }, HEALTH_INTERVAL_MS);
  timer.unref();
}

export function getMonitorReport(config) {
  readArtworkCache();
  const items = (config?.addons || []).map(addon => {
    const key = addonKey(addon.url);
    const h = health.get(key);
    const s = searches.get(key);
    return {
      key,
      name: addon.name,
      artworkUrl: visuals.get(key) || null,
      enabled: addon.enabled !== false,
      ...effectiveAddonState(addon),
      resources: addon.resources || ['stream'],
      configuredTimeoutMs: Number.isInteger(addon.requestTimeoutMs)
        ? Math.min(Math.max(addon.requestTimeoutMs,3000),30000) : 7500,
      health: h ? { ...h.last, checks: h.checks, failures: h.failures, consecutiveFailures: h.consecutiveFailures } : null,
      search: s ? {
        ...s.last,
        ...latencyStats(s.samples),
        requests: s.requests,
        results: s.results,
        errors: s.errors,
        timeouts: s.timeouts
      } : null
    };
  });
  return {
    intervalSeconds: HEALTH_INTERVAL_MS / 1000,
    lastCheckStarted,
    lastCheckFinished,
    checking: Boolean(checkRunning),
    latestSearch,
    items
  };
}
