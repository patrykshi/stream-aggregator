# Equipe de Agentes e Skills do Stream Aggregator

Este diretório contém a infraestrutura de inteligência e automação para o desenvolvimento, manutenção e segurança do **Stream Aggregator**. A estrutura foi construída com base no padrão [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) e no sistema nativo de customizações do **Google Antigravity**.

---

## 👥 Papéis da Equipe Especializada

| Agente | Tipo | Responsabilidades |
| :--- | :--- | :--- |
| **`stream-architect`** | Arquitetura | Protocolo Stremio v2, fronteiras entre módulos e decisões estruturais (ADRs). |
| **`stream-frontend`** | Frontend UI | Vanilla JS, layout Dark Mode CSS, seletores de logos e Nuvio Preview. |
| **`stream-backend`** | Backend | Rotas Express, agregação paralela, codec, filtros e cache de catálogo. |
| **`stream-tester`** | Testes | Suíte nativa `node:test`, prevenção de regressões (baseline 168 testes) e TDD. |
| **`stream-security`** | Segurança | Gating de loopback (`requireLocalEdit`), permissões `0600` e mascaramento de tokens. |
| **`stream-debugger`** | Depuração | Análise de causa-raiz (RCA), timeouts de scrapers e diagnósticos de runtime. |

---

## 🛠️ Catálogo de Skills (`skills/`)

* [`spec-driven-development`](skills/spec-driven-development/SKILL.md): Planejamento e especificação rigorosa antes de qualquer código.
* [`test-driven-development`](skills/test-driven-development/SKILL.md): Desenvolvimento orientado a testes usando o test runner nativo do Node.js.
* [`api-and-interface-design`](skills/api-and-interface-design/SKILL.md): Contratos de APIs Stremio v2 e endpoints locais protegidos.
* [`frontend-ui-engineering`](skills/frontend-ui-engineering/SKILL.md): Padrões de desenvolvimento para Vanilla JS e Dark Mode sem bundler.
* [`debugging-and-error-recovery`](skills/debugging-and-error-recovery/SKILL.md): Diagnóstico sistemático de falhas de rede, scraping e cache.
* [`security-hardening`](skills/security-hardening/SKILL.md): Auditoria de autenticação local e proteção contra vazamento de credenciais.
* [`code-review-and-quality`](skills/code-review-and-quality/SKILL.md): Checklist obrigatório de portões de qualidade pré-conclusão.

---

## 🚀 Como Utilizar nas Próximas Tarefas

### Fluxo de Trabalho Recomendado

1. **Definição de Requisitos:**
   * Inicie solicitando ao agente que aplique a skill `spec-driven-development` para detalhar as mudanças previstas e impactos em rotas ou formatos de dados.
2. **Ciclo TDD:**
   * Peça ao agente que atue como `stream-tester` e utilize `test-driven-development` para criar testes em `test/*.test.js` cobrindo o novo cenário.
3. **Implementação:**
   * O agente assume o papel de `stream-backend` ou `stream-frontend` para implementar o código mínimo necessário em ES Modules ou Vanilla JS.
4. **Validação e Auditoria:**
   * Execute `npm test` para confirmar 100% de sucesso.
   * Acione a skill `security-hardening` ou o agente `stream-security` para verificar se nenhuma rota de gravação ficou sem `requireLocalEdit` e se os tokens privados permanecem seguros.
5. **Revisão Final:**
   * O agente executa o checklist da skill `code-review-and-quality`.
