import type { ID, Scrapbook } from "@/lib/types";

/**
 * Storage abstraction. The MVP uses LocalStorageAdapter (this browser only).
 * A SupabaseAdapter (or Firebase) implements the same interface later:
 *  - saveScrapbook -> upsert row in `scrapbooks` + `trips` + `moments`
 *  - uploadImage  -> put compressed web image in a storage bucket, return public URL
 *  - getBySlug    -> public read for Gift Mode (RLS: read-only by slug)
 */
export interface StorageAdapter {
  readonly kind: "local" | "supabase" | "firebase";
  listScrapbooks(): Promise<Scrapbook[]>;
  getScrapbook(id: ID): Promise<Scrapbook | null>;
  getBySlug(slug: string): Promise<Scrapbook | null>;
  saveScrapbook(book: Scrapbook): Promise<void>;
  deleteScrapbook(id: ID): Promise<void>;
  /** Persist a compressed web-ready image; returns a URL that survives reloads. */
  uploadImage(key: string, blob: Blob): Promise<string>;
}

export { LocalStorageAdapter } from "./local";

import { LocalStorageAdapter } from "./local";

let adapter: StorageAdapter | null = null;

/** Single place to swap backends. */
export function getStorage(): StorageAdapter {
  if (!adapter) adapter = new LocalStorageAdapter();
  return adapter;
}
