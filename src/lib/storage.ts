import type { SavedDrawing } from '../types';

// Local persistence for Drawley.
//
// Drawings are stored in IndexedDB (large binary-ish payloads) while a small
// index of metadata lives alongside for quick gallery listing. Falling back to
// localStorage keeps the app working even when IndexedDB is unavailable.

const DB_NAME = 'drawley';
const STORE = 'drawings';
const AUTOSAVE_KEY = 'drawley:autosave';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDrawing(drawing: SavedDrawing): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(drawing);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback: localStorage (may throw on quota — surfaced to caller).
    localStorage.setItem(`drawley:art:${drawing.id}`, JSON.stringify(drawing));
  }
}

export async function listDrawings(): Promise<SavedDrawing[]> {
  try {
    const db = await openDB();
    const items = await new Promise<SavedDrawing[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as SavedDrawing[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    const items: SavedDrawing[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('drawley:art:')) {
        try {
          items.push(JSON.parse(localStorage.getItem(key)!));
        } catch {
          /* ignore corrupt entry */
        }
      }
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export async function getDrawing(id: string): Promise<SavedDrawing | null> {
  try {
    const db = await openDB();
    const item = await new Promise<SavedDrawing | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as SavedDrawing | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return item ?? null;
  } catch {
    const raw = localStorage.getItem(`drawley:art:${id}`);
    return raw ? (JSON.parse(raw) as SavedDrawing) : null;
  }
}

export async function deleteDrawing(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    localStorage.removeItem(`drawley:art:${id}`);
  }
}

// --- Autosave (lightweight, localStorage) -----------------------------------

export function writeAutosave(drawing: SavedDrawing): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(drawing));
  } catch {
    // Quota exceeded — drop the autosave silently rather than interrupt drawing.
  }
}

export function readAutosave(): SavedDrawing | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedDrawing) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}
