# Stream Aggregator (AIOStreams Hub)

Agregador universal de manifests e streams para **Stremio**, **Nuvio** e outros players de mídia.

Combina múltiplos provedores de streaming (como **Torrentio**, **MediaFusion**, **Comet**, **KnightCrawler**, **Emby Bridge**, etc.) em um único addon leve e veloz com interface Web para configuração interativa.

---

## 🚀 Recursos

- **Interface Web Moderna (Dashboard Dark Mode)**:
  - Adicione e ordene qualquer addon colando o link do seu `manifest.json`.
  - Presets prontos com 1 clique (Torrentio, MediaFusion, Comet, KnightCrawler, Emby Bridge local).
  - Validação em tempo real do status de cada addon.
- **Pipeline Inteligente de Streams**:
  - **Consultas em Paralelo**: Busca simultânea em todos os addons com timeout individual configurável (sem travar se um estiver fora do ar).
  - **Desduplicação Inteligente**: Elimina duplicatas de um mesmo torrent (infoHash) ou URL vindos de múltiplos scrapers.
  - **Filtros de Qualidade**: Remova gravações de cinema (CAM, HDCAM, TeleSync, Screener) automaticamente.
  - **Filtro de Resolução**: Permita apenas 4K, 1080p, 720p ou 480p conforme sua preferência.
  - **Filtro Regex / Termos**: Exclua termos específicos (ex: `\b(ita|hindi)\b`).
  - **Controle de Carga e Badges**: Limite de streams por addon e identificação visual do provedor de origem (`[Torrentio]`, `[MediaFusion]`, etc.).
- **Compatibilidade**:
  - 100% aderente à especificação Stremio v2 Addon Protocol.
  - Funciona no Stremio Desktop, Android, iOS, Android TV e Web.

---

## 📦 Como Usar

### Opção 1: Via Docker Compose (Recomendado) 🐳

```bash
cd stream-aggregator
docker compose up -d
```

Para ver os logs ou parar:
```bash
docker compose logs -f
docker compose down
```

### Opção 2: Localmente com Node.js

```bash
cd stream-aggregator
npm install
npm start
```

O servidor estará rodando em: `http://localhost:7001` (ou na porta definida em `PORT`).

### 2. Configurar via Web UI

1. Abra no navegador: **`http://localhost:7001`** (ou use a URL do seu domínio/Tailscale Funnel).
2. Adicione os addons desejados usando os botões de preset ou colando as URLs dos manifests.
3. Ajuste a ordem de prioridade e seus filtros de qualidade.
4. Clique em **🎬 Instalar no Stremio** ou copie a URL gerada para colar na busca de Add-ons do Stremio.

---

## 🌐 Expor Publicamente com Tailscale Funnel (Opcional)

Se você já usa Tailscale Funnel (como no `emby-bridge`):

```bash
sudo tailscale funnel --bg --https=8444 http://localhost:7001
```

Depois basta acessar a URL pública dada pelo Funnel (ex: `https://seu-host.<tailnet>.ts.net:8444`) para configurar e instalar em qualquer dispositivo (TV, celular, etc.).

