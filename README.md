# Nuvio Hub — Stream Aggregator

Aplicação local para reunir **addons, catálogos, coleções e metadados** em um mesmo espaço de trabalho, com exportação compatível com o ecossistema **Nuvio/Stremio**.

A aplicação reúne um agregador de streams, gestão de fontes, criação/importação de catálogos e um **Collection Studio com pré-visualização interativa de TV**.

## Funcionalidades

- **Addons:** conexão via manifest, reordenação de prioridade e suspensão automática de origens indisponíveis.
- **Catálogos:** descoberta dos catálogos presentes em addons, importação de listas e criação de catálogos próprios.
- **Coleções:** criação, importação de JSON, edição de pastas, seleção de fontes e ordenação arrastar-e-soltar.
- **TV Studio:** simulação navegável da Home, coleções, pastas e cartazes em modos Moderno, Clássico e Grade, com versões para TV e celular. A visualização usa amostras reais de metadados, **não reproduz vídeos**.
- **Capas:** suporte opcional a integração ERDB com proxy assinado; não publica o token no URL da imagem.
- **Monitoramento:** status de provedores, tempos de resposta e diagnóstico de falhas.
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
```

O projeto utiliza Node.js ES Modules, Express, HTML, CSS e JavaScript nativo, **sem bundler frontend**.

## Fluxo principal

1. Cadastre e organize seus **Addons**.
2. Descubra, importe ou crie **Catálogos**.
3. Organize **Coleções** e **Pastas**, vinculando os catálogos disponíveis.
4. Abra **Coleções → Simular no Nuvio** para conferir a organização na TV virtual, navegar com as setas/Enter/Esc e alternar entre Moderno, Clássico e Grade.
5. Salve as alterações no editor e copie os endpoints de publicação na aba **Publicar no Nuvio**.

A prévia é uma simulação de organização e metadados; a reprodução e o comportamento visual exato podem variar conforme a versão do aplicativo Nuvio.

## Acesso remoto opcional

O `docker-compose.yml` tem um serviço `cloudflared` opcional. **Não há túnel, domínio nem credenciais pré-configurados neste repositório.**

1. Crie e autorize seu próprio túnel no Cloudflare Zero Trust.
2. Copie `cloudflared/config.example.yml` para `cloudflared/config.yml` e configure seu UUID e hostname.
3. Guarde as credenciais em `cloudflared/credentials.json`, com permissões restritas.
4. Execute `docker compose up -d --build` após configurar o serviço.

O serviço de túnel no Compose foi preparado para a instalação Linux existente (UID/GID 1000:1000). Adapte o usuário e os caminhos conforme o ambiente. **Não exponha a interface de administração à internet.** Os endpoints administrativos recusam requisições originadas fora do loopback.

## Privacidade e segurança

**Este GitHub contém somente o código da aplicação, testes, assets e instruções genéricas.** Os itens abaixo ficam **somente no computador** e são ignorados pelo Git:

- `data/`: perfis, tokens, chaves de APIs, catálogos salvos, JSON de coleções, caches e backups.
- `cloudflared/config.yml`, `cloudflared/credentials.json`: configuração e credenciais do túnel.
- `.env` e `.env.local`: variáveis de ambiente.
- `docs/`: checkpoints internos e relatórios específicos da instalação.

Ao clonar este repositório, **seus catálogos pessoais, coleções e credenciais não serão restaurados automaticamente**. Faça backup privado de `data/` fora do GitHub.

**Nota de histórico:** versões anteriores deste repositório público continham arquivos de configuração de perfis no histórico Git. A revisão atual deixa de rastrear esses arquivos, mas remover um arquivo de um commit **não elimina os commits anteriores**. Revise e substitua credenciais usadas em versões antigas; a limpeza do histórico exige procedimento separado e coordenado.

## Desenvolvimento

- `public/` — frontend do painel, TV Studio e CSS.
- `src/` — API e pipeline do agregador.
- `test/` — testes com `node:test`.
- `.agents/` e `AGENTS.md` — regras e skills de desenvolvimento.
- `scripts/` — rotinas auxiliares de testes, backup e implantação. Alguns scripts contêm caminhos específicos da instalação original e devem ser adaptados a outros computadores.

Os dados e credenciais locais **nunca devem ser incluídos em commits**. Execute `npm test` antes de enviar alterações.
