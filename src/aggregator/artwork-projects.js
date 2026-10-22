import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from '../config/json-store.js';
import { getStudioShapeSpec, STUDIO_SHAPES } from './artwork-studio.js';

const DATA_DIR = resolveDataDir();
const STUDIO_DIR = path.join(DATA_DIR, 'artwork-studio');
const PROJECTS_DIR = path.join(STUDIO_DIR, 'projects');
const ASSETS_DIR = path.join(STUDIO_DIR, 'assets');
const INDEX_PATH = path.join(STUDIO_DIR, 'index.json');

export function ensureProjectsDirectories() {
  fs.mkdirSync(STUDIO_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(ASSETS_DIR, { recursive: true, mode: 0o700 });
}

function sanitizeId(id) {
  const clean = String(id || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(clean)) {
    throw Error('ID de projeto inválido. Use caracteres alfanuméricos, hífen ou sublinhado (máx 80).');
  }
  return clean;
}

export function listProjects() {
  ensureProjectsDirectories();
  try {
    const files = fs.readdirSync(PROJECTS_DIR);
    const projects = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const fullPath = path.join(PROJECTS_DIR, f);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const doc = JSON.parse(raw);
        if (doc && typeof doc === 'object' && doc.id) {
          projects.push({
            id: doc.id,
            version: doc.version || 2,
            name: doc.name || 'Projeto sem título',
            target: doc.target || { kind: 'folder', id: '', title: '' },
            shape: doc.shape || 'LANDSCAPE',
            tileShape: doc.tileShape || 'LANDSCAPE',
            ratio: doc.ratio || '16:9',
            width: doc.width || 1280,
            height: doc.height || 720,
            thumbnail: doc.thumbnail || null,
            variationsCount: Array.isArray(doc.variations) ? doc.variations.length : 1,
            createdAt: doc.createdAt || new Date().toISOString(),
            updatedAt: doc.updatedAt || new Date().toISOString()
          });
        }
      } catch {
        // Skip corrupt or unreadable files
      }
    }
    return projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch {
    return [];
  }
}

export function getProject(id) {
  const cleanId = sanitizeId(id);
  ensureProjectsDirectories();
  const filePath = path.join(PROJECTS_DIR, `${cleanId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProject(doc) {
  if (!doc || typeof doc !== 'object') {
    throw Error('Dados de projeto inválidos.');
  }
  ensureProjectsDirectories();
  const id = sanitizeId(doc.id || `proj_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
  const shapeKey = (doc.shape || 'LANDSCAPE').toUpperCase();
  const spec = STUDIO_SHAPES[shapeKey] || STUDIO_SHAPES.LANDSCAPE;

  const projectRecord = {
    id,
    version: 2,
    name: String(doc.name || 'Novo Projeto').slice(0, 120),
    target: {
      kind: doc.target?.kind === 'group' ? 'group' : 'folder',
      id: String(doc.target?.id || '').slice(0, 80),
      title: String(doc.target?.title || '').slice(0, 120),
      tileShape: doc.target?.tileShape || spec.tileShape
    },
    shape: spec.ratio === '16:9 HD' ? 'BACKDROP' : shapeKey,
    tileShape: spec.tileShape,
    ratio: spec.ratio,
    width: Number(doc.width) || spec.width,
    height: Number(doc.height) || spec.height,
    thumbnail: typeof doc.thumbnail === 'string' && doc.thumbnail.startsWith('/') ? doc.thumbnail.slice(0, 200) : null,
    canvasDoc: doc.canvasDoc && typeof doc.canvasDoc === 'object' ? doc.canvasDoc : {},
    variations: Array.isArray(doc.variations) ? doc.variations.slice(0, 10).map((v, i) => ({
      id: String(v.id || `var_${i + 1}`).slice(0, 40),
      name: String(v.name || `Versão ${i + 1}`).slice(0, 60),
      thumbnail: typeof v.thumbnail === 'string' && v.thumbnail.startsWith('/') ? v.thumbnail.slice(0, 200) : null,
      canvasDoc: v.canvasDoc && typeof v.canvasDoc === 'object' ? v.canvasDoc : {}
    })) : [],
    activeVariationId: String(doc.activeVariationId || 'var_1').slice(0, 40),
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const filePath = path.join(PROJECTS_DIR, `${id}.json`);
  writeAtomicJsonFile(filePath, projectRecord);
  return projectRecord;
}

export function deleteProject(id) {
  const cleanId = sanitizeId(id);
  ensureProjectsDirectories();
  const filePath = path.join(PROJECTS_DIR, `${cleanId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export async function saveAssetBuffer(buffer, { mimeType = 'image/png', filenameHint = 'asset' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Error('Buffer de asset inválido ou vazio.');
  }
  if (buffer.length > 15 * 1024 * 1024) {
    throw Error('O asset excede o limite máximo permitido de 15 MB.');
  }
  ensureProjectsDirectories();
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  const metadata = await sharp(buffer, { limitInputPixels: 45_000_000, animated: false }).metadata();

  let ext = 'webp';
  let processedBuffer = buffer;
  if (metadata.format === 'png') {
    ext = 'png';
  } else if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
    ext = 'jpg';
  } else if (metadata.format === 'webp') {
    ext = 'webp';
  } else {
    // Convert to webp
    processedBuffer = await sharp(buffer).webp({ quality: 90 }).toBuffer();
    ext = 'webp';
  }

  const filename = `asset_${hash}.${ext}`;
  const filePath = path.join(STUDIO_DIR, filename);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, processedBuffer, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);

  return {
    id: `asset_${hash}`,
    filename,
    url: `/api/hub/artwork/studio/${filename}`,
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: ext,
    size: processedBuffer.length
  };
}

export async function exportArtworkFromDataUrl({
  dataUrl,
  shape = 'LANDSCAPE',
  format = 'webp',
  quality = 88,
  title = '',
  mode = 'studio-export'
} = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw Error('Data URL de imagem inválido para exportação.');
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw Error('Data URL de imagem malformado.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
    throw Error('Imagem excede o limite máximo de 15 MB.');
  }

  const spec = getStudioShapeSpec(shape);
  ensureProjectsDirectories();

  const targetFormat = String(format || 'webp').toLowerCase();
  const validFormat = ['webp', 'png', 'jpeg', 'jpg'].includes(targetFormat) ? targetFormat : 'webp';
  const outFormat = validFormat === 'jpg' ? 'jpeg' : validFormat;

  let pipeline = sharp(buffer, { limitInputPixels: 45_000_000, animated: false })
    .rotate()
    .resize(spec.width, spec.height, { fit: 'cover', position: 'centre' });

  let outBuffer;
  const numQuality = Math.max(50, Math.min(100, Number(quality) || 88));
  if (outFormat === 'png') {
    outBuffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
  } else if (outFormat === 'jpeg') {
    outBuffer = await pipeline.jpeg({ quality: numQuality, mozjpeg: true }).toBuffer();
  } else {
    outBuffer = await pipeline.webp({ quality: numQuality, effort: 4 }).toBuffer();
  }

  const hash = crypto.createHash('sha256').update(outBuffer).digest('hex').slice(0, 24);
  const ext = outFormat === 'jpeg' ? 'jpg' : outFormat;
  const id = `art_${spec.key.toLowerCase()}_${hash}`;
  const filename = `${id}.${ext}`;
  const filePath = path.join(STUDIO_DIR, filename);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, outBuffer, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);

  const index = readJsonFile(INDEX_PATH, { items: {} });
  index.items = index.items || {};
  index.items[filename] = {
    id,
    filename,
    shape: spec.key,
    tileShape: spec.tileShape,
    width: spec.width,
    height: spec.height,
    format: ext,
    title: String(title || '').slice(0, 120),
    mode: String(mode || 'studio-export').slice(0, 40),
    createdAt: new Date().toISOString()
  };
  writeAtomicJsonFile(INDEX_PATH, index);

  return {
    id,
    filename,
    shape: spec.key,
    tileShape: spec.tileShape,
    width: spec.width,
    height: spec.height,
    format: ext,
    size: outBuffer.length,
    url: `/api/hub/artwork/studio/${filename}`
  };
}
