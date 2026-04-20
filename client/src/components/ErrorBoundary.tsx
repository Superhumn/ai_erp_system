import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

// Stale dynamic import / chunk-load failures show up after a deploy when the
// browser still holds an old index.html that points at bundle hashes which no
// longer exist on the server. Recognising these lets us recover automatically.
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message || "";
  const name = error.name || "";
  return (
    name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

async function clearCachesAndReload(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    // Always surface to console so production users can paste the real error
    // when reporting issues — silent boundaries make bugs unfixable.
    console.error("[ErrorBoundary]", error, info.componentStack);

    if (isChunkLoadError(error)) {
      // Most likely a stale bundle after deploy — try to self-heal once.
      const ALREADY_TRIED = "__erp_chunk_reload_attempted__";
      if (!sessionStorage.getItem(ALREADY_TRIED)) {
        sessionStorage.setItem(ALREADY_TRIED, "1");
        clearCachesAndReload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      const message = error?.message || String(error) || "Unknown error";
      const chunkError = isChunkLoadError(error);

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2">An unexpected error occurred.</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center break-words">
              {chunkError
                ? "The app was updated. Reload to load the latest version."
                : message}
            </p>

            {import.meta.env.DEV && error?.stack && (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {error.stack}
                </pre>
                {this.state.componentStack && (
                  <pre className="text-xs text-muted-foreground/70 whitespace-break-spaces mt-2 pt-2 border-t border-border">
                    {this.state.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                Reload Page
              </button>
              <button
                onClick={() => clearCachesAndReload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border border-border",
                  "bg-background text-foreground",
                  "hover:bg-accent cursor-pointer"
                )}
              >
                <Trash2 size={16} />
                Clear Cache &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
