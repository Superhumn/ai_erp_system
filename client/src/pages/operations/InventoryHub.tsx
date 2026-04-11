import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Package,
  AlertTriangle,
  Search,
  Truck,
  Factory,
  Shield,
  Clock,
  CheckCircle,
  Layers,
  Send,
  RefreshCw,
  Plus,
  Loader2,
  ShoppingBag,
  Plug,
  CloudUpload,
  FileSpreadsheet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuickCreateDialog } from "@/components/QuickCreateDialog";
import { Link } from "wouter";

export default function InventoryHub() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [showProductionDialog, setShowProductionDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showNewInventoryDialog, setShowNewInventoryDialog] = useState(false);
  const [showQcHoldDialog, setShowQcHoldDialog] = useState(false);
  const [qcHoldReason, setQcHoldReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Data fetching
  const { data: warehouses, isLoading: warehousesLoading } = trpc.warehouses.list.useQuery();
  const { data: inventory, isLoading: inventoryLoading } = trpc.inventory.list.useQuery();
  const { data: rawMaterials, isLoading: materialsLoading } = trpc.rawMaterials.list.useQuery();
  const { data: workOrders } = trpc.workOrders.list.useQuery();
  const { data: transfers } = trpc.transfers.list.useQuery();
  const { data: pendingFromPOs, isLoading: pendingLoading } = trpc.inventory.getPendingFromPOs.useQuery();
  const { data: inboundShipments, isLoading: inboundLoading } = trpc.inventory.getInboundShipments.useQuery();

  const utils = trpc.useUtils();

  // Integration status
  const { data: integrationStatus } = trpc.integrations.getStatus.useQuery();

  // Shopify sync mutations
  const syncShopifyInventory = trpc.shopify.sync.inventory.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.updated} inventory records from Shopify`);
      utils.inventory.invalidate();
      setIsSyncing(false);
    },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });

  const syncShopifyProducts = trpc.shopify.sync.products.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.imported} new products, updated ${data.updated}`);
      utils.inventory.invalidate();
      setIsSyncing(false);
    },
    onError: (err: any) => { toast.error(err.message); setIsSyncing(false); },
  });

  const handleSyncInventory = () => {
    setIsSyncing(true);
    syncShopifyInventory.mutate({});
  };

  const handleSyncProducts = () => {
    setIsSyncing(true);
    syncShopifyProducts.mutate({});
  };

  // Mutations
  const updateInventory = trpc.inventory.update.useMutation({
    onSuccess: () => {
      toast.success("Inventory updated!");
      utils.inventory.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createAlert = trpc.alerts.create.useMutation({
    onSuccess: () => {
      toast.success("Alert created!");
      utils.alerts.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleQcHold = (item: any) => {
    setSelectedItem(item);
    setQcHoldReason("");
    setShowQcHoldDialog(true);
  };

  const submitQcHold = () => {
    if (!selectedItem || !qcHoldReason.trim()) {
      toast.error("Please provide a reason for QC hold");
      return;
    }
    createAlert.mutate({
      type: "quality_issue",
      severity: "warning",
      title: `QC Hold: ${selectedItem.productName || "Unknown Item"}`,
      description: qcHoldReason,
      entityType: "inventory",
      entityId: selectedItem.id,
    });
    setShowQcHoldDialog(false);
    setQcHoldReason("");
    setSelectedItem(null);
  };

  // Build flat inventory rows - one row per product-location combination
  const inventoryRows = useMemo(() => {
    if (!inventory && !rawMaterials) return [];

    const rows: any[] = [];

    // Add finished goods inventory (already per-location)
    inventory?.forEach((inv: any) => {
      const qty = parseFloat(inv.quantity) || 0;
      const reserved = parseFloat(inv.reservedQuantity) || 0;
      const reorderPoint = parseFloat(inv.reorderPoint) || parseFloat(inv.reorderLevel) || 0;
      const reorderQty = parseFloat(inv.reorderQuantity) || 0;
      const available = qty - reserved;

      // Find in-transit for this product
      let inTransitQty = 0;
      transfers?.forEach((t: any) => {
        if (t.status === "in_transit") {
          t.items?.forEach((item: any) => {
            if (item.productId === inv.productId) {
              inTransitQty += parseFloat(item.shippedQuantity) || parseFloat(item.requestedQuantity) || 0;
            }
          });
        }
      });

      // Find on-order from POs
      let onOrderQty = 0;
      pendingFromPOs?.forEach((pending: any) => {
        if (pending.productId === inv.productId) {
          onOrderQty += parseFloat(pending.pendingQuantity) || 0;
        }
      });

      const warehouse = warehouses?.find((w: any) => w.id === inv.warehouseId);
      let status = "ok";
      if (qty <= 0) status = "out_of_stock";
      else if (reorderPoint > 0 && qty <= reorderPoint) status = "low";

      rows.push({
        id: inv.id,
        sku: inv.product?.sku || "",
        productName: inv.product?.name || `Product #${inv.productId}`,
        location: warehouse?.name || "—",
        locationId: inv.warehouseId,
        qtyOnHand: qty,
        reserved,
        available,
        inTransit: inTransitQty,
        onOrder: onOrderQty,
        reorderPoint,
        reorderQty,
        lastUpdated: inv.updatedAt || inv.createdAt,
        status,
        unit: inv.unit || "EA",
        productId: inv.productId,
        productType: "finished",
      });
    });

    // Add raw materials
    rawMaterials?.forEach((mat: any) => {
      const qty = parseFloat(mat.quantityOnHand) || 0;
      const reserved = parseFloat(mat.quantityOnOrder) || 0;
      const reorderPoint = parseFloat(mat.reorderPoint) || parseFloat(mat.reorderLevel) || 0;
      const reorderQty = parseFloat(mat.reorderQuantity) || 0;
      const available = qty - reserved;

      const warehouse = mat.warehouseId ? warehouses?.find((w: any) => w.id === mat.warehouseId) : null;
      let status = "ok";
      if (qty <= 0) status = "out_of_stock";
      else if (reorderPoint > 0 && qty <= reorderPoint) status = "low";

      rows.push({
        id: -mat.id,
        sku: mat.sku || "",
        productName: mat.name || `Material #${mat.id}`,
        location: warehouse?.name || "—",
        locationId: mat.warehouseId,
        qtyOnHand: qty,
        reserved,
        available,
        inTransit: 0,
        onOrder: 0,
        reorderPoint,
        reorderQty,
        lastUpdated: mat.updatedAt || mat.createdAt,
        status,
        unit: mat.unit || "LB",
        productId: mat.id,
        productType: "material",
      });
    });

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return rows.filter(r =>
        r.productName.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        r.location.toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (statusFilter === "low") {
      return rows.filter(r => r.status === "low");
    } else if (statusFilter === "out_of_stock") {
      return rows.filter(r => r.status === "out_of_stock");
    }

    return rows;
  }, [inventory, rawMaterials, warehouses, transfers, pendingFromPOs, searchTerm, statusFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const allRows = inventoryRows;
    return {
      totalItems: allRows.length,
      lowStock: allRows.filter(r => r.status === "low").length,
      outOfStock: allRows.filter(r => r.status === "out_of_stock").length,
      inTransitCount: allRows.filter(r => r.inTransit > 0).length,
    };
  }, [inventoryRows]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "low":
        return <Badge className="bg-amber-500/8 text-amber-600 dark:text-amber-400">Low Stock</Badge>;
      case "out_of_stock":
        return <Badge className="bg-red-500/8 text-red-600 dark:text-red-400">Out of Stock</Badge>;
      default:
        return <Badge className="bg-emerald-500/8 text-emerald-600 dark:text-emerald-400">OK</Badge>;
    }
  };

  const isLoading = warehousesLoading || inventoryLoading || materialsLoading || pendingLoading || inboundLoading;

  return (
    <div className="p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Inventory</h1>
          <p className="text-muted-foreground">Multi-location inventory tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[280px]"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>

          {/* Shopify Inventory Sync */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isSyncing}>
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingBag className="h-4 w-4 mr-2" />
                )}
                Sync
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-green-600" />
                Shopify Sync
                {integrationStatus?.shopify?.configured ? (
                  <Badge variant="outline" className="ml-auto text-xs bg-green-50 text-green-700">Connected</Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto text-xs">Not Set Up</Badge>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {integrationStatus?.shopify?.configured ? (
                <>
                  <DropdownMenuItem onClick={handleSyncInventory}>
                    <Package className="h-4 w-4 mr-2" />
                    Sync Inventory Levels
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSyncProducts}>
                    <Layers className="h-4 w-4 mr-2" />
                    Sync Products
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">
                    <Plug className="h-4 w-4 mr-2" />
                    Configure Shopify
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More Integrations */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Plug className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Integrations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/import">
                  <CloudUpload className="h-4 w-4 mr-2" />
                  Import from Google Sheets
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/integrations">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export to Sheets
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/integrations">
                  <Plug className="h-4 w-4 mr-2" />
                  All Integrations
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" onClick={() => utils.inventory.invalidate()}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button onClick={() => setShowNewInventoryDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalItems}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-xl font-semibold tracking-[-0.02em] text-amber-600">{stats.lowStock}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Out of Stock</p>
                <p className="text-xl font-semibold tracking-[-0.02em] text-red-600">{stats.outOfStock}</p>
              </div>
              <Package className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Transit</p>
                <p className="text-xl font-semibold tracking-[-0.02em] text-blue-600">{stats.inTransitCount}</p>
              </div>
              <Truck className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Loading inventory...</p>
            </div>
          ) : inventoryRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4" />
              <p>No inventory items found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">SKU</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Qty on Hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">In Transit</TableHead>
                    <TableHead className="text-right">Reorder Pt</TableHead>
                    <TableHead className="text-right">Reorder Qty</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{row.sku || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{row.productName}</span>
                          {row.productType === "material" && (
                            <Badge variant="outline" className="text-xs">Material</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{row.location}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.qtyOnHand.toLocaleString()} <span className="text-muted-foreground text-xs">{row.unit}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.reserved > 0 ? row.reserved.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {row.available.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.inTransit > 0 ? (
                          <span className="text-blue-600">+{row.inTransit.toLocaleString()}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.reorderPoint > 0 ? row.reorderPoint.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.reorderQty > 0 ? row.reorderQty.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => { setSelectedItem(row); setShowShipmentDialog(true); }}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Ship
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => { setSelectedItem(row); setShowProductionDialog(true); }}
                          >
                            <Factory className="h-3 w-3 mr-1" />
                            Allocate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleQcHold(row)}
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Hold
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shipment Dialog */}
      <Dialog open={showShipmentDialog} onOpenChange={setShowShipmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Create a shipment for {selectedItem?.productName}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">From Location</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source location" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w: any) => (
                      <SelectItem key={w.id} value={w.id.toString()}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">To Location</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w: any) => (
                      <SelectItem key={w.id} value={w.id.toString()}>
                        {w.name} ({w.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Quantity</label>
                <Input type="number" placeholder="Enter quantity" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShipmentDialog(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Shipment created!"); setShowShipmentDialog(false); }}>
              Create Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Allocation Dialog */}
      <Dialog open={showProductionDialog} onOpenChange={setShowProductionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate to Production</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Allocate {selectedItem?.productName} to a work order
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Work Order</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select work order" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders?.filter((wo: any) => wo.status === "pending" || wo.status === "in_progress").map((wo: any) => (
                      <SelectItem key={wo.id} value={wo.id.toString()}>
                        WO-{wo.id}: {wo.product?.name} x {wo.quantity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Quantity to Allocate</label>
                <Input type="number" placeholder="Enter quantity" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductionDialog(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Allocated to production!"); setShowProductionDialog(false); }}>
              Allocate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Dialog */}
      <QuickCreateDialog
        entityType="inventory"
        open={showNewInventoryDialog}
        onOpenChange={setShowNewInventoryDialog}
        onCreated={() => {
          utils.inventory.invalidate();
          setShowNewInventoryDialog(false);
        }}
      />

      {/* QC Hold Dialog */}
      <Dialog open={showQcHoldDialog} onOpenChange={setShowQcHoldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-500" />
              Place on QC Hold
            </DialogTitle>
            <DialogDescription>
              Place {selectedItem?.productName || "item"} on quality control hold
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason for Hold *</Label>
              <Textarea
                value={qcHoldReason}
                onChange={(e) => setQcHoldReason(e.target.value)}
                placeholder="Describe the reason for placing this item on QC hold..."
                rows={4}
              />
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                Placing an item on QC hold will create an alert and prevent it from being used in production until the hold is resolved.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQcHoldDialog(false)}>Cancel</Button>
            <Button
              onClick={submitQcHold}
              disabled={createAlert.isPending}
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              {createAlert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Shield className="h-4 w-4 mr-1" />
              Place on Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
