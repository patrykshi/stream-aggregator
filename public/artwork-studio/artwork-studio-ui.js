/* Nuvio Hub — Artwork Studio 2.0 Complete UI Orchestrator
 * Monta o workspace moderno, barra superior, barra lateral de ferramentas,
 * painel contextual de propriedades, gerenciador de camadas e variações. */
(() => {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  class ArtworkStudioUI {
    constructor({ container, canvasController, integrations, previewSimulator, onSaveAndApply, onClose }) {
      this.container = container;
      this.canvas = canvasController;
      this.integrations = integrations;
      this.preview = previewSimulator;
      this.onSaveAndApply = onSaveAndApply;
      this.onClose = onClose;

      this.activeTool = 'templates'; // 'templates' | 'backgrounds' | 'tmdb' | 'mosaic' | 'text' | 'elements' | 'files' | 'ai'
      this.activeRightTab = 'properties'; // 'properties' | 'layers'
      this.viewMode = 'editor'; // 'editor' | 'nuvio'
      this.nuvioMode = 'card'; // 'card' | 'collection' | 'tv'

      this.currentProject = null;
      this.currentGroup = null;
      this.currentFolder = null;
      this.mosaicData = { groups: {}, configured: false };
      this.tmdbCandidates = [];
      this.selectedObject = null;
      this.isDirty = false;
      this.saveStatus = 'saved'; // 'saved' | 'saving' | 'dirty'

      this.initDOMElements();
      this.bindEvents();
    }

    initDOMElements() {
      this.container.innerHTML = `
        <div class="artwork-studio-shell">
          <!-- Topbar -->
          <header class="artwork-topbar">
            <div class="artwork-topbar-left">
              <button type="button" class="btn btn-ghost artwork-back-btn" id="artBtnBack" title="Voltar às Coleções">
                ← Coleções
              </button>
              <div class="artwork-project-meta">
                <input type="text" class="artwork-project-title-input" id="artProjectTitle" value="Capa da Coleção" title="Nome do projeto">
                <span class="artwork-target-badge" id="artTargetBadge">Pasta</span>
              </div>
              <span class="artwork-save-status-pill" id="artSaveStatusPill">✓ Salvo</span>
            </div>

            <div class="artwork-topbar-center">
              <div class="artwork-history-controls">
                <button type="button" class="btn btn-ghost btn-icon" id="artBtnUndo" title="Desfazer (Ctrl+Z)" disabled>↶</button>
                <button type="button" class="btn btn-ghost btn-icon" id="artBtnRedo" title="Refazer (Ctrl+Y)" disabled>↷</button>
              </div>

              <!-- Shape Pills (with data-tile-shape and data-art-ratio for test compliance) -->
              <div class="artwork-shape-group" role="group" aria-label="Proporção da imagem">
                <button type="button" class="artwork-shape-btn active" data-art-shape="LANDSCAPE" data-tile-shape="LANDSCAPE" data-art-ratio="16:9">Landscape 16:9</button>
                <button type="button" class="artwork-shape-btn" data-art-shape="POSTER" data-tile-shape="POSTER" data-art-ratio="2:3">Poster 2:3</button>
                <button type="button" class="artwork-shape-btn" data-art-shape="PORTRAIT" data-tile-shape="PORTRAIT" data-art-ratio="3:4">Portrait 3:4</button>
                <button type="button" class="artwork-shape-btn" data-art-shape="SQUARE" data-tile-shape="SQUARE" data-art-ratio="1:1">Square 1:1</button>
                <button type="button" class="artwork-shape-btn" data-art-shape="BACKDROP" data-tile-shape="LANDSCAPE" data-art-ratio="16:9 HD">Backdrop HD</button>
              </div>

              <!-- View Switcher -->
              <div class="artwork-view-switcher">
                <button type="button" class="artwork-view-btn active" id="artBtnViewEditor">✏ Editor</button>
                <button type="button" class="artwork-view-btn" id="artBtnViewNuvio">📺 Prévia Nuvio</button>
              </div>
            </div>

            <div class="artwork-topbar-right">
              <button type="button" class="btn btn-ghost" id="artBtnVariations" title="Comparar Versões Alternativas">
                ❖ Variações (<span id="artVariationsCount">1</span>)
              </button>
              <button type="button" class="btn btn-subtle" id="artBtnExport">
                ⬇ Exportar
              </button>
              <button type="button" class="btn btn-primary" id="artBtnSaveAndApply">
                ✦ Salvar e Aplicar
              </button>
            </div>
          </header>

          <!-- Main Layout -->
          <div class="artwork-workspace-body">
            <!-- Left Tool Rail -->
            <nav class="artwork-tool-rail" aria-label="Ferramentas de Criação">
              <button type="button" class="artwork-tool-tab active" data-tool="templates" title="Modelos Prontos">
                <span class="tool-icon">◫</span>
                <span class="tool-label">Modelos</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="backgrounds" title="Fundos e Gradientes">
                <span class="tool-icon">🎨</span>
                <span class="tool-label">Fundos</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="tmdb" title="Imagens do TMDB">
                <span class="tool-icon">🎬</span>
                <span class="tool-label">TMDB</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="mosaic" title="Gerador de Mosaicos">
                <span class="tool-icon">▦</span>
                <span class="tool-label">Mosaicos</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="text" title="Editor de Texto">
                <span class="tool-icon">T</span>
                <span class="tool-label">Texto</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="elements" title="Elementos e Formas">
                <span class="tool-icon">❖</span>
                <span class="tool-label">Elementos</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="files" title="Meus Arquivos e Uploads">
                <span class="tool-icon">📁</span>
                <span class="tool-label">Arquivos</span>
              </button>
              <button type="button" class="artwork-tool-tab" data-tool="ai" title="Gerador IA Gemini">
                <span class="tool-icon">✦</span>
                <span class="tool-label">IA</span>
              </button>
            </nav>

            <!-- Left Expanded Tool Drawer -->
            <aside class="artwork-tool-drawer" id="artworkToolDrawer">
              <div class="artwork-drawer-header">
                <h3 id="artDrawerTitle">Modelos</h3>
                <button type="button" class="btn btn-ghost btn-icon btn-small" id="artBtnCloseDrawer" title="Recolher painel">✕</button>
              </div>
              <div class="artwork-drawer-content" id="artDrawerContent">
                <!-- Dynamically populated by renderActiveToolDrawer() -->
              </div>
            </aside>

            <!-- Center Viewport (Canvas / Nuvio Preview) -->
            <main class="artwork-center-viewport" id="artworkCenterViewport">
              <!-- Canvas Area -->
              <div class="artwork-canvas-stage" id="artworkCanvasStage">
                <div class="artwork-canvas-wrap" id="artworkFabricCanvasWrap">
                  <canvas id="artworkFabricCanvas"></canvas>
                </div>
              </div>

              <!-- Nuvio Simulation Overlay (hidden by default) -->
              <div class="artwork-nuvio-simulation-view" id="artworkNuvioSimView" hidden>
                <div class="artwork-nuvio-sim-controls">
                  <span class="nuvio-sim-label">Modo de Simulação Nuvio:</span>
                  <div class="artwork-sub-pills">
                    <button type="button" class="artwork-sub-pill active" data-nuvio-sub="card">Card Isolado</button>
                    <button type="button" class="artwork-sub-pill" data-nuvio-sub="collection">Coleção no Nuvio</button>
                    <button type="button" class="artwork-sub-pill" data-nuvio-sub="tv">Simulação de TV</button>
                  </div>
                </div>
                <div class="artwork-nuvio-sim-stage" id="artworkNuvioSimStage">
                  <!-- Populated by NuvioStudioPreview -->
                </div>
              </div>

              <!-- Viewport Footer Floating Bar (Zoom & Helpers) -->
              <div class="artwork-viewport-footer">
                <div class="artwork-zoom-controls">
                  <button type="button" class="btn btn-ghost btn-small btn-icon" id="artBtnZoomOut" title="Reduzir Zoom">-</button>
                  <span class="artwork-zoom-text" id="artZoomText">100%</span>
                  <button type="button" class="btn btn-ghost btn-small btn-icon" id="artBtnZoomIn" title="Aumentar Zoom">+</button>
                  <button type="button" class="btn btn-ghost btn-small" id="artBtnZoomFit" title="Ajustar à Tela">⛶ Ajustar</button>
                </div>
                <div class="artwork-stage-helpers">
                  <button type="button" class="btn btn-ghost btn-small" id="artBtnToggleGuides" title="Alternar Margens de Segurança de TV">
                    ⌗ Guias de TV
                  </button>
                </div>
              </div>
            </main>

            <!-- Right Sidebar: Properties & Layers -->
            <aside class="artwork-right-sidebar">
              <div class="artwork-tab-header">
                <button type="button" class="artwork-sidebar-tab active" data-right-tab="properties">Propriedades</button>
                <button type="button" class="artwork-sidebar-tab" data-right-tab="layers">Camadas</button>
              </div>
              <div class="artwork-sidebar-body">
                <div class="artwork-tab-content active" id="artPropertiesTab">
                  <!-- Dynamically populated by renderProperties() -->
                </div>
                <div class="artwork-tab-content" id="artLayersTab" hidden>
                  <!-- Dynamically populated by renderLayers() -->
                </div>
              </div>
            </aside>
          </div>

          <!-- Variations Strip (Drawer at bottom) -->
          <div class="artwork-variations-drawer" id="artworkVariationsDrawer" hidden>
            <div class="artwork-variations-header">
              <h4>Variações do Projeto (Comparação A/B)</h4>
              <div class="artwork-variations-actions">
                <button type="button" class="btn btn-small btn-subtle" id="artBtnAddVariation">+ Nova Variação</button>
                <button type="button" class="btn btn-ghost btn-small" id="artBtnCloseVariations">✕</button>
              </div>
            </div>
            <div class="artwork-variations-strip" id="artworkVariationsStrip">
              <!-- Populated by renderVariations() -->
            </div>
          </div>

          <!-- Export Modal -->
          <div class="artwork-export-dialog" id="artworkExportDialog" hidden>
            <div class="artwork-export-box">
              <div class="artwork-export-head">
                <h3>Exportar Imagem</h3>
                <button type="button" class="btn btn-ghost btn-icon btn-small" id="artBtnCloseExport">✕</button>
              </div>
              <div class="artwork-export-form">
                <label class="field">
                  <span>Formato de Imagem</span>
                  <select id="artExportFormat">
                    <option value="webp" selected>WebP (Recomendado para Stremio/Nuvio)</option>
                    <option value="png">PNG (Sem perdas, alta fidelidade)</option>
                    <option value="jpeg">JPEG (Compatibilidade máxima)</option>
                  </select>
                </label>
                <label class="field">
                  <span>Qualidade (<span id="artExportQualityVal">90</span>%)</span>
                  <input type="range" id="artExportQuality" min="60" max="100" value="90">
                </label>
                <div class="artwork-export-info" id="artExportInfo">
                  Dimensões: 1280 × 720 px · Proporção: 16:9
                </div>
              </div>
              <div class="artwork-export-actions">
                <button type="button" class="btn btn-subtle" id="artBtnDownloadImage">Baixar Arquivo</button>
                <button type="button" class="btn btn-primary" id="artBtnApplyExported">Exportar e Aplicar</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    setCanvasController(canvas) {
      this.canvas = canvas;
      if (this.canvas) {
        this.bindCanvasCallbacks();
      }
    }

    setPreviewSimulator(preview) {
      this.preview = preview;
    }

    bindCanvasCallbacks() {
      if (!this.canvas) return;
      this.canvas.onSelectionChange(obj => {
        this.selectedObject = obj;
        this.renderProperties();
        this.renderLayers();
      });

      this.canvas.onModified(() => {
        this.setDirty();
        this.syncLivePreview();
      });

      this.canvas.onLayersChange(() => {
        this.renderLayers();
      });
    }

    bindEvents() {
      // Topbar Actions
      this.$('#artBtnBack').addEventListener('click', () => this.onClose());
      this.$('#artProjectTitle').addEventListener('input', e => {
        if (this.currentProject) {
          this.currentProject.name = e.target.value;
          this.setDirty();
        }
      });

      // Undo / Redo
      this.$('#artBtnUndo').addEventListener('click', () => this.handleUndo());
      this.$('#artBtnRedo').addEventListener('click', () => this.handleRedo());

      // Shape change pills
      this.container.querySelectorAll('[data-art-shape]').forEach(btn => {
        btn.addEventListener('click', () => this.handleShapeChange(btn.dataset.artShape));
      });

      // View switcher
      this.$('#artBtnViewEditor').addEventListener('click', () => this.setViewMode('editor'));
      this.$('#artBtnViewNuvio').addEventListener('click', () => this.setViewMode('nuvio'));

      // Nuvio sub-modes
      this.container.querySelectorAll('[data-nuvio-sub]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.container.querySelectorAll('[data-nuvio-sub]').forEach(b => b.classList.toggle('active', b === btn));
          if (this.preview) {
            this.preview.setMode(btn.dataset.nuvioSub);
          }
        });
      });

      // Variations drawer
      this.$('#artBtnVariations').addEventListener('click', () => this.toggleVariationsDrawer());
      this.$('#artBtnCloseVariations').addEventListener('click', () => this.toggleVariationsDrawer(false));
      this.$('#artBtnAddVariation').addEventListener('click', () => this.createNewVariation());

      // Export modal
      this.$('#artBtnExport').addEventListener('click', () => this.openExportModal());
      this.$('#artBtnCloseExport').addEventListener('click', () => this.closeExportModal());
      this.$('#artBtnDownloadImage').addEventListener('click', () => this.downloadExported());
      this.$('#artBtnApplyExported').addEventListener('click', () => this.applyExported());
      this.$('#artExportQuality').addEventListener('input', e => {
        this.$('#artExportQualityVal').textContent = e.target.value;
      });

      // Save and Apply CTA
      this.$('#artBtnSaveAndApply').addEventListener('click', () => this.handleSaveAndApply());

      // Left Tool Rail
      this.container.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => this.setActiveTool(btn.dataset.tool));
      });
      this.$('#artBtnCloseDrawer').addEventListener('click', () => this.closeDrawer());

      // Right Sidebar Tabs
      this.container.querySelectorAll('[data-right-tab]').forEach(tab => {
        tab.addEventListener('click', () => this.setActiveRightTab(tab.dataset.rightTab));
      });

      // Zoom Controls
      this.$('#artBtnZoomIn').addEventListener('click', () => this.zoomStep(0.15));
      this.$('#artBtnZoomOut').addEventListener('click', () => this.zoomStep(-0.15));
      this.$('#artBtnZoomFit').addEventListener('click', () => this.fitCanvasToViewport());
      this.$('#artBtnToggleGuides').addEventListener('click', () => {
        const active = this.canvas.toggleSafeMargins();
        this.$('#artBtnToggleGuides').classList.toggle('active', active);
      });

      // Canvas Controller Callbacks (if controller already attached)
      if (this.canvas) {
        this.bindCanvasCallbacks();
      }

      // Keyboard shortcuts
      window.addEventListener('keydown', e => {
        if (!this.isOpen()) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) this.handleRedo();
          else this.handleUndo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          this.handleRedo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          this.canvas.duplicateSelected();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.selectedObject && !this.selectedObject.isEditing) {
            e.preventDefault();
            this.canvas.deleteSelected();
          }
        }
      });

      // Responsive window resize
      window.addEventListener('resize', () => {
        if (this.isOpen() && this.viewMode === 'editor') {
          this.fitCanvasToViewport();
        }
      });
    }

    $(sel) {
      return this.container.querySelector(sel);
    }

    isOpen() {
      return !this.container.hidden;
    }

    /* ---------------- Project Loading & Initialization ---------------- */

    async loadProject(project, { group, folder }) {
      this.currentProject = project;
      this.currentGroup = group;
      this.currentFolder = folder;

      // Update UI Header
      this.$('#artProjectTitle').value = project.name || 'Capa da Coleção';
      const targetLabel = project.target?.kind === 'group'
        ? `Coleção: ${group?.title || 'Principal'}`
        : `Pasta: ${folder?.title || 'Geral'}`;
      this.$('#artTargetBadge').textContent = targetLabel;

      // Update Shape Pills
      this.updateShapePills(project.shape);

      // Initialize Canvas Dimensions and Document
      const spec = globalThis.ArtworkStudioModel.getShapeSpec(project.shape);
      this.canvas.setDimensions(spec.width, spec.height);

      // Check if project has canvasDoc or seed template
      if (project.canvasDoc && Object.keys(project.canvasDoc).length) {
        await this.canvas.loadFromJSON(project.canvasDoc);
      } else {
        // Seed default template matching target title
        const defaultTitle = folder?.title || group?.title || 'COLEÇÃO';
        const defaultTpl = globalThis.ArtworkStudioTemplates.TEMPLATES[0];
        defaultTpl.apply(this.canvas, defaultTitle);
      }

      this.fitCanvasToViewport();
      this.renderActiveToolDrawer();
      this.renderProperties();
      this.renderLayers();
      this.updateVariationsCount();
      this.syncLivePreview();
      this.setSaved();

      // Pre-load TMDB and mosaic categories in background
      void this.loadBackgroundData();
    }

    async loadBackgroundData() {
      try {
        const [categoriesData, candidatesData] = await Promise.all([
          this.integrations.getMosaicCategories().catch(() => ({ groups: {} })),
          this.integrations.searchTmdbCandidates({ query: this.currentFolder?.title || this.currentGroup?.title || '' }).catch(() => ({ items: [] }))
        ]);
        this.mosaicData = categoriesData;
        this.tmdbCandidates = candidatesData.items || [];
      } catch {}
    }

    /* ---------------- View Modes & Zoom ---------------- */

    setViewMode(mode) {
      this.viewMode = mode;
      const isEditor = mode === 'editor';
      this.$('#artBtnViewEditor').classList.toggle('active', isEditor);
      this.$('#artBtnViewNuvio').classList.toggle('active', !isEditor);

      this.$('#artworkCanvasStage').hidden = !isEditor;
      this.$('#artworkNuvioSimView').hidden = isEditor;

      if (!isEditor) {
        this.syncLivePreview(true);
        if (this.preview) {
          this.preview.render();
        }
      } else {
        this.fitCanvasToViewport();
      }
    }

    fitCanvasToViewport() {
      const stage = this.$('#artworkCanvasStage');
      if (!stage || !this.isOpen()) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const scale = this.canvas.fitToViewport(w, h, 64);
      this.$('#artZoomText').textContent = `${Math.round(scale * 100)}%`;
    }

    zoomStep(delta) {
      const current = this.canvas.scale;
      const next = Math.max(0.2, Math.min(2.5, current + delta));
      this.canvas.setZoomLevel(next);
      this.$('#artZoomText').textContent = `${Math.round(next * 100)}%`;
    }

    /* ---------------- Shape Adaptation ---------------- */

    handleShapeChange(shapeKey) {
      const spec = globalThis.ArtworkStudioModel.getShapeSpec(shapeKey);
      this.updateShapePills(spec.key);

      this.canvas.changeShape(spec);
      if (this.currentProject) {
        this.currentProject.shape = spec.key;
        this.currentProject.tileShape = spec.tileShape;
        this.currentProject.ratio = spec.ratio;
        this.currentProject.width = spec.width;
        this.currentProject.height = spec.height;
      }
      this.fitCanvasToViewport();
      this.setDirty();
      this.syncLivePreview();
    }

    updateShapePills(activeShapeKey) {
      const key = globalThis.ArtworkStudioModel.normalizeShapeKey(activeShapeKey);
      this.container.querySelectorAll('[data-art-shape]').forEach(btn => {
        const isCurrent = btn.dataset.artShape === key;
        btn.classList.toggle('active', isCurrent);
        btn.setAttribute('aria-pressed', String(isCurrent));
      });
    }

    /* ---------------- Left Tool Drawer ---------------- */

    setActiveTool(toolId) {
      this.activeTool = toolId;
      this.container.querySelectorAll('[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === toolId);
      });
      this.$('#artworkToolDrawer').classList.remove('collapsed');
      this.renderActiveToolDrawer();
    }

    closeDrawer() {
      this.$('#artworkToolDrawer').classList.add('collapsed');
    }

    renderActiveToolDrawer() {
      const content = this.$('#artDrawerContent');
      const titleEl = this.$('#artDrawerTitle');
      if (!content || !titleEl) return;

      const titles = {
        templates: 'Modelos de Capa',
        backgrounds: 'Fundos & Gradientes',
        tmdb: 'Buscar no TMDB',
        mosaic: 'Mosaico Original TMDB',
        text: 'Adicionar Texto',
        elements: 'Elementos & Ícones',
        files: 'Meus Arquivos',
        ai: 'Gerar com Gemini IA'
      };
      titleEl.textContent = titles[this.activeTool] || 'Ferramentas';

      if (this.activeTool === 'templates') {
        this.renderTemplatesTool(content);
      } else if (this.activeTool === 'backgrounds') {
        this.renderBackgroundsTool(content);
      } else if (this.activeTool === 'tmdb') {
        this.renderTmdbTool(content);
      } else if (this.activeTool === 'mosaic') {
        this.renderMosaicTool(content);
      } else if (this.activeTool === 'text') {
        this.renderTextTool(content);
      } else if (this.activeTool === 'elements') {
        this.renderElementsTool(content);
      } else if (this.activeTool === 'files') {
        this.renderFilesTool(content);
      } else if (this.activeTool === 'ai') {
        this.renderAiTool(content);
      }
    }

    renderTemplatesTool(container) {
      const templates = globalThis.ArtworkStudioTemplates.TEMPLATES;
      container.innerHTML = `
        <p class="drawer-desc">Selecione um ponto de partida visual. Todas as camadas continuam editáveis.</p>
        <div class="artwork-templates-grid">
          ${templates.map(tpl => `
            <button type="button" class="artwork-template-card" data-template-id="${tpl.id}">
              <div class="tpl-thumb" style="background: ${tpl.thumbnail};">
                <span class="tpl-thumb-icon">✦</span>
              </div>
              <span class="tpl-name">${esc(tpl.name)}</span>
            </button>
          `).join('')}
        </div>
      `;

      container.querySelectorAll('[data-template-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tpl = templates.find(t => t.id === btn.dataset.templateId);
          if (tpl) {
            const currentTitle = this.$('#artProjectTitle')?.value || this.currentFolder?.title || 'COLEÇÃO';
            tpl.apply(this.canvas, currentTitle);
            this.setDirty();
            this.syncLivePreview();
          }
        });
      });
    }

    renderBackgroundsTool(container) {
      const gradients = globalThis.ArtworkStudioTemplates.GRADIENTS;
      const solids = globalThis.ArtworkStudioTemplates.SOLID_COLORS;
      const currentBg = this.canvas.bgConfig || {};

      container.innerHTML = `
        <div class="tool-section">
          <h4>Gradientes Cinematográficos</h4>
          <div class="artwork-gradients-grid">
            ${gradients.map((g, i) => `
              <button type="button" class="artwork-grad-chip" data-grad-index="${i}" style="background: linear-gradient(135deg, ${g.primary}, ${g.secondary});" title="${esc(g.name)}">
                <span>${esc(g.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="tool-section">
          <h4>Cores Sólidas</h4>
          <div class="artwork-solids-row">
            ${solids.map(c => `
              <button type="button" class="artwork-solid-dot" data-solid-color="${c}" style="background-color: ${c};" title="${c}"></button>
            `).join('')}
          </div>
        </div>

        <div class="tool-section">
          <h4>Personalizar Gradiente</h4>
          <div class="field-row">
            <label class="field">
              <span>Cor Primária</span>
              <input type="color" id="artBgPrimary" value="${esc(currentBg.primary || '#182b42')}">
            </label>
            <label class="field">
              <span>Cor Secundária</span>
              <input type="color" id="artBgSecondary" value="${esc(currentBg.secondary || '#060c15')}">
            </label>
          </div>
          <label class="field">
            <span>Direção do Gradiente</span>
            <select id="artBgDirection">
              <option value="radial" ${currentBg.direction === 'radial' ? 'selected' : ''}>Radial Central (Foco Suave)</option>
              <option value="diagonal" ${currentBg.direction === 'diagonal' ? 'selected' : ''}>Diagonal Dinâmico</option>
              <option value="horizontal" ${currentBg.direction === 'horizontal' ? 'selected' : ''}>Linear Horizontal</option>
            </select>
          </label>
          <label class="field">
            <span>Escurecimento Inferior (Scrim)</span>
            <input type="range" id="artBgScrim" min="0" max="100" value="${Math.round((currentBg.scrimOpacity || 0.7) * 100)}">
          </label>
        </div>
      `;

      container.querySelectorAll('[data-grad-index]').forEach(btn => {
        btn.addEventListener('click', () => {
          const g = gradients[Number(btn.dataset.gradIndex)];
          if (g) {
            this.canvas.applyBackground({
              type: 'gradient',
              primary: g.primary,
              secondary: g.secondary,
              accent: g.accent,
              direction: g.dir
            });
            this.renderBackgroundsTool(container);
            this.setDirty();
            this.syncLivePreview();
          }
        });
      });

      container.querySelectorAll('[data-solid-color]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.canvas.applyBackground({
            type: 'solid',
            primary: btn.dataset.solidColor
          });
          this.setDirty();
          this.syncLivePreview();
        });
      });

      this.$('#artBgPrimary')?.addEventListener('input', e => {
        this.canvas.applyBackground({ type: 'gradient', primary: e.target.value });
        this.setDirty();
        this.syncLivePreview();
      });
      this.$('#artBgSecondary')?.addEventListener('input', e => {
        this.canvas.applyBackground({ type: 'gradient', secondary: e.target.value });
        this.setDirty();
        this.syncLivePreview();
      });
      this.$('#artBgDirection')?.addEventListener('change', e => {
        this.canvas.applyBackground({ type: 'gradient', direction: e.target.value });
        this.setDirty();
        this.syncLivePreview();
      });
      this.$('#artBgScrim')?.addEventListener('input', e => {
        this.canvas.applyBackground({ scrimOpacity: Number(e.target.value) / 100 });
        this.setDirty();
        this.syncLivePreview();
      });
    }

    renderTmdbTool(container) {
      container.innerHTML = `
        <div class="tool-section">
          <div class="artwork-search-box">
            <input type="text" class="search" id="artTmdbSearchInput" placeholder="Buscar filmes, séries no TMDB..." value="${esc(this.currentFolder?.title || '')}">
            <button type="button" class="btn btn-primary btn-small" id="artBtnTmdbSearch">Buscar</button>
          </div>
          <div class="field-row" style="margin-top: 8px;">
            <label class="field">
              <span>Tipo de Imagem</span>
              <select id="artTmdbImageType">
                <option value="backdrop" selected>Backdrops Panorâmicos (16:9)</option>
                <option value="poster">Pôsteres Verticais (2:3)</option>
              </select>
            </label>
          </div>
        </div>
        <div class="tool-section">
          <h4>Resultados TMDB</h4>
          <div class="artwork-tmdb-results" id="artTmdbResultsGrid">
            ${this.renderTmdbCards(this.tmdbCandidates)}
          </div>
        </div>
      `;

      this.$('#artBtnTmdbSearch')?.addEventListener('click', () => this.doTmdbSearch());
      this.$('#artTmdbSearchInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.doTmdbSearch();
      });
      this.$('#artTmdbImageType')?.addEventListener('change', () => {
        this.$('#artTmdbResultsGrid').innerHTML = this.renderTmdbCards(this.tmdbCandidates);
        this.bindTmdbCardClicks();
      });

      this.bindTmdbCardClicks();
    }

    renderTmdbCards(items) {
      if (!items || !items.length) {
        return '<div class="empty-hint">Nenhum resultado encontrado. Digite o nome de um filme ou série acima.</div>';
      }
      const type = this.$('#artTmdbImageType')?.value || 'backdrop';
      return items.map((it, idx) => {
        const imgUrl = type === 'backdrop' ? (it.backdrop || it.poster) : (it.poster || it.backdrop);
        return `
          <button type="button" class="tmdb-card-item" data-tmdb-index="${idx}" title="${esc(it.name)} (${esc(it.year || '')})">
            <img src="${esc(imgUrl)}" alt="" loading="lazy">
            <span class="tmdb-card-title">${esc(it.name)}</span>
          </button>
        `;
      }).join('');
    }

    bindTmdbCardClicks() {
      const type = this.$('#artTmdbImageType')?.value || 'backdrop';
      this.container.querySelectorAll('[data-tmdb-index]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const item = this.tmdbCandidates[Number(btn.dataset.tmdbIndex)];
          if (!item) return;
          const imgUrl = type === 'backdrop' ? (item.backdrop || item.poster) : (item.poster || item.backdrop);
          if (imgUrl) {
            btn.classList.add('loading');
            try {
              // Add as image layer
              await this.canvas.addImage(imgUrl, { title: item.name });
              this.setDirty();
              this.syncLivePreview();
            } finally {
              btn.classList.remove('loading');
            }
          }
        });
      });
    }

    async doTmdbSearch() {
      const q = this.$('#artTmdbSearchInput')?.value.trim() || '';
      const grid = this.$('#artTmdbResultsGrid');
      if (grid) grid.innerHTML = '<div class="empty-hint">Consultando TMDB...</div>';
      try {
        const res = await this.integrations.searchTmdbCandidates({ query: q });
        this.tmdbCandidates = res.items || [];
        if (grid) {
          grid.innerHTML = this.renderTmdbCards(this.tmdbCandidates);
          this.bindTmdbCardClicks();
        }
      } catch (e) {
        if (grid) grid.innerHTML = `<div class="empty-hint is-error">${esc(e.message)}</div>`;
      }
    }

    renderMosaicTool(container) {
      const groups = this.mosaicData.groups || {};
      const groupKeys = Object.keys(groups);
      const activeGroup = this.mosaicGroup || groupKeys[0] || 'generos';
      const categories = groups[activeGroup] || [];

      container.innerHTML = `
        <div class="tool-section">
          <p class="drawer-desc">
            Executa o <strong>gerador Python original</strong> de fileiras diagonais de backdrops do seu PC.
            A imagem resultante é aplicada como fundo preservando todas as camadas de texto.
          </p>

          <div class="field-row">
            <label class="field">
              <span>Grupo</span>
              <select id="artMosaicGroupSelect">
                ${groupKeys.map(k => `<option value="${esc(k)}" ${k === activeGroup ? 'selected' : ''}>${esc(k.toUpperCase())}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span>Categoria</span>
              <select id="artMosaicCategorySelect">
                ${categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}${c.custom ? ' ★' : ''}</option>`).join('')}
              </select>
            </label>
          </div>

          <label class="field">
            <span>Quantidade de Imagens</span>
            <select id="artMosaicCardsSelect">
              <option value="16" selected>16 Backdrops (Padrão)</option>
              <option value="12">12 Backdrops (Mais Rápido)</option>
              <option value="20">20 Backdrops (Denso)</option>
              <option value="28">28 Backdrops (Alta Densidade)</option>
            </select>
          </label>

          <button type="button" class="btn btn-primary" id="artBtnGenerateMosaic" style="width: 100%; margin-top: 8px;">
            ✦ Gerar Mosaico com TMDB
          </button>
        </div>

        <div class="tool-section">
          <h4>Adicionar Nova Categoria do TMDB</h4>
          <div class="artwork-search-box">
            <input type="text" class="search" id="artMosaicSearchInput" placeholder="Ex.: A24, Cyberpunk, Netflix, Japão...">
            <button type="button" class="btn btn-subtle btn-small" id="artBtnMosaicSearch">Buscar</button>
          </div>
          <div class="artwork-mosaic-add-results" id="artMosaicAddResults"></div>
        </div>
      `;

      this.$('#artMosaicGroupSelect')?.addEventListener('change', e => {
        this.mosaicGroup = e.target.value;
        const catSelect = this.$('#artMosaicCategorySelect');
        const cats = this.mosaicData.groups?.[this.mosaicGroup] || [];
        if (catSelect) {
          catSelect.innerHTML = cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}${c.custom ? ' ★' : ''}</option>`).join('');
        }
      });

      this.$('#artBtnGenerateMosaic')?.addEventListener('click', () => this.generateMosaic());

      this.$('#artBtnMosaicSearch')?.addEventListener('click', () => this.searchMosaicToAdd());
      this.$('#artMosaicSearchInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.searchMosaicToAdd();
      });
    }

    async generateMosaic() {
      const group = this.$('#artMosaicGroupSelect')?.value;
      const category = this.$('#artMosaicCategorySelect')?.value;
      const cards = Number(this.$('#artMosaicCardsSelect')?.value) || 16;
      const btn = this.$('#artBtnGenerateMosaic');

      if (!group || !category) return;

      btn.disabled = true;
      btn.textContent = 'Gerando mosaico original...';

      try {
        const res = await this.integrations.composeOriginalMosaic({
          group,
          category,
          cards,
          shape: this.currentProject?.shape || 'LANDSCAPE',
          title: this.currentProject?.name || ''
        });

        if (res.baseDataUrl || res.dataUrl) {
          const bgUrl = res.baseDataUrl || res.dataUrl;
          this.canvas.applyBackground({
            type: 'mosaic',
            imageUrl: bgUrl
          });
          this.setDirty();
          this.syncLivePreview();
        }
      } catch (err) {
        alert(err.message || 'Falha ao gerar mosaico.');
      } finally {
        btn.disabled = false;
        btn.textContent = '✦ Gerar Mosaico com TMDB';
      }
    }

    async searchMosaicToAdd() {
      const q = this.$('#artMosaicSearchInput')?.value.trim() || '';
      const group = this.$('#artMosaicGroupSelect')?.value || 'generos';
      const target = this.$('#artMosaicAddResults');
      if (!target || q.length < 2) return;

      target.innerHTML = '<span class="muted">Buscando categorias...</span>';
      try {
        const res = await this.integrations.searchMosaicCategories(group, q);
        const items = res.items || [];
        if (!items.length) {
          target.innerHTML = '<span class="muted">Nenhuma categoria encontrada.</span>';
          return;
        }
        target.innerHTML = items.slice(0, 10).map((it, idx) => `
          <button type="button" class="btn btn-subtle btn-small" data-add-cat-idx="${idx}">
            + ${esc(it.name)} <small>(${esc(it.media === 'tv' ? 'Séries' : 'Filmes')})</small>
          </button>
        `).join('');

        target.querySelectorAll('[data-add-cat-idx]').forEach(b => {
          b.addEventListener('click', async () => {
            const option = items[Number(b.dataset.addCatIdx)];
            if (!option) return;
            b.textContent = 'Adicionando...';
            try {
              await this.integrations.addCustomMosaicCategory(group, option);
              this.mosaicData = await this.integrations.getMosaicCategories();
              this.renderMosaicTool(this.$('#artDrawerContent'));
            } catch (err) {
              alert(err.message || 'Erro ao adicionar.');
            }
          });
        });
      } catch (err) {
        target.innerHTML = `<span class="is-error">${esc(err.message)}</span>`;
      }
    }

    renderTextTool(container) {
      const presets = globalThis.ArtworkStudioTemplates.TYPOGRAPHY_PRESETS;
      container.innerHTML = `
        <div class="tool-section">
          <h4>Inserir Bloco de Texto</h4>
          <div class="artwork-btn-stack">
            <button type="button" class="btn btn-subtle" id="artBtnAddTitle">
              <span style="font-size: 1.15em; font-weight: bold;">Título Principal</span>
            </button>
            <button type="button" class="btn btn-subtle" id="artBtnAddSubtitle">
              <span style="font-size: 0.95em; color: #94a3b8;">Subtítulo</span>
            </button>
            <button type="button" class="btn btn-subtle" id="artBtnAddBody">
              <span style="font-size: 0.85em; color: #64748b;">Texto Auxiliar / Tagline</span>
            </button>
          </div>
        </div>

        <div class="tool-section">
          <h4>Composições Prontas (Ícone + Título)</h4>
          <div class="artwork-typo-presets-list">
            ${presets.map(p => `
              <button type="button" class="artwork-typo-preset-card" data-typo-title="${esc(p.title)}" data-typo-sub="${esc(p.subtitle)}" data-typo-icon="${esc(p.icon)}">
                <span class="preset-icon">${esc(p.icon)}</span>
                <div class="preset-texts">
                  <strong>${esc(p.title)}</strong>
                  <small>${esc(p.subtitle)}</small>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      `;

      this.$('#artBtnAddTitle')?.addEventListener('click', () => {
        this.canvas.addText({
          text: this.currentFolder?.title || 'Título',
          fontSize: 54,
          isTitle: true
        });
      });

      this.$('#artBtnAddSubtitle')?.addEventListener('click', () => {
        this.canvas.addText({
          text: 'SUBTÍTULO DA COLEÇÃO',
          fontSize: 26,
          fill: '#94a3b8',
          isSubtitle: true
        });
      });

      this.$('#artBtnAddBody')?.addEventListener('click', () => {
        this.canvas.addText({
          text: 'Texto descritivo em uma ou duas linhas.',
          fontSize: 20,
          fill: '#cbd5e1'
        });
      });

      container.querySelectorAll('[data-typo-title]').forEach(btn => {
        btn.addEventListener('click', () => {
          const title = btn.dataset.typoTitle;
          const sub = btn.dataset.typoSub;
          const icon = btn.dataset.typoIcon;

          if (icon) {
            this.canvas.addIconBadge({ icon, size: 76, top: this.canvas.height * 0.36 });
          }
          this.canvas.addText({
            text: title.toUpperCase(),
            fontSize: Math.round(this.canvas.height * 0.095),
            isTitle: true,
            top: this.canvas.height * 0.74
          });
          if (sub) {
            this.canvas.addText({
              text: sub,
              fontSize: Math.round(this.canvas.height * 0.033),
              fill: '#94a3b8',
              isSubtitle: true,
              top: this.canvas.height * 0.84
            });
          }
        });
      });
    }

    renderElementsTool(container) {
      const glyphs = globalThis.ArtworkStudioTemplates.ICON_GLYPHS;
      container.innerHTML = `
        <div class="tool-section">
          <h4>Formas Geométricas</h4>
          <div class="artwork-shapes-row">
            <button type="button" class="btn btn-subtle" id="artBtnShapeRect" title="Retângulo">█ Retângulo</button>
            <button type="button" class="btn btn-subtle" id="artBtnShapeCircle" title="Círculo">● Círculo</button>
            <button type="button" class="btn btn-subtle" id="artBtnShapeBadge" title="Moldura">▣ Moldura</button>
            <button type="button" class="btn btn-subtle" id="artBtnShapeLine" title="Linha">― Linha</button>
          </div>
        </div>

        <div class="tool-section">
          <h4>Ícones & Símbolos de Destaque</h4>
          <div class="artwork-glyphs-grid">
            ${glyphs.map(g => `
              <button type="button" class="glyph-btn" data-glyph="${esc(g)}">${esc(g)}</button>
            `).join('')}
          </div>
        </div>
      `;

      this.$('#artBtnShapeRect')?.addEventListener('click', () => this.canvas.addShape('rect'));
      this.$('#artBtnShapeCircle')?.addEventListener('click', () => this.canvas.addShape('circle'));
      this.$('#artBtnShapeBadge')?.addEventListener('click', () => this.canvas.addShape('badgeBox'));
      this.$('#artBtnShapeLine')?.addEventListener('click', () => this.canvas.addShape('line'));

      container.querySelectorAll('[data-glyph]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.canvas.addIconBadge({ icon: btn.dataset.glyph });
        });
      });
    }

    renderFilesTool(container) {
      container.innerHTML = `
        <div class="tool-section">
          <p class="drawer-desc">Envie logotipos, ícones ou fotos locais (PNG, WebP, JPEG até 15 MB) para compor no canvas.</p>
          <label class="btn btn-primary" style="display: block; text-align: center; cursor: pointer;">
            <span>↑ Selecionar Arquivo Local</span>
            <input type="file" id="artLocalFileInput" accept="image/png,image/webp,image/jpeg" hidden>
          </label>
        </div>
        <div class="tool-section">
          <h4>Dica</h4>
          <p class="muted">Você também pode arrastar e soltar imagens diretamente sobre o canvas.</p>
        </div>
      `;

      this.$('#artLocalFileInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result;
            // Upload to backend asset store
            const assetRes = await this.integrations.uploadAsset(dataUrl, file.name);
            await this.canvas.addImage(assetRes.asset.url, { title: file.name });
            this.setDirty();
            this.syncLivePreview();
          } catch (err) {
            alert(err.message || 'Falha ao carregar imagem.');
          }
        };
        reader.readAsDataURL(file);
      });
    }

    renderAiTool(container) {
      container.innerHTML = `
        <div class="tool-section">
          <p class="drawer-desc">Geração real de arte cinematográfica via <strong>Gemini IA</strong> sem textos incorporados.</p>
          <label class="field">
            <span>Descrição / Prompt da Arte</span>
            <textarea id="artAiPromptInput" rows="3" class="search" placeholder="Ex.: Paisagem cyberpunk noturna com chuva e néon suave, estilo cinematográfico...">Arte cinematográfica dark atmosférica para coleção ${esc(this.currentFolder?.title || 'de filmes')}, iluminação dramática, rica em detalhes, sem texto</textarea>
          </label>
          <label class="field">
            <span>Estilo Visual</span>
            <select id="artAiStyleSelect">
              <option value="cinema" selected>Cinema Dark & Atmosférico</option>
              <option value="neon">Cyberpunk & Neon Sci-Fi</option>
              <option value="minimal">Minimalista 3D & Ícone</option>
              <option value="epic">Arte Conceitual Épica</option>
              <option value="noir">Editorial Noir Clássico</option>
              <option value="anime">Anime & Ilustração Vibrante</option>
            </select>
          </label>
          <button type="button" class="btn btn-primary" id="artBtnGenerateAi" style="width: 100%; margin-top: 8px;">
            ✦ Gerar Imagem com IA
          </button>
        </div>
      `;

      this.$('#artBtnGenerateAi')?.addEventListener('click', async () => {
        const prompt = this.$('#artAiPromptInput')?.value.trim();
        const style = this.$('#artAiStyleSelect')?.value || 'cinema';
        const btn = this.$('#artBtnGenerateAi');
        if (!prompt) return;

        btn.disabled = true;
        btn.textContent = 'Gerando com Gemini IA...';
        try {
          const res = await this.integrations.generateAiArtwork({
            prompt,
            style,
            shape: this.currentProject?.shape || 'LANDSCAPE',
            title: this.currentProject?.name || ''
          });
          if (res.baseDataUrl || res.dataUrl) {
            const bgUrl = res.baseDataUrl || res.dataUrl;
            this.canvas.applyBackground({
              type: 'ai',
              imageUrl: bgUrl
            });
            this.setDirty();
            this.syncLivePreview();
          }
        } catch (err) {
          alert(err.message || 'Falha ao gerar imagem com IA.');
        } finally {
          btn.disabled = false;
          btn.textContent = '✦ Gerar Imagem com IA';
        }
      });
    }

    /* ---------------- Right Sidebar: Properties & Layers ---------------- */

    setActiveRightTab(tabId) {
      this.activeRightTab = tabId;
      this.container.querySelectorAll('[data-right-tab]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.rightTab === tabId);
      });
      this.$('#artPropertiesTab').hidden = tabId !== 'properties';
      this.$('#artLayersTab').hidden = tabId !== 'layers';

      if (tabId === 'properties') this.renderProperties();
      if (tabId === 'layers') this.renderLayers();
    }

    renderProperties() {
      const container = this.$('#artPropertiesTab');
      if (!container) return;

      const obj = this.selectedObject;

      if (!obj || obj.isScrim) {
        // Canvas / Background Properties
        const bg = this.canvas.bgConfig || {};
        container.innerHTML = `
          <div class="prop-group">
            <h4 class="prop-title">Fundo do Canvas</h4>
            <label class="field">
              <span>Tipo de Fundo</span>
              <select id="propBgType">
                <option value="gradient" ${bg.type === 'gradient' ? 'selected' : ''}>Gradiente Cinematográfico</option>
                <option value="solid" ${bg.type === 'solid' ? 'selected' : ''}>Cor Sólida</option>
                <option value="image" ${bg.type === 'image' || bg.type === 'mosaic' || bg.type === 'ai' ? 'selected' : ''}>Imagem / Mosaico / IA</option>
              </select>
            </label>
            <div class="field-row">
              <label class="field">
                <span>Cor Principal</span>
                <input type="color" id="propBgColor1" value="${esc(bg.primary || '#182b42')}">
              </label>
              <label class="field">
                <span>Cor Secundária</span>
                <input type="color" id="propBgColor2" value="${esc(bg.secondary || '#060c15')}">
              </label>
            </div>
            <label class="field">
              <span>Escurecimento Inferior (Scrim)</span>
              <input type="range" id="propBgScrimRange" min="0" max="100" value="${Math.round((bg.scrimOpacity || 0.7) * 100)}">
            </label>
          </div>

          <div class="prop-group">
            <h4 class="prop-title">Exibição no Nuvio</h4>
            <label class="addon-resource-choice">
              <input type="checkbox" id="propHideTitleCheck" ${this.currentProject?.hideTitle ? 'checked' : ''}>
              <span><b>Ocultar título do app no Nuvio</b> (exibir apenas a arte criada)</span>
            </label>
          </div>
        `;

        this.$('#propBgType')?.addEventListener('change', e => {
          this.canvas.applyBackground({ type: e.target.value });
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propBgColor1')?.addEventListener('input', e => {
          this.canvas.applyBackground({ primary: e.target.value });
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propBgColor2')?.addEventListener('input', e => {
          this.canvas.applyBackground({ secondary: e.target.value });
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propBgScrimRange')?.addEventListener('input', e => {
          this.canvas.applyBackground({ scrimOpacity: Number(e.target.value) / 100 });
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propHideTitleCheck')?.addEventListener('change', e => {
          if (this.currentProject) {
            this.currentProject.hideTitle = e.target.checked;
          }
          this.setDirty();
          this.syncLivePreview();
        });
        return;
      }

      // Contextual Object Properties
      if (obj.type === 'textbox' || obj.type === 'text') {
        container.innerHTML = `
          <div class="prop-group">
            <h4 class="prop-title">Texto Selecionado</h4>
            <label class="field">
              <span>Conteúdo</span>
              <input type="text" id="propTextContent" value="${esc(obj.text || '')}">
            </label>
            <div class="field-row">
              <label class="field">
                <span>Fonte</span>
                <select id="propTextFont">
                  ${['Manrope', 'DejaVu Sans', 'system-ui', 'Impact', 'Cinzel', 'Bebas Neue'].map(f => `
                    <option value="${f}" ${obj.fontFamily === f ? 'selected' : ''}>${f}</option>
                  `).join('')}
                </select>
              </label>
              <label class="field">
                <span>Tamanho</span>
                <input type="number" id="propTextSize" min="12" max="220" value="${Math.round(obj.fontSize || 40)}">
              </label>
            </div>
            <div class="field-row">
              <label class="field">
                <span>Cor do Texto</span>
                <input type="color" id="propTextColor" value="${esc(obj.fill || '#ffffff')}">
              </label>
              <label class="field">
                <span>Peso</span>
                <select id="propTextWeight">
                  <option value="normal" ${obj.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
                  <option value="bold" ${obj.fontWeight === 'bold' ? 'selected' : ''}>Negrito</option>
                  <option value="900" ${obj.fontWeight === '900' ? 'selected' : ''}>Extra Bold</option>
                </select>
              </label>
            </div>
            <div class="field-row">
              <label class="field">
                <span>Alinhamento</span>
                <select id="propTextAlign">
                  <option value="left" ${obj.textAlign === 'left' ? 'selected' : ''}>Esquerda</option>
                  <option value="center" ${obj.textAlign === 'center' ? 'selected' : ''}>Centralizado</option>
                  <option value="right" ${obj.textAlign === 'right' ? 'selected' : ''}>Direita</option>
                </select>
              </label>
              <label class="field">
                <span>Opacidade</span>
                <input type="range" id="propTextOpacity" min="10" max="100" value="${Math.round((obj.opacity || 1) * 100)}">
              </label>
            </div>
            <div class="field-row">
              <label class="field">
                <span>Contorno (Cor)</span>
                <input type="color" id="propTextStroke" value="${esc(obj.stroke || '#07111e')}">
              </label>
              <label class="field">
                <span>Largura Contorno</span>
                <input type="number" id="propTextStrokeWidth" min="0" max="12" value="${obj.strokeWidth || 0}">
              </label>
            </div>
          </div>
          <div class="prop-group">
            <h4 class="prop-title">Ações do Elemento</h4>
            <div class="artwork-btn-stack">
              <button type="button" class="btn btn-subtle btn-small" id="propBtnDuplicate">Duplicar Elemento</button>
              <button type="button" class="btn btn-danger btn-small" id="propBtnDelete">Excluir</button>
            </div>
          </div>
        `;

        this.$('#propTextContent')?.addEventListener('input', e => {
          obj.set('text', e.target.value);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propTextFont')?.addEventListener('change', e => {
          obj.set('fontFamily', e.target.value);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
        });
        this.$('#propTextSize')?.addEventListener('input', e => {
          obj.set('fontSize', Number(e.target.value) || 30);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propTextColor')?.addEventListener('input', e => {
          obj.set('fill', e.target.value);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
          this.syncLivePreview();
        });
        this.$('#propTextWeight')?.addEventListener('change', e => {
          obj.set('fontWeight', e.target.value);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
        });
        this.$('#propTextAlign')?.addEventListener('change', e => {
          obj.set('textAlign', e.target.value);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
        });
        this.$('#propTextOpacity')?.addEventListener('input', e => {
          obj.set('opacity', Number(e.target.value) / 100);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
        });
        this.$('#propTextStroke')?.addEventListener('input', e => {
          obj.set('stroke', e.target.value);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
        });
        this.$('#propTextStrokeWidth')?.addEventListener('input', e => {
          obj.set('strokeWidth', Number(e.target.value) || 0);
          this.canvas.fCanvas.requestRenderAll();
          this.setDirty();
        });
        this.$('#propBtnDuplicate')?.addEventListener('click', () => this.canvas.duplicateSelected());
        this.$('#propBtnDelete')?.addEventListener('click', () => this.canvas.deleteSelected());
        return;
      }

      // Generic Object / Shape / Image Properties
      container.innerHTML = `
        <div class="prop-group">
          <h4 class="prop-title">Propriedades do Elemento</h4>
          <p class="muted">Tipo: ${esc(obj.layerType || obj.type)}</p>
          <div class="field-row">
            <label class="field">
              <span>Opacidade</span>
              <input type="range" id="propObjOpacity" min="10" max="100" value="${Math.round((obj.opacity || 1) * 100)}">
            </label>
            ${obj.fill && typeof obj.fill === 'string' ? `
              <label class="field">
                <span>Cor</span>
                <input type="color" id="propObjFill" value="${esc(obj.fill)}">
              </label>
            ` : ''}
          </div>
        </div>
        <div class="prop-group">
          <h4 class="prop-title">Ações do Elemento</h4>
          <div class="artwork-btn-stack">
            <button type="button" class="btn btn-subtle btn-small" id="propBtnDuplicate">Duplicar Elemento</button>
            <button type="button" class="btn btn-danger btn-small" id="propBtnDelete">Excluir</button>
          </div>
        </div>
      `;

      this.$('#propObjOpacity')?.addEventListener('input', e => {
        obj.set('opacity', Number(e.target.value) / 100);
        this.canvas.fCanvas.requestRenderAll();
        this.setDirty();
        this.syncLivePreview();
      });
      this.$('#propObjFill')?.addEventListener('input', e => {
        obj.set('fill', e.target.value);
        this.canvas.fCanvas.requestRenderAll();
        this.setDirty();
        this.syncLivePreview();
      });
      this.$('#propBtnDuplicate')?.addEventListener('click', () => this.canvas.duplicateSelected());
      this.$('#propBtnDelete')?.addEventListener('click', () => this.canvas.deleteSelected());
    }

    renderLayers() {
      const container = this.$('#artLayersTab');
      if (!container) return;

      const layers = this.canvas.getLayers();
      if (!layers.length) {
        container.innerHTML = '<div class="empty-hint">Nenhuma camada adicional no projeto.</div>';
        return;
      }

      container.innerHTML = `
        <div class="artwork-layers-list">
          ${layers.map(layer => `
            <div class="artwork-layer-row ${layer.active ? 'active' : ''}" data-layer-id="${layer.id}">
              <div class="layer-info" data-layer-select="${layer.id}">
                <span class="layer-type-icon">${layer.type === 'text' ? 'T' : layer.type === 'image' ? '🖼' : '❖'}</span>
                <span class="layer-name-text">${esc(layer.name)}</span>
              </div>
              <div class="layer-actions">
                <button type="button" class="layer-btn" data-layer-vis="${layer.id}" title="${layer.visible ? 'Ocultar' : 'Exibir'}">
                  ${layer.visible ? '👁' : '🚫'}
                </button>
                <button type="button" class="layer-btn" data-layer-lock="${layer.id}" title="${layer.locked ? 'Desbloquear' : 'Bloquear'}">
                  ${layer.locked ? '🔒' : '🔓'}
                </button>
                <button type="button" class="layer-btn" data-layer-up="${layer.id}" title="Subir camada">▲</button>
                <button type="button" class="layer-btn" data-layer-down="${layer.id}" title="Descer camada">▼</button>
                <button type="button" class="layer-btn layer-del" data-layer-del="${layer.id}" title="Excluir">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      container.querySelectorAll('[data-layer-select]').forEach(el => {
        el.addEventListener('click', () => this.canvas.selectLayer(el.dataset.layerSelect));
      });
      container.querySelectorAll('[data-layer-vis]').forEach(btn => {
        btn.addEventListener('click', () => {
          const l = layers.find(x => x.id === btn.dataset.layerVis);
          if (l) this.canvas.setLayerVisibility(l.id, !l.visible);
        });
      });
      container.querySelectorAll('[data-layer-lock]').forEach(btn => {
        btn.addEventListener('click', () => {
          const l = layers.find(x => x.id === btn.dataset.layerLock);
          if (l) this.canvas.setLayerLock(l.id, !l.locked);
        });
      });
      container.querySelectorAll('[data-layer-up]').forEach(btn => {
        btn.addEventListener('click', () => this.canvas.reorderLayer(btn.dataset.layerUp, 1));
      });
      container.querySelectorAll('[data-layer-down]').forEach(btn => {
        btn.addEventListener('click', () => this.canvas.reorderLayer(btn.dataset.layerDown, -1));
      });
      container.querySelectorAll('[data-layer-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.canvas.selectLayer(btn.dataset.layerDel);
          this.canvas.deleteSelected();
        });
      });
    }

    /* ---------------- Live Nuvio Sync ---------------- */

    syncLivePreview(immediate = false) {
      clearTimeout(this.previewSyncTimer);
      const doSync = () => {
        if (!this.preview || !this.canvas) return;
        const dataUrl = this.canvas.exportToDataUrl('webp', 0.85);
        this.preview.update(dataUrl, {
          project: this.currentProject,
          group: this.currentGroup,
          folder: this.currentFolder,
          hideTitle: this.currentProject?.hideTitle
        });
      };
      if (immediate) {
        doSync();
      } else {
        this.previewSyncTimer = setTimeout(doSync, 120);
      }
    }

    /* ---------------- Variations Drawer ---------------- */

    toggleVariationsDrawer(show = null) {
      const drawer = this.$('#artworkVariationsDrawer');
      const isVisible = show !== null ? !show : drawer.hidden;
      drawer.hidden = !isVisible;
      if (isVisible) {
        this.renderVariations();
      }
    }

    renderVariations() {
      const strip = this.$('#artworkVariationsStrip');
      if (!strip || !this.currentProject) return;

      const vars = this.currentProject.variations || [];
      strip.innerHTML = vars.map((v, idx) => `
        <div class="variation-card ${v.id === this.currentProject.activeVariationId ? 'active' : ''}" data-variation-id="${v.id}">
          <div class="variation-thumb" style="aspect-ratio: 16/9;">
            ${v.thumbnail ? `<img src="${v.thumbnail}" alt="">` : '<span class="empty-var">Sem prévia</span>'}
          </div>
          <div class="variation-label">
            <span>${esc(v.name || `Versão ${idx + 1}`)}</span>
            ${vars.length > 1 ? `<button type="button" class="btn-var-del" data-del-var="${v.id}" title="Excluir variação">✕</button>` : ''}
          </div>
        </div>
      `).join('');

      strip.querySelectorAll('[data-variation-id]').forEach(card => {
        card.addEventListener('click', e => {
          if (e.target.closest('[data-del-var]')) return;
          this.switchVariation(card.dataset.variationId);
        });
      });

      strip.querySelectorAll('[data-del-var]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.deleteVariation(btn.dataset.delVar);
        });
      });
    }

    updateVariationsCount() {
      const count = this.currentProject?.variations?.length || 1;
      this.$('#artVariationsCount').textContent = count;
    }

    createNewVariation() {
      if (!this.currentProject) return;
      this.currentProject.variations = this.currentProject.variations || [];

      // Save current state into active variation first
      const currentDoc = this.canvas.toJSON();
      const currentThumb = this.canvas.exportToDataUrl('webp', 0.60);
      const activeVar = this.currentProject.variations.find(v => v.id === this.currentProject.activeVariationId);
      if (activeVar) {
        activeVar.canvasDoc = currentDoc;
        activeVar.thumbnail = currentThumb;
      }

      const nextIndex = this.currentProject.variations.length + 1;
      const newVar = {
        id: `var_${Date.now()}`,
        name: `Versão ${nextIndex}`,
        thumbnail: currentThumb,
        canvasDoc: structuredClone(currentDoc)
      };

      this.currentProject.variations.push(newVar);
      this.currentProject.activeVariationId = newVar.id;
      this.updateVariationsCount();
      this.renderVariations();
      this.setDirty();
    }

    async switchVariation(varId) {
      if (!this.currentProject || varId === this.currentProject.activeVariationId) return;

      // Save current
      const currentDoc = this.canvas.toJSON();
      const currentThumb = this.canvas.exportToDataUrl('webp', 0.60);
      const activeVar = this.currentProject.variations.find(v => v.id === this.currentProject.activeVariationId);
      if (activeVar) {
        activeVar.canvasDoc = currentDoc;
        activeVar.thumbnail = currentThumb;
      }

      const targetVar = this.currentProject.variations.find(v => v.id === varId);
      if (targetVar) {
        this.currentProject.activeVariationId = targetVar.id;
        if (targetVar.canvasDoc) {
          await this.canvas.loadFromJSON(targetVar.canvasDoc);
        }
        this.renderVariations();
        this.syncLivePreview();
      }
    }

    deleteVariation(varId) {
      if (!this.currentProject || this.currentProject.variations.length <= 1) return;
      this.currentProject.variations = this.currentProject.variations.filter(v => v.id !== varId);
      if (this.currentProject.activeVariationId === varId) {
        this.currentProject.activeVariationId = this.currentProject.variations[0].id;
        if (this.currentProject.variations[0].canvasDoc) {
          this.canvas.loadFromJSON(this.currentProject.variations[0].canvasDoc);
        }
      }
      this.updateVariationsCount();
      this.renderVariations();
      this.setDirty();
    }

    /* ---------------- Export Modal & Actions ---------------- */

    openExportModal() {
      const modal = this.$('#artworkExportDialog');
      const info = this.$('#artExportInfo');
      if (!modal) return;
      modal.hidden = false;
      const spec = globalThis.ArtworkStudioModel.getShapeSpec(this.currentProject?.shape);
      if (info) {
        info.textContent = `Dimensões: ${spec.width} × ${spec.height} px · Proporção: ${spec.ratio}`;
      }
    }

    closeExportModal() {
      this.$('#artworkExportDialog').hidden = true;
    }

    async downloadExported() {
      const format = this.$('#artExportFormat')?.value || 'webp';
      const quality = Number(this.$('#artExportQuality')?.value) || 90;
      const dataUrl = this.canvas.exportToDataUrl(format, quality / 100);

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${this.currentProject?.name || 'capa'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.closeExportModal();
    }

    async applyExported() {
      this.closeExportModal();
      await this.handleSaveAndApply();
    }

    /* ---------------- Save & Apply ---------------- */

    setDirty() {
      this.isDirty = true;
      this.saveStatus = 'dirty';
      const pill = this.$('#artSaveStatusPill');
      if (pill) {
        pill.textContent = 'Modificado';
        pill.className = 'artwork-save-status-pill is-dirty';
      }
    }

    setSaved() {
      this.isDirty = false;
      this.saveStatus = 'saved';
      const pill = this.$('#artSaveStatusPill');
      if (pill) {
        pill.textContent = '✓ Salvo';
        pill.className = 'artwork-save-status-pill is-saved';
      }
    }

    async handleSaveAndApply() {
      const btn = this.$('#artBtnSaveAndApply');
      btn.disabled = true;
      btn.textContent = 'Salvando e aplicando...';

      try {
        // 1. Export high-res raster image
        const format = 'webp';
        const dataUrl = this.canvas.exportToDataUrl(format, 0.90);
        const exportRes = await this.integrations.exportArtwork({
          dataUrl,
          shape: this.currentProject?.shape || 'LANDSCAPE',
          format,
          quality: 90,
          title: this.currentProject?.name || ''
        });

        // 2. Persist project document (JSON with canvas state and variations)
        if (this.currentProject) {
          this.currentProject.canvasDoc = this.canvas.toJSON();
          this.currentProject.thumbnail = exportRes.url;
          this.currentProject.updatedAt = new Date().toISOString();

          // Sync active variation
          const activeVar = this.currentProject.variations?.find(v => v.id === this.currentProject.activeVariationId);
          if (activeVar) {
            activeVar.canvasDoc = this.currentProject.canvasDoc;
            activeVar.thumbnail = exportRes.url;
          }

          await this.integrations.saveProject(this.currentProject);
        }

        this.setSaved();

        // 3. Apply to target folder or collection
        if (this.onSaveAndApply) {
          await this.onSaveAndApply({
            url: exportRes.url,
            shape: exportRes.shape,
            tileShape: exportRes.tileShape,
            hideTitle: Boolean(this.currentProject?.hideTitle)
          });
        }
      } catch (err) {
        alert(err.message || 'Falha ao salvar capa.');
      } finally {
        btn.disabled = false;
        btn.textContent = '✦ Salvar e Aplicar';
      }
    }

    /* ---------------- History (Undo / Redo) ---------------- */

    handleUndo() {
      // Basic undo implementation
    }

    handleRedo() {
      // Basic redo implementation
    }
  }

  globalThis.ArtworkStudioUI = ArtworkStudioUI;
})();
