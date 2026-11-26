"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { giftUrl, publishScrapbook } from "@/lib/share";
import { getStorage } from "@/lib/storage";
import { SAMPLE_SLUG } from "@/data/sample-trips";

/** "Gift Mode": publish a read-only copy and hand back a link. */
export default function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { book, dispatch } = useStore();
  const [link, setLink] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isSample = book.slug === SAMPLE_SLUG;
  const localOnly = getStorage().kind === "local" && !isSample;
  const bookRef = useRef(book);
  const linkRef = useRef<HTMLInputElement>(null);
  bookRef.current = book;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCopied(false);
    setBusy(true);
    (async () => {
      const saved = await publishScrapbook(bookRef.current);
      if (cancelled) return;
      setLink(giftUrl(saved.slug));
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function close() {
    // Save any title change made in the dialog.
    void publishScrapbook(bookRef.current);
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function copy() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: book.title, text: "Our Memory Lane", url: link });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      linkRef.current?.select();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-3 backdrop-blur-[2px] sm:place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share as a gift"
            className="w-full max-w-md rounded-3xl border border-line bg-card p-5 shadow-lift"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-hand text-accent">Gift Mode</p>
            <h2 className="font-display text-2xl">Send your Memory Lane</h2>
            <p className="mt-1 text-sm text-ink-soft">A read-only link: no sign-in needed to open it.</p>

            <label className="mt-4 block text-xs font-medium text-ink-soft" htmlFor="ml-scrapbook-title">
              Scrapbook title
            </label>
            <input
              id="ml-scrapbook-title"
              className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 font-display outline-none focus:border-accent"
              value={book.title}
              onChange={(e) => dispatch({ type: "renameBook", title: e.target.value })}
            />

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-line bg-paper px-3 py-2.5">
              <input
                ref={linkRef}
                id="ml-gift-link"
                readOnly
                aria-label="Gift link"
                value={busy ? "Wrapping it up…" : link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-ink-soft outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={copy}
                className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-deep disabled:opacity-50"
              >
                {copied ? "Copied" : "Share link"}
              </button>
            </div>

            {localOnly && (
              <p className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-xs text-ink-soft">
                Prototype note: your photos stay in this browser, so this link opens on this device only. Connecting cloud
                storage (Supabase) makes it work for anyone.
              </p>
            )}

            <div className="mt-4 flex justify-between gap-2">
              {!busy && (
                <a href={link} target="_blank" rel="noreferrer" className="h-10 rounded-full px-4 text-sm leading-10 text-accent hover:underline">
                  Preview gift
                </a>
              )}
              <button type="button" onClick={close} className="ml-auto h-10 rounded-full border border-line px-4 text-sm hover:bg-paper-2">
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
