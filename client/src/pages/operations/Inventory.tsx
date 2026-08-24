import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Plus,
} from "lucide-react";
import { toast } from "sonner";

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

function InventorySummaryCards({ inventory }: { inventory: InventoryItem[] | undefined }) {
  const { total, inStock, lowStock, outOfStock } = useMemo(() => {
    if (!inventory) return { total: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
    let inStock = 0, lowStock = 0, outOfStock = 0;
    for (const item of inventory) {
      const qty = parseFloat(item.quantity || "0");
      const reorder = parseFloat(item.reorderLevel || "0");
      if (qty <= 0) outOfStock++;
      else if (qty <= reorder) lowStock++;
      else inStock++;
    }
    return { total: inventory.length, inStock, lowStock, outOfStock };
  }, [inventory]);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold font-display tabular-nums">{total}</div>
          <p className="text-xs text-muted-foreground">Total SKUs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold font-display tabular-nums">{inStock}</div>
          <p className="text-xs text-muted-foreground">In Stock</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-foreground font-display tabular-nums">{lowStock}</div>
          <p className="text-xs text-muted-foreground">Low Stock</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-2xl font-bold text-foreground font-display tabular-nums">{outOfStock}</div>
          <p className="text-xs text-muted-foreground">Out of Stock</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Inventory() {
  const [, navigate] = useLocation();
  const [selectedRows, setSelectedRows] = useState<Set<number | string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [currentBulkAction, setCurrentBulkAction] = useState<BulkActionType>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Form states for bulk actions
  const [quantityAdjustment, setQuantityAdjustment] = useState<string>("0");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [newReorderLevel, setNewReorderLevel] = useState<string>("");
  const [newReorderQuantity, setNewReorderQuantity] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: inventory, isLoading } = trpc.inventory.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  // Rows sharing a (product, warehouse) pair. Each extra row is counted again
  // by every total on this page, so they inflate the numbers directly.
  const { data: duplicateGroups } = trpc.inventory.duplicates.useQuery();

  const mergeDuplicates = trpc.inventory.mergeDuplicates.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      utils.inventory.duplicates.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  // Only the unambiguous groups are safe to fix in one go: identical quantities
  // are the artifact of the old update writing one total to every copy. Where
  // the copies differ they were incremented independently, and choosing between
  // "sum" and "keep one" is a stock-count judgement the operator has to make.
  const identicalGroups = (duplicateGroups || []).filter((g) => g.allIdentical);
  const divergentGroups = (duplicateGroups || []).filter((g) => !g.allIdentical);
  const duplicateRowCount = (duplicateGroups || []).reduce((sum, g) => sum + g.rows.length - 1, 0);

  const mergeGroups = async (groups: NonNullable<typeof duplicateGroups>, strategy: "keep_one" | "sum") => {
    setIsMerging(true);
    let merged = 0;
    try {
      for (const group of groups) {
        await mergeDuplicates.mutateAsync({
          keepId: group.keepId,
          removeIds: group.rows.filter((r) => r.id !== group.keepId).map((r) => r.id),
          strategy,
        });
        merged++;
      }
      toast.success(`Merged ${merged} duplicate group(s)`);
      setDupDialogOpen(false);
    } catch {
      // The mutation's onError already surfaced the reason; report the partial
      // run rather than letting it look like nothing happened.
      if (merged > 0) toast.warning(`Merged ${merged} group(s) before stopping`);
    } finally {
      setIsMerging(false);
      utils.inventory.list.invalidate();
      utils.inventory.duplicates.invalidate();
    }
  };

  const bulkUpdateMutation = trpc.inventory.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully updated ${data.totalUpdated} item(s).${data.totalFailed > 0 ? ` ${data.totalFailed} item(s) failed.` : ''}`);

      setSelectedRows(new Set());
      setBulkActionDialogOpen(false);
      resetFormStates();
      utils.inventory.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
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
        { value: "in_stock", label: "In Stock", color: "bg-muted text-muted-foreground" },
        { value: "low_stock", label: "Low Stock", color: "bg-muted text-foreground font-semibold" },
        { value: "out_of_stock", label: "Out of Stock", color: "bg-[oklch(0.30_0.02_262)] text-white" },
      ],
      render: (row) => {
        const status = getStockStatus(row.quantity, row.reorderLevel);
        const colors: Record<string, string> = {
          in_stock: "bg-muted text-muted-foreground",
          low_stock: "bg-muted text-foreground font-semibold",
          out_of_stock: "bg-[oklch(0.30_0.02_262)] text-white",
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
          toast.error("Please select a warehouse location.");
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
            <h1 className="text-lg font-semibold flex items-center gap-2">
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

      {/* Summary Cards — memoized to avoid recalculation on every render */}
      {duplicateRowCount > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm">
            {duplicateRowCount} duplicate inventory {duplicateRowCount === 1 ? "row" : "rows"} across{" "}
            {duplicateGroups?.length} product/warehouse{" "}
            {duplicateGroups?.length === 1 ? "pair" : "pairs"} — the counts below include each copy.
          </span>
          <Button variant="outline" size="sm" onClick={() => setDupDialogOpen(true)}>
            Review and merge
          </Button>
        </div>
      )}

      <Dialog open={dupDialogOpen} onOpenChange={(open) => { if (!open && !isMerging) setDupDialogOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Duplicate inventory rows</DialogTitle>
            <DialogDescription>
              These product/warehouse pairs have more than one inventory row. Every total on this
              page counts each row, so the stock figures are inflated until they are merged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {identicalGroups.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-medium">
                      Safe to merge ({identicalGroups.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Every copy holds the same quantity, so only one row is real. Merging keeps
                      that quantity and removes the extra rows.
                    </p>
                  </div>
                  <Button size="sm" disabled={isMerging} onClick={() => mergeGroups(identicalGroups, "keep_one")}>
                    {isMerging && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Merge all {identicalGroups.length}
                  </Button>
                </div>
                <ul className="space-y-1">
                  {identicalGroups.map((g) => (
                    <li key={`${g.productId}-${g.warehouseId}`} className="flex justify-between gap-4 text-sm border-b pb-1 last:border-0">
                      <span className="text-muted-foreground truncate">
                        {g.productName || `Product #${g.productId}`}
                        {g.warehouseName ? ` · ${g.warehouseName}` : ""}
                      </span>
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        {g.rows.length} rows × {g.keepQuantity} → {g.keepQuantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {divergentGroups.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Needs a decision ({divergentGroups.length})</h3>
                <p className="text-xs text-muted-foreground">
                  These copies hold different quantities, so they were counted up separately. Sum
                  them if each copy recorded real stock movements; keep the first row's figure if
                  the others are stale. Check the numbers against a physical count where you can.
                </p>
                {divergentGroups.map((g) => (
                  <div key={`${g.productId}-${g.warehouseId}`} className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium truncate">
                      {g.productName || `Product #${g.productId}`}
                      {g.warehouseName ? ` · ${g.warehouseName}` : ""}
                      {g.productSku && <span className="ml-2 text-xs font-mono text-muted-foreground">{g.productSku}</span>}
                    </div>
                    <ul className="text-sm space-y-0.5">
                      {g.rows.map((r) => (
                        <li key={r.id} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            Row #{r.id}
                            {r.id === g.keepId && <span className="ml-2 text-xs">(oldest — kept)</span>}
                          </span>
                          <span className="font-mono tabular-nums">{r.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMerging}
                        onClick={() => mergeGroups([g], "sum")}
                      >
                        Sum to {g.summedQuantity}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMerging}
                        onClick={() => mergeGroups([g], "keep_one")}
                      >
                        Keep {g.keepQuantity}
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDupDialogOpen(false)} disabled={isMerging}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InventorySummaryCards inventory={inventory as any} />

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
              onRowClick={(item) => navigate(`/operations/products/${item.productId}`)}
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
