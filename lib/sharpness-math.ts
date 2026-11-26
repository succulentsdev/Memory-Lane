// Owned by the "clustering + sharpness" builder.
// Pure math, no DOM / worker APIs, so both lib/sharpness.ts (main-thread fallback)
// and workers/sharpness.worker.ts can import it without pulling in each other.

/**
 * Variance of the 3x3 Laplacian response ([0,1,0; 1,-4,1; 0,1,0]) over the
 * interior pixels of an RGBA image, after converting to luma (0.299/0.587/0.114).
 * Higher = more edge energy = sharper. Returns 0 for images smaller than 3x3.
 */
export function laplacianVariance(data: Uint8ClampedArray, w: number, h: number): number {
  if (!(w >= 3 && h >= 3) || data.length < w * h * 4) return 0;

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const v = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return variance > 0 ? variance : 0;
}

/** Long edge (px) every image is resized to before scoring, so scores are comparable. */
export const SHARPNESS_LONG_EDGE = 256;

/**
 * Label thresholds for Laplacian variance on a 256px-long-edge luma image (0–255 scale).
 * Downscaling to 256px already concentrates detail, so these sit higher than the
 * classic full-resolution "variance < 100 = blurry" rule of thumb:
 *   score <  0          → "unknown" (couldn't score: tainted canvas, decode failure…)
 *   0   ≤ score < 80    → "soft"   (motion blur, missed focus, fog, flat scenes)
 *   80  ≤ score < 300   → "ok"
 *   300 ≤ score         → "sharp"
 */
export const SHARPNESS_THRESHOLDS = { soft: 80, sharp: 300 } as const;

export function sharpnessLabel(score: number | undefined): "sharp" | "ok" | "soft" | "unknown" {
  if (score === undefined || !Number.isFinite(score) || score < 0) return "unknown";
  if (score >= SHARPNESS_THRESHOLDS.sharp) return "sharp";
  if (score >= SHARPNESS_THRESHOLDS.soft) return "ok";
  return "soft";
}
