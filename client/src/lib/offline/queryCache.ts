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

/**
 * Use superjson for the queryKey too — plain JSON.stringify drops `undefined`
 * inside objects and coerces it to `null` inside arrays, which breaks
 * round-tripping for tRPC inputs that have optional fields. superjson keeps
 * undefined/Date/Map/etc. faithful, so write-key === restore-key === the key
 * React Query asks for at hydrate time.
 */
function stableKey(queryKey: unknown): string {
  return superjson.stringify(queryKey);
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
        const queryKey = superjson.parse(key);
        const data = superjson.parse(entry.data);
        client.setQueryData(queryKey as readonly unknown[], data, {
          updatedAt: entry.updatedAt,
        });
        // Mark stale so React Query refetches in background once online.
        client.invalidateQueries({
          queryKey: queryKey as readonly unknown[],
          refetchType: "none",
        });
        restored++;
      } catch {
        await idbDeleteQuery(key);
      }
    }),
  );
  return restored;
}

/**
 * Routers whose responses we never persist. Auth/session data must always
 * come from the server — caching it would let an offline hydrate make the
 * UI think the user is signed in (or as a different user, on a shared
 * device) before the server has a chance to say otherwise.
 */
const PERSIST_DENY_ROOTS = new Set(["auth", "session"]);

/**
 * tRPC + react-query keys look like `[["router", "procedure"], { input, type }]`.
 * Returns the router segment (`"router"`) so we can deny-list whole routers.
 */
function rootRouterOf(queryKey: unknown): string | null {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return null;
  const head = queryKey[0];
  if (Array.isArray(head) && typeof head[0] === "string") return head[0];
  if (typeof head === "string") return head;
  return null;
}

export function attachQueryCachePersistence(client: QueryClient): () => void {
  const cache = client.getQueryCache();
  const unsubscribe = cache.subscribe((event) => {
    if (event.type !== "updated") return;
    const query = event.query;
    if (query.state.status !== "success") return;
    if (query.state.data === undefined) return;

    const root = rootRouterOf(query.queryKey);
    if (root && PERSIST_DENY_ROOTS.has(root)) return;

    const key = stableKey(query.queryKey);
    const persisted: Persisted = {
      data: superjson.stringify(query.state.data),
      updatedAt: query.state.dataUpdatedAt || Date.now(),
    };
    void idbSetQuery(key, persisted);
  });
  return unsubscribe;
}
