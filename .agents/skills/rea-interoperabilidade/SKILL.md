---
name: rea-interoperabilidade
description: Investigar de forma autorizada funcionalidades e protocolos de aplicativos, addons Stremio/Nuvio e criadores de catálogos, aplicando as descobertas ao Nuvio Hub com testes.
---

# Skill — REA e interoperabilidade para Nuvio Hub

## Gatilhos
- Entender recursos de criadores de catálogos e listas (AIO Metadata, IMDb, Trakt, MDBList, TMDB).
- Investigar diferenças entre o Nuvio instalado e o Preview de Coleções, para obter fidelidade de interface e navegação.
- Identificar compatibilidade de catálogos de addons, IDs, tipos, filtros e paginação.
- Documentar formato/contrato de aplicativo próprio, open source ou explicitamente autorizado para inspeção.

## Regras
1. Trabalhar apenas com software próprio, open source ou cuja análise tenha sido autorizada. Não contornar autenticação, DRM, bloqueios de licença ou controles de acesso; não extrair credenciais.
2. Preferir a documentação oficial e APIs públicas, depois inspeção JS ou navegador CDP; Ghidra só para análise de binário nativo quando necessário.
3. Separar fatos comprovados, hipóteses e desconhecidos. Não alegar funcionamento integral porque o manifesto anuncia um catálogo.
4. Extrair requisitos e contratos e construir código próprio; não copiar implementação proprietária nem interfaces pixel-perfect sem permissão.
5. Pesquisas isoladas em /tmp ou fixtures de teste. Não gravar na biblioteca real, perfis, chaves, coleções ou Nuvio durante investigação.
6. Preservar arquitetura Vanilla JS + Express + Docker, rotas locais de edição e protocolo Stremio/Nuvio.

## Ferramentas
Já verificadas no computador: Node.js 22.20, npm, Codex, Antigravity, Chrome e Docker. REA, OpenCode e Ghidra NÃO estão instalados.
Projeto oficial do REA: https://github.com/morluto/rea
Instalação opcional com revisão de alterações: npx rea-agents@latest setup — selecionar Codex/Antigravity conforme preferência do usuário.
Inspeção estática pontual em artefato JS/Electron autorizado: npx -y rea-agents@latest analyze-javascript-application /caminho/para/artefato --json
OpenCode é alternativa de agente, não obrigatório quando Codex/Antigravity estiver disponível; Ghidra não é necessário para estudos comuns de sites e manifestos.

## Processo obrigatório
1. Escolher uma pergunta estreita, o alvo e a base de autorização.
2. Obter evidência: APIs/documentação, manifest, IDs, filters, capturas de navegador sem credenciais, scripts ou binários autorizados.
3. Mapear entrada → transformação → saída, com tabela de Observado / Inferido / Não comprovado.
4. Criar fixture local e testes de regressão com node --test.
5. Implementar melhoria isolada, mantendo compatibilidade com o protocolo e addons existentes.
6. Confirmar npm test completo, comportamento real de mockups sob Chrome, isolamento de edição, hashes de data/studio-import.json, data/profiles.json e data/hub-integrations.json.
7. Documentar checkpoint com fonte, limitações, segurança e resultados sem expor tokens.

## Casos prioritários
- Estudar e adaptar o fluxo de listas mistas e atualização dos criadores AIO Metadata / MDBList / Trakt.
- Confrontar Nuvio real e Preview (coleções, pastas, foco e proporção dos cartazes).
- Auditoria de origem Cinebra: manifest, catálogo e paginação — distinguir reconhecido de títulos retornados.
- Compatibilidade Stremio/Nuvio de catálogos criados e de coleções antes da publicação.

## Prompt reutilizável
Investigue de maneira autorizada e documentada o recurso [RECURSO] do aplicativo [ALVO]. Use primeiro documentação/artefatos públicos, e REA/CDP somente se necessário. Traga evidências, hipóteses e limitações, uma especificação adaptada ao Nuvio Hub em /home/patryk-rocha/Projetos/stream-aggregator e testes isolados. Implemente uma versão própria compatível sem alterar dados, credenciais ou a publicação antes da validação.
