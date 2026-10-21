import { getItem, setItem } from "./storage.js";

const STATS_KEY = "stats";

function defaultStats() {
  return {
    gamesStarted: 0,
    gamesCompleted: 0,
    wins: 0,
    hintsUsedTotal: 0,
    bestTimeMsBySize: {},
  };
}

export function loadStatistics() {
  return { ...defaultStats(), ...getItem(STATS_KEY, {}) };
}

function saveStatistics(stats) {
  setItem(STATS_KEY, stats);
  return stats;
}

export function recordGameStarted() {
  const stats = loadStatistics();
  stats.gamesStarted += 1;
  return saveStatistics(stats);
}

export function recordGameWon({ size, elapsedMs, hintsUsed }) {
  const stats = loadStatistics();
  stats.gamesCompleted += 1;
  stats.wins += 1;
  stats.hintsUsedTotal += hintsUsed;
  const key = String(size);
  const prevBest = stats.bestTimeMsBySize[key];
  if (prevBest === undefined || elapsedMs < prevBest) {
    stats.bestTimeMsBySize[key] = elapsedMs;
  }
  return saveStatistics(stats);
}
