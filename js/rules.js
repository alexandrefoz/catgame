// Regras centralizadas da variante "um gato por linha, coluna e região; sem vizinhos, inclusive diagonal".
// Mantidas isoladas da interface e dos algoritmos de geração/solução para permitir ajuste futuro de modalidade.

export const RULESET = Object.freeze({
  oneCatPerRow: true,
  oneCatPerColumn: true,
  oneCatPerRegion: true,
  noAdjacentIncludingDiagonal: true,
});

export function inBounds(size, r, c) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

// Como há exatamente um gato por linha, dois gatos só podem ser adjacentes
// (inclusive na diagonal) se estiverem em linhas consecutivas.
export function violatesAdjacency(rowA, colA, rowB, colB) {
  return Math.abs(rowA - rowB) <= 1 && Math.abs(colA - colB) <= 1 && !(rowA === rowB && colA === colB);
}

// cats: array indexado por linha -> coluna (ou -1/undefined se ainda não definido).
// Verifica se colocar um gato em (row, col) é consistente com os gatos já colocados em linhas anteriores.
export function isPlacementValid(size, regions, cats, row, col) {
  if (!inBounds(size, row, col)) return false;
  for (let r = 0; r < row; r++) {
    const c = cats[r];
    if (c === undefined || c === -1) continue;
    if (RULESET.oneCatPerColumn && c === col) return false;
    if (RULESET.oneCatPerRegion && regions[r][c] === regions[row][col]) return false;
    if (RULESET.noAdjacentIncludingDiagonal && violatesAdjacency(r, c, row, col)) return false;
  }
  return true;
}

// Valida uma solução completa (array cats[row] = col) contra todas as regras.
export function validateFullSolution(size, regions, cats) {
  if (!Array.isArray(cats) || cats.length !== size) return false;
  const usedCols = new Set();
  const usedRegions = new Set();
  for (let row = 0; row < size; row++) {
    const col = cats[row];
    if (!inBounds(size, row, col)) return false;
    if (usedCols.has(col)) return false;
    usedCols.add(col);
    const regionId = regions[row][col];
    if (usedRegions.has(regionId)) return false;
    usedRegions.add(regionId);
    if (row > 0) {
      const prevCol = cats[row - 1];
      if (violatesAdjacency(row - 1, prevCol, row, col)) return false;
    }
  }
  return usedRegions.size === size;
}

// Valida um conjunto arbitrário de células marcadas como gato (Set de "r,c") vindo do jogador.
export function validatePlayerCats(size, regions, catCellsSet) {
  if (catCellsSet.size !== size) return false;
  const rows = new Set();
  const cols = new Set();
  const regionIds = new Set();
  const cells = [...catCellsSet].map((key) => key.split(",").map(Number));
  for (const [r, c] of cells) {
    if (!inBounds(size, r, c)) return false;
    if (rows.has(r)) return false;
    if (cols.has(c)) return false;
    rows.add(r);
    cols.add(c);
    const regionId = regions[r][c];
    if (regionIds.has(regionId)) return false;
    regionIds.add(regionId);
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [r1, c1] = cells[i];
      const [r2, c2] = cells[j];
      if (violatesAdjacency(r1, c1, r2, c2)) return false;
    }
  }
  return rows.size === size && cols.size === size && regionIds.size === size;
}

export function cellKey(r, c) {
  return `${r},${c}`;
}
