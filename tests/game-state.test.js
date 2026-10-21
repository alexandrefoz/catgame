import { test, assert, assertEqual } from "./harness.mjs";
import {
  createGameState, setCell, setCellsBatch, cycleCell, undo, checkWin,
  getCatCells, isCatPlacementCorrect, CellState,
} from "../js/game-state.js";

// Puzzle 5x5 trivial (regiões por coluna), com a mesma solução válida usada em rules.test.js —
// só para testar o estado de jogo em isolamento. Um tabuleiro 3x3 não serviria aqui: é
// matematicamente impossível ter uma permutação 3x3 que satisfaça linha+coluna+adjacência ao
// mesmo tempo (toda permutação de 3 colunas tem algum par de linhas consecutivas vizinhas).
function trivialPuzzle() {
  const size = 5;
  return {
    size,
    regions: Array.from({ length: size }, () => [0, 1, 2, 3, 4]),
    solution: [2, 4, 1, 3, 0],
    difficulty: "facil",
  };
}

test("createGameState: começa com tabuleiro todo 'unknown' e status 'playing'", () => {
  const state = createGameState(trivialPuzzle());
  assertEqual(state.status, "playing");
  assert(state.grid.every((row) => row.every((cell) => cell === CellState.UNKNOWN)));
});

test("setCell: muda uma célula e registra no histórico", () => {
  const state = createGameState(trivialPuzzle());
  setCell(state, 0, 0, CellState.CAT);
  assertEqual(state.grid[0][0], CellState.CAT);
  assertEqual(state.history.length, 1);
});

test("setCell: não registra histórico quando o valor não muda", () => {
  const state = createGameState(trivialPuzzle());
  setCell(state, 0, 0, CellState.UNKNOWN); // já é unknown
  assertEqual(state.history.length, 0);
});

test("cycleCell: percorre unknown -> cat -> empty -> unknown", () => {
  const state = createGameState(trivialPuzzle());
  cycleCell(state, 1, 1);
  assertEqual(state.grid[1][1], CellState.CAT);
  cycleCell(state, 1, 1);
  assertEqual(state.grid[1][1], CellState.EMPTY);
  cycleCell(state, 1, 1);
  assertEqual(state.grid[1][1], CellState.UNKNOWN);
});

test("setCellsBatch: aplica várias mudanças como uma única entrada de histórico", () => {
  const state = createGameState(trivialPuzzle());
  setCellsBatch(state, [
    { row: 0, col: 0, newValue: CellState.CAT },
    { row: 0, col: 1, newValue: CellState.EMPTY },
    { row: 0, col: 2, newValue: CellState.EMPTY },
  ]);
  assertEqual(state.grid[0][0], CellState.CAT);
  assertEqual(state.grid[0][1], CellState.EMPTY);
  assertEqual(state.grid[0][2], CellState.EMPTY);
  assertEqual(state.history.length, 1, "um lote inteiro deve virar uma única entrada no histórico");
});

test("setCellsBatch: ignora mudanças que não alteram o valor atual e não cria histórico vazio", () => {
  const state = createGameState(trivialPuzzle());
  setCellsBatch(state, [{ row: 0, col: 0, newValue: CellState.UNKNOWN }]);
  assertEqual(state.history.length, 0);
});

test("undo: reverte uma mudança simples", () => {
  const state = createGameState(trivialPuzzle());
  setCell(state, 0, 0, CellState.CAT);
  const reverted = undo(state);
  assert(reverted);
  assertEqual(state.grid[0][0], CellState.UNKNOWN);
});

test("undo: reverte um lote inteiro (gato + marcações automáticas) em uma única chamada", () => {
  const state = createGameState(trivialPuzzle());
  setCellsBatch(state, [
    { row: 0, col: 0, newValue: CellState.CAT },
    { row: 0, col: 1, newValue: CellState.EMPTY },
    { row: 0, col: 2, newValue: CellState.EMPTY },
  ]);
  undo(state);
  assertEqual(state.grid[0][0], CellState.UNKNOWN);
  assertEqual(state.grid[0][1], CellState.UNKNOWN);
  assertEqual(state.grid[0][2], CellState.UNKNOWN);
});

test("undo: em histórico vazio retorna false e não quebra", () => {
  const state = createGameState(trivialPuzzle());
  assertEqual(undo(state), false);
});

test("undo: múltiplas ações desfazem na ordem inversa (pilha), cada uma isoladamente", () => {
  const state = createGameState(trivialPuzzle());
  setCell(state, 0, 0, CellState.CAT); // ação 1
  setCellsBatch(state, [
    { row: 1, col: 1, newValue: CellState.CAT },
    { row: 1, col: 0, newValue: CellState.EMPTY },
  ]); // ação 2 (lote)

  undo(state); // desfaz só a ação 2 (o lote)
  assertEqual(state.grid[1][1], CellState.UNKNOWN);
  assertEqual(state.grid[1][0], CellState.UNKNOWN);
  assertEqual(state.grid[0][0], CellState.CAT, "ação 1 não deveria ter sido afetada ainda");

  undo(state); // agora desfaz a ação 1
  assertEqual(state.grid[0][0], CellState.UNKNOWN);
});

test("checkWin: vitória só quando os gatos marcados satisfazem todas as regras", () => {
  const state = createGameState(trivialPuzzle());
  // solução válida do fixture: linha 0->col2, 1->col4, 2->col1, 3->col3, 4->col0
  setCell(state, 0, 2, CellState.CAT);
  setCell(state, 1, 4, CellState.CAT);
  assertEqual(checkWin(state), false, "só 2 de 5 gatos marcados ainda não é vitória");

  setCell(state, 2, 1, CellState.CAT);
  setCell(state, 3, 3, CellState.CAT);
  setCell(state, 4, 0, CellState.CAT);
  assertEqual(checkWin(state), true);
  assertEqual(state.status, "won");
});

test("checkWin: 5 gatos que quebram uma regra (adjacência) não vencem", () => {
  const state = createGameState(trivialPuzzle());
  // linhas 0 e 1 com colunas vizinhas (0 e 1) quebram a regra de adjacência mesmo preenchendo tudo.
  setCell(state, 0, 0, CellState.CAT);
  setCell(state, 1, 1, CellState.CAT);
  setCell(state, 2, 2, CellState.CAT);
  setCell(state, 3, 3, CellState.CAT);
  setCell(state, 4, 4, CellState.CAT);
  assertEqual(checkWin(state), false);
  assertEqual(state.status, "playing");
});

test("isCatPlacementCorrect: só é true na célula exata da solução para aquela linha", () => {
  const state = createGameState(trivialPuzzle());
  // solução: linha 0 -> col2
  assertEqual(isCatPlacementCorrect(state, 0, 2), true);
  assertEqual(isCatPlacementCorrect(state, 0, 0), false);
  assertEqual(isCatPlacementCorrect(state, 0, 4), false);
});

// Regressão: um bug real encontrado em produção. A checagem antiga só validava se os gatos já
// marcados eram consistentes ENTRE SI (sem repetir linha/coluna/região, sem vizinhança) — mas
// isso não garante que sejam a solução real. É possível marcar dois gatos que não conflitam
// entre si e, mesmo assim, nenhum dos dois pertencer à solução, deixando o jogo "travado" sem
// vitória nem derrota. A correção exige comparar sempre contra `puzzle.solution`.
test("checkWin: gatos que não conflitam entre si mas não são a solução real não vencem (regressão)", () => {
  const state = createGameState(trivialPuzzle());
  // solução real: [2, 4, 1, 3, 0]. Os gatos abaixo são estruturalmente não-conflitantes entre
  // si (linhas, colunas, regiões e vizinhança todas diferentes/ok) mas NENHUM bate com a solução.
  setCell(state, 0, 0, CellState.CAT); // solução pede col2
  setCell(state, 2, 3, CellState.CAT); // solução pede col1
  assertEqual(isCatPlacementCorrect(state, 0, 0), false);
  assertEqual(isCatPlacementCorrect(state, 2, 3), false);
  assertEqual(checkWin(state), false, "gatos não-conflitantes mas incorretos nunca devem vencer");
  assertEqual(state.status, "playing");
});

test("checkWin: um gato correto a mais do que a solução (fora da linha certa) não vence", () => {
  const state = createGameState(trivialPuzzle());
  setCell(state, 0, 2, CellState.CAT); // correto
  setCell(state, 1, 4, CellState.CAT); // correto
  setCell(state, 2, 1, CellState.CAT); // correto
  setCell(state, 3, 3, CellState.CAT); // correto
  setCell(state, 4, 2, CellState.CAT); // ERRADO: solução pede col0 na linha 4, col2 já está ocupado na linha 0
  assertEqual(checkWin(state), false);
});

test("getCatCells: retorna exatamente as células marcadas como gato", () => {
  const state = createGameState(trivialPuzzle());
  setCell(state, 0, 0, CellState.CAT);
  setCell(state, 2, 2, CellState.CAT);
  setCell(state, 1, 1, CellState.EMPTY);
  const cats = getCatCells(state);
  assertEqual(cats.size, 2);
  assert(cats.has("0,0"));
  assert(cats.has("2,2"));
});
