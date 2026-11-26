// Engine-agnostic map interface. MapView talks only to this, so the Leaflet implementation
// (lib/leaflet-adapter.ts) can be swapped for Mapbox GL later without touching React code.
//
// What a MapboxAdapter would need (not implemented yet):
//   - an access token, e.g. process.env.NEXT_PUBLIC_MAPBOX_TOKEN (mapboxgl.accessToken = token)
//   - a style URL, e.g. "mapbox://styles/<user>/<warm-scrapbook-style>" (or mapbox/outdoors-v12)
//   - the `mapbox-gl` package + its CSS (not installed; Phase 1 is Leaflet only)
//   - pins as mapboxgl.Marker({ element }) built from photoPinHtml() (same HTML/CSS as Leaflet),
//     anchor "bottom" so the tail tip sits on the coordinate
//   - routes as a GeoJSON LineString source per trip with a `line` layer (line-color = trip
//     color, line-width 3); the draw-in can use `line-gradient` + `lineMetrics: true` or a
//     `line-dasharray` animation; connectors as a dashed line layer
//   - camera: map.fitBounds(bounds, { padding: {top,right,bottom,left}, duration, curve })
//     and map.flyTo({ center, zoom, padding, ... }) — Mapbox supports padding natively,
//     so focusMoment does not need the manual offset math Leaflet does.

import type { ID, Moment, Trip } from "@/lib/types";

export type MapMode = "all" | "chapter";

/** Screen-space padding in CSS pixels. */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** UI chrome that covers the map, used to keep content in the visible area. */
export interface MapInsets {
  /** Top bar height. Default 72. */
  top?: number;
  /** Bottom timeline height. Default 120. */
  bottom?: number;
  /** Width of the right-side card on desktop (≥ 768px). Default 420. */
  cardWidth?: number;
  /** Fraction of the map height covered by the bottom-sheet card on mobile. Default 0.55. */
  sheetRatio?: number;
}

export interface MapMountOptions {
  insets?: MapInsets;
  /** Initial view when there is nothing to show. Default: soft continental-US view. */
  emptyView?: { lat: number; lng: number; zoom: number };
}

export interface MapData {
  /** Every trip in the book (chronological). */
  trips: Trip[];
  /** "all" or the active trip id. */
  activeChapter: "all" | ID;
  selectedMomentId: ID | null;
  mode: MapMode;
  /** Whether the scrapbook card is open (affects camera padding). */
  cardOpen?: boolean;
}

export interface MapAdapter {
  readonly kind: "leaflet" | "mapbox";
  mount(el: HTMLElement, opts?: MapMountOptions): void;
  /** Push the latest state; the adapter diffs and animates the camera as needed. */
  setData(data: MapData): void;
  onSelect(cb: (momentId: ID) => void): void;
  onBackgroundClick(cb: () => void): void;
  /** Fit the camera to these trips' moments. Padding defaults to the current chrome insets. */
  fitChapter(trips: Trip[], opts?: { animate?: boolean; padding?: Partial<Padding> }): void;
  /** Fly to a moment, keeping it clear of the card / timeline. */
  focusMoment(moment: Moment, opts?: { padding?: Partial<Padding> }): void;
  invalidateSize(): void;
  destroy(): void;
}

/** Create a map adapter. The implementation is dynamic-imported so it never runs on the server. */
export async function createMapAdapter(kind: "leaflet" | "mapbox" = "leaflet"): Promise<MapAdapter> {
  if (typeof window === "undefined") throw new Error("createMapAdapter() must run in the browser.");
  if (kind === "mapbox") {
    throw new Error(
      "MapboxAdapter is not implemented yet. It needs NEXT_PUBLIC_MAPBOX_TOKEN, a style URL and the mapbox-gl package — see the notes at the top of lib/map-adapter.ts. Use createMapAdapter(\"leaflet\") for now.",
    );
  }
  const { LeafletAdapter } = await import("@/lib/leaflet-adapter");
  return new LeafletAdapter();
}
