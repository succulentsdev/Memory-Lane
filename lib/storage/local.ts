import type { ID, Scrapbook } from "@/lib/types";
import type { StorageAdapter } from "./index";

const KEY = "memory-lane:scrapbooks:v1";
const DB = "memory-lane-images";
const STORE = "images";

function readAll(): Scrapbook[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Scrapbook[]) : [];
  } catch {
    return [];
  }
}

function writeAll(books: Scrapbook[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(books));
  } catch {
    // Quota or private mode: the in-memory session still works.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Image blobs live in IndexedDB; URLs are stored as `idb:<key>` and resolved on load. */
export async function resolveImageUrl(url: string): Promise<string> {
  if (!url.startsWith("idb:")) return url;
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(url.slice(4));
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    return blob ? URL.createObjectURL(blob) : "";
  } catch {
    return "";
  }
}

/** Browser-only storage. Gift links made here open only on this device until a cloud adapter is added. */
export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = "local" as const;

  async listScrapbooks() {
    return readAll();
  }

  async getScrapbook(id: ID) {
    return readAll().find((b) => b.id === id) ?? null;
  }

  async getBySlug(slug: string) {
    return readAll().find((b) => b.slug === slug) ?? null;
  }

  async saveScrapbook(book: Scrapbook) {
    const all = readAll().filter((b) => b.id !== book.id);
    all.unshift({ ...book, updatedAt: new Date().toISOString() });
    writeAll(all);
  }

  async deleteScrapbook(id: ID) {
    writeAll(readAll().filter((b) => b.id !== id));
  }

  async uploadImage(key: string, blob: Blob) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return `idb:${key}`;
    } catch {
      return URL.createObjectURL(blob);
    }
  }
}
