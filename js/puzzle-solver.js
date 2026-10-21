// Solucionador independente do gerador. Usa backtracking linha-a-linha e também
// uma simulação de dedução lógica (sem "chute") usada por hints.js e pela estimativa de dificuldade.
import { isPlacementValid, violatesAdjacency, inBounds } from "./rules.js";

// Retorna até `limit` soluções (array de arrays cats[row] = col). Usado para checar unicidade.
export function solveBacktracking(size, regions, limit = 2, stepBudget = 2_000_000) {
  const solutions = [];
  const cats = new Array(size).fill(-1);
  let steps = 0;

  function backtrack(row) {
    if (solutions.length >= limit) return;
    steps++;
    if (steps > stepBudget) return;
    if (row === size) {
      solutions.push(cats.slice());
      return;
    }
    for (let col = 0; col < size; col++) {
      if (!isPlacementValid(size, regions, cats, row, col)) continue;
      cats[row] = col;
      backtrack(row + 1);
      cats[row] = -1;
      if (solutions.length >= limit) return;
    }
  }

  backtrack(0);
  return { solutions, steps, truncated: steps > stepBudget };
}

export function countSolutions(size, regions, limit = 2) {
  return solveBacktracking(size, regions, limit).solutions.length;
}

// Simulação de dedução "humana": elimina candidatos usando as regras (linha/coluna/região/vizinhança)
// e fixa células que ficam como única candidata em sua linha, coluna ou região. Não faz suposições.
// Retorna o estado final das candidaturas e quantos gatos foram deduzidos sem backtracking.
export function solveByLogic(size, regions, knownCats = []) {
  // possible[r][c] = true enquanto a célula não foi eliminada como candidata a gato.
  const possible = Array.from({ length: size }, () => new Array(size).fill(true));
  const placed = Array.from({ length: size }, () => new Array(size).fill(false));
  const rowSolved = new Array(size).fill(false);
  const colSolved = new Array(size).fill(false);
  const regionSolved = new Array(size).fill(false);

  function eliminateAround(r, c) {
    for (let cc = 0; cc < size; cc++) if (cc !== c) possible[r][cc] = false;
    for (let rr = 0; rr < size; rr++) if (rr !== r) possible[rr][c] = false;
    const regionId = regions[r][c];
    for (let rr = 0; rr < size; rr++) {
      for (let cc = 0; cc < size; cc++) {
        if (regions[rr][cc] === regionId && !(rr === r && cc === c)) possible[rr][cc] = false;
      }
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (inBounds(size, rr, cc)) possible[rr][cc] = false;
      }
    }
    possible[r][c] = true;
    rowSolved[r] = true;
    colSolved[c] = true;
    regionSolved[regionId] = true;
  }

  function place(r, c) {
    if (placed[r][c]) return false;
    placed[r][c] = true;
    eliminateAround(r, c);
    return true;
  }

  for (const [r, c] of knownCats) place(r, c);

  let progress = true;
  let deductions = 0;
  while (progress) {
    progress = false;

    for (let r = 0; r < size; r++) {
      if (rowSolved[r]) continue;
      const cands = [];
      for (let c = 0; c < size; c++) if (possible[r][c]) cands.push(c);
      if (cands.length === 1) {
        place(r, cands[0]);
        deductions++;
        progress = true;
      }
    }

    for (let c = 0; c < size; c++) {
      if (colSolved[c]) continue;
      const cands = [];
      for (let r = 0; r < size; r++) if (possible[r][c]) cands.push(r);
      if (cands.length === 1) {
        place(cands[0], c);
        deductions++;
        progress = true;
      }
    }

    for (let regionId = 0; regionId < size; regionId++) {
      if (regionSolved[regionId]) continue;
      const cands = [];
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (regions[r][c] === regionId && possible[r][c]) cands.push([r, c]);
      if (cands.length === 1) {
        place(cands[0][0], cands[0][1]);
        deductions++;
        progress = true;
      }
    }
  }

  const solvedCount = rowSolved.filter(Boolean).length;
  return {
    possible,
    placed,
    solvedFullyByLogic: solvedCount === size,
    deductions,
  };
}

// Verifica se colocar um gato em (row,col) ainda é consistente com uma solução final válida
// a partir do estado atual de gatos já fixados pelo jogador (usado pelo sistema de dicas).
export function isConsistentWithSomeSolution(size, regions, partialCats) {
  const cats = new Array(size).fill(-1);
  for (const [r, c] of partialCats) cats[r] = c;

  function backtrack(row) {
    if (row === size) return true;
    if (cats[row] !== -1) {
      return isRowChoiceValid(row, cats[row]) && backtrack(row + 1);
    }
    for (let col = 0; col < size; col++) {
      if (!isRowChoiceValid(row, col)) continue;
      cats[row] = col;
      if (backtrack(row + 1)) return true;
      cats[row] = -1;
    }
    return false;
  }

  function isRowChoiceValid(row, col) {
    const used = new Array(row).fill(0).map((_, r) => cats[r]);
    for (let r = 0; r < row; r++) {
      const c = used[r];
      if (c === -1) continue;
      if (c === col) return false;
      if (regions[r][c] === regions[row][col]) return false;
      if (violatesAdjacency(r, c, row, col)) return false;
    }
    return true;
  }

  return backtrack(0);
}
