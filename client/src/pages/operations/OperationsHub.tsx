import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Warehouse, Factory, Building2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const InventoryHub = lazy(() => import("./InventoryHub"));
const ManufacturingHub = lazy(() => import("./ManufacturingHub"));
const ProcurementHub = lazy(() => import("./ProcurementHub"));

const poStatusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
  { value: "sent", label: "Sent", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "confirmed", label: "Confirmed", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "shipped", label: "Shipped", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "received", label: "Received", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
];

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Detail Panel Components
function WorkOrderDetailPanel({ workOrder, onStatusChange, onStartProduction, onCompleteProduction }: { 
  workOrder: any; 
  onStatusChange: (id: number, status: string) => void;
  onStartProduction?: (id: number) => void;
  onCompleteProduction?: (id: number, completedQuantity: string) => void;
}) {
  const statusOption = workOrderStatuses.find(s => s.value === workOrder.status);
  
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">WO-{workOrder.id}</h3>
          <p className="text-sm text-muted-foreground">{workOrder.product?.name || workOrder.bom?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusOption?.color}>{statusOption?.label}</Badge>
          {(workOrder.status === "pending" || workOrder.status === "draft" || workOrder.status === "scheduled") && (
            <Button size="sm" onClick={() => onStartProduction?.(workOrder.id)}>
              <Play className="h-4 w-4 mr-1" /> Start
            </Button>
          )}
          {workOrder.status === "in_progress" && (
            <>
              <Button size="sm" variant="outline" onClick={() => onStatusChange(workOrder.id, "scheduled")}>
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
              <Button size="sm" onClick={() => onCompleteProduction?.(workOrder.id, workOrder.quantity)}>
                <CheckCircle className="h-4 w-4 mr-1" /> Complete
              </Button>
            </>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Quantity</div>
          <div className="font-medium">{workOrder.quantity}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Completed</div>
          <div className="font-medium">{workOrder.completedQuantity || 0}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Start Date</div>
          <div className="font-medium">{workOrder.startDate ? formatDate(workOrder.startDate) : "Not set"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Due Date</div>
          <div className="font-medium">{workOrder.dueDate ? formatDate(workOrder.dueDate) : "Not set"}</div>
        </div>
      </div>
      
      {workOrder.notes && (
        <div>
          <h4 className="font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground">{workOrder.notes}</p>
        </div>
      )}
    </div>
  );
}

function BomDetailPanel({ bom }: { bom: any }) {
  const { data: bomDetails } = trpc.bom.get.useQuery({ id: bom.id });
  const components = bomDetails?.components || [];
  
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{bom.name}</h3>
          <p className="text-sm text-muted-foreground">{bomDetails?.product?.name || "No product"}</p>
        </div>
        <Badge variant={bom.status === 'active' ? "default" : "secondary"}>
          {bom.status || "Draft"}
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Version</div>
          <div className="font-medium">{bom.version || "1.0"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Components</div>
          <div className="font-medium">{components.length}</div>
        </div>
      </div>
      
      {components.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Bill of Materials</h4>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Component</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c: any) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{c.name}</td>
                    <td className="text-right p-2">{c.quantity}</td>
                    <td className="text-right p-2">{c.unit || "ea"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationDetailPanel({ location }: { location: any }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{location.name}</h3>
          <p className="text-sm text-muted-foreground">{location.code}</p>
        </div>
        <Badge variant={location.isActive ? "default" : "secondary"}>
          {location.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Type</div>
          <div className="font-medium capitalize">{location.type || "Warehouse"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Capacity</div>
          <div className="font-medium">{location.capacity || "Unlimited"}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Items</div>
          <div className="font-medium">{location.itemCount || 0}</div>
        </div>
      </div>
      
      {location.address && (
        <div>
          <h4 className="font-medium mb-1">Address</h4>
          <p className="text-sm text-muted-foreground">{location.address}</p>
        </div>
      )}
    </div>
  );
}

function InventoryItemDetailPanel({ item }: { item: any }) {
  const locations = item.locations || [];
  const inTransit = item.inTransit || [];
  
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{item.product?.name || item.rawMaterial?.name}</h3>
          <p className="text-sm text-muted-foreground">SKU: {item.product?.sku || item.rawMaterial?.sku}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tracking-[-0.02em]">{item.totalQuantity || 0}</div>
          <p className="text-sm text-muted-foreground">{item.unit || "units"}</p>
        </div>
      </div>
      
      {locations.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">By Location</h4>
          <div className="space-y-2">
            {locations.map((loc: any, idx: number) => (
              <div key={idx} className="border rounded p-2 text-sm">
                <div className="font-medium">{loc.warehouseName}</div>
                <div className="grid grid-cols-4 gap-2 mt-1 text-xs">
                  <div><span className="text-muted-foreground">Available:</span> {loc.available}</div>
                  <div><span className="text-muted-foreground">Reserved:</span> {loc.reserved}</div>
                  <div><span className="text-muted-foreground">On Hold:</span> {loc.onHold}</div>
                  <div><span className="text-muted-foreground">Allocated:</span> {loc.allocated}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {inTransit.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">In Transit</h4>
          <div className="space-y-2">
            {inTransit.map((transit: any, idx: number) => (
              <div key={idx} className="border rounded p-2 text-sm">
                <div className="flex justify-between">
                  <span>{transit.from} → {transit.to}</span>
                  <span className="font-medium">{transit.quantity} units</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ETA: {transit.eta ? formatDate(transit.eta) : "TBD"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperationsHub() {
  const [tab, setTab] = useState("inventory");

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Operations Hub</h1>
          <p className="text-muted-foreground">
            Procurement, Manufacturing, and Inventory Management
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      {/* Consolidated Stats Row */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => { setActiveTab("procurement"); setProcurementSubTab("purchase-orders"); }}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending POs</p>
                <p className="text-lg font-semibold tracking-[-0.015em]">{stats.pendingPos}</p>
              </div>
              <ShoppingCart className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => { setActiveTab("procurement"); setProcurementSubTab("vendors"); }}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active Vendors</p>
                <p className="text-lg font-semibold tracking-[-0.015em]">{stats.activeVendors}</p>
              </div>
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => { setActiveTab("procurement"); setProcurementSubTab("materials"); }}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Low Stock</p>
                <p className="text-lg font-semibold tracking-[-0.015em] text-amber-600">{stats.lowStockMaterials}</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => { setActiveTab("manufacturing"); setManufacturingSubTab("workorders"); }}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open WOs</p>
                <p className="text-lg font-semibold tracking-[-0.015em]">{stats.openWorkOrders}</p>
              </div>
              <Factory className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => { setActiveTab("inventory"); setInventorySubTab("exceptions"); }}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Exceptions</p>
                <p className="text-lg font-semibold tracking-[-0.015em] text-red-600">{stats.exceptions}</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="procurement" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Procurement
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

        {/* MANUFACTURING TAB */}
        <TabsContent value="manufacturing" className="mt-4">
          <Tabs value={manufacturingSubTab} onValueChange={setManufacturingSubTab}>
            <TabsList>
              <TabsTrigger value="workorders" className="gap-2">
                <Clock className="h-4 w-4" />
                Work Orders
              </TabsTrigger>
              <TabsTrigger value="boms" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                BOMs
              </TabsTrigger>
              <TabsTrigger value="locations" className="gap-2">
                <MapPin className="h-4 w-4" />
                Locations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workorders" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <SpreadsheetTable
                    data={workOrders || []}
                    columns={workOrderColumns}
                    isLoading={workOrdersLoading}
                    showSearch
                    onAdd={() => setShowWorkOrderDialog(true)}
                    addLabel="New Work Order"
                    expandedRowId={expandedWorkOrderId}
                    onExpandChange={setExpandedWorkOrderId}
                    renderExpanded={(workOrder) => (
                      <WorkOrderDetailPanel 
                        workOrder={workOrder} 
                        onStatusChange={(id, status) => updateWorkOrderStatus.mutate({ id, status: status as any })}
                        onStartProduction={(id) => startProduction.mutate({ id })}
                        onCompleteProduction={(id, completedQuantity) => completeProduction.mutate({ id, completedQuantity })}
                      />
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="boms" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <SpreadsheetTable
                    data={boms || []}
                    columns={bomColumns}
                    isLoading={bomsLoading}
                    showSearch
                    onAdd={() => setShowBomDialog(true)}
                    addLabel="New BOM"
                    expandedRowId={expandedBomId}
                    onExpandChange={setExpandedBomId}
                    renderExpanded={(bom) => (
                      <BomDetailPanel bom={bom} />
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="locations" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <SpreadsheetTable
                    data={locations || []}
                    columns={locationColumns}
                    isLoading={locationsLoading}
                    showSearch
                    expandedRowId={expandedLocationId}
                    onExpandChange={setExpandedLocationId}
                    renderExpanded={(location) => (
                      <LocationDetailPanel location={location} />
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="procurement">
          <Suspense fallback={fallback}><ProcurementHub /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
