import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.env.DATA_DIR || path.resolve('data');
const OUT = path.join(ROOT, 'cover-adapter');
const INDEX_FILE = path.join(OUT, 'index.json');
const HOST = process.env.PUBLIC_BASE_URL || 'https://stream.patrykrocha.com';
const LIMIT_BYTES = 7 * 1024 * 1024;
const DISK_LIMIT = 400 * 1024 * 1024;
const TTL = 2 * 60 * 60 * 1000;
const SHAPES = Object.freeze({
  LANDSCAPE: { width:960, height:540 },
  POSTER: { width:600, height:900 },
  PORTRAIT: { width:675, height:900 },
  SQUARE: { width:800, height:800 }
});
// Sem provedor de imagens obrigatório: apenas hospedeiros públicos conhecidos.
const ALLOWED_HOSTS = new Set(['image.tmdb.org','images.unsplash.com','raw.githubusercontent.com','i.imgur.com']);
const sha = input => crypto.createHash('sha256').update(input).digest('hex').slice(0,32);
const entries = new Map();
const inflight = new Map();
// A TV pode pedir dezenas de capas simultaneamente; limite a concorrência
// para preservar a memória de 512 MB e a CPU de 0,5 núcleo do container.
const waiting = [];
let activeJobs = 0;
const MAX_JOBS = 2;
sharp.cache({memory:48,files:0,items:48});
sharp.concurrency(1);
async function limited(fn) {
  if(activeJobs<MAX_JOBS) activeJobs++;
  else {
    if(waiting.length>=80)throw Error('Fila de capas lotada: tente novamente');
    // Quando o anterior termina, transfere a mesma vaga a quem esperava.
    await new Promise(resolve=>waiting.push(resolve));
  }
  try {return await fn();}
  finally {
    const next=waiting.shift();
    if(next) next();
    else activeJobs--;
  }
}
let lastTrim = 0;
let cacheHits = 0;
let generated = 0;
let failed = 0;

function ensureDir() { fs.mkdirSync(OUT,{recursive:true}); }
function load() {
  try {
    for(const [key,entry] of Object.entries(JSON.parse(fs.readFileSync(INDEX_FILE,'utf8')))) {
      if(/^[a-f\d]{32}$/.test(key) && ALLOWED_HOSTS.has(new URL(entry.source).hostname) && SHAPES[entry.shape]) {
        entries.set(key,entry);
      }
    }
  } catch { /* primeira utilização ou índice antigo */ }
}
load();
function flushIndex() {
  ensureDir();
  const tmp=INDEX_FILE+'.tmp-'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(Object.fromEntries(entries),null,2),{mode:0o600});
  fs.renameSync(tmp,INDEX_FILE);
}
function canonicalCover(src) {
  if(typeof src!=='string' || src.length>1500)return null;
  try {
    const url=new URL(src);
    if(url.protocol!=='https:' || url.username || url.password || url.port || !ALLOWED_HOSTS.has(url.hostname))return null;
    return url.toString();
  } catch { return null; }
}
function isHubStudioArtwork(src) {
  if (typeof src !== 'string' || !src.trim()) return false;
  if (/^\/api\/hub\/artwork\/studio\/[a-zA-Z0-9_-]{8,80}\.webp$/i.test(src.trim())) return true;
  try {
    const u = new URL(src.trim());
    return /^\/api\/hub\/artwork\/studio\/[a-zA-Z0-9_-]{8,80}\.webp$/i.test(u.pathname);
  } catch { return false; }
}
function resolveHubStudioArtworkUrl(src) {
  const trimmed = src.trim();
  if (trimmed.startsWith('/')) return `${HOST}${trimmed}`;
  return trimmed;
}
export function supportedCover(src) { return Boolean(canonicalCover(src) || isHubStudioArtwork(src)); }
export function normalizeShape(shape) { return SHAPES[shape] ? shape : 'LANDSCAPE'; }
export function dimensions(shape) { return {...SHAPES[normalizeShape(shape)]}; }
export function registerCover(src,shape) {
  if(isHubStudioArtwork(src)) return resolveHubStudioArtworkUrl(src);
  const source=canonicalCover(src);
  if(!source)return null;
  const kind=normalizeShape(shape);
  const key=sha(kind+'|'+source);
  if(!entries.has(key)) {
    entries.set(key,{source,shape:kind,createdAt:Date.now()});
    flushIndex();
  }
  return `${HOST}/api/hub/artwork/${kind}/${key}.webp`;
}
export function prepareCoverCollections(collections) {
  // Clone profundo: toda edição da origem continua ocorrendo nos URLs reais.
  // Somente o JSON exportado para a TV recebe as novas capas definitivas.
  const output=structuredClone(collections);
  let adapted=0, unsupported=0;
  // Batch save: at most one index write per collection export, not per URL.
  let dirty=false;
  for(const group of output) {
    if(isHubStudioArtwork(group.backdropImageUrl)) {
      group.backdropImageUrl=resolveHubStudioArtworkUrl(group.backdropImageUrl);
    }
    if(isHubStudioArtwork(group.coverImageUrl)) {
      group.coverImageUrl=resolveHubStudioArtworkUrl(group.coverImageUrl);
    }
    for(const folder of group.folders||[]) {
      const source=folder.customCoverImageUrl || folder.coverImageUrl;
      const requested=normalizeShape(folder.tileShape || group.tileShape);
      if(!folder.tileShape && group.tileShape) {
        folder.tileShape=requested==='PORTRAIT'?'POSTER':requested;
      }
      if(!source)continue;
      if(isHubStudioArtwork(source)) {
        folder.tileShape=requested==='PORTRAIT'?'POSTER':requested;
        const resolved=resolveHubStudioArtworkUrl(source);
        folder.coverImageUrl=resolved;
        folder.customCoverImageUrl=resolved;
        adapted++;
        continue;
      }
      const parsed=canonicalCover(source);
      if(!parsed) {unsupported++;continue;}
      // O Nuvio Legacy não reconhece PORTRAIT; desconhecidos viram SQUARE.
      // A melhor correspondência vertical é POSTER (2:3), sem recortar a arte.
      const shape=requested==='PORTRAIT'?'POSTER':requested;
      if(requested==='PORTRAIT') folder.tileShape='POSTER';
      const key=sha(shape+'|'+parsed);
      if(!entries.has(key)) {
        entries.set(key,{source:parsed,shape,createdAt:Date.now()});dirty=true;
      }
      const converted=`${HOST}/api/hub/artwork/${shape}/${key}.webp`;
      // Defina os dois campos: no Legacy a capa customizada tem prioridade.
      folder.coverImageUrl=converted;
      folder.customCoverImageUrl=converted;
      adapted++;
    }
  }
  if(dirty)flushIndex();
  return {collections:output,adapted,unsupported};
}
async function fetchImage(src,{fetchFn=fetch}={}) {
  const r=await fetchFn(src,{
    signal:AbortSignal.timeout(15000),
    headers:{'Accept':'image/webp,image/jpeg,image/png,image/avif,image/*;q=0.8','User-Agent':'NuvioHubArtwork/1.0'},
    redirect:'error'
  });
  if(!r.ok)throw Error('Origem HTTP '+r.status);
  const type=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(type && !['image/webp','image/jpeg','image/png','image/avif','image/gif','application/octet-stream'].includes(type)) throw Error('Resposta não é imagem');
  if(Number(r.headers.get('content-length')||0)>LIMIT_BYTES)throw Error('Imagem grande demais');
  const parts=[];let size=0;
  for await(const buf of r.body) {
    size+=buf.length;
    if(size>LIMIT_BYTES)throw Error('Imagem excedeu limite');
    parts.push(buf);
  }
  return Buffer.concat(parts);
}
export async function renderCover(input,shape) {
  const {width,height}=dimensions(shape);
  // Desativa imagens gigantes/animadas e metadados; limite evita decompression bombs.
  const sharpOptions={limitInputPixels:45_000_000,animated:false};
  const backdrop=await sharp(input,sharpOptions).rotate()
    .resize(width,height,{fit:'cover',position:'centre',withoutEnlargement:false})
    .blur(24).modulate({brightness:0.5,saturation:0.74})
    .png().toBuffer();
  const fg=await sharp(input,sharpOptions).rotate()
    .resize(width,height,{fit:'inside',withoutEnlargement:true})
    .png().toBuffer();
  return sharp(backdrop).composite([{input:fg,gravity:'centre'}])
    .webp({quality:86,effort:4}).toBuffer();
}
function trimCache() {
  const now=Date.now();
  if(now-lastTrim < 20*60_000)return;
  lastTrim=now;
  try {
    const files=fs.readdirSync(OUT).filter(x=>x.endsWith('.webp'))
      .map(name=>({name,...fs.statSync(path.join(OUT,name))}))
      .sort((a,b)=>a.mtimeMs-b.mtimeMs);
    let bytes=files.reduce((n,f)=>n+f.size,0);
    for(const f of files) {
      // Revalidação por tempo: atualizações de imagem no mesmo URL também chegam.
      if(bytes<=DISK_LIMIT && now-f.mtimeMs < TTL)continue;
      fs.unlinkSync(path.join(OUT,f.name)); bytes-=f.size;
    }
    // Apenas aparar referências muito antigas, preservando versões antigas
    // ao menos 14 dias para televisões com JSON em cache.
    let cleanup=false;
    for(const [k,v] of entries)if(now-v.createdAt > 14*86400_000 && !fs.existsSync(path.join(OUT,k+'.webp'))) {
      entries.delete(k);cleanup=true;
    }
    if(cleanup)flushIndex();
  } catch(e) {console.warn('[Covers] Limpeza de cache:',e.message);}
}
export async function getPreparedCover(shape,key, {fetchFn=fetch,now=Date.now()}={}) {
  if(!SHAPES[shape] || !/^[a-f\d]{32}$/.test(key))return null;
  const match=entries.get(key);
  if(!match || match.shape!==shape)return null;
  ensureDir();
  const destination=path.join(OUT,key+'.webp');
  try {
    const stat=fs.statSync(destination);
    if(now-stat.mtimeMs<TTL){
      cacheHits++;return {data:fs.readFileSync(destination),cached:true};
    }
  } catch { /* não gerado */ }
  if(inflight.has(key))return inflight.get(key);
  const pending=limited(async()=>{
    try {
      const bytes=await fetchImage(match.source,{fetchFn});
      const transformed=await renderCover(bytes,shape);
      const tmp=destination+'.tmp-'+process.pid;
      fs.writeFileSync(tmp,transformed,{mode:0o600});
      fs.renameSync(tmp,destination);
      generated++;trimCache();
      return {data:transformed,cached:false};
    } catch(err) {
      failed++;
      // A última versão adaptada é melhor que perder a capa temporariamente.
      if(fs.existsSync(destination)) return {data:fs.readFileSync(destination),cached:true,stale:true};
      throw err;
    }
  }).finally(()=>inflight.delete(key));
  inflight.set(key,pending);
  return pending;
}
export function getCoverAdapterStatus() {
  return {format:'webp',shapes:SHAPES,registered:entries.size,generated,cacheHits,failed,
    ttlSeconds:TTL/1000,maxDiskMB:DISK_LIMIT/1024/1024,
    supportedDomains:[...ALLOWED_HOSTS]};
}
