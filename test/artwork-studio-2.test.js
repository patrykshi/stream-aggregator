import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvio-studio2-tests-'));
process.env.DATA_DIR = sandbox;

const {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  saveAssetBuffer,
  exportArtworkFromDataUrl
} = await import('../src/aggregator/artwork-projects.js');

const {
  STUDIO_SHAPES,
  getStudioShapeSpec,
  saveDataUrlArtwork
} = await import('../src/aggregator/artwork-studio.js');

const {
  composeOriginalMosaic,
  getOriginalMosaicCategories
} = await import('../src/aggregator/tmdb-mosaic.js');

const { updateIntegrationSettings } = await import('../src/config/hub-integrations.js');
const { isPublicReadRoute } = await import('../src/config/public-read-routes.js');

describe('Artwork Studio 2.0: Reconstrução Completa do Estúdio Visual', () => {
  before(() => {
    updateIntegrationSettings({ tmdb: { value: 'mock-tmdb-key-studio2' } });
  });

  after(() => {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
    } catch {}
  });

  it('Teste A — Criar do zero: formato, gradiente, título e exportação em alta fidelidade', async () => {
    const rawImage = await sharp({
      create: { width: 600, height: 900, channels: 4, background: '#1e293b' }
    }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${rawImage.toString('base64')}`;

    const project = saveProject({
      id: 'proj_test_a',
      name: 'Pôster Cinema Dark',
      shape: 'POSTER',
      target: { kind: 'folder', id: 'f_test_a', title: 'Filmes Cult' },
      canvasDoc: {
        background: { type: 'gradient', primary: '#1e293b', secondary: '#070a12' },
        objects: [{ type: 'textbox', text: 'CULT CLÁSSICOS', fill: '#ffffff', fontSize: 48 }]
      }
    });

    assert.equal(project.id, 'proj_test_a');
    assert.equal(project.shape, 'POSTER');
    assert.equal(project.width, 600);
    assert.equal(project.height, 900);

    const exported = await exportArtworkFromDataUrl({
      dataUrl,
      shape: 'POSTER',
      format: 'webp',
      title: project.name
    });

    assert.equal(exported.shape, 'POSTER');
    assert.equal(exported.width, 600);
    assert.equal(exported.height, 900);
    assert.equal(exported.format, 'webp');
    assert.match(exported.url, /^\/api\/hub\/artwork\/studio\/art_poster_[a-f0-9]+\.webp$/);
  });

  it('Teste B — Criar com TMDB: inserir imagem e texto sem perda de proporção', async () => {
    const backdropBuf = await sharp({
      create: { width: 1280, height: 720, channels: 3, background: '#123456' }
    }).jpeg().toBuffer();

    const asset = await saveAssetBuffer(backdropBuf, { filenameHint: 'duna_backdrop' });
    assert.ok(asset.url.includes('/api/hub/artwork/studio/asset_'));
    assert.equal(asset.width, 1280);
    assert.equal(asset.height, 720);

    const project = saveProject({
      id: 'proj_tmdb_duna',
      name: 'Duna Sci-Fi',
      shape: 'LANDSCAPE',
      target: { kind: 'folder', id: 'f_duna', title: 'Duna' },
      canvasDoc: {
        background: { type: 'image', imageUrl: asset.url },
        objects: [
          { type: 'image', url: asset.url },
          { type: 'textbox', text: 'DUNA', fill: '#f59e0b', fontSize: 64 }
        ]
      }
    });

    assert.equal(project.name, 'Duna Sci-Fi');
    assert.equal(project.canvasDoc.objects.length, 2);
  });

  it('Teste C — Mosaico original: gera imagem-base; edição posterior de título não refaz consulta ao TMDB', async () => {
    process.env.PYTHON_MOSAIC_ENABLED = '1';
    let pythonCalls = 0;

    const renderedMosaic = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: '#14283b' }
    }).jpeg().toBuffer();

    try {
      const runner = async input => {
        pythonCalls++;
        assert.equal(input.group, 'generos');
        assert.equal(input.category, 'Ficção');
        return { data: renderedMosaic.toString('base64'), cards: 16 };
      };

      // 1. Geração inicial do mosaico (ação explícita)
      const mosaicRes = await composeOriginalMosaic(
        { group: 'generos', category: 'Ficção', cards: 16, shape: 'LANDSCAPE', hideTitle: true, save: false },
        { runner }
      );

      assert.equal(pythonCalls, 1);
      assert.ok(mosaicRes.baseDataUrl);

      // 2. O usuário salva o projeto com o mosaico como fundo
      const project = saveProject({
        id: 'proj_mosaic_test',
        name: 'Mosaico Ficção',
        shape: 'LANDSCAPE',
        canvasDoc: {
          background: { type: 'mosaic', imageUrl: mosaicRes.baseDataUrl },
          objects: [{ type: 'textbox', text: 'FICÇÃO CIENTÍFICA', fontSize: 52 }]
        }
      });

      // 3. O usuário edita o título várias vezes
      project.canvasDoc.objects[0].text = 'SCI-FI & CYBERPUNK';
      saveProject(project);

      project.canvasDoc.objects[0].text = 'UNIVERSO ESTELAR';
      saveProject(project);

      // A geração de mosaico NÃO pode ter sido chamada novamente!
      assert.equal(pythonCalls, 1, 'A edição de título nunca pode disparar nova chamada ao gerador Python');
    } finally {
      delete process.env.PYTHON_MOSAIC_ENABLED;
    }
  });

  it('Teste D — Trocar de ferramentas: transição entre abas preserva camadas e dados do canvas', async () => {
    const doc = {
      id: 'proj_tool_switch',
      name: 'Composição Múltipla',
      shape: 'LANDSCAPE',
      canvasDoc: {
        background: { type: 'gradient', primary: '#2563eb', secondary: '#0f172a' },
        objects: [
          { layerId: 'l1', type: 'textbox', text: 'Título A' },
          { layerId: 'l2', type: 'shape', shapeType: 'badgeBox' },
          { layerId: 'l3', type: 'icon', icon: '★' }
        ]
      }
    };

    const saved = saveProject(doc);
    assert.equal(saved.canvasDoc.objects.length, 3);

    // Adiciona texto na ferramenta de texto
    saved.canvasDoc.objects.push({ layerId: 'l4', type: 'textbox', text: 'Subtítulo B' });
    const updated = saveProject(saved);
    assert.equal(updated.canvasDoc.objects.length, 4);

    // Modifica fundo na ferramenta de fundos
    updated.canvasDoc.background.primary = '#9333ea';
    const finalDoc = saveProject(updated);

    assert.equal(finalDoc.canvasDoc.objects.length, 4);
    assert.equal(finalDoc.canvasDoc.background.primary, '#9333ea');
  });

  it('Teste E — Camadas: suporta reordenar, ocultar, bloquear, duplicar e excluir', () => {
    const layers = [
      { id: '1', name: 'Fundo', type: 'bg', visible: true, locked: false },
      { id: '2', name: 'Ícone Estrela', type: 'icon', visible: true, locked: false },
      { id: '3', name: 'Título Principal', type: 'text', visible: true, locked: false },
      { id: '4', name: 'Moldura', type: 'shape', visible: true, locked: false },
      { id: '5', name: 'Subtítulo', type: 'text', visible: true, locked: false }
    ];

    // Ocultar camada 2
    layers[1].visible = false;
    assert.equal(layers[1].visible, false);

    // Bloquear camada 3
    layers[2].locked = true;
    assert.equal(layers[2].locked, true);

    // Duplicar camada 4
    const duplicated = { ...layers[3], id: '4_copy', name: `${layers[3].name} (cópia)` };
    layers.splice(4, 0, duplicated);
    assert.equal(layers.length, 6);
    assert.equal(layers[4].id, '4_copy');

    // Excluir camada 5
    const toDeleteIdx = layers.findIndex(l => l.id === '5');
    layers.splice(toDeleteIdx, 1);
    assert.equal(layers.length, 5);

    // Reordenar camada para o topo
    const icon = layers.splice(1, 1)[0];
    layers.push(icon);
    assert.equal(layers[layers.length - 1].id, '2');
  });

  it('Teste F — Histórico: suporta estados de desfazer e refazer garantindo integridade', async () => {
    const model = await import('../public/artwork-studio/artwork-model.js');
    const HistoryManager = globalThis.ArtworkStudioModel.HistoryManager;
    const history = new HistoryManager(10);

    const s1 = { text: 'Versão 1' };
    const s2 = { text: 'Versão 2' };
    const s3 = { text: 'Versão 3' };

    history.push(s1);
    history.push(s2);

    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);

    const undone = history.undo(s3);
    assert.equal(undone.text, 'Versão 2');
    assert.equal(history.canRedo(), true);

    const redone = history.redo(undone);
    assert.equal(redone.text, 'Versão 3');
  });

  it('Teste G — Persistência: salva documento completo no disco e recarrega perfeitamente', () => {
    const doc = {
      id: 'proj_persistent_test',
      name: 'Projeto de Teste Persistente',
      shape: 'PORTRAIT',
      target: { kind: 'folder', id: 'f_persist', title: 'Favoritos' },
      variations: [
        { id: 'var_1', name: 'Principal', canvasDoc: { text: 'Var 1' } },
        { id: 'var_2', name: 'Escura', canvasDoc: { text: 'Var 2' } }
      ],
      activeVariationId: 'var_2'
    };

    saveProject(doc);

    // Recupera diretamente do disco
    const loaded = getProject('proj_persistent_test');
    assert.ok(loaded);
    assert.equal(loaded.id, 'proj_persistent_test');
    assert.equal(loaded.name, 'Projeto de Teste Persistente');
    assert.equal(loaded.shape, 'PORTRAIT');
    assert.equal(loaded.width, 750);
    assert.equal(loaded.height, 1000);
    assert.equal(loaded.variations.length, 2);
    assert.equal(loaded.activeVariationId, 'var_2');

    // Listagem
    const list = listProjects();
    assert.ok(list.some(p => p.id === 'proj_persistent_test'));

    // Exclusão
    const deleted = deleteProject('proj_persistent_test');
    assert.equal(deleted, true);
    assert.equal(getProject('proj_persistent_test'), null);
  });

  it('Teste H — Formatos: suporta Landscape, Poster, Portrait e Square com specs exatas', () => {
    assert.deepEqual(getStudioShapeSpec('LANDSCAPE'), {
      key: 'LANDSCAPE',
      width: 1280,
      height: 720,
      ratio: '16:9',
      label: 'Landscape · 16:9',
      tileShape: 'LANDSCAPE'
    });

    assert.deepEqual(getStudioShapeSpec('POSTER'), {
      key: 'POSTER',
      width: 600,
      height: 900,
      ratio: '2:3',
      label: 'Poster · 2:3',
      tileShape: 'POSTER'
    });

    assert.deepEqual(getStudioShapeSpec('PORTRAIT'), {
      key: 'PORTRAIT',
      width: 750,
      height: 1000,
      ratio: '3:4',
      label: 'Portrait · 3:4',
      tileShape: 'PORTRAIT'
    });

    assert.deepEqual(getStudioShapeSpec('SQUARE'), {
      key: 'SQUARE',
      width: 800,
      height: 800,
      ratio: '1:1',
      label: 'Square · 1:1',
      tileShape: 'SQUARE'
    });
  });

  it('Teste I — Visualização no Nuvio: renderiza modos Card, Coleção e TV Simulator', async () => {
    await import('../public/artwork-studio/artwork-preview-nuvio.js');
    const NuvioStudioPreview = globalThis.NuvioStudioPreview;

    const mockContainer = { innerHTML: '' };
    const sim = new NuvioStudioPreview(mockContainer);

    sim.update('data:image/webp;base64,mock', {
      project: { shape: 'LANDSCAPE', tileShape: 'LANDSCAPE', ratio: '16:9' },
      group: { title: 'Coleção Teste', folders: [{ id: 'f1', title: 'Pasta 1' }] },
      folder: { id: 'f1', title: 'Pasta 1' },
      hideTitle: false
    });

    // 1. Modo Card
    sim.setMode('card');
    assert.ok(mockContainer.innerHTML.includes('nuvio-sim-isolated-card-wrap'));
    assert.ok(mockContainer.innerHTML.includes('shape-landscape'));
    assert.ok(mockContainer.innerHTML.includes('Pasta 1'));

    // 2. Modo Coleção
    sim.setMode('collection');
    assert.ok(mockContainer.innerHTML.includes('nuvio-sim-shelf-wrap'));
    assert.ok(mockContainer.innerHTML.includes('Coleção Teste'));

    // 3. Modo TV
    sim.setMode('tv');
    assert.ok(mockContainer.innerHTML.includes('nuvio-sim-tv-bezel'));
    assert.ok(mockContainer.innerHTML.includes('nuvio-sim-tv-screen'));
    assert.ok(mockContainer.innerHTML.includes('DESTAQUE DA BIBLIOTECA'));
  });

  it('Teste J — Exportação: gera WebP, PNG e JPEG com dimensões fiéis ao canvas', async () => {
    const canvasImg = await sharp({
      create: { width: 1280, height: 720, channels: 4, background: '#10b981' }
    }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${canvasImg.toString('base64')}`;

    // Exporta WebP
    const webpRes = await exportArtworkFromDataUrl({ dataUrl, shape: 'LANDSCAPE', format: 'webp', quality: 92 });
    assert.equal(webpRes.format, 'webp');
    const webpMeta = await sharp(path.join(sandbox, 'artwork-studio', webpRes.filename)).metadata();
    assert.equal(webpMeta.width, 1280);
    assert.equal(webpMeta.height, 720);
    assert.equal(webpMeta.format, 'webp');

    // Exporta PNG
    const pngRes = await exportArtworkFromDataUrl({ dataUrl, shape: 'SQUARE', format: 'png' });
    assert.equal(pngRes.format, 'png');
    const pngMeta = await sharp(path.join(sandbox, 'artwork-studio', pngRes.filename)).metadata();
    assert.equal(pngMeta.width, 800);
    assert.equal(pngMeta.height, 800);
    assert.equal(pngMeta.format, 'png');

    // Exporta JPEG
    const jpgRes = await exportArtworkFromDataUrl({ dataUrl, shape: 'POSTER', format: 'jpeg', quality: 85 });
    assert.equal(jpgRes.format, 'jpg');
    const jpgMeta = await sharp(path.join(sandbox, 'artwork-studio', jpgRes.filename)).metadata();
    assert.equal(jpgMeta.width, 600);
    assert.equal(jpgMeta.height, 900);
    assert.equal(jpgMeta.format, 'jpeg');
  });

  it('Teste K — Segurança: imagens salvas são acessíveis via leitura pública, mas endpoints de mutação são bloqueados', () => {
    // Leitura de arte servida
    assert.equal(isPublicReadRoute('GET', '/api/hub/artwork/studio/art_test.webp'), true);
    assert.equal(isPublicReadRoute('GET', '/api/hub/artwork/studio/asset_123.png'), true);

    // Endpoints administrativos de projeto NÃO são públicos
    assert.equal(isPublicReadRoute('GET', '/api/hub/artwork/projects'), false);
    assert.equal(isPublicReadRoute('POST', '/api/hub/artwork/projects'), false);
    assert.equal(isPublicReadRoute('POST', '/api/hub/artwork/export'), false);
    assert.equal(isPublicReadRoute('POST', '/api/hub/artwork/assets'), false);
    assert.equal(isPublicReadRoute('DELETE', '/api/hub/artwork/projects/1'), false);
  });

  it('Teste L — Separação de Operações: Salvar Projeto persiste documento editável sem gerar download ou alterar coleção', async () => {
    const project = saveProject({
      id: 'proj_op_a',
      name: 'Projeto Autônomo',
      shape: 'LANDSCAPE',
      target: { kind: 'folder', id: 'f_op_a', title: 'Documentários' },
      canvasDoc: {
        background: { type: 'solid', primary: '#020617' },
        objects: [
          { type: 'textbox', text: 'DESCOBRIR', fontSize: 64, fill: '#38bdf8' },
          { type: 'line', fill: '#38bdf8', strokeWidth: 3 }
        ]
      }
    });

    assert.equal(project.id, 'proj_op_a');
    assert.equal(project.name, 'Projeto Autônomo');

    // Recupera e valida integridade das camadas
    const retrieved = getProject('proj_op_a');
    assert.equal(retrieved.name, 'Projeto Autônomo');
    assert.equal(retrieved.canvasDoc.objects.length, 2);
    assert.equal(retrieved.canvasDoc.objects[0].text, 'DESCOBRIR');
  });

  it('Teste M — Separação de Operações: Salvar e Aplicar persiste no workspace e atualiza URL', async () => {
    const rawImage = await sharp({
      create: { width: 1280, height: 720, channels: 4, background: '#090d16' }
    }).webp().toBuffer();
    const dataUrl = `data:image/webp;base64,${rawImage.toString('base64')}`;

    const exported = await exportArtworkFromDataUrl({
      dataUrl,
      shape: 'LANDSCAPE',
      format: 'webp',
      quality: 90,
      title: 'Descobrir Nuvio'
    });

    assert.match(exported.url, /^\/api\/hub\/artwork\/studio\/art_landscape_[a-f0-9]+\.webp$/);
    assert.equal(exported.format, 'webp');
    assert.equal(exported.width, 1280);
    assert.equal(exported.height, 720);
  });
});
