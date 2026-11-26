import type { LatLng } from "@/lib/types";

export function uid(prefix = "id"): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${r}`;
}

/** Short URL-safe slug for Gift Mode links. */
export function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `${base || "memories"}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Great-circle distance in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * ISO string that keeps the wall-clock time where the photo was taken, with its UTC offset,
 * e.g. 2026-11-07T16:20:00-08:00. Uses the Date's local fields; the offset defaults to the
 * local zone's offset at that moment.
 */
export function toLocalIso(d: Date, offsetMinutes = -d.getTimezoneOffset()): string {
  const p = (n: number) => String(Math.abs(Math.trunc(n))).padStart(2, "0");
  const sign = offsetMinutes < 0 ? "-" : "+";
  const off = `${sign}${p(offsetMinutes / 60)}:${p(offsetMinutes % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off}`;
}

/**
 * Timestamps with an explicit offset are shown as the wall-clock time at the place,
 * the same for every viewer. Older UTC ("Z") values fall back to the viewer's zone.
 */
function wallClock(iso: string): { d: Date; timeZone?: string } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?[+-]\d{2}:?\d{2}$/);
  if (m) return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))), timeZone: "UTC" };
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : { d };
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const w = wallClock(iso);
  if (!w) return "";
  return w.d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: w.timeZone });
}

export function formatTime(iso?: string): string {
  if (!iso) return "";
  const w = wallClock(iso);
  if (!w) return "";
  return w.d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: w.timeZone });
}

/** Calendar day (YYYY-MM-DD) as seen at the place, for same-day checks. */
export function localDay(iso?: string): string {
  if (!iso) return "";
  const w = wallClock(iso);
  if (!w) return "";
  return w.timeZone ? w.d.toISOString().slice(0, 10) : w.d.toDateString();
}

export function formatDateRange(start?: string, end?: string): string {
  if (!start) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const s = new Date(start + (start.length === 10 ? "T12:00:00" : ""));
  if (!end || end === start) return s.toLocaleDateString(undefined, opts);
  const e = new Date(end + (end.length === 10 ? "T12:00:00" : ""));
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${e.toLocaleDateString(undefined, opts)}`;
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
