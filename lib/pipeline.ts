import type { BatchProgress, ClusterOptions, Photo, Trip, TripInfo } from "@/lib/types";
import { DEFAULT_CLUSTER_OPTIONS, TRIP_COLORS } from "@/lib/types";
import { readPhotos } from "@/lib/exif";
import { scoreSharpnessBatch } from "@/lib/sharpness";
import { clusterPhotos } from "@/lib/cluster";
import { nameMoments } from "@/lib/geocode";
import { uid } from "@/lib/util";

type OnProgress = (p: BatchProgress) => void;

/**
 * Turn already-read photos into a Trip: score sharpness (only where missing),
 * cluster into moments, pick covers, then name places. All in the browser.
 */
export async function buildTrip(
  photos: Photo[],
  info: TripInfo,
  opts: ClusterOptions = DEFAULT_CLUSTER_OPTIONS,
  colorIndex = 0,
  onProgress?: OnProgress,
  options: { geocode?: boolean } = {},
): Promise<Trip> {
  const tripId = uid("trip");

  const needScore = photos.filter((p) => p.sharpness === undefined);
  if (needScore.length) {
    onProgress?.({ stage: "scoring", done: 0, total: needScore.length });
    const scores = await scoreSharpnessBatch(
      needScore.map((p) => p.thumbUrl || p.url),
      (done) => onProgress?.({ stage: "scoring", done, total: needScore.length }),
    );
    needScore.forEach((p, i) => (p.sharpness = scores[i]));
  }

  onProgress?.({ stage: "clustering", done: 0, total: 1 });
  const placed = photos.filter((p) => p.lat !== undefined && p.lng !== undefined);
  const unplaced = photos.filter((p) => p.lat === undefined || p.lng === undefined);
  const moments = clusterPhotos(placed, tripId, opts);
  onProgress?.({ stage: "clustering", done: 1, total: 1 });

  if (options.geocode !== false) {
    onProgress?.({ stage: "naming", done: 0, total: moments.length });
    await nameMoments(moments, (done) => onProgress?.({ stage: "naming", done, total: moments.length }));
  }

  const times = placed
    .map((p) => p.takenAt)
    .filter((t): t is string => !!t)
    .sort();

  const trip: Trip = {
    id: tripId,
    title: info.title || "Untitled trip",
    note: info.note,
    startDate: info.startDate || times[0]?.slice(0, 10),
    endDate: info.endDate || times[times.length - 1]?.slice(0, 10),
    color: TRIP_COLORS[colorIndex % TRIP_COLORS.length],
    photos: Object.fromEntries(photos.map((p) => [p.id, p])),
    moments,
    unplacedPhotoIds: unplaced.map((p) => p.id),
    createdAt: new Date().toISOString(),
  };
  onProgress?.({ stage: "done", done: 1, total: 1 });
  return trip;
}

/** Full upload path: read EXIF + make web images, then buildTrip. */
export async function processFiles(
  files: File[],
  info: TripInfo,
  opts: ClusterOptions = DEFAULT_CLUSTER_OPTIONS,
  colorIndex = 0,
  onProgress?: OnProgress,
): Promise<Trip> {
  onProgress?.({ stage: "reading", done: 0, total: files.length });
  const photos = await readPhotos(files, (done) => onProgress?.({ stage: "reading", done, total: files.length }));
  return buildTrip(photos, info, opts, colorIndex, onProgress);
}
