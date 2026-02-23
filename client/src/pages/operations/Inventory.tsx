import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpreadsheetTable, Column, BulkAction } from "@/components/SpreadsheetTable";
import {
  Warehouse,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  MapPin,
  Target,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

type InventoryItem = {
  id: number;
  productId: number;
  warehouseId: number | null;
  quantity: string | null;
  reservedQuantity: string | null;
  reorderLevel: string | null;
  reorderQuantity: string | null;
};

type BulkActionType = 'adjust_quantity' | 'change_location' | 'update_reorder_point' | null;

export default function Inventory() {
  const [selectedRows, setSelectedRows] = useState<Set<number | string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [currentBulkAction, setCurrentBulkAction] = useState<BulkActionType>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Form states for bulk actions
  const [quantityAdjustment, setQuantityAdjustment] = useState<string>("0");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [newReorderLevel, setNewReorderLevel] = useState<string>("");
  const [newReorderQuantity, setNewReorderQuantity] = useState<string>("");

  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: inventory, isLoading } = trpc.inventory.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();

  const bulkUpdateMutation = trpc.inventory.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(`Bulk Update Complete: Successfully updated ${data.totalUpdated} item(s).${data.totalFailed > 0 ? ` ${data.totalFailed} item(s) failed.` : ''}`);
      setSelectedRows(new Set());
      setBulkActionDialogOpen(false);
      resetFormStates();
      utils.inventory.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Bulk Update Failed: ${error.message}`);
    },
  });

  const resetFormStates = () => {
    setQuantityAdjustment("0");
    setSelectedWarehouseId("");
    setNewReorderLevel("");
    setNewReorderQuantity("");
    setCurrentBulkAction(null);
  };

  const getStockStatus = (quantity: string | null, reorderPoint: string | null) => {
    const qty = parseFloat(quantity || "0");
    const reorder = parseFloat(reorderPoint || "0");

    if (qty <= 0) return { label: "Out of Stock", value: "out_of_stock" };
    if (qty <= reorder) return { label: "Low Stock", value: "low_stock" };
    return { label: "In Stock", value: "in_stock" };
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: "productId",
      header: "Product ID",
      type: "text",
      sortable: true,
      format: (value) => `#${value}`,
    },
    {
      key: "warehouseId",
      header: "Location",
      type: "text",
      sortable: true,
      render: (row) => {
        const warehouse = warehouses?.find(w => w.id === row.warehouseId);
        return warehouse ? warehouse.name : `Warehouse #${row.warehouseId || "-"}`;
      },
    },
    {
      key: "quantity",
      header: "On Hand",
      type: "number",
      sortable: true,
      render: (row) => <span className="font-mono">{row.quantity || "0"}</span>,
    },
    {
      key: "reservedQuantity",
      header: "Reserved",
      type: "number",
      sortable: true,
      render: (row) => <span className="font-mono">{row.reservedQuantity || "0"}</span>,
    },
    {
      key: "available",
      header: "Available",
      type: "number",
      sortable: false,
      render: (row) => {
        const available = parseFloat(row.quantity || "0") - parseFloat(row.reservedQuantity || "0");
        return <span className="font-mono">{available.toFixed(0)}</span>;
      },
    },
    {
      key: "reorderLevel",
      header: "Reorder Point",
      type: "number",
      sortable: true,
      render: (row) => <span className="font-mono">{row.reorderLevel || "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      type: "status",
      sortable: false,
      options: [
        { value: "in_stock", label: "In Stock", color: "bg-green-500/10 text-green-600" },
        { value: "low_stock", label: "Low Stock", color: "bg-amber-500/10 text-amber-600" },
        { value: "out_of_stock", label: "Out of Stock", color: "bg-red-500/10 text-red-600" },
      ],
      render: (row) => {
        const status = getStockStatus(row.quantity, row.reorderLevel);
        const colors: Record<string, string> = {
          in_stock: "bg-green-500/10 text-green-600",
          low_stock: "bg-amber-500/10 text-amber-600",
          out_of_stock: "bg-red-500/10 text-red-600",
        };
        return (
          <Badge className={colors[status.value]}>
            {status.value === "low_stock" && <AlertTriangle className="h-3 w-3 mr-1" />}
            {status.label}
          </Badge>
        );
      },
    },
  ];

  const bulkActions: BulkAction[] = [
    {
      key: "adjust_quantity",
      label: "Adjust Quantities",
      icon: <ArrowUpDown className="h-4 w-4 mr-1" />,
    },
    {
      key: "change_location",
      label: "Change Location",
      icon: <MapPin className="h-4 w-4 mr-1" />,
    },
    {
      key: "update_reorder_point",
      label: "Update Reorder Points",
      icon: <Target className="h-4 w-4 mr-1" />,
    },
  ];

  const handleBulkAction = (action: string) => {
    setCurrentBulkAction(action as BulkActionType);
    setBulkActionDialogOpen(true);
  };

  const executeBulkAction = () => {
    if (!currentBulkAction || selectedRows.size === 0) return;

    const ids = Array.from(selectedRows).map(id => Number(id));

    switch (currentBulkAction) {
      case 'adjust_quantity':
        bulkUpdateMutation.mutate({
          ids,
          action: 'adjust_quantity',
          quantityAdjustment: parseFloat(quantityAdjustment) || 0,
        });
        break;
      case 'change_location':
        if (!selectedWarehouseId) {
          toast.error("Select a location: Please select a warehouse location.");
          return;
        }
        bulkUpdateMutation.mutate({
          ids,
          action: 'change_location',
          warehouseId: parseInt(selectedWarehouseId),
        });
        break;
      case 'update_reorder_point':
        bulkUpdateMutation.mutate({
          ids,
          action: 'update_reorder_point',
          reorderLevel: newReorderLevel || undefined,
          reorderQuantity: newReorderQuantity || undefined,
        });
        break;
    }
  };

  const getDialogContent = () => {
    switch (currentBulkAction) {
      case 'adjust_quantity':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Adjust Quantities</DialogTitle>
              <DialogDescription>
                Adjust the quantity for {selectedRows.size} selected item(s).
                Enter a positive number to add or a negative number to subtract.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="quantity-adjustment">Quantity Adjustment</Label>
                <Input
                  id="quantity-adjustment"
                  type="number"
                  value={quantityAdjustment}
                  onChange={(e) => setQuantityAdjustment(e.target.value)}
                  placeholder="e.g., 10 or -5"
                />
                <p className="text-sm text-muted-foreground">
                  {parseFloat(quantityAdjustment) > 0
                    ? `Will add ${quantityAdjustment} units to each selected item`
                    : parseFloat(quantityAdjustment) < 0
                    ? `Will subtract ${Math.abs(parseFloat(quantityAdjustment))} units from each selected item`
                    : 'Enter a value to adjust quantities'}
                </p>
              </div>
            </div>
          </>
        );
      case 'change_location':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Change Location</DialogTitle>
              <DialogDescription>
                Move {selectedRows.size} selected item(s) to a new warehouse location.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="warehouse-select">New Warehouse Location</Label>
                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                  <SelectTrigger id="warehouse-select">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        );
      case 'update_reorder_point':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Update Reorder Points</DialogTitle>
              <DialogDescription>
                Update reorder settings for {selectedRows.size} selected item(s).
                Leave fields empty to keep current values.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reorder-level">Reorder Level</Label>
                <Input
                  id="reorder-level"
                  type="number"
                  value={newReorderLevel}
                  onChange={(e) => setNewReorderLevel(e.target.value)}
                  placeholder="Minimum stock before reorder"
                />
                <p className="text-sm text-muted-foreground">
                  Triggers a low stock alert when quantity falls below this level.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorder-quantity">Reorder Quantity</Label>
                <Input
                  id="reorder-quantity"
                  type="number"
                  value={newReorderQuantity}
                  onChange={(e) => setNewReorderQuantity(e.target.value)}
                  placeholder="Quantity to order when restocking"
                />
                <p className="text-sm text-muted-foreground">
                  Suggested quantity to order when restocking.
                </p>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const inventoryData = (inventory || []) as InventoryItem[];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Warehouse className="h-8 w-8" />
              Inventory
            </h1>
            <p className="text-muted-foreground mt-1">
              Track stock levels and manage inventory across locations.
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Inventory
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{inventory?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total SKUs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {inventory?.filter(i => parseFloat(i.quantity || "0") > parseFloat(i.reorderLevel || "0")).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">In Stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">
              {inventory?.filter(i => {
                const qty = parseFloat(i.quantity || "0");
                const reorder = parseFloat(i.reorderLevel || "0");
                return qty > 0 && qty <= reorder;
              }).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Low Stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {inventory?.filter(i => parseFloat(i.quantity || "0") <= 0).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Out of Stock</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="text-lg font-semibold">Inventory Items</div>
          <p className="text-sm text-muted-foreground">
            Select multiple items to perform bulk actions.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !inventoryData || inventoryData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Warehouse className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No inventory records found</p>
              <p className="text-sm">Inventory will be tracked as products are added.</p>
            </div>
          ) : (
            <SpreadsheetTable
              data={inventoryData}
              columns={columns}
              selectedRows={selectedRows}
              onSelectionChange={setSelectedRows}
              bulkActions={bulkActions}
              onBulkAction={handleBulkAction}
              showSearch={true}
              showExport={true}
              compact={false}
              emptyMessage="No inventory records found"
            />
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Dialog */}
      <Dialog open={bulkActionDialogOpen} onOpenChange={(open) => {
        setBulkActionDialogOpen(open);
        if (!open) resetFormStates();
      }}>
        <DialogContent>
          {getDialogContent()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkActionDialogOpen(false);
                resetFormStates();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={executeBulkAction}
              disabled={bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Apply to {selectedRows.size} item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
