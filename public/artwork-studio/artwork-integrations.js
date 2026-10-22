/* Nuvio Hub — Artwork Studio 2.0 Backend Integrations Client
 * Comunicação com TMDB, Gerador Python Original de Mosaicos, Gemini IA e Armazenamento Local de Projetos. */
(() => {
  'use strict';

  async function apiRequest(endpoint, options = {}) {
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data;
  }

  // TMDB Candidates
  async function searchTmdbCandidates({ query = '', sources = [] } = {}) {
    return apiRequest('/api/hub/artwork/tmdb-candidates', {
      method: 'POST',
      body: JSON.stringify({ query, sources })
    });
  }

  // Original Python Mosaics
  async function getMosaicCategories() {
    return apiRequest('/api/hub/artwork/mosaic-categories');
  }

  async function searchMosaicCategories(group, q) {
    return apiRequest('/api/hub/artwork/mosaic-search', {
      method: 'POST',
      body: JSON.stringify({ group, q })
    });
  }

  async function addCustomMosaicCategory(group, option) {
    return apiRequest('/api/hub/artwork/mosaic-add', {
      method: 'POST',
      body: JSON.stringify({ group, option })
    });
  }

  async function composeOriginalMosaic({ group, category, cards = 16, shape = 'LANDSCAPE', title = '' }) {
    return apiRequest('/api/hub/artwork/mosaic-compose', {
      method: 'POST',
      body: JSON.stringify({
        group,
        category,
        cards: Number(cards) || 16,
        shape,
        title,
        hideTitle: true,
        save: false
      })
    });
  }

  // Gemini AI
  async function generateAiArtwork({ prompt, style = 'cinema', shape = 'LANDSCAPE', title = '' }) {
    return apiRequest('/api/hub/artwork/generate-ai', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        style,
        shape,
        title,
        hideTitle: true,
        save: false
      })
    });
  }

  // Assets Upload
  async function uploadAsset(dataUrl, filenameHint = 'upload') {
    return apiRequest('/api/hub/artwork/assets', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filenameHint })
    });
  }

  // Export Artwork
  async function exportArtwork({ dataUrl, shape = 'LANDSCAPE', format = 'webp', quality = 90, title = '' }) {
    return apiRequest('/api/hub/artwork/export', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, shape, format, quality, title })
    });
  }

  // Project Document Persistence
  async function listProjects() {
    return apiRequest('/api/hub/artwork/projects');
  }

  async function getProject(id) {
    return apiRequest(`/api/hub/artwork/projects/${encodeURIComponent(id)}`);
  }

  async function saveProject(doc) {
    return apiRequest('/api/hub/artwork/projects', {
      method: 'POST',
      body: JSON.stringify(doc)
    });
  }

  async function deleteProject(id) {
    return apiRequest(`/api/hub/artwork/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  globalThis.ArtworkStudioIntegrations = Object.freeze({
    searchTmdbCandidates,
    getMosaicCategories,
    searchMosaicCategories,
    addCustomMosaicCategory,
    composeOriginalMosaic,
    generateAiArtwork,
    uploadAsset,
    exportArtwork,
    listProjects,
    getProject,
    saveProject,
    deleteProject
  });
})();
