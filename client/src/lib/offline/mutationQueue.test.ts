/**
 * Tests for the offline mutation queue.
 *
 * Covers:
 *  - enqueue order is preserved (FIFO).
 *  - drainMutationQueue replays each mutation against the right URL with the
 *    expected superjson body shape, then deletes them on success.
 *  - on the first failure, drain stops and leaves the failing mutation at
 *    the head of the queue (next online event will retry).
 *  - the in-memory fallback path activates when IndexedDB writes throw, and
 *    those entries replay successfully.
 *  - drainMutationQueue is a no-op when navigator.onLine is false.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

type IdbModule = typeof import("./idb");
type QueueModule = typeof import("./mutationQueue");

async function loadFresh(): Promise<{ idb: IdbModule; queue: QueueModule }> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const idb = await import("./idb");
  const queue = await import("./mutationQueue");
  return { idb, queue };
}

function mockFetchOk(captured: Array<{ url: string; init: RequestInit }>) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.push({ url, init });
    return new Response(JSON.stringify([{ result: { data: { ok: true } } }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("offline/mutationQueue — enqueue + drain", () => {
  let idb: IdbModule;
  let queue: QueueModule;
  let client: QueryClient;

  beforeEach(async () => {
    ({ idb, queue } = await loadFresh());
    client = new QueryClient();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("preserves enqueue order through to drain (FIFO)", async () => {
    await queue.enqueueMutation({ path: "orders.update", input: { id: 1 } });
    await queue.enqueueMutation({ path: "orders.update", input: { id: 2 } });
    await queue.enqueueMutation({ path: "orders.update", input: { id: 3 } });

    const captured: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", mockFetchOk(captured));

    const result = await queue.drainMutationQueue(client);
    expect(result).toEqual({ replayed: 3, failed: 0 });

    // Reconstruct the input order from the captured request bodies.
    const ids = captured.map((req) => {
      const body = JSON.parse(String(req.init.body)) as { 0: { json: { id: number } } };
      return body[0].json.id;
    });
    expect(ids).toEqual([1, 2, 3]);
    expect(await idb.idbAllMutations()).toEqual([]);
  });

  it("posts to /api/trpc/<path>?batch=1 with a superjson-serialized body", async () => {
    await queue.enqueueMutation({
      path: "orders.update",
      input: { id: 7, status: "shipped" },
    });

    const captured: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", mockFetchOk(captured));
    await queue.drainMutationQueue(client);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("/api/trpc/orders.update?batch=1");
    expect(captured[0].init.method).toBe("POST");
    expect(captured[0].init.credentials).toBe("include");

    const body = JSON.parse(String(captured[0].init.body)) as Record<string, unknown>;
    expect(body[0]).toEqual(superjson.serialize({ id: 7, status: "shipped" }));
  });

  it("stops draining at the first failure and leaves remaining items queued", async () => {
    await queue.enqueueMutation({ path: "orders.update", input: { id: 1 } });
    await queue.enqueueMutation({ path: "orders.update", input: { id: 2 } });
    await queue.enqueueMutation({ path: "orders.update", input: { id: 3 } });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        if (call === 2) {
          return new Response("server error", { status: 500 });
        }
        return new Response(JSON.stringify([{ result: { data: { ok: true } } }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const result = await queue.drainMutationQueue(client);
    expect(result.replayed).toBe(1);
    expect(result.failed).toBe(1);

    const remaining = await idb.idbAllMutations();
    expect(remaining.map((m) => (m.input as { id: number }).id)).toEqual([2, 3]);
  });

  it("is a no-op when navigator.onLine is false", async () => {
    await queue.enqueueMutation({ path: "orders.update", input: { id: 1 } });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await queue.drainMutationQueue(client);
    expect(result).toEqual({ replayed: 0, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await idb.idbAllMutations()).toHaveLength(1);
  });

  it("subscribeQueueSize reports the live count", async () => {
    const seen: number[] = [];
    const unsubscribe = queue.subscribeQueueSize((n) => seen.push(n));
    await queue.enqueueMutation({ path: "orders.update", input: { id: 1 } });
    await queue.enqueueMutation({ path: "orders.update", input: { id: 2 } });
    unsubscribe();

    // First emission is the initial cached count (0); then 1, then 2.
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(2);
  });
});

describe("offline/mutationQueue — IndexedDB-unavailable fallback", () => {
  let queue: QueueModule;
  let client: QueryClient;

  beforeEach(async () => {
    ({ queue } = await loadFresh());
    client = new QueryClient();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    // Suppress the warn() the fallback path emits.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("falls back to an in-memory queue when IDB writes throw and still drains them", async () => {
    // Force every IDB transaction to fail by closing the database.
    const dbReq = indexedDB.open("superhumn-offline", 1);
    await new Promise<void>((resolve) => {
      dbReq.onsuccess = () => {
        dbReq.result.close();
        // Delete the database — subsequent open attempts will succeed but
        // we want add() to fail. So instead, monkey-patch IDBObjectStore.add.
        resolve();
      };
    });
    const origAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () {
      throw new Error("simulated IDB failure");
    };

    try {
      await queue.enqueueMutation({ path: "orders.update", input: { id: 99 } });

      const captured: Array<{ url: string; init: RequestInit }> = [];
      vi.stubGlobal("fetch", mockFetchOk(captured));
      const result = await queue.drainMutationQueue(client);

      expect(result.replayed).toBe(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].url).toBe("/api/trpc/orders.update?batch=1");
    } finally {
      IDBObjectStore.prototype.add = origAdd;
    }
  });
});
