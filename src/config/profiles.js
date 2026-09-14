import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultConfig, sanitizeConfig } from './codec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório de dados persistentes
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const DEFAULT_NUVIO_PATH = path.join(__dirname, '../../public/default-nuvio-collections.json');

// Garante que o diretório existe
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[Profiles] Erro ao criar diretório de dados:', err.message);
}

// Carrega o template padrão de coleções Nuvio se disponível
function getDefaultNuvioCollections() {
  try {
    if (fs.existsSync(DEFAULT_NUVIO_PATH)) {
      return JSON.parse(fs.readFileSync(DEFAULT_NUVIO_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Profiles] Erro ao ler coleções padrão:', err.message);
  }
  return [];
}

/**
 * Lê todos os perfis armazenados no arquivo JSON.
 */
function readProfilesMap() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Profiles] Erro ao ler profiles.json, usando fallback em memória:', err.message);
  }

  // Se não existir, inicializa com o perfil 'main'
  const initialMap = {
    main: {
      name: 'Principal',
      updatedAt: new Date().toISOString(),
      config: {
        ...getDefaultConfig(),
        nuvioCollections: getDefaultNuvioCollections()
      }
    }
  };
  saveProfilesMap(initialMap);
  return initialMap;
}

/**
 * Grava o mapa de perfis no disco.
 */
function saveProfilesMap(profilesMap) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesMap, null, 2), 'utf-8');
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
    const def = getDefaultConfig();
    def.nuvioCollections = getDefaultNuvioCollections();
    map[cleanId] = {
      name: 'Principal',
      updatedAt: new Date().toISOString(),
      config: def
    };
    saveProfilesMap(map);
    return def;
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
      const def = getDefaultConfig();
      def.nuvioCollections = getDefaultNuvioCollections();
      const newEntry = {
        name: 'Principal',
        updatedAt: new Date().toISOString(),
        config: def
      };
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

