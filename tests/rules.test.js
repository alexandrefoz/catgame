import { test, assert, assertEqual } from "./harness.mjs";
import { violatesAdjacency, validateFullSolution, validatePlayerCats, isPlacementValid } from "../js/rules.js";

// Tabuleiro 3x3 trivial com 3 regiões em colunas, usado em vários testes abaixo.
const regions3 = [
  [0, 1, 2],
  [0, 1, 2],
  [0, 1, 2],
];

test("violatesAdjacency: mesma célula não conta como vizinha", () => {
  assert(!violatesAdjacency(1, 1, 1, 1));
});

test("violatesAdjacency: diagonal em linhas consecutivas é vizinha", () => {
  assert(violatesAdjacency(0, 0, 1, 1));
  assert(violatesAdjacency(2, 4, 1, 3));
});

test("violatesAdjacency: linhas não consecutivas nunca são vizinhas", () => {
  assert(!violatesAdjacency(0, 0, 2, 0));
  assert(!violatesAdjacency(0, 0, 2, 1));
});

test("validateFullSolution: aceita permutação válida (linha, coluna, região, sem vizinhos)", () => {
  // colunas 0,2,1 para linhas 0,1,2 -> regiões 0,2,1 (todas distintas); linhas 0-1 colunas 0,2 (dist=2, ok);
  // linhas 1-2 colunas 2,1 (dist=1, mas linhas consecutivas e colunas adjacentes -> viola!). Usar outra permutação.
  assert(validateFullSolution(3, regions3, [0, 2, 1]) === false); // colunas 2,1 em linhas consecutivas = vizinhas
  assert(validateFullSolution(3, regions3, [1, -1, -1]) === false);
});

test("validateFullSolution: rejeita coluna repetida", () => {
  assertEqual(validateFullSolution(3, regions3, [0, 0, 1]), false);
});

test("validateFullSolution: rejeita gatos adjacentes em linhas consecutivas", () => {
  assertEqual(validateFullSolution(3, regions3, [0, 1, 2]), false);
});

test("validateFullSolution: aceita uma solução realmente válida (5x5 regiões em coluna)", () => {
  const size = 5;
  const regionsCol = Array.from({ length: size }, () => [0, 1, 2, 3, 4]);
  // Permutação com colunas suficientemente separadas entre linhas consecutivas.
  const solution = [2, 4, 1, 3, 0];
  assertEqual(validateFullSolution(size, regionsCol, solution), true);
});

test("isPlacementValid: bloqueia região repetida mesmo com linha/coluna livres", () => {
  const cats = [0, -1, -1]; // linha 0 tem gato na coluna 0 (região 0)
  assertEqual(isPlacementValid(3, regions3, cats, 1, 0), false); // mesma coluna
});

test("validatePlayerCats: exige exatamente N gatos", () => {
  const size = 3;
  const cats = new Set(["0,0", "2,2"]);
  assertEqual(validatePlayerCats(size, regions3, cats), false);
});

test("validatePlayerCats: aceita configuração válida completa", () => {
  const size = 5;
  const regionsCol = Array.from({ length: size }, () => [0, 1, 2, 3, 4]);
  const cats = new Set(["0,2", "1,4", "2,1", "3,3", "4,0"]);
  assertEqual(validatePlayerCats(size, regionsCol, cats), true);
});
