import { lazy, Suspense } from "react";
import { Loader2, Boxes, FlaskConical, Split, LineChart, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

const InventoryHub = lazy(() => import("./InventoryHub"));
const ManufacturingHub = lazy(() => import("./ManufacturingHub"));
const ProcurementHub = lazy(() => import("./ProcurementHub"));

const MORE_TOOLS = [
  { label: "Inventory Planning", path: "/operations/inventory-planning", desc: "Forecast, PO & freight status board", icon: LineChart },
  { label: "Channel Allocations", path: "/operations/allocations", desc: "Allocate inventory across channels", icon: Split },
  { label: "Production Batches", path: "/operations/production-batches", desc: "Track manufacturing batches", icon: Boxes },
  { label: "Ingredients", path: "/operations/ingredients", desc: "Ingredient master data & costs", icon: FlaskConical },
];

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

      <div className="border-t border-border/40 my-6" />

      <h2 className="text-sm font-semibold tracking-[-0.02em] mb-3">Planning, Costing & Master Data</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {MORE_TOOLS.map((t) => (
          <Link key={t.path} href={t.path}>
            <Card className="cursor-pointer hover:border-primary/30 transition-colors h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <t.icon className="h-4 w-4 text-muted-foreground" />
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
