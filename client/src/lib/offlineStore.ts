// IndexedDB offline store for caching tRPC query results and queuing mutations
// No external dependencies — raw IndexedDB API

const DB_NAME = "superhumn-erp-offline";
const DB_VERSION = 1;

const STORES = {
  queryCache: "queryCache",
  pendingMutations: "pendingMutations",
  meta: "meta",
} as const;

// Query keys worth caching offline (high-traffic modules)
const CACHEABLE_PREFIXES = [
  "dashboard",
  "contact",
  "project",
  "task",
  "inventory",
  "invoice",
  "order",
  "vendor",
  "employee",
  "notification",
];

interface CachedQuery {
  key: string;
  data: unknown;
  timestamp: number;
}

interface PendingMutation {
  id: string;
  mutationKey: string;
  input: unknown;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.queryCache)) {
        db.createObjectStore(STORES.queryCache, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.pendingMutations)) {
        db.createObjectStore(STORES.pendingMutations, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Returns true if this query key is worth caching offline */
export function isCacheableQuery(key: string): boolean {
  const lower = key.toLowerCase();
  return CACHEABLE_PREFIXES.some((p) => lower.includes(p));
}

/** Cache a tRPC query result by key */
export async function cacheQueryResult(
  key: string,
  data: unknown
): Promise<void> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.queryCache, "readwrite");
    const entry: CachedQuery = { key, data, timestamp: Date.now() };
    await reqToPromise(store.put(entry));
    db.close();
  } catch {
    // Silently fail — offline cache is best-effort
  }
}

/** Retrieve a cached query result */
export async function getCachedQuery(key: string): Promise<unknown | null> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.queryCache, "readonly");
    const result = await reqToPromise(store.get(key));
    db.close();
    return (result as CachedQuery | undefined)?.data ?? null;
  } catch {
    return null;
  }
}

/** Queue a mutation to replay when back online */
export async function queueMutation(
  mutationKey: string,
  input: unknown
): Promise<void> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.pendingMutations, "readwrite");
    const entry: PendingMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mutationKey,
      input,
      timestamp: Date.now(),
    };
    await reqToPromise(store.put(entry));
    db.close();
  } catch {
    // Silently fail
  }
}

/** Get all pending mutations in chronological order */
export async function getPendingMutations(): Promise<PendingMutation[]> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.pendingMutations, "readonly");
    const all = await reqToPromise(store.getAll());
    db.close();
    return (all as PendingMutation[]).sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

/** Remove a successfully replayed mutation */
export async function clearPendingMutation(id: string): Promise<void> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.pendingMutations, "readwrite");
    await reqToPromise(store.delete(id));
    db.close();
  } catch {
    // Silently fail
  }
}

/** Get last sync timestamp */
export async function getLastSyncTime(): Promise<number | null> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.meta, "readonly");
    const result = await reqToPromise(store.get("lastSyncTime"));
    db.close();
    return (result as { key: string; value: number } | undefined)?.value ?? null;
  } catch {
    return null;
  }
}

/** Update last sync timestamp to now */
export async function setLastSyncTime(): Promise<void> {
  try {
    const db = await openDB();
    const store = tx(db, STORES.meta, "readwrite");
    await reqToPromise(
      store.put({ key: "lastSyncTime", value: Date.now() })
    );
    db.close();
  } catch {
    // Silently fail
  }
}
