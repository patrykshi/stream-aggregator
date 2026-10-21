# AGENTS.md — Regras de Desenvolvimento e Equipe de Agentes (Stream Aggregator)

Este documento define as diretrizes operacionais, os papéis da equipe de agentes de inteligência artificial e as regras não-negociáveis para desenvolvimento, manutenção, testes e revisão do **Stream Aggregator (AIOStreams Hub)**.

---

## 1. Contexto e Arquitetura do Projeto

* **Propósito:** Agregador universal e proxy de manifests e streams para **Stremio** (especificação v2 Addon Protocol) e **Nuvio**, realizando consultas paralelas com timeout individual, desduplicação por `infoHash`/URL, filtros de resolução/CAM e catálogos customizados.
* **Backend:** Node.js em modo nativo ES Modules (`"type": "module"`), Express 4.21, sem transpilador ou bundler.
* **Frontend:** Vanilla JavaScript puro (`public/app.js`, `public/ui-selects.js`, `public/collection-links.js`, `public/nuvio-preview.js`), Dark Mode CSS (`public/styles.css`) e HTML5 sem frameworks pesados.
* **Dados & Cache:** Pasta `data/` com perfis (`profiles.json`), cache de catálogos e integrações externas (TMDB, Trakt, MDBList, ERDB).
* **Infraestrutura:** Docker Compose com porta vinculada ao loopback `127.0.0.1:7001` e Cloudflare Tunnel (`cloudflared`) servindo `stream.patrykrocha.com` em modo somente-leitura.

---

## 2. Invariantes Não-Negociáveis (Regras de Ouro)

> [!IMPORTANT]
> Qualquer agente atuando neste projeto **DEVE** respeitar rigorosamente os seguintes invariantes:

1. **Zero Regressão de Testes:**
   * A suíte nativa `npm test` (`node --test test/*.test.js`) deve sempre passar com 100% de sucesso (baseline de 168+ testes).
   * Nenhuma alteração pode ser considerada concluída se algum teste falhar.
2. **Segurança de Mutação e Isolamento Local (`requireLocalEdit`):**
   * Todas as rotas que gravam ou alteram configurações (`POST`, `PUT`, `DELETE`) **DEVEM** utilizar o middleware `requireLocalEdit`.
   * Requisições públicas vindas pelo Cloudflare Tunnel (identificadas pelo cabeçalho `cf-connecting-ip`) ou de hosts que não sejam loopback (`127.0.0.1`, `localhost`, `[::1]`) têm acesso restrito estritamente à reprodução e leitura.
3. **Privacidade de Credenciais e Tokens:**
   * Jamais exibir chaves de API, tokens OAuth ou sessões (TMDB, Trakt, MDBList, ERDB) em manifests, URLs públicas de stream, respostas de log ou retornos de APIs abertas.
   * Arquivos com dados confidenciais em `data/` devem ser gravados sob modo de permissão `0600` e constar no `.gitignore`.
4. **Arquitetura Leve (Zero Bundler Bloat):**
   * Não introduza frameworks pesados de frontend (React, Vue, Webpack, Vite). O frontend deve permanecer Vanilla JS modular e servido estaticamente.
   * Não adicione novas dependências npm no `package.json` sem justificativa arquitetural e checagem de compatibilidade com ES Modules.
5. **Conformidade Estrita com Stremio Protocol v2:**
   * As rotas `/manifest.json`, `/catalog/:type/:id...`, `/meta/:type/:id` e `/stream/:type/:id` devem respeitar estritamente o formato de resposta JSON esperado pelo Stremio e Nuvio.

---

## 3. Equipe de Agentes Especializados

Para manter a separação de responsabilidades e qualidade de código, os agentes assumem os seguintes papéis:

### 🏛️ `stream-architect` (Arquiteto de Sistemas)
* **Escopo:** Decisões estruturais, integridade dos limites entre módulos (`src/aggregator/` vs `src/config/` vs `src/server.js`), especificação de rotas e conformidade com o protocolo Stremio v2.
* **Quando Acionar:** Criação de novos subsistemas, integração com novos serviços de metadados, mudanças no formato de armazenamento ou alterações no manifesto.

### 🎨 `stream-frontend` (Engenheiro Frontend)
* **Escopo:** Interface do painel web (`public/`), manipulação eficiente do DOM em Vanilla JS, Dark Mode CSS, drag-and-drop de catálogos e pré-visualização interativa (Nuvio Preview).
* **Quando Acionar:** Ajustes visuais, novos seletores de configurações no painel, melhorias de responsividade e interatividade.

### ⚙️ `stream-backend` (Engenheiro Backend)
* **Escopo:** Rotas Express, agregação concorrente de streams com timeouts (`src/aggregator/engine.js`), desduplicação (`filter.js`), codec de URLs codificadas (`codec.js`) e integrações de API.
* **Quando Acionar:** Implementação de endpoints, refinamento de consultas paralelas, melhorias de cache e tratamento de streams.

### 🧪 `stream-tester` (Engenheiro de Testes)
* **Escopo:** Bateria de testes nativa com `node:test` e `node:assert`, garantia do ciclo TDD (Red-Green-Refactor) e proteção contra regressões.
* **Quando Acionar:** Criação de testes para novos recursos, refatorações de código e validação de casos de borda sem requisições HTTP externas reais (mocks isolados).

### 🛡️ `stream-security` (Auditor de Segurança)
* **Escopo:** Fiscalização de segurança da aplicação, validação do isolamento do `requireLocalEdit`, prevenção de SSRF e conferência de permissões e mascaramento de tokens em `data/*.json`.
* **Quando Acionar:** Antes de mesclar novos endpoints de API, ao modificar configurações de rede/Docker ou manipular credenciais de provedores.

### 🔍 `stream-debugger` (Especialista em Depuração)
* **Escopo:** Diagnóstico de causa-raiz (RCA) para addons lentos ou instáveis, análise de timeouts de scrapers, problemas no monitoramento de provedores e inspeção de logs.
* **Quando Acionar:** Quando houver falhas intermitentes de reprodução, descompasso no cache ou erros em tempo de execução.

---

## 4. Skills Disponíveis (`.agents/skills/`)

As habilidades operacionais foram estruturadas com base no padrão `addyosmani/agent-skills`:

| Skill | Localização | Gatilho / Propósito |
| :--- | :--- | :--- |
| **`spec-driven-development`** | `.agents/skills/spec-driven-development/SKILL.md` | Planejamento formal e definição de especificações antes da implementação. |
| **`test-driven-development`** | `.agents/skills/test-driven-development/SKILL.md` | Ciclo TDD estrito com o test runner nativo `node:test`. |
| **`api-and-interface-design`** | `.agents/skills/api-and-interface-design/SKILL.md` | Contratos de rotas Stremio v2 e endpoints REST locais. |
| **`frontend-ui-engineering`** | `.agents/skills/frontend-ui-engineering/SKILL.md` | Engenharia Vanilla JS, layout Dark Mode e componentes reativos sem build. |
| **`debugging-and-error-recovery`**| `.agents/skills/debugging-and-error-recovery/SKILL.md`| Isolamento sistemático de falhas em scrapers e cache. |
| **`security-hardening`** | `.agents/skills/security-hardening/SKILL.md` | Auditoria de segurança, permissões `0600` e bloqueio de IPs remotos na edição. |
| **`code-review-and-quality`** | `.agents/skills/code-review-and-quality/SKILL.md` | Portões de qualidade pré-merge e revisão de simplificação. |
| **`rea-interoperabilidade`** | `.agents/skills/rea-interoperabilidade/SKILL.md` | Investigar legalmente comportamento de Nuvio, fontes e criadores de catálogo, exigindo evidência, testes e implementação própria; REA/Ghidra opcionais. |

---

## 5. Ciclo Obrigatório de Execução de Tarefas

Toda nova demanda ou modificação no projeto deve seguir o fluxo estruturado:

1. **Definição (`/spec`):** Clarificar escopo, arquivos impactados e conformidade Stremio antes de alterar código.
2. **Testes (`/test`):** Criar casos de teste usando `node:test` que reproduzam a necessidade ou defeito.
3. **Implementação (`/build`):** Escrever o código mínimo e limpo em ES Modules ou Vanilla JS.
4. **Verificação de Regressão:** Executar `npm test` e confirmar 100% de sucesso.
5. **Auditoria de Segurança (`/security`):** Garantir que `requireLocalEdit` e os dados confidenciais foram preservados.
6. **Revisão e Conclusão (`/review`):** Validar diffs limpos e documentar alterações quando necessário.
