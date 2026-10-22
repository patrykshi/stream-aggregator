/**
 * Permissões de leitura do ingress público. A lista é propositalmente fechada:
 * nenhum endpoint /api de edição pode aparecer no túnel.
 */
export function isPublicReadRoute(method, pathname) {
  if (!['GET', 'HEAD'].includes(method) || typeof pathname !== 'string') return false;
  if (/^\/(?:manifest|collections)\.json$/.test(pathname)) return true;
  if (/^\/health$/.test(pathname)) return true;
  if (/^\/(?:p\/[a-z0-9_-]+\/)?(?:stream|subtitles|catalog|meta)\/[^/]+\/.+\.json$/.test(pathname)) return true;
  if (/^\/p\/[a-z0-9_-]+\/(?:manifest|collections)\.json$/.test(pathname)) return true;
  // Formato antigo com token de configuração codificado.
  if (/^\/[^/]+\/(?:manifest|collections)\.json$/.test(pathname)) return true;
  if (/^\/[^/]+\/(?:stream|subtitles|catalog|meta)\/[^/]+\/.+\.json$/.test(pathname)) return true;
  if (/^\/artwork\/erdb\/[^/]+\/[^/]+\/[^/]+\/[^/]+\.jpg$/.test(pathname)) return true;
  if (/^\/api\/hub\/artwork\/[^/]+\/[^/]+\.webp$/.test(pathname)) return true;
  if (/^\/api\/hub\/artwork\/studio\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/(?:hub|catalog-bridge)\/collections\.json$/.test(pathname)) return true;
  return false;
}
