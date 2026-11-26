"use client";
// Owned by the "upload + EXIF" builder: landing + upload page.

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import Uploader from "@/components/Uploader";
import { useStore } from "@/lib/store";
import { formatDateRange } from "@/lib/util";

function PolaroidStack() {
  // Pure CSS/SVG decoration: three tilted polaroids, a pin and a postage stamp.
  return (
    <div aria-hidden className="relative mx-auto h-36 w-56 sm:h-40 sm:w-64">
      <div className="absolute left-2 top-4 h-28 w-24 -rotate-12 rounded-sm bg-card p-2 pb-6 shadow-polaroid sm:h-32 sm:w-28">
        <div className="h-full w-full rounded-[2px] bg-gradient-to-br from-sage/70 to-sage/30" />
      </div>
      <div className="absolute right-2 top-3 h-28 w-24 rotate-[10deg] rounded-sm bg-card p-2 pb-6 shadow-polaroid sm:h-32 sm:w-28">
        <div className="h-full w-full rounded-[2px] bg-gradient-to-br from-rose/60 to-accent/40" />
      </div>
      <div className="absolute left-1/2 top-0 h-32 w-28 -translate-x-1/2 -rotate-2 rounded-sm bg-card p-2 pb-7 shadow-lift sm:h-36 sm:w-32">
        <svg viewBox="0 0 100 90" className="h-full w-full rounded-[2px] bg-paper-2" preserveAspectRatio="none">
          <rect width="100" height="90" fill="#f6dcc4" />
          <circle cx="74" cy="24" r="10" fill="#e0794a" opacity="0.85" />
          <path d="M0 70 L28 42 L46 58 L66 36 L100 66 L100 90 L0 90 Z" fill="#2f8f83" opacity="0.75" />
          <path d="M0 80 Q30 66 52 78 T100 74 L100 90 L0 90 Z" fill="#1f6d63" opacity="0.6" />
        </svg>
        <span className="absolute bottom-1 left-0 right-0 text-center font-hand text-[11px] text-ink-soft">the lake, day 2</span>
      </div>
      {/* map pin */}
      <svg viewBox="0 0 24 32" className="absolute -top-2 left-1/2 h-7 w-6 -translate-x-1/2 drop-shadow">
        <path d="M12 31s10-10.5 10-18A10 10 0 0 0 2 13c0 7.5 10 18 10 18Z" fill="#e0794a" />
        <circle cx="12" cy="12.5" r="3.8" fill="#fffdf9" />
      </svg>
      {/* stamp */}
      <div className="absolute -right-3 bottom-0 rotate-6 rounded-[3px] border-2 border-dashed border-accent/50 bg-card px-2 py-1 shadow-polaroid">
        <span className="block font-display text-[10px] uppercase leading-tight tracking-widest text-accent-deep">Memory</span>
        <span className="block font-display text-[10px] uppercase leading-tight tracking-widest text-accent-deep">Lane</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { book } = useStore();
  const reduce = useReducedMotion();
  const enter = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const } };

  const trips = book.trips;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-[max(2rem,env(safe-area-inset-top))] sm:px-6 sm:pt-14">
      <motion.header {...enter(0)} className="text-center">
        <PolaroidStack />
        <h1 className="mt-6 font-display text-4xl tracking-tight text-ink sm:text-5xl">Memory Lane</h1>
        <p className="mx-auto mt-3 max-w-md text-balance text-base text-ink-soft sm:text-lg">
          Turn a trip&apos;s photos into a map of your moments.
        </p>
      </motion.header>

      {trips.length > 0 && (
        <motion.section {...enter(0.08)} aria-labelledby="continue-heading" className="mt-8 rounded-2xl border border-line bg-card p-4 shadow-polaroid sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="continue-heading" className="font-display text-lg text-ink">
              Continue to your map
            </h2>
            <span className="font-hand text-base text-ink-soft">
              {trips.length} chapter{trips.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {trips.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-2 ring-card" style={{ backgroundColor: t.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                  <span className="block text-xs text-ink-faint">
                    {[formatDateRange(t.startDate, t.endDate), `${t.moments.length} moment${t.moments.length === 1 ? "" : "s"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/trip"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-white shadow-polaroid transition hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open my map
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </motion.section>
      )}

      <motion.div {...enter(0.15)} className="mt-8">
        {trips.length > 0 && <h2 className="mb-3 font-display text-xl text-ink">Add another trip</h2>}
        <Uploader />
      </motion.div>
    </main>
  );
}
