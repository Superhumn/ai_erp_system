import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const Employees = lazy(() => import("./Employees"));

export default function HRHub() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Employees />
    </Suspense>
  );
}
