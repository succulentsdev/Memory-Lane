"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import type { Moment, Photo, Trip } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn, formatDateTime, formatTime, localDay } from "@/lib/util";
import ContextView from "@/components/ContextView";
import { isAssistantEnabled, suggestMomentCaptions } from "@/lib/ai/assistant";

const MAX_FAVORITES = 3;
const CAPTION_DEBOUNCE_MS = 600;

// ---------- small hooks ----------

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

// ---------- helpers ----------

function momentWhen(m: Moment): string {
  const start = formatDateTime(m.startAt);
  if (!m.endAt || m.endAt === m.startAt) return start;
  const s = new Date(m.startAt);
  const e = new Date(m.endAt);
  if (Number.isNaN(e.getTime())) return start;
  if (Math.abs(e.getTime() - s.getTime()) < 60_000) return start;
  const sameDay = localDay(m.startAt) === localDay(m.endAt);
  return sameDay ? `${start} – ${formatTime(m.endAt)}` : `${start} – ${formatDateTime(m.endAt)}`;
}

function isPortrait(p?: Photo): boolean {
  return !!p?.width && !!p?.height && p.height > p.width * 1.05;
}

/** Deterministic small tilt per photo so the page feels hand-assembled but stable. */
function tiltFor(id: string, range = 2.4): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * range * 2 - range;
}

// ---------- the card ----------

export default function ScrapbookCard() {
  const { selected, selectMoment } = useStore();
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {selected && (
        <CardPanel
          key={isDesktop ? "card-desktop" : "card-mobile"}
          trip={selected.trip}
          moment={selected.moment}
          isDesktop={isDesktop}
          reduceMotion={!!reduce}
          onClose={() => selectMoment(null)}
        />
      )}
    </AnimatePresence>
  );
}

interface PanelProps {
  trip: Trip;
  moment: Moment;
  isDesktop: boolean;
  reduceMotion: boolean;
  onClose: () => void;
}

function CardPanel({ trip, moment, isDesktop, reduceMotion, onClose }: PanelProps) {
  const { readOnly, updateMoment, selectMoment } = useStore();
  const dragControls = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const lightboxOpen = lightboxId !== null;

  // Chronological moments of this trip, for prev / next.
  const ordered = useMemo(() => [...trip.moments].sort((a, b) => a.startAt.localeCompare(b.startAt)), [trip.moments]);
  const index = ordered.findIndex((m) => m.id === moment.id);
  const prev = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;

  // Escape closes the lightbox first, then the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (lightboxOpen) setLightboxId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, onClose]);

  // Focus the panel when it opens (keyboard users land in it) without scrolling the page.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // New moment → back to the top of the page.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setLightboxId(null);
  }, [moment.id]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  const startDrag = (e: ReactPointerEvent) => {
    if (!isDesktop) dragControls.start(e);
  };

  const variants = isDesktop
    ? { hidden: reduceMotion ? { opacity: 0 } : { x: "100%" }, shown: { x: 0, opacity: 1 } }
    : { hidden: reduceMotion ? { opacity: 0 } : { y: "100%" }, shown: { y: 0, opacity: 1 } };

  return (
    <>
      <motion.aside
        ref={panelRef}
        tabIndex={-1}
        aria-label={`Moment: ${moment.placeName || "Untitled place"}`}
        initial="hidden"
        animate="shown"
        exit="hidden"
        variants={variants}
        transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 360, damping: 36, mass: 0.9 }}
        drag={isDesktop ? false : "y"}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={onDragEnd}
        className={cn(
          "fixed z-30 flex flex-col overflow-hidden bg-card paper-grain shadow-lift outline-none",
          // Mobile: bottom sheet.
          "inset-x-0 bottom-0 h-[78dvh] max-h-[85dvh] min-h-[60dvh] rounded-t-[28px] border-t border-line",
          // Desktop: right-side page under the 56px top bar.
          "md:inset-x-auto md:bottom-0 md:right-0 md:top-14 md:h-auto md:max-h-none md:min-h-0 md:w-[420px] md:rounded-none md:rounded-tl-2xl md:border-l md:border-t-0",
        )}
      >
        {/* Header: drag handle (mobile), prev/next, close. */}
        <div
          onPointerDown={startDrag}
          className="relative shrink-0 touch-none border-b border-line/70 bg-card/90 px-3 pb-2 pt-2 backdrop-blur-sm md:touch-auto md:pt-3"
        >
          <div aria-hidden className="mx-auto mb-1.5 h-1.5 w-11 rounded-full bg-ink-faint/40 md:hidden" />
          <div className="flex items-center gap-1">
            <NavButton label="Earlier moment" disabled={!prev} onClick={() => prev && selectMoment(prev.id)} dir="prev" />
            <span className="min-w-0 flex-1 truncate text-center text-xs font-medium tracking-wide text-ink-soft">
              {index >= 0 ? `Moment ${index + 1} of ${ordered.length}` : ""}
            </span>
            <NavButton label="Later moment" disabled={!next} onClick={() => next && selectMoment(next.id)} dir="next" />
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close moment"
              className="ml-1 grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <svg viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable page. */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          <motion.div
            key={moment.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            <Hero trip={trip} moment={moment} onOpen={setLightboxId} />
            <Meta trip={trip} moment={moment} />
            <CaptionBlock trip={trip} moment={moment} readOnly={readOnly} updateMoment={updateMoment} />
            {!readOnly && <PhotoStrip trip={trip} moment={moment} updateMoment={updateMoment} />}
            <ContextView lat={moment.lat} lng={moment.lng} placeName={moment.placeName} />
          </motion.div>
        </div>
      </motion.aside>

      <AnimatePresence>
        {lightboxId && trip.photos[lightboxId] && (
          <Lightbox photo={trip.photos[lightboxId]} reduceMotion={reduceMotion} onClose={() => setLightboxId(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function NavButton({ label, disabled, onClick, dir }: { label: string; disabled: boolean; onClick: () => void; dir: "prev" | "next" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-30"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === "prev" ? <path d="M12.5 4.5L7 10l5.5 5.5" /> : <path d="M7.5 4.5L13 10l-5.5 5.5" />}
      </svg>
    </button>
  );
}

// ---------- hero: polaroid + fanned favorites ----------

function Tape({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute h-6 w-24 bg-[#efe0b4]/75 shadow-[0_1px_2px_rgb(60_40_20/0.12)] mix-blend-multiply", className)}
      style={{
        backgroundImage: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.18) 0 3px, transparent 3px 7px)",
        ...style,
      }}
    />
  );
}

function Hero({ trip, moment, onOpen }: { trip: Trip; moment: Moment; onOpen: (id: string) => void }) {
  const favorites = useMemo(() => {
    const ids = moment.favoriteIds.length ? moment.favoriteIds : [moment.coverPhotoId];
    const withCover = ids.includes(moment.coverPhotoId) ? ids : [moment.coverPhotoId, ...ids];
    return withCover.map((id) => trip.photos[id]).filter((p): p is Photo => !!p);
  }, [moment.favoriteIds, moment.coverPhotoId, trip.photos]);

  const [viewId, setViewId] = useState<string>(moment.coverPhotoId);
  useEffect(() => setViewId(moment.coverPhotoId), [moment.id, moment.coverPhotoId]);
  const shown = trip.photos[viewId] ?? favorites[0] ?? trip.photos[moment.coverPhotoId];
  const tilt = tiltFor(moment.id, 1.8);

  if (!shown) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-sm bg-paper-2 font-hand text-ink-faint shadow-polaroid">
        No photo here
      </div>
    );
  }

  return (
    <div className="relative pt-3">
      <figure className="relative mx-auto w-[92%] bg-white p-3 pb-4 shadow-polaroid" style={{ transform: `rotate(${tilt}deg)` }}>
        <Tape className="-top-3 left-1/2" style={{ transform: "translateX(-50%) rotate(-3deg)" }} />
        <button
          type="button"
          onClick={() => onOpen(shown.id)}
          aria-label="View photo larger"
          className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown.url || shown.thumbUrl}
            alt={moment.placeName ? `Photo at ${moment.placeName}` : "Trip photo"}
            className={cn("w-full bg-paper-2 object-cover", isPortrait(shown) ? "aspect-[4/5]" : "aspect-[4/3]")}
            draggable={false}
          />
        </button>
        {moment.placeName && (
          <figcaption className="mt-2 truncate text-center font-hand text-lg leading-tight text-ink-soft">{moment.placeName}</figcaption>
        )}
      </figure>

      {favorites.length > 1 && (
        <div className="mt-4 flex items-end justify-center" role="group" aria-label="Favorite photos">
          {favorites.map((p, i) => {
            const mid = (favorites.length - 1) / 2;
            const rot = (i - mid) * 7;
            const active = p.id === shown.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setViewId(p.id)}
                aria-label={`Show favorite ${i + 1} of ${favorites.length}`}
                aria-pressed={active}
                className={cn(
                  "relative -mx-1.5 bg-white p-1.5 pb-3 shadow-polaroid transition-transform focus-visible:outline-2 focus-visible:outline-accent",
                  active ? "z-10 -translate-y-1.5 ring-2 ring-accent/70" : "hover:-translate-y-1",
                )}
                style={{ rotate: `${rot}deg` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl || p.url} alt="" className="size-14 object-cover" draggable={false} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- meta ----------

function Meta({ trip, moment }: { trip: Trip; moment: Moment }) {
  const count = moment.photoIds.length;
  return (
    <header className="space-y-2">
      <div>
        <h2 className="font-display text-[26px] leading-tight text-ink">{moment.placeName || "Somewhere lovely"}</h2>
        {moment.area && <p className="mt-0.5 text-sm text-ink-soft">{moment.area}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-soft">
        {moment.startAt && <span>{momentWhen(moment)}</span>}
        <span aria-hidden className="text-ink-faint">·</span>
        <span>
          {count} {count === 1 ? "photo" : "photos"}
        </span>
      </div>
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
        style={{ borderColor: `${trip.color}55`, backgroundColor: `${trip.color}14`, color: trip.color }}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: trip.color }} />
        <span className="truncate">{trip.title}</span>
      </span>
    </header>
  );
}

// ---------- caption ----------

type UpdateMoment = (tripId: string, momentId: string, patch: Partial<Moment>) => void;

function CaptionBlock({ trip, moment, readOnly, updateMoment }: { trip: Trip; moment: Moment; readOnly: boolean; updateMoment: UpdateMoment }) {
  if (readOnly) {
    if (!moment.caption?.trim()) return null;
    return (
      <blockquote className="relative rounded-sm bg-paper/80 px-4 py-3 font-hand text-[19px] leading-relaxed text-ink whitespace-pre-wrap" style={{ rotate: "-0.6deg" }}>
        {moment.caption}
      </blockquote>
    );
  }
  return <CaptionEditor key={moment.id} trip={trip} moment={moment} updateMoment={updateMoment} />;
}

function CaptionEditor({ trip, moment, updateMoment }: { trip: Trip; moment: Moment; updateMoment: UpdateMoment }) {
  const [value, setValue] = useState(moment.caption ?? "");
  const saved = useRef(moment.caption ?? "");
  const latest = useRef(value);
  latest.current = value;
  const ids = useRef({ tripId: trip.id, momentId: moment.id });
  ids.current = { tripId: trip.id, momentId: moment.id };
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  const flush = useCallback(() => {
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    updateMoment(ids.current.tripId, ids.current.momentId, { caption: latest.current });
    setStatus("saved");
  }, [updateMoment]);

  // Debounced save while typing.
  useEffect(() => {
    if (value === saved.current) return;
    const t = setTimeout(flush, CAPTION_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, flush]);

  // Save anything pending when the card closes or switches moment.
  useEffect(() => () => flush(), [flush]);

  // Pick up changes made elsewhere (e.g. "Use this" on an AI suggestion).
  useEffect(() => {
    const external = moment.caption ?? "";
    if (external !== saved.current) {
      saved.current = external;
      setValue(external);
    }
  }, [moment.caption]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
          Memory note
          <span aria-live="polite" className="normal-case tracking-normal text-ink-faint/80">
            {status === "saved" && value === saved.current ? "Saved" : ""}
          </span>
        </span>
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("idle");
          }}
          onBlur={flush}
          rows={3}
          placeholder="What do you remember about this moment?"
          className="block w-full resize-y rounded-sm border-0 bg-paper/80 px-4 py-2.5 font-hand text-[19px] leading-[30px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] placeholder:text-ink-faint/80 focus:shadow-[inset_0_0_0_2px_var(--color-accent)] focus:outline-none"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 29px, rgb(196 170 140 / 0.35) 29px 30px)",
            backgroundPosition: "0 9px",
            backgroundAttachment: "local",
          }}
        />
      </label>
      {isAssistantEnabled() && <AssistantSuggest trip={trip} moment={moment} updateMoment={updateMoment} />}
    </div>
  );
}

function AssistantSuggest({ trip, moment, updateMoment }: { trip: Trip; moment: Moment; updateMoment: UpdateMoment }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [ideas, setIdeas] = useState<string[]>([]);

  const run = async () => {
    setState("loading");
    try {
      const out = await suggestMomentCaptions(trip, moment);
      setIdeas(out);
      if (out[0]) updateMoment(trip.id, moment.id, { aiSuggestion: out[0] });
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={state === "loading"}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-card px-3.5 text-sm text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
          <path d="M10 2l1.6 4.4L16 8l-4.4 1.6L10 14l-1.6-4.4L4 8l4.4-1.6zM15.5 12.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
        {state === "loading" ? "Thinking…" : "Suggest a caption"}
      </button>
      {state === "error" && <p className="text-xs text-rose">Couldn’t get suggestions right now.</p>}
      {ideas.length > 0 && (
        <ul className="space-y-1.5">
          {ideas.map((s) => (
            <li key={s} className="flex items-start gap-2 rounded-lg bg-paper-2/60 px-3 py-2">
              <span className="flex-1 font-hand text-base leading-snug text-ink">{s}</span>
              <button
                type="button"
                onClick={() => {
                  updateMoment(trip.id, moment.id, { caption: s, aiSuggestion: s });
                  setIdeas([]);
                }}
                className="min-h-10 shrink-0 rounded-full px-3 text-xs font-medium text-accent hover:bg-accent/10"
              >
                Use this
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- all photos strip (edit mode) ----------

function PhotoStrip({ trip, moment, updateMoment }: { trip: Trip; moment: Moment; updateMoment: UpdateMoment }) {
  const photos = useMemo(() => moment.photoIds.map((id) => trip.photos[id]).filter((p): p is Photo => !!p), [moment.photoIds, trip.photos]);
  const [note, setNote] = useState<string | null>(null);

  // The auto-pick: sharpest scored photo in this moment.
  const sharpestId = useMemo(() => {
    let best: Photo | null = null;
    for (const p of photos) if (typeof p.sharpness === "number" && p.sharpness >= 0 && (!best || p.sharpness > (best.sharpness ?? -1))) best = p;
    return best?.id ?? null;
  }, [photos]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2400);
    return () => clearTimeout(t);
  }, [note]);

  if (photos.length === 0) return null;

  const favorites = moment.favoriteIds.includes(moment.coverPhotoId) ? moment.favoriteIds : [moment.coverPhotoId, ...moment.favoriteIds];

  const makeCover = (id: string) => {
    if (id === moment.coverPhotoId) return;
    const rest = favorites.filter((f) => f !== id && f !== moment.coverPhotoId);
    // New cover first; keep the old cover as a favorite if there's room.
    const favoriteIds = [id, moment.coverPhotoId, ...rest].slice(0, MAX_FAVORITES);
    updateMoment(trip.id, moment.id, { coverPhotoId: id, favoriteIds });
  };

  const toggleFavorite = (id: string) => {
    if (id === moment.coverPhotoId) {
      setNote("The cover is always a favorite.");
      return;
    }
    if (favorites.includes(id)) {
      updateMoment(trip.id, moment.id, { favoriteIds: favorites.filter((f) => f !== id) });
      return;
    }
    if (favorites.length >= MAX_FAVORITES) {
      setNote(`Up to ${MAX_FAVORITES} favorites. Unstar one first.`);
      return;
    }
    updateMoment(trip.id, moment.id, { favoriteIds: [...favorites, id] });
  };

  return (
    <section aria-label="All photos in this moment" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">All photos in this moment</h3>
        <span aria-live="polite" className="text-[11px] text-ink-soft">
          {note ?? "Tap to make cover · star to keep"}
        </span>
      </div>
      <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 pt-1">
        {photos.map((p) => {
          const isCover = p.id === moment.coverPhotoId;
          const isFav = favorites.includes(p.id);
          const isSharpest = p.id === sharpestId && photos.length > 1;
          return (
            <li key={p.id} className="relative shrink-0 snap-start">
              <button
                type="button"
                onClick={() => makeCover(p.id)}
                aria-label={isCover ? `${p.name} (current cover)` : `Make ${p.name} the cover`}
                aria-pressed={isCover}
                className={cn(
                  "block bg-white p-1 pb-1.5 shadow-polaroid transition-transform focus-visible:outline-2 focus-visible:outline-accent",
                  isCover ? "ring-2 ring-accent" : "hover:-translate-y-0.5",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl || p.url} alt="" loading="lazy" draggable={false} className="size-[76px] object-cover" />
                <span className="mt-1 block h-3.5 text-center text-[10px] leading-none">
                  {isCover ? (
                    <span className="font-medium text-accent">cover</span>
                  ) : isSharpest ? (
                    <span className="text-sage">sharpest</span>
                  ) : null}
                </span>
              </button>
              {isCover && isSharpest && (
                <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-sage/90 px-1 py-px text-[9px] font-medium text-white">sharpest</span>
              )}
              <button
                type="button"
                onClick={() => toggleFavorite(p.id)}
                aria-label={isCover ? "Cover is always a favorite" : isFav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                aria-pressed={isFav}
                className="absolute right-0 top-0 grid size-10 place-items-center"
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full shadow-sm ring-1 transition-colors",
                    isFav ? "bg-accent text-white ring-accent" : "bg-card/95 text-ink-faint ring-line hover:text-accent",
                  )}
                >
                  <svg viewBox="0 0 20 20" className="size-3.5" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
                    <path d="M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.2L10 14.4l-4.6 2.4.9-5.2L2.5 8l5.2-.8z" />
                  </svg>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- lightbox ----------

function Lightbox({ photo, reduceMotion, onClose }: { photo: Photo; reduceMotion: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-40 grid place-items-center bg-ink/85 p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url || photo.thumbUrl} alt={photo.name} className="max-h-full max-w-full bg-white object-contain p-2 shadow-lift" onClick={(e) => e.stopPropagation()} />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-card/90 text-ink shadow-lift"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </motion.div>
  );
}
