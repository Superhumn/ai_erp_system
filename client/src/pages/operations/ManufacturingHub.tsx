import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import SpreadsheetTable, { Column } from "@/components/SpreadsheetTable";
import { QuickCreateButton, QuickCreateDialog } from "@/components/QuickCreateDialog";
import {
  Search, Plus, Clock, Play, Pause, CheckCircle, X, AlertTriangle, ClipboardList
} from "lucide-react";

// Status options
const workOrderStatuses = [
  { value: "pending", label: "Pending", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "scheduled", label: "Scheduled", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "completed", label: "Completed", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
];

// Detail Panel Component
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

export default function ManufacturingHub() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedWorkOrderId, setExpandedWorkOrderId] = useState<number | string | null>(null);
  const [showWorkOrderDialog, setShowWorkOrderDialog] = useState(false);

  // Queries
  const { data: workOrders, isLoading: workOrdersLoading, refetch: refetchWorkOrders } = trpc.workOrders.list.useQuery();
  const { data: locations } = trpc.warehouses.list.useQuery();

  // Mutations
  const updateWorkOrderStatus = trpc.workOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Work order updated");
      refetchWorkOrders();
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
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Selection state for bulk actions
  const [selectedWorkOrders, setSelectedWorkOrders] = useState<Set<number | string>>(new Set());

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

  // Bulk action definitions
  const workOrderBulkActions = [
    { key: "start_all", label: "Start All", icon: <Play className="h-4 w-4" />, variant: "default" as const },
    { key: "complete_all", label: "Complete All", icon: <CheckCircle className="h-4 w-4" />, variant: "default" as const },
    { key: "cancel_all", label: "Cancel All", icon: <X className="h-4 w-4" />, variant: "destructive" as const },
  ];

  // Column definitions - dense work order table
  const workOrderColumns: Column<any>[] = [
    { key: "id", header: "WO#", type: "text", sortable: true, render: (_row, val) => `WO-${val}` },
    { key: "productName", header: "Product Name", type: "text", sortable: true,
      render: (row) => row.product?.name || row.bom?.product?.name || row.bom?.name || "—" },
    { key: "bomName", header: "BOM", type: "text",
      render: (row) => row.bom?.name || "—" },
    { key: "quantity", header: "Qty Ordered", type: "number", sortable: true },
    { key: "completedQuantity", header: "Qty Completed", type: "number",
      render: (_row, val) => val || 0 },
    { key: "status", header: "Status", type: "badge", sortable: true,
      render: (_row, val) => {
        const s = workOrderStatuses.find(s => s.value === val);
        return s?.label || val;
      }
    },
    { key: "startDate", header: "Scheduled Start", type: "date", sortable: true },
    { key: "dueDate", header: "Scheduled End", type: "date", sortable: true },
    { key: "locationName", header: "Location", type: "text",
      render: (row) => {
        if (row.warehouseId) {
          const loc = locations?.find((l: any) => l.id === row.warehouseId);
          return loc?.name || "—";
        }
        return row.location || "—";
      }
    },
    { key: "priority", header: "Priority", type: "badge",
      render: (_row, val) => val || "normal" },
    { key: "assignedTo", header: "Assigned To", type: "text",
      render: (row) => row.assignedTo || row.assignedUser?.name || "—" },
  ];

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      totalWOs: workOrders?.length || 0,
      inProgress: workOrders?.filter((w: any) => w.status === "in_progress").length || 0,
      completedThisMonth: workOrders?.filter((w: any) =>
        w.status === "completed" && w.updatedAt && new Date(w.updatedAt) >= startOfMonth
      ).length || 0,
      pending: workOrders?.filter((w: any) => w.status === "pending" || w.status === "scheduled").length || 0,
    };
  }, [workOrders]);

  return (
    <>
    <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Manufacturing</h1>
            <p className="text-muted-foreground">
              Work orders and production tracking
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search work orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button onClick={() => setShowWorkOrderDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Work Order
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Work Orders</p>
                  <p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalWOs}</p>
                </div>
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-xl font-semibold tracking-[-0.02em] text-blue-600">{stats.inProgress}</p>
                </div>
                <Play className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending / Scheduled</p>
                  <p className="text-xl font-semibold tracking-[-0.02em] text-amber-600">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed This Month</p>
                  <p className="text-xl font-semibold tracking-[-0.02em] text-emerald-600">{stats.completedThisMonth}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders Table */}
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

        {/* Quick Create Dialogs */}
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
