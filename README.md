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

---

## 🌐 Distribuição Pública com Cloudflare Tunnel ☁️

O projeto já está integrado com **Cloudflare Tunnel** no `docker-compose.yml` e com rota CNAME apontada para:

👉 **[https://stream.patrykrocha.com](https://stream.patrykrocha.com)**

### Como funciona:
- O container `stream-aggregator-tunnel` (`cloudflare/cloudflared:latest`) conecta diretamente na borda da Cloudflare.
- Fornece HTTPS válido automático sem abrir portas no roteador nem expor o IP da sua máquina.
- As URLs geradas no painel já usam `https://stream.patrykrocha.com/:token/manifest.json` e `stremio://stream.patrykrocha.com/:token/manifest.json`.

---

## 📲 Como Instalar no Stremio e Nuvio

1. Abra **[https://stream.patrykrocha.com](https://stream.patrykrocha.com)** no seu navegador.
2. Adicione os seus addons favoritos (Torrentio, MediaFusion, Comet, Best Cine, Emby, etc.) e defina suas regras.
3. **No Stremio**:
   - Clique no botão **🎬 Instalar no Stremio** (abre o app diretamente).
   - Ou copie a URL do manifest e cole no campo de pesquisa da aba **Add-ons** do Stremio.
4. **No Nuvio**:
   - Vá em **Configurações → Plugins/Addons** e cole a URL `https://stream.patrykrocha.com/:token/manifest.json`.

