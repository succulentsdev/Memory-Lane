"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import ScrapbookCard from "@/components/ScrapbookCard";
import TimelineScrubber from "@/components/TimelineScrubber";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-paper-2 text-ink-soft">
      <span className="font-hand text-lg">Unfolding the map…</span>
    </div>
  ),
});

/** Full-screen map + top bar + timeline + slide-over card. Shared by /trip and Gift Mode. */
export default function ScrapbookView({ actions, subtitle }: { actions?: ReactNode; subtitle?: ReactNode }) {
  const { book, selected } = useStore();
  const momentCount = book.trips.reduce((n, t) => n + t.moments.length, 0);

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper">
      <div className="absolute inset-0 z-0">
        <MapView cardOpen={!!selected} />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-3 px-3 pt-[env(safe-area-inset-top)] sm:px-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-line bg-card/90 py-1.5 pr-4 pl-3 shadow-polaroid backdrop-blur">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm text-white">
            ✦
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-display text-[15px] font-semibold">{book.title}</h1>
            <p className="truncate text-[11px] text-ink-soft">
              {subtitle ??
                `${book.trips.length} ${book.trips.length === 1 ? "trip" : "trips"} · ${momentCount} ${momentCount === 1 ? "moment" : "moments"}`}
            </p>
          </div>
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">{actions}</div>
      </header>

      {process.env.NEXT_PUBLIC_DEMO === "1" && (
        <p className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.75rem)] z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-card/85 px-3 py-1 text-center text-[11px] text-ink-soft shadow-polaroid backdrop-blur">
          Preview: the street map can't load here, so pins sit on plain paper
        </p>
      )}

      <TimelineScrubber />
      <ScrapbookCard />
    </div>
  );
}
