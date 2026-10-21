import { generatePuzzle } from "./board-generator.js";
import {
  createGameState, cycleCell, setCell, undo, checkWin, elapsedMs,
  recordHintUsed, serializeGameState, deserializeGameState, CellState,
} from "./game-state.js";
import { getNextHint } from "./hints.js";
import { getItem, setItem, removeItem } from "./storage.js";
import { loadStatistics, recordGameStarted, recordGameWon } from "./statistics.js";
import {
  saveCustomImage, loadCustomImage, removeCustomImage, validateImageFile,
} from "./image-personalization.js";
import { violatesAdjacency } from "./rules.js";
import { playCatSuccess, playCatFail, isMuted, toggleMuted } from "./sound.js";

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
      btn.classList.toggle("error", errorCells.has(`${r},${c}`));
      btn.innerHTML = "";
      let label = `Linha ${r + 1}, coluna ${c + 1}, região ${game.puzzle.regions[r][c] + 1}. `;
      if (state === CellState.CAT) {
        if (customCatImageUrl) {
          const img = document.createElement("img");
          img.className = "cat-img";
          img.src = customCatImageUrl;
          img.alt = "";
          btn.appendChild(img);
        } else {
          btn.textContent = "🐱";
        }
        label += "Gato marcado.";
      } else if (state === CellState.EMPTY) {
        const mark = document.createElement("span");
        mark.className = "mark-empty";
        btn.appendChild(mark);
        label += "Marcada como vazia.";
      } else {
        label += "Vazia, sem marcação.";
      }
      btn.setAttribute("aria-label", label);
    }
  }
}

function computeErrorCells() {
  const errors = new Set();
  const size = game.puzzle.size;
  const cats = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (game.grid[r][c] === CellState.CAT) cats.push([r, c]);

  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const [r1, c1] = cats[i];
      const [r2, c2] = cats[j];
      const sameRow = r1 === r2;
      const sameCol = c1 === c2;
      const sameRegion = game.puzzle.regions[r1][c1] === game.puzzle.regions[r2][c2];
      const adjacent = violatesAdjacency(r1, c1, r2, c2);
      if (sameRow || sameCol || sameRegion || adjacent) {
        errors.add(`${r1},${c1}`);
        errors.add(`${r2},${c2}`);
      }
    }
  }
  return errors;
}

// Verifica se colocar um gato em (r,c) quebra alguma regra em relação aos gatos já marcados
// pelo jogador (linha, coluna, região ou vizinhança). Usado só para a célula recém-marcada —
// não precisa varrer conflitos entre pares antigos, pois cada marcação já é checada na hora.
function placementConflicts(r, c) {
  const { size, regions } = game.puzzle;
  for (let rr = 0; rr < size; rr++) {
    for (let cc = 0; cc < size; cc++) {
      if (rr === r && cc === c) continue;
      if (game.grid[rr][cc] !== CellState.CAT) continue;
      const sameRow = rr === r;
      const sameCol = cc === c;
      const sameRegion = regions[rr][cc] === regions[r][c];
      const adjacent = violatesAdjacency(rr, cc, r, c);
      if (sameRow || sameCol || sameRegion || adjacent) return true;
    }
  }
  return false;
}

function triggerPlacedAnimation(r, c) {
  const btn = el("board").children[r * game.puzzle.size + c];
  btn.classList.remove("just-placed");
  void btn.offsetWidth; // força reflow para a animação poder tocar de novo na mesma célula
  btn.classList.add("just-placed");
}

function handleCellActivate(r, c) {
  if (game.status !== "playing") return;
  cycleCell(game, r, c);
  const newState = game.grid[r][c];
  afterMove();
  if (newState === CellState.CAT) {
    triggerPlacedAnimation(r, c);
    if (placementConflicts(r, c)) {
      playCatFail();
      onGameLost();
    } else {
      playCatSuccess();
    }
  }
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

// ---------- Personalização de imagem ----------
async function refreshPersonalizePreview() {
  const blob = await loadCustomImage();
  const img = el("personalize-preview-img");
  const placeholder = el("personalize-preview-placeholder");
  if (blob) {
    if (customCatImageUrl) URL.revokeObjectURL(customCatImageUrl);
    customCatImageUrl = URL.createObjectURL(blob);
    img.src = customCatImageUrl;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    customCatImageUrl = null;
    img.hidden = true;
    placeholder.hidden = false;
  }
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
  await refreshPersonalizePreview();
});

el("btn-personalize-remove").addEventListener("click", async () => {
  await removeCustomImage();
  el("personalize-file-input").value = "";
  await refreshPersonalizePreview();
});

// ---------- Carregamento inicial ----------
refreshPersonalizePreview();
