// Wrapper sobre localStorage com fallback em memória, para que o jogo continue funcionando
// mesmo se o armazenamento local estiver indisponível (modo privado, política do navegador etc.).
const PREFIX = "catlogic:";

function detectLocalStorage() {
  try {
    const key = `${PREFIX}__probe__`;
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const memoryStore = new Map();
export const isLocalStorageAvailable = typeof window !== "undefined" && detectLocalStorage();

export function getItem(key, fallback = null) {
  const fullKey = PREFIX + key;
  try {
    const raw = isLocalStorageAvailable ? window.localStorage.getItem(fullKey) : memoryStore.get(fullKey);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  const fullKey = PREFIX + key;
  const raw = JSON.stringify(value);
  try {
    if (isLocalStorageAvailable) window.localStorage.setItem(fullKey, raw);
    else memoryStore.set(fullKey, raw);
    return true;
  } catch {
    memoryStore.set(fullKey, raw);
    return false;
  }
}

export function removeItem(key) {
  const fullKey = PREFIX + key;
  try {
    if (isLocalStorageAvailable) window.localStorage.removeItem(fullKey);
  } catch {
    /* ignora: nada para remover de forma persistente */
  }
  memoryStore.delete(fullKey);
}
