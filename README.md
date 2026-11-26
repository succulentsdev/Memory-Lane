# Memory Lane (MVP Phase 1)

Turn a batch of trip photos into an interactive, shareable scrapbook map. Everything runs in the browser: EXIF parsing, sharpness scoring and clustering never send photos to a server.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

To try it on your phone, run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer's-LAN-IP>:3000` on the same Wi-Fi.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:demo` | Single-page static demo in `demo-dist/` (hash routes, no Next server) |

Optional keys go in `.env.local` (see `.env.example`). With none set, everything still works.

## What works

- **Upload:** drag and drop photos or a whole folder, or pick them (iPhone photo picker works). EXIF GPS and DateTimeOriginal are read with `exifr`; images are downscaled to 1600px web copies and 360px thumbnails in the browser. HEIC is read for metadata; it displays only where the browser can decode it (Safari).
- **Clustering:** photos within a radius (default 150 m) and time window (default 90 min) become one moment. Adjustable under "Grouping" on the upload page.
- **Best shot:** Laplacian variance on a 256px canvas, computed in a Web Worker (main-thread fallback). The sharpest photo becomes the pin's cover and the next sharpest fill up to 3 favorites. Swap the cover or star favorites on the card.
- **Map:** Leaflet + CARTO Voyager tiles (no key), polaroid photo pins, a chronological route that draws in and slowly "marches", dashed connectors between trips, smooth fly-to between chapters.
- **Scrapbook card:** slide-over (right panel on desktop, draggable bottom sheet on phone) with photos, place name, date/time, a memory note, prev/next, and "What it looked like here".
- **Context view:** Mapillary if `NEXT_PUBLIC_MAPILLARY_TOKEN` is set, else Google Street View if `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set, else a static OpenStreetMap area snapshot centered on the spot.
- **Place names:** Nominatim reverse geocoding, throttled to 1 request/second and cached; falls back to coordinates.
- **Timeline:** chapter chips (All trips + each trip), a scrubber with a dot per moment, keyboard support, and a play button that tours chapters and moments.
- **Sample trip:** "Load sample trip: Portland" builds 3 chapters (Portland Weekend, Coastal Road Trip, San Diego) through the real pipeline, with illustrated postcard photos including deliberately blurry retakes.
- **Gift Mode:** Share creates a read-only link at `/share/<slug>` with no sign-in.

## Stubbed or limited

- **Storage is local only.** `lib/storage` defines a `StorageAdapter` interface; the `LocalStorageAdapter` keeps scrapbooks in localStorage and images in IndexedDB. Gift links for your own uploads therefore open only on the device that made them; the Portland sample link works anywhere. A Supabase adapter is the next step.
- **Trips live in memory** until you share; a reload clears uploads that weren't shared.
- **AI Scrapbook Assistant** (`lib/ai/assistant.ts`) is off by default and only ever receives curated cover photos (max 20). It uses an offline mock provider until a server route with an API key exists.
- **Mapbox** is not wired yet. `lib/map-adapter.ts` is the swap point (`createMapAdapter("mapbox")`).
- **Freemium:** `Scrapbook.plan` and `PlanLimits` types exist; nothing is enforced.

## Layout

```
app/                 page.tsx (upload), trip/page.tsx (map), share/[slug] (Gift Mode)
components/          Uploader, MapView, PhotoPin, RouteLine, ScrapbookCard, ContextView,
                     TimelineScrubber, ScrapbookView, ShareDialog
lib/                 types, store, pipeline, exif, image, cluster, sharpness(-math),
                     geocode, map-adapter, leaflet-adapter, share, storage/, ai/
workers/             sharpness.worker.ts
data/                sample-trips.ts, sample-art.ts
demo/, scripts/      single-page demo build (hash router + Next shims)
```
