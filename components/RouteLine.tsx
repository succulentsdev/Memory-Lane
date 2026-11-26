// Route helpers for the map: chronological, gently curved paths through each trip's
// moments, faint connectors between trips, and the CSS for the "draw in" + "stitch"
// animations. Pure TS (no React, no Leaflet runtime); the adapter turns these into
// L.polyline layers rendered by Leaflet's SVG renderer.
//
// Layers per trip (bottom → top):
//   casing  — soft paper-white halo so the line reads on any tile
//   line    — trip color, weight 3, opacity .8; draws in on chapter change
//   stitch  — thin paper-white dashes that slowly march along the line ("hand stitching")
// Between trips (all-trips mode): a faint dashed ink connector.

import type { Moment, Trip } from "@/lib/types";

export type LatLngTuple = [number, number];

// ---------------------------------------------------------------------------
// Geometry

const DEG = Math.PI / 180;

/** Web-Mercator y (in "degrees") so curves look evenly bowed on the map. */
function mercY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * DEG) / 2)) / DEG;
}
function invMercY(y: number): number {
  return (2 * Math.atan(Math.exp(y * DEG)) - Math.PI / 2) / DEG;
}

/** Moments sorted by start time (stable; trips are already chronological but be safe). */
export function orderedMoments(moments: Moment[]): Moment[] {
  return [...moments].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Trips in chronological order of their first moment (falls back to startDate / createdAt). */
export function chronologicalTrips(trips: Trip[]): Trip[] {
  const key = (t: Trip) => orderedMoments(t.moments)[0]?.startAt ?? t.startDate ?? t.createdAt;
  return [...trips].sort((a, b) => key(a).localeCompare(key(b)));
}

export interface CurveOptions {
  /** Bow of each segment as a fraction of its length. 0 = straight. Default 0.12. */
  curvature?: number;
  /** Alternate the bow side per segment for a hand-drawn wiggle. Default true. */
  alternate?: boolean;
  /** Samples per segment. Default 14. */
  samples?: number;
}

/**
 * Smooth-ish path through points: each consecutive pair is joined by a quadratic Bézier whose
 * control point sits off the midpoint, perpendicular to the segment (computed in Mercator so the
 * bow looks the same at every latitude). Duplicate consecutive points are dropped.
 */
export function curvedPath(points: LatLngTuple[], opts: CurveOptions = {}): LatLngTuple[] {
  const curvature = opts.curvature ?? 0.12;
  const alternate = opts.alternate ?? true;
  const samples = Math.max(2, opts.samples ?? 14);

  const pts: LatLngTuple[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-7 || Math.abs(last[1] - p[1]) > 1e-7) pts.push(p);
  }
  if (pts.length < 2 || curvature === 0) return pts;

  const out: LatLngTuple[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][1];
    const ay = mercY(pts[i][0]);
    const bx = pts[i + 1][1];
    const by = mercY(pts[i + 1][0]);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const sign = alternate && i % 2 === 1 ? -1 : 1;
    // Perpendicular (left-hand normal) scaled by length * curvature.
    const cx = (ax + bx) / 2 + (-dy / (len || 1)) * len * curvature * sign;
    const cy = (ay + by) / 2 + (dx / (len || 1)) * len * curvature * sign;
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx;
      const y = u * u * ay + 2 * u * t * cy + t * t * by;
      out.push([invMercY(y), x]);
    }
  }
  return out;
}

/** Chronological, curved route through a trip's moment centroids. Empty if < 2 distinct points. */
export function tripRoute(trip: Trip, opts?: CurveOptions): LatLngTuple[] {
  const pts = orderedMoments(trip.moments).map((m) => [m.lat, m.lng] as LatLngTuple);
  const path = curvedPath(pts, opts);
  return path.length >= 2 ? path : [];
}

export interface TripConnector {
  fromTripId: string;
  toTripId: string;
  latlngs: LatLngTuple[];
}

/** Faint links from the last moment of each trip to the first moment of the next (chronological). */
export function tripConnectors(trips: Trip[]): TripConnector[] {
  const ordered = chronologicalTrips(trips).filter((t) => t.moments.length > 0);
  const out: TripConnector[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = orderedMoments(ordered[i].moments);
    const b = orderedMoments(ordered[i + 1].moments);
    const from = a[a.length - 1];
    const to = b[0];
    const latlngs = curvedPath(
      [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      { curvature: 0.18, alternate: false, samples: 28 },
    );
    if (latlngs.length >= 2) out.push({ fromTripId: ordered[i].id, toTripId: ordered[i + 1].id, latlngs });
  }
  return out;
}

/** Cheap signature to tell whether a trip's route needs rebuilding. */
export function routeSignature(trip: Trip): string {
  return trip.color + "|" + orderedMoments(trip.moments).map((m) => `${m.lat.toFixed(6)},${m.lng.toFixed(6)}`).join(";");
}

// ---------------------------------------------------------------------------
// Styles (Leaflet PathOptions-compatible plain objects)

export const ROUTE_CLASS = "ml-route";
export const DRAW_CLASS = "ml-route--draw";
export const WAIT_CLASS = "ml-route--wait";

export function routeStyles(color: string) {
  return {
    casing: { color: "#fffdf9", weight: 7, opacity: 0.55, lineCap: "round", lineJoin: "round", interactive: false, className: `${ROUTE_CLASS} ml-route-casing` },
    line: { color, weight: 3, opacity: 0.8, lineCap: "round", lineJoin: "round", interactive: false, className: `${ROUTE_CLASS} ml-route-line` },
    stitch: { color: "#fffdf9", weight: 1.25, opacity: 0.9, lineCap: "round", lineJoin: "round", interactive: false, className: `${ROUTE_CLASS} ml-route-stitch` },
  } as const;
}

export const CONNECTOR_STYLE = {
  color: "#a39588",
  weight: 2,
  opacity: 0.6,
  lineCap: "round",
  interactive: false,
  className: `${ROUTE_CLASS} ml-route-connector`,
} as const;

/**
 * Scoped CSS. `.ml-map--moving` (set by the adapter during pans/flights) pauses the marching
 * stitch so the overlay doesn't repaint every frame while the map itself is animating.
 */
export const ROUTE_CSS = `
.ml-route{transition:opacity .6s ease;}
.ml-route.${WAIT_CLASS}{opacity:0;}
.ml-route.${DRAW_CLASS}{stroke-dasharray:var(--ml-len) var(--ml-len);stroke-dashoffset:var(--ml-len);
  animation:ml-route-draw var(--ml-dur,1.4s) cubic-bezier(.45,.05,.3,1) forwards;}
@keyframes ml-route-draw{to{stroke-dashoffset:0;}}
.ml-route-stitch{stroke-dasharray:3px 9px;animation:ml-route-march 2.4s linear infinite;}
@keyframes ml-route-march{to{stroke-dashoffset:-12px;}}
.ml-map--moving .ml-route-stitch{animation-play-state:paused;}
.ml-route-connector{stroke-dasharray:1px 8px;}
@media (prefers-reduced-motion: reduce){
  .ml-route{transition:none;}
  .ml-route.${DRAW_CLASS}{animation:none;stroke-dasharray:none;stroke-dashoffset:0;}
  .ml-route-stitch{animation:none;}
}
`;

let routeStylesInjected = false;

/** Inject ROUTE_CSS once per document. No-op on the server. */
export function ensureRouteStyles(): void {
  if (routeStylesInjected || typeof document === "undefined") return;
  if (!document.getElementById("ml-route-styles")) {
    const el = document.createElement("style");
    el.id = "ml-route-styles";
    el.textContent = ROUTE_CSS;
    document.head.appendChild(el);
  }
  routeStylesInjected = true;
}

/**
 * Animate SVG paths drawing themselves in. Lines (`draw`) trace from start to end; `fade`
 * elements (stitches, connectors) fade in as the trace finishes. With reduced motion everything
 * just appears. Returns a cancel function.
 */
export function playRouteDrawIn(
  draw: SVGPathElement[],
  fade: SVGPathElement[],
  { durationMs = 1400, reducedMotion = false }: { durationMs?: number; reducedMotion?: boolean } = {},
): () => void {
  const timers: number[] = [];
  const cleanups: (() => void)[] = [];
  const reveal = () => fade.forEach((el) => el.classList.remove(WAIT_CLASS));

  if (reducedMotion) {
    draw.forEach((el) => el.classList.remove(WAIT_CLASS, DRAW_CLASS));
    reveal();
    return () => {};
  }

  for (const el of draw) {
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      len = 0;
    }
    if (!len || !Number.isFinite(len)) {
      el.classList.remove(WAIT_CLASS, DRAW_CLASS);
      continue;
    }
    el.style.setProperty("--ml-len", `${Math.ceil(len) + 2}px`);
    el.style.setProperty("--ml-dur", `${durationMs}ms`);
    el.classList.remove(DRAW_CLASS);
    // Force a reflow so re-adding the class restarts the animation.
    void el.getBoundingClientRect();
    el.classList.remove(WAIT_CLASS);
    el.classList.add(DRAW_CLASS);
    // Drop the dash once drawn so later zooms (which change the path length) leave it solid.
    const done = () => el.classList.remove(DRAW_CLASS);
    el.addEventListener("animationend", done, { once: true });
    cleanups.push(() => el.removeEventListener("animationend", done));
    timers.push(window.setTimeout(done, durationMs + 250));
  }
  timers.push(window.setTimeout(reveal, Math.round(durationMs * 0.8)));

  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    cleanups.forEach((c) => c());
  };
}
