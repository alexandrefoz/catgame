# Cat Logic (nome provisório)

Jogo de lógica no navegador: descubra onde estão os gatos escondidos no tabuleiro
usando só dedução — sem adivinhação. 100% estático (HTML + CSS + JavaScript puro),
sem backend, sem build, sem dependências externas. Pensado para rodar de graça no
GitHub Pages.

> O nome "Cat Logic" é provisório e fica isolado em `GAME_NAME` (`js/app.js`) para
> ser trocado facilmente.

## Regras do jogo

Variante usada (documentada antes da implementação, inspirada em puzzles de
posicionamento do tipo "uma peça por linha/coluna/região sem vizinhos", sem copiar
nome, arte ou código de nenhum jogo específico):

1. Existe exatamente **um gato por linha**.
2. Existe exatamente **um gato por coluna**.
3. Existe exatamente **um gato por região colorida**.
4. **Nenhum gato pode ser vizinho de outro**, inclusive na diagonal.
5. O jogador deduz as posições só com essas restrições — todo puzzle gerado tem
   **exatamente uma solução**.

Toque/clique em uma célula para alternar entre: vazia → 🐱 gato → ✕ marcada como
vazia → vazia. Use as marcações ✕ para anotar onde você já deduziu que não pode
haver gato.

**Atenção:** marcar um gato que não é o da solução real termina a partida na hora —
não dá para continuar depois de um erro. O jogo nunca preenche as marcações ✕
sozinho: é o jogador quem decide onde marcar, com risco real de errar (como as
bandeirinhas do Batalha Naval). Um miado agudo confirma um gato correto; um miado
forte e bravo (com um efeito de ruído, simulando um chiado) avisa o erro fatal. O
som é opcional e pode ser desligado a qualquer momento pelo botão 🔊/🔇 no canto
superior direito — a preferência fica salva no navegador.

## Como jogar localmente

Não há passo de build. Para evitar problemas de CORS com módulos ES (`import`/`export`)
ao abrir `index.html` direto com `file://`, sirva a pasta com qualquer servidor estático.
Um servidor mínimo de desenvolvimento já vem incluído:

```bash
node tests/dev-server.mjs
```

Depois abra `http://localhost:4173` no navegador. Esse servidor é só uma
conveniência de desenvolvimento — **não** é necessário (nem usado) na publicação.

## Como executar os testes

```bash
node tests/run.js
```

Os testes são determinísticos e cobrem:

- `tests/rules.test.js` — regras (adjacência, unicidade por linha/coluna/região).
- `tests/solver.test.js` — solucionador (zero, uma e múltiplas soluções; dedução lógica).
- `tests/generator.test.js` — gerador (toda dificuldade produz solução única e válida;
  reprodutibilidade por semente; robustez em gerações repetidas).
- `tests/game-state.test.js` — estado de uma partida (marcar/desmarcar, desfazer em lote,
  condição de vitória).

Execute os testes antes de publicar qualquer alteração nas regras ou no gerador.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub (ou use um existente) — este diretório ainda não é
   um repositório git local.
2. Dentro de `D:\Claude Backup\Jogo`, rode:
   ```bash
   git init
   git add .
   git commit -m "Primeira versão jogável do Cat Logic"
   git branch -M main
   git remote add origin <url-do-seu-repositorio>
   git push -u origin main
   ```
3. No GitHub, vá em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`.
4. Aguarde a publicação (alguns minutos) e abra a URL informada pelo GitHub Pages,
   inclusive no navegador do celular.
5. Se o jogo publicar mas a tela ficar em branco: abra o console do navegador.
   O erro mais comum é caminho de módulo incorreto quando o site é publicado num
   subdiretório de projeto (`usuario.github.io/repositorio/`) — todos os `import`
   deste projeto usam caminhos relativos (`./arquivo.js`), então isso já funciona
   em qualquer subdiretório sem alteração.

## Estrutura dos arquivos

```
index.html              estrutura das telas (início, jogo, modais)
css/style.css           visual (cores, tipografia, tabuleiro, modais)
css/responsive.css      ajustes de layout por tamanho de tela
js/rng.js               gerador de números pseudoaleatórios com semente
js/rules.js             regras centralizadas da variante (linha/coluna/região/vizinhança)
js/puzzle-solver.js     solucionador por backtracking + simulação de dedução lógica
js/board-generator.js   gerador de puzzles (ver "Como funciona o gerador" abaixo)
js/fallback-puzzles.js  puzzles pré-validados, gerados por tests/generate-fallbacks.mjs
js/game-state.js        estado de uma partida (marcações, desfazer, cronômetro)
js/hints.js             dicas progressivas (3 níveis)
js/sound.js             efeitos sonoros sintetizados (Web Audio API) + preferência de mudo
js/cat-gallery.js       10 presets de gato em SVG próprio + preferência de skin selecionado
js/storage.js           wrapper sobre localStorage com fallback em memória
js/statistics.js        estatísticas persistidas (partidas, vitórias, melhores tempos)
js/image-personalization.js  personalização opcional do personagem (IndexedDB, local)
js/app.js               liga a interface aos módulos acima
tests/                  testes automatizados + servidor de dev + script de curadoria
```

## Como funciona o gerador

Decisão de design importante (por não ser óbvia): as regiões coloridas **não** são
desenhadas em torno de uma solução escolhida de antemão. Testes práticos mostraram
que regiões "genéricas" quase sempre permitem soluções alternativas por acaso. Por
isso o gerador faz o caminho inverso:

1. Sorteia `N` células-semente distintas (uma por região) e faz crescer `N` regiões
   coloridas conectadas a partir delas, cobrindo o tabuleiro inteiro (flood-fill
   multi-origem).
2. Resolve o tabuleiro resultante (linha + coluna + região + vizinhança) com
   backtracking, limitado a encontrar até 2 soluções.
3. Se encontrar **exatamente uma**, ela se torna a solução do puzzle. Se encontrar
   zero ou mais de uma, o tabuleiro é descartado.
4. Para tabuleiros maiores (principalmente 9×9), gerar por tentativa aleatória pura
   fica caro. Nesse caso entra uma busca local (hill-climbing): move células de
   borda entre regiões vizinhas — sempre mantendo as duas regiões conectadas e
   não-vazias — até reduzir o número de soluções a 1, ou até esgotar o orçamento de
   iterações.
5. Se mesmo assim a geração falhar dentro do orçamento, o jogo usa um dos puzzles
   pré-validados em `js/fallback-puzzles.js` (gerados offline, com orçamento muito
   maior, por `tests/generate-fallbacks.mjs`) — nunca entrega um tabuleiro sem
   solução ou com solução ambígua.

Com os orçamentos atuais, a geração em tempo real tipicamente leva poucos
milissegundos no Fácil/Médio e até ~1-2 segundos no Difícil (9×9).

## Dificuldade

- **Fácil**: tabuleiro 5×5.
- **Médio**: tabuleiro 7×7.
- **Difícil**: tabuleiro 9×9.

A dificuldade **não** é definida só pelo tamanho: o gerador também registra quantos
gatos podem ser deduzidos por eliminação pura (sem backtracking) via
`puzzle-solver.solveByLogic`. Essa métrica (`deductionsWithoutGuessing`) é uma
heurística documentada, não uma medição formal de dificuldade — ainda não há
classificador validado estatisticamente. Contribuições futuras podem usar esse dado
para ajustar os tamanhos/parâmetros por nível com mais precisão.

## Como adicionar um novo nível de dificuldade

Edite `DIFFICULTY_SIZES` em `js/board-generator.js` e adicione a opção correspondente
em `index.html` (`<fieldset class="difficulty-select">`). Se o tamanho for grande,
regenere o conjunto de fallback (`node tests/generate-fallbacks.mjs`) para garantir
uma rede de segurança para esse tamanho também.

## Como modificar a identidade visual

Toda a aparência está isolada em `css/style.css` e `css/responsive.css` — nenhuma
cor, fonte ou espaçamento está hardcoded em `js/`. As cores de cada região usam
variáveis CSS (`--region-0` a `--region-8`) e cada região também tem um padrão
visual (textura) diferente, para não depender só da cor.

Os marcadores de célula seguem uma metáfora de semáforo/sinalização de trânsito:
`.marker-circle--ok` (verde, gato confirmado), `.marker-circle--danger` (vermelho,
gato em conflito — aciona o fim de jogo) e `.marker-warning` (placa de advertência
amarela, célula eliminada pelas regras). O vermelho é sempre a bolinha simples —
nunca é "pintado" com um personagem, pois funciona como sinal universal de erro.
O verde, por sua vez, pode ser substituído por um dos 10 gatos da galeria
(`js/cat-gallery.js`, SVG próprio) ou por uma foto do jogador (seção
"Personalização do personagem") — escolha em "Personalizar personagem".

## Como alterar as regras

As regras ficam centralizadas em `js/rules.js` (`RULESET`, `isPlacementValid`,
`validateFullSolution`, `validatePlayerCats`). O solucionador (`puzzle-solver.js`) e
o gerador (`board-generator.js`) dependem só dessas funções — alterar uma regra ali
propaga automaticamente para geração, validação de vitória e dicas. Qualquer nova
regra precisa ser refletida nos três pontos citados e cobrida em `tests/rules.test.js`.

## Personalização do personagem

Em "Personalizar personagem" o jogador escolhe entre:
- **Galeria de gatos** (`js/cat-gallery.js`): 10 variações — laranja, preto, branco,
  cinza, rajado, siamês, tricolor, filhote, engraçado e pixel art — desenhadas em SVG
  próprio (sem imagens, fontes ou APIs externas), guardadas via `localStorage`.
- **Foto do próprio gato**: uma imagem local (JPEG/PNG/WebP, até 5 MB) que substitui
  o gato nas células encontradas. Tudo roda no navegador:
  - a imagem nunca é enviada para nenhum servidor;
  - pode ser salva neste dispositivo (IndexedDB) ou só para a sessão atual;
  - limpar os dados do navegador apaga a personalização salva — isso é informado na
    própria interface;
  - se IndexedDB estiver indisponível, o jogo cai automaticamente para memória
    (válido só durante a sessão) sem quebrar nada.

A escolha (galeria ou foto) é independente da lógica do jogo: nenhuma delas tem
acesso à solução do puzzle, só trocam a aparência do marcador verde.

## Limitações conhecidas

- A estimativa de dificuldade (`deductionsWithoutGuessing`) é uma heurística, não
  uma métrica validada estatisticamente — documentado acima, não deve ser lido como
  garantia de dificuldade "exata".
- A geração em tempo real para 9×9 pode levar até ~1-2 segundos; o botão "Jogar"
  mostra "Gerando puzzle..." e fica desabilitado durante esse tempo.
- Os sons são sintetizados via Web Audio API (osciladores + ruído), não gravações
  reais de gato — mantém o jogo sem dependências externas e sem download de áudio,
  mas o resultado é estilizado, não realista.
- Não há suporte a desafio diário, ranking, conquistas, temas visuais, PWA ou
  múltiplos idiomas nesta primeira versão — a arquitetura foi pensada para permitir
  essas evoluções (ver seção 14 do briefing do projeto), mas nada disso está
  implementado ainda.
- O jogo termina imediatamente ao marcar um gato que quebra qualquer regra (decisão
  de produto: ver mensagem a seguir), em vez de permitir correção livre com apenas
  destaque visual do erro — isso torna o jogo mais punitivo que a maioria dos
  puzzles de dedução do gênero, onde normalmente dá pra corrigir e continuar.
- A navegação por teclado no tabuleiro usa `role="grid"`/`role="gridcell"` de forma
  simplificada (sem agrupamento explícito por linha); funciona com leitores de tela
  comuns, mas pode ser refinada no futuro.
