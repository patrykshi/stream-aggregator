# Nuvio Hub — Stream Aggregator

Aplicação local para reunir **addons, catálogos, coleções e metadados** em um mesmo espaço de trabalho, com exportação compatível com o ecossistema **Nuvio/Stremio**.

A aplicação reúne um agregador de streams, gestão de fontes, criação/importação de catálogos e um **Collection Studio com pré-visualização interativa de TV**.

## Funcionalidades

- **Addons:** conexão via manifest, reordenação de prioridade e suspensão automática de origens indisponíveis.
- **Catálogos:** descoberta dos catálogos presentes em addons, importação de listas e criação de catálogos próprios.
- **Coleções:** criação, importação de JSON, edição de pastas, seleção de fontes e ordenação arrastar-e-soltar.
- **TV Studio:** simulação navegável da Home, coleções, pastas e cartazes com visão de TV e celular, grades de cartazes e navegação por teclado. A visualização usa amostras reais de metadados, **não reproduz vídeos**.
- **Capas:** suporte opcional a integração ERDB com proxy assinado; não publica o token no URL da imagem.
- **Monitoramento:** status dos manifestos, resultado das buscas e latência, sem confundir esses dados com reprodução comprovada na TV.
- **Publicação:** endpoints de manifest, catálogos, metadados, streams e JSON de coleções.
- **Segurança:** edição somente pela interface local, diretório de dados privado e contêineres com privilégios reduzidos.

## Requisitos

- Docker com Docker Compose (recomendado), **ou** Node.js 22+.
- Navegador atualizado.
- Conexão com a internet para consultar manifests externos e carregar capas.
- Cloudflare Tunnel **opcional**, somente se quiser disponibilizar endpoints de leitura pela internet.

## Primeira execução (apenas no computador)

```bash
git clone https://github.com/patrykshi/stream-aggregator.git
cd stream-aggregator
docker compose up -d --build stream-aggregator
```

Abra **http://127.0.0.1:7001** no próprio computador. A aplicação cria automaticamente seus dados iniciais em `data/`.

Para iniciar diretamente com Node.js:

```bash
npm ci
npm start
```

### Testes

```bash
npm test
npm run build
```

O projeto inclui `package-lock.json` e valida automaticamente testes, sintaxe e a imagem Docker nas PRs pelo GitHub Actions. O roteiro visual isolado pode ser executado com `npm run qa:tv` em computadores com Google Chrome instalado.

O projeto utiliza Node.js ES Modules, Express, HTML, CSS e JavaScript nativo, **sem bundler frontend**.

## Fluxo principal

1. Cadastre e organize seus **Addons**.
2. Descubra, importe ou crie **Catálogos**.
3. Organize **Coleções** e **Pastas**, vinculando os catálogos disponíveis.
4. Abra **Coleções → Prévia no Nuvio** para conferir a organização na TV virtual, navegar com as setas/Enter/Esc e alternar entre TV e Celular.
5. Salve as alterações no editor e copie os endpoints de publicação na aba **Publicar no Nuvio**.

A prévia é uma simulação de organização e metadados: ela lê títulos reais do workspace e solicita **12 cartazes por página lógica**, preservando a continuidade ao consultar lotes remotos de 20 ou 100 itens. Se não houver títulos reais, exibe uma mensagem informativa em vez de inventar destaques. A reprodução e o comportamento visual exato podem variar conforme a versão do aplicativo Nuvio. A atualização das listas externas é manual; publicar manifest/coleções não modifica automaticamente a conta Nuvio.

## Acesso remoto opcional

O `docker-compose.yml` tem um serviço `cloudflared` opcional. **Não há túnel, domínio nem credenciais pré-configurados neste repositório.**

1. Crie e autorize seu próprio túnel no Cloudflare Zero Trust.
2. Copie `cloudflared/config.example.yml` para `cloudflared/config.yml` e configure seu UUID e hostname.
3. Guarde as credenciais em `cloudflared/credentials.json`, com permissões restritas.
4. Verifique se o `service` do túnel aponta para **`http://stream-aggregator:7002`**, nunca para `7001`.
5. Execute `docker compose up -d --build` após configurar o serviço.

A porta interna `7002` só permite GET/HEAD de manifestos, metadados, imagens, catálogos, streams e coleções. A porta administrativa `7001` é publicada apenas em `127.0.0.1` do host. Instalações anteriores do Cloudflare precisam atualizar manualmente `cloudflared/config.yml` para a nova porta **antes da implantação**.

O serviço de túnel no Compose foi preparado para a instalação Linux existente (UID/GID 1000:1000). Adapte o usuário e os caminhos conforme o ambiente. **Não exponha a interface de administração à internet.** Endpoints administrativos também rejeitam cabeçalhos típicos de proxy e origens cruzadas. Execução direta via `npm start` escuta no loopback por padrão; o Docker configura `BIND_HOST=0.0.0.0` apenas dentro do contêiner. Não exponha a porta 7001 na rede ou em túneis.

## Privacidade e segurança

**Este GitHub contém somente o código da aplicação, testes, assets e instruções genéricas.** Os itens abaixo ficam **somente no computador** e são ignorados pelo Git:

- `data/`: perfis, tokens, chaves de APIs, catálogos salvos, JSON de coleções, caches e backups.
- `cloudflared/config.yml`, `cloudflared/credentials.json`: configuração e credenciais do túnel.
- `.env` e `.env.local`: variáveis de ambiente (use `.env.example` apenas como modelo sem segredos).
- `public/assets/aistudio/*.mp4`: gravações de tela, possivelmente com dados pessoais.
- `docs/`: checkpoints internos e relatórios específicos da instalação.

Ao clonar este repositório, **seus catálogos pessoais, coleções e credenciais não serão restaurados automaticamente**. Faça backup privado de `data/` fora do GitHub.

**Nota de histórico:** versões anteriores deste repositório público continham arquivos de configuração de perfis no histórico Git. Uma gravação de tela também foi removida da árvore atual. A revisão atual deixa de rastrear esses arquivos, mas remover um arquivo de um commit **não elimina os commits anteriores**. Revise e substitua credenciais usadas em versões antigas; a limpeza do histórico exige procedimento separado e coordenado.

## Desenvolvimento

- `public/` — frontend do painel, TV Studio e CSS.
- `src/` — API e pipeline do agregador.
- `test/` — testes com `node:test`.
- `.agents/` e `AGENTS.md` — regras e skills de desenvolvimento.
- `scripts/` — rotinas auxiliares de testes, backup e implantação. Alguns scripts contêm caminhos específicos da instalação original e devem ser adaptados a outros computadores.

Os dados e credenciais locais **nunca devem ser incluídos em commits**. Execute `npm test` antes de enviar alterações.

## Auditoria e fluxo de contribuições

- Testes funcionais: `npm test` (executar após cada mudança); integração contínua em `.github/workflows/ci.yml`.
- Backup privado: `NUVIO_BACKUP_DIR=/caminho/privado scripts/backup-verify.sh` (não colocar backup em Git).
- Deploy protegido: `scripts/deploy-verified.sh` recusa configuração antiga do Cloudflare na porta administrativa.
- Teste TV com fixture isolada: `npm run qa:tv` (não utiliza `data/` real).
- Chaves de APIs (TMDB, Trakt, MDBList e Gemini): inserir apenas no `.env` local ou no gerenciador privado de segredos; nunca no GitHub. Sem `GEMINI_API_KEY`, o estúdio utiliza composição visual local. A API Gemini pode gerar custos.
- Não é possível certificar equivalência pixel a pixel com todas as versões de Nuvio sem registros e testes de referência nessas versões.

## TV Studio e revisão de listas

- Na prévia do Nuvio, alterne **Moderno**, **Clássico** ou **Grade**, e **TV/Celular**. São modelos visuais da organização — a interface exata depende da versão do aplicativo real. Nenhum modo modifica a biblioteca persistida.
- Em **Configurações → Atualização de listas externas**, confira o resumo de diferenças de Trakt, TMDB, MDBList e TVmaze antes de aplicar. O servidor impede listas vazias, duplicações e reduções superiores a 25%.
- A atualização automática **é opcional e vem desligada**. Quando ativada, roda diariamente em lotes de até 10 listas, em rotação. A aplicação só consulta APIs externas para atualizar metadados; não autentica nem altera a conta Nuvio.
- O processo grava backups/revisões do Studio, verifica conflitos, preserva vínculos e mantém os endpoints JSON atualizados. O import na conta Nuvio continua manual, pelos fluxos oficiais da conta.

A verificação `npm run build` analisa a sintaxe JavaScript de frontend, backend, scripts e testes, incluindo os módulos de TV.

## Artwork Studio — Python, logos originais, ícones e Gemini

A área **Coleções → Criar capa/ícone** agora oferece quatro processos complementares:

1. **Mosaico TMDB:** composição local usando pôsteres e fundos.
2. **Temas e cores:** presets inspirados em gêneros e serviços, sem fabricar logos. A seleção **Sem logo nem ícone** é o padrão. Também é possível importar seu arquivo de logo oficial (PNG, WebP ou JPEG, até 2 MB), respeitando os direitos de uso.
3. **Gemini:** geração de imagem **real** por API oficial. Cadastre a chave em **Configurações → Integrações → Gemini**. Não é feita nenhuma requisição paga sem clicar em **Gerar Arte com IA**. Uma geração é reaproveitada ao salvar, sem uma segunda chamada. Sem chave ou sem resposta de imagem, o sistema mostra erro, em vez de chamar imagem procedural de IA. Consulte as condições de cobrança do fornecedor.
4. **Criador Python do PC:** usa o `render.py` do gerador Pillow que já existia no computador, com cores douradas, tipografia e divisor. O Docker monta o arquivo original e o diretório `assets/` somente em leitura, sem copiá-los para o repositório e sem alterar o programa Python original. Defina `PYTHON_COVER_PATH` no `.env` se o gerador estiver em outra pasta.

**Ícones próprios:** no seletor de marca, é possível digitar uma sigla/símbolo com o teclado, escolher símbolos genéricos ou desenhar com mouse/toque; o desenho transparente é renderizado na capa. O modo **Sem logo** evita utilizar ícones não autorizados ou siglas de streaming que imitem uma marca oficial.

**Segurança:** APIs de criação permanecem locais; a versão pública só serve imagens WebP geradas. As chaves são salvas somente em `data/hub-integrations.json` (fora do Git). O criador Python recebe imagens já obtidas pelo Hub e não baixa URL arbitrária.
