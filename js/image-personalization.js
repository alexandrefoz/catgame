// Personalização opcional do personagem (seção 19 do briefing). Processamento 100% local:
// nenhuma imagem é enviada para qualquer servidor. Usa IndexedDB (mais adequado a binários que
// localStorage); se IndexedDB estiver indisponível, cai para armazenamento apenas em memória
// (perdido ao recarregar), e o jogo continua funcionando normalmente sem personalização.
const DB_NAME = "cat-logic-db";
const DB_VERSION = 1;
const STORE_NAME = "images";
const RECORD_KEY = "customCatImage";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);

let memoryFallbackBlob = null;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function validateImageFile(file) {
  if (!file) return { valid: false, reason: "Nenhum arquivo selecionado." };
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, reason: "Formato não suportado. Use JPEG, PNG ou WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, reason: `Arquivo maior que ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.` };
  }
  return { valid: true };
}

export async function saveCustomImage(file, { persist }) {
  const check = validateImageFile(file);
  if (!check.valid) throw new Error(check.reason);

  if (!persist) {
    memoryFallbackBlob = file;
    return { persisted: false };
  }

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(file, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return { persisted: true };
  } catch {
    memoryFallbackBlob = file;
    return { persisted: false, reason: "IndexedDB indisponível; a imagem valerá só para esta sessão." };
  }
}

export async function loadCustomImage() {
  if (memoryFallbackBlob) return memoryFallbackBlob;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function removeCustomImage() {
  memoryFallbackBlob = null;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* sem persistência para limpar */
  }
}
