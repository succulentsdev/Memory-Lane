// Shared domain types for Memory Lane. Every module codes against these.

export type ID = string;

/** One photo after client-side processing. Raw files never leave the browser. */
export interface Photo {
  id: ID;
  name: string;
  /** Web-ready image (downscaled, compressed). Object URL, data URL or static path. */
  url: string;
  /** Small thumbnail for pins and grids (~320px). Falls back to url. */
  thumbUrl: string;
  width?: number;
  height?: number;
  /** GPS from EXIF (or sample data). Undefined if the photo has no location. */
  lat?: number;
  lng?: number;
  /** ISO 8601 from DateTimeOriginal (or file lastModified as a fallback). */
  takenAt?: string;
  /** Laplacian variance on a downscaled canvas. Higher = sharper. */
  sharpness?: number;
}

/** A cluster of photos taken close together in space and time = one pin. */
export interface Moment {
  id: ID;
  tripId: ID;
  /** Centroid of the cluster. */
  lat: number;
  lng: number;
  startAt: string; // ISO
  endAt: string; // ISO
  /** All photos in the cluster, chronological. */
  photoIds: ID[];
  /** Auto-picked sharpest photo; the user may swap it. */
  coverPhotoId: ID;
  /** 1–3 photos shown on the card (cover first). */
  favoriteIds: ID[];
  /** Reverse-geocoded or sample place name. */
  placeName?: string;
  /** Neighborhood / city line under the place name. */
  area?: string;
  /** User's memory note. */
  caption?: string;
  /** Suggested by the optional AI assistant; never auto-applied. */
  aiSuggestion?: string;
}

export interface TripInfo {
  title: string;
  note?: string;
  /** Optional user-entered range (ISO dates). Derived from photos if absent. */
  startDate?: string;
  endDate?: string;
}

export interface Trip extends TripInfo {
  id: ID;
  /** Accent color for this chapter's route and pins. */
  color: string;
  photos: Record<ID, Photo>;
  /** Chronological. */
  moments: Moment[];
  /** Photos that had no GPS, kept so the user can see what was skipped. */
  unplacedPhotoIds: ID[];
  createdAt: string;
}

/** A scrapbook is one or more trips (chapters). This is what gets shared. */
export interface Scrapbook {
  id: ID;
  /** Public read-only slug for Gift Mode. */
  slug: string;
  title: string;
  trips: Trip[];
  createdAt: string;
  updatedAt: string;
  /** Freemium hook: which plan this scrapbook was created on. */
  plan: PlanTier;
}

export type PlanTier = "free" | "plus";

/** Feature limits per plan. Not enforced in the MVP beyond helpers in lib/plan.ts. */
export interface PlanLimits {
  maxTrips: number;
  hdExport: boolean;
}

export interface ClusterOptions {
  /** Photos within this many meters of a cluster's centroid join it. Default 150. */
  radiusMeters: number;
  /** ...and within this many minutes of the cluster's last photo. Default 90. */
  timeWindowMinutes: number;
  /** How many favorites to keep per moment (cover included). Default 3. */
  maxFavorites: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  radiusMeters: 150,
  timeWindowMinutes: 90,
  maxFavorites: 3,
};

/** Progress reported while a batch is processed in the browser. */
export interface BatchProgress {
  stage: "reading" | "scoring" | "clustering" | "naming" | "done";
  done: number;
  total: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Warm chapter palette, used in order for new trips. */
export const TRIP_COLORS = ["#e0794a", "#2f8f83", "#c4517a", "#6d6bd1", "#d9a23b", "#4f8fc0"];
