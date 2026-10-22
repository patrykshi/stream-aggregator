/* Nuvio Hub — Artwork Studio 2.0 Document Model & State Manager.
 * Gerencia o esquema estruturado de projetos, dimensões, histórico (Undo/Redo) e variações. */
(() => {
  'use strict';

  const STUDIO_SHAPES = Object.freeze({
    LANDSCAPE: { width: 1280, height: 720, ratio: '16:9', tileShape: 'LANDSCAPE', label: 'Landscape · 16:9 (1280×720)' },
    POSTER: { width: 600, height: 900, ratio: '2:3', tileShape: 'POSTER', label: 'Poster · 2:3 (600×900)' },
    PORTRAIT: { width: 750, height: 1000, ratio: '3:4', tileShape: 'PORTRAIT', label: 'Portrait · 3:4 (750×1000)' },
    SQUARE: { width: 800, height: 800, ratio: '1:1', tileShape: 'SQUARE', label: 'Square / Ícone · 1:1 (800×800)' },
    BACKDROP: { width: 1920, height: 1080, ratio: '16:9', tileShape: 'LANDSCAPE', label: 'Backdrop Coleção · 16:9 HD (1920×1080)' }
  });

  const TILE_SHAPE_MAP = {
    '16:9': 'LANDSCAPE',
    '2:3': 'POSTER',
    '3:4': 'PORTRAIT',
    '1:1': 'SQUARE',
    LANDSCAPE: 'LANDSCAPE',
    POSTER: 'POSTER',
    PORTRAIT: 'PORTRAIT',
    SQUARE: 'SQUARE',
    BACKDROP: 'LANDSCAPE'
  };

  function normalizeShapeKey(raw) {
    const key = String(raw || 'LANDSCAPE').trim().toUpperCase();
    return STUDIO_SHAPES[key] ? key : 'LANDSCAPE';
  }

  function getShapeSpec(raw) {
    const key = normalizeShapeKey(raw);
    return { key, ...STUDIO_SHAPES[key] };
  }

  function createNewProjectDocument({ targetKind = 'folder', targetId = '', title = '', shape = 'LANDSCAPE' } = {}) {
    const spec = getShapeSpec(shape);
    const cleanTitle = String(title || 'Nova Capa').trim();
    const projectId = `proj_${targetKind}_${targetId || Date.now()}`;

    return {
      id: projectId,
      version: 2,
      name: `Capa · ${cleanTitle}`,
      target: {
        kind: targetKind === 'group' ? 'group' : 'folder',
        id: targetId,
        title: cleanTitle,
        tileShape: spec.tileShape
      },
      shape: spec.key,
      tileShape: spec.tileShape,
      ratio: spec.ratio,
      width: spec.width,
      height: spec.height,
      hideTitle: false,
      background: {
        type: 'gradient', // 'solid' | 'gradient' | 'image' | 'mosaic' | 'ai'
        primary: '#182b42',
        secondary: '#060c15',
        accent: '#38bdf8',
        pattern: 'glow',
        direction: 'radial',
        scrimOpacity: 0.75,
        imageUrl: null,
        source: null
      },
      canvasDoc: null,
      variations: [
        {
          id: 'var_1',
          name: 'Versão Principal',
          thumbnail: null,
          canvasDoc: null
        }
      ],
      activeVariationId: 'var_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  class HistoryManager {
    constructor(maxSize = 40) {
      this.maxSize = maxSize;
      this.undoStack = [];
      this.redoStack = [];
      this.isLocked = false;
    }

    push(state) {
      if (this.isLocked || !state) return;
      this.undoStack.push(typeof state === 'string' ? state : JSON.stringify(state));
      if (this.undoStack.length > this.maxSize) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    undo(currentState) {
      if (this.undoStack.length === 0) return null;
      if (currentState) {
        this.redoStack.push(typeof currentState === 'string' ? currentState : JSON.stringify(currentState));
      }
      const prev = this.undoStack.pop();
      return prev ? JSON.parse(prev) : null;
    }

    redo(currentState) {
      if (this.redoStack.length === 0) return null;
      if (currentState) {
        this.undoStack.push(typeof currentState === 'string' ? currentState : JSON.stringify(currentState));
      }
      const next = this.redoStack.pop();
      return next ? JSON.parse(next) : null;
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
    }

    lock() {
      this.isLocked = true;
    }

    unlock() {
      this.isLocked = false;
    }
  }

  globalThis.ArtworkStudioModel = Object.freeze({
    STUDIO_SHAPES,
    TILE_SHAPE_MAP,
    normalizeShapeKey,
    getShapeSpec,
    createNewProjectDocument,
    HistoryManager
  });
})();
