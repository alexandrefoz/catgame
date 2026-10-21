// Ferramenta de desenvolvimento (não é executada pelo jogo em produção): faz uma busca offline,
// com orçamento maior que o do gerador em tempo real, para curar um pequeno conjunto de puzzles
// pré-validados por dificuldade. Usado como rede de segurança quando a geração ao vivo falhar
// (ver seção 6 do briefing: "utilize um conjunto inicial de puzzles previamente validados").
import { writeFileSync } from "node:fs";
import { mulberry32, shuffle, seedFromString, pickInt } from "../js/rng.js";
import { solveBacktracking, solveByLogic } from "../js/puzzle-solver.js";
import { validateFullSolution } from "../js/rules.js";

const TARGET_PER_DIFFICULTY = 3;
const SIZES = { facil: 5, medio: 7, dificil: 9 };
const RANDOM_ATTEMPTS = { facil: 4000, medio: 8000, dificil: 6000 };
const REPAIR_ROUNDS = { facil: 0, medio: 40, dificil: 120 };
const REPAIR_ITERATIONS = { facil: 0, medio: 200, dificil: 500 };

function allCells(size) {
  const cells = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push([r, c]);
  return cells;
}
function inBounds(size, r, c) {
  return r >= 0 && r < size && c >= 0 && c < size;
}
function neighbors4(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
}
function randomDistinctSeeds(size, rng) {
  return shuffle(allCells(size), rng).slice(0, size);
}
function growRegionsFromSeeds(size, seedCells, rng) {
  const regions = Array.from({ length: size }, () => new Array(size).fill(-1));
  seedCells.forEach(([r, c], regionId) => (regions[r][c] = regionId));
  let remaining = size * size - size;
  while (remaining > 0) {
    const edges = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (regions[r][c] === -1) continue;
        for (const [nr, nc] of neighbors4(r, c)) {
          if (!inBounds(size, nr, nc) || regions[nr][nc] !== -1) continue;
          edges.push({ regionId: regions[r][c], nr, nc });
        }
      }
    if (edges.length === 0) break;
    for (const { regionId, nr, nc } of shuffle(edges, rng)) {
      if (regions[nr][nc] !== -1) continue;
      regions[nr][nc] = regionId;
      remaining--;
    }
  }
  return regions;
}
function regionCellCount(regions, size, regionId) {
  let n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (regions[r][c] === regionId) n++;
  return n;
}
function isRegionConnectedWithout(regions, size, regionId, excludeR, excludeC) {
  let start = null;
  for (let r = 0; r < size && !start; r++)
    for (let c = 0; c < size; c++)
      if (regions[r][c] === regionId && !(r === excludeR && c === excludeC)) {
        start = [r, c];
        break;
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
function repairTowardsUniqueness(size, initialRegions, rng, iterations) {
  let current = initialRegions;
  let currentCount = solveBacktracking(size, current, 4).solutions.length;
  let best = current;
  let bestCount = currentCount;
  for (let i = 0; i < iterations && bestCount !== 1; i++) {
    const [r, c] = allCells(size)[pickInt(rng, 0, size * size - 1)];
    const myRegion = current[r][c];
    for (const [nr, nc] of shuffle(neighbors4(r, c), rng)) {
      if (!inBounds(size, nr, nc)) continue;
      const otherRegion = current[nr][nc];
      if (otherRegion === myRegion) continue;
      if (regionCellCount(current, size, myRegion) <= 1) continue;
      if (!isRegionConnectedWithout(current, size, myRegion, r, c)) continue;
      const trial = current.map((row) => row.slice());
      trial[r][c] = otherRegion;
      const trialCount = solveBacktracking(size, trial, 4).solutions.length;
      if (trialCount === 0) continue;
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

function findOne(difficulty, size, rngSeedLabel) {
  const rng = mulberry32(seedFromString(rngSeedLabel));
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS[difficulty]; attempt++) {
    const regions = growRegionsFromSeeds(size, randomDistinctSeeds(size, rng), rng);
    const { solutions, truncated } = solveBacktracking(size, regions, 2);
    if (!truncated && solutions.length === 1) return { regions, solution: solutions[0] };
  }
  for (let round = 0; round < REPAIR_ROUNDS[difficulty]; round++) {
    const regions = growRegionsFromSeeds(size, randomDistinctSeeds(size, rng), rng);
    const repaired = repairTowardsUniqueness(size, regions, rng, REPAIR_ITERATIONS[difficulty]);
    if (repaired.solutionCount === 1) {
      const { solutions } = solveBacktracking(size, repaired.regions, 1);
      return { regions: repaired.regions, solution: solutions[0] };
    }
  }
  return null;
}

const out = { facil: [], medio: [], dificil: [] };
for (const [difficulty, size] of Object.entries(SIZES)) {
  let found = 0;
  let seedIdx = 0;
  const startedAt = Date.now();
  while (found < TARGET_PER_DIFFICULTY) {
    seedIdx++;
    const result = findOne(difficulty, size, `curated-${difficulty}-${seedIdx}`);
    if (!result) continue;
    if (!validateFullSolution(size, result.regions, result.solution)) continue;
    const check = solveBacktracking(size, result.regions, 2);
    if (check.solutions.length !== 1) continue;
    out[difficulty].push({ size, regions: result.regions, solution: result.solution });
    found++;
    process.stderr.write(`${difficulty} ${found}/${TARGET_PER_DIFFICULTY} (seedIdx=${seedIdx}, ${Date.now() - startedAt}ms)\n`);
  }
}

const header =
  "// Puzzles pré-validados usados como rede de segurança quando a geração ao vivo falhar dentro do\n" +
  "// orçamento de tentativas (ver js/board-generator.js). Gerado por tests/generate-fallbacks.mjs;\n" +
  "// cada entrada foi verificada (rules.validateFullSolution + puzzle-solver.solveBacktracking) como\n" +
  "// tendo solução única. Não editar manualmente — regenerar pelo script caso necessário.\n";
const body = `export const FALLBACK_PUZZLES = ${JSON.stringify(out, null, 2)};\n`;
writeFileSync(new URL("../js/fallback-puzzles.js", import.meta.url), header + body);
process.stderr.write("fallback-puzzles.js escrito com sucesso.\n");
