// Estado de uma partida: marcações do jogador, histórico para desfazer, cronômetro e dicas.
// Desacoplado da interface - app.js é quem traduz eventos de toque/clique em chamadas aqui.
import { validatePlayerCats, cellKey } from "./rules.js";

export const CellState = Object.freeze({
  UNKNOWN: "unknown",
  CAT: "cat",
  EMPTY: "empty",
});

export function createGameState(puzzle) {
  const grid = Array.from({ length: puzzle.size }, () => new Array(puzzle.size).fill(CellState.UNKNOWN));
  return {
    puzzle,
    grid,
    history: [],
    hintsUsed: 0,
    hintCycle: 0,
    startedAt: Date.now(),
    elapsedMsAtPause: 0,
    paused: false,
    status: "playing", // "playing" | "won"
  };
}

export function setCell(state, row, col, newValue) {
  const prevValue = state.grid[row][col];
  if (prevValue === newValue) return state;
  state.history.push({ row, col, prevValue });
  state.grid[row][col] = newValue;
  return state;
}

export function cycleCell(state, row, col) {
  const order = [CellState.UNKNOWN, CellState.CAT, CellState.EMPTY];
  const current = state.grid[row][col];
  const next = order[(order.indexOf(current) + 1) % order.length];
  return setCell(state, row, col, next);
}

export function undo(state) {
  const last = state.history.pop();
  if (!last) return false;
  state.grid[last.row][last.col] = last.prevValue;
  return true;
}

export function getCatCells(state) {
  const cats = new Set();
  for (let r = 0; r < state.puzzle.size; r++) {
    for (let c = 0; c < state.puzzle.size; c++) {
      if (state.grid[r][c] === CellState.CAT) cats.add(cellKey(r, c));
    }
  }
  return cats;
}

export function checkWin(state) {
  const cats = getCatCells(state);
  const won = validatePlayerCats(state.puzzle.size, state.puzzle.regions, cats);
  if (won) state.status = "won";
  return won;
}

export function elapsedMs(state) {
  if (state.paused) return state.elapsedMsAtPause;
  return state.elapsedMsAtPause + (Date.now() - state.startedAt);
}

export function recordHintUsed(state) {
  state.hintsUsed += 1;
  state.hintCycle += 1;
}

// Representação serializável para persistência em localStorage (sem funções, sets ou datas vivas).
export function serializeGameState(state) {
  return {
    puzzle: state.puzzle,
    grid: state.grid,
    hintsUsed: state.hintsUsed,
    hintCycle: state.hintCycle,
    elapsedMs: elapsedMs(state),
    status: state.status,
  };
}

export function deserializeGameState(data) {
  return {
    puzzle: data.puzzle,
    grid: data.grid,
    history: [],
    hintsUsed: data.hintsUsed ?? 0,
    hintCycle: data.hintCycle ?? 0,
    startedAt: Date.now(),
    elapsedMsAtPause: data.elapsedMs ?? 0,
    paused: true,
    status: data.status ?? "playing",
  };
}
