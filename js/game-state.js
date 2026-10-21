// Estado de uma partida: marcações do jogador, histórico para desfazer, cronômetro e dicas.
// Desacoplado da interface - app.js é quem traduz eventos de toque/clique em chamadas aqui.
import { cellKey } from "./rules.js";

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

// Cada entrada do histórico é um lote de células ({row, col, prevValue}[]) para que ações com
// efeito colateral (ex: marcar um gato e já eliminar a linha/coluna/região ao redor) desfaçam
// tudo de uma vez só, em um único "desfazer" — e não uma célula por vez.
export function setCell(state, row, col, newValue) {
  const prevValue = state.grid[row][col];
  if (prevValue === newValue) return state;
  state.history.push({ cells: [{ row, col, prevValue }] });
  state.grid[row][col] = newValue;
  return state;
}

export function setCellsBatch(state, changes) {
  const cells = [];
  for (const { row, col, newValue } of changes) {
    const prevValue = state.grid[row][col];
    if (prevValue === newValue) continue;
    cells.push({ row, col, prevValue });
    state.grid[row][col] = newValue;
  }
  if (cells.length > 0) state.history.push({ cells });
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
  for (const { row, col, prevValue } of last.cells) {
    state.grid[row][col] = prevValue;
  }
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

// Um gato só é correto se bater exatamente com a solução gerada para aquela linha.
// Importante: NÃO basta checar consistência estrutural entre os gatos já marcados
// (sem repetir linha/coluna/região, sem vizinhança) — é perfeitamente possível marcar
// gatos que não conflitam entre si mas que, mesmo assim, não são os da solução real
// (a garantia de solução única vale para o conjunto completo de N gatos, não para
// qualquer subconjunto parcial estruturalmente válido). Por isso a comparação é
// sempre feita direto contra `puzzle.solution`, nunca inferida pelas regras sozinhas.
export function isCatPlacementCorrect(state, row, col) {
  return state.puzzle.solution[row] === col;
}

export function checkWin(state) {
  const { size, solution } = state.puzzle;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isCat = state.grid[r][c] === CellState.CAT;
      const shouldBeCat = solution[r] === c;
      if (isCat !== shouldBeCat) return false;
    }
  }
  state.status = "won";
  return true;
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
