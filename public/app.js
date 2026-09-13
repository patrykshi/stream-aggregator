// Estado da aplicação
const state = {
  addons: [],
  filters: {
    resolutions: ['4k', '1080p', '720p', '480p'],
    removeCams: true,
    deduplicate: true,
    excludeRegex: '',
    maxStreamsPerAddon: 10,
    maxTotalStreams: 30
  },
  badgeFormat: 'addon'
};

// Elementos DOM
const addonUrlInput = document.getElementById('addonUrlInput');
const addonNameInput = document.getElementById('addonNameInput');
const btnAddAddon = document.getElementById('btnAddAddon');
const btnAddText = document.getElementById('btnAddText');
const addAddonFeedback = document.getElementById('addAddonFeedback');
const addonListEl = document.getElementById('addonList');
const emptyStateEl = document.getElementById('emptyState');
const addonCountBadge = document.getElementById('addonCountBadge');

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

// Instalação DOM
const btnInstallStremio = document.getElementById('btnInstallStremio');
const btnCopyUrl = document.getElementById('btnCopyUrl');
const manifestUrlDisplay = document.getElementById('manifestUrlDisplay');
const toastEl = document.getElementById('toast');

// Modal DOM
const addonSettingsModal = document.getElementById('addonSettingsModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const modalAddonId = document.getElementById('modalAddonId');
const modalAddonName = document.getElementById('modalAddonName');
const modalAddonUrl = document.getElementById('modalAddonUrl');
const modalAddonTimeout = document.getElementById('modalAddonTimeout');
const modalTestFeedback = document.getElementById('modalTestFeedback');
const btnModalTestAddon = document.getElementById('btnModalTestAddon');
const btnModalSaveAddon = document.getElementById('btnModalSaveAddon');
const btnModalCopyUrl = document.getElementById('btnModalCopyUrl');

// Inicialização
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupModalListeners();
  await loadInitialState();
  render();
});

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
    filterRegex, maxStreamsPerAddon, maxTotalStreams, badgeFormat
  ];

  filterInputs.forEach(input => {
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
        modalTestFeedback.textContent = `Online! Addon: ${data.name} (recursos: ${data.hasStreamResource ? 'stream ativo' : 'sem stream direto'})`;
        modalTestFeedback.className = 'feedback-msg success';
        // Atualiza status no estado
        const addon = state.addons.find(a => a.id === modalAddonId.value);
        if (addon) addon.status = 'online';
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
    const newTimeout = parseInt(modalAddonTimeout.value, 10) || 7000;

    if (!newUrl) {
      modalTestFeedback.textContent = 'A URL não pode ficar vazia.';
      modalTestFeedback.className = 'feedback-msg error';
      return;
    }

    addon.name = newName || addon.name;
    addon.url = newUrl;
    addon.timeoutMs = newTimeout;

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
  modalAddonTimeout.value = addon.timeoutMs || 7000;
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

  state.filters.resolutions = resolutions;
  state.filters.removeCams = filterRemoveCams.checked;
  state.filters.deduplicate = filterDeduplicate.checked;
  state.filters.excludeRegex = filterRegex.value.trim();
  state.filters.maxStreamsPerAddon = parseInt(maxStreamsPerAddon.value, 10) || 10;
  state.filters.maxTotalStreams = parseInt(maxTotalStreams.value, 10) || 30;
  state.badgeFormat = badgeFormat.value;
}

function syncDomFromFilters() {
  res4k.checked = state.filters.resolutions.includes('4k');
  res1080p.checked = state.filters.resolutions.includes('1080p');
  res720p.checked = state.filters.resolutions.includes('720p');
  res480p.checked = state.filters.resolutions.includes('480p');

  filterRemoveCams.checked = state.filters.removeCams;
  filterDeduplicate.checked = state.filters.deduplicate;
  filterRegex.value = state.filters.excludeRegex || '';
  maxStreamsPerAddon.value = state.filters.maxStreamsPerAddon || 10;
  maxTotalStreams.value = state.filters.maxTotalStreams || 30;
  badgeFormat.value = state.badgeFormat || 'addon';
}

async function addAddon(suggestedName, rawUrl) {
  let url = rawUrl.trim();
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

    state.addons.push({
      id: Date.now().toString(),
      name: finalName,
      url,
      timeoutMs: 7000,
      enabled: true,
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
  updateManifestUrl();
}

function renderAddonList() {
  addonListEl.innerHTML = '';
  const count = state.addons.length;
  addonCountBadge.textContent = `${count} configurado${count === 1 ? '' : 's'}`;

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

    const timeoutSec = ((addon.timeoutMs || 7000) / 1000).toFixed(0);

    // Renderização limpa: SEM URL crua no card!
    itemEl.innerHTML = `
      <div class="addon-info">
        <span class="addon-status-dot ${statusClass}" title="${statusTitle}"></span>
        <span class="addon-name" title="${escapeHtml(addon.name)}">${escapeHtml(addon.name)}</span>
        <span class="addon-timeout-tag" title="Timeout individual">${timeoutSec}s</span>
      </div>
      <div class="addon-actions">
        <button type="button" class="btn-icon gear" title="Configurações & URL" onclick="window._openAddonSettings('${addon.id}')">⚙️</button>
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

async function updateManifestUrl() {
  const configToEncode = {
    addons: state.addons.map(a => ({
      name: a.name,
      url: a.url,
      timeoutMs: a.timeoutMs || 7000,
      enabled: a.enabled
    })),
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
            timeoutMs: a.timeoutMs || 7000,
            enabled: a.enabled !== false,
            status: 'online'
          }));
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
      if (Array.isArray(parsed.addons)) state.addons = parsed.addons;
      if (parsed.filters) state.filters = { ...state.filters, ...parsed.filters };
      if (parsed.badgeFormat) state.badgeFormat = parsed.badgeFormat;
      syncDomFromFilters();
      return;
    }
  } catch (e) {}

  syncDomFromFilters();
}
