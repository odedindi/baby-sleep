import type { SoundId } from "./sounds";
import { renderMix } from "./audio-engine";

// Small IndexedDB wrapper to persist individually rendered sounds so the app
// has them ready instantly and provably available with no network.

const DB_NAME = "dreamsounds";
const STORE = "sounds";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSavedIds(): Promise<SoundId[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as SoundId[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getSavedBlob(id: SoundId): Promise<Blob | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function putBlob(id: SoundId, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Render a single sound at full volume and store it for offline use. */
export async function saveSoundOffline(id: SoundId): Promise<void> {
  const existing = await getSavedBlob(id);
  if (existing) return;
  const blob = await renderMix([{ id, volume: 1 }]);
  await putBlob(id, blob);
}
