/**
 * Tests for the IndexedDB-backed React Query cache.
 *
 * Covers:
 *  - keys with `undefined` / `Date` round-trip exactly (the reason we use
 *    superjson rather than JSON.stringify).
 *  - `attachQueryCachePersistence` writes successful queries to IDB and
 *    skips deny-listed routers (auth/session).
 *  - `hydrateQueryCache` restores entries into a fresh QueryClient and
 *    drops entries older than the 7-day TTL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { QueryClient } from "@tanstack/react-query";

type IdbModule = typeof import("./idb");
type CacheModule = typeof import("./queryCache");

async function loadFresh(): Promise<{ idb: IdbModule; cache: CacheModule }> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const idb = await import("./idb");
  const cache = await import("./queryCache");
  return { idb, cache };
}

describe("offline/queryCache — persistence + hydration", () => {
  let idb: IdbModule;
  let cache: CacheModule;
  let client: QueryClient;

  beforeEach(async () => {
    ({ idb, cache } = await loadFresh());
    client = new QueryClient();
  });
  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  /** Wait for any pending `void idbSetQuery(...)` writes to settle. */
  const flush = () => new Promise((r) => setTimeout(r, 30));

  it("persists a successful query and re-hydrates the same data", async () => {
    cache.attachQueryCachePersistence(client);
    const queryKey: readonly unknown[] = [["orders", "list"], { input: { id: 1 }, type: "query" }];

    client.setQueryData(queryKey, [{ id: 1, name: "alpha" }]);
    await flush();

    // Build a brand-new client and hydrate it.
    const fresh = new QueryClient();
    const restored = await cache.hydrateQueryCache(fresh);
    expect(restored).toBe(1);
    expect(fresh.getQueryData(queryKey)).toEqual([{ id: 1, name: "alpha" }]);
  });

  it("round-trips queryKeys containing `undefined` (would collide under JSON.stringify)", async () => {
    cache.attachQueryCachePersistence(client);
    const keyWithUndef: readonly unknown[] = [
      ["orders", "list"],
      { input: { customerId: undefined, status: "pending" }, type: "query" },
    ];
    client.setQueryData(keyWithUndef, ["matches"]);
    await flush();

    const fresh = new QueryClient();
    await cache.hydrateQueryCache(fresh);
    expect(fresh.getQueryData(keyWithUndef)).toEqual(["matches"]);
  });

  it("round-trips queryKeys containing Date objects", async () => {
    cache.attachQueryCachePersistence(client);
    const date = new Date("2026-04-26T12:00:00Z");
    const key: readonly unknown[] = [["orders", "list"], { input: { since: date }, type: "query" }];
    client.setQueryData(key, ["x"]);
    await flush();

    const fresh = new QueryClient();
    await cache.hydrateQueryCache(fresh);
    // Same Date value (constructed fresh) should still find the entry.
    const sameKey: readonly unknown[] = [
      ["orders", "list"],
      { input: { since: new Date("2026-04-26T12:00:00Z") }, type: "query" },
    ];
    expect(fresh.getQueryData(sameKey)).toEqual(["x"]);
  });

  it("does NOT persist auth router responses", async () => {
    cache.attachQueryCachePersistence(client);
    const authKey: readonly unknown[] = [["auth", "me"], { input: undefined, type: "query" }];
    client.setQueryData(authKey, { id: 1, email: "user@example.com" });
    await flush();

    const all = await idb.idbAllQueries();
    expect(all).toEqual([]);
  });

  it("does NOT persist session router responses", async () => {
    cache.attachQueryCachePersistence(client);
    const key: readonly unknown[] = [["session", "current"], { input: undefined, type: "query" }];
    client.setQueryData(key, { token: "shh" });
    await flush();

    const all = await idb.idbAllQueries();
    expect(all).toEqual([]);
  });

  it("evicts entries older than the 7-day TTL on hydrate", async () => {
    cache.attachQueryCachePersistence(client);
    const key: readonly unknown[] = [["orders", "list"], { input: {}, type: "query" }];
    client.setQueryData(key, [1, 2, 3]);
    await flush();

    // Backdate the persisted entry so it falls outside the 7-day window.
    const all = await idb.idbAllQueries();
    expect(all).toHaveLength(1);
    const entry = all[0].value as { data: string; updatedAt: number };
    const eightDays = 1000 * 60 * 60 * 24 * 8;
    await idb.idbSetQuery(all[0].key, { ...entry, updatedAt: Date.now() - eightDays });

    const fresh = new QueryClient();
    const restored = await cache.hydrateQueryCache(fresh);
    expect(restored).toBe(0);
    expect(await idb.idbAllQueries()).toEqual([]);
  });

  it("returns the unsubscribe function and stops persisting once called", async () => {
    const unsubscribe = cache.attachQueryCachePersistence(client);
    unsubscribe();
    client.setQueryData([["orders", "list"], { input: {}, type: "query" }], ["x"]);
    await flush();
    expect(await idb.idbAllQueries()).toEqual([]);
  });
});
