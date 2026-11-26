// Owned by the "upload + EXIF" builder. Reads GPS + capture time with exifr and makes
// web-ready images, all in the browser. Nothing is uploaded anywhere.
import exifr from "exifr";
import type { Photo } from "@/lib/types";
import { makeWebImages } from "@/lib/image";
import { uid } from "@/lib/util";

const IMAGE_EXT = /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?|dng)$/i;
const CONCURRENCY = 4;

/** True for anything that looks like a photo (by MIME type or by extension). */
export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

interface ExifMeta {
  lat?: number;
  lng?: number;
  takenAt?: string;
}

function toNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** [deg, min, sec] → decimal degrees, signed by ref (S/W negative). */
function dmsToDecimal(v: unknown, ref: unknown): number | undefined {
  let deg: number | undefined;
  if (Array.isArray(v) && v.length >= 1) {
    const [d = 0, m = 0, s = 0] = v.map(Number);
    deg = d + m / 60 + s / 3600;
  } else {
    deg = toNumber(v);
  }
  if (deg === undefined || !Number.isFinite(deg)) return undefined;
  if (typeof ref === "string" && /^[SW]/i.test(ref)) deg = -Math.abs(deg);
  return deg;
}

function toIso(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "string") {
    // Raw EXIF form "YYYY:MM:DD HH:MM:SS" (when not revived).
    const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function validCoord(lat?: number, lng?: number): boolean {
  if (lat === undefined || lng === undefined) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // 0,0 is what some apps write when location was stripped.
  return !(lat === 0 && lng === 0);
}

async function readMeta(file: File): Promise<ExifMeta> {
  try {
    const out = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "DateTimeDigitized",
        "ModifyDate",
        "GPSLatitude",
        "GPSLatitudeRef",
        "GPSLongitude",
        "GPSLongitudeRef",
      ],
    });
    if (!out || typeof out !== "object") return {};
    const o = out as Record<string, unknown>;
    let lat = toNumber(o.latitude);
    let lng = toNumber(o.longitude);
    if (lat === undefined || lng === undefined) {
      lat = dmsToDecimal(o.GPSLatitude, o.GPSLatitudeRef);
      lng = dmsToDecimal(o.GPSLongitude, o.GPSLongitudeRef);
    }
    const takenAt = toIso(o.DateTimeOriginal) ?? toIso(o.CreateDate) ?? toIso(o.DateTimeDigitized);
    return validCoord(lat, lng) ? { lat, lng, takenAt } : { takenAt };
  } catch {
    return {};
  }
}

function fallbackTime(file: File): string | undefined {
  if (!file.lastModified) return undefined;
  const d = new Date(file.lastModified);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function readOne(file: File): Promise<Photo | null> {
  try {
    const [meta, img] = await Promise.all([readMeta(file), makeWebImages(file)]);
    if (!img.url) return null;
    return {
      id: uid("ph"),
      name: file.name,
      url: img.url,
      thumbUrl: img.thumbUrl || img.url,
      width: img.width,
      height: img.height,
      lat: meta.lat,
      lng: meta.lng,
      takenAt: meta.takenAt ?? fallbackTime(file),
    };
  } catch {
    return null;
  }
}

/**
 * Read GPS + DateTimeOriginal with exifr and make web-ready images, all client-side.
 * Non-image files are skipped (but still counted in progress). Never throws for a bad file.
 * Photos without GPS are returned with lat/lng undefined. Order follows the input.
 */
export async function readPhotos(files: File[], onEach?: (done: number) => void): Promise<Photo[]> {
  const images = files.filter(isImageFile);
  let done = files.length - images.length;
  if (done > 0) onEach?.(done);

  const results: (Photo | null)[] = new Array(images.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < images.length) {
      const i = next++;
      results[i] = await readOne(images[i]);
      done++;
      onEach?.(done);
      // Yield so the tab stays responsive on big batches.
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, worker));
  return results.filter((p): p is Photo => p !== null);
}
