/**
 * Persist + restore the React Query cache to IndexedDB so reads work offline.
 *
 * Approach:
 *   1. On boot: hydrate every query we have a cached entry for. We mark them
 *      stale so React Query will refetch in the background once online; the
 *      cached data is shown immediately.
 *   2. On every successful query: write data + dataUpdatedAt to IDB, keyed by
 *      a stable JSON of the queryKey.
 *   3. Drop entries older than MAX_AGE_MS at hydrate time so the cache can't
 *      grow unbounded for a long-running install.
 *
 * superjson is used to round-trip Date / Map / undefined etc. so cached payloads
 * match what tRPC returns from the network.
 */
import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import {
  idbAllQueries,
  idbDeleteQuery,
  idbSetQuery,
} from "./idb";

const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type Persisted = {
  data: string; // superjson stringified
  updatedAt: number;
};

function stableKey(queryKey: unknown): string {
  return JSON.stringify(queryKey, (_k, v) =>
    v instanceof Date ? { __date: v.toISOString() } : v,
  );
}

export async function hydrateQueryCache(client: QueryClient): Promise<number> {
  let restored = 0;
  const all = await idbAllQueries();
  const now = Date.now();
  await Promise.all(
    all.map(async ({ key, value }) => {
      const entry = value as Persisted | undefined;
      if (!entry || typeof entry.data !== "string") {
        await idbDeleteQuery(key);
        return;
      }
      if (now - entry.updatedAt > MAX_AGE_MS) {
        await idbDeleteQuery(key);
        return;
      }
      try {
        const queryKey = JSON.parse(key, (_k, v) => {
          if (v && typeof v === "object" && "__date" in v && typeof v.__date === "string") {
            return new Date(v.__date);
          }
          return v;
        });
        const data = superjson.parse(entry.data);
        client.setQueryData(queryKey, data, { updatedAt: entry.updatedAt });
        // Mark stale so React Query refetches in background once online.
        client.invalidateQueries({ queryKey, refetchType: "none" });
        restored++;
      } catch {
        await idbDeleteQuery(key);
      }
    }),
  );
  return restored;
}

export function attachQueryCachePersistence(client: QueryClient): () => void {
  const cache = client.getQueryCache();
  const unsubscribe = cache.subscribe((event) => {
    if (event.type !== "updated") return;
    const query = event.query;
    if (query.state.status !== "success") return;
    if (query.state.data === undefined) return;

    // Don't persist mutations or one-off auth probes — only standard queries.
    // (TanStack Query's "queries" cache is exactly that, so no extra filter needed.)

    const key = stableKey(query.queryKey);
    const persisted: Persisted = {
      data: superjson.stringify(query.state.data),
      updatedAt: query.state.dataUpdatedAt || Date.now(),
    };
    void idbSetQuery(key, persisted);
  });
  return unsubscribe;
}
