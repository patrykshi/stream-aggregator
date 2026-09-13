/**
 * Utilitário para parsing, normalização e construção de URLs de Addons Stremio.
 */
export function parseAddonUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let trimmed = raw.trim();

  // Converte protocolo stremio:// para https://
  if (trimmed.startsWith('stremio://')) {
    trimmed = 'https://' + trimmed.slice(10);
  }

  // Se o usuário colou sem protocolo
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = 'https://' + trimmed;
  }

  try {
    const urlObj = new URL(trimmed);

    let pathname = urlObj.pathname;
    if (!pathname.endsWith('/manifest.json')) {
      pathname = pathname.replace(/\/+$/, '') + '/manifest.json';
    }

    const manifestUrl = `${urlObj.origin}${pathname}${urlObj.search}`;
    const basePath = pathname.replace(/\/manifest\.json$/i, '');
    const baseUrl = `${urlObj.origin}${basePath}`;
    const search = urlObj.search || '';

    return {
      manifestUrl,
      baseUrl,
      search,
      getStreamUrl: (type, id) => `${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json${search}`
    };
  } catch (err) {
    return null;
  }
}

/**
 * Headers realistas para evitar bloqueios de Cloudflare ou anti-scrapers.
 */
export const DEFAULT_FETCH_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Stremio/4.4.168',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

