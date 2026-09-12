import { useEffect, useSyncExternalStore } from "react";
import { trackerStore, type TrackerState, TrackerStore } from "./store";

/** Subscribe to the shared tracker store. Re-renders on every state change. */
export function useTracker(store: TrackerStore = trackerStore): TrackerState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

type Listener = { refs: number; detach: () => void };
const listeners = new Map<TrackerStore, Listener>();

/**
 * Global keyboard layer (j/k/x/space/e/d/a/y/n/esc/1–4). Ref-counted per
 * store, so any number of frames can mount it and exactly one window
 * listener exists for each store in use.
 */
export function useTrackerKeyboard(store: TrackerStore = trackerStore) {
  useEffect(() => {
    let entry = listeners.get(store);
    if (!entry) {
      const h = (e: KeyboardEvent) => store.handleKey(e);
      window.addEventListener("keydown", h);
      entry = {
        refs: 0,
        detach: () => window.removeEventListener("keydown", h),
      };
      listeners.set(store, entry);
    }
    entry.refs++;
    return () => {
      const cur = listeners.get(store);
      if (!cur) return;
      if (--cur.refs === 0) {
        cur.detach();
        listeners.delete(store);
        // No frame is mounted any more: nothing may own the keyboard.
        store.disown();
      }
    };
  }, [store]);
}
