import { useEffect, useSyncExternalStore } from "react";
import { trackerStore, type TrackerState, TrackerStore } from "./store";

/** Subscribe to the shared tracker store. Re-renders on every state change. */
export function useTracker(store: TrackerStore = trackerStore): TrackerState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

let keyboardRefs = 0;
let detach: (() => void) | null = null;

/**
 * Global keyboard layer (j/k/x/space/e/d/a/y/n/esc/1–4). Ref-counted so any
 * number of frames can mount it and exactly one window listener exists.
 */
export function useTrackerKeyboard(store: TrackerStore = trackerStore) {
  useEffect(() => {
    if (keyboardRefs++ === 0) {
      const h = (e: KeyboardEvent) => store.handleKey(e);
      window.addEventListener("keydown", h);
      detach = () => window.removeEventListener("keydown", h);
    }
    return () => {
      if (--keyboardRefs === 0) {
        detach?.();
        detach = null;
      }
    };
  }, [store]);
}
