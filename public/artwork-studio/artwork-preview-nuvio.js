/* Nuvio Hub — Artwork Studio 2.0 Nuvio Preview Simulator
 * Simula a capa renderizada em tempo real dentro do ecossistema Nuvio:
 * 1. Card Isolado (formato e corte real do card)
 * 2. Coleção no Nuvio (trilho horizontal com pastas vizinhas reais)
 * 3. Simulação de TV (tela 16:9 completa com carrossel hero e menu de navegação) */
(() => {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  class NuvioStudioPreview {
    constructor(containerEl) {
      this.containerEl = containerEl;
      this.currentMode = 'card'; // 'card' | 'collection' | 'tv'
      this.canvasDataUrl = '';
      this.project = null;
      this.group = null;
      this.folder = null;
      this.hideTitle = false;
    }

    setMode(mode) {
      if (['card', 'collection', 'tv'].includes(mode)) {
        this.currentMode = mode;
        this.render();
      }
    }

    update(canvasDataUrl, { project, group, folder, hideTitle }) {
      this.canvasDataUrl = canvasDataUrl;
      this.project = project || this.project;
      this.group = group || this.group;
      this.folder = folder || this.folder;
      this.hideTitle = hideTitle !== undefined ? Boolean(hideTitle) : this.hideTitle;
      this.render();
    }

    render() {
      if (!this.containerEl) return;

      const shape = String(this.project?.tileShape || this.project?.shape || 'LANDSCAPE').toLowerCase();
      const title = this.folder?.title || this.project?.target?.title || this.group?.title || 'Minha Pasta';
      const groupTitle = this.group?.title || 'Coleção Nuvio';
      const isGroup = this.project?.target?.kind === 'group';

      let html = '';

      if (this.currentMode === 'card') {
        html = `
          <div class="nuvio-sim-isolated-card-wrap">
            <div class="nuvio-sim-card-container shape-${esc(shape)}">
              <div class="nuvio-preview-folder-card shape-${esc(shape)} active-focus">
                <span class="nuvio-preview-art ${esc(shape)}">
                  ${this.canvasDataUrl ? `<img src="${this.canvasDataUrl}" alt="${esc(title)}">` : '<span class="nuvio-preview-empty"><b>Sem imagem</b></span>'}
                </span>
                ${this.hideTitle ? '' : `<span class="nuvio-preview-folder-overlay-title"><strong>${esc(title)}</strong></span>`}
              </div>
            </div>
            <div class="nuvio-sim-card-info">
              <span class="nuvio-sim-badge">${esc(shape.toUpperCase())} · ${esc(this.project?.ratio || '16:9')}</span>
              <p class="muted">Exibição do card individual com proporção e margens de corte do Nuvio.</p>
            </div>
          </div>
        `;
      } else if (this.currentMode === 'collection') {
        const neighborFolders = (this.group?.folders || []).slice(0, 5);
        html = `
          <div class="nuvio-sim-shelf-wrap">
            <section class="nuvio-preview-rail-block" aria-label="Coleção ${esc(groupTitle)}">
              <div class="nuvio-preview-rail-heading">
                <div class="nuvio-preview-rail-title-row">
                  <span class="nuvio-preview-star" aria-hidden="true">✦</span>
                  <h3>${esc(groupTitle)}</h3>
                </div>
                <span class="nuvio-preview-rail-count">${(this.group?.folders?.length || 1)} pastas</span>
              </div>
              <div class="nuvio-preview-rail">
                <!-- Card ativo editado no Studio -->
                <div class="nuvio-preview-folder-card shape-${esc(shape)} active-focus" title="Capa atual em edição">
                  <span class="nuvio-preview-art ${esc(shape)}">
                    ${this.canvasDataUrl ? `<img src="${this.canvasDataUrl}" alt="${esc(title)}">` : '<span class="nuvio-preview-empty"><b>Sem imagem</b></span>'}
                  </span>
                  ${this.hideTitle ? '' : `<span class="nuvio-preview-folder-overlay-title"><strong>${esc(title)}</strong></span>`}
                  <span class="nuvio-sim-active-tag">EM EDIÇÃO</span>
                </div>

                <!-- Pastas vizinhas reais da coleção -->
                ${neighborFolders.filter(f => f.id !== this.folder?.id).map(f => `
                  <div class="nuvio-preview-folder-card shape-${esc(shape)}">
                    <span class="nuvio-preview-art ${esc(shape)}">
                      ${(f.customCoverImageUrl || f.coverImageUrl)
                        ? `<img src="${esc(f.customCoverImageUrl || f.coverImageUrl)}" alt="${esc(f.title)}">`
                        : `<span class="nuvio-preview-empty"><b>${esc(f.title)}</b></span>`}
                    </span>
                    ${f.hideTitle ? '' : `<span class="nuvio-preview-folder-overlay-title"><strong>${esc(f.title)}</strong></span>`}
                  </div>
                `).join('')}
              </div>
            </section>
          </div>
        `;
      } else if (this.currentMode === 'tv') {
        const backdropUrl = this.group?.backdropImageUrl || this.canvasDataUrl || '';
        html = `
          <div class="nuvio-sim-tv-bezel">
            <div class="nuvio-sim-tv-screen">
              <!-- TV Sidebar -->
              <aside class="nuvio-sim-tv-sidebar">
                <div class="nuvio-sim-tv-logo">N</div>
                <nav class="nuvio-sim-tv-nav">
                  <span class="tv-nav-item active">⌂</span>
                  <span class="tv-nav-item">🎬</span>
                  <span class="tv-nav-item">📺</span>
                  <span class="tv-nav-item">▣</span>
                  <span class="tv-nav-item">⚙</span>
                </nav>
              </aside>

              <!-- TV Main Content Area -->
              <main class="nuvio-sim-tv-main">
                <!-- Hero Banner -->
                <div class="nuvio-sim-tv-hero">
                  ${backdropUrl ? `<img class="tv-hero-bg" src="${backdropUrl}" alt="">` : ''}
                  <div class="tv-hero-gradient"></div>
                  <div class="tv-hero-info">
                    <span class="tv-hero-tag">DESTAQUE DA BIBLIOTECA</span>
                    <h2 class="tv-hero-title">${esc(groupTitle)}</h2>
                    <p class="tv-hero-sub">${esc(title)} • ${(this.group?.folders?.length || 1)} pastas no Nuvio</p>
                  </div>
                </div>

                <!-- Collection Rail in TV -->
                <div class="nuvio-sim-tv-rail-wrap">
                  <div class="nuvio-preview-rail-title-row">
                    <span class="nuvio-preview-star">✦</span>
                    <h4>${esc(groupTitle)}</h4>
                  </div>
                  <div class="nuvio-preview-rail tv-scale">
                    <div class="nuvio-preview-folder-card shape-${esc(shape)} active-focus">
                      <span class="nuvio-preview-art ${esc(shape)}">
                        ${this.canvasDataUrl ? `<img src="${this.canvasDataUrl}" alt="${esc(title)}">` : ''}
                      </span>
                      ${this.hideTitle ? '' : `<span class="nuvio-preview-folder-overlay-title"><strong>${esc(title)}</strong></span>`}
                    </div>
                    ${(this.group?.folders || []).slice(0, 4).filter(f => f.id !== this.folder?.id).map(f => `
                      <div class="nuvio-preview-folder-card shape-${esc(shape)}">
                        <span class="nuvio-preview-art ${esc(shape)}">
                          ${(f.customCoverImageUrl || f.coverImageUrl)
                            ? `<img src="${esc(f.customCoverImageUrl || f.coverImageUrl)}" alt="${esc(f.title)}">`
                            : `<span class="nuvio-preview-empty"><b>${esc(f.title)}</b></span>`}
                        </span>
                        ${f.hideTitle ? '' : `<span class="nuvio-preview-folder-overlay-title"><strong>${esc(f.title)}</strong></span>`}
                      </div>
                    `).join('')}
                  </div>
                </div>
              </main>
            </div>
            <div class="nuvio-sim-tv-stand"></div>
          </div>
        `;
      }

      this.containerEl.innerHTML = html;
    }
  }

  globalThis.NuvioStudioPreview = NuvioStudioPreview;
})();
