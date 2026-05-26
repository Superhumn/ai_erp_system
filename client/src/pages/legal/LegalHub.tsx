import { lazy, Suspense } from "react";
import { Scale } from "lucide-react";
import { Loader2 } from "lucide-react";

const Contracts = lazy(() => import("./Contracts"));
const Disputes = lazy(() => import("./Disputes"));
const Documents = lazy(() => import("./Documents"));
const RegulatoryLicenses = lazy(() => import("./RegulatoryLicenses"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function LegalHub() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
        <Scale className="h-4 w-4" />
        Legal
      </h1>

      <Suspense fallback={fallback}><RegulatoryLicenses /></Suspense>

      <div className="border-t border-border/40" />

      <Suspense fallback={fallback}><Contracts /></Suspense>

      <div className="border-t border-border/40" />

      <Suspense fallback={fallback}><Disputes /></Suspense>

      <div className="border-t border-border/40" />

      <Suspense fallback={fallback}><Documents /></Suspense>
    </div>
  );
}
