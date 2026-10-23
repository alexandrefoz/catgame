// Gerador de puzzles. Componente crítico: nunca aceita um tabuleiro sem solução
// ou com múltiplas soluções (a unicidade é sempre exigida nesta variante).
//
// Decisão de design (documentada por ser não-óbvia): regiões NÃO são desenhadas a partir
// de uma solução escolhida antecipadamente. Tentar "encaixar" regiões em torno de uma solução
// fixa quase sempre produz soluções alternativas por acaso (testado empiricamente: regiões
// genéricas raramente isolam uma permutação específica). Em vez disso, as regiões nascem de
// sementes aleatórias independentes e a solução emerge de resolver o tabuleiro resultante —
// se o solver encontrar exatamente uma solução, ela se torna a solução do puzzle.
import { mulberry32, seedFromString, randomSeed, shuffle, pickInt } from "./rng.js";
import { solveBacktracking, solveByLogic } from "./puzzle-solver.js";
import { FALLBACK_PUZZLES } from "./fallback-puzzles.js";

export const DIFFICULTY_SIZES = Object.freeze({
  facil: 5,
  medio: 7,
  dificil: 9,
});

const RANDOM_ATTEMPTS_BY_SIZE = { 5: 1500, 7: 2500, 9: 6000 };
const REPAIR_ITERATIONS_BY_SIZE = { 5: 0, 7: 150, 9: 700 };
const MIN_CELLS_PER_REGION = 4;

function allCells(size) {
  const cells = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push([r, c]);
  return cells;
}

function randomDistinctSeeds(size, rng) {
  return shuffle(allCells(size), rng).slice(0, size);
}

// Flood-fill multi-origem: a cada rodada recalcula as arestas (célula atribuída -> vizinha livre)
// e resolve todas em ordem aleatória. Sempre termina cobrindo o tabuleiro (grade é conectada).
function growRegionsFromSeeds(size, seedCells, rng) {
  const regions = Array.from({ length: size }, () => new Array(size).fill(-1));
  seedCells.forEach(([r, c], regionId) => {
    regions[r][c] = regionId;
  });

  let remaining = size * size - size;
  while (remaining > 0) {
    const edges = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] === -1) continue;
        for (const [nr, nc] of neighbors4(r, c)) {
          if (!inBounds(size, nr, nc) || regions[nr][nc] !== -1) continue;
          edges.push({ regionId: regions[r][c], nr, nc });
        }
      }
    }
    if (edges.length === 0) break;

    // Primeiro completa as regiões menores. Isso impede que uma cor termine com
    // apenas uma ou duas casas e deixa a abertura do puzzle menos óbvia.
    const counts = Array.from({ length: size }, (_, regionId) => regionCellCount(regions, size, regionId));
    const minimumEdges = edges.filter(({ regionId }) => counts[regionId] < MIN_CELLS_PER_REGION);
    const candidates = minimumEdges.length > 0 ? minimumEdges : edges;
    const { regionId, nr, nc } = candidates[pickInt(rng, 0, candidates.length - 1)];
    if (regions[nr][nc] !== -1) continue;
    regions[nr][nc] = regionId;
    remaining--;
  }
  return regions;
}

function inBounds(size, r, c) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function neighbors4(r, c) {
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
}

function regionCellCount(regions, size, regionId) {
  let n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (regions[r][c] === regionId) n++;
  return n;
}

function regionsHaveMinimumSize(regions, size, minimum = MIN_CELLS_PER_REGION) {
  for (let regionId = 0; regionId < size; regionId++) {
    if (regionCellCount(regions, size, regionId) < minimum) return false;
  }
  return true;
}

function isRegionConnectedWithout(regions, size, regionId, excludeR, excludeC) {
  let start = null;
  for (let r = 0; r < size && !start; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === regionId && !(r === excludeR && c === excludeC)) {
        start = [r, c];
        break;
      }
    }
  }
  const total = regionCellCount(regions, size, regionId) - 1;
  if (total === 0) return true;
  if (!start) return false;

  const seen = new Set([`${start[0]},${start[1]}`]);
  const stack = [start];
  let count = 1;
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors4(r, c)) {
      if (!inBounds(size, nr, nc)) continue;
      if (nr === excludeR && nc === excludeC) continue;
      if (regions[nr][nc] !== regionId) continue;
      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      count++;
      stack.push([nr, nc]);
    }
  }
  return count === total;
}

// Busca local (hill-climbing com reinícios): move células de borda entre regiões vizinhas,
// mantendo as duas regiões conectadas e não-vazias, para reduzir o número de soluções até 1.
// Aceita movimentos que não piorem a contagem para escapar de mínimos locais rasos.
function repairTowardsUniqueness(size, initialRegions, rng, iterations) {
  let current = initialRegions;
  let currentCount = solveBacktracking(size, current, 4).solutions.length;
  let best = current;
  let bestCount = currentCount;

  for (let i = 0; i < iterations && bestCount !== 1; i++) {
    const [r, c] = allCells(size)[pickInt(rng, 0, size * size - 1)];
    const myRegion = current[r][c];
    const dirs = shuffle(neighbors4(r, c), rng);

    for (const [nr, nc] of dirs) {
      if (!inBounds(size, nr, nc)) continue;
      const otherRegion = current[nr][nc];
      if (otherRegion === myRegion) continue;
      if (regionCellCount(current, size, myRegion) <= 1) continue;
      if (!isRegionConnectedWithout(current, size, myRegion, r, c)) continue;

      const trial = current.map((row) => row.slice());
      trial[r][c] = otherRegion;
      const trialCount = solveBacktracking(size, trial, 4).solutions.length;
      if (trialCount === 0) continue; // nunca aceitar um tabuleiro sem solução.
      if (trialCount <= currentCount) {
        current = trial;
        currentCount = trialCount;
        if (currentCount < bestCount) {
          best = current;
          bestCount = currentCount;
        }
        break;
      }
    }
  }

  return { regions: best, solutionCount: bestCount };
}

function buildPuzzleResult(size, regions, solution, seed, difficulty) {
  const logic = solveByLogic(size, regions);
  return {
    size,
    regions,
    solution,
    seed,
    difficulty,
    deductionsWithoutGuessing: logic.deductions,
    solvableByPureLogic: logic.solvedFullyByLogic,
  };
}

export function generatePuzzle(difficulty, seedInput) {
  const size = DIFFICULTY_SIZES[difficulty] ?? DIFFICULTY_SIZES.medio;
  const seed = seedInput !== undefined ? seedFromString(String(seedInput)) : randomSeed();
  const rng = mulberry32(seed);

  const randomAttempts = RANDOM_ATTEMPTS_BY_SIZE[size] ?? 1500;
  for (let attempt = 0; attempt < randomAttempts; attempt++) {
    const regions = growRegionsFromSeeds(size, randomDistinctSeeds(size, rng), rng);
    if (!regionsHaveMinimumSize(regions, size)) continue;
    const { solutions, truncated } = solveBacktracking(size, regions, 2);
    if (!truncated && solutions.length === 1) {
      return buildPuzzleResult(size, regions, cadsToArray(solutions[0], size), seed, difficulty);
    }
  }

  const repairIterations = REPAIR_ITERATIONS_BY_SIZE[size] ?? 150;
  if (repairIterations > 0) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const regions = growRegionsFromSeeds(size, randomDistinctSeeds(size, rng), rng);
      if (!regionsHaveMinimumSize(regions, size)) continue;
      const repaired = repairTowardsUniqueness(size, regions, rng, repairIterations);
      if (repaired.solutionCount === 1 && regionsHaveMinimumSize(repaired.regions, size)) {
        const { solutions } = solveBacktracking(size, repaired.regions, 1);
        return buildPuzzleResult(size, repaired.regions, solutions[0], seed, difficulty);
      }
    }
  }

  const fallbackList = (FALLBACK_PUZZLES[difficulty] ?? FALLBACK_PUZZLES.medio)
    .filter((puzzle) => regionsHaveMinimumSize(puzzle.regions, puzzle.size));
  if (fallbackList && fallbackList.length > 0) {
    const fallback = fallbackList[pickInt(rng, 0, fallbackList.length - 1)];
    return {
      ...fallback,
      seed,
      difficulty,
      fromFallback: true,
    };
  }

  throw new Error(`Não foi possível gerar puzzle para dificuldade "${difficulty}" e não há fallback disponível.`);
}

function cadsToArray(cats, size) {
  return cats.slice(0, size);
}

function estimateDifficultyTier(size, deductionsWithoutGuessing) {
  // Heurística documentada (não é uma medição formal de dificuldade): combina o tamanho do
  // tabuleiro com a fração de gatos deduzíveis por eliminação pura, sem exigir backtracking.
  const logicRatio = deductionsWithoutGuessing / size;
  if (size <= 5) return logicRatio >= 0.8 ? "facil" : "medio";
  if (size <= 7) return logicRatio >= 0.6 ? "medio" : "dificil";
  return logicRatio >= 0.5 ? "dificil" : "dificil";
}

export { estimateDifficultyTier };
