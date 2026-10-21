/* Nuvio Hub — Prévia da tela inicial do Nuvio (TV & Celular).
 * Reproduz fielmente o comportamento do Nuvio: Home com Hero Carousel + trilhos de coleções,
 * e abertura direta de pastas com abas de fontes e grade de 6 colunas com skeletons. */
(() => {
  'use strict';

  const DEFAULT_HERO_SLIDES = [
    {
      id: 'hero-obsessao',
      name: 'Obsessão',
      meta: 'Terror • Suspense • 2026',
      description: 'Ao desejar a felicidade eterna ao lado da esposa, um romântico incurável acaba preso em um pesadelo sombrio onde cada escolha cobra um preço irreversível.',
      background: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
      poster: 'https://image.tmdb.org/t/p/w780/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg',
      type: 'movie',
      year: 2026
    },
    {
      id: 'hero-dia-d',
      name: 'Dia D',
      meta: 'Ação • Guerra • Drama • 2026',
      description: 'Nas horas decisivas que antecedem a maior operação anfíbia da história, um esquadrão infiltrado precisa neutralizar a linha de defesa costeira antes do amanhecer.',
      background: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
      poster: 'https://image.tmdb.org/t/p/w780/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
      type: 'movie',
      year: 2026
    },
    {
      id: 'hero-ruptura',
      name: 'Ruptura',
      meta: 'Mistério • Ficção Científica • 2025',
      description: 'Funcionários de uma corporação biotecnológica passam por um procedimento cirúrgico que separa suas memórias pessoais das memórias de trabalho.',
      background: 'https://image.tmdb.org/t/p/w1280/ixgFmf1X59PUZam2qbAfskx2gQr.jpg',
      poster: 'https://image.tmdb.org/t/p/w780/lFf6LLrQjYldcZItzOkGmMMigP7.jpg',
      type: 'series',
      year: 2025
    },
    {
      id: 'hero-last-of-us',
      name: 'The Last of Us',
      meta: 'Drama • Ação • Pós-Apocalíptico • 2025',
      description: 'Vinte anos após a destruição da civilização moderna por um fungo mutante, um sobrevivente endurecido é contratado para escoltar uma jovem através de um país devastado.',
      background: 'https://image.tmdb.org/t/p/w1280/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg',
      poster: 'https://image.tmdb.org/t/p/w780/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg',
      type: 'series',
      year: 2025
    }
  ];

  const ui = {
    active: false,
    stage: 'home',
    groupId: null,
    folderId: null,
    sourceIndex: 0,
    page: 0,
    device: 'tv',
    analyze: false,
    searchOpen: false,
    art: 'published',
    search: '',
    loading: false,
    result: null,
    error: '',
    titleIndex: 0,
    heroIndex: 0,
    heroSlides: [...DEFAULT_HERO_SLIDES],
    heroTimer: null,
    cache: new Map(),
    requestSerial: 0,
    controller: null
  };

  let ctx = null;

  const esc = v =>
    String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const url = v => {
    if (typeof v !== 'string' || !v.trim() || v.length > 1800) return '';
    const trimmed = v.trim();
    if (trimmed.startsWith('/api/hub/artwork/') || trimmed.startsWith('/artwork/')) {
      return trimmed;
    }
    try {
      const u = new URL(trimmed, location.origin);
      return u.protocol === 'https:' || (u.protocol === 'http:' && u.origin === location.origin)
        ? u.href
        : '';
    } catch {
      return '';
    }
  };

  const groups = () => ctx?.state?.workspace?.collections || [];
  const group = () => groups().find(x => x.id === ui.groupId);
  const folder = () => group()?.folders?.find(x => x.id === ui.folderId);
  const allSources = f => f?.catalogSources || f?.sources || [];
  const sources = () => allSources(folder());
  const source = () => sources()[ui.sourceIndex];
  const imgOf = f => url(f?.customCoverImageUrl || f?.coverImageUrl || '');
  const heroOf = f => url(f?.heroBackdropUrl || f?.customCoverImageUrl || f?.coverImageUrl || '');
  const totalFolders = () => groups().reduce((n, g) => n + (g.folders || []).length, 0);
  const totalSources = () =>
    groups().reduce((n, g) => n + (g.folders || []).reduce((s, f) => s + allSources(f).length, 0), 0);

  const resolver = () =>
    globalThis.NuvioCollectionLinks.createResolver({
      catalogs: ctx?.state?.workspace?.catalogs || [],
      addons: ctx?.state?.providers || [],
      loaded: ctx?.state?.collectionInventory === 'ready'
    });

  const sourceStatus = s =>
    s ? resolver().resolve(s) : { status: 'missing', label: 'Nenhum catálogo', provider: '' };

  const shape = (f, g = group()) => {
    const raw = String(f?.tileShape || g?.tileShape || 'LANDSCAPE').trim().toUpperCase();
    if (raw === 'POSTER' || raw === '2:3') return 'poster';
    if (raw === 'PORTRAIT' || raw === '3:4') return 'portrait';
    if (raw === 'SQUARE' || raw === '1:1') return 'square';
    return 'landscape';
  };

  const keyOf = s =>
    [s?.addonId, s?.type, s?.catalogId || s?.catalog_id, s?.genre || ''].join('::') + '|' + ui.page;

  function formatSourceTabLabel(s) {
    if (!s) return 'Catálogo';
    const resolved = sourceStatus(s);
    const rawName = String(s.title || resolved.label || s.catalogId || s.catalog_id || 'Catálogo')
      .replace(/^Cinebra\s*·\s*/i, '')
      .trim();
    const typeLabel = s.type === 'series' ? 'Séries' : 'Filmes';
    if (new RegExp(`(•|·|-)\\s*${typeLabel}$`, 'i').test(rawName)) {
      return rawName.replace(/\s*·\s*/g, ' • ');
    }
    return `${rawName} • ${typeLabel}`;
  }

  function cover(src, format = 'landscape', fallbackTitle = '') {
    const u = url(src);
    const cleanFallback = fallbackTitle || 'Sem capa';
    return (
      '<span class="nuvio-preview-art ' +
      esc(format) +
      '">' +
      (u
        ? '<img src="' +
          esc(u) +
          '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' +
          '<span class="nuvio-preview-empty" hidden><b>' +
          esc(cleanFallback) +
          '</b></span>'
        : '<span class="nuvio-preview-empty"><b>' + esc(cleanFallback) + '</b></span>') +
      '</span>'
    );
  }

  function poster(item, i) {
    const published = ui.result?.decorated?.[i]?.poster;
    return (ui.art === 'published' && published) || item?.poster || '';
  }

  function abort() {
    ui.controller?.abort();
    ui.controller = null;
    ui.requestSerial++;
  }

  function stopHeroTimer() {
    if (ui.heroTimer) {
      clearInterval(ui.heroTimer);
      ui.heroTimer = null;
    }
  }

  function startHeroTimer() {
    stopHeroTimer();
    if (!ui.active || ui.stage !== 'home' || ui.heroSlides.length <= 1) return;
    ui.heroTimer = setInterval(() => {
      if (!ui.active || ui.stage !== 'home' || document.hidden) return;
      ui.heroIndex = (ui.heroIndex + 1) % ui.heroSlides.length;
      updateHeroDomInPlace();
    }, 6500);
  }

  function updateHeroDomInPlace() {
    const hero = document.querySelector('.nuvio-preview-hero-carousel');
    if (!hero) return;
    const slide = ui.heroSlides[ui.heroIndex] || ui.heroSlides[0];
    if (!slide) return;
    const img = hero.querySelector('.nuvio-preview-hero-image');
    const titleEl = hero.querySelector('.nuvio-preview-hero-title');
    const metaEl = hero.querySelector('.nuvio-preview-hero-meta');
    const descEl = hero.querySelector('.nuvio-preview-hero-desc');
    if (img && url(slide.background || slide.poster)) {
      img.src = url(slide.background || slide.poster);
    }
    if (titleEl) titleEl.textContent = slide.name || 'Destaque';
    if (metaEl) metaEl.textContent = slide.meta || (slide.type === 'series' ? 'Série' : 'Filme');
    if (descEl) descEl.textContent = slide.description || '';
    hero.querySelectorAll('[data-pv-action="hero-slide"]').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === ui.heroIndex);
      dot.setAttribute('aria-pressed', String(idx === ui.heroIndex));
    });
  }

  function hydrateHeroSlidesFromWorkspace() {
    const customSlides = [];
    const workspaceCatalogs = ctx?.state?.workspace?.catalogs || [];
    for (const cat of workspaceCatalogs) {
      for (const m of cat.metas || []) {
        const bg = url(m.background || m.backdrop || m.poster);
        if (!bg || !m.name) continue;
        const genres = Array.isArray(m.genres) && m.genres.length ? m.genres.slice(0, 2).join(' • ') : (m.type === 'series' ? 'Série' : 'Filme');
        const yearStr = m.year ? String(m.year) : '2025';
        customSlides.push({
          id: m.id || m.name,
          name: m.name,
          meta: `${genres} • ${yearStr}`,
          description: m.description || `Destaque selecionado do catálogo ${cat.name || 'do Hub'}.`,
          background: bg,
          poster: url(m.poster) || bg,
          type: m.type || cat.type || 'movie',
          year: m.year || 2025
        });
        if (customSlides.length >= 5) break;
      }
      if (customSlides.length >= 5) break;
    }
    ui.heroSlides = customSlides.length >= 2
      ? customSlides
      : [...customSlides, ...DEFAULT_HERO_SLIDES].slice(0, 5);
    if (ui.heroIndex >= ui.heroSlides.length) ui.heroIndex = 0;
  }

  function draw({ resetScroll = false, focus = false } = {}) {
    if (!ui.active || !ctx || ctx.state.view !== 'collections') return;
    const active = document.activeElement;
    const old = active?.closest?.('[data-pv-action]');
    const action = old?.dataset.pvAction;
    const id = old?.dataset.id;
    const index = old?.dataset.index;
    const val = old?.dataset.value;
    const searchFocus = active?.matches?.('[data-pv-search]');
    const caret = searchFocus ? active.selectionStart : 0;
    const scroll = resetScroll
      ? 0
      : document.querySelector('.nuvio-preview-main-scroll')?.scrollTop || 0;

    ctx.render();

    const scroller = document.querySelector('.nuvio-preview-main-scroll');
    if (scroller) scroller.scrollTop = scroll;
    if (searchFocus) {
      const node = document.querySelector('[data-pv-search]');
      if (node) {
        node.focus({ preventScroll: true });
        node.setSelectionRange(caret, caret);
      }
    } else if (focus && action) {
      const buttons = [...document.querySelectorAll('[data-pv-action]')];
      const match = buttons.find(
        b =>
          b.dataset.pvAction === action &&
          b.dataset.id === id &&
          b.dataset.index === index &&
          b.dataset.value === val
      );
      match?.focus({ preventScroll: true });
    }
    startHeroTimer();
  }

  function openFolderDirect(groupId, folderId) {
    abort();
    ui.groupId = groupId || ui.groupId;
    ui.folderId = folderId;
    ui.stage = 'folder';
    ui.sourceIndex = 0;
    ui.page = 0;
    ui.titleIndex = 0;
    ui.result = null;
    ui.error = '';
    ui.loading = sources().length > 0;
    draw({ resetScroll: true });
    if (sources().length > 0) {
      void load();
    }
  }

  function setPage(stage, groupId, folderId) {
    abort();
    ui.loading = false;
    ui.result = null;
    ui.error = '';
    ui.page = 0;
    ui.titleIndex = 0;
    ui.stage = stage;
    if (groupId !== undefined) ui.groupId = groupId;
    if (folderId !== undefined) ui.folderId = folderId;
    draw({ resetScroll: true });
  }

  function open(state) {
    if (state) ctx.state = state;
    ui.active = true;
    ui.stage = 'home';
    ui.groupId = null;
    ui.folderId = null;
    ui.sourceIndex = 0;
    ui.page = 0;
    ui.result = null;
    ui.error = '';
    ui.search = '';
    ui.searchOpen = false;
    ui.heroIndex = 0;
    hydrateHeroSlidesFromWorkspace();
    document.body.classList.add('nuvio-preview-open');
    draw({ resetScroll: true });
  }

  function close() {
    abort();
    stopHeroTimer();
    ui.active = false;
    ui.loading = false;
    ui.result = null;
    document.body.classList.remove('nuvio-preview-open');
    if (ctx?.state?.view === 'collections') ctx.render();
  }

  function back() {
    if (ui.stage === 'title') {
      ui.stage = 'folder';
      draw({ focus: true });
      return;
    }
    if (ui.stage === 'folder' || ui.stage === 'catalog' || ui.stage === 'collection') {
      setPage('home', null, null);
      return;
    }
    if (ui.searchOpen) {
      ui.searchOpen = false;
      ui.search = '';
      draw();
      return;
    }
    close();
  }

  async function load(refresh = false) {
    if ((ui.stage !== 'folder' && ui.stage !== 'catalog') || !source()) {
      ui.loading = false;
      draw();
      return;
    }
    const currentSource = source();
    const cacheKey = keyOf(currentSource);
    if (!refresh && ui.cache.has(cacheKey)) {
      ui.result = ui.cache.get(cacheKey);
      ui.loading = false;
      ui.error = '';
      draw();
      return;
    }
    abort();
    const request = ui.requestSerial;
    ui.controller = new AbortController();
    ui.loading = true;
    ui.result = null;
    ui.error = '';
    draw();

    try {
      const res = await fetch('/api/hub/preview/catalog-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: ui.controller.signal,
        body: JSON.stringify({
          addonId: currentSource.addonId,
          type: currentSource.type,
          catalogId: currentSource.catalogId || currentSource.catalog_id,
          genre: currentSource.genre || '',
          page: ui.page,
          refresh
        })
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || 'Falha ao consultar catálogo.');
      if (request !== ui.requestSerial || !ui.active) return;
      ui.result = data;
      ui.cache.set(cacheKey, data);

      // Enrich hero slides with real fetched items that have backgrounds/posters
      if (Array.isArray(data.items) && data.items.length) {
        const fetchedSlides = data.items
          .filter(it => it?.name && (it.background || it.poster))
          .slice(0, 3)
          .map(it => ({
            id: it.id,
            name: it.name,
            meta: `${it.type === 'series' ? 'Série' : 'Filme'}${it.year ? ' • ' + it.year : ''}`,
            description: it.description || `Disponível em ${formatSourceTabLabel(currentSource)}.`,
            background: it.background || it.poster,
            poster: it.poster || it.background,
            type: it.type,
            year: it.year
          }));
        if (fetchedSlides.length) {
          const merged = [...fetchedSlides, ...DEFAULT_HERO_SLIDES];
          const unique = [];
          const seen = new Set();
          for (const s of merged) {
            if (seen.has(s.name)) continue;
            seen.add(s.name);
            unique.push(s);
            if (unique.length >= 5) break;
          }
          ui.heroSlides = unique;
        }
      }
    } catch (e) {
      if (request !== ui.requestSerial || e.name === 'AbortError') return;
      ui.error = e.message || 'O catálogo não pôde ser consultado.';
    } finally {
      if (request === ui.requestSerial) {
        ui.loading = false;
        draw();
      }
    }
  }

  function folderCard(g, f) {
    const image = imgOf(f) || url(g?.coverImageUrl || '');
    const tileFormat = shape(f, g);
    return (
      '<button type="button" class="nuvio-preview-folder-card shape-' +
      esc(tileFormat) +
      ' ' +
      (g.focusGlowEnabled ? 'with-glow' : '') +
      '" data-pv-action="folder" data-group-id="' +
      esc(g.id) +
      '" data-id="' +
      esc(f.id) +
      '" aria-label="Abrir pasta ' +
      esc(f.title) +
      '">' +
      cover(image, tileFormat, f.title) +
      (f.hideTitle
        ? '<span class="sr-only">' + esc(f.title) + '</span>'
        : '<span class="nuvio-preview-folder-overlay-title"><strong>' +
          esc(f.title) +
          '</strong></span>') +
      '</button>'
    );
  }

  function collectionRail(g) {
    const folders = g.folders || [];
    return (
      '<section class="nuvio-preview-rail-block" aria-label="Coleção ' +
      esc(g.title) +
      '">' +
      '<div class="nuvio-preview-rail-heading">' +
      '<div class="nuvio-preview-rail-title-row">' +
      '<span class="nuvio-preview-star" aria-hidden="true">✦</span>' +
      '<h3>' +
      esc(g.title) +
      '</h3>' +
      '</div>' +
      '<span class="nuvio-preview-rail-count">' +
      folders.length +
      ' ' +
      (folders.length === 1 ? 'pasta' : 'pastas') +
      '</span>' +
      '</div>' +
      '<div class="nuvio-preview-rail" data-pv-rail>' +
      (folders.length
        ? folders.map(f => folderCard(g, f)).join('')
        : '<div class="nuvio-preview-rail-empty">Nenhuma pasta nesta coleção.</div>') +
      '</div>' +
      '</section>'
    );
  }

  function renderHeroCarousel() {
    const slides = ui.heroSlides.length ? ui.heroSlides : DEFAULT_HERO_SLIDES;
    const current = slides[ui.heroIndex] || slides[0];
    const bgUrl = url(current.background || current.poster);
    const firstGroup = groups()[0];
    const firstFolder = firstGroup?.folders?.[0];

    return (
      '<section class="nuvio-preview-hero nuvio-preview-hero-carousel" aria-label="Destaque da tela inicial">' +
      (bgUrl
        ? '<img class="nuvio-preview-hero-image" src="' +
          esc(bgUrl) +
          '" alt="" referrerpolicy="no-referrer">'
        : '') +
      '<div class="nuvio-preview-hero-shade"></div>' +
      '<div class="nuvio-preview-hero-copy">' +
      '<h2 class="nuvio-preview-hero-title">' +
      esc(current.name) +
      '</h2>' +
      '<div class="nuvio-preview-hero-meta">' +
      esc(current.meta || 'Filme • 2026') +
      '</div>' +
      '<p class="nuvio-preview-hero-desc">' +
      esc(current.description || '') +
      '</p>' +
      '<div class="nuvio-preview-hero-actions">' +
      (firstGroup && firstFolder
        ? '<button type="button" class="nuvio-preview-hero-cta" data-pv-action="folder" data-group-id="' +
          esc(firstGroup.id) +
          '" data-id="' +
          esc(firstFolder.id) +
          '">Ver Detalhes</button>'
        : '<button type="button" class="nuvio-preview-hero-cta" data-pv-action="hero-next">Ver Detalhes</button>') +
      '</div>' +
      '</div>' +
      '<div class="nuvio-preview-hero-dots" role="tablist" aria-label="Destaques">' +
      slides
        .map(
          (s, idx) =>
            '<button type="button" class="nuvio-preview-hero-dot ' +
            (idx === ui.heroIndex ? 'active' : '') +
            '" data-pv-action="hero-slide" data-index="' +
            idx +
            '" aria-label="Destaque ' +
            (idx + 1) +
            ': ' +
            esc(s.name) +
            '" aria-pressed="' +
            (idx === ui.heroIndex) +
            '"></button>'
        )
        .join('') +
      '</div>' +
      '</section>'
    );
  }

  function renderHomeView() {
    const ordered = [...groups()].sort((a, b) => Number(!!b.pinToTop) - Number(!!a.pinToTop));
    if (!ordered.length) {
      return (
        renderHeroCarousel() +
        '<div class="nuvio-preview-message">Nenhuma coleção configurada ainda. Crie ou importe uma coleção no editor para visualizá-la aqui.</div>'
      );
    }
    return renderHeroCarousel() + '<div class="nuvio-preview-rails-container">' + ordered.map(collectionRail).join('') + '</div>';
  }

  function renderSkeletonGrid(count = 12) {
    return (
      '<div class="nuvio-preview-poster-rail is-skeleton-grid" role="status" aria-label="Carregando títulos da fonte">' +
      Array.from({ length: count })
        .map(
          () =>
            '<div class="nuvio-preview-skeleton-card">' +
            '<div class="nuvio-preview-skeleton-poster"></div>' +
            '<div class="nuvio-preview-skeleton-line is-title"></div>' +
            '<div class="nuvio-preview-skeleton-line is-year"></div>' +
            '</div>'
        )
        .join('') +
      '</div>'
    );
  }

  function renderFolderGridContent() {
    if (ui.loading) {
      return renderSkeletonGrid(12);
    }
    if (ui.error) {
      return (
        '<div class="nuvio-preview-message is-warning" role="alert">' +
        '<span>' +
        esc(ui.error) +
        '</span>' +
        '<button type="button" data-pv-action="reload">Tentar novamente ↻</button>' +
        '</div>'
      );
    }
    if (!ui.result) {
      return renderSkeletonGrid(12);
    }
    if (!ui.result.items?.length) {
      return '<div class="nuvio-preview-message is-warning">O catálogo respondeu sem títulos nesta amostra.</div>';
    }
    return (
      '<div class="nuvio-preview-poster-rail">' +
      ui.result.items
        .map(
          (item, i) =>
            '<button type="button" class="nuvio-preview-title" data-pv-action="title" data-index="' +
            i +
            '">' +
            cover(poster(item, i), 'poster', item.name || 'Sem cartaz') +
            '<strong>' +
            esc(item.name) +
            '</strong>' +
            '<small>' +
            esc(item.year || (item.type === 'series' ? 'Série' : 'Filme')) +
            '</small>' +
            '</button>'
        )
        .join('') +
      '</div>' +
      (ui.result.hasMore || ui.page > 0
        ? '<div class="nuvio-preview-pagination">' +
          '<button type="button" data-pv-action="previous" ' +
          (ui.page === 0 ? 'disabled' : '') +
          '>← Página anterior</button>' +
          '<span>Página ' +
          (ui.page + 1) +
          ' · ' +
          ui.result.items.length +
          ' títulos exibidos</span>' +
          '<button type="button" data-pv-action="next" ' +
          (!ui.result.hasMore ? 'disabled' : '') +
          '>Mais títulos →</button>' +
          '</div>'
        : '')
    );
  }

  function renderFolderTabbedView() {
    const g = group();
    const f = folder();
    if (!f) return '<div class="nuvio-preview-message">Pasta não encontrada.</div>';
    const links = allSources(f);
    const folderImg = imgOf(f) || url(g?.coverImageUrl || '');
    const backdropImg = heroOf(f) || url(g?.backdropImageUrl || g?.coverImageUrl || '');
    const folderShape = shape(f, g);

    return (
      '<div class="nuvio-preview-folder-page">' +
      '<div class="nuvio-preview-folder-hero">' +
      (backdropImg
        ? '<img class="nuvio-preview-folder-hero-bg" src="' +
          esc(backdropImg) +
          '" alt="" referrerpolicy="no-referrer">'
        : '') +
      '<div class="nuvio-preview-folder-hero-scrim"></div>' +
      '<button type="button" class="nuvio-preview-back-pill" data-pv-action="home">← Voltar ao início</button>' +
      '<div class="nuvio-preview-folder-identity">' +
      '<div class="nuvio-preview-folder-thumb shape-' +
      esc(folderShape) +
      '">' +
      cover(folderImg, folderShape, f.title) +
      '</div>' +
      '<div class="nuvio-preview-folder-meta">' +
      '<span class="nuvio-preview-folder-overline"><i aria-hidden="true">✦</i> ' +
      esc((g?.title || 'COLEÇÃO').toUpperCase()) +
      '</span>' +
      '<h2>' +
      esc(f.title) +
      '</h2>' +
      '<span class="nuvio-preview-folder-sub">' +
      links.length +
      ' ' +
      (links.length === 1 ? 'fonte' : 'fontes') +
      '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      (links.length
        ? '<div class="nuvio-preview-tabs" role="tablist" aria-label="Fontes da pasta">' +
          links
            .map(
              (row, i) =>
                '<button type="button" role="tab" class="nuvio-preview-tab ' +
                (i === ui.sourceIndex ? 'active' : '') +
                '" aria-selected="' +
                (i === ui.sourceIndex) +
                '" aria-pressed="' +
                (i === ui.sourceIndex) +
                '" data-pv-action="source" data-index="' +
                i +
                '">' +
                esc(formatSourceTabLabel(row)) +
                '</button>'
            )
            .join('') +
          '</div>' +
          renderFolderGridContent()
        : '<div class="nuvio-preview-message">Esta pasta ainda não possui catálogos vinculados. Adicione catálogos no editor para visualizar as abas e os pôsteres.</div>') +
      '</div>'
    );
  }

  function renderTitleView() {
    const item = ui.result?.items?.[ui.titleIndex];
    if (!item) return '<div class="nuvio-preview-message">Título não disponível nesta amostra.</div>';
    const bgUrl = url(item.background || poster(item, ui.titleIndex));
    return (
      '<div class="nuvio-preview-folder-page">' +
      '<div class="nuvio-preview-folder-hero">' +
      (bgUrl
        ? '<img class="nuvio-preview-folder-hero-bg" src="' +
          esc(bgUrl) +
          '" alt="" referrerpolicy="no-referrer">'
        : '') +
      '<div class="nuvio-preview-folder-hero-scrim"></div>' +
      '<button type="button" class="nuvio-preview-back-pill" data-pv-action="back">← Voltar para ' +
      esc(folder()?.title || 'a pasta') +
      '</button>' +
      '</div>' +
      '<div class="nuvio-preview-title-detail">' +
      cover(poster(item, ui.titleIndex), 'poster', item.name || 'Sem cartaz') +
      '<div>' +
      '<span class="nuvio-preview-overline">FICHA DO TÍTULO · PRÉVIA</span>' +
      '<h3>' +
      esc(item.name) +
      '</h3>' +
      '<p class="nuvio-preview-title-meta">' +
      (item.type === 'series' ? 'Série' : 'Filme') +
      (item.year ? ' • ' + esc(item.year) : '') +
      '</p>' +
      '<p>' +
      esc(item.description || 'Sinopse não informada pelo catálogo de origem.') +
      '</p>' +
      '<button type="button" class="nuvio-preview-hero-cta" data-pv-action="back">← Voltar aos pôsteres</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSearchResults() {
    if (!ui.search.trim()) return null;
    const q = ui.search.trim().toLocaleLowerCase('pt-BR');
    const filtered = groups().flatMap(g =>
      (g.folders || [])
        .filter(f => (g.title + ' ' + f.title).toLocaleLowerCase('pt-BR').includes(q))
        .map(f => ({ g, f }))
    );
    return (
      '<div class="nuvio-preview-search-results">' +
      '<div class="nuvio-preview-rail-heading"><h3>Resultados para "' +
      esc(ui.search) +
      '"</h3><span class="nuvio-preview-rail-count">' +
      filtered.length +
      ' pastas</span></div>' +
      '<div class="nuvio-preview-library-grid">' +
      filtered.slice(0, 50).map(x => folderCard(x.g, x.f)).join('') +
      '</div>' +
      (!filtered.length
        ? '<div class="nuvio-preview-message">Nenhuma pasta encontrada para esta busca.</div>'
        : '') +
      '</div>'
    );
  }

  function audit() {
    const g = group();
    const f = folder();
    const s = source();
    const info = s ? sourceStatus(s) : null;
    const issues = [];
    if (g && !(g.folders || []).length) issues.push('Coleção sem pastas.');
    if (f && !allSources(f).length) issues.push('Pasta sem catálogos.');
    if (info?.status === 'missing') issues.push('Origem não reconhecida: ' + info.reason);
    if (ui.error) issues.push('Falha na consulta: ' + ui.error);
    if (ui.result?.status === 'empty') issues.push('O addon respondeu sem títulos.');
    if (ui.result?.missingPosters) issues.push(ui.result.missingPosters + ' cartazes ausentes nesta amostra.');
    return (
      '<aside class="nuvio-preview-inspector" aria-label="Diagnóstico da coleção">' +
      '<div class="nuvio-preview-inspector-top"><span class="nuvio-preview-overline">DIAGNÓSTICO</span>' +
      '<h3>Inspeção da Prévia</h3><p>Estrutura carregada em tempo real a partir do seu editor.</p></div>' +
      '<div class="nuvio-preview-inspector-stats"><span><b>' +
      groups().length +
      '</b>Coleções</span>' +
      '<span><b>' +
      totalFolders() +
      '</b>Pastas</span><span><b>' +
      totalSources() +
      '</b>Fontes</span></div>' +
      (g ? '<div class="nuvio-preview-audit-section"><b>Coleção</b><span>' + esc(g.title) + '</span></div>' : '') +
      (f
        ? '<div class="nuvio-preview-audit-section"><b>Pasta</b><span>' +
          esc(f.title) +
          '</span><small>Proporção: ' +
          esc(f.tileShape || 'LANDSCAPE') +
          '</small></div>'
        : '') +
      (info
        ? '<div class="nuvio-preview-audit-section"><b>Fonte ativa</b><span>' +
          esc(info.label) +
          '</span><small>' +
          esc(info.provider || s.addonId) +
          '</small><small>Títulos carregados: ' +
          (ui.result?.count ?? '—') +
          '</small></div>'
        : '') +
      (issues.length
        ? '<div class="nuvio-preview-issues"><strong>Pontos de atenção</strong>' +
          issues.map(item => '<p>' + esc(item) + '</p>').join('') +
          '</div>'
        : '<div class="nuvio-preview-ok">Estrutura íntegra e pronta para publicação no Nuvio.</div>') +
      '<button type="button" data-pv-action="edit-selection" class="nuvio-preview-inspect-edit">Editar esta seleção →</button>' +
      '</aside>'
    );
  }

  function render() {
    if (!ui.active || !ctx) return '';
    const filtered = renderSearchResults();
    const viewContent =
      filtered ||
      (ui.stage === 'folder' || ui.stage === 'catalog'
        ? renderFolderTabbedView()
        : ui.stage === 'title'
          ? renderTitleView()
          : renderHomeView());

    return (
      '<div class="nuvio-preview-root nuvio-preview-modal-backdrop" data-preview-active="true" role="dialog" aria-modal="true" aria-label="Prévia da tela inicial do Nuvio">' +
      '<div class="nuvio-preview-modal-window">' +
      '<header class="nuvio-preview-modal-header">' +
      '<div class="nuvio-preview-modal-titles">' +
      '<strong>Prévia da tela inicial do Nuvio</strong>' +
      '<small>Confira como suas coleções, capas e abas serão exibidas</small>' +
      '</div>' +
      '<div class="nuvio-preview-modal-actions">' +
      '<div class="nuvio-preview-device-switch" role="group" aria-label="Modo de tela">' +
      '<button type="button" data-pv-action="device" data-value="tv" class="' +
      (ui.device === 'tv' ? 'active' : '') +
      '" aria-pressed="' +
      (ui.device === 'tv') +
      '">▣ TV</button>' +
      '<button type="button" data-pv-action="device" data-value="mobile" class="' +
      (ui.device === 'mobile' ? 'active' : '') +
      '" aria-pressed="' +
      (ui.device === 'mobile') +
      '">▯ Celular</button>' +
      '</div>' +
      '<button type="button" class="nuvio-preview-close-btn" data-pv-action="exit" aria-label="Fechar prévia" title="Fechar (Esc)">✕</button>' +
      '</div>' +
      '</header>' +
      (ui.searchOpen
        ? '<div class="nuvio-preview-search-bar">' +
          '<label>⌕ <input data-pv-search type="search" placeholder="Filtrar coleções ou pastas na prévia..." value="' +
          esc(ui.search) +
          '"></label>' +
          '<button type="button" data-pv-action="toggle-search">Fechar busca</button>' +
          '</div>'
        : '') +
      '<div class="nuvio-preview-layout ' +
      (ui.analyze ? 'with-inspector' : '') +
      '">' +
      '<div class="nuvio-preview-device ' +
      esc(ui.device) +
      '">' +
      '<div class="nuvio-preview-screen" tabindex="-1" aria-label="Tela simulada do aplicativo Nuvio">' +
      '<aside class="nuvio-preview-side-rail" aria-label="Menu lateral da TV">' +
      '<button type="button" data-pv-action="home" class="nuvio-preview-rail-icon ' +
      (ui.stage === 'home' && !ui.searchOpen ? 'active' : '') +
      '" title="Início" aria-label="Início">⌂</button>' +
      '<button type="button" data-pv-action="toggle-search" class="nuvio-preview-rail-icon ' +
      (ui.searchOpen ? 'active' : '') +
      '" title="Buscar" aria-label="Buscar">⌕</button>' +
      '<button type="button" data-pv-action="analyze" class="nuvio-preview-rail-icon ' +
      (ui.analyze ? 'active' : '') +
      '" title="Inspecionar configuração" aria-label="Inspecionar configuração">⚙</button>' +
      '</aside>' +
      '<div class="nuvio-preview-main-scroll" data-preview-step="' +
      esc(ui.stage) +
      '">' +
      '<div class="nuvio-preview-body">' +
      viewContent +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      (ui.analyze ? audit() : '') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function handle(action, target) {
    switch (action) {
      case 'exit':
        return close();
      case 'home':
        ui.searchOpen = false;
        ui.search = '';
        return setPage('home', null, null);
      case 'folder':
        return openFolderDirect(target.dataset.groupId || ui.groupId, target.dataset.id);
      case 'source':
        ui.sourceIndex = Number(target.dataset.index) || 0;
        ui.page = 0;
        ui.result = null;
        ui.error = '';
        ui.loading = true;
        draw({ focus: true });
        return void load();
      case 'reload':
        return void load(true);
      case 'previous':
        if (ui.page > 0) {
          ui.page--;
          ui.result = null;
          return void load();
        }
        return;
      case 'next':
        if (!ui.result?.hasMore) return;
        ui.page++;
        ui.result = null;
        return void load();
      case 'title':
        ui.titleIndex = Number(target.dataset.index) || 0;
        ui.stage = 'title';
        return draw({ resetScroll: true });
      case 'hero-slide':
        ui.heroIndex = Number(target.dataset.index) || 0;
        updateHeroDomInPlace();
        startHeroTimer();
        return;
      case 'hero-next':
        ui.heroIndex = (ui.heroIndex + 1) % Math.max(1, ui.heroSlides.length);
        updateHeroDomInPlace();
        startHeroTimer();
        return;
      case 'toggle-search':
        ui.searchOpen = !ui.searchOpen;
        if (!ui.searchOpen) ui.search = '';
        draw();
        if (ui.searchOpen) {
          document.querySelector('[data-pv-search]')?.focus();
        }
        return;
      case 'back':
        return back();
      case 'device':
        ui.device = target.dataset.value === 'mobile' ? 'mobile' : 'tv';
        return draw({ focus: true });
      case 'analyze':
        ui.analyze = !ui.analyze;
        return draw({ focus: true });
      case 'edit-selection':
        if (ui.groupId) ctx.state.selectedGroup = ui.groupId;
        if (ui.folderId) ctx.state.selectedFolder = ui.folderId;
        return close();
    }
  }

  function spatialNav(e) {
    const focus = document.activeElement;
    if (!focus || !focus.closest?.('.nuvio-preview-screen')) return;
    const scope = document.querySelector('.nuvio-preview-screen');
    const candidates = [...scope.querySelectorAll('button:not([disabled])')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.hidden;
    });
    const center = el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const current = center(focus);
    const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    const sign = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const possibilities = candidates
      .filter(x => x !== focus)
      .map(el => {
        const c = center(el);
        const dx = c.x - current.x;
        const dy = c.y - current.y;
        const forward = (horizontal ? dx : dy) * sign;
        if (forward < 8) return null;
        const parallel = Math.abs(horizontal ? dy : dx);
        return { el, score: forward + parallel * 2.3 };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    if (possibilities[0]) {
      e.preventDefault();
      possibilities[0].el.focus({ preventScroll: true });
      possibilities[0].el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
  }

  function install(state, renderApp) {
    ctx = { state, render: renderApp };
    document.getElementById('app').addEventListener(
      'click',
      e => {
        if (!ui.active) return;
        const el = e.target.closest('[data-pv-action]');
        if (el) {
          e.preventDefault();
          e.stopImmediatePropagation();
          handle(el.dataset.pvAction, el);
          return;
        }
        if (e.target.classList.contains('nuvio-preview-modal-backdrop')) {
          e.preventDefault();
          close();
        }
      },
      true
    );
    document.getElementById('app').addEventListener(
      'input',
      e => {
        if (!ui.active || !e.target.matches('[data-pv-search]')) return;
        ui.search = e.target.value;
        draw();
      },
      true
    );
    document.addEventListener(
      'keydown',
      e => {
        if (!ui.active || !document.getElementById('modal').hidden) return;
        if (
          e.key === 'Escape' ||
          (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))
        ) {
          e.preventDefault();
          back();
          return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) spatialNav(e);
      },
      true
    );
  }

  globalThis.NuvioPreview = { install, open, close, render, isActive: () => ui.active };
})();