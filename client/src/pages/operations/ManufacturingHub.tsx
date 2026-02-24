import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import SpreadsheetTable, { Column } from "@/components/SpreadsheetTable";
import { QuickCreateButton, QuickCreateDialog } from "@/components/QuickCreateDialog";
import { 
import { AITriggerButton } from "@/components/FloatingAIAssistant";
  Package, Warehouse, ClipboardList, MapPin, Search, Plus, 
  AlertTriangle, CheckCircle, Clock, Play, Pause, X, ChevronRight
} from "lucide-react";

// Status options
const workOrderStatuses = [
  { value: "pending", label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-800" },
  { value: "completed", label: "Completed", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

// Detail Panel Components
function InventoryDetailPanel({ item, onClose }: { item: any; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{item.product?.name || `Inventory #${item.id}`}</h3>
          <p className="text-sm text-muted-foreground">Product ID: {item.productId}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{item.quantity || 0}</div>
          <p className="text-sm text-muted-foreground">Current Stock</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Reorder Level</div>
          <div className="font-medium">{item.reorderLevel || 0}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Reserved</div>
          <div className="font-medium">{item.reservedQuantity || 0}</div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Available</div>
          <div className="font-medium">{(parseFloat(item.quantity) || 0) - (parseFloat(item.reservedQuantity) || 0)}</div>
        </div>
      </div>
    </div>
  );
}

function BomDetailPanel({ bom, onClose }: { bom: any; onClose: () => void }) {
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

function WorkOrderDetailPanel({ workOrder, onClose, onStatusChange, onStartProduction, onCompleteProduction }: { 
  workOrder: any; 
  onClose: () => void;
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
              <Play className="h-4 w-4 mr-1" /> Start Production
            </Button>
          )}
          {workOrder.status === "in_progress" && (
            <>
              <Button size="sm" variant="outline" onClick={() => onStatusChange(workOrder.id, "scheduled")}>
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
              <Button size="sm" onClick={() => onCompleteProduction?.(workOrder.id, workOrder.quantity)}>
                <CheckCircle className="h-4 w-4 mr-1" /> Complete Production
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
          <div className="font-medium">
            {workOrder.startDate ? new Date(workOrder.startDate).toLocaleDateString() : "Not set"}
          </div>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <div className="text-muted-foreground">Due Date</div>
          <div className="font-medium">
            {workOrder.dueDate ? new Date(workOrder.dueDate).toLocaleDateString() : "Not set"}
          </div>
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

function LocationDetailPanel({ location, onClose }: { location: any; onClose: () => void }) {
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

export default function ManufacturingHub() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");
  const [expandedInventoryId, setExpandedInventoryId] = useState<number | string | null>(null);
  const [expandedBomId, setExpandedBomId] = useState<number | string | null>(null);
  const [expandedWorkOrderId, setExpandedWorkOrderId] = useState<number | string | null>(null);
  const [expandedLocationId, setExpandedLocationId] = useState<number | string | null>(null);
  const [showBomDialog, setShowBomDialog] = useState(false);
  const [showWorkOrderDialog, setShowWorkOrderDialog] = useState(false);

  // Queries
  const { data: inventory, isLoading: inventoryLoading, refetch: refetchInventory } = trpc.inventory.list.useQuery();
  const { data: boms, isLoading: bomsLoading, refetch: refetchBoms } = trpc.bom.list.useQuery();
  const { data: workOrders, isLoading: workOrdersLoading, refetch: refetchWorkOrders } = trpc.workOrders.list.useQuery();
  const { data: locations, isLoading: locationsLoading, refetch: refetchLocations } = trpc.warehouses.list.useQuery();

  // Mutations
  const updateWorkOrderStatus = trpc.workOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Work order updated");
      refetchWorkOrders();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // AI Agent mutations for autonomous operations
  const createAiTask = trpc.aiAgent.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("AI task created - check Approval Queue for approval");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const startProduction = trpc.workOrders.startProduction.useMutation({
    onSuccess: () => {
      toast.success("Production started - materials will be consumed");
      refetchWorkOrders();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const completeProduction = trpc.workOrders.completeProduction.useMutation({
    onSuccess: () => {
      toast.success("Production completed - finished goods added to inventory");
      refetchWorkOrders();
      refetchInventory();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const startWorkOrder = trpc.workOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Work order started");
      refetchWorkOrders();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Column definitions
  const inventoryColumns: Column<any>[] = [
    { key: "sku", header: "SKU", type: "text", sortable: true },
    { key: "name", header: "Name", type: "text", sortable: true },
    { key: "quantity", header: "Qty", type: "number", sortable: true },
    { key: "reorderPoint", header: "Reorder", type: "number" },
    { key: "unitCost", header: "Cost", type: "currency" },
    { key: "location", header: "Location", type: "text" },
  ];

  const bomColumns: Column<any>[] = [
    { key: "name", header: "BOM Name", type: "text", sortable: true },
    { key: "product.name", header: "Product", type: "text", sortable: true },
    { key: "version", header: "Version", type: "text" },
    { key: "componentCount", header: "Components", type: "number" },
    { key: "isActive", header: "Status", type: "badge", 
      render: (row, val) => val ? "Active" : "Inactive" },
  ];

  const workOrderColumns: Column<any>[] = [
    { key: "id", header: "WO #", type: "text", sortable: true, render: (row, val) => `WO-${val}` },
    { key: "productName", header: "Product", type: "text", sortable: true },
    { key: "quantity", header: "Qty", type: "number", sortable: true },
    { key: "completedQuantity", header: "Done", type: "number" },
    { key: "status", header: "Status", type: "badge", sortable: true,
      render: (row, val) => workOrderStatuses.find(s => s.value === val)?.label || val },
    { key: "dueDate", header: "Due", type: "date", sortable: true },
  ];

  const locationColumns: Column<any>[] = [
    { key: "code", header: "Code", type: "text", sortable: true },
    { key: "name", header: "Name", type: "text", sortable: true },
    { key: "type", header: "Type", type: "text" },
    { key: "capacity", header: "Capacity", type: "number" },
    { key: "isActive", header: "Status", type: "badge",
      render: (row, val) => val ? "Active" : "Inactive" },
  ];

  // Selection state for bulk actions
  const [selectedWorkOrders, setSelectedWorkOrders] = useState<Set<number | string>>(new Set());
  const [selectedBoms, setSelectedBoms] = useState<Set<number | string>>(new Set());

  // Bulk action handlers
  const handleWorkOrderBulkAction = (action: string, selectedIds: Set<number | string>) => {
    const ids = Array.from(selectedIds);
    if (action === "start_all") {
      ids.forEach(id => startProduction.mutate({ id: Number(id) }));
      setSelectedWorkOrders(new Set());
    } else if (action === "complete_all") {
      ids.forEach(id => {
        const wo = workOrders?.find((w: any) => w.id === id);
        if (wo) completeProduction.mutate({ id: Number(id), completedQuantity: wo.quantity });
      });
      setSelectedWorkOrders(new Set());
    } else if (action === "cancel_all") {
      ids.forEach(id => updateWorkOrderStatus.mutate({ id: Number(id), status: "cancelled" }));
      setSelectedWorkOrders(new Set());
    }
  };

  const handleBomBulkAction = (action: string, selectedIds: Set<number | string>) => {
    const ids = Array.from(selectedIds);
    if (action === "create_work_orders") {
      ids.forEach(id => {
        const bom = boms?.find((b: any) => b.id === id);
        if (bom) {
          createAiTask.mutate({
            taskType: "reorder_materials",
            priority: "medium",
            taskData: JSON.stringify({
              bomId: bom.id,
              productId: bom.productId,
              quantity: "1",
              notes: `AI-generated work order for ${bom.name}`,
            }),
            aiReasoning: `Creating work order from BOM ${bom.name}`,
          });
        }
      });
      setSelectedBoms(new Set());
    }
  };

  // Bulk action definitions
  const workOrderBulkActions = [
    { key: "start_all", label: "Start All", icon: <Play className="h-4 w-4" />, variant: "default" as const },
    { key: "complete_all", label: "Complete All", icon: <CheckCircle className="h-4 w-4" />, variant: "default" as const },
    { key: "cancel_all", label: "Cancel All", icon: <X className="h-4 w-4" />, variant: "destructive" as const },
  ];

  const bomBulkActions = [
    { key: "create_work_orders", label: "AI: Create Work Orders", icon: <ClipboardList className="h-4 w-4" />, variant: "default" as const },
  ];

  // Stats
  const stats = useMemo(() => ({
    totalSkus: inventory?.length || 0,
    lowStock: inventory?.filter((i: any) => i.quantity <= (i.reorderPoint || 0)).length || 0,
    activeBoms: boms?.filter((b: any) => b.isActive).length || 0,
    openWorkOrders: workOrders?.filter((w: any) => w.status !== "completed" && w.status !== "cancelled").length || 0,
    locations: locations?.length || 0,
  }), [inventory, boms, workOrders, locations]);

  return (
    <>
    <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Manufacturing Hub</h1>
          <AITriggerButton message="Analyze our manufacturing operations - show capacity utilization, predict output, and identify improvement opportunities" label="AI Manufacturing Insights" />
        </div>
            <p className="text-muted-foreground">
              Inventory, BOMs, Work Orders, and Locations
            </p>
          </div>
          <div className="flex items-center gap-2">
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
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("inventory")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total SKUs</p>
                  <p className="text-2xl font-bold">{stats.totalSkus}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("inventory")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.lowStock}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("boms")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active BOMs</p>
                  <p className="text-2xl font-bold">{stats.activeBoms}</p>
                </div>
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("workorders")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Open Work Orders</p>
                  <p className="text-2xl font-bold">{stats.openWorkOrders}</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveTab("locations")}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Locations</p>
                  <p className="text-2xl font-bold">{stats.locations}</p>
                </div>
                <MapPin className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="inventory">
              <Package className="h-4 w-4 mr-2" /> Inventory
            </TabsTrigger>
            <TabsTrigger value="boms">
              <ClipboardList className="h-4 w-4 mr-2" /> BOMs
            </TabsTrigger>
            <TabsTrigger value="workorders">
              <Clock className="h-4 w-4 mr-2" /> Work Orders
            </TabsTrigger>
            <TabsTrigger value="locations">
              <MapPin className="h-4 w-4 mr-2" /> Locations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <SpreadsheetTable
                  data={inventory || []}
                  columns={inventoryColumns}
                  isLoading={inventoryLoading}
                  showSearch
                  expandedRowId={expandedInventoryId}
                  onExpandChange={setExpandedInventoryId}
                  renderExpanded={(item, onClose) => (
                    <InventoryDetailPanel item={item} onClose={onClose} />
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
                  emptyMessage="No bills of materials found. Create a BOM to define product recipes."
                  emptyAction={
                    <QuickCreateButton
                      entityType="bom"
                      label="Create First BOM"
                      variant="default"
                      onCreated={() => refetchBoms()}
                    />
                  }
                  showSearch
                  onAdd={() => setShowBomDialog(true)}
                  addLabel="New BOM"
                  expandedRowId={expandedBomId}
                  onExpandChange={setExpandedBomId}
                  selectedRows={selectedBoms}
                  onSelectionChange={setSelectedBoms}
                  bulkActions={bomBulkActions}
                  onBulkAction={handleBomBulkAction}
                  renderExpanded={(bom, onClose) => (
                    <BomDetailPanel bom={bom} onClose={onClose} />
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workorders" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <SpreadsheetTable
                  data={workOrders || []}
                  columns={workOrderColumns}
                  isLoading={workOrdersLoading}
                  emptyMessage="No work orders found. Create a work order to schedule production."
                  emptyAction={
                    <QuickCreateButton
                      entityType="workOrder"
                      label="Create First Work Order"
                      variant="default"
                      onCreated={() => refetchWorkOrders()}
                    />
                  }
                  showSearch
                  onAdd={() => setShowWorkOrderDialog(true)}
                  addLabel="New Work Order"
                  expandedRowId={expandedWorkOrderId}
                  onExpandChange={setExpandedWorkOrderId}
                  selectedRows={selectedWorkOrders}
                  onSelectionChange={setSelectedWorkOrders}
                  bulkActions={workOrderBulkActions}
                  onBulkAction={handleWorkOrderBulkAction}
                  renderExpanded={(workOrder, onClose) => (
                    <WorkOrderDetailPanel 
                      workOrder={workOrder} 
                      onClose={onClose}
                      onStatusChange={(id, status) => updateWorkOrderStatus.mutate({ id, status } as any)}
                      onStartProduction={(id) => startProduction.mutate({ id })}
                      onCompleteProduction={(id, completedQuantity) => completeProduction.mutate({ id, completedQuantity })}
                    />
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
                  renderExpanded={(location, onClose) => (
                    <LocationDetailPanel location={location} onClose={onClose} />
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Create Dialogs */}
        <QuickCreateDialog
          open={showBomDialog}
          onOpenChange={setShowBomDialog}
          entityType="bom"
          onCreated={() => refetchBoms()}
        />
        <QuickCreateDialog
          open={showWorkOrderDialog}
          onOpenChange={setShowWorkOrderDialog}
          entityType="workOrder"
          onCreated={() => refetchWorkOrders()}
        />
      </div>
    </>
  );
}
