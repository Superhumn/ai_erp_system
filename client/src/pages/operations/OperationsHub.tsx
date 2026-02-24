import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Factory, ShoppingCart } from "lucide-react";

// Import existing hub components
import InventoryHub from "./InventoryHub";
import ManufacturingHub from "./ManufacturingHub";
import ProcurementHub from "./ProcurementHub";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function OperationsHub() {
  const [activeTab, setActiveTab] = useState("inventory");

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Operations</h1>
          <AITriggerButton message="Analyze overall operations - show cross-functional metrics, identify bottlenecks, and suggest improvements" label="AI Operations Insights" />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Manage inventory, manufacturing, and procurement in one place
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b px-6">
          <TabsList className="h-12 bg-transparent">
            <TabsTrigger value="inventory" className="gap-2">
              <Package className="w-4 h-4" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="manufacturing" className="gap-2">
              <Factory className="w-4 h-4" />
              Manufacturing
            </TabsTrigger>
            <TabsTrigger value="procurement" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              Procurement
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="inventory" className="h-full m-0 p-0">
            <InventoryHub />
          </TabsContent>

          <TabsContent value="manufacturing" className="h-full m-0 p-0">
            <ManufacturingHub />
          </TabsContent>

          <TabsContent value="procurement" className="h-full m-0 p-0">
            <ProcurementHub />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
