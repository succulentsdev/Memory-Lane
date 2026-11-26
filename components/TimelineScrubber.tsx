"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useStore, type ActiveChapter } from "@/lib/store";
import type { ID, Moment, Trip } from "@/lib/types";
import { cn, formatDateRange, formatDateTime } from "@/lib/util";

interface Item {
  moment: Moment;
  trip: Trip;
}

interface Step {
  chapter: ActiveChapter;
  momentId: ID | null;
}

/** How long the tour lingers on a chapter overview (map fly-to) and on each moment. */
const CHAPTER_MS = 4000;
const MOMENT_MS = 3500;

const pos = (i: number, n: number) => ((i + 0.5) / n) * 100;

/**
 * Bottom dock: chapter chips, a scrubber track of moments, and a play-through tour.
 * Reads and writes only through the store; the map reacts to activeChapter / selectedMomentId.
 */
export default function TimelineScrubber() {
  const { book, activeChapter, selectedMomentId, setChapter, selectMoment } = useStore();
  const trips = book.trips;
  const reduce = useReducedMotion() ?? false;

  const chapter: ActiveChapter = activeChapter !== "all" && trips.some((t) => t.id === activeChapter) ? activeChapter : "all";
  const showAll = trips.length > 1;
  const chapters = useMemo<ActiveChapter[]>(() => [...(showAll ? ["all"] : []), ...trips.map((t) => t.id)], [trips, showAll]);
  const chapterIdx = chapters.indexOf(chapter);

  // Moments on the track, chronological (trips are already in order).
  const items = useMemo<Item[]>(() => {
    const ts = chapter === "all" ? trips : trips.filter((t) => t.id === chapter);
    return ts.flatMap((trip) => trip.moments.map((moment) => ({ moment, trip })));
  }, [trips, chapter]);
  const n = items.length;

  const segments = useMemo(() => {
    const out: { trip: Trip; from: number; to: number }[] = [];
    let i = 0;
    for (const it of items) {
      const last = out[out.length - 1];
      if (last && last.trip.id === it.trip.id) last.to = i + 1;
      else out.push({ trip: it.trip, from: i, to: i + 1 });
      i++;
    }
    return out;
  }, [items]);

  // Day boundaries inside a single chapter (local day from the ISO string).
  const dayTicks = useMemo(() => {
    if (chapter === "all") return [];
    const ticks: number[] = [];
    for (let i = 1; i < items.length; i++) {
      if (items[i].moment.startAt.slice(0, 10) !== items[i - 1].moment.startAt.slice(0, 10)) ticks.push(i);
    }
    return ticks;
  }, [items, chapter]);

  const selIdx = items.findIndex((it) => it.moment.id === selectedMomentId);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // --- tour playback -------------------------------------------------------
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = showAll ? [{ chapter: "all", momentId: null }] : [];
    for (const t of trips) {
      s.push({ chapter: t.id, momentId: null });
      for (const m of t.moments) s.push({ chapter: t.id, momentId: m.id });
    }
    return s;
  }, [trips, showAll]);

  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  const stepRef = useRef(-1);
  const applied = useRef<Step | null>(null);
  const live = useRef({ activeChapter, selectedMomentId });
  live.current = { activeChapter, selectedMomentId };

  const applyStep = useCallback(
    (i: number) => {
      const s = steps[i];
      if (!s) return;
      stepRef.current = i;
      applied.current = s;
      if (live.current.activeChapter !== s.chapter) setChapter(s.chapter);
      if (s.momentId) selectMoment(s.momentId);
      else if (live.current.selectedMomentId) selectMoment(null);
      setTick((t) => t + 1);
    },
    [steps, setChapter, selectMoment],
  );

  useEffect(() => {
    if (!playing) return;
    const cur = steps[stepRef.current];
    const id = window.setTimeout(
      () => {
        const next = stepRef.current + 1;
        if (next >= steps.length) setPlaying(false);
        else applyStep(next);
      },
      cur?.momentId ? MOMENT_MS : CHAPTER_MS,
    );
    return () => window.clearTimeout(id);
  }, [playing, tick, steps, applyStep]);

  // Anything else changing the selection (a pin tap, closing the card) pauses the tour.
  useEffect(() => {
    const a = applied.current;
    if (playing && a && (a.chapter !== activeChapter || a.momentId !== selectedMomentId)) setPlaying(false);
  }, [playing, activeChapter, selectedMomentId]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!steps.length) return;
    let cur = steps.findIndex((s) => s.chapter === activeChapter && s.momentId === selectedMomentId);
    if (cur < 0 && selectedMomentId) cur = steps.findIndex((s) => s.momentId === selectedMomentId);
    const next = cur < 0 || cur >= steps.length - 1 ? 0 : cur + 1;
    setPlaying(true);
    applyStep(next);
  };

  const stop = () => setPlaying(false);

  // --- chapter chips -------------------------------------------------------
  const chipRow = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const row = chipRow.current;
    const el = chipRefs.current.get(chapter);
    if (!row || !el) return;
    const left = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [chapter, reduce, trips.length]);

  const goChapter = (c: ActiveChapter) => {
    stop();
    if (c !== activeChapter) setChapter(c);
  };

  // --- track interaction ---------------------------------------------------
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const idxAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !n) return -1;
    const r = el.getBoundingClientRect();
    const f = (clientX - r.left) / Math.max(1, r.width);
    return Math.min(n - 1, Math.max(0, Math.floor(f * n)));
  };

  const choose = (i: number) => {
    const it = items[i];
    if (it && it.moment.id !== selectedMomentId) selectMoment(it.moment.id);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!n) return;
    stop();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    choose(idxAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!n) return;
    const i = idxAt(e.clientX);
    if (dragging.current) choose(i);
    else if (e.pointerType === "mouse") setHoverIdx(i);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = selIdx < 0 ? 0 : Math.min(n - 1, selIdx + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = selIdx < 0 ? n - 1 : Math.max(0, selIdx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape" && selectedMomentId) {
      e.preventDefault();
      stop();
      selectMoment(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    stop();
    choose(next);
  };

  if (!trips.length) return null;

  const shownIdx = hoverIdx ?? (selIdx >= 0 ? selIdx : null);
  const shown = shownIdx !== null ? items[shownIdx] : undefined;
  const activeTrip = chapter === "all" ? undefined : trips.find((t) => t.id === chapter);
  const accent = activeTrip?.color ?? "var(--color-accent)";
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 38 };
  const momentText = (it: Item) => `${it.moment.placeName || "A little moment"}, ${formatDateTime(it.moment.startAt)}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center md:px-4 md:pb-4">
      <section
        aria-label="Trip timeline"
        className="pointer-events-auto w-full rounded-t-2xl border border-b-0 border-line bg-paper/85 px-2 pt-1.5 shadow-lift backdrop-blur-md md:max-w-3xl md:rounded-2xl md:border-b"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        {/* Chapter switcher */}
        <div className="flex items-center gap-1">
          <IconButton label="Previous chapter" disabled={chapterIdx <= 0} onClick={() => goChapter(chapters[chapterIdx - 1])}>
            <path d="M15 6l-6 6 6 6" />
          </IconButton>
          <div
            ref={chipRow}
            className="relative flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Chapters"
          >
            {showAll && (
              <Chip
                active={chapter === "all"}
                onClick={() => goChapter("all")}
                refCb={(el) => setChipRef(chipRefs.current, "all", el)}
              >
                <span className="flex -space-x-1" aria-hidden>
                  {trips.slice(0, 4).map((t) => (
                    <span key={t.id} className="h-2.5 w-2.5 rounded-full ring-2 ring-card" style={{ background: t.color }} />
                  ))}
                </span>
                <span className="font-medium">All trips</span>
              </Chip>
            )}
            {trips.map((t) => (
              <Chip
                key={t.id}
                active={chapter === t.id}
                onClick={() => goChapter(t.id)}
                refCb={(el) => setChipRef(chipRefs.current, t.id, el)}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                <span className="max-w-[9.5rem] truncate font-medium">{t.title}</span>
                {t.startDate && (
                  <span className={cn("text-[11px]", chapter === t.id ? "text-paper/70" : "text-ink-faint")}>
                    {formatDateRange(t.startDate, t.endDate)}
                  </span>
                )}
              </Chip>
            ))}
          </div>
          <IconButton
            label="Next chapter"
            disabled={chapterIdx >= chapters.length - 1}
            onClick={() => goChapter(chapters[chapterIdx + 1])}
          >
            <path d="M9 6l6 6-6 6" />
          </IconButton>
        </div>

        {/* Hover / selection label */}
        <div className="mt-1 flex h-5 items-center gap-2 px-2 text-xs">
          {shown ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: shown.trip.color }} aria-hidden />
              <span className="min-w-0 truncate">
                <span className="font-display text-[13px] text-ink">{shown.moment.placeName || "A little moment"}</span>
                <span className="text-ink-soft"> · {formatDateTime(shown.moment.startAt)}</span>
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-ink-faint">
                {(shownIdx ?? 0) + 1} / {n}
              </span>
            </>
          ) : (
            <span className="truncate text-ink-soft">
              {n ? (
                <>
                  <span className="font-hand text-[13px] text-ink">{n === 1 ? "1 moment" : `${n} moments`}</span>
                  <span> · tap or drag the line to wander through them</span>
                </>
              ) : (
                "No mapped photos in this chapter yet"
              )}
            </span>
          )}
        </div>

        {/* Play + scrubber track */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!steps.length}
            aria-label={playing ? "Pause tour" : "Play tour through chapters and moments"}
            aria-pressed={playing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper shadow-polaroid transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
              </svg>
            )}
          </button>

          <div
            role="slider"
            tabIndex={n ? 0 : -1}
            aria-label={activeTrip ? `Moments in ${activeTrip.title}` : "Moments across all trips"}
            aria-valuemin={n ? 1 : 0}
            aria-valuemax={n}
            aria-valuenow={selIdx >= 0 ? selIdx + 1 : 0}
            aria-valuetext={selIdx >= 0 ? momentText(items[selIdx]) : "No moment selected"}
            aria-disabled={!n}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onPointerLeave={() => setHoverIdx(null)}
            onKeyDown={onKeyDown}
            className={cn(
              "relative h-10 min-w-0 flex-1 touch-none select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              n ? "cursor-pointer" : "cursor-default",
            )}
          >
            <div ref={trackRef} className="absolute inset-y-0 left-2.5 right-2.5">
              {/* Base line */}
              <div className="absolute inset-x-0 top-1/2 -mt-[2px] h-1 rounded-full bg-line" />

              {/* Trip segments (All) or the chapter bar + progress */}
              {chapter === "all"
                ? segments.map((s) => (
                    <div
                      key={s.trip.id}
                      className="absolute top-1/2 -mt-[3px] h-1.5 rounded-full opacity-45"
                      style={{
                        left: `calc(${(s.from / n) * 100}% + 2px)`,
                        width: `calc(${((s.to - s.from) / n) * 100}% - 4px)`,
                        background: s.trip.color,
                      }}
                    />
                  ))
                : n > 0 && (
                    <motion.div
                      className="absolute left-0 top-1/2 -mt-[3px] h-1.5 rounded-full"
                      style={{ background: accent }}
                      initial={false}
                      animate={{ width: selIdx >= 0 ? `${pos(selIdx, n)}%` : "0%", opacity: 0.8 }}
                      transition={spring}
                    />
                  )}

              {/* Day ticks */}
              {dayTicks.map((i) => (
                <div
                  key={`d${i}`}
                  className="absolute top-1/2 -mt-2.5 h-5 w-px bg-ink-faint/60"
                  style={{ left: `${(i / n) * 100}%` }}
                  aria-hidden
                />
              ))}

              {/* Moment dots */}
              {n <= 120 &&
                items.map((it, i) => (
                  <div
                    key={it.moment.id}
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 rounded-full ring-2 ring-paper transition-transform",
                      i === hoverIdx ? "-ml-[5px] -mt-[5px] h-2.5 w-2.5 scale-125" : "-ml-1 -mt-1 h-2 w-2",
                    )}
                    style={{ left: `${pos(i, n)}%`, background: it.trip.color }}
                  />
                ))}

              {/* Playhead */}
              {selIdx >= 0 && (
                <motion.div
                  layout
                  transition={spring}
                  aria-hidden
                  className="absolute top-1/2 -ml-2.5 -mt-2.5 h-5 w-5 rounded-full border-[3px] bg-card shadow-polaroid"
                  style={{ left: `${pos(selIdx, n)}%`, borderColor: items[selIdx].trip.color }}
                />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function setChipRef(map: Map<string, HTMLButtonElement>, key: string, el: HTMLButtonElement | null) {
  if (el) map.set(key, el);
  else map.delete(key);
}

function Chip({
  active,
  onClick,
  refCb,
  children,
}: {
  active: boolean;
  onClick: () => void;
  refCb: (el: HTMLButtonElement | null) => void;
  children: ReactNode;
}) {
  return (
    <button
      ref={refCb}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-10 shrink-0 snap-center items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        active ? "border-ink bg-ink text-paper shadow-polaroid" : "border-line bg-card text-ink hover:bg-paper-2",
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
