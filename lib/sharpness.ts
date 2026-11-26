// Owned by the "clustering + sharpness" builder.
// Sharpness = variance of the Laplacian on a canvas downscaled to a 256px long edge.
// Pixels are read on the main thread (canvas), the math runs in a Web Worker,
// with a main-thread fallback when workers are unavailable or fail.
import { SHARPNESS_LONG_EDGE, laplacianVariance, sharpnessLabel, SHARPNESS_THRESHOLDS } from "@/lib/sharpness-math";

export { laplacianVariance, sharpnessLabel, SHARPNESS_THRESHOLDS, SHARPNESS_LONG_EDGE };

const CONCURRENCY = 3;
const WORKER_TIMEOUT_MS = 15000;

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Load an image (object URL, data: URL incl. SVG, same-origin path). Rejects on failure. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    try {
      const u = new URL(src, window.location.href);
      if ((u.protocol === "http:" || u.protocol === "https:") && u.origin !== window.location.origin) {
        img.crossOrigin = "anonymous";
      }
    } catch {
      /* unparsable src: let the browser try anyway */
    }
    let settled = false;
    const done = (ok: boolean, err?: unknown) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(img);
      else reject(err ?? new Error("image load failed"));
    };
    img.onload = () => done(true);
    img.onerror = (e) => done(false, e);
    img.src = src;
    if (typeof img.decode === "function") {
      img.decode().then(
        () => done(true),
        // decode() can reject spuriously (e.g. some SVGs); onload/onerror still settle it.
        () => {
          if (img.complete && img.naturalWidth > 0) done(true);
        },
      );
    }
  });
}

/** Draw onto a canvas with the long edge at 256px and read RGBA. Returns null if unreadable (e.g. tainted). */
function rasterize(img: HTMLImageElement, canvas: HTMLCanvasElement): Pixels | null {
  // SVGs without intrinsic size report 0x0; score them as a 256 square.
  const nw = img.naturalWidth || img.width || SHARPNESS_LONG_EDGE;
  const nh = img.naturalHeight || img.height || SHARPNESS_LONG_EDGE;
  const scale = SHARPNESS_LONG_EDGE / Math.max(nw, nh);
  const width = Math.max(3, Math.round(nw * scale));
  const height = Math.max(3, Math.round(nh * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, width, height);
    // Transparent areas (SVG art) read as white rather than black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { data, width, height };
  } catch {
    return null; // tainted canvas or draw failure
  }
}

type Pending = { resolve: (score: number) => void; pixels: Pixels | null; timer: ReturnType<typeof setTimeout> };

/** One worker shared across a batch; falls back to main-thread math if it breaks. */
class SharpnessWorkerClient {
  private worker: Worker | null = null;
  private broken = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    if (typeof Worker === "undefined") {
      this.broken = true;
      return;
    }
    try {
      this.worker = new Worker(new URL("../workers/sharpness.worker.ts", import.meta.url));
      this.worker.onmessage = (e: MessageEvent<{ id: number; score: number }>) => {
        const p = this.pending.get(e.data?.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        clearTimeout(p.timer);
        const s = e.data.score;
        p.resolve(typeof s === "number" && Number.isFinite(s) ? s : -1);
      };
      this.worker.onerror = (e) => {
        e.preventDefault?.();
        this.fail();
      };
      this.worker.onmessageerror = () => this.fail();
    } catch {
      this.broken = true;
      this.worker = null;
    }
  }

  /** Worker died: compute everything still pending on the main thread. */
  private fail() {
    this.broken = true;
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const p of entries) {
      clearTimeout(p.timer);
      p.resolve(p.pixels ? safeVariance(p.pixels) : -1);
    }
  }

  score(px: Pixels): Promise<number> {
    if (this.broken || !this.worker) return Promise.resolve(safeVariance(px));
    return new Promise((resolve) => {
      const id = this.nextId++;
      // Keep a copy only so a dying worker can still be recovered from; the original buffer is transferred.
      const backup: Pixels = { data: new Uint8ClampedArray(px.data), width: px.width, height: px.height };
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        resolve(safeVariance(backup));
      }, WORKER_TIMEOUT_MS);
      this.pending.set(id, { resolve, pixels: backup, timer });
      try {
        const buffer = px.data.buffer as ArrayBuffer;
        this.worker!.postMessage({ id, buffer, width: px.width, height: px.height }, [buffer]);
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        resolve(safeVariance(backup));
      }
    });
  }

  dispose() {
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
  }
}

function safeVariance(px: Pixels): number {
  try {
    const v = laplacianVariance(px.data, px.width, px.height);
    return Number.isFinite(v) ? v : -1;
  } catch {
    return -1;
  }
}

/**
 * Laplacian variance per image (higher = sharper), computed in a Web Worker on a
 * canvas downscaled to a 256px long edge. NEVER throws; -1 = couldn't score.
 * Results are in the same order as `srcs`. `onEach(done)` fires after each image.
 */
export async function scoreSharpnessBatch(srcs: string[], onEach?: (done: number) => void): Promise<number[]> {
  const results: number[] = srcs.map(() => -1);
  if (!srcs.length) return results;
  if (typeof document === "undefined" || typeof Image === "undefined") return results;

  let client: SharpnessWorkerClient | null = null;
  try {
    client = new SharpnessWorkerClient();
  } catch {
    client = null;
  }

  let next = 0;
  let done = 0;
  const report = () => {
    done++;
    try {
      onEach?.(done);
    } catch {
      /* a progress callback must not break scoring */
    }
  };

  const lane = async () => {
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = document.createElement("canvas");
    } catch {
      canvas = null;
    }
    while (next < srcs.length) {
      const i = next++;
      let score = -1;
      try {
        const src = srcs[i];
        if (src && canvas) {
          const img = await loadImage(src);
          const px = rasterize(img, canvas);
          if (px) score = client ? await client.score(px) : safeVariance(px);
        }
      } catch {
        score = -1;
      }
      results[i] = score;
      report();
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, srcs.length) }, lane));
  } catch {
    /* lanes catch their own errors; belt and braces */
  } finally {
    client?.dispose();
  }
  return results;
}
