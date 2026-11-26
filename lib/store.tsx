"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { ClusterOptions, ID, Moment, Scrapbook, Trip } from "@/lib/types";
import { DEFAULT_CLUSTER_OPTIONS } from "@/lib/types";
import { makeSlug, uid } from "@/lib/util";

/** "all" = every trip zoomed out on one map; otherwise a trip (chapter) id. */
export type ActiveChapter = "all" | ID;

export interface AppState {
  book: Scrapbook;
  activeChapter: ActiveChapter;
  selectedMomentId: ID | null;
  clusterOptions: ClusterOptions;
  /** Gift Mode: read-only, no editing controls. */
  readOnly: boolean;
}

type Action =
  | { type: "setBook"; book: Scrapbook }
  | { type: "addTrip"; trip: Trip }
  | { type: "removeTrip"; tripId: ID }
  | { type: "setChapter"; chapter: ActiveChapter }
  | { type: "selectMoment"; momentId: ID | null }
  | { type: "updateMoment"; tripId: ID; momentId: ID; patch: Partial<Moment> }
  | { type: "setClusterOptions"; opts: ClusterOptions }
  | { type: "renameBook"; title: string };

export function emptyBook(): Scrapbook {
  const now = new Date().toISOString();
  return { id: uid("book"), slug: makeSlug("our-memory-lane"), title: "Our Memory Lane", trips: [], createdAt: now, updatedAt: now, plan: "free" };
}

function sortTrips(trips: Trip[]): Trip[] {
  return [...trips].sort((a, b) => (a.startDate ?? a.createdAt).localeCompare(b.startDate ?? b.createdAt));
}

function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case "setBook":
      return { ...state, book: a.book, selectedMomentId: null, activeChapter: a.book.trips.length > 1 ? "all" : a.book.trips[0]?.id ?? "all" };
    case "addTrip": {
      const trips = sortTrips([...state.book.trips.filter((t) => t.id !== a.trip.id), a.trip]);
      return { ...state, book: { ...state.book, trips }, activeChapter: a.trip.id, selectedMomentId: null };
    }
    case "removeTrip": {
      const trips = state.book.trips.filter((t) => t.id !== a.tripId);
      return { ...state, book: { ...state.book, trips }, activeChapter: "all", selectedMomentId: null };
    }
    case "setChapter":
      return { ...state, activeChapter: a.chapter, selectedMomentId: null };
    case "selectMoment":
      return { ...state, selectedMomentId: a.momentId };
    case "updateMoment": {
      const trips = state.book.trips.map((t) =>
        t.id !== a.tripId ? t : { ...t, moments: t.moments.map((m) => (m.id === a.momentId ? { ...m, ...a.patch } : m)) },
      );
      return { ...state, book: { ...state.book, trips } };
    }
    case "setClusterOptions":
      return { ...state, clusterOptions: a.opts };
    case "renameBook":
      return { ...state, book: { ...state.book, title: a.title } };
  }
}

interface Ctx extends AppState {
  dispatch: (a: Action) => void;
  /** Trips visible for the current chapter. */
  visibleTrips: Trip[];
  /** Selected moment with its trip, if any. */
  selected: { trip: Trip; moment: Moment } | null;
  selectMoment: (id: ID | null) => void;
  setChapter: (c: ActiveChapter) => void;
  updateMoment: (tripId: ID, momentId: ID, patch: Partial<Moment>) => void;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children, initialBook, readOnly = false }: { children: ReactNode; initialBook?: Scrapbook; readOnly?: boolean }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const book = initialBook ?? emptyBook();
    return {
      book,
      activeChapter: book.trips.length > 1 ? "all" : book.trips[0]?.id ?? "all",
      selectedMomentId: null,
      clusterOptions: DEFAULT_CLUSTER_OPTIONS,
      readOnly,
    } satisfies AppState;
  });

  const selectMoment = useCallback((id: ID | null) => dispatch({ type: "selectMoment", momentId: id }), []);
  const setChapter = useCallback((c: ActiveChapter) => dispatch({ type: "setChapter", chapter: c }), []);
  const updateMoment = useCallback(
    (tripId: ID, momentId: ID, patch: Partial<Moment>) => dispatch({ type: "updateMoment", tripId, momentId, patch }),
    [],
  );

  const value = useMemo<Ctx>(() => {
    const visibleTrips = state.activeChapter === "all" ? state.book.trips : state.book.trips.filter((t) => t.id === state.activeChapter);
    let selected: Ctx["selected"] = null;
    if (state.selectedMomentId) {
      for (const trip of state.book.trips) {
        const moment = trip.moments.find((m) => m.id === state.selectedMomentId);
        if (moment) {
          selected = { trip, moment };
          break;
        }
      }
    }
    return { ...state, dispatch, visibleTrips, selected, selectMoment, setChapter, updateMoment };
  }, [state, selectMoment, setChapter, updateMoment]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
