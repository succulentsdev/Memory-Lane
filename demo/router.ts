"use client";
// Hash router for the single-file demo build (artifact hosts only allow plain #name hashes).
import { useSyncExternalStore } from "react";

export function pathToHash(path: string): string {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return "";
  if (p === "/trip") return "#trip";
  const m = p.match(/^\/share\/([a-z0-9-]+)$/i);
  if (m) return `#gift-${m[1]}`;
  return "";
}

export function hashToPath(hash: string): string {
  const h = hash.replace(/^#/, "");
  if (h === "trip") return "/trip";
  if (h.startsWith("gift-")) return `/share/${h.slice(5)}`;
  return "/";
}

const listeners = new Set<() => void>();
let current = typeof window !== "undefined" ? hashToPath(window.location.hash) : "/";

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    current = hashToPath(window.location.hash);
    listeners.forEach((l) => l());
  });
}

export function navigate(path: string) {
  current = path.replace(/\/+$/, "") || "/";
  const hash = pathToHash(current);
  try {
    history.pushState(null, "", hash || window.location.pathname + window.location.search);
  } catch {
    window.location.hash = hash;
  }
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => "/",
  );
}
