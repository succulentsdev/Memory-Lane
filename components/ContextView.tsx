"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/util";
import { TILE_ATTRIBUTION_TEXT, tileSrc } from "@/lib/tiles";

/**
 * "What it looked like here": street-level imagery when a key is configured,
 * otherwise a static OpenStreetMap area snapshot. Loads nothing until opened.
 *
 * Provider order: Mapillary (NEXT_PUBLIC_MAPILLARY_TOKEN) → Google Street View
 * (NEXT_PUBLIC_GOOGLE_MAPS_KEY) → OpenStreetMap tile snapshot (default, no key).
 */

// Read literally so Next.js inlines them at build time.
const MAPILLARY_TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || "";
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

type Source = "mapillary" | "google" | "osm";

const SOURCE_LABEL: Record<Source, string> = {
  mapillary: "Mapillary street view",
  google: "Google Street View",
  osm: "Map snapshot · OpenStreetMap",
};

function fallbackAfterMapillary(): Source {
  return GOOGLE_KEY ? "google" : "osm";
}

function initialSource(): Source {
  if (MAPILLARY_TOKEN) return "mapillary";
  return fallbackAfterMapillary();
}

export interface ContextViewProps {
  lat: number;
  lng: number;
  placeName?: string;
}

export default function ContextView({ lat, lng, placeName }: ContextViewProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelId = useId();
  const valid = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <section className="rounded-2xl border border-line bg-paper/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={!valid}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors hover:bg-paper-2/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
      >
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-sage/12 text-sage">
          <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" />
            <path d="M9 4v13M15 7v13" />
          </svg>
        </span>
        <span className="flex-1">
          <span className="block font-display text-[15px] text-ink">What it looked like here</span>
          <span className="block text-xs text-ink-faint">{open ? "Hide the surroundings" : "Peek at the surroundings"}</span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={cn("size-4 text-ink-soft transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && valid && (
          <motion.div
            id={panelId}
            key="ctx"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <ContextBody lat={lat} lng={lng} placeName={placeName} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ContextBody({ lat, lng, placeName }: ContextViewProps) {
  const [source, setSource] = useState<Source>(initialSource);
  const [mapillaryId, setMapillaryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(source === "mapillary");

  // Mapillary: find the nearest image in a small bbox around the coordinate.
  useEffect(() => {
    if (!MAPILLARY_TOKEN) return;
    setSource("mapillary");
    setMapillaryId(null);
    setLoading(true);
    let cancelled = false;
    const ctrl = new AbortController();
    const d = 0.0015;
    const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(6)).join(",");
    const url =
      `https://graph.mapillary.com/images?access_token=${encodeURIComponent(MAPILLARY_TOKEN)}` +
      `&fields=id,thumb_1024_url&bbox=${bbox}&limit=1`;
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data?: { id?: string }[] } | null) => {
        const id = json?.data?.[0]?.id;
        if (id) setMapillaryId(String(id));
        else setSource(fallbackAfterMapillary());
      })
      .catch(() => {
        // Network error or our 8s timeout → next provider. Ignore aborts from unmount/coord change.
        if (!cancelled) setSource(fallbackAfterMapillary());
      })
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [lat, lng]);

  const where = placeName || "this spot";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
          <span aria-hidden className="size-1.5 rounded-full bg-sage" />
          {loading ? "Looking for street imagery…" : SOURCE_LABEL[source]}
        </span>
      </div>

      {source === "mapillary" && (loading || !mapillaryId) ? (
        <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-paper-2" aria-busy="true" aria-label="Loading street imagery" />
      ) : source === "mapillary" && mapillaryId ? (
        <Frame>
          <iframe
            title={`Street-level view near ${where}`}
            src={`https://www.mapillary.com/embed?image_key=${encodeURIComponent(mapillaryId)}&style=photo`}
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </Frame>
      ) : source === "google" ? (
        <Frame>
          <iframe
            title={`Street View near ${where}`}
            src={`https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(GOOGLE_KEY)}&location=${lat.toFixed(6)},${lng.toFixed(6)}&fov=80`}
            className="absolute inset-0 size-full border-0"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </Frame>
      ) : (
        <AreaSnapshot lat={lat} lng={lng} placeName={placeName} />
      )}

      {source === "osm" && (
        <p className="text-[11px] leading-snug text-ink-faint">
          Street-level imagery appears here once a Mapillary or Google Maps key is configured.
        </p>
      )}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-paper-2 shadow-polaroid">{children}</div>;
}

// ---------- static area snapshot (no key) ----------

const ZOOM = 17;
const TILE = 256; // CSS px per tile

/** Slippy-map world position at ZOOM, in tile units (fractional). */
function tilePosition(lat: number, lng: number): { x: number; y: number } {
  const n = 2 ** ZOOM;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

function AreaSnapshot({ lat, lng, placeName }: ContextViewProps) {
  const n = 2 ** ZOOM;
  const { x, y } = tilePosition(lat, lng);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  // Pixel offset of the exact coordinate inside the 3×3 grid (whose top-left tile is tx-1, ty-1).
  const offX = (1 + (x - tx)) * TILE;
  const offY = (1 + (y - ty)) * TILE;

  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const col = (((tx + dx) % n) + n) % n;
      const row = ty + dy;
      if (row < 0 || row >= n) continue;
      tiles.push({
        key: `${dx},${dy}`,
        src: tileSrc(ZOOM, col, row),
        left: (dx + 1) * TILE,
        top: (dy + 1) * TILE,
      });
    }
  }

  const la = lat.toFixed(5);
  const ln = lng.toFixed(5);

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`Street map around ${placeName || "this moment"}`}
        className="relative h-56 w-full overflow-hidden rounded-xl bg-paper-2 shadow-polaroid ring-1 ring-line"
      >
        <div
          className="absolute"
          style={{ width: TILE * 3, height: TILE * 3, left: `calc(50% - ${offX}px)`, top: `calc(50% - ${offY}px)` }}
        >
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.key}
              src={t.src}
              alt=""
              aria-hidden
              draggable={false}
              loading="lazy"
              decoding="async"
              className="absolute select-none"
              style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
            />
          ))}
        </div>

        {/* Pin at the exact coordinate (center of the frame). */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <svg viewBox="0 0 32 40" className="h-10 w-8 drop-shadow-[0_3px_4px_rgb(60_40_20/0.35)]">
            <path d="M16 39s13-12.4 13-23A13 13 0 0 0 3 16c0 10.6 13 23 13 23z" fill="var(--color-accent)" stroke="#fff" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="4.5" fill="#fff" />
          </svg>
        </div>
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25" />

        <div className="absolute bottom-0 right-0 rounded-tl-md bg-card/85 px-1.5 py-0.5 text-[10px] text-ink-soft">
          {TILE_ATTRIBUTION_TEXT}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`https://www.mapillary.com/app/?lat=${la}&lng=${ln}&z=17`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-medium text-ink transition-colors hover:border-sage hover:text-sage"
        >
          Open street view on Mapillary
          <ExternalIcon />
        </a>
        <a
          href={`https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=18/${la}/${ln}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-medium text-ink transition-colors hover:border-sage hover:text-sage"
        >
          Open in OpenStreetMap
          <ExternalIcon />
        </a>
      </div>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" />
    </svg>
  );
}
