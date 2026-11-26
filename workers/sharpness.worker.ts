// Owned by the "clustering + sharpness" builder.
// Module worker: receives a downscaled RGBA buffer, returns its Laplacian variance.
// Created from lib/sharpness.ts via `new Worker(new URL("../workers/sharpness.worker.ts", import.meta.url))`.
import { laplacianVariance } from "../lib/sharpness-math";

export interface SharpnessRequest {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface SharpnessResponse {
  id: number;
  /** -1 when the buffer could not be scored. */
  score: number;
}

const ctx = self as unknown as {
  onmessage: ((e: { data: SharpnessRequest }) => void) | null;
  postMessage: (msg: SharpnessResponse) => void;
};

ctx.onmessage = (e) => {
  const { id, buffer, width, height } = e.data;
  let score = -1;
  try {
    score = laplacianVariance(new Uint8ClampedArray(buffer), width, height);
    if (!Number.isFinite(score)) score = -1;
  } catch {
    score = -1;
  }
  ctx.postMessage({ id, score });
};
