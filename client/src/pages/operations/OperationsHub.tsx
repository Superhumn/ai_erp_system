import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Warehouse, Factory, Building2 } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("inventory");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Operations Hub</h1>
        <p className="text-sm text-muted-foreground">
          Procurement, Manufacturing, and Inventory Management
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inventory" className="gap-2">
            <Warehouse className="h-4 w-4" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="manufacturing" className="gap-2">
            <Factory className="h-4 w-4" />
            Manufacturing
          </TabsTrigger>
          <TabsTrigger value="procurement" className="gap-2">
            <Building2 className="h-4 w-4" />
            Procurement
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Suspense fallback={<PageLoader />}>
            <InventoryHub />
          </Suspense>
        </TabsContent>

        <TabsContent value="manufacturing">
          <Suspense fallback={<PageLoader />}>
            <ManufacturingHub />
          </Suspense>
        </TabsContent>

        <TabsContent value="procurement">
          <Suspense fallback={<PageLoader />}>
            <ProcurementHub />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
