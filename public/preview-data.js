/* Dados da prévia: isolados do controlador DOM do simulador. */
(() => {
  'use strict';
  function heroSlidesFromCatalogs(catalogs, safeUrl, max = 5) {
    const slides = [], seen = new Set();
    for (const catalog of catalogs || []) {
      for (const meta of catalog?.metas || []) {
        if (!meta?.name) continue;
        const background = safeUrl(meta.background || meta.backdrop || meta.poster);
        if (!background) continue;
        const key = `${meta.type || catalog.type || 'movie'}::${meta.id || meta.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const type = meta.type || catalog.type || 'movie';
        const genres = Array.isArray(meta.genres) && meta.genres.length
          ? meta.genres.slice(0, 2).join(' • ') : type === 'series' ? 'Série' : 'Filme';
        slides.push({id: meta.id || meta.name, name: meta.name,
          meta: `${genres}${meta.year ? ` • ${meta.year}` : ''}`,
          description: meta.description || `Destaque selecionado do catálogo ${catalog.name || 'do Hub'}.`,
          background, poster: safeUrl(meta.poster) || background,
          type, year: meta.year || null});
        if (slides.length >= max) return slides;
      }
    }
    return slides;
  }
  globalThis.NuvioPreviewData = Object.freeze({heroSlidesFromCatalogs});
})();
