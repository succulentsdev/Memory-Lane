// Reverse geocoding for moments, via OpenStreetMap Nominatim.
//
// Nominatim usage policy: at most 1 request per second, cache results, and
// identify the application. Browsers forbid setting the User-Agent header, so
// in the browser the Referer header identifies the app. In production, route
// these lookups through a small server proxy that sets an app User-Agent such
// as "MemoryLane/0.1 (+contact URL)" and caches server-side too.
import type { Moment } from "@/lib/types";

export interface GeocodeResult {
  placeName: string;
  area?: string;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_INTERVAL_MS = 1100; // a little over 1 req/s to stay clearly inside the policy
const TIMEOUT_MS = 6000;
const CACHE_PREFIX = "ml-geo:v1:";
/** Most network lookups one nameMoments() call will make; the rest get coordinate labels. */
const MAX_LOOKUPS_PER_BATCH = 25;

// ---------- cache (localStorage, keyed by coords rounded to 4 decimals ≈ 11 m) ----------

const memCache = new Map<string, GeocodeResult>();

function cacheKey(lat: number, lng: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function readCache(key: string): GeocodeResult | null {
  const hit = memCache.get(key);
  if (hit) return hit;
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeocodeResult;
    if (!parsed || typeof parsed.placeName !== "string") return null;
    memCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: GeocodeResult): void {
  memCache.set(key, value);
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the in-memory cache still helps this session.
  }
}

// ---------- global 1 request/second queue ----------

let queueTail: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Runs `task` after every earlier queued task, at least MIN_INTERVAL_MS after the previous request started. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  };
  const result = queueTail.then(run, run);
  queueTail = result.catch(() => undefined);
  return result;
}

// ---------- parsing ----------

interface NominatimAddress {
  tourism?: string;
  attraction?: string;
  amenity?: string;
  leisure?: string;
  building?: string;
  historic?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface NominatimResponse {
  name?: string;
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

function first(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return undefined;
}

function parse(data: NominatimResponse): GeocodeResult | null {
  if (!data || data.error) return null;
  const a = data.address ?? {};
  const neighbourhood = first(a.neighbourhood, a.quarter);
  const locality = first(a.suburb, a.city_district);
  const city = first(a.city, a.town, a.village, a.hamlet, a.municipality, a.county, a.state);

  const placeName = first(
    a.tourism,
    a.attraction,
    a.amenity,
    a.leisure,
    a.historic,
    a.building && a.building !== "yes" ? a.building : undefined,
    data.name,
    a.road,
    a.pedestrian,
    a.footway,
    neighbourhood,
    locality,
    city,
    data.display_name?.split(",")[0],
  );
  if (!placeName) return null;

  const areaParts: string[] = [];
  const near = first(neighbourhood, locality);
  if (near && near !== placeName) areaParts.push(near);
  if (city && city !== placeName && city !== near) areaParts.push(city);
  if (!areaParts.length && a.country && a.country !== placeName) areaParts.push(a.country);

  return { placeName, area: areaParts.length ? areaParts.join(", ") : undefined };
}

// ---------- public API ----------

/** Reverse geocode (Nominatim, throttled + cached). Returns null on failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<{ placeName: string; area?: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = cacheKey(lat, lng);
  const cached = readCache(key);
  if (cached) return cached;
  if (typeof fetch === "undefined") return null;

  try {
    return await enqueue(async () => {
      // Another queued call may have filled the cache while we waited.
      const again = readCache(key);
      if (again) return again;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const url =
          `${ENDPOINT}?format=jsonv2&lat=${encodeURIComponent(lat.toFixed(6))}` +
          `&lon=${encodeURIComponent(lng.toFixed(6))}&zoom=17&addressdetails=1`;
        // No custom User-Agent (browsers forbid it); see the note at the top of this file.
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const result = parse((await res.json()) as NominatimResponse);
        if (result) writeCache(key, result);
        return result;
      } finally {
        clearTimeout(timer);
      }
    });
  } catch {
    return null;
  }
}

/** "45.5191°N, 122.7055°W" */
export function coordinateLabel(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`;
}

/**
 * Fill placeName/area on moments that don't have one yet (mutates).
 * Cached places are free; at most MAX_LOOKUPS_PER_BATCH network lookups are made,
 * and anything past that (or any failed lookup) gets a coordinate label.
 */
export async function nameMoments(moments: Moment[], onEach?: (done: number) => void): Promise<void> {
  let done = 0;
  let lookups = 0;
  const tick = () => onEach?.(++done);

  for (const m of moments) {
    if (m.placeName) {
      tick();
      continue;
    }
    let result = readCache(cacheKey(m.lat, m.lng));
    if (!result && lookups < MAX_LOOKUPS_PER_BATCH) {
      lookups++;
      result = await reverseGeocode(m.lat, m.lng);
    }
    if (result) {
      m.placeName = result.placeName;
      if (result.area && !m.area) m.area = result.area;
    } else {
      m.placeName = coordinateLabel(m.lat, m.lng);
    }
    tick();
  }
}
