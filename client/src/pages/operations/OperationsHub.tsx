import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Warehouse, Factory, Building2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const InventoryHub = lazy(() => import("./InventoryHub"));
const ManufacturingHub = lazy(() => import("./ManufacturingHub"));
const ProcurementHub = lazy(() => import("./ProcurementHub"));

const fallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function OperationsHub() {
  const [tab, setTab] = useState("inventory");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Warehouse className="h-8 w-8" />
          Operations
        </h1>
        <p className="text-muted-foreground mt-1">
          Inventory, manufacturing, and procurement
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inventory" className="flex items-center gap-1.5">
            <Warehouse className="h-4 w-4" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="manufacturing" className="flex items-center gap-1.5">
            <Factory className="h-4 w-4" />
            Manufacturing
          </TabsTrigger>
          <TabsTrigger value="procurement" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            Procurement
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Suspense fallback={fallback}><InventoryHub /></Suspense>
        </TabsContent>
        <TabsContent value="manufacturing">
          <Suspense fallback={fallback}><ManufacturingHub /></Suspense>
        </TabsContent>
        <TabsContent value="procurement">
          <Suspense fallback={fallback}><ProcurementHub /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
