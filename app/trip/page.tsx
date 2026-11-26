"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import ScrapbookView from "@/components/ScrapbookView";
import ShareDialog from "@/components/ShareDialog";

export default function TripPage() {
  const { book } = useStore();
  const [shareOpen, setShareOpen] = useState(false);

  if (book.trips.length === 0) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="font-hand text-xl text-accent">Nothing here yet</p>
          <h1 className="mt-1 font-display text-3xl">Your map is waiting for photos</h1>
          <p className="mt-2 text-ink-soft">Add a trip's photos, or try the Portland sample trip.</p>
          <Link href="/" className="mt-5 inline-block h-11 rounded-full bg-accent px-6 leading-11 font-medium text-white hover:bg-accent-deep">
            Add photos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <ScrapbookView
        actions={
          <>
            <Link
              href="/"
              className="h-10 rounded-full border border-line bg-card/90 px-3.5 text-sm leading-10 whitespace-nowrap shadow-polaroid backdrop-blur hover:bg-card"
              aria-label="Add a trip"
            >
              <span aria-hidden>+ </span>
              <span className="hidden sm:inline">Add trip</span>
              <span className="sm:hidden">Trip</span>
            </Link>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="h-10 rounded-full bg-accent px-4 text-sm font-medium whitespace-nowrap text-white shadow-polaroid hover:bg-accent-deep"
            >
              Share
            </button>
          </>
        }
      />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
