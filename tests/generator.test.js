import { test, assert, assertEqual } from "./harness.mjs";
import { generatePuzzle, DIFFICULTY_SIZES } from "../js/board-generator.js";
import { solveBacktracking } from "../js/puzzle-solver.js";
import { validateFullSolution } from "../js/rules.js";

for (const difficulty of Object.keys(DIFFICULTY_SIZES)) {
  test(`generatePuzzle(${difficulty}): produz tabuleiro com solução única e válida`, () => {
    const puzzle = generatePuzzle(difficulty, `test-seed-${difficulty}`);
    assertEqual(puzzle.size, DIFFICULTY_SIZES[difficulty]);
    assert(validateFullSolution(puzzle.size, puzzle.regions, puzzle.solution), "solução armazenada deve satisfazer todas as regras");

    const { solutions, truncated } = solveBacktracking(puzzle.size, puzzle.regions, 2);
    assert(!truncated, "não deveria truncar com limite 2 num puzzle corretamente gerado");
    assertEqual(solutions.length, 1, "puzzle gerado deve ter exatamente uma solução");

    // Cada região (0..size-1) deve existir e conter pelo menos uma célula.
    const regionSizes = new Array(puzzle.size).fill(0);
    for (const row of puzzle.regions) for (const regionId of row) regionSizes[regionId]++;
    assert(regionSizes.every((n) => n > 0), "toda região declarada deve ter ao menos uma célula");
  });
}

test("generatePuzzle: gerações repetidas não quebram (robustez do gerador)", () => {
  for (let i = 0; i < 5; i++) {
    const puzzle = generatePuzzle("facil", `robustness-${i}`);
    const { solutions } = solveBacktracking(puzzle.size, puzzle.regions, 2);
    assertEqual(solutions.length, 1);
  }
});

test("generatePuzzle: mesma semente produz o mesmo puzzle (reprodutibilidade)", () => {
  const a = generatePuzzle("facil", "reproducible-seed");
  const b = generatePuzzle("facil", "reproducible-seed");
  assertEqual(a.regions, b.regions);
  assertEqual(a.solution, b.solution);
});
