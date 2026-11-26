// Sample scrapbook: three chapters of mock photos run through the real pipeline
// (sharpness scoring → clustering → covers), then named from the known spots below.
import type { Moment, Photo, Scrapbook, Trip } from "@/lib/types";
import { DEFAULT_CLUSTER_OPTIONS } from "@/lib/types";
import { buildTrip } from "@/lib/pipeline";
import { scoreSharpnessBatch } from "@/lib/sharpness";
import { haversineMeters, uid } from "@/lib/util";
import { sceneDataUrl, sceneSize, type SceneKind } from "@/data/sample-art";

export const SAMPLE_SLUG = "portland-sample";

interface SpotDef {
  placeName: string;
  area: string;
  lat: number;
  lng: number;
  kind: SceneKind;
  tint?: string;
  /** Local time of the first photo, ISO with offset. */
  start: string;
  count: number;
  /** How many shaky retakes (deliberately soft) to include. */
  blurry: number;
  caption?: string;
}

interface UnplacedDef {
  kind: SceneKind;
  at: string;
}

interface TripDef {
  title: string;
  note: string;
  imgBase: number;
  spots: SpotDef[];
  unplaced?: UnplacedDef[];
}

const TRIPS: TripDef[] = [
  {
    title: "Portland Weekend",
    note: "Roses, bridges and far too much coffee.",
    imgBase: 2140,
    spots: [
      {
        placeName: "International Rose Test Garden",
        area: "Washington Park, Portland",
        lat: 45.5191,
        lng: -122.7055,
        kind: "rose-garden",
        start: "2026-06-13T09:40:00-07:00",
        count: 6,
        blurry: 2,
        caption: "We lost count of the roses after the first hundred.",
      },
      {
        placeName: "Portland Japanese Garden",
        area: "Washington Park, Portland",
        lat: 45.5188,
        lng: -122.7084,
        kind: "japanese-garden",
        start: "2026-06-13T11:05:00-07:00",
        count: 5,
        blurry: 1,
        caption: "We whispered the whole time. It felt like that kind of place.",
      },
      {
        placeName: "Portland Art Museum",
        area: "Cultural District, Portland",
        lat: 45.5163,
        lng: -122.6833,
        kind: "museum",
        start: "2026-06-13T13:30:00-07:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Downtown café",
        area: "Downtown, Portland",
        lat: 45.5178,
        lng: -122.6812,
        kind: "cafe",
        start: "2026-06-13T15:45:00-07:00",
        count: 4,
        blurry: 1,
        caption: "Two lattes, one croissant, zero regrets.",
      },
      {
        placeName: "Pioneer Courthouse Square",
        area: "Downtown, Portland",
        lat: 45.5189,
        lng: -122.6793,
        kind: "city-square",
        start: "2026-06-13T18:20:00-07:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Hawthorne Bridge",
        area: "Willamette River, Portland",
        lat: 45.5133,
        lng: -122.6714,
        kind: "bridge-lift",
        tint: "#2f6a5a",
        start: "2026-06-14T09:15:00-07:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Tilikum Crossing",
        area: "South Waterfront, Portland",
        lat: 45.505,
        lng: -122.667,
        kind: "bridge-cable",
        start: "2026-06-14T10:25:00-07:00",
        count: 5,
        blurry: 2,
        caption: "We stopped halfway across to watch the river sparkle.",
      },
      {
        placeName: "Steel Bridge",
        area: "Old Town, Portland",
        lat: 45.5275,
        lng: -122.6695,
        kind: "bridge-lift",
        tint: "#3a3f47",
        start: "2026-06-14T12:10:00-07:00",
        count: 4,
        blurry: 1,
      },
    ],
    unplaced: [
      { kind: "forest-trail", at: "2026-06-13T10:35:00-07:00" },
      { kind: "cafe", at: "2026-06-14T08:30:00-07:00" },
    ],
  },
  {
    title: "Coastal Road Trip",
    note: "Windows down, Highway 101 the whole way.",
    imgBase: 3310,
    spots: [
      {
        placeName: "Astoria Column",
        area: "Astoria, Oregon",
        lat: 46.1813,
        lng: -123.8177,
        kind: "column",
        start: "2026-07-17T15:10:00-07:00",
        count: 4,
        blurry: 1,
        caption: "We climbed all 164 steps and flew our little gliders off the top.",
      },
      {
        placeName: "Ecola State Park viewpoint",
        area: "Cannon Beach, Oregon",
        lat: 45.9203,
        lng: -123.9733,
        kind: "viewpoint",
        start: "2026-07-18T09:20:00-07:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Haystack Rock",
        area: "Cannon Beach, Oregon",
        lat: 45.884,
        lng: -123.9686,
        kind: "beach-haystack",
        start: "2026-07-18T11:45:00-07:00",
        count: 6,
        blurry: 2,
        caption: "We found purple starfish in the tide pools!",
      },
      {
        placeName: "Cannon Beach at sunset",
        area: "Cannon Beach, Oregon",
        lat: 45.8915,
        lng: -123.9625,
        kind: "cliffs-sunset",
        start: "2026-07-18T20:40:00-07:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Cape Meares Lighthouse",
        area: "Tillamook County, Oregon",
        lat: 45.4864,
        lng: -123.9781,
        kind: "lighthouse",
        start: "2026-07-19T10:30:00-07:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Tillamook dairy country",
        area: "Tillamook, Oregon",
        lat: 45.4562,
        lng: -123.844,
        kind: "pasture",
        start: "2026-07-19T13:15:00-07:00",
        count: 4,
        blurry: 1,
        caption: "We waved at every single cow.",
      },
    ],
  },
  {
    title: "San Diego",
    note: "Chasing one more month of summer.",
    imgBase: 4580,
    spots: [
      {
        placeName: "Balboa Park",
        area: "San Diego, California",
        lat: 32.7316,
        lng: -117.151,
        kind: "palm-park",
        start: "2026-11-06T14:00:00-08:00",
        count: 5,
        blurry: 1,
      },
      {
        placeName: "Old Town San Diego",
        area: "Old Town, San Diego",
        lat: 32.7546,
        lng: -117.1975,
        kind: "old-town",
        start: "2026-11-07T11:30:00-08:00",
        count: 4,
        blurry: 1,
      },
      {
        placeName: "Sunset Cliffs",
        area: "Point Loma, San Diego",
        lat: 32.721,
        lng: -117.2551,
        kind: "cliffs-sunset",
        start: "2026-11-07T16:20:00-08:00",
        count: 5,
        blurry: 2,
        caption: "Our favorite sunset so far.",
      },
      {
        placeName: "La Jolla Cove",
        area: "La Jolla, San Diego",
        lat: 32.8504,
        lng: -117.2716,
        kind: "cove",
        start: "2026-11-08T10:15:00-08:00",
        count: 4,
        blurry: 1,
      },
    ],
  },
];

// --- helpers ---------------------------------------------------------------

/** Deterministic PRNG so the sample looks the same on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Add minutes to an ISO timestamp, keeping its original UTC offset in the output. */
function addMinutes(iso: string, minutes: number): string {
  const off = iso.slice(-6);
  const sign = off[0] === "-" ? -1 : 1;
  const offMin = sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6)));
  const t = new Date(iso).getTime() + minutes * 60_000;
  return new Date(t + offMin * 60_000).toISOString().slice(0, 19) + off;
}

/** Fallback scores used when the real scorer can't run (e.g. no Worker/canvas). */
const crispScore = (seed: number) => 400 + ((seed * 137) % 500);
const blurryScore = (seed: number) => 20 + ((seed * 7) % 40);

interface Built {
  photos: Photo[];
  spotOf: Map<string, number>;
  fallback: Map<string, number>;
}

function makePhotos(def: TripDef, tripIndex: number): Built {
  const r = rng(1000 + tripIndex * 97);
  const photos: Photo[] = [];
  const spotOf = new Map<string, number>();
  const fallback = new Map<string, number>();
  let n = 0;

  def.spots.forEach((spot, si) => {
    // Pick which shots are shaky retakes (never the first, so each has a crisp sibling before it).
    const soft = new Set<number>();
    while (soft.size < Math.min(spot.blurry, spot.count - 1)) soft.add(1 + Math.floor(r() * (spot.count - 1)));

    let t = spot.start;
    let lastSeed = 0;
    for (let i = 0; i < spot.count; i++) {
      if (i > 0) t = addMinutes(t, 1 + Math.floor(r() * 6));
      const isSoft = soft.has(i);
      const seed = isSoft ? lastSeed : tripIndex * 1000 + si * 37 + i * 11 + 7;
      if (!isSoft) lastSeed = seed;
      const blur = isSoft ? 2.5 + r() * 1.5 : 0;
      const art = sceneDataUrl(spot.kind, seed, { blur, tint: spot.tint });
      const { w, h } = sceneSize(seed);
      const id = uid("photo");
      photos.push({
        id,
        name: `IMG_${def.imgBase + n++}.JPG`,
        url: art,
        thumbUrl: art,
        width: w,
        height: h,
        // A few meters of GPS jitter.
        lat: +(spot.lat + (r() - 0.5) * 0.0001).toFixed(6),
        lng: +(spot.lng + (r() - 0.5) * 0.00014).toFixed(6),
        takenAt: t,
      });
      spotOf.set(id, si);
      fallback.set(id, isSoft ? blurryScore(seed + i) : crispScore(seed));
    }
  });

  (def.unplaced ?? []).forEach((u, i) => {
    const seed = tripIndex * 1000 + 900 + i * 13;
    const art = sceneDataUrl(u.kind, seed);
    const { w, h } = sceneSize(seed);
    const id = uid("photo");
    photos.push({ id, name: `IMG_${def.imgBase + n++}.JPG`, url: art, thumbUrl: art, width: w, height: h, takenAt: u.at });
    fallback.set(id, crispScore(seed));
  });

  photos.sort((a, b) => new Date(a.takenAt ?? 0).getTime() - new Date(b.takenAt ?? 0).getTime());
  return { photos, spotOf, fallback };
}

/** Name moments from the spots their photos came from (majority vote, nearest spot as fallback). */
function nameFromSpots(moments: Moment[], def: TripDef, spotOf: Map<string, number>) {
  const captioned = new Set<number>();
  for (const m of moments) {
    const votes = new Map<number, number>();
    for (const pid of m.photoIds) {
      const s = spotOf.get(pid);
      if (s !== undefined) votes.set(s, (votes.get(s) ?? 0) + 1);
    }
    let best = -1;
    let bestVotes = 0;
    for (const [s, v] of votes) if (v > bestVotes) [best, bestVotes] = [s, v];
    if (best < 0) {
      let bestD = Infinity;
      def.spots.forEach((s, i) => {
        const d = haversineMeters(m, s);
        if (d < bestD) [best, bestD] = [i, d];
      });
    }
    const spot = def.spots[best];
    if (!spot) continue;
    m.placeName = spot.placeName;
    m.area = spot.area;
    if (spot.caption && !captioned.has(best) && !m.caption) {
      m.caption = spot.caption;
      captioned.add(best);
    }
  }
}

// --- public API --------------------------------------------------------------

/** Build the sample scrapbook (Portland Weekend + two more chapters) by running mock photos through the real pipeline. */
export async function loadSampleScrapbook(): Promise<Scrapbook> {
  const trips: Trip[] = [];
  for (let ti = 0; ti < TRIPS.length; ti++) {
    const def = TRIPS[ti];
    const { photos, spotOf, fallback } = makePhotos(def, ti);

    let scores: number[] = [];
    try {
      scores = await scoreSharpnessBatch(photos.map((p) => p.thumbUrl));
    } catch {
      // The scorer promises never to throw; fall back quietly if it does.
    }
    photos.forEach((p, i) => {
      const s = scores[i];
      p.sharpness = typeof s === "number" && s > 0 ? s : fallback.get(p.id) ?? 100;
    });

    const trip = await buildTrip(photos, { title: def.title, note: def.note }, DEFAULT_CLUSTER_OPTIONS, ti, undefined, { geocode: false });
    nameFromSpots(trip.moments, def, spotOf);
    trips.push(trip);
  }

  const now = new Date().toISOString();
  return {
    id: uid("book"),
    slug: SAMPLE_SLUG,
    title: "Our Memory Lane",
    trips,
    createdAt: now,
    updatedAt: now,
    plan: "free",
  };
}
