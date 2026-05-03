/**
 * Tests for the IndexedDB helper. Uses fake-indexeddb (loaded globally in
 * client/src/test/setup.ts).
 *
 * Each test resets both `globalThis.indexedDB` and the module cache so the
 * tested module re-opens a fresh DB — otherwise the singleton `dbPromise`
 * inside idb.ts would carry state across tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

type IdbModule = typeof import("./idb");

async function loadFresh(): Promise<IdbModule> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  return await import("./idb");
}

describe("offline/idb — query store", () => {
  let idb: IdbModule;
  beforeEach(async () => {
    idb = await loadFresh();
  });
  afterEach(() => vi.restoreAllMocks());

  it("round-trips a value by key", async () => {
    await idb.idbSetQuery("k1", { hello: "world" });
    expect(await idb.idbGetQuery("k1")).toEqual({ hello: "world" });
  });

  it("returns undefined for missing key", async () => {
    expect(await idb.idbGetQuery("missing")).toBeUndefined();
  });

  it("idbAllQueries lists every entry", async () => {
    await idb.idbSetQuery("a", 1);
    await idb.idbSetQuery("b", 2);
    await idb.idbSetQuery("c", 3);
    const all = await idb.idbAllQueries();
    expect(all.map((e) => e.key).sort()).toEqual(["a", "b", "c"]);
    expect(all.map((e) => e.value).sort()).toEqual([1, 2, 3]);
  });

  it("idbDeleteQuery removes an entry", async () => {
    await idb.idbSetQuery("a", 1);
    await idb.idbDeleteQuery("a");
    expect(await idb.idbGetQuery("a")).toBeUndefined();
  });

  it("idbClearAll wipes both stores", async () => {
    await idb.idbSetQuery("a", 1);
    await idb.idbEnqueueMutation({
      path: "x.y",
      input: {},
      enqueuedAt: new Date().toISOString(),
    });
    await idb.idbClearAll();
    expect(await idb.idbAllQueries()).toEqual([]);
    expect(await idb.idbAllMutations()).toEqual([]);
  });
});

describe("offline/idb — mutation queue", () => {
  let idb: IdbModule;
  beforeEach(async () => {
    idb = await loadFresh();
  });

  it("autoIncrement assigns ids in insertion order (FIFO)", async () => {
    const id1 = await idb.idbEnqueueMutation({
      path: "orders.update",
      input: { id: 1 },
      enqueuedAt: "2026-01-01T00:00:00Z",
    });
    const id2 = await idb.idbEnqueueMutation({
      path: "orders.update",
      input: { id: 2 },
      enqueuedAt: "2026-01-01T00:00:01Z",
    });
    const id3 = await idb.idbEnqueueMutation({
      path: "orders.update",
      input: { id: 3 },
      enqueuedAt: "2026-01-01T00:00:02Z",
    });
    expect(id1).toBeLessThan(id2);
    expect(id2).toBeLessThan(id3);

    const all = await idb.idbAllMutations();
    expect(all.map((m) => (m.input as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("idbDeleteMutation removes the targeted entry only", async () => {
    const id1 = await idb.idbEnqueueMutation({
      path: "x",
      input: { n: 1 },
      enqueuedAt: "t",
    });
    await idb.idbEnqueueMutation({ path: "x", input: { n: 2 }, enqueuedAt: "t" });
    await idb.idbDeleteMutation(id1);
    const remaining = await idb.idbAllMutations();
    expect(remaining.map((m) => (m.input as { n: number }).n)).toEqual([2]);
  });
});
