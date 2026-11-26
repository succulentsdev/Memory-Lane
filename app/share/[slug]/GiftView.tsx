"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Scrapbook } from "@/lib/types";
import { StoreProvider } from "@/lib/store";
import { loadSharedScrapbook } from "@/lib/share";
import { loadSampleScrapbook, SAMPLE_SLUG } from "@/data/sample-trips";
import ScrapbookView from "@/components/ScrapbookView";

/** Read-only Gift Mode: no sign-in, no editing controls. */
export default function GiftView({ slug }: { slug: string }) {
  const [book, setBook] = useState<Scrapbook | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const shared = await loadSharedScrapbook(slug).catch(() => null);
      const found = shared ?? (slug === SAMPLE_SLUG ? await loadSampleScrapbook() : null);
      if (!cancelled) setBook(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (book === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="font-hand text-xl text-ink-soft">Unwrapping your gift…</p>
      </main>
    );
  }

  if (book === null) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-3xl">This scrapbook isn't here</h1>
          <p className="mt-2 text-ink-soft">
            In this prototype, gift links open on the device that made them. Cloud storage comes next.
          </p>
          <Link href="/" className="mt-5 inline-block text-accent underline">
            Make your own Memory Lane
          </Link>
        </div>
      </main>
    );
  }

  return (
    <StoreProvider initialBook={book} readOnly>
      <ScrapbookView
        subtitle="A gift for you · tap a photo to look closer"
        actions={
          <Link href="/" className="h-10 rounded-full border border-line bg-card/90 px-4 text-sm leading-10 shadow-polaroid backdrop-blur hover:bg-card">
            Make your own
          </Link>
        }
      />
    </StoreProvider>
  );
}
