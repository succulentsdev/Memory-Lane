// Owned by the "upload + EXIF" builder. Client-side only: turns a raw photo File into
// web-ready object URLs (downscaled JPEG + small thumbnail). Never throws.

export interface WebImages {
  url: string;
  thumbUrl: string;
  width?: number;
  height?: number;
}

const MAX_EDGE = 1600;
const THUMB_EDGE = 360;
const QUALITY = 0.82;
const THUMB_QUALITY = 0.78;

type Source = { image: CanvasImageSource; width: number; height: number; dispose: () => void };

async function decodeWithBitmap(file: File): Promise<Source | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      // Some older engines reject the options bag; try without it.
      bmp = await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  if (!bmp || !bmp.width || !bmp.height) {
    bmp?.close();
    return null;
  }
  const b = bmp;
  return { image: b, width: b.width, height: b.height, dispose: () => b.close() };
}

async function decodeWithImg(file: File): Promise<Source | null> {
  if (typeof document === "undefined") return null;
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode failed"));
      });
    }
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) {
      URL.revokeObjectURL(src);
      return null;
    }
    return { image: img, width, height, dispose: () => URL.revokeObjectURL(src) };
  } catch {
    URL.revokeObjectURL(src);
    return null;
  }
}

function fit(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function renderJpeg(src: Source, maxEdge: number, quality: number): Promise<Blob | null> {
  const { w, h } = fit(src.width, src.height, maxEdge);
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src.image, 0, 0, w, h);
        return await canvas.convertToBlob({ type: "image/jpeg", quality });
      }
    }
  } catch {
    // fall through to a DOM canvas
  }
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src.image, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  } catch {
    return null;
  }
}

/**
 * Decode (respecting EXIF orientation), downscale to 1600px for `url` and ~360px for `thumbUrl`.
 * If the browser can't decode the file (e.g. HEIC on Chrome), both URLs point at the original file.
 */
export async function makeWebImages(file: File): Promise<WebImages> {
  let src: Source | null = null;
  try {
    src = (await decodeWithBitmap(file)) ?? (await decodeWithImg(file));
    if (src) {
      const big = await renderJpeg(src, MAX_EDGE, QUALITY);
      const small = big ? await renderJpeg(src, THUMB_EDGE, THUMB_QUALITY) : null;
      if (big) {
        const { w, h } = fit(src.width, src.height, MAX_EDGE);
        const url = URL.createObjectURL(big);
        const thumbUrl = small ? URL.createObjectURL(small) : url;
        return { url, thumbUrl, width: w, height: h };
      }
    }
  } catch {
    // fall through to the original file
  } finally {
    try {
      src?.dispose();
    } catch {
      /* ignore */
    }
  }
  try {
    const url = URL.createObjectURL(file);
    return { url, thumbUrl: url };
  } catch {
    return { url: "", thumbUrl: "" };
  }
}
