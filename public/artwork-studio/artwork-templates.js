/* Nuvio Hub — Artwork Studio 2.0 Templates & Preset Library
 * Coleções de templates visuais, gradientes, tipografias prontas e elementos gráficos. */
(() => {
  'use strict';

  const TEMPLATES = [
    {
      id: 'cinematic-dark',
      name: 'Cinema Dark',
      category: 'cinematic',
      thumbnail: 'linear-gradient(135deg, #090d16 0%, #1e293b 60%, #05070c 100%)',
      apply: (canvas, title = 'CINEMA') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#1e293b',
          secondary: '#070a12',
          accent: '#38bdf8',
          direction: 'radial',
          scrimOpacity: 0.70
        });
        canvas.addIconBadge({ icon: '✦', size: 68, fill: '#38bdf8', top: canvas.height * 0.36 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.09),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#ffffff',
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'COLEÇÃO CINEMATOGRÁFICA',
          fontSize: Math.round(canvas.height * 0.034),
          fontFamily: 'Manrope',
          fontWeight: 'normal',
          fill: '#94a3b8',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    },
    {
      id: 'modern-minimal',
      name: 'Minimalista Neon',
      category: 'modern',
      thumbnail: 'linear-gradient(135deg, #0369a1 0%, #082f49 50%, #020617 100%)',
      apply: (canvas, title = 'DESCOBRIR') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#0369a1',
          secondary: '#030712',
          accent: '#38bdf8',
          direction: 'diagonal',
          scrimOpacity: 0.65
        });
        canvas.addIconBadge({ icon: '🔭', size: 76, fill: '#38bdf8', top: canvas.height * 0.38 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.10),
          fontFamily: 'Manrope',
          fontWeight: '900',
          fill: '#ffffff',
          top: canvas.height * 0.75,
          isTitle: true
        });
        canvas.addShape('line', { fill: '#38bdf8', strokeWidth: 3, top: canvas.height * 0.83 });
        canvas.addText({
          text: 'COLEÇÃO DE FILMES & SÉRIES',
          fontSize: Math.round(canvas.height * 0.04),
          fontFamily: 'Manrope',
          fontWeight: '600',
          fill: '#94a3b8',
          top: canvas.height * 0.88,
          isSubtitle: true
        });
      }
    },
    {
      id: 'sci-fi-cyber',
      name: 'Sci-Fi & Cyberpunk',
      category: 'scifi',
      thumbnail: 'linear-gradient(135deg, #701a75 0%, #1e1b4b 60%, #020617 100%)',
      apply: (canvas, title = 'SCI-FI') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#6b21a8',
          secondary: '#070514',
          accent: '#22d3ee',
          direction: 'diagonal',
          scrimOpacity: 0.72
        });
        canvas.addIconBadge({ icon: '◈', size: 72, fill: '#22d3ee', top: canvas.height * 0.36 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.095),
          fontFamily: 'Manrope',
          fontWeight: '900',
          fill: '#ffffff',
          stroke: '#22d3ee',
          strokeWidth: 1.5,
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'FUTURO · ESPAÇO · DISTOPIA',
          fontSize: Math.round(canvas.height * 0.034),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#22d3ee',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    },
    {
      id: 'action-blockbuster',
      name: 'Ação & Adrenalina',
      category: 'action',
      thumbnail: 'linear-gradient(135deg, #c2410c 0%, #431407 60%, #050201 100%)',
      apply: (canvas, title = 'AÇÃO') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#ea580c',
          secondary: '#1c0a04',
          accent: '#fdba74',
          direction: 'diagonal',
          scrimOpacity: 0.75
        });
        canvas.addIconBadge({ icon: '⚡', size: 74, fill: '#f97316', top: canvas.height * 0.36 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.105),
          fontFamily: 'Manrope',
          fontWeight: '900',
          fill: '#ffffff',
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'ADRENALINA & BLOCKBUSTERS',
          fontSize: Math.round(canvas.height * 0.033),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#fdba74',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    },
    {
      id: 'uhd-4k-gold',
      name: '4K Ultra HD Master',
      category: 'premium',
      thumbnail: 'linear-gradient(135deg, #312e81 0%, #172554 50%, #030712 100%)',
      apply: (canvas, title = '4K ULTRA HD') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#1e3a8a',
          secondary: '#050a18',
          accent: '#facc15',
          direction: 'radial',
          scrimOpacity: 0.68
        });
        canvas.addShape('badgeBox', { size: 90, stroke: '#facc15', fill: '#050a18', top: canvas.height * 0.35 });
        canvas.addText({
          text: '4K',
          fontSize: 38,
          fontFamily: 'Manrope',
          fontWeight: '900',
          fill: '#facc15',
          top: canvas.height * 0.35
        });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.088),
          fontFamily: 'Manrope',
          fontWeight: '900',
          fill: '#ffffff',
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'HDR10+ · DOLBY VISION · REMUX',
          fontSize: Math.round(canvas.height * 0.032),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#fde047',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    },
    {
      id: 'anime-shonen',
      name: 'Anime & Manga',
      category: 'anime',
      thumbnail: 'linear-gradient(135deg, #be185d 0%, #500724 60%, #090104 100%)',
      apply: (canvas, title = 'ANIME') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#be185d',
          secondary: '#18040d',
          accent: '#f472b6',
          direction: 'diagonal',
          scrimOpacity: 0.70
        });
        canvas.addIconBadge({ icon: '⛩', size: 76, fill: '#f472b6', top: canvas.height * 0.36 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.10),
          fontFamily: 'Manrope',
          fontWeight: '900',
          fill: '#ffffff',
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'SHONEN · SEINEN · SIMULCASTS',
          fontSize: Math.round(canvas.height * 0.033),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#fbcfe8',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    },
    {
      id: 'horror-dark',
      name: 'Terror & Suspense',
      category: 'horror',
      thumbnail: 'linear-gradient(135deg, #881337 0%, #310813 60%, #050102 100%)',
      apply: (canvas, title = 'TERROR') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#881337',
          secondary: '#0a0306',
          accent: '#f87171',
          direction: 'radial',
          scrimOpacity: 0.78
        });
        canvas.addIconBadge({ icon: '☾', size: 74, fill: '#f87171', top: canvas.height * 0.36 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.095),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#ffffff',
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'SUSPENSE · SOBRENATURAL · SLASHER',
          fontSize: Math.round(canvas.height * 0.032),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#fca5a5',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    },
    {
      id: 'retro-classics',
      name: 'Clássicos & Cult',
      category: 'classic',
      thumbnail: 'linear-gradient(135deg, #78350f 0%, #291003 60%, #050200 100%)',
      apply: (canvas, title = 'CLÁSSICOS') => {
        canvas.clearUserLayers();
        canvas.applyBackground({
          type: 'gradient',
          primary: '#b45309',
          secondary: '#170902',
          accent: '#fcd34d',
          direction: 'radial',
          scrimOpacity: 0.72
        });
        canvas.addIconBadge({ icon: '♛', size: 74, fill: '#fcd34d', top: canvas.height * 0.36 });
        canvas.addText({
          text: title.toUpperCase(),
          fontSize: Math.round(canvas.height * 0.09),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#ffffff',
          top: canvas.height * 0.74,
          isTitle: true
        });
        canvas.addText({
          text: 'OBRAS-PRIMAS DO CINEMA',
          fontSize: Math.round(canvas.height * 0.033),
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          fill: '#fde68a',
          top: canvas.height * 0.84,
          isSubtitle: true
        });
      }
    }
  ];

  const GRADIENTS = [
    { name: 'Azul Espaço', primary: '#1e3a8a', secondary: '#050b18', accent: '#38bdf8', dir: 'radial' },
    { name: 'Carmesim Noturno', primary: '#881337', secondary: '#090204', accent: '#fb7185', dir: 'diagonal' },
    { name: 'Cyber Neon', primary: '#6b21a8', secondary: '#070514', accent: '#22d3ee', dir: 'diagonal' },
    { name: 'Esmeralda', primary: '#065f46', secondary: '#02120d', accent: '#34d399', dir: 'radial' },
    { name: 'Laranja Solar', primary: '#ea580c', secondary: '#180702', accent: '#fdba74', dir: 'diagonal' },
    { name: 'Grafite Noir', primary: '#334155', secondary: '#06090e', accent: '#cbd5e1', dir: 'radial' },
    { name: 'Dourado Master', primary: '#854d0e', secondary: '#130c02', accent: '#fde047', dir: 'radial' },
    { name: 'Violeta Escuro', primary: '#4c1d95', secondary: '#090314', accent: '#c084fc', dir: 'diagonal' }
  ];

  const SOLID_COLORS = [
    '#070a12', '#0b1329', '#0d1d17', '#1f0d14',
    '#1c1006', '#141416', '#171724', '#04111d'
  ];

  const TYPOGRAPHY_PRESETS = [
    { icon: '✦', label: '✦ Filmes', title: 'Filmes', subtitle: 'LANÇAMENTOS & SUCESSOS' },
    { icon: '🔭', label: '🔭 Descobrir', title: 'Descobrir', subtitle: 'RECOMENDAÇÕES DA SEMANA' },
    { icon: '★', label: '★ Favoritos', title: 'Favoritos', subtitle: 'SELEÇÃO PESSOAL' },
    { icon: '⚡', label: '⚡ Ação', title: 'Ação', subtitle: 'ADRENALINA & BLOCKBUSTERS' },
    { icon: '⛩', label: '⛩ Anime', title: 'Anime', subtitle: 'SÉRIES & FILMES DE ANIME' },
    { icon: '4K', label: '4K Ultra HD', title: '4K Ultra HD', subtitle: 'MÁXIMA DEFINIÇÃO' },
    { icon: '🎬', label: '🎬 Séries', title: 'Séries', subtitle: 'TEMPORADAS COMPLETAS' },
    { icon: '☾', label: '☾ Terror', title: 'Terror', subtitle: 'SUSPENSE & SOBRENATURAL' },
    { icon: '◈', label: '◈ Sci-Fi', title: 'Ficção Científica', subtitle: 'FUTURO & DISTOPIA' },
    { icon: '♛', label: '♛ Clássicos', title: 'Clássicos', subtitle: 'HISTÓRIA DO CINEMA' }
  ];

  const ICON_GLYPHS = ['✦', '★', '◆', '◈', '●', '▣', '♥', '♪', '🔭', '🎬', '⚡', '⛩', '☾', '♛', '4K', 'BL'];

  globalThis.ArtworkStudioTemplates = Object.freeze({
    TEMPLATES,
    GRADIENTS,
    SOLID_COLORS,
    TYPOGRAPHY_PRESETS,
    ICON_GLYPHS
  });
})();
