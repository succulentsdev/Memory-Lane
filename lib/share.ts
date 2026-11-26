import type { Scrapbook } from "@/lib/types";
import { getStorage } from "@/lib/storage";
import { resolveImageUrl } from "@/lib/storage/local";

/**
 * Gift Mode publishing. Copies in-memory (blob:) images into durable storage,
 * saves the scrapbook and returns its read-only slug.
 * With the local adapter the link opens on this device only; a Supabase adapter
 * makes the same call produce a link anyone can open.
 */
export async function publishScrapbook(book: Scrapbook): Promise<Scrapbook> {
  const storage = getStorage();
  const cache = new Map<string, string>();

  async function persist(url: string, key: string): Promise<string> {
    if (!url.startsWith("blob:")) return url;
    const hit = cache.get(url);
    if (hit) return hit;
    try {
      const blob = await (await fetch(url)).blob();
      const stored = await storage.uploadImage(key, blob);
      cache.set(url, stored);
      return stored;
    } catch {
      return url;
    }
  }

  const trips = [];
  for (const trip of book.trips) {
    const photos: typeof trip.photos = {};
    for (const [id, p] of Object.entries(trip.photos)) {
      const url = await persist(p.url, `${book.id}/${id}`);
      const thumbUrl = p.thumbUrl === p.url ? url : await persist(p.thumbUrl, `${book.id}/${id}-thumb`);
      photos[id] = { ...p, url, thumbUrl };
    }
    trips.push({ ...trip, photos });
  }
  const saved: Scrapbook = { ...book, trips, updatedAt: new Date().toISOString() };
  await storage.saveScrapbook(saved);
  return saved;
}

/** Load a published scrapbook by slug and turn stored image refs back into displayable URLs. */
export async function loadSharedScrapbook(slug: string): Promise<Scrapbook | null> {
  const book = await getStorage().getBySlug(slug);
  if (!book) return null;
  const trips = [];
  for (const trip of book.trips) {
    const photos: typeof trip.photos = {};
    for (const [id, p] of Object.entries(trip.photos)) {
      const url = await resolveImageUrl(p.url);
      const thumbUrl = p.thumbUrl === p.url ? url : await resolveImageUrl(p.thumbUrl);
      photos[id] = { ...p, url, thumbUrl };
    }
    trips.push({ ...trip, photos });
  }
  return { ...book, trips };
}

/** The read-only link for a slug. The single-file demo build uses a hash route instead of a path. */
export function giftUrl(slug: string): string {
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    return `${window.location.href.split("#")[0]}#gift-${slug}`;
  }
  return `${window.location.origin}/share/${slug}`;
}
