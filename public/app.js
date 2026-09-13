// Estado da aplicação
const state = {
  addons: [],
  customCatalogs: [],
  filters: {
    resolutions: ['4k', '1080p', '720p', '480p'],
    removeCams: true,
    deduplicate: true,
    excludeRegex: '',
    maxStreamsPerAddon: 10,
    maxTotalStreams: 30,
    subtitleLanguages: ['pob', 'por', 'eng']
  },
  badgeFormat: 'addon'
};

// Elementos DOM - Abas
const tabBtnAddons = document.getElementById('tabBtnAddons');
const tabBtnCatalogs = document.getElementById('tabBtnCatalogs');
const tabContentAddons = document.getElementById('tabContentAddons');
const tabContentCatalogs = document.getElementById('tabContentCatalogs');
const tabAddonsBadge = document.getElementById('tabAddonsBadge');
const tabCatalogsBadge = document.getElementById('tabCatalogsBadge');

// Elementos DOM - Provedores
const addonUrlInput = document.getElementById('addonUrlInput');
const addonNameInput = document.getElementById('addonNameInput');
const btnAddAddon = document.getElementById('btnAddAddon');
const btnAddText = document.getElementById('btnAddText');
const addAddonFeedback = document.getElementById('addAddonFeedback');
const addonListEl = document.getElementById('addonList');
const emptyStateEl = document.getElementById('emptyState');
const addonCountBadge = document.getElementById('addonCountBadge');

// Elementos DOM - Catálogos Studio
const btnSyncCatalogs = document.getElementById('btnSyncCatalogs');
const btnNewMergedCatalog = document.getElementById('btnNewMergedCatalog');
const catalogItemsList = document.getElementById('catalogItemsList');
const catalogEmptyState = document.getElementById('catalogEmptyState');

// Elementos DOM - Modal Catálogo Mesclado
const mergedCatalogModal = document.getElementById('mergedCatalogModal');
const btnCloseMergedModal = document.getElementById('btnCloseMergedModal');
const btnCancelMergedModal = document.getElementById('btnCancelMergedModal');
const btnSaveMergedModal = document.getElementById('btnSaveMergedModal');
const modalMergedId = document.getElementById('modalMergedId');
const modalMergedTitle = document.getElementById('modalMergedTitle');
const modalMergedName = document.getElementById('modalMergedName');
const modalMergedType = document.getElementById('modalMergedType');
const mergedSourcesChecklist = document.getElementById('mergedSourcesChecklist');
const modalMergedFeedback = document.getElementById('modalMergedFeedback');

// Filtros DOM
const res4k = document.getElementById('res4k');
const res1080p = document.getElementById('res1080p');
const res720p = document.getElementById('res720p');
const res480p = document.getElementById('res480p');
const filterRemoveCams = document.getElementById('filterRemoveCams');
const filterDeduplicate = document.getElementById('filterDeduplicate');
const filterRegex = document.getElementById('filterRegex');
const maxStreamsPerAddon = document.getElementById('maxStreamsPerAddon');
const maxTotalStreams = document.getElementById('maxTotalStreams');
const badgeFormat = document.getElementById('badgeFormat');

// Legendas DOM
const subPob = document.getElementById('subPob');
const subPor = document.getElementById('subPor');
const subEng = document.getElementById('subEng');
const subSpa = document.getElementById('subSpa');

// Instalação DOM
const btnInstallStremio = document.getElementById('btnInstallStremio');
const btnCopyUrl = document.getElementById('btnCopyUrl');
const manifestUrlDisplay = document.getElementById('manifestUrlDisplay');
const toastEl = document.getElementById('toast');

// Modal DOM - Addon Settings
const addonSettingsModal = document.getElementById('addonSettingsModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const modalAddonId = document.getElementById('modalAddonId');
const modalAddonName = document.getElementById('modalAddonName');
const modalAddonUrl = document.getElementById('modalAddonUrl');
const modalAddonTimeout = document.getElementById('modalAddonTimeout');
const modalResStream = document.getElementById('modalResStream');
const modalResSubtitles = document.getElementById('modalResSubtitles');
const modalResCatalogs = document.getElementById('modalResCatalogs');
const modalTestFeedback = document.getElementById('modalTestFeedback');
const btnModalTestAddon = document.getElementById('btnModalTestAddon');
const btnModalSaveAddon = document.getElementById('btnModalSaveAddon');
const btnModalCopyUrl = document.getElementById('btnModalCopyUrl');

// Inicialização
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupModalListeners();
  setupCatalogStudioListeners();
  await loadInitialState();
  render();
});

function switchTab(tab) {
  if (tab === 'addons') {
    tabBtnAddons.classList.add('active');
    tabBtnCatalogs.classList.remove('active');
    tabContentAddons.classList.add('active');
    tabContentCatalogs.classList.remove('active');
  } else {
    tabBtnAddons.classList.remove('active');
    tabBtnCatalogs.classList.add('active');
    tabContentAddons.classList.remove('active');
    tabContentCatalogs.classList.add('active');
  }
}
window.switchTab = switchTab;

function setupEventListeners() {
  // Preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      const url = btn.getAttribute('data-url');
      addAddon(name, url);
    });
  });

  // Botão Adicionar Manual
  btnAddAddon.addEventListener('click', () => {
    const url = addonUrlInput.value.trim();
    const name = addonNameInput.value.trim();
    if (!url) {
      showFeedback('Por favor, informe a URL do manifest.', 'error');
      return;
    }
    addAddon(name, url);
  });

  // Tecla Enter no input de URL
  addonUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAddAddon.click();
    }
  });

  // Inputs de Filtros
  const filterInputs = [
    res4k, res1080p, res720p, res480p,
    filterRemoveCams, filterDeduplicate,
    filterRegex, maxStreamsPerAddon, maxTotalStreams, badgeFormat,
    subPob, subPor, subEng, subSpa
  ];

  filterInputs.forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => {
      updateFiltersFromDom();
      updateManifestUrl();
      saveToStorage();
    });
  });

  // Copiar URL do Manifest Principal
  btnCopyUrl.addEventListener('click', () => {
    const url = manifestUrlDisplay.value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL do manifest copiada para a área de transferência!');
    }).catch(() => {
      showToast('Erro ao copiar URL.');
    });
  });
}

function setupModalListeners() {
  btnCloseModal.addEventListener('click', closeModal);
  addonSettingsModal.addEventListener('click', (e) => {
    if (e.target === addonSettingsModal) closeModal();
  });

  btnModalCopyUrl.addEventListener('click', () => {
    const url = modalAddonUrl.value.trim();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL do addon copiada!');
    });
  });

  btnModalTestAddon.addEventListener('click', async () => {
    const url = modalAddonUrl.value.trim();
    if (!url) return;

    btnModalTestAddon.disabled = true;
    modalTestFeedback.textContent = 'Testando resposta do manifest...';
    modalTestFeedback.className = 'feedback-msg';

    try {
      const res = await fetch('/api/validate-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.valid) {
        const resList = data.resources && data.resources.length > 0 ? data.resources.join(', ') : 'nenhum';
        const catInfo = data.catalogs && data.catalogs.length > 0 ? ` (${data.catalogs.length} catálogos)` : '';
        modalTestFeedback.textContent = `Online! Addon: "${data.name}" [${resList}]${catInfo}`;
        modalTestFeedback.className = 'feedback-msg success';

        // Atualiza estado do addon
        const addon = state.addons.find(a => a.id === modalAddonId.value);
        if (addon) {
          addon.status = 'online';
          if (Array.isArray(data.resources)) addon.availableResources = data.resources;
          if (Array.isArray(data.catalogs)) {
            addon.catalogs = data.catalogs;
            if (data.catalogs.length > 0) {
              modalResCatalogs.checked = true;
              addon.includeCatalogs = true;
            }
          }
        }
      } else {
        modalTestFeedback.textContent = `Falha: ${data.error}`;
        modalTestFeedback.className = 'feedback-msg error';
        const addon = state.addons.find(a => a.id === modalAddonId.value);
        if (addon) addon.status = 'offline';
      }
    } catch (err) {
      modalTestFeedback.textContent = 'Erro ao se comunicar com o servidor.';
      modalTestFeedback.className = 'feedback-msg error';
    } finally {
      btnModalTestAddon.disabled = false;
      renderAddonList();
    }
  });

  btnModalSaveAddon.addEventListener('click', () => {
    const id = modalAddonId.value;
    const addon = state.addons.find(a => a.id === id);
    if (!addon) return;

    const newName = modalAddonName.value.trim();
    const newUrl = modalAddonUrl.value.trim();
    const newTimeout = parseInt(modalAddonTimeout.value, 10) || 25000;

    if (!newUrl) {
      modalTestFeedback.textContent = 'A URL não pode ficar vazia.';
      modalTestFeedback.className = 'feedback-msg error';
      return;
    }

    // Atualiza recursos selecionados
    const selectedResources = [];
    if (modalResStream.checked) selectedResources.push('stream');
    if (modalResSubtitles.checked) selectedResources.push('subtitles');
    if (modalResCatalogs.checked) selectedResources.push('catalog', 'meta');

    addon.name = newName || addon.name;
    addon.url = newUrl;
    addon.timeoutMs = newTimeout;
    addon.resources = selectedResources.length > 0 ? selectedResources : ['stream'];
    addon.includeCatalogs = modalResCatalogs.checked;

    render();
    saveToStorage();
    closeModal();
    showToast(`Configurações de "${addon.name}" salvas!`);
  });
}

function openAddonSettings(id) {
  const addon = state.addons.find(a => a.id === id);
  if (!addon) return;

  modalAddonId.value = addon.id;
  modalAddonName.value = addon.name;
  modalAddonUrl.value = addon.url;
  modalAddonTimeout.value = addon.timeoutMs || 25000;

  // Recursos
  const currentRes = addon.resources || ['stream'];
  modalResStream.checked = currentRes.includes('stream');
  modalResSubtitles.checked = currentRes.includes('subtitles');
  modalResCatalogs.checked = addon.includeCatalogs !== false && (currentRes.includes('catalog') || (addon.catalogs && addon.catalogs.length > 0));

  modalTestFeedback.textContent = '';
  modalTestFeedback.className = 'feedback-msg';

  addonSettingsModal.classList.add('show');
}

function closeModal() {
  addonSettingsModal.classList.remove('show');
}

function updateFiltersFromDom() {
  const resolutions = [];
  if (res4k.checked) resolutions.push('4k');
  if (res1080p.checked) resolutions.push('1080p');
  if (res720p.checked) resolutions.push('720p');
  if (res480p.checked) resolutions.push('480p');

  const subLangs = [];
  if (subPob && subPob.checked) subLangs.push('pob');
  if (subPor && subPor.checked) subLangs.push('por');
  if (subEng && subEng.checked) subLangs.push('eng');
  if (subSpa && subSpa.checked) subLangs.push('spa');

  state.filters.resolutions = resolutions;
  state.filters.removeCams = filterRemoveCams.checked;
  state.filters.deduplicate = filterDeduplicate.checked;
  state.filters.excludeRegex = filterRegex.value.trim();
  state.filters.maxStreamsPerAddon = parseInt(maxStreamsPerAddon.value, 10) || 10;
  state.filters.maxTotalStreams = parseInt(maxTotalStreams.value, 10) || 30;
  state.filters.subtitleLanguages = subLangs.length > 0 ? subLangs : ['pob', 'por', 'eng'];
  state.badgeFormat = badgeFormat.value;
}

function syncDomFromFilters() {
  res4k.checked = state.filters.resolutions.includes('4k');
  res1080p.checked = state.filters.resolutions.includes('1080p');
  res720p.checked = state.filters.resolutions.includes('720p');
  res480p.checked = state.filters.resolutions.includes('480p');

  const subLangs = state.filters.subtitleLanguages || ['pob', 'por', 'eng'];
  if (subPob) subPob.checked = subLangs.includes('pob');
  if (subPor) subPor.checked = subLangs.includes('por');
  if (subEng) subEng.checked = subLangs.includes('eng');
  if (subSpa) subSpa.checked = subLangs.includes('spa');

  filterRemoveCams.checked = state.filters.removeCams;
  filterDeduplicate.checked = state.filters.deduplicate;
  filterRegex.value = state.filters.excludeRegex || '';
  maxStreamsPerAddon.value = state.filters.maxStreamsPerAddon || 10;
  maxTotalStreams.value = state.filters.maxTotalStreams || 30;
  badgeFormat.value = state.badgeFormat || 'addon';
}

async function addAddon(suggestedName, rawUrl) {
  let url = rawUrl.trim();

  // Auto-corrige domínio descontinuado do OpenSubtitles
  if (url.includes('opensubtitles-v3.strem.fun')) {
    url = url.replace('opensubtitles-v3.strem.fun', 'opensubtitles-v3.strem.io');
  }

  if (!url.endsWith('/manifest.json')) {
    url = `${url.replace(/\/+$/, '')}/manifest.json`;
  }

  // Verifica duplicidade
  if (state.addons.some(a => a.url === url)) {
    showFeedback('Este addon já está na sua lista.', 'error');
    return;
  }

  setAddLoading(true);
  showFeedback('Verificando manifest do addon...', '');

  try {
    const res = await fetch('/api/validate-addon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    if (!data.valid) {
      showFeedback(`Aviso: ${data.error || 'Não foi possível validar, mas foi adicionado.'}`, 'error');
    } else {
      showFeedback(`Addon validado: ${data.name}`, 'success');
    }

    const finalName = suggestedName || (data.valid && data.name) || 'Custom Addon';
    const detectedResources = (data.valid && Array.isArray(data.resources)) ? data.resources : ['stream'];
    const detectedCatalogs = (data.valid && Array.isArray(data.catalogs)) ? data.catalogs : [];

    state.addons.push({
      id: Date.now().toString(),
      name: finalName,
      url,
      timeoutMs: 25000,
      enabled: true,
      resources: detectedResources.length > 0 ? detectedResources : ['stream'],
      catalogs: detectedCatalogs,
      includeCatalogs: true,
      status: data.valid ? 'online' : 'unknown'
    });

    addonUrlInput.value = '';
    addonNameInput.value = '';

    render();
    saveToStorage();
    showToast(`Addon "${finalName}" adicionado!`);
  } catch (err) {
    showFeedback('Falha de rede ao verificar addon.', 'error');
  } finally {
    setAddLoading(false);
  }
}

function removeAddon(id) {
  state.addons = state.addons.filter(a => a.id !== id);
  render();
  saveToStorage();
}

function moveAddon(id, direction) {
  const index = state.addons.findIndex(a => a.id === id);
  if (index < 0) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.addons.length) return;

  const [item] = state.addons.splice(index, 1);
  state.addons.splice(targetIndex, 0, item);

  render();
  saveToStorage();
}

function toggleAddon(id) {
  const addon = state.addons.find(a => a.id === id);
  if (addon) {
    addon.enabled = !addon.enabled;
    render();
    saveToStorage();
  }
}

function render() {
  renderAddonList();
  renderCatalogStudio();
  updateManifestUrl();
}

function renderAddonList() {
  addonListEl.innerHTML = '';
  const count = state.addons.length;
  addonCountBadge.textContent = `${count} configurado${count === 1 ? '' : 's'}`;
  if (tabAddonsBadge) tabAddonsBadge.textContent = count;

  if (count === 0) {
    addonListEl.appendChild(emptyStateEl);
    emptyStateEl.style.display = 'block';
    return;
  }

  emptyStateEl.style.display = 'none';

  state.addons.forEach((addon, idx) => {
    const itemEl = document.createElement('div');
    itemEl.className = `addon-item ${!addon.enabled ? 'disabled' : ''}`;

    const isFirst = idx === 0;
    const isLast = idx === count - 1;

    let statusClass = 'status-unknown';
    let statusTitle = 'Status desconhecido';
    if (addon.status === 'online') {
      statusClass = 'status-online';
      statusTitle = 'Addon Online';
    } else if (addon.status === 'offline') {
      statusClass = 'status-offline';
      statusTitle = 'Addon Offline ou Inacessível';
    }

    const timeoutSec = ((addon.timeoutMs || 25000) / 1000).toFixed(0);

    // Tags de recursos do addon
    const res = addon.resources || ['stream'];
    let tagsHtml = '<div class="resource-tags">';
    if (res.includes('stream')) {
      tagsHtml += '<span class="tag-res tag-res-stream">Stream</span>';
    }
    if (res.includes('subtitles')) {
      tagsHtml += '<span class="tag-res tag-res-subtitles">Legendas</span>';
    }
    if (addon.includeCatalogs !== false && (res.includes('catalog') || (addon.catalogs && addon.catalogs.length > 0))) {
      tagsHtml += '<span class="tag-res tag-res-catalogs">Catálogo</span>';
    }
    tagsHtml += '</div>';

    itemEl.innerHTML = `
      <div class="addon-info">
        <span class="addon-status-dot ${statusClass}" title="${statusTitle}"></span>
        <span class="addon-name" title="${escapeHtml(addon.name)}">${escapeHtml(addon.name)}</span>
        ${tagsHtml}
        <span class="addon-timeout-tag" title="Timeout individual">${timeoutSec}s</span>
      </div>
      <div class="addon-actions">
        <button type="button" class="btn-icon gear" title="Configurações & Recursos" onclick="window._openAddonSettings('${addon.id}')">⚙️</button>
        <button type="button" class="btn-icon" title="Subir prioridade" ${isFirst ? 'disabled style="opacity:0.25"' : ''} onclick="window._moveAddon('${addon.id}', -1)">↑</button>
        <button type="button" class="btn-icon" title="Descer prioridade" ${isLast ? 'disabled style="opacity:0.25"' : ''} onclick="window._moveAddon('${addon.id}', 1)">↓</button>
        <button type="button" class="btn-icon" title="${addon.enabled ? 'Desativar' : 'Ativar'}" onclick="window._toggleAddon('${addon.id}')">
          ${addon.enabled ? '✓' : '✗'}
        </button>
        <button type="button" class="btn-icon delete" title="Remover" onclick="window._removeAddon('${addon.id}')">🗑</button>
      </div>
    `;

    addonListEl.appendChild(itemEl);
  });
}

// Expõe ações globais para cliques inline no HTML gerado
window._openAddonSettings = openAddonSettings;
window._moveAddon = moveAddon;
window._removeAddon = removeAddon;
window._toggleAddon = toggleAddon;

// ==========================================================================
// STUDIO DE CATÁLOGOS - FUNÇÕES & EVENTOS
// ==========================================================================

function setupCatalogStudioListeners() {
  btnSyncCatalogs.addEventListener('click', syncCatalogsFromAddons);
  btnNewMergedCatalog.addEventListener('click', () => openMergedCatalogModal());

  btnCloseMergedModal.addEventListener('click', closeMergedModal);
  btnCancelMergedModal.addEventListener('click', closeMergedModal);
  mergedCatalogModal.addEventListener('click', (e) => {
    if (e.target === mergedCatalogModal) closeMergedModal();
  });

  btnSaveMergedModal.addEventListener('click', saveMergedCatalog);
}

/**
 * Sincroniza os catálogos encontrados em todos os addons para o array `state.customCatalogs`.
 * Mantém eventuais catálogos mesclados e customizações já existentes.
 * Caso algum addon não tenha catálogos carregados em memória (ou adicionado anteriormente),
 * busca o manifest atualizado via /api/validate-addon em tempo real.
 */
async function syncCatalogsFromAddons() {
  const originalText = btnSyncCatalogs ? btnSyncCatalogs.innerHTML : '';
  if (btnSyncCatalogs) {
    btnSyncCatalogs.disabled = true;
    btnSyncCatalogs.innerHTML = '🔄 Consultando Addons...';
  }

  try {
    // 1. Atualiza manifests de todos os addons ativos em paralelo
    const updatePromises = state.addons.map(async (addon) => {
      if (addon.enabled === false) return;
      try {
        const res = await fetch('/api/validate-addon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: addon.url })
        });
        const data = await res.json();
        if (data.valid) {
          addon.status = 'online';
          if (Array.isArray(data.catalogs)) {
            addon.catalogs = data.catalogs;
          }
          if (Array.isArray(data.resources)) {
            addon.availableResources = data.resources;
            // Garante que se o addon oferece catálogo, includeCatalogs esteja ativo por padrão
            if (data.catalogs && data.catalogs.length > 0 && addon.includeCatalogs === undefined) {
              addon.includeCatalogs = true;
            }
          }
        }
      } catch (err) {
        console.warn(`[Sync] Falha ao atualizar catálogo de ${addon.name}:`, err.message);
      }
    });

    await Promise.allSettled(updatePromises);

    // 2. Compila a lista de catálogos sincronizados
    const existingMerged = state.customCatalogs.filter(c => c.isMerged);
    const newCustomCatalogs = [...existingMerged];

    let addedCount = 0;
    state.addons.forEach((addon, addonIdx) => {
      if (addon.enabled === false || addon.includeCatalogs === false) return;
      if (!Array.isArray(addon.catalogs) || addon.catalogs.length === 0) return;

      addon.catalogs.forEach(cat => {
        const namespacedId = `a${addonIdx}__${cat.id}`;
        // Verifica se já existe por ID namespaced ou por ID original + addonUrl
        const existing = state.customCatalogs.find(c =>
          c.id === namespacedId ||
          (!c.isMerged && c.originalId === cat.id && (c.addonUrl === addon.url || c.addonName === addon.name))
        );

        // Limpa o nome para não conter [Addon]
        let cleanName = (cat.name || cat.id || 'Catálogo').replace(/^\[.*?\]\s*/, '').trim();

        if (existing) {
          // Se o usuário não definiu customName próprio, limpa qualquer resquício de [Addon]
          let existingCustom = existing.customName ? existing.customName.replace(/^\[.*?\]\s*/, '').trim() : '';

          newCustomCatalogs.push({
            ...existing,
            id: namespacedId,
            addonName: addon.name,
            addonUrl: addon.url,
            originalId: cat.id,
            name: cleanName,
            customName: existingCustom,
            type: cat.type || 'movie',
            enabled: existing.enabled !== false,
            showOnHome: existing.showOnHome !== false,
            isFavorite: Boolean(existing.isFavorite)
          });
        } else {
          newCustomCatalogs.push({
            id: namespacedId,
            addonName: addon.name,
            addonUrl: addon.url,
            originalId: cat.id,
            name: cleanName,
            customName: '',
            type: cat.type || 'movie',
            enabled: true,
            showOnHome: true,
            isFavorite: false,
            isMerged: false,
            sourceCatalogIds: []
          });
          addedCount++;
        }
      });
    });

    state.customCatalogs = newCustomCatalogs;
    render();
    saveToStorage();
    showToast(`Sincronização concluída! ${state.customCatalogs.length} catálogo(s) prontos.`);
  } catch (err) {
    showToast('Erro ao sincronizar catálogos.');
    console.error(err);
  } finally {
    if (btnSyncCatalogs) {
      btnSyncCatalogs.disabled = false;
      btnSyncCatalogs.innerHTML = originalText;
    }
  }
}

// Drag & Drop State
let draggedCatalogId = null;

function renderCatalogStudio() {
  catalogItemsList.innerHTML = '';
  const list = state.customCatalogs || [];
  if (tabCatalogsBadge) tabCatalogsBadge.textContent = list.length;

  if (list.length === 0) {
    catalogItemsList.appendChild(catalogEmptyState);
    catalogEmptyState.style.display = 'block';
    return;
  }

  catalogEmptyState.style.display = 'none';

  list.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = `catalog-item-card ${!cat.enabled ? 'disabled' : ''} ${cat.isMerged ? 'is-merged' : ''} ${cat.isFavorite ? 'is-favorite' : ''}`;
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-id', cat.id);

    const isFirst = idx === 0;
    const isLast = idx === list.length - 1;

    const rawDisplayName = cat.customName ? cat.customName : cat.name;
    // Garante remoção de colchetes residuais
    const displayName = rawDisplayName.replace(/^\[.*?\]\s*/, '').trim();
    const typeLabel = cat.type === 'series' ? 'Série' : (cat.type === 'movie' ? 'Filme' : cat.type);

    let badgeHtml = '';
    let subInfoHtml = '';

    if (cat.isMerged) {
      const srcCount = Array.isArray(cat.sourceCatalogIds) ? cat.sourceCatalogIds.length : 0;
      badgeHtml = `<span class="catalog-tag-merged">Mesclado</span>`;
      subInfoHtml = `<span>Mesclando ${srcCount} catálogo(s) com deduplicação inteligente</span>`;
    } else {
      subInfoHtml = `<span>Origem: <strong>${escapeHtml(cat.addonName || 'Addon')}</strong></span>`;
    }

    const isHome = cat.showOnHome !== false;
    const isFav = Boolean(cat.isFavorite);
    const isEnabled = cat.enabled !== false;

    card.innerHTML = `
      <div class="catalog-drag-handle" title="Arraste para reordenar">⠿</div>
      <div class="catalog-left-info">
        <span class="catalog-order-badge">${idx + 1}</span>
        <div class="catalog-title-wrapper">
          <input type="text" class="catalog-inline-name" value="${escapeHtml(displayName)}" 
                 title="Clique para editar o título exibido" 
                 onchange="window._changeCatalogName('${cat.id}', this.value)" 
                 placeholder="Nome do catálogo">
          <div class="catalog-meta-sub">
            ${badgeHtml}
            <span class="catalog-tag-type">${typeLabel}</span>
            ${subInfoHtml}
          </div>
        </div>
      </div>
      <div class="catalog-right-actions">
        <!-- Botão Favorito -->
        <button type="button" class="btn-action-badge ${isFav ? 'active-fav' : ''}" 
                title="${isFav ? 'Remover dos favoritos' : 'Marcar como favorito'}" 
                onclick="window._toggleFavoriteCatalog('${cat.id}')">
          <span class="btn-icon-symbol">⭐</span>
          <span class="btn-label-text">${isFav ? 'Favorito' : 'Favoritar'}</span>
        </button>

        <!-- Botão Exibir na Página Principal (Home Stremio/Nuvio) -->
        <button type="button" class="btn-action-badge ${isHome ? 'active-home' : 'inactive'}" 
                title="${isHome ? 'Exibindo na Página Principal (Home). Clique para ocultar da Home' : 'Oculto da Home. Clique para exibir na Página Inicial'}" 
                onclick="window._toggleHomeCatalog('${cat.id}')">
          <span class="btn-icon-symbol">🏠</span>
          <span class="btn-label-text">${isHome ? 'Na Home' : 'Fora da Home'}</span>
        </button>

        <!-- Botão Ativar/Desativar Geral -->
        <button type="button" class="btn-action-badge ${isEnabled ? 'active-enabled' : 'inactive-disabled'}" 
                title="${isEnabled ? 'Catálogo Ativo no Agregador. Clique para desativar' : 'Catálogo Desativado. Clique para ativar'}" 
                onclick="window._toggleCatalog('${cat.id}')">
          <span class="btn-icon-symbol">${isEnabled ? '👁️' : '🚫'}</span>
          <span class="btn-label-text">${isEnabled ? 'Ativo' : 'Inativo'}</span>
        </button>

        <!-- Reordenação por botões ↑ / ↓ -->
        <div class="catalog-order-buttons">
          <button type="button" class="btn-icon btn-nav-arrow" title="Subir prioridade" ${isFirst ? 'disabled style="opacity:0.25"' : ''} onclick="window._moveCatalog('${cat.id}', -1)">↑</button>
          <button type="button" class="btn-icon btn-nav-arrow" title="Descer prioridade" ${isLast ? 'disabled style="opacity:0.25"' : ''} onclick="window._moveCatalog('${cat.id}', 1)">↓</button>
        </div>

        ${cat.isMerged ? `<button type="button" class="btn-action-badge btn-edit-merged" title="Editar fontes da mescla" onclick="window._editMergedCatalog('${cat.id}')">✏️ Editar</button>` : ''}
        ${cat.isMerged ? `<button type="button" class="btn-action-badge btn-delete-merged" title="Excluir catálogo mesclado" onclick="window._deleteCatalog('${cat.id}')">🗑</button>` : ''}
      </div>
    `;

    // Eventos Drag and Drop
    card.addEventListener('dragstart', (e) => {
      draggedCatalogId = cat.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cat.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedCatalogId = null;
      document.querySelectorAll('.catalog-item-card').forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId = cat.id;
      if (!draggedCatalogId || draggedCatalogId === targetId) return;

      const fromIndex = state.customCatalogs.findIndex(c => c.id === draggedCatalogId);
      const toIndex = state.customCatalogs.findIndex(c => c.id === targetId);

      if (fromIndex >= 0 && toIndex >= 0) {
        const [movedItem] = state.customCatalogs.splice(fromIndex, 1);
        state.customCatalogs.splice(toIndex, 0, movedItem);
        renderCatalogStudio();
        updateManifestUrl();
        saveToStorage();
        showToast('Ordem dos catálogos atualizada!');
      }
    });

    catalogItemsList.appendChild(card);
  });
}

function toggleFavoriteCatalog(catId) {
  const cat = state.customCatalogs.find(c => c.id === catId);
  if (cat) {
    cat.isFavorite = !cat.isFavorite;
    renderCatalogStudio();
    updateManifestUrl();
    saveToStorage();
    showToast(cat.isFavorite ? `⭐ "${cat.customName || cat.name}" marcado como favorito!` : `Removido dos favoritos`);
  }
}

function toggleHomeCatalog(catId) {
  const cat = state.customCatalogs.find(c => c.id === catId);
  if (cat) {
    cat.showOnHome = cat.showOnHome === false ? true : false;
    renderCatalogStudio();
    updateManifestUrl();
    saveToStorage();
    showToast(cat.showOnHome ? `🏠 "${cat.customName || cat.name}" visível na Home!` : `Oculto da Home`);
  }
}

function changeCatalogName(catId, newName) {
  const cat = state.customCatalogs.find(c => c.id === catId);
  if (cat) {
    cat.customName = newName.trim();
    updateManifestUrl();
    saveToStorage();
    showToast(`Título atualizado para "${cat.customName || cat.name}"!`);
  }
}

function moveCatalog(catId, direction) {
  const index = state.customCatalogs.findIndex(c => c.id === catId);
  if (index < 0) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.customCatalogs.length) return;

  const [item] = state.customCatalogs.splice(index, 1);
  state.customCatalogs.splice(targetIndex, 0, item);

  renderCatalogStudio();
  updateManifestUrl();
  saveToStorage();
}

function toggleCatalog(catId) {
  const cat = state.customCatalogs.find(c => c.id === catId);
  if (cat) {
    cat.enabled = !cat.enabled;
    renderCatalogStudio();
    updateManifestUrl();
    saveToStorage();
  }
}

function deleteCatalog(catId) {
  state.customCatalogs = state.customCatalogs.filter(c => c.id !== catId);
  renderCatalogStudio();
  updateManifestUrl();
  saveToStorage();
  showToast('Catálogo mesclado removido!');
}

function openMergedCatalogModal(editId = null) {
  modalMergedFeedback.textContent = '';
  modalMergedFeedback.className = 'feedback-msg';

  // Obter todos os catálogos normais disponíveis para mesclar
  const availableSources = [];
  state.addons.forEach((addon, aIdx) => {
    if (addon.enabled === false || addon.includeCatalogs === false) return;
    if (!Array.isArray(addon.catalogs)) return;
    addon.catalogs.forEach(cat => {
      const namespacedId = `a${aIdx}__${cat.id}`;
      availableSources.push({
        id: namespacedId,
        name: `[${addon.name}] ${cat.name || cat.id}`,
        type: cat.type || 'movie'
      });
    });
  });

  if (availableSources.length === 0) {
    showToast('Nenhum catálogo disponível nos addons para mesclar. Adicione addons com catálogos primeiro!');
    return;
  }

  let currentSelectedIds = [];

  if (editId) {
    const cat = state.customCatalogs.find(c => c.id === editId);
    if (!cat) return;
    modalMergedId.value = cat.id;
    modalMergedTitle.textContent = '✏️ Editar Catálogo Mesclado';
    modalMergedName.value = cat.customName || cat.name;
    modalMergedType.value = cat.type || 'movie';
    currentSelectedIds = Array.isArray(cat.sourceCatalogIds) ? cat.sourceCatalogIds : [];
  } else {
    modalMergedId.value = '';
    modalMergedTitle.textContent = '✨ Criar Catálogo Mesclado';
    modalMergedName.value = '🔥 Super Populares Unificados';
    modalMergedType.value = 'movie';
  }

  // Renderizar checkboxes de fontes
  mergedSourcesChecklist.innerHTML = '';
  availableSources.forEach(src => {
    const isChecked = currentSelectedIds.includes(src.id);
    const label = document.createElement('label');
    label.className = 'merged-source-item';
    label.innerHTML = `
      <input type="checkbox" value="${src.id}" data-type="${src.type}" ${isChecked ? 'checked' : ''}>
      <span>${escapeHtml(src.name)} <small style="color:var(--text-muted)">(${src.type})</small></span>
    `;
    mergedSourcesChecklist.appendChild(label);
  });

  mergedCatalogModal.classList.add('show');
}

function closeMergedModal() {
  mergedCatalogModal.classList.remove('show');
}

function saveMergedCatalog() {
  const name = modalMergedName.value.trim();
  const type = modalMergedType.value;
  const id = modalMergedId.value;

  if (!name) {
    modalMergedFeedback.textContent = 'Por favor, dê um nome ao catálogo mesclado.';
    modalMergedFeedback.className = 'feedback-msg error';
    return;
  }

  // Coleta os IDs selecionados
  const checkedBoxes = mergedSourcesChecklist.querySelectorAll('input[type="checkbox"]:checked');
  const sourceCatalogIds = Array.from(checkedBoxes).map(cb => cb.value);

  if (sourceCatalogIds.length < 2) {
    modalMergedFeedback.textContent = 'Selecione pelo menos 2 catálogos para mesclar.';
    modalMergedFeedback.className = 'feedback-msg error';
    return;
  }

  if (id) {
    // Editando existente
    const cat = state.customCatalogs.find(c => c.id === id);
    if (cat) {
      cat.name = name;
      cat.customName = name;
      cat.type = type;
      cat.sourceCatalogIds = sourceCatalogIds;
    }
  } else {
    // Criando novo
    const newId = `merged_${Date.now()}`;
    state.customCatalogs.unshift({
      id: newId,
      name,
      customName: name,
      type,
      enabled: true,
      isMerged: true,
      sourceCatalogIds,
      extra: [{ name: 'skip', isRequired: false }]
    });
  }

  renderCatalogStudio();
  updateManifestUrl();
  saveToStorage();
  closeMergedModal();
  showToast(`Catálogo mesclado "${name}" salvo com sucesso!`);
}

window._changeCatalogName = changeCatalogName;
window._moveCatalog = moveCatalog;
window._toggleCatalog = toggleCatalog;
window._toggleFavoriteCatalog = toggleFavoriteCatalog;
window._toggleHomeCatalog = toggleHomeCatalog;
window._deleteCatalog = deleteCatalog;
window._editMergedCatalog = (id) => openMergedCatalogModal(id);

async function updateManifestUrl() {
  const configToEncode = {
    addons: state.addons.map(a => ({
      name: a.name,
      url: a.url,
      timeoutMs: a.timeoutMs || 25000,
      enabled: a.enabled,
      resources: a.resources || ['stream'],
      catalogs: a.catalogs || [],
      includeCatalogs: a.includeCatalogs !== false
    })),
    customCatalogs: state.customCatalogs,
    filters: state.filters,
    badgeFormat: state.badgeFormat,
    deduplicate: state.filters.deduplicate
  };

  try {
    const res = await fetch('/api/encode-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configToEncode)
    });
    const { token } = await res.json();

    const origin = window.location.origin;
    const manifestHttpsUrl = `${origin}/${token}/manifest.json`;
    const hostWithPort = window.location.host;
    const stremioProtocolUrl = `stremio://${hostWithPort}/${token}/manifest.json`;

    manifestUrlDisplay.value = manifestHttpsUrl;
    btnInstallStremio.href = stremioProtocolUrl;
  } catch (err) {
    console.error('Falha ao gerar URL de manifest:', err);
  }
}

function setAddLoading(isLoading) {
  btnAddAddon.disabled = isLoading;
  btnAddText.textContent = isLoading ? 'Verificando...' : 'Testar & Adicionar';
}

function showFeedback(msg, type) {
  addAddonFeedback.textContent = msg;
  addAddonFeedback.className = `feedback-msg ${type}`;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function saveToStorage() {
  try {
    localStorage.setItem('stream_aggregator_state', JSON.stringify(state));
  } catch (err) {
    // ignore
  }
}

async function loadInitialState() {
  // 1. Tenta carregar do hash da URL se houver (ex: #token=TOKEN)
  const hash = window.location.hash;
  if (hash && hash.includes('token=')) {
    const token = hash.split('token=')[1]?.split('&')[0];
    if (token) {
      try {
        const res = await fetch(`/api/decode-config/${token}`);
        const { config } = await res.json();
        if (config && config.addons) {
          state.addons = config.addons.map((a, i) => ({
            id: String(i),
            name: a.name,
            url: a.url,
            timeoutMs: (a.timeoutMs && a.timeoutMs >= 20000) ? a.timeoutMs : 25000,
            enabled: a.enabled !== false,
            resources: Array.isArray(a.resources) && a.resources.length > 0 ? a.resources : ['stream'],
            catalogs: Array.isArray(a.catalogs) ? a.catalogs : [],
            includeCatalogs: a.includeCatalogs !== false,
            status: 'online'
          }));
          if (Array.isArray(config.customCatalogs)) {
            state.customCatalogs = config.customCatalogs;
          }
          if (config.filters) state.filters = { ...state.filters, ...config.filters };
          if (config.badgeFormat) state.badgeFormat = config.badgeFormat;
          syncDomFromFilters();
          return;
        }
      } catch (err) {
        console.warn('Erro ao carregar token da URL:', err);
      }
    }
  }

  // 2. Carrega do localStorage
  try {
    const saved = localStorage.getItem('stream_aggregator_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.addons)) {
        state.addons = parsed.addons.map(a => ({
          ...a,
          timeoutMs: (a.timeoutMs && a.timeoutMs >= 20000) ? a.timeoutMs : 25000,
          resources: Array.isArray(a.resources) && a.resources.length > 0 ? a.resources : ['stream'],
          catalogs: Array.isArray(a.catalogs) ? a.catalogs : [],
          includeCatalogs: a.includeCatalogs !== false
        }));
      }
      if (Array.isArray(parsed.customCatalogs)) {
        state.customCatalogs = parsed.customCatalogs;
      }
      if (parsed.filters) state.filters = { ...state.filters, ...parsed.filters };
      if (parsed.badgeFormat) state.badgeFormat = parsed.badgeFormat;
      syncDomFromFilters();
      return;
    }
  } catch (e) {}

  syncDomFromFilters();
}

