# Plano de Implementação: Aba Coleções, Prévia no Nuvio e Estúdio Multi-Formato de Capas & Ícones

## 1. Visão Geral do Produto e Objetivos

Este plano detalha as três melhorias solicitadas para a aba **Coleções** do **Nuvio Hub**:

1. **Unificação do Botão de Prévia:** Remover a faixa redundante `.collection-preview-workflow` (`"Abrir simulador de TV →"`) e manter exclusivamente o botão de ação no cabeçalho da aba Coleções, renomeando-o para **"Prévia no Nuvio"**.
2. **Remodelação Fiel da "Prévia no Nuvio" (Baseada no Vídeo de Referência):** Substituir o fluxo antigo de múltiplos níveis intermediários por um **Modal Dedicado em Tela Cheia** que reproduz exatamente a experiência de Smart TV e Celular demonstrada no vídeo:
   - **Cabeçalho do Modal:** Título *"Prévia da tela inicial do Nuvio"*, subtítulo *"Confira como suas coleções, capas e abas serão exibidas"*, seletor de dispositivo **`TV` | `Celular`** e botão fechar **`✕`**.
   - **Tela Inicial (Home):** Barra lateral esquerda com ícones de navegação (`⌂` Início, `⌕` Busca, `⚙` Configurações), **Carrossel Hero** no topo com destaque cinematográfico (título, gêneros, ano, sinopse, botão `Ver Detalhes` e indicadores de carrossel) e trilhos horizontais para cada coleção (`✦ Descobrir`, `✦ Streaming`, etc.) exibindo a contagem de pastas à direita e os cartões das pastas respeitando a proporção configurada em cada pasta (`LANDSCAPE 16:9`, `POSTER 2:3`, `PORTRAIT 3:4` ou `SQUARE 1:1`).
   - **Abertura Direta da Pasta (Abas + Grade de 6 Colunas):** Ao clicar em qualquer pasta da Home, abrir diretamente a visualização da pasta com cabeçalho imersivo (miniatura da capa na proporção da pasta, coleção de origem, título da pasta e total de fontes), **abas horizontais em formato pílula** para cada fonte configurada na pasta (com a aba ativa destacada em branco) e **grade de pôsteres em 6 colunas** (no modo TV) com cartões *skeleton* pulsantes durante o carregamento dos itens reais da fonte selecionada.
3. **Estúdio Multi-Formato de Criação de Capas e Ícones (TMDB + Temas + IA):** Integrar no editor de Coleções e Pastas uma ferramenta completa de geração visual que suporta **todos os tamanhos e proporções das coleções e pastas**, salvando o ativo gerado localmente no Hub (`data/artwork/` servido em `/api/hub/artwork/:filename`) e vinculando automaticamente a URL e a proporção (`tileShape`) na pasta ou coleção.

---

## 2. Formatos e Proporções Suportados no Estúdio de Capas

O Estúdio detecta automaticamente o `tileShape` atual da pasta (ou o tipo de ativo da coleção) e permite escolher e pré-visualizar em tempo real qualquer um dos formatos oficiais do Nuvio:

| Formato no Nuvio | Proporção | Resolução de Exportação | Aplicação Principal | Layout do Mosaico / Composição |
| :--- | :---: | :---: | :--- | :--- |
| **`LANDSCAPE`** | **16:9** | `1280 × 720 px` | Capas horizontais de pastas (Estilo TV / Streaming) e Backdrops de Coleção | Colagem panorâmica (3 pôsteres inclinados, *backdrop* cinematográfico ou grade 2×2 com vinheta lateral/inferior) |
| **`POSTER`** | **2:3** | `600 × 900 px` | Capas verticais clássicas de pastas (Estilo Cartaz de Cinema) | Pôster principal em tela cheia com camada de iluminação, ou tríptico vertical / grade 2×2 de cartazes do catálogo |
| **`PORTRAIT`** | **3:4** | `750 × 1000 px` | Capas retrato para pastas (compatível com conversão automática no Nuvio Legacy) | Composição retrato equilibrada com arte de destaque centralizada e espaço tipográfico |
| **`SQUARE`** | **1:1** | `800 × 800 px` | Pastas quadradas, ícones de coleções e insígnias de canais/estúdios | Ícone centralizado, mosaico simétrico 2×2 de pôsteres ou emblema de streaming/gênero |
| **`HERO BACKDROP`** | **16:9 Wide** | `1920 × 1080 px` | Imagem de fundo (`backdropImageUrl`) da Coleção inteira | *Backdrop* em alta definição com *scrim* escuro cinematográfico pronto para leitura de interface |

> **Sincronização Inteligente:** Quando o usuário gera e aplica uma capa em uma pasta escolhendo `LANDSCAPE (16:9)`, `POSTER (2:3)`, `PORTRAIT (3:4)` ou `SQUARE (1:1)`, o Estúdio atualiza tanto o campo de imagem (`customCoverImageUrl` / `coverImageUrl`) quanto o seletor `folderShape` (`tileShape`) da pasta automaticamente para evitar distorções ou cortes indesejados.

---

## 3. Componentes e Fluxos Técnicos

### 3.1. Limpeza e Unificação na Aba Coleções (`public/app.js`)
- Na função `renderCollections()`:
  - Alterar o rótulo do botão principal no cabeçalho (`pageTitle`) de `'▶ Simular no Nuvio'` para `'Prévia no Nuvio'`.
  - Remover integralmente o bloco `<div class="collection-preview-workflow">...</div>` que exibia o segundo botão redundante `"Abrir simulador de TV →"`.
  - Adicionar no painel **Editar coleção** (ao lado de *Imagem de fundo*) e no painel **Editar pasta** (ao lado de *Imagem da capa* e *Proporção*) o botão **"✦ Criar capa / ícone"** que abre o Estúdio já pré-configurado com o formato (`tileShape`) atual da pasta ou coleção.

### 3.2. Novo Simulador "Prévia no Nuvio" (`public/nuvio-preview.js` e `public/styles.css`)
- **Estrutura do Modal:**
  - Abre diretamente em tela cheia com cabeçalho contendo:
    - Esquerda: Título **"Prévia da tela inicial do Nuvio"** e subtítulo **"Confira como suas coleções, capas e abas serão exibidas"**.
    - Direita: Botões de alternância **`TV`** e **`Celular`** + botão de fechamento **`✕`**.
- **Estado `home` (Tela Inicial):**
  - **Sidebar Esquerda (TV):** Ícones de navegação vertical (`⌂` Início, `⌕` Busca, `⚙` Configurações).
  - **Hero Banner Carousel:** Alimentado dinamicamente pelos títulos em destaque das fontes configuradas, com pontos indicadores (*dots*) clicáveis, título grande, metadados (`Gênero • Ano`), sinopse e botão `Ver Detalhes`.
  - **Trilhos de Coleções:** Lista todas as coleções visíveis com ícone `✦`, nome da coleção à esquerda e contador `<N> pastas` à direita. Abaixo de cada cabeçalho, fileira horizontal de cartões de pastas renderizados na proporção exata configurada em cada pasta (`16:9` para `LANDSCAPE`, `2:3` para `POSTER`, `3:4` para `PORTRAIT` e `1:1` para `SQUARE`), exibindo a arte da capa e o título da pasta na base (respeitando `hideTitle`).
- **Estado `folder` (Visualização Direta da Pasta com Abas e Grade):**
  - Ao clicar em qualquer pasta na Home, abre diretamente a tela de abas da pasta (sem tela intermediária de lista de fontes).
  - **Cabeçalho da Pasta:** Botão `← Voltar` + miniatura da capa da pasta (respeitando sua proporção) + sobretítulo `✦ NOME DA COLEÇÃO`, título grande da pasta e subtítulo `<N> fontes`.
  - **Barra de Abas de Fontes:** Pílulas horizontais clicáveis para cada fonte da pasta (`Nome da Fonte • Filmes/Séries`), com a aba ativa destacada em branco sólido.
  - **Grade de 6 Colunas + Skeletons:** Exibe 12 cartões *skeleton* pulsantes em grade de 6 colunas (TV) ou 3 colunas (Celular) durante o carregamento via `/api/nuvio-preview/source`, substituindo-os pelos pôsteres reais com título e ano assim que a resposta retorna.

### 3.3. Estúdio Multi-Formato de Capas e Ícones (`public/app.js`, `src/server.js`, `src/aggregator/artwork-studio.js`)
- **Seletor Global de Formato no Topo do Modal do Estúdio:**
  - Permite alternar instantaneamente o canvas de criação entre **`Landscape 16:9`**, **`Poster 2:3`**, **`Portrait 3:4`** e **`Square 1:1`** (além de **`Backdrop 16:9 HD`** quando aberto a partir de uma Coleção).
- **Três Modos de Criação Adaptáveis a Todos os Formatos:**
  1. **Mosaico / Arte TMDB:**
     - Carrega automaticamente os pôsteres e *backdrops* dos filmes/séries presentes nas fontes daquela pasta (ou permite pesquisar qualquer título no TMDB).
     - Oferece layouts inteligentes que se adaptam à proporção escolhida:
       - *Destaque Único:* Pôster (`2:3` / `3:4`) ou Backdrop (`16:9` / `1:1`) em tela cheia com gradiente e tipografia.
       - *Tríptico / Leque de Cartazes:* 3 pôsteres combinados lado a lado ou em perspectiva dinâmica (funciona em `16:9`, `2:3`, `3:4` e `1:1`).
       - *Mosaico 2×2:* Grade de 4 títulos da pasta com vinheta escura e selo/título centralizado ou na base.
  2. **Galeria de Logos & Temas Prontos:**
     - Presets vetoriais de serviços de streaming (Netflix, Prime Video, Disney+, Max, Apple TV+, Globoplay, Crunchyroll, Paramount+, etc.) e categorias/gêneros (Em Alta, Lançamentos, Terror, Ficção Científica, Anime, Infantil, Documentários, 4K UHD).
     - Adapta automaticamente o dimensionamento do logo, o brilho radial e a posição do título para `16:9`, `2:3`, `3:4` ou `1:1`, com controles de cor de fundo, textura e opção de ocultar texto (`hideTitle`).
  3. **Geração por IA (Gemini Image):**
     - Integração server-side com `@google/genai` (`gemini-3.1-flash-lite-image`) passando a proporção selecionada (`16:9`, `3:4`, `1:1` e recorte de precisão `2:3` para Poster) e o prompt temático da pasta/coleção.
- **Persistência Local e Vínculo Automático:**
  - `POST /api/hub/artwork/save` e `POST /api/hub/artwork/generate-ai` (protegidos por `requireLocalEdit`) salvam o arquivo em `data/artwork/<id>.png` e retornam a URL local `/api/hub/artwork/<id>.png`.
  - `GET /api/hub/artwork/:filename` serve a imagem com cache otimizado.
  - Clicar em **"Salvar e Aplicar"** grava a imagem localmente no Hub, preenche a URL na pasta/coleção e sincroniza o `tileShape` da pasta com o formato escolhido.

---

## 4. Verificação e Testes Automatizados (`node:test`)

- Atualizar `test/nuvio-preview.test.js` e `test/nuvio-universal-studio.test.js` para validar:
  - Abertura direta da pasta com abas de fontes e grade de 6 colunas no simulador.
  - Suporte às diferentes proporções (`LANDSCAPE`, `POSTER`, `PORTRAIT`, `SQUARE`) tanto na prévia quanto no salvamento de capas locais via `/api/hub/artwork/save`.
  - Proteção `requireLocalEdit` nas rotas de criação/salvamento de arte e 100% de aprovação em `npm test`.
