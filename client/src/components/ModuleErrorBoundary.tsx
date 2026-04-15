import { Component, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Module-level error boundary — wraps individual pages/routes so
 * a crash in one module doesn't take down the whole app.
 * Shows a friendly message with retry + go home options.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || "";
      const isNotConfigured = msg.includes("not configured") || msg.includes("not available") || msg.includes("PRECONDITION_FAILED");
      const isNotFound = msg.includes("NOT_FOUND") || msg.includes("404");

      return (
        <div className="flex items-center justify-center py-20 px-8">
          <div className="flex flex-col items-center max-w-md text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">
              {isNotConfigured
                ? `${this.props.moduleName || "Module"} needs setup`
                : isNotFound
                  ? "Page not found"
                  : "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {isNotConfigured
                ? "This feature requires configuration. Check Settings → Integrations to connect the required services."
                : msg || "An unexpected error occurred while loading this section."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Try Again
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = "/"}
              >
                <Home className="h-4 w-4 mr-1" />
                Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
