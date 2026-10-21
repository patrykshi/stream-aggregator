import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultConfig, sanitizeConfig } from './codec.js';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from './json-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório de dados persistentes
const DATA_DIR = resolveDataDir(path.join(__dirname, '../../data'));
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const DEFAULT_NUVIO_PATH = path.join(__dirname, '../../public/default-nuvio-collections.json');

// Garante que o diretório existe
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  console.warn('[Profiles] Erro ao criar diretório de dados:', err.message);
}

// Carrega o template padrão de coleções Nuvio se disponível
function getDefaultNuvioCollections() {
  return readJsonFile(DEFAULT_NUVIO_PATH, []);
}

function buildDefaultMainEntry() {
  return {
    name: 'Principal',
    updatedAt: new Date().toISOString(),
    config: {
      ...getDefaultConfig(),
      nuvioCollections: getDefaultNuvioCollections()
    }
  };
}

/**
 * Lê todos os perfis armazenados no arquivo JSON.
 */
function readProfilesMap() {
  const parsed = readJsonFile(PROFILES_FILE, null, { requireObject: true });
  if (parsed) return parsed;

  // Se não existir, inicializa com o perfil 'main'
  const initialMap = { main: buildDefaultMainEntry() };
  saveProfilesMap(initialMap);
  return initialMap;
}

/**
 * Grava o mapa de perfis no disco.
 */
function saveProfilesMap(profilesMap) {
  try {
    writeAtomicJsonFile(PROFILES_FILE, profilesMap);
    return true;
  } catch (err) {
    console.error('[Profiles] Erro ao salvar profiles.json:', err.message);
    return false;
  }
}

/**
 * Lista todos os perfis cadastrados (metadados para a interface).
 */
export function listProfiles() {
  const map = readProfilesMap();
  return Object.entries(map).map(([id, p]) => ({
    id,
    name: p.name || id,
    updatedAt: p.updatedAt,
    addonsCount: (p.config?.addons || []).length,
    catalogsCount: (p.config?.customCatalogs || []).length,
    collectionsCount: (p.config?.nuvioCollections || []).length
  }));
}

/**
 * Obtém a configuração de um perfil específico pelo ID.
 */
export function getProfileConfig(profileId = 'main') {
  const cleanId = String(profileId).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'main';
  const map = readProfilesMap();

  if (map[cleanId] && map[cleanId].config) {
    return sanitizeConfig(map[cleanId].config);
  }

  // Se for o perfil main ou se não encontrar, entrega o padrão sanitizado
  if (cleanId === 'main' || cleanId === 'default') {
    const newEntry = buildDefaultMainEntry();
    map[cleanId] = newEntry;
    saveProfilesMap(map);
    return newEntry.config;
  }

  return null;
}

/**
 * Obtém o perfil completo com nome e metadados.
 */
export function getProfile(profileId = 'main') {
  const cleanId = String(profileId).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'main';
  const map = readProfilesMap();
  const entry = map[cleanId];

  if (!entry) {
    if (cleanId === 'main') {
      const newEntry = buildDefaultMainEntry();
      map['main'] = newEntry;
      saveProfilesMap(map);
      return { id: 'main', ...newEntry };
    }
    return null;
  }

  return {
    id: cleanId,
    name: entry.name || cleanId,
    updatedAt: entry.updatedAt,
    config: sanitizeConfig(entry.config)
  };
}

/**
 * Salva ou atualiza a configuração de um perfil.
 */
export function saveProfile(profileId, { name, config }) {
  const cleanId = String(profileId).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'main';
  const map = readProfilesMap();

  const sanitized = sanitizeConfig(config);
  const existingName = map[cleanId]?.name;

  map[cleanId] = {
    name: name ? String(name).trim() : (existingName || (cleanId === 'main' ? 'Principal' : cleanId)),
    updatedAt: new Date().toISOString(),
    config: sanitized
  };

  const success = saveProfilesMap(map);
  return {
    success,
    id: cleanId,
    name: map[cleanId].name,
    config: sanitized
  };
}

/**
 * Remove um perfil (impede exclusão do perfil principal 'main').
 */
export function deleteProfile(profileId) {
  const cleanId = String(profileId).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (cleanId === 'main' || cleanId === 'default') {
    return { success: false, error: 'O perfil principal não pode ser excluído.' };
  }

  const map = readProfilesMap();
  if (!map[cleanId]) {
    return { success: false, error: 'Perfil não encontrado.' };
  }

  delete map[cleanId];
  const success = saveProfilesMap(map);
  return { success };
}

