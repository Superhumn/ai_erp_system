import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center max-w-sm mx-4 animate-fade-in">
        <div className="text-6xl font-semibold tracking-[-0.04em] text-muted-foreground/20 mb-4">
          404
        </div>
        <h2 className="text-lg font-semibold tracking-[-0.015em] mb-2">
          Page not found
        </h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button onClick={() => setLocation("/")}>
          <Home className="w-3.5 h-3.5 mr-1.5" />
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
