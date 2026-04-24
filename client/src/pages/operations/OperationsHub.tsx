import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Warehouse, Factory, Building2 } from "lucide-react";
import { lazy, Suspense } from "react";
import {
  Loader2, Search, Play, Pause, CheckCircle,
  Clock, ClipboardList, MapPin, ShoppingCart, Users, AlertTriangle,
} from "lucide-react";
import SpreadsheetTable, { Column } from "@/components/SpreadsheetTable";

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
    <div className="space-y-2">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em]">Operations</h1>
          <TabsList>
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
        </div>

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
