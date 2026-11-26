"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { MapAdapter } from "@/lib/map-adapter";

/**
 * Full-bleed interactive map: polaroid pins per moment, chronological routes per trip,
 * cinematic camera on chapter / moment changes. Fills its positioned parent.
 * Load with next/dynamic({ ssr: false }); Leaflet is only imported inside an effect anyway.
 */
export default function MapView({ className = "", cardOpen = false }: { className?: string; cardOpen?: boolean }) {
  const { book, activeChapter, selectedMomentId, selectMoment } = useStore();
  const elRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Latest values for adapter callbacks without re-binding them.
  const selectRef = useRef(selectMoment);
  selectRef.current = selectMoment;
  const selectedRef = useRef(selectedMomentId);
  selectedRef.current = selectedMomentId;

  // Create / destroy the adapter.
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof window === "undefined") return;
    let cancelled = false;
    let adapter: MapAdapter | null = null;

    import("@/lib/map-adapter")
      .then(({ createMapAdapter }) => createMapAdapter("leaflet"))
      .then((a) => {
        if (cancelled) return;
        adapter = a;
        a.mount(el);
        a.onSelect((id) => selectRef.current(id));
        a.onBackgroundClick(() => {
          if (selectedRef.current) selectRef.current(null);
        });
        adapterRef.current = a;
        setReady(true);
      })
      .catch((err) => {
        console.error("[MapView] map failed to load", err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      adapterRef.current = null;
      adapter?.destroy();
      setReady(false);
    };
  }, []);

  // Push state; the adapter diffs and moves the camera.
  useEffect(() => {
    if (!ready) return;
    adapterRef.current?.setData({
      trips: book.trips,
      activeChapter,
      selectedMomentId,
      mode: activeChapter === "all" ? "all" : "chapter",
      cardOpen,
    });
  }, [ready, book.trips, activeChapter, selectedMomentId, cardOpen]);

  // Keep Leaflet's size in sync with its container (rotation, URL bar, panels).
  useEffect(() => {
    const el = elRef.current;
    if (!ready || !el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => adapterRef.current?.invalidateSize());
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ready]);

  return (
    <div className={`absolute inset-0 isolate z-0 overflow-hidden bg-paper-2 ${className}`}>
      <div
        ref={elRef}
        className="absolute inset-0 h-full w-full"
        role="region"
        aria-label="Trip map. Tab to a photo pin and press Enter to open that moment."
      />
      {!ready && !failed && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-ink-soft">
          <span className="font-hand text-lg motion-safe:animate-pulse">Unfolding the map…</span>
        </div>
      )}
      {failed && (
        <div role="status" className="absolute inset-0 grid place-items-center p-6 text-center text-ink-soft">
          <p className="max-w-xs rounded-2xl border border-line bg-card px-5 py-4 shadow-polaroid">
            <span className="block font-display text-lg text-ink">The map didn’t unfold</span>
            <span className="mt-1 block text-sm">Check your connection and reload the page. Your photos are still here.</span>
          </p>
        </div>
      )}
    </div>
  );
}
