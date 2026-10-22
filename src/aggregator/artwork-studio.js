import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from '../config/json-store.js';
import { getIntegrationKey } from '../config/hub-integrations.js';

const DATA_DIR = resolveDataDir();
const STUDIO_ART_DIR = path.join(DATA_DIR, 'artwork-studio');
const INDEX_PATH = path.join(STUDIO_ART_DIR, 'index.json');

export const STUDIO_SHAPES = Object.freeze({
  LANDSCAPE: { width: 1280, height: 720, ratio: '16:9', label: 'Landscape · 16:9', tileShape: 'LANDSCAPE' },
  POSTER: { width: 600, height: 900, ratio: '2:3', label: 'Poster · 2:3', tileShape: 'POSTER' },
  PORTRAIT: { width: 750, height: 1000, ratio: '3:4', label: 'Portrait · 3:4', tileShape: 'PORTRAIT' },
  SQUARE: { width: 800, height: 800, ratio: '1:1', label: 'Square · 1:1', tileShape: 'SQUARE' },
  BACKDROP: { width: 1920, height: 1080, ratio: '16:9', label: 'Backdrop Coleção · 16:9 HD', tileShape: 'LANDSCAPE' }
});

export const STUDIO_PRESETS = Object.freeze([
  { id: 'netflix', category: 'streaming', name: 'Netflix', label: 'NETFLIX', primary: '#E50914', secondary: '#140507', accent: '#FF3B30', badge: 'N', subtitle: 'ORIGINAIS & CATÁLOGO' },
  { id: 'prime', category: 'streaming', name: 'Prime Video', label: 'PRIME VIDEO', primary: '#00A8E1', secondary: '#061524', accent: '#38C6F4', badge: 'prime', subtitle: 'AMAZON ORIGINALS' },
  { id: 'disney', category: 'streaming', name: 'Disney+', label: 'DISNEY+', primary: '#113CCF', secondary: '#050C24', accent: '#4E82FF', badge: 'D+', subtitle: 'DISNEY · PIXAR · MARVEL · STAR WARS' },
  { id: 'max', category: 'streaming', name: 'HBO Max', label: 'MAX', primary: '#5822B4', secondary: '#090418', accent: '#9B51E0', badge: 'MAX', subtitle: 'HBO · WARNER BROS · DC' },
  { id: 'apple', category: 'streaming', name: 'Apple TV+', label: 'APPLE TV+', primary: '#475569', secondary: '#090D14', accent: '#E2E8F0', badge: 'tv+', subtitle: 'APPLE ORIGINALS' },
  { id: 'globoplay', category: 'streaming', name: 'Globoplay', label: 'GLOBOPLAY', primary: '#FB471E', secondary: '#1B0705', accent: '#FF8A3D', badge: 'G', subtitle: 'NOVELAS · SÉRIES · CINEMA' },
  { id: 'crunchyroll', category: 'streaming', name: 'Crunchyroll', label: 'CRUNCHYROLL', primary: '#F47521', secondary: '#1B0D04', accent: '#FFB067', badge: 'CR', subtitle: 'ANIME & SIMULCASTS' },
  { id: 'paramount', category: 'streaming', name: 'Paramount+', label: 'PARAMOUNT+', primary: '#0064FF', secondary: '#041028', accent: '#60A5FA', badge: 'P+', subtitle: 'SHOWTIME · NICKELODEON · CBS' },
  { id: 'mubi', category: 'streaming', name: 'MUBI', label: 'MUBI', primary: '#1E3A8A', secondary: '#060B19', accent: '#93C5FD', badge: '●●●', subtitle: 'CURADORIA & CINEMA DE AUTOR' },
  { id: 'trending', category: 'genre', name: 'Em Alta', label: 'EM ALTA', primary: '#F59E0B', secondary: '#181004', accent: '#FDE68A', badge: '🔥', subtitle: 'OS MAIS ASSISTIDOS DA SEMANA' },
  { id: 'releases', category: 'genre', name: 'Lançamentos', label: 'LANÇAMENTOS', primary: '#10B981', secondary: '#041812', accent: '#6EE7B7', badge: '✦', subtitle: 'ESTREIAS RECENTES' },
  { id: 'horror', category: 'genre', name: 'Terror & Suspense', label: 'TERROR', primary: '#991B1B', secondary: '#0F0406', accent: '#F87171', badge: '☾', subtitle: 'SUSPENSE · SOBRENATURAL · SLASHER' },
  { id: 'scifi', category: 'genre', name: 'Ficção Científica', label: 'SCI-FI', primary: '#0284C7', secondary: '#04111D', accent: '#38BDF8', badge: '◈', subtitle: 'FUTURO · ESPAÇO · DISTOPIA' },
  { id: 'anime', category: 'genre', name: 'Anime', label: 'ANIME', primary: '#DB2777', secondary: '#190511', accent: '#F472B6', badge: '⛩', subtitle: 'SHONEN · SEINEN · FILMES' },
  { id: 'kids', category: 'genre', name: 'Infantil & Família', label: 'INFANTIL', primary: '#0EA5E9', secondary: '#061826', accent: '#7DD3FC', badge: '★', subtitle: 'ANIMAÇÃO & AVENTURA' },
  { id: 'action', category: 'genre', name: 'Ação & Aventura', label: 'AÇÃO', primary: '#EA580C', secondary: '#1A0B04', accent: '#FDBA74', badge: '⚡', subtitle: 'ADRENALINA & BLOCKBUSTERS' },
  { id: 'classics', category: 'genre', name: 'Clássicos & Cult', label: 'CLÁSSICOS', primary: '#B45309', secondary: '#170E05', accent: '#FCD34D', badge: '♛', subtitle: 'OBRAS-PRIMAS DO CINEMA' },
  { id: 'uhd4k', category: 'genre', name: '4K Ultra HD', label: '4K UHD', primary: '#6366F1', secondary: '#08091E', accent: '#A5B4FC', badge: '', subtitle: 'HDR10+ · DOLBY VISION' }
].map(p => Object.freeze({...p,badge:''})));

const CURATED_TMDB_SAMPLES = Object.freeze([
  { id: 'tt15239678', name: 'Duna: Parte Dois', year: 2024, type: 'movie', poster: 'https://image.tmdb.org/t/p/w780/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg' },
  { id: 'tt11280740', name: 'Ruptura', year: 2022, type: 'series', poster: 'https://image.tmdb.org/t/p/w780/lFf6LLrQjYldcZItzOkGmMMigP7.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/ixgFmf1X59PUZam2qbAfskx2gQr.jpg' },
  { id: 'tt15398776', name: 'Oppenheimer', year: 2023, type: 'movie', poster: 'https://image.tmdb.org/t/p/w780/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg' },
  { id: 'tt0903747', name: 'Breaking Bad', year: 2008, type: 'series', poster: 'https://image.tmdb.org/t/p/w780/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/gc8PfyTqzqltKPW3X0cIVUGmagz.jpg' },
  { id: 'tt3581920', name: 'The Last of Us', year: 2023, type: 'series', poster: 'https://image.tmdb.org/t/p/w780/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg' },
  { id: 'tt0816692', name: 'Interestelar', year: 2014, type: 'movie', poster: 'https://image.tmdb.org/t/p/w780/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg' },
  { id: 'tt4574334', name: 'Stranger Things', year: 2016, type: 'series', poster: 'https://image.tmdb.org/t/p/w780/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg' },
  { id: 'tt1877830', name: 'Batman', year: 2022, type: 'movie', poster: 'https://image.tmdb.org/t/p/w780/74xTEgt7R36Fpooo50r9T25onhq.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg' }
]);

function ensureStudioDir() {
  fs.mkdirSync(STUDIO_ART_DIR, { recursive: true, mode: 0o700 });
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeColor(hex, fallback = '#38bdf8') {
  const clean = String(hex ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean : fallback;
}

export function normalizeStudioShape(shape) {
  const key = String(shape || 'LANDSCAPE').toUpperCase();
  return STUDIO_SHAPES[key] ? key : 'LANDSCAPE';
}

export function getStudioShapeSpec(shape) {
  const key = normalizeStudioShape(shape);
  return { key, ...STUDIO_SHAPES[key] };
}

function readIndex() {
  return readJsonFile(INDEX_PATH, { items: {} });
}

function writeIndex(data) {
  ensureStudioDir();
  writeAtomicJsonFile(INDEX_PATH, data);
}

export function isLocalStudioArtworkUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  const trimmed = rawUrl.trim();
  if (/^\/api\/hub\/artwork\/studio\/[a-zA-Z0-9_-]{8,80}\.webp$/i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return /^\/api\/hub\/artwork\/studio\/[a-zA-Z0-9_-]{8,80}\.webp$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function extractStudioArtworkFilename(rawUrl) {
  if (!isLocalStudioArtworkUrl(rawUrl)) return null;
  const trimmed = rawUrl.trim();
  const pathname = trimmed.startsWith('/') ? trimmed : new URL(trimmed).pathname;
  const filename = pathname.split('/').pop();
  return /^[a-zA-Z0-9_-]{8,80}\.webp$/i.test(filename) ? filename : null;
}

export function getSavedStudioArtwork(filename) {
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9_-]{8,80}\.webp$/i.test(filename)) return null;
  const fullPath = path.join(STUDIO_ART_DIR, filename);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return fs.readFileSync(fullPath);
  } catch {
    return null;
  }
}

export async function saveStudioArtworkBuffer(buffer, { shape = 'LANDSCAPE', title = '', mode = 'custom' } = {}) {
  const spec = getStudioShapeSpec(shape);
  ensureStudioDir();
  const webpBuffer = await sharp(buffer, { limitInputPixels: 45_000_000, animated: false })
    .rotate()
    .resize(spec.width, spec.height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
  const hash = crypto.createHash('sha256').update(webpBuffer).digest('hex').slice(0, 24);
  const id = `art_${spec.key.toLowerCase()}_${hash}`;
  const filename = `${id}.webp`;
  const filePath = path.join(STUDIO_ART_DIR, filename);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, webpBuffer, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);

  const index = readIndex();
  index.items = index.items || {};
  index.items[filename] = {
    id,
    filename,
    shape: spec.key,
    tileShape: spec.tileShape,
    width: spec.width,
    height: spec.height,
    title: String(title || '').slice(0, 120),
    mode: String(mode || 'custom').slice(0, 40),
    createdAt: new Date().toISOString()
  };
  writeIndex(index);

  return {
    id,
    filename,
    shape: spec.key,
    tileShape: spec.tileShape,
    width: spec.width,
    height: spec.height,
    url: `/api/hub/artwork/studio/${filename}`
  };
}

export async function saveDataUrlArtwork(dataUrl, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw Error('Formato de imagem inválido. Envie um Data URL de imagem (PNG, JPEG ou WebP).');
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw Error('Data URL de imagem malformado.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) {
    throw Error('A imagem excede o limite máximo de 12 MB.');
  }
  const normalizedOpts = typeof options === 'string' ? { shape: options } : (options || {});
  return saveStudioArtworkBuffer(buffer, normalizedOpts);
}

export async function fetchRemoteImageBuffer(rawUrl, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  if (isLocalStudioArtworkUrl(rawUrl)) {
    const fname = extractStudioArtworkFilename(rawUrl);
    return fname ? getSavedStudioArtwork(fname) : null;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return null;
  }
  try {
    const res = await fetchImpl(parsed.toString(), {
      headers: {
        Accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8',
        'User-Agent': 'NuvioHub/1.0'
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    return buf.length > 0 && buf.length <= 10 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

async function createFallbackTileBuffer(width, height, primary = '#1e3a8a', secondary = '#090d16', index = 0) {
  const c1 = normalizeColor(primary, '#1e3a8a');
  const c2 = normalizeColor(secondary, '#090d16');
  const angle = 120 + (index * 25);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle})">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#g)" />
    <circle cx="${Math.round(width * 0.72)}" cy="${Math.round(height * 0.28)}" r="${Math.round(Math.min(width, height) * 0.36)}" fill="#ffffff" fill-opacity="0.06" />
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildOverlaySvg({
  width,
  height,
  title = '',
  subtitle = '',
  badge = '',
  primary = '#E50914',
  secondary = '#090D16',
  accent = '#FF5A5F',
  hideTitle = false,
  mode = 'preset',
  pattern = 'glow'
}) {
  const cPrimary = normalizeColor(primary, '#E50914');
  const cSecondary = normalizeColor(secondary, '#090D16');
  const cAccent = normalizeColor(accent, '#FF5A5F');
  const isVertical = height > width;
  const isSquare = width === height;

  const cleanTitle = escapeXml(String(title || '').trim().toUpperCase().slice(0, 38));
  const cleanSub = escapeXml(String(subtitle || '').trim().toUpperCase().slice(0, 64));
  const cleanBadge = escapeXml(String(badge || '').trim().slice(0, 8));

  const titleFontSize = isVertical
    ? (cleanTitle.length > 14 ? Math.round(width * 0.088) : Math.round(width * 0.115))
    : isSquare
      ? (cleanTitle.length > 14 ? Math.round(width * 0.085) : Math.round(width * 0.11))
      : (cleanTitle.length > 16 ? Math.round(height * 0.105) : Math.round(height * 0.135));

  const subFontSize = Math.max(13, Math.round(titleFontSize * 0.26));
  const badgeBoxSize = Math.round(Math.min(width, height) * (isVertical ? 0.22 : isSquare ? 0.24 : 0.23));
  const badgeFontSize = Math.round(badgeBoxSize * (cleanBadge.length > 2 ? 0.34 : 0.48));

  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  const bottomY = isVertical ? Math.round(height * 0.84) : Math.round(height * 0.80);

  let backgroundElements = '';
  if (mode === 'preset' || mode === 'ai-procedural') {
    backgroundElements = `
      <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
      <circle cx="${centerX}" cy="${Math.round(height * 0.42)}" r="${Math.round(Math.max(width, height) * 0.55)}" fill="url(#radialGlow)" />
      ${pattern === 'rays' ? `
        <polygon points="0,0 ${Math.round(width * 0.45)},0 ${ width },${ height } ${Math.round(width * 0.55)},${ height }" fill="${cAccent}" fill-opacity="0.07" />
        <polygon points="${Math.round(width * 0.65)},0 ${ width },0 ${Math.round(width * 0.35)},${ height } 0,${ height }" fill="${cPrimary}" fill-opacity="0.09" />
      ` : ''}
      ${pattern === 'rings' ? `
        <circle cx="${centerX}" cy="${Math.round(height * 0.42)}" r="${Math.round(Math.min(width, height) * 0.34)}" fill="none" stroke="${cAccent}" stroke-opacity="0.18" stroke-width="2" />
        <circle cx="${centerX}" cy="${Math.round(height * 0.42)}" r="${Math.round(Math.min(width, height) * 0.46)}" fill="none" stroke="${cPrimary}" stroke-opacity="0.12" stroke-width="1.5" stroke-dasharray="10 8" />
      ` : ''}
      ${pattern === 'grid' ? `
        <line x1="0" y1="${Math.round(height * 0.25)}" x2="${width}" y2="${Math.round(height * 0.25)}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
        <line x1="0" y1="${Math.round(height * 0.50)}" x2="${width}" y2="${Math.round(height * 0.50)}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
        <line x1="0" y1="${Math.round(height * 0.75)}" x2="${width}" y2="${Math.round(height * 0.75)}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
        <line x1="${Math.round(width * 0.25)}" y1="0" x2="${Math.round(width * 0.25)}" y2="${height}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
        <line x1="${Math.round(width * 0.50)}" y1="0" x2="${Math.round(width * 0.50)}" y2="${height}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
        <line x1="${Math.round(width * 0.75)}" y1="0" x2="${Math.round(width * 0.75)}" y2="${height}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
      ` : ''}
    `;
  }

  const badgeY = hideTitle ? Math.round(centerY - badgeBoxSize / 2) : Math.round(height * (isVertical ? 0.32 : 0.25));
  const badgeElement = cleanBadge
    ? `<g transform="translate(${Math.round(centerX - badgeBoxSize / 2)}, ${badgeY})">
        <rect width="${badgeBoxSize}" height="${badgeBoxSize}" rx="${Math.round(badgeBoxSize * 0.26)}" fill="#070a12" fill-opacity="0.68" stroke="${cAccent}" stroke-opacity="0.65" stroke-width="2.5" />
        <text x="${Math.round(badgeBoxSize / 2)}" y="${Math.round(badgeBoxSize * 0.64)}" text-anchor="middle" fill="#ffffff" font-family="Manrope, system-ui, sans-serif" font-weight="900" font-size="${badgeFontSize}" letter-spacing="-0.03em">${cleanBadge}</text>
      </g>`
    : '';

  const textBlock = !hideTitle && cleanTitle
    ? `<g>
        ${cleanSub ? `<text x="${centerX}" y="${bottomY - titleFontSize - 10}" text-anchor="middle" fill="${cAccent}" font-family="Manrope, system-ui, sans-serif" font-weight="800" font-size="${subFontSize}" letter-spacing="0.22em">${cleanSub}</text>` : ''}
        <text x="${centerX}" y="${bottomY}" text-anchor="middle" fill="#ffffff" font-family="Manrope, system-ui, sans-serif" font-weight="900" font-size="${titleFontSize}" letter-spacing="0.04em">${cleanTitle}</text>
      </g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${cSecondary}" />
        <stop offset="55%" stop-color="${cPrimary}" stop-opacity="0.48" />
        <stop offset="100%" stop-color="#05070c" />
      </linearGradient>
      <radialGradient id="radialGlow" cx="50%" cy="42%" r="58%">
        <stop offset="0%" stop-color="${cPrimary}" stop-opacity="0.62" />
        <stop offset="55%" stop-color="${cAccent}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="scrimGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#06080f" stop-opacity="0.25" />
        <stop offset="45%" stop-color="#06080f" stop-opacity="0.35" />
        <stop offset="82%" stop-color="#06080f" stop-opacity="0.88" />
        <stop offset="100%" stop-color="#05070c" stop-opacity="0.97" />
      </linearGradient>
    </defs>
    ${backgroundElements}
    <rect width="${width}" height="${height}" fill="url(#scrimGrad)" />
    <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2" />
    ${badgeElement}
    ${textBlock}
  </svg>`;
}

export async function applyUploadedMark(base, logoDataUrl, width, height) {
  if(!logoDataUrl)return base;
  if(typeof logoDataUrl!=='string'||logoDataUrl.length>2_800_000 ||
     !/^data:image\/(png|webp|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(logoDataUrl))
    throw Error('Envie um logo ou ícone PNG/WebP/JPEG de até 2 MB. SVG remoto não é permitido.');
  const input=Buffer.from(logoDataUrl.split(',')[1],'base64');
  if(input.length>2_000_000)throw Error('Logo excedeu o limite de 2 MB.');
  const mark=await sharp(input,{limitInputPixels:3_000_000,animated:false})
    .resize(Math.min(460,Math.round(width*.46)),Math.min(260,Math.round(height*.30)),
      {fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const info=await sharp(mark).metadata();
  const x=Math.floor((width-info.width)/2), y=Math.floor(height*.18);
  return sharp(base).composite([{input:mark,left:x,top:y}]).webp({quality:88}).toBuffer();
}

export async function composeStudioArtwork({
  mode = 'mosaic',
  shape = 'LANDSCAPE',
  layout = 'triptych',
  title = '',
  subtitle = '',
  badge = '',
  presetId = '',
  primary = '#E50914',
  secondary = '#090D16',
  accent = '#FF5A5F',
  hideTitle = false,
  pattern = 'glow',
  logoDataUrl = '',
  images = [],
  save = false,
  fetchImpl = globalThis.fetch
} = {}) {
  const spec = getStudioShapeSpec(shape);
  const { width, height } = spec;

  const preset = STUDIO_PRESETS.find(p => p.id === presetId) || null;
  const effectivePrimary = preset ? (primary || preset.primary) : primary;
  const effectiveSecondary = preset ? (secondary || preset.secondary) : secondary;
  const effectiveAccent = preset ? (accent || preset.accent) : accent;
  const effectiveBadge = typeof badge === 'string' ? badge : ''; // Nunca falsificar logos comerciais.
  const effectiveTitle = title !== undefined ? title : (preset?.label || 'COLEÇÃO');
  const effectiveSub = typeof subtitle === 'string' ? subtitle : '';

  let baseCanvas;

  if (mode === 'mosaic' || (Array.isArray(images) && images.length > 0 && mode !== 'preset')) {
    const rawUrls = (Array.isArray(images) ? images : []).filter(Boolean).slice(0, 4);
    const buffers = [];
    for (let i = 0; i < rawUrls.length; i++) {
      const buf = await fetchRemoteImageBuffer(rawUrls[i], { fetchImpl });
      if (buf) buffers.push(buf);
    }
    const targetCount = layout === 'single' ? 1 : layout === 'dual' ? 2 : layout === 'grid2x2' ? 4 : 3;
    while (buffers.length < targetCount) {
      buffers.push(await createFallbackTileBuffer(600, 900, effectivePrimary, effectiveSecondary, buffers.length));
    }

    const bgBuffer = await sharp(buffers[0], { limitInputPixels: 45_000_000, animated: false })
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .blur(26)
      .modulate({ brightness: 0.42, saturation: 0.85 })
      .png()
      .toBuffer();

    const composites = [];
    if (layout === 'single') {
      const fg = await sharp(buffers[0], { limitInputPixels: 45_000_000, animated: false })
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .modulate({ brightness: 0.88 })
        .png()
        .toBuffer();
      composites.push({ input: fg, left: 0, top: 0 });
    } else if (layout === 'dual') {
      const halfW = Math.ceil(width / 2);
      for (let i = 0; i < 2; i++) {
        const tile = await sharp(buffers[i % buffers.length], { limitInputPixels: 45_000_000, animated: false })
          .resize(halfW, height, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
        composites.push({ input: tile, left: i * Math.floor(width / 2), top: 0 });
      }
    } else if (layout === 'grid2x2') {
      const cellW = Math.ceil(width / 2);
      const cellH = Math.ceil(height / 2);
      for (let i = 0; i < 4; i++) {
        const tile = await sharp(buffers[i % buffers.length], { limitInputPixels: 45_000_000, animated: false })
          .resize(cellW, cellH, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
        const col = i % 2;
        const row = Math.floor(i / 2);
        composites.push({
          input: tile,
          left: col * Math.floor(width / 2),
          top: row * Math.floor(height / 2)
        });
      }
    } else {
      // Triptych (3 columns)
      const colW = Math.ceil(width / 3);
      for (let i = 0; i < 3; i++) {
        const tile = await sharp(buffers[i % buffers.length], { limitInputPixels: 45_000_000, animated: false })
          .resize(colW, height, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
        composites.push({ input: tile, left: i * Math.floor(width / 3), top: 0 });
      }
    }

    const overlaySvg = buildOverlaySvg({
      width,
      height,
      title: effectiveTitle,
      subtitle: effectiveSub,
      badge: effectiveBadge,
      primary: effectivePrimary,
      secondary: effectiveSecondary,
      accent: effectiveAccent,
      hideTitle: Boolean(hideTitle),
      mode: 'mosaic',
      pattern
    });
    composites.push({ input: Buffer.from(overlaySvg), left: 0, top: 0 });

    baseCanvas = await sharp(bgBuffer)
      .composite(composites)
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
  } else {
    // Preset or procedural AI artwork
    const overlaySvg = buildOverlaySvg({
      width,
      height,
      title: effectiveTitle,
      subtitle: effectiveSub,
      badge: effectiveBadge,
      primary: effectivePrimary,
      secondary: effectiveSecondary,
      accent: effectiveAccent,
      hideTitle: Boolean(hideTitle),
      mode: mode === 'ai' ? 'ai-procedural' : 'preset',
      pattern
    });
    baseCanvas = await sharp(Buffer.from(overlaySvg))
      .resize(width, height)
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
  }

  baseCanvas=await applyUploadedMark(baseCanvas,logoDataUrl,width,height);
  const dataUrl = `data:image/webp;base64,${baseCanvas.toString('base64')}`;
  if (!save) {
    return {
      ok: true,
      shape: spec.key,
      tileShape: spec.tileShape,
      width: spec.width,
      height: spec.height,
      dataUrl
    };
  }
  const saved = await saveStudioArtworkBuffer(baseCanvas, {
    shape: spec.key,
    title: effectiveTitle,
    mode
  });
  return {
    ok: true,
    ...saved,
    dataUrl
  };
}

const AI_STYLE_PALETTES = Object.freeze({
  neon: { primary: '#7C3AED', secondary: '#070514', accent: '#38BDF8', pattern: 'rays' },
  cinema: { primary: '#E11D48', secondary: '#09060A', accent: '#FBBF24', pattern: 'glow' },
  minimal: { primary: '#0EA5E9', secondary: '#07111E', accent: '#A5F3FC', pattern: 'rings' },
  epic: { primary: '#D97706', secondary: '#140B04', accent: '#FDE68A', pattern: 'rays' },
  noir: { primary: '#475569', secondary: '#05070B', accent: '#E2E8F0', pattern: 'grid' },
  anime: { primary: '#EC4899', secondary: '#160613', accent: '#F472B6', pattern: 'rays' }
});

export async function generateAiStudioArtwork({
  prompt = '',
  title = '',
  subtitle = '',
  badge = '',
  style = 'cinema',
  shape = 'LANDSCAPE',
  hideTitle = false,
  logoDataUrl = '',
  images = [],
  save = true,
  fetchImpl = globalThis.fetch
} = {}) {
  const spec = getStudioShapeSpec(shape);
  const styleSpec = AI_STYLE_PALETTES[style] || AI_STYLE_PALETTES.cinema;
  const geminiKey = getIntegrationKey('gemini');
  if(!geminiKey){
    const error=Error('Gemini não configurado. Adicione uma chave Gemini em Configurações → Integrações antes de gerar arte com IA.');
    error.status=503;throw error;
  }
  const ratioHint = spec.ratio === '2:3' ? 'vertical 2:3 movie poster' :
    spec.ratio === '3:4' ? 'vertical 3:4 portrait cover' :
    spec.ratio === '1:1' ? 'square 1:1 emblem icon' : 'widescreen 16:9 cinematic backdrop';
  const fullPrompt = `Create high resolution ${ratioHint} background art for a personal movie/TV collection. Theme: ${String(prompt||title).slice(0,900)}. Style: ${style}. Rich cinematic lighting, no text, no brand logos, no watermarks, no UI frames.`;
  // Nunca coloque a chave em URL/log ou no navegador.
  const apiUrl='https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';
  let res;
  try{res=await fetchImpl(apiUrl,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},
    body:JSON.stringify({contents:[{parts:[{text:fullPrompt}]}],
      generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:spec.ratio}}}),
    signal:AbortSignal.timeout(60000),redirect:'error'
  });}catch{throw Object.assign(Error('Gemini não respondeu. Verifique a conexão e tente novamente.'),{status:502});}
  if(!res.ok){
    const error=Error(res.status===429?'Limite de geração Gemini atingido. Tente mais tarde.':
     res.status===403||res.status===401?'Chave Gemini não autorizada. Verifique a chave em Configurações.':
     `Gemini retornou HTTP ${res.status}.`);
    error.status=res.status===429?429:502;throw error;
  }
  const payload=await res.json();
  const parts=payload?.candidates?.[0]?.content?.parts||[];
  const imgPart=parts.find(p=>p?.inlineData?.data && /^image\/(png|jpeg|webp)$/.test(p.inlineData?.mimeType||''));
  if(!imgPart){
    throw Object.assign(Error('O Gemini não retornou uma imagem. Revise o prompt ou tente novamente.'),{status:502});
  }
  if(imgPart.inlineData.data.length>15_000_000)throw Error('Imagem Gemini acima do limite permitido.');
  const rawBuf=Buffer.from(imgPart.inlineData.data,'base64');
  const overlaySvg=buildOverlaySvg({width:spec.width,height:spec.height,
    title,subtitle,badge,primary:styleSpec.primary,secondary:styleSpec.secondary,
    accent:styleSpec.accent,hideTitle:Boolean(hideTitle),mode:'mosaic',pattern:styleSpec.pattern});
  let composed=await sharp(rawBuf,{limitInputPixels:45_000_000,animated:false})
    .resize(spec.width,spec.height,{fit:'cover',position:'centre'})
    .composite([{input:Buffer.from(overlaySvg),left:0,top:0}])
    .webp({quality:88,effort:4}).toBuffer();
  composed=await applyUploadedMark(composed,logoDataUrl,spec.width,spec.height);
  const dataUrl=`data:image/webp;base64,${composed.toString('base64')}`;
  if(!save)return {ok:true,provider:'gemini',shape:spec.key,tileShape:spec.tileShape,
    width:spec.width,height:spec.height,dataUrl};
  const saved=await saveStudioArtworkBuffer(composed,{shape:spec.key,title,mode:'ai-gemini'});
  return {ok:true,provider:'gemini',...saved,dataUrl};
}

export async function searchTmdbArtworkCandidates({
  query = '',
  localItems = [],
  fetchImpl = globalThis.fetch
} = {}) {
  const results = [];
  const seen = new Set();

  const pushCandidate = item => {
    if (!item || typeof item !== 'object') return;
    const poster = typeof item.poster === 'string' && item.poster.startsWith('https://') ? item.poster : null;
    const backdrop = typeof item.backdrop === 'string' && item.backdrop.startsWith('https://')
      ? item.backdrop
      : (typeof item.background === 'string' && item.background.startsWith('https://') ? item.background : null);
    if (!poster && !backdrop) return;
    const key = (item.id || item.name || '') + '::' + (poster || backdrop);
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      id: String(item.id || results.length + 1),
      name: String(item.name || item.title || 'Título').slice(0, 100),
      year: item.year ? Number(item.year) || String(item.year).slice(0, 4) : '',
      type: item.type === 'series' || item.type === 'tv' ? 'series' : 'movie',
      poster: poster || backdrop,
      backdrop: backdrop || poster
    });
  };

  for (const item of Array.isArray(localItems) ? localItems : []) {
    pushCandidate(item);
  }

  const tmdbKey = getIntegrationKey('tmdb');
  const q = String(query || '').trim();
  if (tmdbKey) {
    try {
      const endpoint = q
        ? `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(tmdbKey)}&language=pt-BR&query=${encodeURIComponent(q)}&include_adult=false`
        : `https://api.themoviedb.org/3/trending/all/week?api_key=${encodeURIComponent(tmdbKey)}&language=pt-BR`;
      const res = await fetchImpl(endpoint, {
        headers: { Accept: 'application/json', 'User-Agent': 'NuvioHub/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        for (const row of (data?.results || []).slice(0, 18)) {
          if (row.media_type === 'person') continue;
          const poster = row.poster_path ? `https://image.tmdb.org/t/p/w780${row.poster_path}` : null;
          const backdrop = row.backdrop_path ? `https://image.tmdb.org/t/p/w1280${row.backdrop_path}` : null;
          const dateStr = row.release_date || row.first_air_date || '';
          pushCandidate({
            id: row.id ? `tmdb:${row.id}` : undefined,
            name: row.title || row.name || 'Título TMDB',
            year: dateStr ? dateStr.slice(0, 4) : '',
            type: row.media_type === 'tv' ? 'series' : 'movie',
            poster,
            backdrop
          });
        }
      }
    } catch {
      // Fallback to curated samples below
    }
  }

  for (const sample of CURATED_TMDB_SAMPLES) {
    if (!q || sample.name.toLowerCase().includes(q.toLowerCase())) {
      pushCandidate(sample);
    }
  }
  if (results.length === 0) {
    for (const sample of CURATED_TMDB_SAMPLES) pushCandidate(sample);
  }

  return {
    items: results.slice(0, 24),
    tmdbConfigured: Boolean(tmdbKey)
  };
}
