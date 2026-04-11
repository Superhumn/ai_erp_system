import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Package, Truck, Upload, Warehouse, Edit2, Save, X, FileText,
  Plus, Send, Clock, AlertTriangle, CheckCircle, DollarSign,
  Calendar, Eye, Trash2, ClipboardList, Search,
} from "lucide-react";

// ---- Helper types ----
interface InventoryUpdateItem {
  productId: number;
  productName: string;
  sku: string;
  previousQuantity: string;
  newQuantity: string;
  quantityReceived: string;
  quantityShipped: string;
  quantityDamaged: string;
  notes: string;
}

interface InvoiceLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
}

// ---- Status badge colors ----
function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
    case "paid":
    case "submitted":
    case "reviewed":
      return "default";
    case "draft":
    case "uploaded":
      return "outline";
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}

/** Convert an ArrayBuffer to a base64 string using chunked encoding to avoid
 *  call-stack overflows with large files (avoids spread-to-args limit). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

export default function CopackerPortal() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  // --- Inline inventory editing ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // --- Inventory update form ---
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateItems, setUpdateItems] = useState<InventoryUpdateItem[]>([]);
  const [updateNotes, setUpdateNotes] = useState("");

  // --- Invoice form ---
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineItem[]>([
    { description: "", quantity: "1", unitPrice: "0", totalAmount: "0" },
  ]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  // --- Shipping document upload ---
  const [showShipDocUpload, setShowShipDocUpload] = useState(false);
  const [shipDocType, setShipDocType] = useState<string>("other");
  const [shipDocName, setShipDocName] = useState("");
  const [shipDocDescription, setShipDocDescription] = useState("");
  const [shipDocShipmentId, setShipDocShipmentId] = useState<string>("");
  const [shipDocFile, setShipDocFile] = useState<File | null>(null);

  // --- Detail view ---
  const [viewUpdateId, setViewUpdateId] = useState<number | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);

  // ---- Queries ----
  const { data: warehouse } = trpc.copackerPortal.getWarehouse.useQuery();
  const { data: inventory, isLoading: loadingInventory, refetch: refetchInventory } = trpc.copackerPortal.getInventory.useQuery();
  const { data: shipments } = trpc.copackerPortal.getShipments.useQuery();
  const { data: currentPeriod } = (trpc.copackerPortal as any).getCurrentPeriod.useQuery();
  const { data: inventoryUpdates, refetch: refetchUpdates } = (trpc.copackerPortal as any).getInventoryUpdates.useQuery();
  const { data: invoices, refetch: refetchInvoices } = (trpc.copackerPortal as any).getInvoices.useQuery();
  const { data: shippingDocs, refetch: refetchShipDocs } = (trpc.copackerPortal as any).getShippingDocuments.useQuery();
  const { data: updateDetail } = (trpc.copackerPortal as any).getInventoryUpdateDetail.useQuery(
    { id: viewUpdateId! },
    { enabled: !!viewUpdateId }
  );
  const { data: invoiceDetail } = (trpc.copackerPortal as any).getInvoiceDetail.useQuery(
    { id: viewInvoiceId! },
    { enabled: !!viewInvoiceId }
  );

  // ---- Work Orders query ----
  const { data: workOrdersList, refetch: refetchWorkOrders } = trpc.workOrders.list.useQuery();

  // ---- Mutations ----
  const updateInventory = trpc.copackerPortal.updateInventory.useMutation({
    onSuccess: () => {
      toast.success("Inventory updated");
      setEditingId(null);
      refetchInventory();
    },
    onError: (error) => toast.error("Failed to update inventory", { description: error.message }),
  });

  const createInventoryUpdate = (trpc.copackerPortal as any).createInventoryUpdate.useMutation({
    onSuccess: () => {
      toast.success("Inventory update saved as draft");
      setShowUpdateForm(false);
      resetUpdateForm();
      refetchUpdates();
    },
    onError: (error: any) => toast.error("Failed to create inventory update", { description: error.message }),
  });

  const submitInventoryUpdate = (trpc.copackerPortal as any).submitInventoryUpdate.useMutation({
    onSuccess: () => {
      toast.success("Inventory update submitted and applied");
      refetchUpdates();
      refetchInventory();
    },
    onError: (error: any) => toast.error("Failed to submit update", { description: error.message }),
  });

  const createInvoice = (trpc.copackerPortal as any).createInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice submitted successfully");
      setShowInvoiceForm(false);
      resetInvoiceForm();
      refetchInvoices();
    },
    onError: (error: any) => toast.error("Failed to submit invoice", { description: error.message }),
  });

  const uploadShippingDoc = (trpc.copackerPortal as any).uploadShippingDocument.useMutation({
    onSuccess: () => {
      toast.success("Shipping document uploaded");
      setShowShipDocUpload(false);
      resetShipDocForm();
      refetchShipDocs();
    },
    onError: (error: any) => toast.error("Failed to upload document", { description: error.message }),
  });

  const completeProduction = trpc.workOrders.completeProduction.useMutation({
    onSuccess: () => {
      toast.success("Work order completed");
      refetchWorkOrders();
      refetchInventory();
    },
    onError: (error) => toast.error("Failed to complete work order", { description: error.message }),
  });

  // ---- Inline inventory edit handlers ----
  const startEdit = (item: any) => {
    setEditingId(item.inventory.id);
    setEditQuantity(item.inventory.quantity?.toString() || "0");
    setEditNotes("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditQuantity("");
    setEditNotes("");
  };

  const saveEdit = (inventoryId: number) => {
    updateInventory.mutate({
      inventoryId,
      quantity: parseFloat(editQuantity) || 0,
      notes: editNotes || undefined,
    });
  };

  // ---- Inventory update form ----
  const initUpdateForm = () => {
    if (!inventory?.length) {
      toast.error("No inventory items to update");
      return;
    }
    const items: InventoryUpdateItem[] = inventory.map((item: any) => ({
      productId: item.inventory.productId,
      productName: item.product?.name || "Unknown",
      sku: item.product?.sku || "",
      previousQuantity: item.inventory.quantity?.toString() || "0",
      newQuantity: item.inventory.quantity?.toString() || "0",
      quantityReceived: "0",
      quantityShipped: "0",
      quantityDamaged: "0",
      notes: "",
    }));
    setUpdateItems(items);
    setUpdateNotes("");
    setShowUpdateForm(true);
  };

  const resetUpdateForm = () => {
    setUpdateItems([]);
    setUpdateNotes("");
  };

  const handleUpdateItemChange = (index: number, field: keyof InventoryUpdateItem, value: string) => {
    setUpdateItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSaveUpdateDraft = () => {
    if (!currentPeriod) return;
    createInventoryUpdate.mutate({
      periodStart: currentPeriod.periodStart,
      periodEnd: currentPeriod.periodEnd,
      notes: updateNotes || undefined,
      items: updateItems.map((i) => ({
        productId: i.productId,
        previousQuantity: i.previousQuantity,
        newQuantity: i.newQuantity,
        quantityReceived: i.quantityReceived,
        quantityShipped: i.quantityShipped,
        quantityDamaged: i.quantityDamaged,
        notes: i.notes || undefined,
      })),
    });
  };

  // ---- Invoice form ----
  const resetInvoiceForm = () => {
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setInvoiceDueDate("");
    setInvoiceDescription("");
    setInvoiceNotes("");
    setInvoiceItems([{ description: "", quantity: "1", unitPrice: "0", totalAmount: "0" }]);
    setInvoiceFile(null);
  };

  const handleInvoiceItemChange = (index: number, field: keyof InvoiceLineItem, value: string) => {
    setInvoiceItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        const qty = parseFloat(next[index].quantity) || 0;
        const price = parseFloat(next[index].unitPrice) || 0;
        next[index].totalAmount = (qty * price).toFixed(2);
      }
      return next;
    });
  };

  const addInvoiceItem = () => {
    setInvoiceItems((prev) => [...prev, { description: "", quantity: "1", unitPrice: "0", totalAmount: "0" }]);
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems((prev) => prev.filter((_, i) => i !== index));
  };

  const invoiceTotal = useMemo(
    () => invoiceItems.reduce((sum, i) => sum + (parseFloat(i.totalAmount) || 0), 0),
    [invoiceItems]
  );

  const handleSubmitInvoice = async () => {
    let fileData: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if (invoiceFile) {
      const buffer = await invoiceFile.arrayBuffer();
      fileData = arrayBufferToBase64(buffer);
      mimeType = invoiceFile.type;
      fileName = invoiceFile.name;
    }

    createInvoice.mutate({
      invoiceNumber,
      invoiceDate,
      dueDate: invoiceDueDate || undefined,
      description: invoiceDescription || undefined,
      notes: invoiceNotes || undefined,
      items: invoiceItems.filter((i) => i.description.trim()),
      fileName,
      fileData,
      mimeType,
    });
  };

  // ---- Shipping doc upload ----
  const resetShipDocForm = () => {
    setShipDocType("other");
    setShipDocName("");
    setShipDocDescription("");
    setShipDocShipmentId("");
    setShipDocFile(null);
  };

  const handleUploadShipDoc = async () => {
    if (!shipDocFile) {
      toast.error("Please select a file to upload");
      return;
    }
    if (!shipDocShipmentId) {
      toast.error("Please select a shipment");
      return;
    }
    const buffer = await shipDocFile.arrayBuffer();
    const fileData = arrayBufferToBase64(buffer);

    uploadShippingDoc.mutate({
      shipmentId: parseInt(shipDocShipmentId),
      documentType: shipDocType as "invoice" | "receipt" | "contract" | "legal" | "report" | "hr" | "other",
      name: shipDocName || shipDocFile.name,
      fileData,
      mimeType: shipDocFile.type,
    });
  };

  // ---- Stats ----
  const stats = useMemo(() => {
    const totalProducts = inventory?.length || 0;
    const pendingUpdates = inventoryUpdates?.filter((u: any) => u.status === "draft").length || 0;
    const totalInvoices = invoices?.length || 0;
    const pendingInvoices = invoices?.filter((i: any) => ["submitted", "under_review"].includes(i.status)).length || 0;
    const totalDocs = shippingDocs?.length || 0;
    return { totalProducts, pendingUpdates, totalInvoices, pendingInvoices, totalDocs };
  }, [inventory, inventoryUpdates, invoices, shippingDocs]);

  // ---- Build work order lookup by productId (active WOs only) ----
  const woByProduct = useMemo(() => {
    const map: Record<number, any> = {};
    if (workOrdersList?.length) {
      for (const wo of workOrdersList) {
        // Only show active (non-completed, non-cancelled) work orders
        if (wo.status === "completed" || wo.status === "cancelled") continue;
        if (wo.productId && !map[wo.productId]) {
          map[wo.productId] = wo;
        }
      }
    }
    return map;
  }, [workOrdersList]);

  // ---- Build enriched inventory rows with invoice/shipment status ----
  const enrichedInventory = useMemo(() => {
    if (!inventory) return [];

    // Build lookups for the latest inventory update item per product
    const latestUpdateByProduct: Record<number, any> = {};
    if (inventoryUpdates?.length) {
      // inventoryUpdates are sorted newest-first typically
      for (const update of inventoryUpdates) {
        if (update.items) {
          for (const item of update.items) {
            if (!latestUpdateByProduct[item.productId]) {
              latestUpdateByProduct[item.productId] = { ...item, updateStatus: update.status, period: `${new Date(update.periodStart).toLocaleDateString()} - ${new Date(update.periodEnd).toLocaleDateString()}` };
            }
          }
        }
      }
    }

    return inventory.map((item: any) => {
      const productId = item.inventory.productId;
      const latestUpdate = latestUpdateByProduct[productId];

      // Find matching shipment for this product (simple: look for any recent shipment)
      const productShipment = shipments?.find((s: any) =>
        s.items?.some?.((si: any) => si.productId === productId)
      );

      // Find matching invoice
      const productInvoice = invoices?.find((inv: any) =>
        inv.items?.some?.((ii: any) => ii.productId === productId)
      );

      // Find active work order for this product
      const wo = woByProduct[productId] || null;

      return {
        id: item.inventory.id,
        _sku: item.product?.sku || "--",
        _product: item.product?.name || "Unknown Product",
        _previousQty: latestUpdate?.previousQuantity || "-",
        _currentQty: parseFloat(item.inventory.quantity || "0"),
        _received: latestUpdate?.quantityReceived || "-",
        _shipped: latestUpdate?.quantityShipped || "-",
        _damaged: latestUpdate?.quantityDamaged || "-",
        _lastUpdate: item.inventory.updatedAt
          ? new Date(item.inventory.updatedAt).toLocaleDateString()
          : "--",
        _period: latestUpdate?.period || currentPeriod?.periodLabel || "-",
        _invoiceStatus: productInvoice?.status?.replace(/_/g, " ") || "-",
        _shipmentStatus: productShipment?.status || "-",
        _notes: latestUpdate?.notes || "",
        // Work order fields
        _woId: wo?.id || null,
        _woNumber: wo?.workOrderNumber || null,
        _woStatus: wo?.status || null,
        _woQty: wo?.quantity || null,
        _woDue: wo?.scheduledEndDate
          ? new Date(wo.scheduledEndDate).toLocaleDateString()
          : null,
        _woWarehouseId: wo?.warehouseId || null,
        // keep original for editing
        _original: item,
      };
    });
  }, [inventory, inventoryUpdates, invoices, shipments, shippingDocs, currentPeriod, woByProduct]);

  // Filter by search
  const filteredInventory = useMemo(() => {
    if (!searchQuery) return enrichedInventory;
    const q = searchQuery.toLowerCase();
    return enrichedInventory.filter((row: any) =>
      row._sku.toLowerCase().includes(q) ||
      row._product.toLowerCase().includes(q)
    );
  }, [enrichedInventory, searchQuery]);

  // ---- Access check ----
  if (user?.role !== "copacker" && user?.role !== "admin" && user?.role !== "ops") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">You don't have access to the Copacker Portal.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Copacker Dashboard</h1>
          <p className="text-muted-foreground">
            Inventory with invoice and shipment status
          </p>
        </div>
        <div className="flex items-center gap-2">
          {warehouse && (
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{warehouse.name}</span>
                <Badge variant="outline">{warehouse.type}</Badge>
              </div>
            </Card>
          )}
          <Button variant="outline" onClick={() => setShowInvoiceForm(true)}>
            <DollarSign className="h-4 w-4 mr-1" />
            New Invoice
          </Button>
          <Button variant="outline" onClick={() => setShowShipDocUpload(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload Doc
          </Button>
          <Button onClick={initUpdateForm} disabled={!inventory?.length}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Inventory Update
          </Button>
        </div>
      </div>

      {/* Biweekly Prompt Banner */}
      {currentPeriod?.isDue && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800 dark:text-orange-400">Inventory Update Due</AlertTitle>
          <AlertDescription className="text-orange-700 dark:text-orange-300">
            Your biweekly inventory update for <strong>{currentPeriod.periodLabel}</strong> is due
            in {currentPeriod.daysLeft} day{currentPeriod.daysLeft !== 1 ? "s" : ""}.
            <Button
              variant="outline"
              size="sm"
              className="ml-3 border-orange-500 text-orange-700 hover:bg-orange-100"
              onClick={initUpdateForm}
            >
              <ClipboardList className="h-3 w-3 mr-1" />
              Submit Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Products Tracked</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Draft Updates</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{stats.pendingUpdates}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalInvoices}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">Pending Invoices</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{stats.pendingInvoices}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Truck className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Shipping Docs</p>
                <p className="text-xl font-semibold tracking-[-0.02em]">{stats.totalDocs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Single Inventory Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>
                Current stock levels with invoice and shipment status per item
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by SKU or product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-[250px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingInventory ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !filteredInventory.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No inventory items found for your facility
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">SKU</TableHead>
                    <TableHead className="min-w-[160px]">Product</TableHead>
                    <TableHead className="min-w-[80px] text-right">Prev Qty</TableHead>
                    <TableHead className="min-w-[100px] text-right">Current Qty</TableHead>
                    <TableHead className="min-w-[70px] text-right">Received</TableHead>
                    <TableHead className="min-w-[70px] text-right">Shipped</TableHead>
                    <TableHead className="min-w-[70px] text-right">Damaged</TableHead>
                    <TableHead className="min-w-[90px]">Last Update</TableHead>
                    <TableHead className="min-w-[140px]">Period</TableHead>
                    <TableHead className="min-w-[100px]">Invoice</TableHead>
                    <TableHead className="min-w-[100px]">Shipment</TableHead>
                    <TableHead className="min-w-[90px]">WO#</TableHead>
                    <TableHead className="min-w-[90px]">WO Status</TableHead>
                    <TableHead className="min-w-[70px] text-right">WO Qty</TableHead>
                    <TableHead className="min-w-[90px]">WO Due</TableHead>
                    <TableHead className="min-w-[120px]">Notes</TableHead>
                    <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground text-sm font-mono">{row._sku}</TableCell>
                      <TableCell className="font-medium text-sm">{row._product}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{row._previousQty}</TableCell>
                      <TableCell className="text-right">
                        {editingId === row.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              value={editQuantity}
                              onChange={(e) => setEditQuantity(e.target.value)}
                              className="w-20 h-7 text-sm"
                            />
                          </div>
                        ) : (
                          <span className="font-mono text-sm font-semibold">
                            {row._currentQty.toLocaleString()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{row._received}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{row._shipped}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{row._damaged}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row._lastUpdate}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row._period}</TableCell>
                      <TableCell>
                        {row._invoiceStatus !== "-" ? (
                          <Badge variant={statusVariant(row._invoiceStatus)} className="text-xs capitalize">
                            {row._invoiceStatus}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row._shipmentStatus !== "-" ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {row._shipmentStatus}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {/* Work Order columns */}
                      <TableCell className="text-sm font-mono">
                        {row._woNumber ? (
                          <span className="text-xs">{row._woNumber}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row._woStatus ? (
                          <Badge
                            variant={
                              row._woStatus === "in_progress"
                                ? "default"
                                : row._woStatus === "scheduled"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-xs capitalize"
                          >
                            {row._woStatus.replace(/_/g, " ")}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row._woQty ? parseFloat(row._woQty).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row._woDue || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {row._notes || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {editingId === row.id ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => saveEdit(row.id)}
                                disabled={updateInventory.isPending}
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7" onClick={cancelEdit}>
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startEdit(row._original)}>
                                <Edit2 className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              {row._woId && row._woStatus === "in_progress" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={completeProduction.isPending}
                                  onClick={() =>
                                    completeProduction.mutate({
                                      id: row._woId,
                                      completedQuantity: row._woQty,
                                      warehouseId: row._woWarehouseId ?? undefined,
                                    })
                                  }
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Complete
                                </Button>
                              )}
                            </>
                          )}
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

      {/* ============ DIALOGS ============ */}

      {/* Biweekly Inventory Update Form Dialog */}
      <Dialog open={showUpdateForm} onOpenChange={setShowUpdateForm}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Biweekly Inventory Update</DialogTitle>
            <DialogDescription>
              {currentPeriod
                ? `Reporting period: ${currentPeriod.periodLabel}`
                : "Submit your inventory counts for the current period"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {updateItems.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Previous Qty</TableHead>
                    <TableHead>New Qty</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Shipped</TableHead>
                    <TableHead>Damaged</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {updateItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-sm">{item.productName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.sku || "--"}</TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-muted-foreground">
                          {parseFloat(item.previousQuantity).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.newQuantity}
                          onChange={(e) => handleUpdateItemChange(idx, "newQuantity", e.target.value)}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantityReceived}
                          onChange={(e) => handleUpdateItemChange(idx, "quantityReceived", e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantityShipped}
                          onChange={(e) => handleUpdateItemChange(idx, "quantityShipped", e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantityDamaged}
                          onChange={(e) => handleUpdateItemChange(idx, "quantityDamaged", e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.notes}
                          onChange={(e) => handleUpdateItemChange(idx, "notes", e.target.value)}
                          placeholder="Notes..."
                          className="w-32"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="space-y-2">
              <Label>General Notes</Label>
              <Textarea
                value={updateNotes}
                onChange={(e) => setUpdateNotes(e.target.value)}
                placeholder="Any overall notes for this update period..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveUpdateDraft}
              disabled={createInventoryUpdate.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Creation Dialog */}
      <Dialog open={showInvoiceForm} onOpenChange={setShowInvoiceForm}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice for copacking services
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Number *</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Date *</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Attach Invoice File (PDF)</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={invoiceDescription}
                onChange={(e) => setInvoiceDescription(e.target.value)}
                placeholder="Brief description of services..."
                rows={2}
              />
            </div>

            <Separator />

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Line Items</Label>
                <Button size="sm" variant="outline" onClick={addInvoiceItem}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Line
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Description</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(e) => handleInvoiceItemChange(idx, "description", e.target.value)}
                          placeholder="Service description..."
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleInvoiceItemChange(idx, "quantity", e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleInvoiceItemChange(idx, "unitPrice", e.target.value)}
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        ${parseFloat(item.totalAmount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {invoiceItems.length > 1 && (
                          <Button size="sm" variant="ghost" onClick={() => removeInvoiceItem(idx)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end mt-2">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-lg font-semibold tracking-[-0.015em] font-mono">
                    ${invoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Payment terms, additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitInvoice}
              disabled={createInvoice.isPending || !invoiceNumber.trim()}
            >
              <Send className="h-4 w-4 mr-2" />
              Submit Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shipping Document Upload Dialog */}
      <Dialog open={showShipDocUpload} onOpenChange={setShowShipDocUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Shipping Document</DialogTitle>
            <DialogDescription>
              Upload a BOL, packing list, proof of delivery, or other shipping document
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Document Type *</Label>
              <Select value={shipDocType} onValueChange={setShipDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input
                value={shipDocName}
                onChange={(e) => setShipDocName(e.target.value)}
                placeholder="e.g., BOL-2024-001"
              />
            </div>

            {shipments && shipments.length > 0 && (
              <div className="space-y-2">
                <Label>Link to Shipment (optional)</Label>
                <Select value={shipDocShipmentId} onValueChange={setShipDocShipmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a shipment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {shipments.map((s: any) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.shipmentNumber} ({s.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={shipDocDescription}
                onChange={(e) => setShipDocDescription(e.target.value)}
                placeholder="Additional details about this document..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Select File *</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => setShipDocFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, Word, Excel, Images
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShipDocUpload(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadShipDoc}
              disabled={uploadShippingDoc.isPending || !shipDocFile}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory Update Detail Dialog */}
      <Dialog open={!!viewUpdateId} onOpenChange={() => setViewUpdateId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inventory Update Detail</DialogTitle>
            {updateDetail?.update && (
              <DialogDescription>
                Period: {new Date(updateDetail.update.periodStart).toLocaleDateString()} - {new Date(updateDetail.update.periodEnd).toLocaleDateString()}
                <Badge variant={statusVariant(updateDetail.update.status)} className="ml-2">
                  {updateDetail.update.status}
                </Badge>
              </DialogDescription>
            )}
          </DialogHeader>

          {updateDetail?.items?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Shipped</TableHead>
                  <TableHead>Damaged</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {updateDetail.items.map((row: any) => (
                  <TableRow key={row.item.id}>
                    <TableCell className="font-medium">{row.product?.name || "Unknown"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {parseFloat(row.item.previousQuantity || "0").toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {parseFloat(row.item.newQuantity || "0").toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {parseFloat(row.item.quantityReceived || "0").toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {parseFloat(row.item.quantityShipped || "0").toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {parseFloat(row.item.quantityDamaged || "0").toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.item.notes || "--"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">No items found</p>
          )}

          {updateDetail?.update?.notes && (
            <div className="mt-2">
              <Label className="text-sm font-medium">Notes</Label>
              <p className="text-sm text-muted-foreground mt-1">{updateDetail.update.notes}</p>
            </div>
          )}

          <DialogFooter>
            {updateDetail?.update?.status === "draft" && (
              <Button
                onClick={() => {
                  submitInventoryUpdate.mutate({ id: viewUpdateId! });
                  setViewUpdateId(null);
                }}
                disabled={submitInventoryUpdate.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Submit Update
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewUpdateId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!viewInvoiceId} onOpenChange={() => setViewInvoiceId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice Detail</DialogTitle>
            {invoiceDetail?.invoice && (
              <DialogDescription>
                Invoice #{invoiceDetail.invoice.invoiceNumber}
                <Badge variant={statusVariant(invoiceDetail.invoice.status)} className="ml-2">
                  {invoiceDetail.invoice.status.replace(/_/g, " ")}
                </Badge>
              </DialogDescription>
            )}
          </DialogHeader>

          {invoiceDetail?.invoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{new Date(invoiceDetail.invoice.invoiceDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Due Date</p>
                  <p className="font-medium">
                    {invoiceDetail.invoice.dueDate
                      ? new Date(invoiceDetail.invoice.dueDate).toLocaleDateString()
                      : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Amount</p>
                  <p className="font-medium text-lg font-mono">
                    ${parseFloat(invoiceDetail.invoice.totalAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                {invoiceDetail.invoice.fileUrl && (
                  <div>
                    <p className="text-muted-foreground">Attachment</p>
                    <a
                      href={invoiceDetail.invoice.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {invoiceDetail.invoice.fileName || "View File"}
                    </a>
                  </div>
                )}
              </div>

              {invoiceDetail.invoice.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-sm">{invoiceDetail.invoice.description}</p>
                </div>
              )}

              {invoiceDetail.invoice.rejectionReason && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Rejected</AlertTitle>
                  <AlertDescription>{invoiceDetail.invoice.rejectionReason}</AlertDescription>
                </Alert>
              )}

              <Separator />

              {invoiceDetail.items?.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceDetail.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="font-mono">{parseFloat(item.quantity).toLocaleString()}</TableCell>
                        <TableCell className="font-mono">${parseFloat(item.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="font-mono">${parseFloat(item.totalAmount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewInvoiceId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
