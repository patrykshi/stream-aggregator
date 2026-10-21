import fs from 'node:fs';
import path from 'node:path';

export function resolveDataDir(fallbackDir = path.resolve('data')) {
  return process.env.DATA_DIR || fallbackDir;
}

export function readJsonFile(filePath, fallback = null, { strict = false, requireObject = false, errorMessage = 'Erro ao ler configuração.' } = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (requireObject) {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        if (strict) throw Error(errorMessage);
        return fallback;
      }
    }
    return parsed;
  } catch (err) {
    if (strict && err?.code !== 'ENOENT') {
      throw Error(errorMessage);
    }
    return fallback;
  }
}

export function writeAtomicJsonFile(filePath, value, { dirMode = 0o700 } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: dirMode });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

export function validatePublicHttpsUrl(raw, errorMessage = 'Use uma URL pública HTTPS, sem credenciais embutidas na URL') {
  if (typeof raw !== 'string' || raw.length > 1500) throw new Error('URL inválida ou muito longa');
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    /^[0-9.]+$/.test(host) ||
    host.includes(':') ||
    !host.includes('.')
  ) {
    throw new Error(errorMessage);
  }
  return url.toString();
}
