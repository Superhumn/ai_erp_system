/**
 * Tiny promise-wrapped IndexedDB helper.
 *
 * Two object stores:
 *   - "queries"   key = stable JSON of the React Query queryKey
 *   - "mutations" autoIncrement, used as a FIFO queue
 *
 * Kept dependency-free — we only need a few simple ops.
 */

const DB_NAME = "superhumn-offline";
const DB_VERSION = 1;
const QUERIES_STORE = "queries";
const MUTATIONS_STORE = "mutations";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUERIES_STORE)) {
        db.createObjectStore(QUERIES_STORE);
      }
      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        db.createObjectStore(MUTATIONS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result: T | undefined;
        const req = fn(s);
        if (req) {
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => reject(req.error);
        }
        t.oncomplete = () => resolve(result as T);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// ── Queries store ──────────────────────────────────────────────────────────

export async function idbGetQuery<T = unknown>(key: string): Promise<T | undefined> {
  try {
    return await tx<T>(QUERIES_STORE, "readonly", (s) => s.get(key) as IDBRequest<T>);
  } catch {
    return undefined;
  }
}

export async function idbSetQuery(key: string, value: unknown): Promise<void> {
  try {
    await tx(QUERIES_STORE, "readwrite", (s) => {
      s.put(value, key);
    });
  } catch {
    /* swallow — offline cache is best-effort */
  }
}

export async function idbDeleteQuery(key: string): Promise<void> {
  try {
    await tx(QUERIES_STORE, "readwrite", (s) => {
      s.delete(key);
    });
  } catch {
    /* swallow */
  }
}

export async function idbAllQueries(): Promise<Array<{ key: string; value: unknown }>> {
  try {
    return await openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const out: Array<{ key: string; value: unknown }> = [];
          const t = db.transaction(QUERIES_STORE, "readonly");
          const s = t.objectStore(QUERIES_STORE);
          const req = s.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              out.push({ key: String(cursor.key), value: cursor.value });
              cursor.continue();
            }
          };
          req.onerror = () => reject(req.error);
          t.oncomplete = () => resolve(out);
          t.onerror = () => reject(t.error);
        }),
    );
  } catch {
    return [];
  }
}

// ── Mutation queue ─────────────────────────────────────────────────────────

export type QueuedMutation = {
  id?: number;
  /** dotted tRPC procedure path, e.g. "orders.update" */
  path: string;
  input: unknown;
  /** ISO timestamp when enqueued */
  enqueuedAt: string;
  /** optional human-readable label for UI */
  label?: string;
};

export async function idbEnqueueMutation(m: Omit<QueuedMutation, "id">): Promise<number> {
  return tx<number>(MUTATIONS_STORE, "readwrite", (s) => {
    const req = s.add(m);
    return req as IDBRequest<number>;
  });
}

export async function idbAllMutations(): Promise<QueuedMutation[]> {
  try {
    return await openDb().then(
      (db) =>
        new Promise<QueuedMutation[]>((resolve, reject) => {
          const out: QueuedMutation[] = [];
          const t = db.transaction(MUTATIONS_STORE, "readonly");
          const s = t.objectStore(MUTATIONS_STORE);
          const req = s.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              out.push(cursor.value as QueuedMutation);
              cursor.continue();
            }
          };
          req.onerror = () => reject(req.error);
          t.oncomplete = () => resolve(out);
          t.onerror = () => reject(t.error);
        }),
    );
  } catch {
    return [];
  }
}

export async function idbDeleteMutation(id: number): Promise<void> {
  try {
    await tx(MUTATIONS_STORE, "readwrite", (s) => {
      s.delete(id);
    });
  } catch {
    /* swallow */
  }
}

/**
 * Wipe both stores. Called on logout so a different user signing in on the
 * same device can't see the previous user's cached data or have their queued
 * mutations replayed under the new session's cookies.
 */
export async function idbClearAll(): Promise<void> {
  try {
    await tx(QUERIES_STORE, "readwrite", (s) => {
      s.clear();
    });
    await tx(MUTATIONS_STORE, "readwrite", (s) => {
      s.clear();
    });
  } catch {
    /* swallow — best-effort */
  }
}
