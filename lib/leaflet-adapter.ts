// Leaflet 1.9 implementation of MapAdapter. Only ever loaded through createMapAdapter()
// (dynamic import), because Leaflet touches `window` at import time.

import * as L from "leaflet";
import type { ID, Moment, Trip } from "@/lib/types";
import type { MapAdapter, MapData, MapInsets, MapMountOptions, Padding } from "@/lib/map-adapter";
import {
  PIN_ANCHOR,
  PIN_HEIGHT,
  PIN_ICON_CLASS,
  PIN_SELECTED_CLASS,
  PIN_SIZE,
  ensurePinStyles,
  photoPinHtml,
} from "@/components/PhotoPin";
import {
  CONNECTOR_STYLE,
  WAIT_CLASS,
  ensureRouteStyles,
  orderedMoments,
  playRouteDrawIn,
  routeSignature,
  routeStyles,
  tripConnectors,
  tripRoute,
} from "@/components/RouteLine";

import { TILE_ATTRIBUTION_HTML, TILE_MAX_ZOOM, TILE_URL } from "@/lib/tiles";

const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOMENT_ZOOM = 15;
const MAX_FOCUS_ZOOM = 18;
const MAX_FIT_ZOOM = 16;
const SELECTED_Z = 1000;

const DEFAULT_INSETS: Required<MapInsets> = { top: 72, bottom: 120, cardWidth: 420, sheetRatio: 0.55 };

const MAP_CSS = `
.ml-map{background:#f4ebdd;--ml-inset-top:72px;--ml-inset-bottom:120px;}
.ml-map .leaflet-tile-pane{filter:sepia(.15) saturate(.9) brightness(1.02);}
.ml-map .leaflet-top{top:var(--ml-inset-top);}
.ml-map .leaflet-bottom{bottom:var(--ml-inset-bottom);}
.ml-map .leaflet-control-zoom{border:1px solid #e6dac8 !important;border-radius:14px;overflow:hidden;
  box-shadow:0 1px 2px rgb(60 40 20/.08),0 6px 18px rgb(60 40 20/.14) !important;margin-right:16px !important;margin-bottom:12px !important;}
.ml-map .leaflet-control-zoom a{width:40px !important;height:40px !important;line-height:38px !important;font-size:20px !important;
  background:#fffdf9;color:#2b2420;border-bottom-color:#e6dac8 !important;}
.ml-map .leaflet-control-zoom a:hover{background:#f4ebdd;}
.ml-map .leaflet-control-zoom a.leaflet-disabled{color:#a39588;background:#fffdf9;}
.ml-map .leaflet-control-attribution a{color:#6b5d52;}
.ml-map:focus-visible{outline:2px solid #e0794a;outline-offset:-4px;}
.ml-map .leaflet-marker-icon.${PIN_ICON_CLASS}:focus{outline:none;}
`;

function ensureMapStyles(): void {
  if (typeof document === "undefined" || document.getElementById("ml-map-styles")) return;
  const el = document.createElement("style");
  el.id = "ml-map-styles";
  el.textContent = MAP_CSS;
  document.head.appendChild(el);
}

interface PinEntry {
  marker: L.Marker;
  moment: Moment;
  sig: string;
  thumbUrl: string;
  count: number;
  color: string;
  index: number;
}

interface TripLayer {
  group: L.LayerGroup;
  pins: Map<ID, PinEntry>;
  routeSig: string;
  /** [casing, line, stitch] polylines, or empty when the trip has < 2 distinct moments. */
  route: L.Polyline[];
}

function coverThumb(trip: Trip, m: Moment): string {
  const p = trip.photos[m.coverPhotoId] ?? trip.photos[m.photoIds[0]];
  return p?.thumbUrl || p?.url || "";
}

function pinLabel(m: Moment): string {
  const place = m.placeName || m.area || "Moment";
  const n = m.photoIds.length;
  return `${place}${m.area && m.placeName ? `, ${m.area}` : ""} · ${n} ${n === 1 ? "photo" : "photos"}`;
}

function visibleTripsOf(data: MapData): Trip[] {
  return data.activeChapter === "all" ? data.trips : data.trips.filter((t) => t.id === data.activeChapter);
}

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

export class LeafletAdapter implements MapAdapter {
  readonly kind = "leaflet" as const;

  private map: L.Map | null = null;
  private el: HTMLElement | null = null;
  private tiles: L.TileLayer | null = null;
  private zoomControl: L.Control.Zoom | null = null;
  private connectorGroup: L.LayerGroup | null = null;
  private connectorSig = "";
  private tripLayers = new Map<ID, TripLayer>();

  private data: MapData | null = null;
  private pending: MapData | null = null;
  private chapterKey: string | null = null;
  private selectedId: ID | null = null;
  private cardOpen = false;

  private insets: Required<MapInsets> = { ...DEFAULT_INSETS };
  private emptyView = { lat: 39.5, lng: -98.35, zoom: 4 };
  private reducedMotion = false;

  private selectCb: ((id: ID) => void) | null = null;
  private bgCb: (() => void) | null = null;
  private cancelDraw: (() => void) | null = null;
  private cancelAfterCamera: (() => void) | null = null;
  private teardown: (() => void)[] = [];
  private decorated = new WeakSet<Element>();

  // -------------------------------------------------------------------------
  // Lifecycle

  mount(el: HTMLElement, opts: MapMountOptions = {}): void {
    if (this.map) return;
    ensurePinStyles();
    ensureRouteStyles();
    ensureMapStyles();

    this.el = el;
    this.insets = { ...DEFAULT_INSETS, ...opts.insets };
    if (opts.emptyView) this.emptyView = opts.emptyView;
    el.classList.add("ml-map");
    el.style.setProperty("--ml-inset-top", `${this.insets.top}px`);
    el.style.setProperty("--ml-inset-bottom", `${this.insets.bottom}px`);

    this.reducedMotion = matches(REDUCED_MOTION_QUERY);

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 19,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 110,
      worldCopyJump: true,
      bounceAtZoomLimits: false,
      inertiaDeceleration: 2600,
      renderer: L.svg({ padding: 0.5 }),
      fadeAnimation: !this.reducedMotion,
    });
    this.map = map;

    this.tiles = L.tileLayer(TILE_URL, {
      subdomains: "abcd",
      maxZoom: TILE_MAX_ZOOM,
      attribution: TILE_ATTRIBUTION_HTML,
      keepBuffer: 4,
      updateWhenZooming: false,
      className: "ml-tiles",
    }).addTo(map);

    this.connectorGroup = L.layerGroup();

    map.on("click", () => this.bgCb?.());
    map.on("movestart zoomstart", () => el.classList.add("ml-map--moving"));
    map.on("moveend zoomend", () => el.classList.remove("ml-map--moving"));

    // Zoom buttons on desktop only (pinch on phones); keep the attribution everywhere.
    const desktop = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_QUERY) : null;
    const syncZoomControl = () => {
      const want = !!desktop?.matches;
      if (want && !this.zoomControl) {
        this.zoomControl = L.control.zoom({ position: "bottomright", zoomInTitle: "Zoom in", zoomOutTitle: "Zoom out" }).addTo(map);
      } else if (!want && this.zoomControl) {
        this.zoomControl.remove();
        this.zoomControl = null;
      }
    };
    syncZoomControl();
    const reduced = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
    const onReduced = () => {
      this.reducedMotion = !!reduced?.matches;
    };
    desktop?.addEventListener?.("change", syncZoomControl);
    reduced?.addEventListener?.("change", onReduced);
    this.teardown.push(() => {
      desktop?.removeEventListener?.("change", syncZoomControl);
      reduced?.removeEventListener?.("change", onReduced);
    });

    this.showEmpty(false);

    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.setData(p);
    }
  }

  destroy(): void {
    this.cancelDraw?.();
    this.cancelAfterCamera?.();
    this.cancelDraw = this.cancelAfterCamera = null;
    this.teardown.forEach((f) => f());
    this.teardown = [];
    if (this.map) {
      this.map.stop();
      this.map.remove();
    }
    this.el?.classList.remove("ml-map", "ml-map--moving");
    this.map = null;
    this.el = null;
    this.tiles = null;
    this.zoomControl = null;
    this.connectorGroup = null;
    this.tripLayers.clear();
    this.data = this.pending = null;
    this.chapterKey = null;
    this.selectedId = null;
    this.selectCb = this.bgCb = null;
  }

  invalidateSize(): void {
    this.map?.invalidateSize({ pan: false, debounceMoveend: true });
  }

  onSelect(cb: (momentId: ID) => void): void {
    this.selectCb = cb;
  }

  onBackgroundClick(cb: () => void): void {
    this.bgCb = cb;
  }

  // -------------------------------------------------------------------------
  // Data

  setData(data: MapData): void {
    const map = this.map;
    if (!map) {
      this.pending = data;
      return;
    }
    const prevCardOpen = this.cardOpen;
    this.data = data;
    this.cardOpen = !!data.cardOpen;

    const visible = visibleTripsOf(data);
    const visibleIds = new Set(visible.map((t) => t.id));

    // Trips: create / diff / show / hide.
    const liveIds = new Set<ID>();
    const newlyShown: TripLayer[] = [];
    for (const trip of data.trips) {
      liveIds.add(trip.id);
      const tl = this.syncTrip(trip, data.selectedMomentId);
      const show = visibleIds.has(trip.id);
      const onMap = map.hasLayer(tl.group);
      if (show && !onMap) {
        tl.group.addTo(map);
        this.decorateTrip(tl);
        newlyShown.push(tl);
      } else if (!show && onMap) {
        tl.group.remove();
      }
    }
    for (const [id, tl] of this.tripLayers) {
      if (!liveIds.has(id)) {
        tl.group.remove();
        this.tripLayers.delete(id);
      }
    }

    this.syncConnectors(data);

    // Selection: only the two affected pins change.
    const prevSel = this.selectedId;
    if (prevSel !== data.selectedMomentId) {
      if (prevSel) this.setPinSelected(prevSel, false);
      if (data.selectedMomentId) this.setPinSelected(data.selectedMomentId, true);
      this.selectedId = data.selectedMomentId;
    }

    // Camera.
    const momentCount = visible.reduce((n, t) => n + t.moments.length, 0);
    const key = `${data.activeChapter}|${[...visibleIds].join(",")}|${momentCount}`;
    const firstRun = this.chapterKey === null;
    if (key !== this.chapterKey) {
      this.chapterKey = key;
      const sel = data.selectedMomentId ? this.findMoment(data.selectedMomentId) : null;
      // Hide routes now; they draw in once the camera settles.
      const animatedTrips = visible.map((t) => this.tripLayers.get(t.id)).filter((x): x is TripLayer => !!x);
      this.hideRoutes(animatedTrips);
      this.afterCamera(
        () => {
          if (sel) this.focusMoment(sel, {}, !firstRun);
          else this.fitChapter(visible, { animate: !firstRun });
        },
        () => this.drawIn(animatedTrips),
      );
    } else if (data.selectedMomentId && (prevSel !== data.selectedMomentId || prevCardOpen !== this.cardOpen)) {
      const sel = this.findMoment(data.selectedMomentId);
      if (sel) this.focusMoment(sel);
    } else if (newlyShown.length) {
      this.drawIn(newlyShown);
    }
  }

  private syncTrip(trip: Trip, selectedId: ID | null): TripLayer {
    let tl = this.tripLayers.get(trip.id);
    if (!tl) {
      tl = { group: L.layerGroup(), pins: new Map(), routeSig: "", route: [] };
      this.tripLayers.set(trip.id, tl);
    }

    // Pins, diffed by moment id.
    const seen = new Set<ID>();
    orderedMoments(trip.moments).forEach((m, index) => {
      seen.add(m.id);
      const thumbUrl = coverThumb(trip, m);
      const count = m.photoIds.length;
      const sig = `${thumbUrl}|${count}|${trip.color}|${index}|${m.lat}|${m.lng}|${m.placeName ?? ""}|${m.area ?? ""}`;
      const selected = m.id === selectedId;
      const existing = tl.pins.get(m.id);
      if (!existing) {
        const entry: PinEntry = { marker: null as unknown as L.Marker, moment: m, sig, thumbUrl, count, color: trip.color, index };
        entry.marker = this.createMarker(entry, selected);
        tl.pins.set(m.id, entry);
        tl.group.addLayer(entry.marker);
      } else {
        existing.moment = m;
        if (existing.sig !== sig) {
          Object.assign(existing, { sig, thumbUrl, count, color: trip.color, index });
          const ll = existing.marker.getLatLng();
          if (ll.lat !== m.lat || ll.lng !== m.lng) existing.marker.setLatLng([m.lat, m.lng]);
          existing.marker.setIcon(this.makeIcon(existing, selected)); // reuses the same element
          existing.marker.options.title = pinLabel(m);
          this.labelElement(existing);
        }
      }
    });
    for (const [id, entry] of tl.pins) {
      if (!seen.has(id)) {
        tl.group.removeLayer(entry.marker);
        tl.pins.delete(id);
      }
    }

    // Route.
    const rsig = routeSignature(trip);
    if (rsig !== tl.routeSig) {
      tl.route.forEach((pl) => tl.group.removeLayer(pl));
      tl.route = [];
      const latlngs = tripRoute(trip);
      if (latlngs.length >= 2) {
        const s = routeStyles(trip.color);
        tl.route = [L.polyline(latlngs, s.casing), L.polyline(latlngs, s.line), L.polyline(latlngs, s.stitch)];
        tl.route.forEach((pl) => tl.group.addLayer(pl));
      }
      tl.routeSig = rsig;
    }
    return tl;
  }

  private syncConnectors(data: MapData): void {
    const map = this.map;
    const group = this.connectorGroup;
    if (!map || !group) return;
    const show = data.mode === "all" && data.activeChapter === "all";
    const conns = show ? tripConnectors(data.trips) : [];
    const sig = conns.map((c) => `${c.fromTripId}>${c.toTripId}:${c.latlngs[0]}:${c.latlngs[c.latlngs.length - 1]}`).join("|");
    if (sig !== this.connectorSig) {
      group.clearLayers();
      conns.forEach((c) => group.addLayer(L.polyline(c.latlngs, { ...CONNECTOR_STYLE })));
      this.connectorSig = sig;
    }
    if (conns.length && !map.hasLayer(group)) group.addTo(map);
    else if (!conns.length && map.hasLayer(group)) group.remove();
  }

  // -------------------------------------------------------------------------
  // Pins

  private makeIcon(entry: PinEntry, selected: boolean): L.DivIcon {
    return L.divIcon({
      className: PIN_ICON_CLASS,
      html: photoPinHtml({ thumbUrl: entry.thumbUrl, count: entry.count, color: entry.color, selected, index: entry.index }),
      iconSize: [PIN_SIZE, PIN_HEIGHT],
      iconAnchor: PIN_ANCHOR,
    });
  }

  private createMarker(entry: PinEntry, selected: boolean): L.Marker {
    const momentId = entry.moment.id;
    const marker = L.marker([entry.moment.lat, entry.moment.lng], {
      icon: this.makeIcon(entry, selected),
      keyboard: true,
      title: pinLabel(entry.moment),
      alt: pinLabel(entry.moment),
      riseOnHover: true,
      riseOffset: 500,
      zIndexOffset: selected ? SELECTED_Z : 0,
      bubblingMouseEvents: false,
    });
    marker.on("click", () => this.selectCb?.(momentId));
    // Leaflet recreates the element each time the marker is (re)added to the map.
    marker.on("add", () => this.decorateMarker(entry));
    return marker;
  }

  /** a11y label + Enter/Space activation (Leaflet markers only handle Enter for popups). */
  private decorateMarker(entry: PinEntry): void {
    const el = entry.marker.getElement();
    if (!el) return;
    this.labelElement(entry);
    el.setAttribute("aria-current", entry.moment.id === this.selectedId ? "true" : "false");
    if (this.decorated.has(el)) return;
    this.decorated.add(el);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        e.stopPropagation();
        this.selectCb?.(entry.moment.id);
      }
    });
  }

  private decorateTrip(tl: TripLayer): void {
    tl.pins.forEach((entry) => this.decorateMarker(entry));
  }

  private labelElement(entry: PinEntry): void {
    const el = entry.marker.getElement();
    if (!el) return;
    const label = pinLabel(entry.moment);
    el.setAttribute("aria-label", label);
    el.title = label;
  }

  private setPinSelected(id: ID, selected: boolean): void {
    for (const tl of this.tripLayers.values()) {
      const entry = tl.pins.get(id);
      if (!entry) continue;
      // Keep the icon definition in sync for future re-adds, but toggle the live element's
      // class instead of rebuilding it so the CSS transition plays and keyboard focus stays.
      entry.marker.options.icon = this.makeIcon(entry, selected);
      const el = entry.marker.getElement();
      el?.querySelector(".ml-pin")?.classList.toggle(PIN_SELECTED_CLASS, selected);
      el?.setAttribute("aria-current", selected ? "true" : "false");
      entry.marker.setZIndexOffset(selected ? SELECTED_Z : 0);
      return;
    }
  }

  private findMoment(id: ID): Moment | null {
    for (const tl of this.tripLayers.values()) {
      const e = tl.pins.get(id);
      if (e) return e.moment;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Routes

  private routePaths(tls: TripLayer[]) {
    const draw: SVGPathElement[] = [];
    const fade: SVGPathElement[] = [];
    for (const tl of tls) {
      const [casing, line, stitch] = tl.route;
      for (const pl of [casing, line]) {
        const el = pl?.getElement() as SVGPathElement | undefined;
        if (el) draw.push(el);
      }
      const st = stitch?.getElement() as SVGPathElement | undefined;
      if (st) fade.push(st);
    }
    if (this.connectorGroup && this.map?.hasLayer(this.connectorGroup)) {
      this.connectorGroup.eachLayer((l) => {
        const el = (l as L.Polyline).getElement() as SVGPathElement | undefined;
        if (el) fade.push(el);
      });
    }
    return { draw, fade };
  }

  private hideRoutes(tls: TripLayer[]): void {
    this.cancelDraw?.();
    this.cancelDraw = null;
    if (this.reducedMotion) return;
    const { draw, fade } = this.routePaths(tls);
    [...draw, ...fade].forEach((el) => el.classList.add(WAIT_CLASS));
  }

  private drawIn(tls: TripLayer[]): void {
    this.cancelDraw?.();
    const { draw, fade } = this.routePaths(tls);
    this.cancelDraw = playRouteDrawIn(draw, fade, { durationMs: 1300, reducedMotion: this.reducedMotion });
  }

  // -------------------------------------------------------------------------
  // Camera

  /** Screen padding that keeps content clear of the top bar, timeline and card. */
  private padding(override?: Partial<Padding>): Padding {
    const map = this.map;
    const size = map ? map.getSize() : L.point(390, 800);
    const desktop = matches(DESKTOP_QUERY);
    // Pins rise PIN_HEIGHT above their coordinate and spread PIN_SIZE/2 to each side.
    const side = (desktop ? 48 : 20) + PIN_SIZE / 2;
    const p: Padding = { top: this.insets.top + PIN_HEIGHT, right: side, bottom: this.insets.bottom + 24, left: side };
    if (this.cardOpen) {
      if (desktop) p.right += this.insets.cardWidth;
      else p.bottom = Math.max(p.bottom, Math.round(size.y * this.insets.sheetRatio) + 24);
    }
    Object.assign(p, override);
    // Always leave at least ~100px of usable map in each direction.
    const fit = (a: number, b: number, total: number): [number, number] => {
      const max = Math.max(0, total - 100);
      if (a + b <= max) return [a, b];
      const k = max / (a + b || 1);
      return [Math.floor(a * k), Math.floor(b * k)];
    };
    [p.top, p.bottom] = fit(p.top, p.bottom, size.y);
    [p.left, p.right] = fit(p.left, p.right, size.x);
    return p;
  }

  /** Map center that puts `latlng` in the middle of the unobscured area at `zoom`. */
  private offsetCenter(latlng: L.LatLng, zoom: number, p: Padding): L.LatLng {
    const map = this.map!;
    const px = map.project(latlng, zoom).add(L.point((p.right - p.left) / 2, (p.bottom - p.top) / 2));
    return map.unproject(px, zoom);
  }

  /** Flight time: ~1.6s for short hops, up to ~2.2s for city-to-city / cross-country. */
  private flightSeconds(to: L.LatLng): number {
    const map = this.map!;
    const km = map.distance(map.getCenter(), to) / 1000;
    const t = Math.min(1, Math.log10(1 + km) / 3.5); // 0 at 0km, ~1 at 3000km
    return 1.6 + 0.6 * t;
  }

  /**
   * Run a camera move, then `after` once it settles (moveend, or a timeout if the camera
   * didn't move or the user interrupted the flight).
   */
  private afterCamera(move: () => void, after: () => void): void {
    const map = this.map;
    if (!map) return;
    this.cancelAfterCamera?.();
    let done = false;
    let timer = 0;
    let raf = 0;
    const run = () => {
      if (done) return;
      done = true;
      map.off("moveend", run);
      window.clearTimeout(timer);
      this.cancelAfterCamera = null;
      // Let the SVG renderer reproject paths on moveend before we measure them.
      raf = window.requestAnimationFrame(() => after());
    };
    this.cancelAfterCamera = () => {
      done = true;
      map.off("moveend", run);
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
    };
    map.on("moveend", run);
    move();
    if (!done) timer = window.setTimeout(run, 2600);
  }

  fitChapter(trips: Trip[], opts: { animate?: boolean; padding?: Partial<Padding> } = {}): void {
    const map = this.map;
    if (!map) return;
    const pts = trips.flatMap((t) => t.moments.map((m) => L.latLng(m.lat, m.lng)));
    const animate = (opts.animate ?? true) && !this.reducedMotion;
    if (!pts.length) {
      this.showEmpty(animate);
      return;
    }
    const p = this.padding(opts.padding);
    const bounds = L.latLngBounds(pts);
    if (pts.length === 1 || bounds.getNorthEast().equals(bounds.getSouthWest(), 1e-6)) {
      this.flyToPoint(bounds.getCenter(), MOMENT_ZOOM, p, animate);
      return;
    }
    const fitOpts: L.FitBoundsOptions = {
      paddingTopLeft: [p.left, p.top],
      paddingBottomRight: [p.right, p.bottom],
      maxZoom: MAX_FIT_ZOOM,
    };
    if (animate) {
      map.flyToBounds(bounds, { ...fitOpts, duration: this.flightSeconds(bounds.getCenter()), easeLinearity: 0.1 });
    } else {
      map.fitBounds(bounds, { ...fitOpts, animate: false });
    }
  }

  focusMoment(moment: Moment, opts: { padding?: Partial<Padding> } = {}, animate = true): void {
    const map = this.map;
    if (!map) return;
    const zoom = Math.min(MAX_FOCUS_ZOOM, Math.max(map.getZoom(), MOMENT_ZOOM));
    this.flyToPoint(L.latLng(moment.lat, moment.lng), zoom, this.padding(opts.padding), animate && !this.reducedMotion);
  }

  private flyToPoint(latlng: L.LatLng, zoom: number, p: Padding, animate: boolean): void {
    const map = this.map!;
    const center = this.offsetCenter(latlng, zoom, p);
    if (!animate) {
      map.setView(center, zoom, { animate: false });
      return;
    }
    const sameZoom = Math.abs(map.getZoom() - zoom) < 0.01;
    const size = map.getSize();
    const pxDist = map.latLngToContainerPoint(center).distanceTo(size.divideBy(2));
    if (sameZoom && pxDist < Math.max(size.x, size.y) * 1.5) {
      // Short hop at the same zoom: a gentle pan reads better than a zoom-out/zoom-in arc.
      map.panTo(center, { animate: true, duration: 0.7, easeLinearity: 0.2 });
    } else {
      map.flyTo(center, zoom, { duration: this.flightSeconds(center), easeLinearity: 0.1 });
    }
  }

  private showEmpty(animate: boolean): void {
    const map = this.map;
    if (!map) return;
    const desktop = matches(DESKTOP_QUERY);
    const { lat, lng, zoom } = this.emptyView;
    const z = desktop ? zoom : Math.max(2, zoom - 1);
    if (animate && !this.reducedMotion) map.flyTo([lat, lng], z, { duration: 1.6, easeLinearity: 0.15 });
    else map.setView([lat, lng], z, { animate: false });
  }
}
