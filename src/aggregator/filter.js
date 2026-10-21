// Termos estritos de gravações CAM/Screener de cinema (evita falsos positivos com canais Telecine ou .ts)
const CAM_REGEX = /\b(camrip|hd-?cam|hd-?ts|telesync|dvd-?scr|screener)\b/i;

const RESOLUTION_PATTERNS = [
  { label: '4k', regex: /\b(4k|2160p|uhd)\b/i },
  { label: '1080p', regex: /\b(1080p|fhd)\b/i },
  { label: '720p', regex: /\b(720p|hd)\b/i },
  { label: '480p', regex: /\b(480p|sd|360p)\b/i }
];

/**
 * Detecta a resolução de um stream analisando título, nome e descrição.
 */
export function extractResolution(stream) {
  const combined = [stream.name, stream.title, stream.description]
    .filter(Boolean)
    .join(' ');

  for (const { label, regex } of RESOLUTION_PATTERNS) {
    if (regex.test(combined)) {
      return label;
    }
  }
  return 'unknown';
}

/**
 * Verifica se um stream é gravação de cinema/qualidade cam.
 */
export function isCamStream(stream) {
  const combined = [stream.name, stream.title, stream.description]
    .filter(Boolean)
    .join(' ');

  return CAM_REGEX.test(combined);
}

/**
 * Aplica filtros de resolução, CAM, regex e limites.
 */
export function filterStreams(streams, filters = {}) {
  let result = [...streams];

  // Filtro de CAMs
  if (filters.removeCams) {
    result = result.filter(s => !isCamStream(s));
  }

  // Filtro de Resoluções
  if (Array.isArray(filters.resolutions) && filters.resolutions.length > 0) {
    const allowed = new Set(filters.resolutions.map(r => r.toLowerCase()));
    result = result.filter(s => {
      const res = extractResolution(s);
      // Se não conseguirmos detectar resolução, permitimos para não descartar streams legítimos
      if (res === 'unknown') return true;
      return allowed.has(res);
    });
  }

  // Filtro Regex customizado
  if (filters.excludeRegex && filters.excludeRegex.trim()) {
    try {
      const regex = new RegExp(filters.excludeRegex.trim(), 'i');
      result = result.filter(s => {
        const text = [s.name, s.title, s.description].filter(Boolean).join(' ');
        return !regex.test(text);
      });
    } catch (err) {
      console.warn('Regex de exclusão inválida:', err.message);
    }
  }

  return result;
}

/**
 * Desduplica streams baseando-se em infoHash ou assinatura única.
 */
export function deduplicateStreams(streams, getSource = () => '') {
  const seenHashes = new Set();
  const seenUrls = new Set();
  const result = [];

  for (const stream of streams) {
    // Preserve a escolha entre fontes de provedores diferentes, mesmo que
    // tenham encontrado o mesmo torrent/arquivo. Desduplique DENTRO da origem.
    const source = String(getSource(stream) || '');
    if (stream.infoHash) {
      const key = source + '|' + String(stream.infoHash).toLowerCase();
      if (seenHashes.has(key)) continue;
      seenHashes.add(key);
      result.push(stream);
      continue;
    }

    if (stream.url) {
      const key = source + '|' + stream.url.split('?')[0];
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      result.push(stream);
      continue;
    }

    result.push(stream);
  }

  return result;
}

// Mapeamento de ícones e logotipos dos addons mais populares
const ADDON_ICONS = {
  torrentio: '⚡',
  fenix: '🔥',
  fenixflix: '🔥',
  bestcine: '🍿',
  best: '🍿',
  cine: '🍿',
  popplay: '▶️',
  nyaa: '🌸',
  anime: '🌸',
  zeus: '⚡',
  froststream: '❄️',
  frost: '❄️',
  emby: '🟢',
  mediaedge: '☁️',
  legendas: '💬',
  brazuca: '🇧🇷',
  magneto: '🧲',
  magnetflix: '🧲',
  unioflix: '🎞️',
  betor: '📦',
  superstream: '🎬',
  kingvod: '👑',
  mediafusion: '🎬',
  comet: '☄️',
  stremthru: '🚀',
  cinemeta: '📽️',
  cyberflix: '🎞️',
  opensubtitles: '💬',
  easynews: '📰',
  torbox: '📦',
  realdebrid: '👑',
  alldebrid: '💎',
  premiumize: '⭐'
};

function getAddonIcon(name) {
  if (!name) return '⚡';
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, icon] of Object.entries(ADDON_ICONS)) {
    if (clean.includes(key)) return icon;
  }
  return '⚡';
}

/**
 * Enriquece os metadados do stream com o nome e ícone do addon de origem.
 */
export function enrichStreamBadge(stream, addonName, badgeFormat = 'addon') {
  if (badgeFormat === 'none' || !addonName) {
    return stream;
  }

  const copy = { ...stream };
  const label = addonName.replace(/[\r\n\t]/g, ' ').trim();
  const prefix = `Agregador | ${label} | `;

  if (badgeFormat === 'addon') {
    // Nuvio Legacy (TV) nao renderiza varios emojis do nome e mostra o
    // "addon" como Unified Stream Aggregator. Use texto simples nas linhas
    // realmente exibidas (name e description), inclusive no modo "Do addon".
    // Nao modificar URL, hash, headers nem metadados de reproducao.
    const originalName = copy.name || '';
    const originalTitle = copy.title || '';
    const originalDescription = copy.description || '';
    if (!originalName.startsWith(prefix)) {
      copy.name = prefix + originalName;
    }
    if (originalTitle && !originalTitle.startsWith(prefix)) {
      copy.title = prefix + originalTitle;
    }

    // Nuvio Legacy conserva "description" e mostra sua primeira linha
    // no modo de texto do addon e no cartao de detalhes (v2.0.5+).
    // Quando o provedor original so envia title, preserve-o abaixo da origem.
    const origin = `Origem: ${label}`;
    if (!originalDescription.startsWith(origin)) {
      const details = originalDescription || originalTitle || originalName;
      copy.description = details ? `${origin}\n${details}` : origin;
    }
  }

  return copy;
}

