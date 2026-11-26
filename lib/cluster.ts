// Owned by the "clustering + sharpness" builder.
// Chronological spatial-temporal clustering of placed photos into Moments.
import type { ClusterOptions, Moment, Photo, Trip } from "@/lib/types";
import { haversineMeters, uid } from "@/lib/util";

/** Middle clusters with at most this many photos can be absorbed as GPS jitter. */
const JITTER_MAX_PHOTOS = 2;
/** ...and only if they sit within this multiple of the radius from the surrounding stop. */
const JITTER_MAX_RADIUS_FACTOR = 3;

function timeMs(p: Photo): number | undefined {
  if (!p.takenAt) return undefined;
  const t = Date.parse(p.takenAt);
  return Number.isNaN(t) ? undefined : t;
}

/** Chronological order: by takenAt, photos without a time last; ties stable by name, then id. */
export function sortChronological(photos: Photo[]): Photo[] {
  return photos
    .map((p, i) => ({ p, i, t: timeMs(p) }))
    .sort((a, b) => {
      if (a.t !== undefined && b.t !== undefined && a.t !== b.t) return a.t - b.t;
      if (a.t === undefined && b.t !== undefined) return 1;
      if (a.t !== undefined && b.t === undefined) return -1;
      const n = a.p.name.localeCompare(b.p.name, undefined, { numeric: true });
      if (n !== 0) return n;
      if (a.p.id !== b.p.id) return a.p.id < b.p.id ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

interface Group {
  photos: Photo[];
  sumLat: number;
  sumLng: number;
  /** Earliest / latest known times in the group (ms). */
  first?: number;
  last?: number;
}

function newGroup(p: Photo): Group {
  const t = timeMs(p);
  return { photos: [p], sumLat: p.lat!, sumLng: p.lng!, first: t, last: t };
}

function centroid(g: Group) {
  return { lat: g.sumLat / g.photos.length, lng: g.sumLng / g.photos.length };
}

function addTo(g: Group, p: Photo) {
  g.photos.push(p);
  g.sumLat += p.lat!;
  g.sumLng += p.lng!;
  const t = timeMs(p);
  if (t !== undefined) {
    g.first = g.first === undefined ? t : Math.min(g.first, t);
    g.last = g.last === undefined ? t : Math.max(g.last, t);
  }
}

function mergeGroups(a: Group, b: Group): Group {
  const g: Group = { photos: [...a.photos], sumLat: a.sumLat, sumLng: a.sumLng, first: a.first, last: a.last };
  for (const p of b.photos) addTo(g, p);
  return g;
}

/** Time gap between the end of `a` and the start of `b` fits the window (unknown times = OK). */
function withinWindow(a: Group, b: Group, windowMs: number): boolean {
  if (a.last === undefined || b.first === undefined) return true;
  return b.first - a.last <= windowMs;
}

function sharpnessOf(p: Photo): number {
  const s = p.sharpness;
  return typeof s === "number" && Number.isFinite(s) && s >= 0 ? s : -Infinity;
}

/**
 * Cover = sharpest photo (unscored / -1 count as lowest; ties → earliest, then input order).
 * favoriteIds = cover + next sharpest, up to `max` (min 1), no duplicates.
 */
export function pickCover(photos: Photo[], max: number): { coverPhotoId: string; favoriteIds: string[] } {
  if (!photos.length) return { coverPhotoId: "", favoriteIds: [] };
  const ranked = photos
    .map((p, i) => ({ p, i, s: sharpnessOf(p), t: timeMs(p) }))
    .sort((a, b) => {
      if (a.s !== b.s) return b.s - a.s;
      if (a.t !== undefined && b.t !== undefined && a.t !== b.t) return a.t - b.t;
      if (a.t === undefined && b.t !== undefined) return 1;
      if (a.t !== undefined && b.t === undefined) return -1;
      return a.i - b.i;
    });
  const limit = Math.max(1, Math.floor(max) || 1);
  const favoriteIds: string[] = [];
  for (const r of ranked) {
    if (favoriteIds.length >= limit) break;
    if (!favoriteIds.includes(r.p.id)) favoriteIds.push(r.p.id);
  }
  return { coverPhotoId: favoriteIds[0], favoriteIds };
}

function toMoment(g: Group, tripId: string, opts: ClusterOptions): Moment {
  const photos = sortChronological(g.photos);
  const c = centroid(g);
  const times = photos.map((p) => ({ iso: p.takenAt, t: timeMs(p) })).filter((x) => x.t !== undefined);
  let startAt = "";
  let endAt = "";
  if (times.length) {
    let min = times[0];
    let max = times[0];
    for (const x of times) {
      if (x.t! < min.t!) min = x;
      if (x.t! > max.t!) max = x;
    }
    startAt = new Date(min.t!).toISOString();
    endAt = new Date(max.t!).toISOString();
  }
  const { coverPhotoId, favoriteIds } = pickCover(photos, opts.maxFavorites);
  return {
    id: uid("m"),
    tripId,
    lat: c.lat,
    lng: c.lng,
    startAt,
    endAt,
    photoIds: photos.map((p) => p.id),
    coverPhotoId,
    favoriteIds,
  };
}

/** Core pass, exposed for reuse: returns groups of photos (chronological), no Moment wrapping. */
export function groupPhotos(photos: Photo[], opts: ClusterOptions): Photo[][] {
  const radius = Math.max(0, opts.radiusMeters);
  const windowMs = Math.max(0, opts.timeWindowMinutes) * 60_000;
  const placed = photos.filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  const sorted = sortChronological(placed);

  // 1) Sequential pass: join the open cluster if close to its running centroid and soon after its last photo.
  const groups: Group[] = [];
  let open: Group | null = null;
  for (const p of sorted) {
    if (open) {
      const near = haversineMeters(centroid(open), { lat: p.lat!, lng: p.lng! }) <= radius;
      const t = timeMs(p);
      const soon = t === undefined || open.last === undefined || t - open.last <= windowMs;
      if (near && soon) {
        addTo(open, p);
        continue;
      }
    }
    open = newGroup(p);
    groups.push(open);
  }

  // 2) Merge consecutive clusters whose centroids are within radius/2 and time gap within window
  //    (a stale first GPS fix after a pause can split one stop in two).
  const merged: Group[] = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    if (prev && haversineMeters(centroid(prev), centroid(g)) <= radius / 2 && withinWindow(prev, g, windowMs)) {
      merged[merged.length - 1] = mergeGroups(prev, g);
    } else {
      merged.push(g);
    }
  }

  // 3) Absorb a tiny jitter cluster sandwiched between two halves of the same stop: A, [1–2 stray fixes], C
  //    where A and C are within radius/2, the stray sits within 3×radius, and A→C fits the time window.
  const out: Group[] = [];
  for (let i = 0; i < merged.length; i++) {
    const a = out.length ? out[out.length - 1] : null;
    const b = merged[i];
    const c = merged[i + 1];
    if (
      a &&
      c &&
      b.photos.length <= JITTER_MAX_PHOTOS &&
      haversineMeters(centroid(a), centroid(c)) <= radius / 2 &&
      haversineMeters(centroid(a), centroid(b)) <= radius * JITTER_MAX_RADIUS_FACTOR &&
      withinWindow(a, c, windowMs)
    ) {
      out[out.length - 1] = mergeGroups(mergeGroups(a, b), c);
      i++; // c consumed
      continue;
    }
    out.push(b);
  }

  return out.map((g) => sortChronological(g.photos));
}

/**
 * Group placed photos into chronological moments; pick sharpest as cover + favorites.
 * A place revisited later (beyond the time window) becomes a separate moment.
 */
export function clusterPhotos(photos: Photo[], tripId: string, opts: ClusterOptions): Moment[] {
  try {
    return groupPhotos(photos, opts).map((ps) => {
      const g = newGroup(ps[0]);
      for (const p of ps.slice(1)) addTo(g, p);
      return toMoment(g, tripId, opts);
    });
  } catch {
    return [];
  }
}

/**
 * Re-cluster a trip (e.g. after ClusterOptions change) without losing the user's work.
 * Each new moment inherits from the old moment it shares the most photos with (each old
 * moment used at most once): id, placeName, area, caption, aiSuggestion, and the cover /
 * favorites the user picked where those photos are still in the moment. Does not mutate.
 */
export function reclusterTrip(trip: Trip, opts: ClusterOptions): Moment[] {
  const photos = Object.values(trip.photos).filter((p) => !trip.unplacedPhotoIds.includes(p.id));
  const fresh = clusterPhotos(photos, trip.id, opts);
  const owner = new Map<string, Moment>();
  for (const m of trip.moments) for (const id of m.photoIds) owner.set(id, m);

  const used = new Set<string>();
  return fresh.map((m) => {
    const counts = new Map<string, { m: Moment; n: number }>();
    for (const id of m.photoIds) {
      const o = owner.get(id);
      if (!o || used.has(o.id)) continue;
      const c = counts.get(o.id) ?? { m: o, n: 0 };
      c.n++;
      counts.set(o.id, c);
    }
    let best: { m: Moment; n: number } | undefined;
    for (const c of counts.values()) if (!best || c.n > best.n) best = c;
    if (!best) return m;
    const old = best.m;
    used.add(old.id);
    const inThis = new Set(m.photoIds);
    const keptFavs = old.favoriteIds.filter((id) => inThis.has(id));
    const coverPhotoId = inThis.has(old.coverPhotoId) ? old.coverPhotoId : m.coverPhotoId;
    const favoriteIds = [coverPhotoId, ...keptFavs, ...m.favoriteIds]
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, Math.max(1, opts.maxFavorites));
    return {
      ...m,
      id: old.id,
      placeName: old.placeName,
      area: old.area,
      caption: old.caption,
      aiSuggestion: old.aiSuggestion,
      coverPhotoId,
      favoriteIds,
    };
  });
}
