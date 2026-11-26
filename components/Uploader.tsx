"use client";
// Owned by the "upload + EXIF" builder. Warm drag-and-drop uploader → processFiles → /trip.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStore } from "@/lib/store";
import { processFiles } from "@/lib/pipeline";
import { isImageFile } from "@/lib/exif";
import type { BatchProgress, Trip, TripInfo } from "@/lib/types";
import { cn } from "@/lib/util";

const STAGE_LABEL: Record<BatchProgress["stage"], string> = {
  reading: "Reading photos",
  scoring: "Finding the sharpest shots",
  clustering: "Grouping moments",
  naming: "Naming places",
  done: "All done",
};
// Overall bar: each stage owns a slice of 0–100%.
const STAGE_RANGE: Record<BatchProgress["stage"], [number, number]> = {
  reading: [0, 55],
  scoring: [55, 80],
  clustering: [80, 85],
  naming: [85, 99],
  done: [100, 100],
};
const STAGES: BatchProgress["stage"][] = ["reading", "scoring", "clustering", "naming"];
const PREVIEW_COUNT = 12;

type Phase =
  | { kind: "idle" }
  | { kind: "working"; progress: BatchProgress }
  | { kind: "partial"; trip: Trip }
  | { kind: "nogps"; total: number }
  | { kind: "error"; message: string };

// ---------- folder drop helpers (webkitGetAsEntry) ----------

function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  return new Promise((resolve) => {
    const step = () =>
      reader.readEntries(
        (batch) => {
          if (!batch.length) return resolve(all);
          all.push(...batch);
          step(); // readEntries returns at most ~100 at a time
        },
        () => resolve(all),
      );
    step();
  });
}

async function entryToFiles(entry: FileSystemEntry, depth = 0): Promise<File[]> {
  if (depth > 8) return [];
  if (entry.isFile) {
    return new Promise((resolve) => (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([])));
  }
  if (entry.isDirectory) {
    const children = await readAllEntries(entry as FileSystemDirectoryEntry);
    const nested = await Promise.all(children.filter((c) => !c.name.startsWith(".")).map((c) => entryToFiles(c, depth + 1)));
    return nested.flat();
  }
  return [];
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  // Grab entries synchronously: the DataTransfer is cleared after the first await.
  const entries = items
    .filter((it) => it.kind === "file")
    .map((it) => (typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null));
  if (entries.length && entries.every((e) => e)) {
    const nested = await Promise.all(entries.map((e) => entryToFiles(e as FileSystemEntry)));
    return nested.flat();
  }
  return Array.from(dt.files ?? []);
}

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

// ---------- small presentational bits ----------

function Thumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="relative h-16 w-14 shrink-0 rounded-sm bg-card p-1 pb-3 shadow-polaroid odd:-rotate-2 even:rotate-2">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-[2px] object-cover" onError={() => setBroken(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[2px] bg-paper-2 text-[9px] uppercase tracking-wide text-ink-faint">
          {file.name.split(".").pop()?.slice(0, 4) ?? "img"}
        </div>
      )}
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {props.label}
        </label>
        <span className="font-hand text-base text-accent-deep">{props.display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-2 h-10 w-full cursor-pointer accent-[var(--color-accent)]"
      />
      <p className="text-xs text-ink-faint">{props.hint}</p>
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------- main component ----------

export default function Uploader() {
  const router = useRouter();
  const { book, clusterOptions, dispatch } = useStore();
  const reduce = useReducedMotion();

  const [files, setFiles] = useState<File[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showGrouping, setShowGrouping] = useState(false);
  const [info, setInfo] = useState<TripInfo>({ title: "", startDate: "", endDate: "", note: "" });

  const photoInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const ids = { title: useId(), start: useId(), end: useId(), note: useId() };

  // webkitdirectory isn't in React's typings; set it on the element directly.
  useEffect(() => {
    const el = folderInput.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  const busy = phase.kind === "working";

  const addFiles = useCallback((incoming: File[]) => {
    const imgs = incoming.filter(isImageFile);
    setSkipped((s) => s + (incoming.length - imgs.length));
    setFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      const merged = [...prev];
      for (const f of imgs) {
        const k = fileKey(f);
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(f);
        }
      }
      return merged;
    });
    setPhase({ kind: "idle" });
  }, []);

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same files again
    if (list.length) addFiles(list);
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    try {
      const dropped = await filesFromDrop(e.dataTransfer);
      if (dropped.length) addFiles(dropped);
    } catch {
      addFiles(Array.from(e.dataTransfer.files ?? []));
    }
  };

  const clear = () => {
    setFiles([]);
    setSkipped(0);
    setPhase({ kind: "idle" });
  };

  const dateError = info.startDate && info.endDate && info.endDate < info.startDate ? "The end date is before the start date." : null;

  const makeMap = async () => {
    if (!files.length || busy || dateError) return;
    setPhase({ kind: "working", progress: { stage: "reading", done: 0, total: files.length } });
    try {
      const tripInfo: TripInfo = {
        title: info.title?.trim() || "",
        note: info.note?.trim() || undefined,
        startDate: info.startDate || undefined,
        endDate: info.endDate || undefined,
      };
      const trip = await processFiles(files, tripInfo, clusterOptions, book.trips.length, (p) =>
        setPhase({ kind: "working", progress: p }),
      );
      const total = Object.keys(trip.photos).length;
      if (!trip.moments.length) {
        setPhase({ kind: "nogps", total });
        return;
      }
      if (!trip.title || trip.title === "Untitled trip") {
        // Only use a real place name; a coordinate label makes a poor title.
        const first = trip.moments.find((m) => m.area)?.area;
        const when = trip.startDate ? new Date(trip.startDate + "T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
        trip.title = first ? `${first.split(",").pop()!.trim()} trip` : when ? `Trip, ${when}` : "Untitled trip";
      }
      dispatch({ type: "addTrip", trip });
      if (trip.unplacedPhotoIds.length) {
        setPhase({ kind: "partial", trip });
      } else {
        router.push("/trip");
      }
    } catch (err) {
      console.error(err);
      setPhase({ kind: "error", message: "Something went wrong while reading your photos. Please try again, or try a smaller batch." });
    }
  };

  const loadSample = async () => {
    if (sampleLoading || busy) return;
    setSampleLoading(true);
    setSampleError(null);
    try {
      const { loadSampleScrapbook } = await import("@/data/sample-trips");
      const sample = await loadSampleScrapbook();
      if (!sample.trips.length) {
        setSampleError("The sample trip isn't ready yet. Try again in a moment.");
        return;
      }
      if (book.trips.length) {
        // Keep the user's own trips: add the sample chapters alongside them.
        sample.trips.forEach((trip) => dispatch({ type: "addTrip", trip }));
        dispatch({ type: "setChapter", chapter: "all" });
      } else {
        dispatch({ type: "setBook", book: sample });
      }
      router.push("/trip");
    } catch (err) {
      console.error(err);
      setSampleError("Couldn't load the sample trip. Please try again.");
    } finally {
      setSampleLoading(false);
    }
  };

  const percent = useMemo(() => {
    if (phase.kind !== "working") return 0;
    const { stage, done, total } = phase.progress;
    const [a, b] = STAGE_RANGE[stage];
    const frac = total > 0 ? Math.min(1, done / total) : 0;
    return Math.round(a + (b - a) * frac);
  }, [phase]);

  const preview = files.slice(0, PREVIEW_COUNT);
  const fade = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  return (
    <section aria-label="Add your trip photos" className="space-y-5">
      {/* Drop zone */}
      <div
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative rounded-3xl border-2 border-dashed bg-card/80 px-5 py-8 text-center shadow-polaroid transition-colors sm:px-8 sm:py-10",
          dragging ? "border-accent bg-accent/5" : "border-line",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <div aria-hidden className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper-2 text-accent">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m21 16-5-5-8 8" />
          </svg>
        </div>
        <p className="font-display text-xl text-ink sm:text-2xl">{dragging ? "Let go to add them" : "Drop your trip photos here"}</p>
        <p className="mt-1 text-sm text-ink-soft">Photos or a whole folder. JPEG, HEIC, PNG and WebP all work.</p>

        <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={busy}
            className="min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-white shadow-polaroid transition hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            Choose photos
          </button>
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            disabled={busy}
            className="hidden min-h-11 rounded-full border border-line bg-card px-6 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 sm:inline-flex sm:items-center sm:justify-center"
          >
            Choose a folder
          </button>
        </div>

        <input ref={photoInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={onInput} />
        <input ref={folderInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={onInput} />

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Photos are processed in your browser. Nothing is uploaded.
        </p>
      </div>

      {/* Selection summary */}
      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div key="selection" {...fade} className="rounded-2xl border border-line bg-card p-4 shadow-polaroid">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink">
                <span className="font-display text-lg">{files.length}</span> photo{files.length === 1 ? "" : "s"} ready
                {skipped > 0 && <span className="text-ink-faint"> · skipped {skipped} non-photo file{skipped === 1 ? "" : "s"}</span>}
              </p>
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className="min-h-10 rounded-full px-3 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-2 pt-1">
              {preview.map((f) => (
                <Thumb key={fileKey(f)} file={f} />
              ))}
              {files.length > PREVIEW_COUNT && (
                <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded-sm bg-paper-2 font-hand text-sm text-ink-soft">
                  +{files.length - PREVIEW_COUNT}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trip details (optional) */}
      <div className="rounded-2xl border border-line bg-card/70">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left"
        >
          <span>
            <span className="font-display text-base text-ink">Trip details</span>
            <span className="ml-2 text-xs text-ink-faint">optional</span>
          </span>
          <Chevron open={showDetails} />
        </button>
        {showDetails && (
          <div className="grid gap-3 border-t border-line px-4 pb-4 pt-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={ids.title} className="text-sm font-medium text-ink">
                Trip name
              </label>
              <input
                id={ids.title}
                value={info.title}
                onChange={(e) => setInfo({ ...info, title: e.target.value })}
                placeholder="Portland weekend"
                maxLength={80}
                className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor={ids.start} className="text-sm font-medium text-ink">
                Start date
              </label>
              <input
                id={ids.start}
                type="date"
                value={info.startDate}
                onChange={(e) => setInfo({ ...info, startDate: e.target.value })}
                className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor={ids.end} className="text-sm font-medium text-ink">
                End date
              </label>
              <input
                id={ids.end}
                type="date"
                value={info.endDate}
                min={info.startDate || undefined}
                onChange={(e) => setInfo({ ...info, endDate: e.target.value })}
                className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink focus:border-accent focus:outline-none"
              />
            </div>
            {dateError && <p className="text-sm text-rose sm:col-span-2">{dateError}</p>}
            <div className="sm:col-span-2">
              <label htmlFor={ids.note} className="text-sm font-medium text-ink">
                A short note
              </label>
              <textarea
                id={ids.note}
                value={info.note}
                onChange={(e) => setInfo({ ...info, note: e.target.value })}
                placeholder="Our first trip together…"
                rows={2}
                maxLength={280}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 font-hand text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
            </div>
            <p className="text-xs text-ink-faint sm:col-span-2">Leave dates empty and we&apos;ll take them from your photos.</p>
          </div>
        )}
      </div>

      {/* Grouping settings */}
      <div className="rounded-2xl border border-line bg-card/70">
        <button
          type="button"
          onClick={() => setShowGrouping((v) => !v)}
          aria-expanded={showGrouping}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left"
        >
          <span>
            <span className="font-display text-base text-ink">Grouping</span>
            <span className="ml-2 text-xs text-ink-faint">how photos become pins</span>
          </span>
          <Chevron open={showGrouping} />
        </button>
        {showGrouping && (
          <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
            <Slider
              label="Same place within"
              value={clusterOptions.radiusMeters}
              min={50}
              max={500}
              step={10}
              display={`${clusterOptions.radiusMeters} m`}
              hint="Smaller makes more, tighter pins."
              onChange={(v) => dispatch({ type: "setClusterOptions", opts: { ...clusterOptions, radiusMeters: v } })}
            />
            <Slider
              label="Same moment within"
              value={clusterOptions.timeWindowMinutes}
              min={15}
              max={360}
              step={15}
              display={formatMinutes(clusterOptions.timeWindowMinutes)}
              hint="Photos further apart in time start a new pin."
              onChange={(v) => dispatch({ type: "setClusterOptions", opts: { ...clusterOptions, timeWindowMinutes: v } })}
            />
            <Slider
              label="Favorites per pin"
              value={clusterOptions.maxFavorites}
              min={1}
              max={3}
              step={1}
              display={`${clusterOptions.maxFavorites}`}
              hint="We pick the sharpest shots; you can swap them later."
              onChange={(v) => dispatch({ type: "setClusterOptions", opts: { ...clusterOptions, maxFavorites: v } })}
            />
          </div>
        )}
      </div>

      {/* Primary action / progress / results */}
      <div aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {phase.kind === "working" ? (
            <motion.div key="progress" {...fade} className="rounded-2xl border border-line bg-card p-5 shadow-polaroid">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-lg text-ink">{STAGE_LABEL[phase.progress.stage]}…</p>
                <p className="text-sm tabular-nums text-ink-soft">{percent}%</p>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Making your map"
                className="mt-3 h-3 overflow-hidden rounded-full bg-paper-2"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-rose transition-[width] duration-300 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(3, percent)}%` }}
                />
              </div>
              <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-4">
                {STAGES.map((s) => {
                  const idx = STAGES.indexOf(s);
                  const cur = STAGES.indexOf(phase.progress.stage);
                  const state = idx < cur ? "done" : idx === cur ? "now" : "next";
                  return (
                    <li key={s} className={cn("flex items-center gap-1.5", state === "next" ? "text-ink-faint" : "text-ink-soft", state === "now" && "font-semibold text-ink")}>
                      <span
                        aria-hidden
                        className={cn("inline-block h-2 w-2 rounded-full", state === "done" ? "bg-sage" : state === "now" ? "bg-accent" : "bg-line")}
                      />
                      {STAGE_LABEL[s]}
                    </li>
                  );
                })}
              </ol>
              {phase.progress.stage === "reading" && (
                <p className="mt-3 text-xs text-ink-faint">
                  {phase.progress.done} of {phase.progress.total} photos. Big batches take a minute; keep this tab open.
                </p>
              )}
            </motion.div>
          ) : phase.kind === "partial" ? (
            <motion.div key="partial" {...fade} className="rounded-2xl border border-line bg-card p-5 shadow-polaroid">
              <p className="font-display text-lg text-ink">Your map is ready</p>
              <p className="mt-1 text-sm text-ink-soft">
                We placed {Object.keys(phase.trip.photos).length - phase.trip.unplacedPhotoIds.length} photos in {phase.trip.moments.length}{" "}
                {phase.trip.moments.length === 1 ? "moment" : "moments"}.{" "}
                <span className="text-ink">
                  {phase.trip.unplacedPhotoIds.length} {phase.trip.unplacedPhotoIds.length === 1 ? "photo had" : "photos had"} no location
                </span>
                , so {phase.trip.unplacedPhotoIds.length === 1 ? "it isn't" : "they aren't"} on the map. Screenshots and photos saved from
                messages often lose their location.
              </p>
              <button
                type="button"
                onClick={() => router.push("/trip")}
                className="mt-4 min-h-11 w-full rounded-full bg-accent px-6 text-sm font-semibold text-white shadow-polaroid transition hover:bg-accent-deep sm:w-auto"
              >
                Open my map
              </button>
            </motion.div>
          ) : (
            <motion.div key="cta" {...fade} className="space-y-3">
              {phase.kind === "nogps" && (
                <div role="alert" className="rounded-2xl border border-rose/30 bg-rose/5 p-4 text-sm text-ink">
                  <p className="font-display text-lg">We couldn&apos;t find locations in these photos</p>
                  <p className="mt-1 text-ink-soft">
                    None of the {phase.total} photos had GPS data, so there&apos;s nothing to put on the map yet.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
                    <li>
                      On iPhone, tap <span className="font-medium text-ink">Options</span> on the share sheet and turn on{" "}
                      <span className="font-medium text-ink">Location</span> before sharing or saving.
                    </li>
                    <li>AirDrop to a Mac or export &ldquo;Unmodified Originals&rdquo; to keep the location data.</li>
                    <li>Check that Location Services was on for the Camera when the photos were taken.</li>
                  </ul>
                </div>
              )}
              {phase.kind === "error" && (
                <p role="alert" className="rounded-2xl border border-rose/30 bg-rose/5 p-4 text-sm text-ink">
                  {phase.message}
                </p>
              )}
              <button
                type="button"
                onClick={makeMap}
                disabled={!files.length || !!dateError}
                className="min-h-12 w-full rounded-full bg-ink px-6 font-display text-lg text-paper shadow-lift transition hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-ink/30 disabled:shadow-none"
              >
                {files.length ? `Make my map with ${files.length} photo${files.length === 1 ? "" : "s"}` : "Make my map"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sample */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <div className="flex w-full items-center gap-3 text-xs uppercase tracking-[0.2em] text-ink-faint" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <button
          type="button"
          onClick={loadSample}
          disabled={sampleLoading || busy}
          aria-busy={sampleLoading}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-sage/40 bg-card px-6 text-sm font-semibold text-sage transition hover:border-sage hover:bg-sage/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage disabled:opacity-60 sm:w-auto"
        >
          {sampleLoading ? (
            <>
              <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-sage/30 border-t-sage motion-reduce:animate-none" />
              Opening the sample…
            </>
          ) : (
            <>
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              Load sample trip: Portland
            </>
          )}
        </button>
        {sampleError && (
          <p role="alert" className="text-sm text-rose">
            {sampleError}
          </p>
        )}
      </div>
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn("h-5 w-5 shrink-0 text-ink-soft transition-transform motion-reduce:transition-none", open && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
