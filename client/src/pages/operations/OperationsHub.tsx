import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const InventoryHub = lazy(() => import("./InventoryHub"));
const ManufacturingHub = lazy(() => import("./ManufacturingHub"));
const ProcurementHub = lazy(() => import("./ProcurementHub"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function OperationsHub() {
  return (
    <div className="space-y-0">
      <h1 className="text-sm font-bold tracking-[-0.02em] mb-4">Operations</h1>

      <Suspense fallback={<PageLoader />}>
        <InventoryHub />
      </Suspense>

      <div className="border-t border-border/40 my-6" />

      <Suspense fallback={<PageLoader />}>
        <ManufacturingHub />
      </Suspense>

      <div className="border-t border-border/40 my-6" />

      <Suspense fallback={<PageLoader />}>
        <ProcurementHub />
      </Suspense>
    </div>
  );
}
