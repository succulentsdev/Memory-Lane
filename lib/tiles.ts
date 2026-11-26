/**
 * Raster basemap. Defaults to the standard OpenStreetMap tiles (no key, attribution required).
 * CARTO's basemaps now need an API key, so they are no longer the default.
 * Set NEXT_PUBLIC_TILE_URL (and NEXT_PUBLIC_TILE_ATTRIBUTION) to use another provider,
 * e.g. a keyed CARTO, Stadia or MapTiler URL with {z}/{x}/{y} placeholders.
 */
export const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILE_ATTRIBUTION_TEXT = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || "© OpenStreetMap contributors";

export const TILE_ATTRIBUTION_HTML = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION
  ? process.env.NEXT_PUBLIC_TILE_ATTRIBUTION
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TILE_MAX_ZOOM = Number(process.env.NEXT_PUBLIC_TILE_MAX_ZOOM) || 19;

/** One tile URL for a given z/x/y (used by the static area snapshot). */
export function tileSrc(z: number, x: number, y: number): string {
  return TILE_URL.replace("{s}", "a").replace("{r}", "").replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}
