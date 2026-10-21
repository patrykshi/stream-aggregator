# Diagnóstico Arquitetural e Eliminação de Redundâncias — Nuvio Hub

Este plano detalha o diagnóstico completo da base de código do **Nuvio Hub (Stream Aggregator)** e a estratégia cirúrgica para eliminar duplicações estruturais no backend (persistência atômica, rotas triplicadas Stremio/Nuvio, resolução de metadados e validação de URLs) e no frontend (blocos CSS duplicados/obsoletos, sistemas duplos de Drag-and-Drop e helpers repetidos de paginação e busca), preservando 100% de aprovação na suíte de testes e todas as garantias de segurança local (`requireLocalEdit` e permissões `0600`).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> As decisões abaixo refletem suas escolhas confirmadas na etapa de alinhamento e preservam integralmente os contratos públicos e testes automatizados existentes.

- **Decisão Confirmada 1 — Escopo de Execução**: Diagnosticar e refatorar as redundâncias tanto no backend quanto no frontend mantendo **100% dos testes passando** (`npm test`), sem remover endpoints legados exigidos pela suíte de regressão.
- **Decisão Confirmada 2 — Consolidação no Backend**:
  1. Unificar a leitura e gravação atômica de JSON com permissão `0600` (atualmente espalhada e reimplementada em 8 módulos distintos) em um utilitário centralizado de persistência segura.
  2. Consolidar os manipuladores triplicados de rotas Stremio v2 e Nuvio (`manifest.json`, `stream`, `subtitles`, `catalog`, `meta`, `collections.json`) nos três prefixos (`/`, `/p/:profileId`, `/:config`) e remover chamadas redundantes em `/api/catalog-bridge/collections.json` (onde `await publication()` é executado duas vezes na mesma requisição).
  3. Unificar a resolução de metadados locais (`localMetadata`) e higienização/validação HTTPS de URLs entre o servidor e os módulos de agregação.
- **Decisão Confirmada 3 — Otimização no Frontend**:
  1. Limpar blocos de CSS mortos ou sobrescritos (cartões legados `.addon-priority-card`, duplicações de variáveis `:root`, regras duplicadas de `.collection-sort-*` e a primeira versão obsoleta de `.nuvio-preview-*` que foi integralmente reescrita no final da folha de estilos).
  2. Unificar o sistema duplicado de Drag-and-Drop em `public/app.js` (onde Catálogos registram tanto Pointer Events quanto HTML5 Drag-and-Drop simultaneamente) e padronizar os manipuladores de reordenação.
  3. Extrair helpers reutilizáveis para paginação, filtragem textual e acesso normalizado a fontes de pastas (`catalogSources`), reduzindo código repetitivo nos modais e painéis.

---

## 1. Overview & Core Concept

- **What It Does**: O **Nuvio Hub** opera como um agregador universal Stremio v2 e estúdio de curadoria de catálogos e coleções para o Nuvio, combinando consultas paralelas a múltiplos addons, deduplicação de streams, adaptação de capas (WebP/ERDB) e simulação interativa de TV/Mobile.
- **Diagnóstico de Redundâncias Encontradas**:
  - **Camada de Persistência (Backend)**: Oito módulos implementam manualmente sua própria rotina de leitura `JSON.parse(fs.readFileSync(...))` e escrita atômica via arquivo temporário `.tmp` + `fs.renameSync` com `mode: 0o600`.
  - **Camada de Rotas Stremio/Nuvio (Backend)**: As rotas raiz (`/stream/...`), de perfil (`/p/:profileId/stream/...`) e parametrizadas (`/:config/stream/...`) repetem blocos idênticos de `try/catch`, cabeçalhos `Cache-Control`, resolução de parâmetros `extra` e decoração ERDB. Além disso, `localMetadata()` está duplicada no servidor e no módulo de publicação, e `publication()` é invocada duas vezes seguidas na rota de coleções da ponte.
  - **Folha de Estilos Dark Mode (Frontend)**: Ao longo da evolução do produto para o *Nuvio Studio v2*, novos blocos de estilo foram concatenados ao final da folha de estilos sem remover as versões anteriores. Isso resultou em redefinições completas de `:root`, `.collection-sort-*`, `.nuvio-preview-*` e centenas de linhas de classes órfãs (`.addon-priority-card`, `.addon-number`, `.addon-origin`, `.addon-health-metrics`) que não existem mais no DOM.
  - **Interatividade e Estado no Painel (Frontend)**: A aba de Catálogos mantém dois motores de arraste concorrentes para os mesmos cartões (Pointer Events na alça `.hub-catalog-drag` e HTML5 Drag-and-Drop no `<summary>`), além de quatro implementações quase idênticas de barra de busca paginada e normalização manual repetitiva de `f.catalogSources || f.sources || []`.
- **Key Value**: Redução expressiva de código morto e acoplamento, menor superfície para bugs de sincronização visual ou de cache, respostas mais rápidas nas rotas de coleções e manutenção simplificada sem alterar nenhuma funcionalidade visível ao usuário.

---

## 2. User Experience & Visual Design

- **Key User Flows Preservados**:
  - Navegação fluida entre as 7 áreas do espaço de trabalho (*Visão geral*, *Addons*, *Catálogos*, *Coleções*, *Monitoramento*, *Publicar no Nuvio* e *Configurações*).
  - Reordenação por arraste e teclado em Addons, Catálogos, Coleções, Pastas e Fontes com feedback imediato de posição e persistência segura.
  - Fluxo em 4 etapas no Criador Avançado de Catálogos (Fonte → Preferências → Prévia → Salvar) e Simulador Nuvio TV/Mobile em tempo real.
- **Visual Identity & Theme (Dark Mode Utilitário de Alta Densidade)**:
  - *Aesthetic Direction*: Console técnico escuro de alta precisão, com superfícies em camadas sutis e bordas de 1px (`--line: #29384b`).
  - *Color Palette & Mood*: Canvas dominante em ardósia profunda (`--bg: #090d15`), superfícies estruturais (`--surface: #121b29`, `--card: #172334`), texto principal de alto contraste (`--txt: #f1f6fc`, `--muted: #9cabbd`) e acentos semânticos precisos (`--accent: #9dd9fa` para foco/ações primárias, `--teal: #64d3ad` para status operacional ativo e `--danger: #fb9eac` para alertas e exclusões).
  - *Typography & Hierarchy*: `Manrope` (pesos 600–800) para títulos, contadores e cabeçalhos; `DM Sans` (400–700) para leitura densa em listas e formulários; e `font-variant-numeric: tabular-nums` / `ui-monospace` para latências, contadores de prioridade e chaves técnicas.
  - *Component Styling & Layout*: Layout fixo de barra lateral (`250px` no desktop, colapsada em telas menores) + barra superior com migalhas de pão e ação primária única (`Salvar alterações`) + área de trabalho responsiva de até `1660px`.
- **Interactive Feedback & Motion**: Transições rápidas de `140ms–170ms` apenas em propriedades de composição/cor, indicadores claros de rascunho não salvo (`Alterações não salvas`), estados de carregamento sem bloqueio e respeito estrito a `prefers-reduced-motion: reduce`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Utilitário Único de Persistência JSON Atômica (`0600`)**
  - *Chosen Approach*: Centralizar as operações `readJsonFile` e `writeAtomicJsonFile` (com criação de diretório, arquivo temporário por PID, `mode: 0o600`, `renameSync` e limpeza segura em bloco `finally`) e reutilizá-las nos módulos de configuração e agregação.
  - *Why*: Elimina 8 implementações ligeiramente divergentes (algumas sem `finally` para limpar arquivos `.tmp` órfãos ou sem `chmodSync` explícito), fortalecendo a invariante de segurança de dados em `data/`.
  - *Alternatives Considered*: Manter funções locais em cada arquivo (descartado por dificultar auditoria de permissões `0600` e gerar código repetido).
- **Decision 2 — Unificação de Handlers Stremio v2 e Nuvio por Helpers de Resolução**
  - *Chosen Approach*: Extrair funções coordenadoras para resolução do perfil/configuração efetiva e despacho unificado de `manifest`, `stream`, `subtitles`, `catalog`, `meta` e `collections`, mantendo exatamente as mesmas assinaturas de rota Express (`/`, `/p/:profileId`, `/:config`).
  - *Why*: Reduz mais de 150 linhas repetidas no servidor, garante cabeçalhos `Cache-Control` e tratamento de erros consistentes e elimina a dupla execução de `await publication()` na rota de coleções.
  - *Alternatives Considered*: Redirecionamento HTTP 302 entre rotas (descartado porque clientes Stremio e Nuvio nem sempre seguem redirecionamentos em rotas de manifesto/stream ou sofrem penalidade de latência).
- **Decision 3 — Consolidação de CSS e Drag-and-Drop no Frontend**
  - *Chosen Approach*: Mesclar as definições finais do design system *Nuvio Studio v2* diretamente nas regras base da folha de estilos, removendo seletores mortos (`.addon-priority-card` e derivados) e duplicatas do simulador Nuvio, além de remover o listener HTML5 Drag-and-Drop redundante de Catálogos (que já utiliza Pointer Events com suporte a mouse, toque e caneta).
  - *Why*: Reduz drasticamente o tamanho e a complexidade de `styles.css` e evita conflitos de eventos onde um arraste em Catálogos dispara tanto `pointerdown` quanto `dragstart`.
  - *Alternatives Considered*: Reescrever o Drag-and-Drop de Addons para Pointer Events também (mantido HTML5 DnD no `<summary>` de Addons pois testes existentes e a semântica de `<details>` dependem do atributo `draggable` no cabeçalho do addon).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vanilla JS + Dark CSS)                      │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │   Workspace Views   │  │  Shared UI Helpers   │  │ Specialized Modules │  │
│  │ (Overview, Addons,  │─▶│ • Paginated Search   │  │ • Collection Links  │  │
│  │  Catalogs, Studio,  │  │ • Source Normalizer  │  │ • Nuvio TV Preview  │  │
│  │  Monitor, Settings) │  │ • Unified DnD Engine │  │ • Custom UI Selects │  │
│  └─────────┬───────────┘  └──────────────────────┘  └──────────┬──────────┘  │
└────────────┼───────────────────────────────────────────────────┼─────────────┘
             │ REST API (requireLocalEdit on mutations)          │ Read-Only
             ▼                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express + ES Modules)                       │
│                                                                              │
│  ┌────────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │   Unified Stremio/Nuvio Routers    │  ┌────────────────────────────────┐  │
│  │ • /manifest, /stream, /subtitles   │  │   Local Management Endpoints   │  │
│  │ • /catalog, /meta, /collections    │  │ • /api/hub/* (Workspace/Lists) │  │
│  │ • Shared across /, /p/:id, /:token │  │ • /api/profiles/* & /monitor   │  │
│  └─────────────────┬──────────────────┘  └────────────────┬───────────────┘  │
│                    │                                      │                  │
│                    ▼                                      ▼                  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                     Aggregator & Publication Engine                    │  │
│  │  • Stream/Subtitle Engine & Filter   • Catalog Builder & List Import   │  │
│  │  • Nuvio Publication & Bridge        • Cover Adapter (WebP) & ERDB     │  │
│  └─────────────────────────────────┬──────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │              Shared Atomic JSON Storage Utility (mode 0600)            │  │
│  │                     (data/*.json & backup rotation)                    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **Utilitário de Persistência Atômica**: Função compartilhada para leitura segura com fallback e escrita atômica via arquivo temporário (`<file>.<pid>.tmp`) com permissão `0600`, utilizada pelos módulos de perfis, integrações, contas de origem, ERDB, importação do Studio, overlays e provedores de publicação.
- **Identidade e Fontes de Catálogo**: Função única para geração de identidade de catálogo (`[addonId, type, id]`) e leitura de `catalogSources` de pastas, evitando divergências entre o estado em memória do navegador e a validação no servidor.

### Interactive Component & State Mapping
- **Unified Route Dispatcher (Servidor)**: Mapeia requisições de `/`, `/p/:profileId` e `/:config` para handlers únicos de recursos (`serveManifest`, `serveStreams`, `serveSubtitles`, `serveCatalog`, `serveMeta`, `serveCollections`), distinguindo automaticamente o perfil principal (`main`, com suporte a publicação Nuvio, metadados locais e decoração de capas ERDB) de perfis secundários ou tokens codificados.
- **Paginated List & Search Helpers (Frontend)**: Centraliza o cálculo de páginas (`Math.max(1, Math.ceil(total / pageSize))`), fatia de itens e renderização dos controles `Anterior / Próxima` usados no Criador de Catálogos, no seletor em lote de Addons e no modal de substituição de vínculos de Coleções.
- **Drag-and-Drop Desambiguado (Frontend)**: Mantém Pointer Events dedicados para reordenação na aba de Catálogos e Coleções (removendo os handlers duplicados de `dragstart`/`dragover`/`drop` para `.hub-catalog-card`), enquanto preserva o arraste de `<summary draggable>` na aba de Addons sem interferência cruzada.
