/**
 * AI Scrapbook Assistant — optional caption hook. OFF by default.
 *
 * Why it is built this way:
 * - Privacy: no vision AI runs on every upload. Photos are processed in the
 *   browser and never leave it unless the user asks for a suggestion. Even
 *   then, only curated cover photos are sent (one per moment, at most 20 per
 *   trip), never the full camera roll.
 * - Cost: a handful of small cover thumbnails per request instead of hundreds
 *   of full-size images keeps every call cheap and predictable.
 * - Keys: the browser never holds an API key. A real provider would POST the
 *   CaptionInput to a server route (e.g. /api/ai/captions) that holds the key,
 *   rate-limits, and calls the vision model. Object URLs (blob:) only exist in
 *   this tab, so that provider must turn covers into small data URLs first.
 * - Suggestions are only ever suggestions: they are stored on
 *   Moment.aiSuggestion and the user chooses whether to use one.
 *
 * Enable with NEXT_PUBLIC_AI_ASSISTANT_ENABLED=true. Without a provider, the
 * offline mockCaptionProvider is used, which makes no network calls.
 */
import type { Moment, Photo, Trip } from "@/lib/types";
import { formatDateRange } from "@/lib/util";

export interface CaptionInput {
  coverImageUrls: string[];
  placeNames: string[];
  dateRange?: string;
  tripTitle?: string;
}

export interface CaptionProvider {
  suggest(input: CaptionInput): Promise<string[]>;
}

/** Hard ceiling on images sent in one request, whatever the caller asks for. */
const MAX_COVERS = 20;

export function isAssistantEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_ASSISTANT_ENABLED === "true";
}

/**
 * The only photos the assistant may see: each moment's cover, one per moment,
 * capped at `max` (≤ 20). With more moments than that, covers are sampled
 * evenly across the trip so the whole story is represented.
 */
export function selectCoverPhotos(trip: Trip, max = 20): Photo[] {
  const cap = Math.max(0, Math.min(Math.floor(max), MAX_COVERS));
  const covers = trip.moments
    .map((m) => trip.photos[m.coverPhotoId])
    .filter((p): p is Photo => !!p);
  if (covers.length <= cap) return covers;
  if (cap === 0) return [];
  if (cap === 1) return [covers[0]];
  const picked: Photo[] = [];
  for (let i = 0; i < cap; i++) picked.push(covers[Math.round((i * (covers.length - 1)) / (cap - 1))]);
  return picked;
}

function uniq(xs: (string | undefined)[]): string[] {
  return [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))];
}

function notConfigured(): Error {
  return new Error(
    "AI Scrapbook Assistant is not configured. Set NEXT_PUBLIC_AI_ASSISTANT_ENABLED=true and provide a CaptionProvider backed by a server route that holds the API key.",
  );
}

/** Caption ideas for a whole trip, from its curated covers only. */
export async function suggestCaptions(trip: Trip, provider: CaptionProvider = mockCaptionProvider): Promise<string[]> {
  if (!isAssistantEnabled()) throw notConfigured();
  const covers = selectCoverPhotos(trip);
  return provider.suggest({
    coverImageUrls: covers.map((p) => p.thumbUrl || p.url),
    placeNames: uniq(trip.moments.map((m) => m.placeName)),
    dateRange: formatDateRange(trip.startDate, trip.endDate) || undefined,
    tripTitle: trip.title,
  });
}

/** Caption ideas for one moment: sends just that moment's cover photo. */
export async function suggestMomentCaptions(
  trip: Trip,
  moment: Moment,
  provider: CaptionProvider = mockCaptionProvider,
): Promise<string[]> {
  if (!isAssistantEnabled()) throw notConfigured();
  const cover = trip.photos[moment.coverPhotoId];
  return provider.suggest({
    coverImageUrls: cover ? [cover.thumbUrl || cover.url] : [],
    placeNames: uniq([moment.placeName]),
    dateRange: formatDateRange(moment.startAt.slice(0, 10), moment.endAt.slice(0, 10)) || undefined,
    tripTitle: trip.title,
  });
}

/** Offline stand-in: gentle template suggestions, no network, no image analysis. */
export const mockCaptionProvider: CaptionProvider = {
  async suggest(input: CaptionInput): Promise<string[]> {
    const place = input.placeNames[0];
    const where = place && !/°[NS],/.test(place) ? place : "this spot";
    const trip = input.tripTitle?.trim();
    const when = input.dateRange;
    const ideas = [
      `The light at ${where} — I want to remember exactly how this felt.`,
      `Slow afternoon at ${where}. Nowhere to be but here.`,
      trip ? `A small, perfect moment from ${trip}.` : `A small, perfect moment worth keeping.`,
      when ? `${when}: the day we found ${where}.` : `The day we found ${where}.`,
    ];
    await new Promise((r) => setTimeout(r, 350));
    return ideas;
  },
};
