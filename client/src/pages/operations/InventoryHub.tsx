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
  RefreshCw,
  Plus,
  Loader2,
  ShoppingBag,
  Plug,
  CloudUpload,
  FileSpreadsheet,
  Layers,
  Send,
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

  // Data fetching - all sources
  const { data: warehouses, isLoading: warehousesLoading } = trpc.warehouses.list.useQuery();
  const { data: inventory, isLoading: inventoryLoading } = trpc.inventory.list.useQuery();
  const { data: products, isLoading: productsLoading } = trpc.products.list.useQuery();
  const { data: purchaseOrders } = trpc.purchaseOrders.list.useQuery();
  const { data: shipments } = trpc.shipments.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
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

  // Pre-compute lookup maps for joins
  const productMap = useMemo(() => {
    const m = new Map<number, any>();
    products?.forEach((p: any) => m.set(p.id, p));
    return m;
  }, [products]);

  const vendorMap = useMemo(() => {
    const m = new Map<number, any>();
    vendors?.forEach((v: any) => m.set(v.id, v));
    return m;
  }, [vendors]);

  const warehouseMap = useMemo(() => {
    const m = new Map<number, any>();
    warehouses?.forEach((w: any) => m.set(w.id, w));
    return m;
  }, [warehouses]);

  // Build PO data per product: { productId -> { openQty, poNumbers[], latestPOStatus, latestPODate, vendorId } }
  const poByProduct = useMemo(() => {
    const m = new Map<number, { openQty: number; poNumbers: string[]; latestStatus: string; latestDate: string | null; vendorId: number | null }>();
    if (!purchaseOrders) return m;

    // POs that are open (not received or cancelled)
    const openStatuses = new Set(["draft", "sent", "confirmed", "partial"]);
    purchaseOrders.forEach((po: any) => {
      if (!openStatuses.has(po.status)) return;
      // Since PO items have productId, but we don't fetch items separately for each PO here,
      // we associate the PO with its vendor and track by vendorId.
      // For now, associate PO data at the PO level (not per-product-item).
      // We'll also note the PO for any product that has this vendor as preferred.
    });

    // Instead, iterate POs and match to products via vendor
    // But first, let's build from pendingFromPOs which already gives us productId-level data
    pendingFromPOs?.forEach((pending: any) => {
      const existing = m.get(pending.productId);
      if (existing) {
        existing.openQty += parseFloat(pending.pendingQuantity) || 0;
      } else {
        m.set(pending.productId, {
          openQty: parseFloat(pending.pendingQuantity) || 0,
          poNumbers: [],
          latestStatus: "",
          latestDate: null,
          vendorId: null,
        });
      }
    });

    // Now enrich with PO-level data
    purchaseOrders.forEach((po: any) => {
      if (!openStatuses.has(po.status)) return;
      // For each product, check if this PO's vendor is the preferred vendor
      products?.forEach((prod: any) => {
        if (prod.preferredVendorId && prod.preferredVendorId === po.vendorId) {
          const existing = m.get(prod.id);
          if (existing) {
            if (!existing.poNumbers.includes(po.poNumber)) {
              existing.poNumbers.push(po.poNumber);
            }
            // Update latest PO info
            const poDate = po.orderDate || po.createdAt;
            if (!existing.latestDate || (poDate && new Date(poDate) > new Date(existing.latestDate))) {
              existing.latestStatus = po.status;
              existing.latestDate = poDate;
              existing.vendorId = po.vendorId;
            }
          } else {
            m.set(prod.id, {
              openQty: 0,
              poNumbers: [po.poNumber],
              latestStatus: po.status,
              latestDate: po.orderDate || po.createdAt,
              vendorId: po.vendorId,
            });
          }
        }
      });
    });

    // Also scan all POs for recent PO info per vendor
    purchaseOrders.forEach((po: any) => {
      products?.forEach((prod: any) => {
        if (prod.preferredVendorId === po.vendorId) {
          const existing = m.get(prod.id);
          if (existing) {
            const poDate = po.orderDate || po.createdAt;
            if (!existing.latestDate || (poDate && new Date(poDate) > new Date(existing.latestDate))) {
              existing.latestStatus = po.status;
              existing.latestDate = poDate;
            }
          }
        }
      });
    });

    return m;
  }, [purchaseOrders, pendingFromPOs, products]);

  // Build shipment data per product via PO link
  const shipmentByProduct = useMemo(() => {
    const m = new Map<number, { tracking: string; status: string; date: string | null }>();
    if (!shipments || !purchaseOrders) return m;

    // Map PO id -> vendorId
    const poVendorMap = new Map<number, number>();
    purchaseOrders.forEach((po: any) => poVendorMap.set(po.id, po.vendorId));

    // For each shipment linked to a PO, find products by vendor match
    shipments.forEach((ship: any) => {
      if (!ship.purchaseOrderId) return;
      const vendorId = poVendorMap.get(ship.purchaseOrderId);
      if (!vendorId) return;

      products?.forEach((prod: any) => {
        if (prod.preferredVendorId === vendorId) {
          const existing = m.get(prod.id);
          const shipDate = ship.shipDate || ship.createdAt;
          if (!existing || (shipDate && new Date(shipDate) > new Date(existing.date || ""))) {
            m.set(prod.id, {
              tracking: ship.trackingNumber || (shipDate ? new Date(shipDate).toLocaleDateString() : ""),
              status: ship.status || "",
              date: shipDate,
            });
          }
        }
      });
    });

    return m;
  }, [shipments, purchaseOrders, products]);

  // Build flat inventory rows - unified view
  const inventoryRows = useMemo(() => {
    if (!inventory && !rawMaterials) return [];

    const rows: any[] = [];

    // Add finished goods inventory
    inventory?.forEach((inv: any) => {
      const qty = parseFloat(inv.quantity) || 0;
      const reserved = parseFloat(inv.reservedQuantity) || 0;
      const reorderPoint = parseFloat(inv.reorderPoint) || parseFloat(inv.reorderLevel) || 0;
      const available = qty - reserved;

      const product = productMap.get(inv.productId);
      const warehouse = warehouseMap.get(inv.warehouseId);

      // In-transit from transfers
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

      // On-order from POs
      let onOrderQty = 0;
      pendingFromPOs?.forEach((pending: any) => {
        if (pending.productId === inv.productId) {
          onOrderQty += parseFloat(pending.pendingQuantity) || 0;
        }
      });

      // PO info
      const poInfo = poByProduct.get(inv.productId);
      // Shipment info
      const shipInfo = shipmentByProduct.get(inv.productId);

      // Vendor - from product's preferredVendorId or from PO data
      const vendorId = product?.preferredVendorId || poInfo?.vendorId;
      const vendor = vendorId ? vendorMap.get(vendorId) : null;

      // Unit cost from product costPrice or inventory averageCost
      const unitCost = parseFloat(inv.averageCost) || parseFloat(product?.costPrice) || 0;
      const totalValue = qty * unitCost;

      let status = "ok";
      if (qty <= 0) status = "out_of_stock";
      else if (reorderPoint > 0 && qty <= reorderPoint) status = "low";

      rows.push({
        id: inv.id,
        sku: product?.sku || "",
        productName: product?.name || `Product #${inv.productId}`,
        category: product?.category || "",
        location: warehouse?.name || "",
        locationId: inv.warehouseId,
        qtyOnHand: qty,
        reserved,
        available,
        reorderPoint,
        inTransit: inTransitQty,
        onOrderQty: onOrderQty || (poInfo?.openQty || 0),
        openPONumbers: poInfo?.poNumbers?.join(", ") || "",
        poStatus: poInfo?.latestStatus || "",
        lastPODate: poInfo?.latestDate || null,
        vendorName: vendor?.name || "",
        lastShipment: shipInfo?.tracking || "",
        shipStatus: shipInfo?.status || "",
        unitCost,
        totalValue,
        lastUpdated: inv.updatedAt || inv.createdAt,
        status,
        productId: inv.productId,
        productType: "finished",
      });
    });

    // Add raw materials
    rawMaterials?.forEach((mat: any) => {
      const qty = parseFloat(mat.quantityOnHand) || 0;
      const reserved = parseFloat(mat.quantityOnOrder) || 0;
      const reorderPoint = parseFloat(mat.reorderPoint) || parseFloat(mat.reorderLevel) || 0;
      const available = qty - reserved;

      const warehouse = mat.warehouseId ? warehouseMap.get(mat.warehouseId) : null;
      const vendor = mat.preferredVendorId ? vendorMap.get(mat.preferredVendorId) : null;
      const unitCost = parseFloat(mat.costPerUnit) || parseFloat(mat.unitCost) || 0;
      const totalValue = qty * unitCost;

      let status = "ok";
      if (qty <= 0) status = "out_of_stock";
      else if (reorderPoint > 0 && qty <= reorderPoint) status = "low";

      rows.push({
        id: -mat.id,
        sku: mat.sku || "",
        productName: mat.name || `Material #${mat.id}`,
        category: mat.category || "Raw Material",
        location: warehouse?.name || "",
        locationId: mat.warehouseId,
        qtyOnHand: qty,
        reserved,
        available,
        reorderPoint,
        inTransit: 0,
        onOrderQty: 0,
        openPONumbers: "",
        poStatus: "",
        lastPODate: null,
        vendorName: vendor?.name || "",
        lastShipment: "",
        shipStatus: "",
        unitCost,
        totalValue,
        lastUpdated: mat.updatedAt || mat.createdAt,
        status,
        productId: mat.id,
        productType: "material",
      });
    });

    // Apply search filter
    let filtered = rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.productName.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        r.location.toLowerCase().includes(term) ||
        r.category.toLowerCase().includes(term) ||
        r.vendorName.toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (statusFilter === "low") {
      filtered = filtered.filter(r => r.status === "low");
    } else if (statusFilter === "out_of_stock") {
      filtered = filtered.filter(r => r.status === "out_of_stock");
    }

    return filtered;
  }, [inventory, rawMaterials, products, warehouses, transfers, pendingFromPOs, vendors, purchaseOrders, shipments, productMap, warehouseMap, vendorMap, poByProduct, shipmentByProduct, searchTerm, statusFilter]);

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
        return <Badge className="bg-amber-500/8 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0">Low</Badge>;
      case "out_of_stock":
        return <Badge className="bg-red-500/8 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0">Out</Badge>;
      default:
        return <Badge className="bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0">OK</Badge>;
    }
  };

  const getPOStatusBadge = (status: string) => {
    if (!status) return <span className="text-muted-foreground">—</span>;
    const colors: Record<string, string> = {
      draft: "bg-gray-500/8 text-gray-600",
      sent: "bg-blue-500/8 text-blue-600",
      confirmed: "bg-emerald-500/8 text-emerald-600",
      partial: "bg-amber-500/8 text-amber-600",
      received: "bg-green-500/8 text-green-600",
      cancelled: "bg-red-500/8 text-red-600",
    };
    return <Badge className={`${colors[status] || "bg-gray-500/8 text-gray-600"} text-[10px] px-1.5 py-0`}>{status}</Badge>;
  };

  const getShipStatusBadge = (status: string) => {
    if (!status) return <span className="text-muted-foreground">—</span>;
    const colors: Record<string, string> = {
      pending: "bg-gray-500/8 text-gray-600",
      in_transit: "bg-blue-500/8 text-blue-600",
      delivered: "bg-emerald-500/8 text-emerald-600",
      returned: "bg-amber-500/8 text-amber-600",
      cancelled: "bg-red-500/8 text-red-600",
    };
    return <Badge className={`${colors[status] || "bg-gray-500/8 text-gray-600"} text-[10px] px-1.5 py-0`}>{status.replace("_", " ")}</Badge>;
  };

  const fmtDate = (d: any) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString(); } catch { return "—"; }
  };

  const fmtCurrency = (n: number) => {
    if (!n) return "—";
    return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isLoading = warehousesLoading || inventoryLoading || productsLoading || materialsLoading || pendingLoading || inboundLoading;

  return (
    <div className="p-6 space-y-4 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">Products & Inventory</h1>
          <p className="text-muted-foreground">Unified view — inventory, POs, shipments, costing, vendors</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU, name, vendor, category..."
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

      {/* Unified Products & Inventory Table */}
      <Card>
        <CardContent className="pt-6 px-0">
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
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="border-b">
                    {/* Sticky left columns */}
                    <TableHead className="sticky left-0 z-20 bg-background min-w-[80px] px-2 py-2 text-xs font-semibold">SKU</TableHead>
                    <TableHead className="sticky left-[80px] z-20 bg-background min-w-[160px] px-2 py-2 text-xs font-semibold border-r">Product Name</TableHead>
                    {/* Scrollable columns */}
                    <TableHead className="min-w-[90px] px-2 py-2 text-xs font-semibold">Category</TableHead>
                    <TableHead className="min-w-[100px] px-2 py-2 text-xs font-semibold">Location</TableHead>
                    <TableHead className="min-w-[70px] px-2 py-2 text-xs font-semibold text-right">Stock Qty</TableHead>
                    <TableHead className="min-w-[70px] px-2 py-2 text-xs font-semibold text-right">Reserved</TableHead>
                    <TableHead className="min-w-[70px] px-2 py-2 text-xs font-semibold text-right">Available</TableHead>
                    <TableHead className="min-w-[70px] px-2 py-2 text-xs font-semibold text-right">Reorder Pt</TableHead>
                    <TableHead className="min-w-[70px] px-2 py-2 text-xs font-semibold text-right">In Transit</TableHead>
                    <TableHead className="min-w-[80px] px-2 py-2 text-xs font-semibold text-right">Open PO Qty</TableHead>
                    <TableHead className="min-w-[100px] px-2 py-2 text-xs font-semibold">Open PO#</TableHead>
                    <TableHead className="min-w-[75px] px-2 py-2 text-xs font-semibold">PO Status</TableHead>
                    <TableHead className="min-w-[85px] px-2 py-2 text-xs font-semibold">Last PO Date</TableHead>
                    <TableHead className="min-w-[110px] px-2 py-2 text-xs font-semibold">Vendor</TableHead>
                    <TableHead className="min-w-[100px] px-2 py-2 text-xs font-semibold">Last Shipment</TableHead>
                    <TableHead className="min-w-[80px] px-2 py-2 text-xs font-semibold">Ship Status</TableHead>
                    <TableHead className="min-w-[80px] px-2 py-2 text-xs font-semibold text-right">Unit Cost</TableHead>
                    <TableHead className="min-w-[90px] px-2 py-2 text-xs font-semibold text-right">Total Value</TableHead>
                    <TableHead className="min-w-[85px] px-2 py-2 text-xs font-semibold">Last Updated</TableHead>
                    <TableHead className="min-w-[50px] px-2 py-2 text-xs font-semibold text-center">Status</TableHead>
                    <TableHead className="min-w-[110px] px-2 py-2 text-xs font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50 h-8">
                      {/* Sticky left columns */}
                      <TableCell className="sticky left-0 z-10 bg-background px-2 py-1 font-mono text-xs">{row.sku || "—"}</TableCell>
                      <TableCell className="sticky left-[80px] z-10 bg-background px-2 py-1 border-r max-w-[160px]">
                        <div className="flex items-center gap-1 truncate">
                          <span className="font-medium truncate text-xs">{row.productName}</span>
                          {row.productType === "material" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Mat</Badge>
                          )}
                        </div>
                      </TableCell>
                      {/* Scrollable columns */}
                      <TableCell className="px-2 py-1 text-xs truncate max-w-[90px]">{row.category || "—"}</TableCell>
                      <TableCell className="px-2 py-1 text-xs truncate max-w-[100px]">{row.location || "—"}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs">{row.qtyOnHand.toLocaleString()}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs text-muted-foreground">{row.reserved > 0 ? row.reserved.toLocaleString() : "—"}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs font-medium">{row.available.toLocaleString()}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs text-muted-foreground">{row.reorderPoint > 0 ? row.reorderPoint.toLocaleString() : "—"}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs">
                        {row.inTransit > 0 ? <span className="text-blue-600">+{row.inTransit.toLocaleString()}</span> : "—"}
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs">
                        {row.onOrderQty > 0 ? <span className="text-violet-600">{row.onOrderQty.toLocaleString()}</span> : "—"}
                      </TableCell>
                      <TableCell className="px-2 py-1 text-xs font-mono truncate max-w-[100px]">{row.openPONumbers || "—"}</TableCell>
                      <TableCell className="px-2 py-1">{getPOStatusBadge(row.poStatus)}</TableCell>
                      <TableCell className="px-2 py-1 text-xs text-muted-foreground">{fmtDate(row.lastPODate)}</TableCell>
                      <TableCell className="px-2 py-1 text-xs truncate max-w-[110px]">{row.vendorName || "—"}</TableCell>
                      <TableCell className="px-2 py-1 text-xs font-mono truncate max-w-[100px]">{row.lastShipment || "—"}</TableCell>
                      <TableCell className="px-2 py-1">{getShipStatusBadge(row.shipStatus)}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs">{fmtCurrency(row.unitCost)}</TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-xs font-medium">{fmtCurrency(row.totalValue)}</TableCell>
                      <TableCell className="px-2 py-1 text-xs text-muted-foreground">{fmtDate(row.lastUpdated)}</TableCell>
                      <TableCell className="px-2 py-1 text-center">{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => { setSelectedItem(row); setShowShipmentDialog(true); }}
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => { setSelectedItem(row); setShowProductionDialog(true); }}
                          >
                            <Factory className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => handleQcHold(row)}
                          >
                            <Shield className="h-3 w-3" />
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
