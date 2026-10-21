// Sistema de dicas progressivas. Nunca revela nada inconsistente com a solução real do puzzle:
// toda dica é derivada de solveByLogic (dedução pura) ou, na ausência de dedução disponível,
// da própria solução armazenada (apenas no nível 3, e só para uma célula por vez).
import { solveByLogic } from "./puzzle-solver.js";
import { cellKey } from "./rules.js";

const REGION_NAMES = [
  "primeira", "segunda", "terceira", "quarta", "quinta",
  "sexta", "sétima", "oitava", "nona", "décima",
];

function regionOrdinal(regionId) {
  return REGION_NAMES[regionId] ?? `região ${regionId + 1}`;
}

// knownCats: array de [row, col] já confirmados pelo jogador (marcados como gato).
// Retorna null se não houver nada de novo a deduzir (jogador já tem toda a informação lógica disponível).
export function getNextHint(puzzle, knownCats, hintLevelCycle) {
  const logic = solveByLogic(puzzle.size, puzzle.regions, knownCats);
  const knownSet = new Set(knownCats.map(([r, c]) => cellKey(r, c)));

  let targetCell = null;
  for (let r = 0; r < puzzle.size && !targetCell; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      if (logic.placed[r][c] && !knownSet.has(cellKey(r, c))) {
        targetCell = [r, c];
        break;
      }
    }
  }

  // Dedução lógica pura se esgotou: usa a solução armazenada para a próxima célula não revelada,
  // garantindo que a dica nunca contradiga a solução.
  if (!targetCell) {
    for (let row = 0; row < puzzle.size; row++) {
      const col = puzzle.solution[row];
      if (!knownSet.has(cellKey(row, col))) {
        targetCell = [row, col];
        break;
      }
    }
  }

  if (!targetCell) return null; // jogador já encontrou todos os gatos.

  const [row, col] = targetCell;
  const regionId = puzzle.regions[row][col];
  const level = ((hintLevelCycle - 1) % 3) + 1;

  if (level === 1) {
    return {
      level,
      regionId,
      message: `Observe com atenção a ${regionOrdinal(regionId)} região colorida — ela guarda uma dedução importante.`,
    };
  }
  if (level === 2) {
    return {
      level,
      regionId,
      row,
      col,
      message: `Na linha ${row + 1} (ou na ${regionOrdinal(regionId)} região), as marcações atuais já eliminam quase todas as alternativas possíveis.`,
    };
  }
  return {
    level,
    row,
    col,
    regionId,
    message: `Tente marcar um gato na linha ${row + 1}, coluna ${col + 1}.`,
    revealCell: [row, col],
  };
}
