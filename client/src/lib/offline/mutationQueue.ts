/**
 * Offline mutation queue.
 *
 * When the user is offline (or a mutation fails because of a network error),
 * `enqueueMutation()` stores it in IndexedDB. When the connection returns,
 * `drainMutationQueue()` walks the queue oldest-first and POSTs each one to
 * the tRPC HTTP endpoint, then invalidates the relevant React Query keys.
 *
 * Wire-up:
 *   - main.tsx calls `startMutationQueueWorker(queryClient)` once at boot.
 *     That listener replays whatever's queued whenever `online` fires.
 *   - Pages opt in via `useOfflineMutation` (see hooks/useOfflineMutation.ts).
 */
import type { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import { idbAllMutations, idbDeleteMutation, idbEnqueueMutation, type QueuedMutation } from "./idb";

type QueueListener = (count: number) => void;
const listeners = new Set<QueueListener>();
let cachedCount = 0;

export function subscribeQueueSize(fn: QueueListener): () => void {
  listeners.add(fn);
  fn(cachedCount);
  return () => listeners.delete(fn);
}

async function refreshCount(): Promise<void> {
  const all = await idbAllMutations();
  cachedCount = all.length;
  listeners.forEach((l) => l(cachedCount));
}

export async function enqueueMutation(m: Omit<QueuedMutation, "id" | "enqueuedAt">): Promise<void> {
  await idbEnqueueMutation({ ...m, enqueuedAt: new Date().toISOString() });
  await refreshCount();
}

/**
 * Posts a single mutation to the tRPC HTTP endpoint.
 *
 * The app uses `httpBatchLink` with the superjson transformer, so we mimic
 * that exact shape (single-item batch) to stay compatible with the server.
 *
 *   POST /api/trpc/<path>?batch=1
 *   body: { "0": <transformer.serialize(input)> }
 *
 * A 200 with a per-call error payload still throws here so the mutation
 * stays at the head of the queue and we can retry on the next `online`.
 */
async function replay(m: QueuedMutation): Promise<void> {
  const body = JSON.stringify({ 0: superjson.serialize(m.input) });
  const res = await fetch(`/api/trpc/${m.path}?batch=1`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-trpc-source": "offline-queue",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`replay ${m.path} failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as Array<{ error?: unknown }>;
  const first = Array.isArray(json) ? json[0] : json;
  if (first && typeof first === "object" && "error" in first && first.error) {
    throw new Error(`replay ${m.path} returned error`);
  }
}

/**
 * Map a tRPC procedure path to the React Query keys we should invalidate
 * after a successful replay. Keep this small and explicit — over-invalidating
 * is fine, missing one means stale UI after sync.
 */
function invalidationsFor(path: string): string[][] {
  const root = path.split(".")[0];
  switch (root) {
    case "orders":
      return [["orders", "list"], ["orders", "get"]];
    case "crm":
      return [["crm"]];
    default:
      return [[root]];
  }
}

export async function drainMutationQueue(client: QueryClient): Promise<{
  replayed: number;
  failed: number;
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { replayed: 0, failed: 0 };
  }
  const queue = await idbAllMutations();
  let replayed = 0;
  let failed = 0;
  for (const m of queue) {
    try {
      await replay(m);
      if (m.id != null) await idbDeleteMutation(m.id);
      replayed++;
      for (const key of invalidationsFor(m.path)) {
        client.invalidateQueries({ queryKey: key });
      }
    } catch (err) {
      failed++;
      // Stop on first failure — we'll retry on next `online` event.
      // Leaves the failed mutation at the head of the queue.
      console.warn("[offline-queue] replay failed", m.path, err);
      break;
    }
  }
  await refreshCount();
  return { replayed, failed };
}

export function startMutationQueueWorker(client: QueryClient): () => void {
  const onOnline = () => {
    void drainMutationQueue(client).then((r) => {
      if (r.replayed > 0) {
        // soft signal — the page-level mutations also surface their own toasts
        console.info(`[offline-queue] replayed ${r.replayed} mutation(s)`);
      }
    });
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    if (navigator.onLine) onOnline(); // catch a queue from a previous session
  }
  void refreshCount();
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
    }
  };
}
