import { trpc } from "@/lib/trpc";
import {
  attachQueryCachePersistence,
  hydrateQueryCache,
} from "@/lib/offline/queryCache";
import { startMutationQueueWorker } from "@/lib/offline/mutationQueue";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry if offline — serve from cache instead
        if (!navigator.onLine) return false;
        // Skip retry for ignorable errors
        if (error instanceof TRPCClientError) {
          const msg = error.message || "";
          if (msg.includes("not configured") || msg.includes("not available") ||
              msg.includes("PRECONDITION_FAILED") || msg.includes("Database not available") ||
              (msg.includes("table") && msg.includes("doesn't exist"))) {
            return false;
          }
        }
        return failureCount < 1;
      },
      staleTime: 30_000, // 30s — prevents constant refetching
      refetchOnWindowFocus: false,
      // Show cached data while offline; refetch transparently when online.
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 0,
      // Mutations without explicit offline handling still surface the error;
      // pages that opt in via useOfflineMutation queue to IndexedDB.
      networkMode: "online",
    },
  },
});

// Restore any previously-cached query data from IndexedDB before first render
// so users see something other than spinners when they come back offline.
// Runs in parallel with the React Query Provider mounting — restored entries
// land in the cache and components pick them up on next render.
void hydrateQueryCache(queryClient);
attachQueryCachePersistence(queryClient);
startMutationQueueWorker(queryClient);

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

// Suppress noisy errors for unconfigured modules — only log real errors
const isIgnorableError = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return false;
  const msg = error.message || "";
  return msg.includes("not configured") || msg.includes("not available") ||
    msg.includes("PRECONDITION_FAILED") || msg.includes("Database not available") ||
    msg.includes("table") && msg.includes("doesn't exist");
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isIgnorableError(error)) {
      console.error("[API Query Error]", error);
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isIgnorableError(error)) {
      console.error("[API Mutation Error]", error);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    // Streaming-capable superset of httpBatchLink: existing queries/mutations
    // behave identically (still batched, still superjson), while procedures that
    // return an async generator (e.g. ai.agentChatStream) stream to the client.
    httpBatchStreamLink({
      url: "/api/trpc",
      transformer: superjson as any,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
