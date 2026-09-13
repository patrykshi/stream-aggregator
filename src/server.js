import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { encodeConfig, decodeConfig, getDefaultConfig } from './config/codec.js';
import { aggregateStreams, normalizeAddonBaseUrl } from './aggregator/engine.js';
import { generateManifest } from './aggregator/manifest.js';
import { parseAddonUrl, DEFAULT_FETCH_HEADERS } from './aggregator/url-helper.js';
import { aggregateSubtitles } from './aggregator/subtitles.js';
import { fetchCatalog, fetchMeta } from './aggregator/catalogs.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7001;

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rota de Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Validador de Addons (usado pela UI)
app.post('/api/validate-addon', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ valid: false, error: 'URL inválida ou vazia.' });
  }

  const parsed = parseAddonUrl(url);
  if (!parsed) {
    return res.status(400).json({ valid: false, error: 'Formato de URL inválido.' });
  }

  const manifestUrl = parsed.manifestUrl;
  console.log(`[Validate Addon] Testando manifest: ${manifestUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos para scrapers lentos

  try {
    const response = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: DEFAULT_FETCH_HEADERS,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Validate Addon] Falha HTTP ${response.status} em ${manifestUrl}`);
      return res.status(200).json({
        valid: false,
        error: `O servidor retornou HTTP ${response.status}`
      });
    }

    const manifest = await response.json();
    if (!manifest || !manifest.id || !manifest.name) {
      console.warn(`[Validate Addon] JSON inválido recebido de ${manifestUrl}`);
      return res.status(200).json({
        valid: false,
        error: 'JSON retornado não é um manifest Stremio válido (faltando id ou name).'
      });
    }

    const resources = Array.isArray(manifest.resources)
      ? manifest.resources.map(r => typeof r === 'string' ? r : r.name)
      : [];

    const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];

    console.log(`[Validate Addon] Sucesso: "${manifest.name}" (recursos: ${resources.join(', ')})`);

    return res.json({
      valid: true,
      name: manifest.name,
      description: manifest.description || '',
      resources,
      hasStreamResource: resources.includes('stream'),
      hasSubtitlesResource: resources.includes('subtitles'),
      hasCatalogResource: catalogs.length > 0 || resources.includes('catalog'),
      catalogs,
      types: manifest.types || []
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[Validate Addon] Erro ao consultar ${manifestUrl}:`, err.message);
    return res.status(200).json({
      valid: false,
      error: err.name === 'AbortError'
        ? 'Tempo limite esgotado (15s). O servidor do addon demorou muito para responder.'
        : `Erro de conexão: ${err.message}`
    });
  }
});

// API Helper para codificar/decodificar
app.post('/api/encode-config', (req, res) => {
  const token = encodeConfig(req.body);
  res.json({ token });
});

app.get('/api/decode-config/:token', (req, res) => {
  const config = decodeConfig(req.params.token);
  res.json({ config });
});

// Stremio: Manifest sem configuração
app.get('/manifest.json', (req, res) => {
  const def = getDefaultConfig();
  res.json(generateManifest(def));
});

// Stremio: Manifest configurado
app.get('/:config/manifest.json', (req, res) => {
  const config = decodeConfig(req.params.config);
  res.json(generateManifest(config));
});

// Stremio: Stream endpoint
app.get('/:config/stream/:type/:id.json', async (req, res) => {
  const { config: rawConfig, type, id } = req.params;
  const config = decodeConfig(rawConfig);

  try {
    const result = await aggregateStreams(config, type, id);
    res.setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=120');
    res.json(result);
  } catch (err) {
    console.error('Erro ao agregar streams:', err);
    res.status(500).json({ streams: [], error: err.message });
  }
});

// Stremio: Subtitles endpoint
app.get(['/:config/subtitles/:type/:id.json', '/:config/subtitles/:type/:id/:extra.json'], async (req, res) => {
  const { config: rawConfig, type, id, extra } = req.params;
  const config = decodeConfig(rawConfig);

  try {
    const result = await aggregateSubtitles(config, type, id, extra || '');
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error('Erro ao agregar legendas:', err);
    res.status(500).json({ subtitles: [], error: err.message });
  }
});

// Stremio: Catalog endpoint
app.get(['/:config/catalog/:type/:id.json', '/:config/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { config: rawConfig, type, id, extra } = req.params;
  const config = decodeConfig(rawConfig);

  try {
    const result = await fetchCatalog(config, type, id, extra || '');
    res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error('Erro ao consultar catálogo:', err);
    res.status(500).json({ metas: [], error: err.message });
  }
});

// Stremio: Meta endpoint
app.get('/:config/meta/:type/:id.json', async (req, res) => {
  const { config: rawConfig, type, id } = req.params;
  const config = decodeConfig(rawConfig);

  try {
    const result = await fetchMeta(config, type, id);
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=7200');
    res.json(result);
  } catch (err) {
    console.error('Erro ao consultar metadados:', err);
    res.status(500).json({ meta: null, error: err.message });
  }
});

// Nuvio Collections Endpoint (Permite importar/exportar a estrutura de coleções no Nuvio)
app.get('/:config/collections.json', (req, res) => {
  const { config: rawConfig } = req.params;
  const config = decodeConfig(rawConfig);
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  res.json(config.nuvioCollections || []);
});

// Página de configuração
app.get('/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback para SPA
app.get('*', (req, res, next) => {
  if (req.path.endsWith('.json')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Stream Aggregator rodando em http://localhost:${PORT}`);
});

