import zlib from 'node:zlib';

/**
 * Codifica um objeto de configuração para uma string URL-safe compactada.
 * Suporta compressão zlib deflate + base64url.
 */
export function encodeConfig(config) {
  try {
    const jsonStr = JSON.stringify(config);
    const compressed = zlib.deflateRawSync(Buffer.from(jsonStr, 'utf-8'));
    return compressed.toString('base64url');
  } catch (err) {
    // Fallback para base64url simples
    return Buffer.from(JSON.stringify(config), 'utf-8').toString('base64url');
  }
}

/**
 * Decodifica a string da URL para o objeto de configuração.
 * Suporta zlib inflate e fallback para base64url simples.
 */
export function decodeConfig(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return getDefaultConfig();
  }

  // Tenta descompactar via deflateRaw
  try {
    const buffer = Buffer.from(rawToken, 'base64url');
    try {
      const decompressed = zlib.inflateRawSync(buffer);
      const parsed = JSON.parse(decompressed.toString('utf-8'));
      return sanitizeConfig(parsed);
    } catch {
      // Pode ser apenas base64url sem compressão
      const parsed = JSON.parse(buffer.toString('utf-8'));
      return sanitizeConfig(parsed);
    }
  } catch (err) {
    // Se for URL codificada como JSON percent-encoded
    try {
      const decoded = decodeURIComponent(rawToken);
      const parsed = JSON.parse(decoded);
      return sanitizeConfig(parsed);
    } catch {
      return getDefaultConfig();
    }
  }
}

export function getDefaultConfig() {
  return {
    addons: [],
    filters: {
      resolutions: ['4k', '1080p', '720p', '480p'],
      removeCams: true,
      excludeRegex: '',
      maxStreamsPerAddon: 10,
      maxTotalStreams: 30
    },
    badgeFormat: 'addon', // 'addon', 'clean', 'none'
    deduplicate: true
  };
}

export function sanitizeConfig(cfg) {
  const def = getDefaultConfig();
  if (!cfg || typeof cfg !== 'object') return def;

  const addons = Array.isArray(cfg.addons)
    ? cfg.addons
        .filter(a => a && typeof a.url === 'string' && a.url.trim().length > 0)
        .map((a, idx) => ({
          url: a.url.trim().replace(/\/$/, ''),
          name: typeof a.name === 'string' && a.name.trim() ? a.name.trim() : `Addon ${idx + 1}`,
          timeoutMs: typeof a.timeoutMs === 'number' && a.timeoutMs > 0 ? a.timeoutMs : 7000,
          enabled: a.enabled !== false
        }))
    : [];

  const filters = {
    resolutions: Array.isArray(cfg.filters?.resolutions)
      ? cfg.filters.resolutions.map(r => String(r).toLowerCase())
      : def.filters.resolutions,
    removeCams: cfg.filters?.removeCams !== false,
    excludeRegex: typeof cfg.filters?.excludeRegex === 'string' ? cfg.filters.excludeRegex : '',
    maxStreamsPerAddon: typeof cfg.filters?.maxStreamsPerAddon === 'number' ? cfg.filters.maxStreamsPerAddon : def.filters.maxStreamsPerAddon,
    maxTotalStreams: typeof cfg.filters?.maxTotalStreams === 'number' ? cfg.filters.maxTotalStreams : def.filters.maxTotalStreams
  };

  return {
    addons,
    filters,
    badgeFormat: ['addon', 'clean', 'none'].includes(cfg.badgeFormat) ? cfg.badgeFormat : 'addon',
    deduplicate: cfg.deduplicate !== false
  };
}

