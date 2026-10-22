/* Nuvio Hub — Artwork Studio 2.0 Main Entrypoint & Coordinator
 * Cria o workspace de tela cheia e orquestra Canvas, UI, Prévia Nuvio e Integrações. */
(() => {
  'use strict';

  let uiInstance = null;
  let canvasInstance = null;
  let previewInstance = null;
  let workspaceContainer = null;

  function ensureWorkspaceDOM() {
    if (!workspaceContainer) {
      workspaceContainer = document.getElementById('artworkStudioWorkspace');
      if (!workspaceContainer) {
        workspaceContainer = document.createElement('div');
        workspaceContainer.id = 'artworkStudioWorkspace';
        workspaceContainer.className = 'artwork-studio-workspace';
        workspaceContainer.hidden = true;
        document.body.appendChild(workspaceContainer);
      }
    }
    return workspaceContainer;
  }

  async function open({ state, targetKind = 'folder', targetObj = null, onApply = null } = {}) {
    const container = ensureWorkspaceDOM();
    container.hidden = false;
    document.body.classList.add('artwork-studio-active');

    // Resolve target collection and folder
    const collections = state?.workspace?.collections || [];
    let group = null;
    let folder = null;

    if (targetKind === 'group') {
      group = targetObj || collections[0] || null;
    } else {
      // Find folder and containing group
      if (targetObj) {
        folder = targetObj;
        group = collections.find(g => (g.folders || []).some(f => f.id === folder.id)) || collections[0] || null;
      } else {
        group = collections[0] || null;
        folder = group?.folders?.[0] || null;
      }
    }

    const title = folder?.title || group?.title || 'Minha Coleção';
    const initialShape = targetKind === 'group'
      ? (group?.artworkShape || group?.tileShape || 'LANDSCAPE')
      : (folder?.tileShape || group?.tileShape || 'LANDSCAPE');

    // Initialize Canvas & UI once
    if (!uiInstance) {
      uiInstance = new globalThis.ArtworkStudioUI({
        container,
        canvasController: null, // set below
        integrations: globalThis.ArtworkStudioIntegrations,
        previewSimulator: null, // set below
        onSaveAndApply: async result => {
          if (onApply) {
            await onApply(result);
          }
          close();
        },
        onClose: () => close()
      });

      // Now canvas element exists in DOM
      const canvasEl = document.getElementById('artworkFabricCanvas');
      canvasInstance = new globalThis.ArtworkCanvas(canvasEl, {
        width: 1280,
        height: 720
      });
      uiInstance.setCanvasController(canvasInstance);

      // Mount simulator into view
      const simStage = document.getElementById('artworkNuvioSimStage');
      previewInstance = new globalThis.NuvioStudioPreview(simStage);
      uiInstance.setPreviewSimulator(previewInstance);
    }

    // Check if an existing project exists on disk for this target
    let project = null;
    try {
      const targetId = targetObj?.id || (targetKind === 'group' ? group?.id : folder?.id) || '';
      const projectsRes = await globalThis.ArtworkStudioIntegrations.listProjects();
      const existing = (projectsRes.projects || []).find(p => p.target?.id === targetId && p.target?.kind === targetKind);
      if (existing) {
        const fullRes = await globalThis.ArtworkStudioIntegrations.getProject(existing.id);
        project = fullRes.project || null;
      }
    } catch {}

    if (!project) {
      project = globalThis.ArtworkStudioModel.createNewProjectDocument({
        targetKind,
        targetId: targetObj?.id || '',
        title,
        shape: initialShape
      });
    }

    // Load into UI
    await uiInstance.loadProject(project, { group, folder });
  }

  function close() {
    if (workspaceContainer) {
      workspaceContainer.hidden = true;
    }
    document.body.classList.remove('artwork-studio-active');
  }

  function isOpen() {
    return workspaceContainer ? !workspaceContainer.hidden : false;
  }

  globalThis.ArtworkStudio2 = Object.freeze({
    open,
    close,
    isOpen
  });
})();
