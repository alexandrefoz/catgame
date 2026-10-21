import { generatePuzzle } from "./board-generator.js";
import {
  createGameState, setCell, undo, checkWin, elapsedMs,
  recordHintUsed, serializeGameState, deserializeGameState, CellState,
  isCatPlacementCorrect,
} from "./game-state.js";
import { getNextHint } from "./hints.js";
import { getItem, setItem, removeItem } from "./storage.js";
import { loadStatistics, recordGameStarted, recordGameWon } from "./statistics.js";
import {
  saveCustomImage, loadCustomImage, removeCustomImage, validateImageFile,
} from "./image-personalization.js";
import { playCatSuccess, playCatFail, isMuted, toggleMuted } from "./sound.js";
import { CAT_PRESETS, DEFAULT_SKIN_ID, getSelectedSkin, setSelectedSkin, getPresetById } from "./cat-gallery.js";

export const GAME_NAME = "Cat Logic";
const SAVE_KEY = "currentGame";

const el = (id) => document.getElementById(id);
const screens = { start: el("screen-start"), game: el("screen-game") };
const modalOverlay = el("modal-overlay");
const modals = {
  howToPlay: el("modal-how-to-play"),
  stats: el("modal-stats"),
  personalize: el("modal-personalize"),
  win: el("modal-win"),
  lose: el("modal-lose"),
  confirmRestart: el("modal-confirm-restart"),
};

let game = null;
let timerInterval = null;
let focusedCell = { row: 0, col: 0 };
let customCatImageUrl = null;
let pendingConfirmAction = null;
let longPressTimer = null;
let longPressTriggered = false;
const LONG_PRESS_MS = 480;

document.querySelectorAll("[data-game-name]").forEach((n) => (n.textContent = GAME_NAME));

// ---------- Som ----------
function refreshMuteButton() {
  const muted = isMuted();
  const btn = el("btn-mute");
  btn.textContent = muted ? "🔇" : "🔊";
  btn.setAttribute("aria-pressed", String(muted));
  btn.setAttribute("aria-label", muted ? "Ativar som" : "Desativar som");
}
el("btn-mute").addEventListener("click", () => {
  toggleMuted();
  refreshMuteButton();
});
refreshMuteButton();

// ---------- Navegação entre telas ----------
function showScreen(name) {
  for (const key of Object.keys(screens)) screens[key].hidden = key !== name;
}

function openModal(modal) {
  modalOverlay.hidden = false;
  for (const m of Object.values(modals)) m.hidden = m !== modal;
}
function closeModal() {
  modalOverlay.hidden = true;
}
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.querySelectorAll(".modal-close").forEach((btn) => btn.addEventListener("click", closeModal));

function askConfirm(title, message, onConfirm) {
  el("confirm-restart-title").textContent = title;
  modals.confirmRestart.querySelector("p").textContent = message;
  pendingConfirmAction = onConfirm;
  openModal(modals.confirmRestart);
}
el("btn-confirm-restart-cancel").addEventListener("click", () => {
  pendingConfirmAction = null;
  closeModal();
});
el("btn-confirm-restart-ok").addEventListener("click", () => {
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  closeModal();
  if (action) action();
});

// ---------- Início ----------
function refreshContinueBanner() {
  const saved = getItem(SAVE_KEY, null);
  el("continue-banner").hidden = !saved || saved.status === "won";
}
refreshContinueBanner();

el("btn-play").addEventListener("click", () => {
  const saved = getItem(SAVE_KEY, null);
  if (saved && saved.status === "playing") {
    askConfirm("Começar um novo jogo?", "Isso descarta a partida salva atual.", startNewGame);
  } else {
    startNewGame();
  }
});

el("btn-continue").addEventListener("click", () => {
  const saved = getItem(SAVE_KEY, null);
  if (!saved) return;
  game = deserializeGameState(saved);
  enterGameScreen();
});

el("btn-back-to-menu").addEventListener("click", () => {
  stopTimer();
  showScreen("start");
  refreshContinueBanner();
});

function getSelectedDifficulty() {
  return document.querySelector('input[name="difficulty"]:checked').value;
}

function startNewGame() {
  const difficulty = getSelectedDifficulty();
  const playButton = el("btn-play");
  const originalLabel = playButton.textContent;
  playButton.disabled = true;
  playButton.textContent = "Gerando puzzle...";

  // setTimeout(0) deixa o navegador pintar o texto "Gerando..." antes do trabalho
  // síncrono pesado do gerador (até ~1-2s no Difícil) travar a thread principal.
  setTimeout(() => {
    const puzzle = generatePuzzle(difficulty);
    game = createGameState(puzzle);
    recordGameStarted();
    persistGame();
    playButton.disabled = false;
    playButton.textContent = originalLabel;
    enterGameScreen();
  }, 0);
}

function enterGameScreen() {
  showScreen("game");
  renderBoard();
  updateCatsCounter();
  hideHintMessage();
  startTimer();
}

// ---------- Cronômetro ----------
function startTimer() {
  stopTimer();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function updateTimerDisplay() {
  const ms = elapsedMs(game);
  const totalSeconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  el("timer").textContent = `${mm}:${ss}`;
}

// ---------- Tabuleiro ----------
function renderBoard() {
  const board = el("board");
  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${game.puzzle.size}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${game.puzzle.size}, 1fr)`;

  for (let r = 0; r < game.puzzle.size; r++) {
    for (let c = 0; c < game.puzzle.size; c++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cell region-${game.puzzle.regions[r][c]}`;
      btn.dataset.row = r;
      btn.dataset.col = c;
      btn.setAttribute("role", "gridcell");
      btn.tabIndex = r === focusedCell.row && c === focusedCell.col ? 0 : -1;
      btn.addEventListener("click", () => handleCellActivate(r, c));
      btn.addEventListener("keydown", (e) => handleCellKeydown(e, r, c));
      btn.addEventListener("focus", () => (focusedCell = { row: r, col: c }));
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        handleCellMarkEmpty(r, c);
      });
      btn.addEventListener(
        "touchstart",
        () => {
          longPressTriggered = false;
          clearTimeout(longPressTimer);
          longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            if (navigator.vibrate) navigator.vibrate(15);
            handleCellMarkEmpty(r, c);
          }, LONG_PRESS_MS);
        },
        { passive: true }
      );
      btn.addEventListener("touchend", () => clearTimeout(longPressTimer));
      btn.addEventListener("touchmove", () => clearTimeout(longPressTimer));
      board.appendChild(btn);
    }
  }
  renderCellContents();
}

function renderCellContents() {
  const cells = el("board").children;
  const errorCells = computeErrorCells();
  for (let r = 0; r < game.puzzle.size; r++) {
    for (let c = 0; c < game.puzzle.size; c++) {
      const btn = cells[r * game.puzzle.size + c];
      const state = game.grid[r][c];
      const inConflict = errorCells.has(`${r},${c}`);
      btn.classList.toggle("error", inConflict);
      btn.innerHTML = "";
      let label = `Linha ${r + 1}, coluna ${c + 1}, região ${game.puzzle.regions[r][c] + 1}. `;
      if (state === CellState.CAT) {
        if (inConflict) {
          const marker = document.createElement("span");
          marker.className = "marker marker-circle marker-circle--danger";
          btn.appendChild(marker);
        } else {
          const selectedSkin = getSelectedSkin();
          const preset = getPresetById(selectedSkin);
          if (selectedSkin === "photo" && customCatImageUrl) {
            const img = document.createElement("img");
            img.className = "cat-img";
            img.src = customCatImageUrl;
            img.alt = "";
            btn.appendChild(img);
          } else if (preset) {
            const marker = document.createElement("span");
            marker.className = "marker marker-skin";
            marker.innerHTML = preset.svg();
            btn.appendChild(marker);
          } else {
            const marker = document.createElement("span");
            marker.className = "marker marker-circle marker-circle--ok";
            btn.appendChild(marker);
          }
        }
        label += inConflict ? "Sinal vermelho: gato em conflito com outro." : "Sinal verde: gato confirmado.";
      } else if (state === CellState.EMPTY) {
        const marker = document.createElement("span");
        marker.className = "marker marker-warning";
        btn.appendChild(marker);
        label += "Placa de advertência: aqui não pode haver gato.";
      } else {
        label += "Vazia, sem marcação.";
      }
      btn.setAttribute("aria-label", label);
    }
  }
}

// Uma célula marcada como gato está "errada" se não bater com a solução real — não basta
// checar se ela conflita com os outros gatos já marcados (ver comentário em
// game-state.isCatPlacementCorrect: múltiplos subconjuntos parciais podem ser estruturalmente
// consistentes entre si sem nenhum deles ser a solução de verdade).
function computeErrorCells() {
  const errors = new Set();
  const { size, solution } = game.puzzle;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (game.grid[r][c] === CellState.CAT && solution[r] !== c) {
        errors.add(`${r},${c}`);
      }
    }
  }
  return errors;
}

function triggerPlacedAnimation(r, c) {
  const btn = el("board").children[r * game.puzzle.size + c];
  btn.classList.remove("just-placed");
  void btn.offsetWidth; // força reflow para a animação poder tocar de novo na mesma célula
  btn.classList.add("just-placed");
}

// Células que um gato em (r,c) elimina pelas regras: mesma linha, mesma coluna, mesma região
// e as 8 vizinhas. Usado para marcar "✕" automaticamente ao confirmar um gato válido.
function handleCellActivate(r, c) {
  if (game.status !== "playing") return;
  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }

  const order = [CellState.UNKNOWN, CellState.CAT, CellState.EMPTY];
  const current = game.grid[r][c];
  const newState = order[(order.indexOf(current) + 1) % order.length];

  setCell(game, r, c, newState);
  afterMove();

  if (newState === CellState.CAT) {
    // A correção é checada SEMPRE contra a solução real (isCatPlacementCorrect), nunca apenas
    // pela consistência entre os gatos já marcados — ver o comentário em game-state.js para o
    // porquê isso importa. O jogo NÃO marca "✕" sozinho nas células eliminadas: isso é decisão
    // e risco do jogador, como marcar um "erro" no Batalha Naval — por pedido explícito.
    const isCorrect = isCatPlacementCorrect(game, r, c);
    triggerPlacedAnimation(r, c);
    if (isCorrect) {
      playCatSuccess();
    } else {
      playCatFail();
      onGameLost();
    }
  }
}

// Clique direito (desktop) ou toque longo (celular): marca/desmarca uma célula como vazia
// diretamente, sem precisar passar pelo gato no meio do ciclo normal.
function handleCellMarkEmpty(r, c) {
  if (game.status !== "playing") return;
  const current = game.grid[r][c];
  const next = current === CellState.EMPTY ? CellState.UNKNOWN : CellState.EMPTY;
  setCell(game, r, c, next);
  afterMove();
}

function handleCellKeydown(e, r, c) {
  const size = game.puzzle.size;
  const moves = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  };
  if (moves[e.key]) {
    e.preventDefault();
    const [dr, dc] = moves[e.key];
    const nr = Math.min(size - 1, Math.max(0, r + dr));
    const nc = Math.min(size - 1, Math.max(0, c + dc));
    focusCellAt(nr, nc);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handleCellActivate(r, c);
  } else if (e.key === "Backspace" || e.key === "Delete") {
    if (game.status !== "playing") return;
    e.preventDefault();
    setCell(game, r, c, CellState.UNKNOWN);
    afterMove();
  }
}

function focusCellAt(row, col) {
  const size = game.puzzle.size;
  const cells = el("board").children;
  cells[focusedCell.row * size + focusedCell.col].tabIndex = -1;
  focusedCell = { row, col };
  const target = cells[row * size + col];
  target.tabIndex = 0;
  target.focus();
}

function afterMove() {
  renderCellContents();
  updateCatsCounter();
  persistGame();
  if (checkWin(game)) {
    onGameWon();
  }
}

function updateCatsCounter() {
  const count = game.grid.flat().filter((s) => s === CellState.CAT).length;
  el("cats-counter").textContent = `${count} / ${game.puzzle.size} gatos`;
}

// ---------- Desfazer / Reiniciar ----------
el("btn-undo").addEventListener("click", () => {
  if (game.status !== "playing") return;
  if (undo(game)) afterMove();
});

el("btn-restart").addEventListener("click", () => {
  askConfirm("Reiniciar partida?", "Seu progresso nesta partida será perdido.", () => {
    game = createGameState(game.puzzle);
    persistGame();
    enterGameScreen();
  });
});

// ---------- Dicas ----------
el("btn-hint").addEventListener("click", () => {
  if (game.status !== "playing") return;
  const knownCats = [];
  for (let r = 0; r < game.puzzle.size; r++)
    for (let c = 0; c < game.puzzle.size; c++)
      if (game.grid[r][c] === CellState.CAT) knownCats.push([r, c]);

  recordHintUsed(game);
  const hint = getNextHint(game.puzzle, knownCats, game.hintCycle);
  const msgEl = el("hint-message");
  if (!hint) {
    msgEl.textContent = "Você já encontrou todas as pistas disponíveis!";
  } else {
    msgEl.textContent = `Dica ${hint.level}/3: ${hint.message}`;
  }
  msgEl.hidden = false;
  persistGame();
});

function hideHintMessage() {
  el("hint-message").hidden = true;
}

// ---------- Vitória ----------
function onGameWon() {
  stopTimer();
  const ms = elapsedMs(game);
  recordGameWon({ size: game.puzzle.size, elapsedMs: ms, hintsUsed: game.hintsUsed });
  removeItem(SAVE_KEY);

  const totalSeconds = Math.floor(ms / 1000);
  el("win-time").textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  el("win-hints").textContent = String(game.hintsUsed);
  openModal(modals.win);
}

el("btn-play-again").addEventListener("click", () => {
  closeModal();
  startNewGame();
});

// ---------- Fim de jogo (gato marcado quebra uma regra) ----------
function onGameLost() {
  game.status = "lost";
  stopTimer();
  removeItem(SAVE_KEY);
  openModal(modals.lose);
}

el("btn-lose-retry").addEventListener("click", () => {
  closeModal();
  game = createGameState(game.puzzle);
  persistGame();
  enterGameScreen();
});

el("btn-lose-menu").addEventListener("click", () => {
  closeModal();
  stopTimer();
  showScreen("start");
  refreshContinueBanner();
});

el("btn-share-result").addEventListener("click", async () => {
  const text = `Encontrei todos os gatos no ${GAME_NAME} (${game.puzzle.difficulty}) em ${el("win-time").textContent} usando ${game.hintsUsed} dica(s)!`;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      /* usuário cancelou o compartilhamento; cai para a cópia abaixo */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    el("btn-share-result").textContent = "Copiado!";
    setTimeout(() => (el("btn-share-result").textContent = "Compartilhar resultado"), 1500);
  } catch {
    /* sem clipboard disponível: nada mais a fazer silenciosamente */
  }
});

// ---------- Persistência da partida ----------
function persistGame() {
  setItem(SAVE_KEY, serializeGameState(game));
}

// ---------- Como jogar / Estatísticas ----------
el("btn-how-to-play").addEventListener("click", () => openModal(modals.howToPlay));

el("btn-stats").addEventListener("click", () => {
  const stats = loadStatistics();
  const bestTimes = Object.entries(stats.bestTimeMsBySize)
    .map(([size, ms]) => {
      const s = Math.floor(ms / 1000);
      return `<dt>Melhor tempo (${size}×${size})</dt><dd>${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}</dd>`;
    })
    .join("");
  el("stats-content").innerHTML = `
    <dt>Partidas iniciadas</dt><dd>${stats.gamesStarted}</dd>
    <dt>Partidas concluídas</dt><dd>${stats.gamesCompleted}</dd>
    <dt>Vitórias</dt><dd>${stats.wins}</dd>
    <dt>Dicas usadas (total)</dt><dd>${stats.hintsUsedTotal}</dd>
    ${bestTimes}
  `;
  openModal(modals.stats);
});

// ---------- Galeria de gatos + foto personalizada ----------
// O "skin" selecionado (padrão | um preset da galeria | "photo") decide só a aparência do
// marcador verde (gato confirmado sem erro); o vermelho de erro nunca é "pintado" com um
// personagem — continua sendo sempre a bolinha vermelha simples, como sinal universal de erro.
function buildCatGallery() {
  const gallery = el("cat-gallery");
  gallery.innerHTML = "";

  const options = [{ id: DEFAULT_SKIN_ID, name: "Padrão (sinal verde)", svg: null }, ...CAT_PRESETS];
  for (const option of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-gallery-option";
    btn.dataset.skinId = option.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-label", option.name);
    btn.innerHTML = option.svg
      ? option.svg()
      : `<span class="cat-gallery-default-dot" aria-hidden="true"></span>`;
    btn.addEventListener("click", async () => {
      setSelectedSkin(option.id);
      await refreshPersonalizePreview();
    });
    gallery.appendChild(btn);
  }
}

function highlightSelectedGalleryOption(selectedSkin) {
  for (const btn of el("cat-gallery").children) {
    const isSelected = btn.dataset.skinId === selectedSkin;
    btn.classList.toggle("selected", isSelected);
    btn.setAttribute("aria-checked", String(isSelected));
  }
}

async function refreshPersonalizePreview() {
  const blob = await loadCustomImage();
  if (customCatImageUrl) {
    URL.revokeObjectURL(customCatImageUrl);
    customCatImageUrl = null;
  }
  if (blob) customCatImageUrl = URL.createObjectURL(blob);

  const selectedSkin = getSelectedSkin();
  const img = el("personalize-preview-img");
  const placeholder = el("personalize-preview-placeholder");

  if (selectedSkin === "photo" && customCatImageUrl) {
    img.src = customCatImageUrl;
    img.hidden = false;
    placeholder.hidden = true;
    placeholder.innerHTML = "";
  } else {
    img.hidden = true;
    const preset = getPresetById(selectedSkin);
    placeholder.innerHTML = preset ? preset.svg() : '<span class="marker-circle marker-circle--ok"></span>';
    placeholder.hidden = false;
  }

  highlightSelectedGalleryOption(selectedSkin === "photo" && !customCatImageUrl ? DEFAULT_SKIN_ID : selectedSkin);
  if (game) renderCellContents();
}

el("btn-personalize").addEventListener("click", async () => {
  el("personalize-error").hidden = true;
  await refreshPersonalizePreview();
  openModal(modals.personalize);
});

el("personalize-file-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  const errorEl = el("personalize-error");
  errorEl.hidden = true;
  if (!file) return;
  const check = validateImageFile(file);
  if (!check.valid) {
    errorEl.textContent = check.reason;
    errorEl.hidden = false;
    e.target.value = "";
    return;
  }
  const persist = el("personalize-persist-checkbox").checked;
  await saveCustomImage(file, { persist });
  setSelectedSkin("photo");
  await refreshPersonalizePreview();
});

el("btn-personalize-remove").addEventListener("click", async () => {
  await removeCustomImage();
  el("personalize-file-input").value = "";
  if (getSelectedSkin() === "photo") setSelectedSkin(DEFAULT_SKIN_ID);
  await refreshPersonalizePreview();
});

// ---------- Carregamento inicial ----------
buildCatGallery();
refreshPersonalizePreview();
