import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { enqueueMutation, subscribeQueueSize } from "@/lib/offline/mutationQueue";

export type OfflineMutationOptions<TInput> = {
  /** dotted tRPC path, e.g. "orders.update" */
  path: string;
  /** human-readable label used in queued / replayed toasts */
  label?: string;
  /**
   * Online execution. Throws on failure — caller is the tRPC mutateAsync.
   */
  online: (input: TInput) => Promise<unknown>;
  /**
   * Optimistic UI update applied immediately (online or offline). Use this
   * to e.g. set the local order status before the network round-trip.
   * Optional.
   */
  optimistic?: (input: TInput) => void;
};

/**
 * Wraps a tRPC mutation so it transparently queues to IndexedDB when the
 * device is offline. Online behaviour is unchanged — you still get
 * isPending and the same error semantics.
 */
export function useOfflineMutation<TInput>(opts: OfflineMutationOptions<TInput>) {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (input: TInput): Promise<{ queued: boolean }> => {
      opts.optimistic?.(input);

      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline) {
        await enqueueMutation({ path: opts.path, input, label: opts.label });
        toast.message("Saved offline", {
          description: opts.label
            ? `${opts.label} will sync when you're back online.`
            : "Will sync when you're back online.",
        });
        return { queued: true };
      }

      setIsPending(true);
      try {
        await opts.online(input);
        return { queued: false };
      } catch (err: unknown) {
        // If the failure looks like a network error, queue it; else surface.
        const isNetwork =
          err instanceof TypeError ||
          (err instanceof Error && /network|fetch|failed to fetch/i.test(err.message));
        if (isNetwork) {
          await enqueueMutation({ path: opts.path, input, label: opts.label });
          toast.message("Saved offline", {
            description: opts.label
              ? `${opts.label} will sync when you're back online.`
              : "Will sync when you're back online.",
          });
          return { queued: true };
        }
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [opts],
  );

  return { mutate, isPending };
}

/** Reactive count of queued offline mutations awaiting replay. */
export function usePendingOfflineCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeQueueSize(setCount), []);
  return count;
}
