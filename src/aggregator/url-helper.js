export function formatExtraPath(extra) {
  if (!extra) return '';
  let decoded = String(extra);
  try { decoded = decodeURIComponent(decoded); } catch {}
  const parts = decoded.split('&').filter(Boolean);
  return '/' + parts.map(part => {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) return encodeURIComponent(part);
    const key = part.slice(0, eqIdx);
    const val = part.slice(eqIdx + 1);
    return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
  }).join('&');
}

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

  // Auto-corrige domínios legados/descontinuados
  if (trimmed.includes('opensubtitles-v3.strem.fun')) {
    trimmed = trimmed.replace('opensubtitles-v3.strem.fun', 'opensubtitles-v3.strem.io');
  }

  try {
    const urlObj = new URL(trimmed);

    // Extrai credenciais Basic Auth embutidas na URL (evita falha no fetch do Node/undici)
    let authHeader = null;
    if (urlObj.username || urlObj.password) {
      const user = decodeURIComponent(urlObj.username || '');
      const pass = decodeURIComponent(urlObj.password || '');
      authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
      urlObj.username = '';
      urlObj.password = '';
    }

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
      authHeader,
      getStreamUrl: (type, id) => `${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json${search}`,
      getSubtitleUrl: (type, id, extra = '') => {
        return `${baseUrl}/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}${formatExtraPath(extra)}.json${search}`;
      },
      getCatalogUrl: (type, catalogId, extra = '') => {
        return `${baseUrl}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}${formatExtraPath(extra)}.json${search}`;
      },
      getMetaUrl: (type, id) => `${baseUrl}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json${search}`
    };
  } catch (err) {
    return null;
  }
}

/**
 * User-Agent customizado do Nuvio Hub combinado com assinatura compatível Stremio/navegador
 * para evitar bloqueios por User-Agent genérico em servidores de manifestos de addons.
 */
export const ADDON_USER_AGENT = 'NuvioHub/1.0 (Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; Stremio/4.4.168)';

/**
 * Headers realistas para evitar bloqueios de Cloudflare ou anti-scrapers.
 */
export const DEFAULT_FETCH_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': ADDON_USER_AGENT,
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

/**
 * Perfis de cabeçalho usados em fallback quando um servidor de addon
 * retorna HTTP 403/401/406 para o primeiro User-Agent.
 */
export const MANIFEST_FETCH_PROFILES = [
  {
    ...DEFAULT_FETCH_HEADERS,
    'Origin': 'https://web.stremio.com',
    'Referer': 'https://web.stremio.com/',
    'Cache-Control': 'no-cache'
  },
  {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'NuvioHub/1.0 Stremio/4.4.168 (Windows NT 10.0; Win64; x64)',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  },
  {
    'Accept': 'application/json, */*;q=0.8',
    'User-Agent': 'NuvioHub/1.0',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  }
];

export function buildAddonFetchHeaders(parsedOrUrl, { authorization = null, profileIndex = 0, extraHeaders = {} } = {}) {
  const parsed = typeof parsedOrUrl === 'string' ? parseAddonUrl(parsedOrUrl) : parsedOrUrl;
  const baseProfile = MANIFEST_FETCH_PROFILES[profileIndex] || DEFAULT_FETCH_HEADERS;
  const headers = {
    ...baseProfile,
    'User-Agent': baseProfile['User-Agent'] || ADDON_USER_AGENT,
    ...extraHeaders
  };
  const rawAuth = typeof authorization === 'string' && authorization.trim()
    ? authorization.trim()
    : parsed?.authHeader || null;
  if (rawAuth) {
    headers['Authorization'] = /^(Basic|Bearer)\s+/i.test(rawAuth) ? rawAuth : `Bearer ${rawAuth}`;
  }
  return headers;
}

export function formatValidatedManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !manifest.id || !manifest.name) {
    return {
      valid: false,
      error: 'JSON retornado não é um manifest Stremio válido (faltando id ou name).'
    };
  }
  const resources = Array.isArray(manifest.resources)
    ? manifest.resources.map(r => (typeof r === 'string' ? r : r?.name)).filter(Boolean)
    : [];
  const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];
  return {
    valid: true,
    id: String(manifest.id),
    name: String(manifest.name),
    description: manifest.description || '',
    resources,
    hasStreamResource: resources.includes('stream'),
    hasSubtitlesResource: resources.includes('subtitles'),
    hasCatalogResource: catalogs.length > 0 || resources.includes('catalog'),
    catalogs,
    types: Array.isArray(manifest.types) ? manifest.types : []
  };
}

/**
 * Valida a sintaxe, segurança e acessibilidade de um manifesto de addon no servidor,
 * aplicando rotação de User-Agent/Origin em caso de HTTP 403/401/406 e suporte a autorização.
 */
export async function validateAddonManifestOnServer(rawUrl, {
  authorization = null,
  clientManifest = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 25000
} = {}) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { statusCode: 400, body: { valid: false, error: 'URL inválida ou vazia.' } };
  }

  const parsed = parseAddonUrl(rawUrl);
  if (!parsed) {
    return { statusCode: 400, body: { valid: false, error: 'Formato de URL inválido.' } };
  }

  try {
    const u = new URL(parsed.manifestUrl);
    const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return {
        statusCode: 400,
        body: { valid: false, error: 'Endereços locais ou privados não são permitidos para addons externos.' }
      };
    }
  } catch {
    return { statusCode: 400, body: { valid: false, error: 'Formato de URL inválido.' } };
  }

  // Se o navegador já obteve o manifesto via CORS (fallback para IPs de datacenter bloqueados por Cloudflare 403)
  if (clientManifest && typeof clientManifest === 'object') {
    const formatted = formatValidatedManifest(clientManifest);
    return { statusCode: 200, body: { ...formatted, normalizedUrl: parsed.manifestUrl } };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let lastResponse = null;
    for (let i = 0; i < MANIFEST_FETCH_PROFILES.length; i++) {
      const headers = buildAddonFetchHeaders(parsed, { authorization, profileIndex: i });
      lastResponse = await fetchImpl(parsed.manifestUrl, {
        signal: controller.signal,
        headers,
        redirect: 'error'
      });
      if (lastResponse.ok) break;
      // Repete com próximo perfil de User-Agent/Origin apenas em erros de bloqueio/autorização HTTP
      if (![401, 403, 406].includes(lastResponse.status)) break;
    }

    clearTimeout(timeoutId);

    if (!lastResponse || !lastResponse.ok) {
      const status = lastResponse?.status || 502;
      const hint = status === 403
        ? 'O servidor retornou HTTP 403 (acesso negado ou protegido por firewall/Cloudflare).'
        : status === 401
          ? 'O servidor retornou HTTP 401 (autorização ou token exigido pelo addon).'
          : `O servidor retornou HTTP ${status}`;
      return {
        statusCode: 200,
        body: {
          valid: false,
          httpStatus: status,
          normalizedUrl: parsed.manifestUrl,
          error: hint
        }
      };
    }

    const manifest = await lastResponse.json();
    const formatted = formatValidatedManifest(manifest);
    return {
      statusCode: 200,
      body: { ...formatted, normalizedUrl: parsed.manifestUrl }
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError';
    return {
      statusCode: 200,
      body: {
        valid: false,
        normalizedUrl: parsed.manifestUrl,
        error: isAbort
          ? 'Tempo limite esgotado (15s). O servidor do addon demorou muito para responder.'
          : 'Erro de conexão com o addon.'
      }
    };
  }
}

/**
 * Verifica se a requisição tem permissão de edição local.
 * Bloqueia qualquer tráfego vindo do Cloudflare Tunnel (cf-connecting-ip)
 * ou de origens externas não autorizadas.
 */
export function isLocalEditorRequest(req, currentPort = 7001) {
  const getHeader = name => (typeof req?.get === 'function' ? req.get(name) : req?.headers?.[name.toLowerCase()]);
  // Proxies e túneis nunca podem atuar como a interface de administração.
  if (['cf-connecting-ip', 'cf-ew-via', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'x-original-host']
    .some(header => getHeader(header))) return false;
  const rawHost = String(getHeader('host') || '').trim();
  let host;
  try {
    host = new URL('http://' + rawHost);
  } catch { return false; }
  const accepted = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (!accepted.has(host.hostname.toLowerCase())) return false;
  if (host.port && host.port !== String(currentPort)) return false;
  const fetchSite = String(getHeader('sec-fetch-site') || '').toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  const origin = getHeader('origin');
  if (origin) {
    try {
      const source = new URL(origin);
      if (!accepted.has(source.hostname.toLowerCase()) ||
          source.protocol !== 'http:' ||
          (source.port || '80') !== (host.port || '80')) return false;
    } catch { return false; }
  }
  return true;
}
