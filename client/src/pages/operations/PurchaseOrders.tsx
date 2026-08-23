import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Plus, Search, Loader2, Sparkles, Send, Trash2, MoreHorizontal, CheckCircle, MessageCircle, Copy, X, Download, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { getStatusColor } from "@/lib/statusColors";
import WhatsAppDrawer from "@/components/WhatsAppDrawer";
import LinkContactDialog from "@/components/LinkContactDialog";
import PurchaseOrderDetailSheet from "./PurchaseOrderDetailSheet";
import { useSearch, useLocation, Link } from "wouter";

type SortKey =
  | "poNumber" | "vendor" | "totalAmount" | "status" | "orderDate" | "expectedDate" | "createdAt";

type LineItem = {
  productId?: number;
  description: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
};

export default function PurchaseOrders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [isTextPOOpen, setIsTextPOOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [activeAction, setActiveAction] = useState<'draft' | 'email' | null>(null);
  const [deletePOId, setDeletePOId] = useState<number | null>(null);
  const [detailPoId, setDetailPoId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Deep-link support: /operations/purchase-orders?po=<id> opens that PO's
  // detail drawer (used by status-change notifications). Depends on the search
  // string so it also fires on in-app navigation that only changes the query,
  // not just on initial mount.
  const locationSearch = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    // Sync the drawer to the ?po=<id> param: open it for a valid id, and close it
    // when the param is removed/invalid (e.g. navigating back to the plain list).
    // Row clicks don't change the query string, so they aren't affected by this.
    const po = new URLSearchParams(locationSearch).get("po");
    const id = po ? parseInt(po, 10) : NaN;
    setDetailPoId(Number.isFinite(id) ? id : null);
  }, [locationSearch]);
  const [chatTarget, setChatTarget] = useState<{ contactId: number; whatsappNumber: string; contactName?: string; subtitle?: string } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ vendorId: number; vendorName: string; vendorPhone?: string | null; poNumber: string } | null>(null);
  const [poPreview, setPoPreview] = useState<{
    vendorId: number;
    vendorName: string;
    rawMaterialId: number | null;
    items: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      totalAmount: string;
      rawMaterialId: number | null;
    }>;
    shippingAddress: string;
    notes: string;
    subtotal: string;
    totalAmount: string;
    suggested: boolean;
    isPriceEstimated?: boolean;
  } | null>(null);
  const [formData, setFormData] = useState({
    vendorId: 0,
    expectedDeliveryDate: "",
    notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const { data: vendors } = trpc.vendors.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const utils = trpc.useUtils();

  // Filtering, sorting and paging all happen server-side: the list used to pull
  // every PO and filter in the browser, which is why a few hundred imported
  // rows rendered as one endless table.
  const filters = useMemo(() => ({
    status: statusFilter === "all" ? undefined : statusFilter,
    vendorId: vendorFilter === "all" ? undefined : Number(vendorFilter),
    search: search.trim() || undefined,
    orderDateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`) : undefined,
    // Inclusive end date: the picker gives a day, not an instant.
    orderDateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`) : undefined,
    duplicatesOnly: duplicatesOnly || undefined,
  }), [statusFilter, vendorFilter, search, dateFrom, dateTo, duplicatesOnly]);

  const { data: pagedData, isLoading } = trpc.purchaseOrders.listPaged.useQuery({
    ...filters,
    sortBy,
    sortDir,
    limit: pageSize,
    offset: page * pageSize,
  });
  const { data: summary } = trpc.purchaseOrders.summary.useQuery(filters);

  const purchaseOrders = pagedData?.rows;
  const totalCount = pagedData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const poIds = (purchaseOrders || []).map((po) => po.id);
  const { data: receiptProgress } = trpc.purchaseOrders.receiptProgress.useQuery(
    { purchaseOrderIds: poIds },
    { enabled: poIds.length > 0 }
  );
  const receiptProgressMap = new Map(
    (receiptProgress || []).map((r) => [r.purchaseOrderId, r])
  );
  const { data: documentCounts } = trpc.purchaseOrders.documentCounts.useQuery(
    { purchaseOrderIds: poIds },
    { enabled: poIds.length > 0 }
  );
  const documentCountMap = new Map<number, number>(
    (documentCounts || []).map((c) => [c.purchaseOrderId, c.count])
  );

  // Duplicate groups: POs sharing (poNumber, vendor, total). `keepId` is the
  // original import; everything in `duplicateIds` is a later copy.
  const { data: duplicateGroups } = trpc.purchaseOrders.duplicates.useQuery();

  // The copies only — what "Select duplicates" ticks, so the oldest of each
  // group survives the cleanup.
  const redundantIds = useMemo(() => {
    const set = new Set<number>();
    for (const g of duplicateGroups || []) {
      for (const id of g.duplicateIds) set.add(id);
    }
    return set;
  }, [duplicateGroups]);

  const resetForm = () => {
    setFormData({ vendorId: 0, expectedDeliveryDate: "", notes: "" });
    setLineItems([]);
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0"));
    }, 0);
    return { subtotal, total: subtotal };
  };

  const totals = calculateTotals();

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: "1", unitPrice: "0", totalAmount: "0" }]);
  };

  const selectProduct = (index: number, productIdStr: string) => {
    const productId = parseInt(productIdStr);
    const product = products?.find(p => p.id === productId);
    const updated = lineItems.map((item, i) => {
      if (i !== index) return item;
      const unitPrice = product?.unitPrice || "0";
      const quantity = item.quantity || "1";
      const totalAmount = (parseFloat(quantity) * parseFloat(unitPrice)).toFixed(2);
      return { ...item, productId, description: product?.name || item.description, unitPrice, totalAmount };
    });
    setLineItems(updated);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    const updated = lineItems.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        const qty = parseFloat(field === "quantity" ? value : item.quantity) || 0;
        const price = parseFloat(field === "unitPrice" ? value : item.unitPrice) || 0;
        newItem.totalAmount = (qty * price).toFixed(2);
      }
      return newItem;
    });
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const createPO = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase order created successfully");
      setIsOpen(false);
      resetForm();
      invalidateLists();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const parseText = trpc.purchaseOrders.parseText.useMutation({
    onSuccess: (data) => {
      setPoPreview(data.preview);
      toast.success("Text parsed successfully! Review the preview below.");
    },
    onError: (error) => {
      toast.error(`Failed to parse text: ${error.message}`);
    },
  });

  const createFromText = trpc.purchaseOrders.createFromText.useMutation({
    onSuccess: (data) => {
      if (data.emailSent) {
        toast.success("PO created and email sent to supplier!");
      } else if (data.emailError) {
        toast.warning(`PO created successfully, but email failed to send: ${data.emailError}`);
      } else {
        toast.success("PO created successfully!");
      }
      setIsTextPOOpen(false);
      setTextInput("");
      setPoPreview(null);
      setActiveAction(null);
      invalidateLists();
    },
    onError: (error) => {
      toast.error(`Failed to create PO: ${error.message}`);
      setActiveAction(null);
    },
  });

  const autoLinkMutation = trpc.vendors.autoLinkContact.useMutation();

  async function handleOpenChat(po: any, vendor: any, e: React.MouseEvent) {
    e.stopPropagation();
    if (!vendor) {
      toast.error("No vendor on this PO");
      return;
    }
    try {
      const result = await autoLinkMutation.mutateAsync({ vendorId: vendor.id });
      if (result.contact) {
        const waNumber = result.contact.whatsappNumber || result.contact.phone || vendor.whatsappNumber || vendor.phone;
        if (!waNumber) {
          toast.error("Contact has no WhatsApp/phone number");
          return;
        }
        if (result.autoLinked) {
          toast.success(`Auto-linked to ${result.contact.fullName || "contact"}`);
          utils.vendors.list.invalidate();
        }
        setChatTarget({
          contactId: result.contact.id,
          whatsappNumber: waNumber,
          contactName: result.contact.fullName || vendor.contactName || vendor.name,
          subtitle: `${vendor.name} · PO ${po.poNumber}`,
        });
      } else {
        setLinkTarget({ vendorId: vendor.id, vendorName: vendor.name, vendorPhone: vendor.phone, poNumber: po.poNumber });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to open chat");
    }
  }

  const deletePO = trpc.purchaseOrders.delete.useMutation({
    onSuccess: () => {
      toast.success("Purchase order deleted");
      setDeletePOId(null);
      setSelectedIds((prev) => {
        if (deletePOId === null || !prev.has(deletePOId)) return prev;
        const next = new Set(prev);
        next.delete(deletePOId);
        return next;
      });
      invalidateLists();
    },
    onError: (error) => toast.error(error.message),
  });

  // Every list-affecting mutation goes through this: the page reads from
  // listPaged + summary + duplicates, and refreshing only one of them leaves
  // the header totals or the duplicate badge contradicting the table.
  const invalidateLists = () => {
    utils.purchaseOrders.list.invalidate();
    utils.purchaseOrders.listPaged.invalidate();
    utils.purchaseOrders.summary.invalidate();
    utils.purchaseOrders.duplicates.invalidate();
    utils.purchaseOrders.receiptProgress.invalidate();
  };

  const bulkUpdateStatus = trpc.purchaseOrders.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      if (data.failed.length > 0) {
        toast.warning(
          `Updated ${data.updated} PO(s). ${data.failed.length} failed: ${data.failed.map((f) => f.poNumber).join(", ")}`
        );
      } else {
        toast.success(`Updated ${data.updated} purchase order(s)`);
        setSelectedIds(new Set());
      }
      invalidateLists();
    },
    onError: (error) => toast.error(error.message),
  });

  // Export pulls the full filtered set from the server rather than the visible
  // page, so an export after paging isn't silently just those 50 rows.
  const [isExporting, setIsExporting] = useState(false);
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const rows = await utils.purchaseOrders.exportRows.fetch({ ...filters, sortBy, sortDir });
      if (!rows || rows.length === 0) {
        toast.info("Nothing to export for the current filters");
        return;
      }
      const headers = ["PO #", "Vendor", "Status", "Order Date", "Expected Date", "Subtotal", "Tax", "Shipping", "Total", "Currency", "Notes"];
      // Quote every field and double any embedded quotes — vendor names and
      // notes routinely contain commas, quotes and newlines.
      const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const isoDate = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : "");
      const csv = [
        headers.map(escape).join(","),
        ...rows.map((r: any) => [
          r.poNumber, r.vendor?.name ?? "", r.status, isoDate(r.orderDate), isoDate(r.expectedDate),
          r.subtotal ?? "", r.taxAmount ?? "", r.shippingAmount ?? "", r.totalAmount ?? "", r.currency ?? "", r.notes ?? "",
        ].map(escape).join(",")),
      ].join("\n");

      // BOM so Excel reads the file as UTF-8 rather than mangling vendor names.
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} purchase order(s)`);
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const bulkDeletePOs = trpc.purchaseOrders.bulkDelete.useMutation({
    onSuccess: (data) => {
      // A partial run is reported as a partial run: the POs that couldn't be
      // deleted stay selected so they can be retried or inspected.
      if (data.failed.length > 0) {
        toast.warning(
          `Deleted ${data.deleted} PO(s). ${data.failed.length} could not be deleted: ${data.failed
            .map((f) => f.poNumber)
            .join(", ")}`
        );
        setSelectedIds(new Set(data.failed.map((f) => f.id)));
      } else {
        toast.success(`Deleted ${data.deleted} purchase order(s)`);
        setSelectedIds(new Set());
      }
      setBulkDeleteOpen(false);
      invalidateLists();
    },
    onError: (error) => toast.error(error.message),
  });

  const updatePO = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Purchase order updated");
      invalidateLists();
    },
    onError: (error) => toast.error(error.message),
  });

  const approvePO = trpc.purchaseOrders.approve.useMutation({
    onSuccess: () => {
      toast.success("Purchase order approved");
      invalidateLists();
    },
    onError: (error) => toast.error(error.message),
  });

  const sendPOToSupplier = trpc.purchaseOrders.sendToSupplier.useMutation({
    onSuccess: () => {
      toast.success("PO sent to supplier");
      invalidateLists();
    },
    onError: (error) => toast.error(error.message),
  });

  const filteredPOs = purchaseOrders;

  // Changing what the list is showing clears the selection: a selection made
  // under one filter shouldn't stay armed behind the delete button under
  // another, where the user can no longer see what it covers.
  useEffect(() => {
    setSelectedIds(new Set());
    setPage(0);
  }, [statusFilter, vendorFilter, search, dateFrom, dateTo, duplicatesOnly]);

  // Selection persists across pages — the ids are what matter, not which page
  // they were ticked on — so bulk actions apply to everything selected.
  const visibleIds = (filteredPOs || []).map((po) => po.id);
  const selectedVisibleIds = visibleIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const someVisibleSelected = selectedVisibleIds.length > 0 && !allVisibleSelected;
  const selectedAllIds = Array.from(selectedIds);

  const SortableHead = ({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        onClick={() => toggleSort(sortKey)}
        // Announces the current sort to screen readers, and which way the next
        // click will take it.
        aria-label={`Sort by ${label}${sortBy === sortKey ? ` (currently ${sortDir === "asc" ? "ascending" : "descending"})` : ""}`}
      >
        {label}
        {sortBy === sortKey &&
          (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      // Text sorts read naturally ascending; amounts and dates are almost
      // always wanted largest/newest first.
      setSortDir(key === "poNumber" || key === "vendor" || key === "status" ? "asc" : "desc");
    }
    setPage(0);
  };

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  // Ticks every redundant copy in the table, not just the current page: the
  // duplicates are spread across pages and cleaning them up one page at a time
  // is the tedium this button exists to remove. The oldest PO of each group is
  // never selected.
  const selectDuplicates = () => {
    if (redundantIds.size === 0) {
      toast.info("No duplicate copies found");
      return;
    }
    setSelectedIds(new Set(redundantIds));
    toast.success(`Selected ${redundantIds.size} duplicate copy(ies) — originals kept`);
  };

  const selectedCount = selectedIds.size;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate vendor selection
    if (formData.vendorId === 0) {
      toast.error("Please select a vendor");
      return;
    }
    
    // Validate at least one line item exists
    if (lineItems.length === 0) {
      toast.error("Please add at least one line item");
      return;
    }
    
    // Validate each line item has required fields
    const invalidItemIndex = lineItems.findIndex((item) => {
      const description = (item.description || "").trim();
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      return (
        !description ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice <= 0
      );
    });
    if (invalidItemIndex !== -1) {
      toast.error(`Line item #${invalidItemIndex + 1} is missing required fields. All items must have a description, quantity greater than 0, and unit price greater than 0.`);
      return;
    }
    
    const totals = calculateTotals();
    createPO.mutate({
      vendorId: formData.vendorId,
      orderDate: new Date(),
      expectedDate: formData.expectedDeliveryDate ? new Date(formData.expectedDeliveryDate) : undefined,
      subtotal: totals.subtotal.toFixed(2),
      taxAmount: "0",
      totalAmount: totals.total.toFixed(2),
      notes: formData.notes || undefined,
      items: lineItems.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalAmount: item.totalAmount,
      })),
    });
  };

  const handleParseText = () => {
    if (!textInput.trim()) {
      toast.error("Please enter a text description");
      return;
    }
    parseText.mutate({ text: textInput });
  };

  const handleCreateFromText = (sendEmail: boolean) => {
    if (!poPreview) {
      toast.error("Please parse the text first");
      return;
    }
    setActiveAction(sendEmail ? 'email' : 'draft');
    createFromText.mutate({
      text: textInput,
      preview: poPreview,
      sendEmail,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            Purchase Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage vendor orders and track deliveries.
          </p>
          <Link href="/ops/views">
            <Button variant="outline" size="sm" className="mt-2">
              Board / calendar views
            </Button>
          </Link>
        </div>
        <div className="flex gap-2">
          <Dialog open={isTextPOOpen} onOpenChange={(open) => {
            setIsTextPOOpen(open);
            if (!open) {
              // Clean up state when dialog is closed
              setTextInput("");
              setPoPreview(null);
              setActiveAction(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                Quick Create from Text
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create PO from Text</DialogTitle>
                <DialogDescription>
                  Describe what you want to order in plain text, and we'll create a PO for you.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="textInput">Order Description</Label>
                  <Textarea
                    id="textInput"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder='Example: "order 3 tons of mushrooms ship to alex meats"'
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <Button
                  onClick={handleParseText}
                  disabled={parseText.isPending || !textInput.trim()}
                  className="w-full"
                  variant="secondary"
                >
                  {parseText.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {parseText.isPending ? "Parsing..." : "Parse & Preview"}
                </Button>

                {poPreview && (
                  <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
                    <h3 className="font-semibold">Preview</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vendor:</span>
                        <span className="font-medium">{poPreview.vendorName}</span>
                      </div>
                      {poPreview.suggested && (
                        <p className="text-xs text-foreground font-semibold">
                          ⚠️ Default vendor suggested. Material not found in inventory.
                        </p>
                      )}
                      {poPreview.isPriceEstimated && (
                        <p className="text-xs text-foreground font-semibold">
                          ⚠️ Price not available. Please update manually after creation.
                        </p>
                      )}
                      <div className="border-t pt-2">
                        <p className="font-medium mb-2">Items:</p>
                        {poPreview.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{item.description}</span>
                            <span className="font-mono">${item.totalAmount}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Total:</span>
                        <span className="font-mono">${poPreview.totalAmount}</span>
                      </div>
                      {poPreview.shippingAddress && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ship To:</span>
                          <span>{poPreview.shippingAddress}</span>
                        </div>
                      )}
                      {poPreview.notes && (
                        <div className="border-t pt-2">
                          <span className="text-muted-foreground">Notes:</span>
                          <p className="text-xs mt-1">{poPreview.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsTextPOOpen(false);
                    setTextInput("");
                    setPoPreview(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleCreateFromText(false)}
                  disabled={!poPreview || createFromText.isPending}
                >
                  {createFromText.isPending && activeAction === 'draft' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Draft
                </Button>
                <Button
                  onClick={() => handleCreateFromText(true)}
                  disabled={!poPreview || createFromText.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  {createFromText.isPending && activeAction === 'email' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Send className="h-4 w-4 mr-2" />
                  Create & Email
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create PO
              </Button>
            </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
                <DialogDescription>
                  Select a vendor (or create a new one), add line items, and save. New vendors are created on the fly.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Vendor *</Label>
                    <SelectWithCreate
                      value={formData.vendorId === 0 ? "" : formData.vendorId.toString()}
                      onValueChange={(value) => setFormData({ ...formData, vendorId: parseInt(value) })}
                      placeholder="Select vendor"
                      items={vendors?.map((v) => ({
                        id: v.id,
                        label: v.name,
                      })) || []}
                      entityType="vendor"
                      onEntityCreated={() => {
                        // Refetch vendors to update the list
                        utils.vendors.list.invalidate();
                      }}
                      emptyMessage="No vendors available. Create one to continue."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expectedDeliveryDate">Expected Delivery</Label>
                    <Input
                      id="expectedDeliveryDate"
                      type="date"
                      value={formData.expectedDeliveryDate}
                      onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="h-3 w-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  
                  {lineItems.length === 0 ? (
                    <div className="border rounded-md p-4 text-center text-muted-foreground">
                      No items added. Click "Add Item" to add products to this purchase order.
                    </div>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Product</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[80px]">Qty</TableHead>
                            <TableHead className="w-[100px]">Price</TableHead>
                            <TableHead className="w-[100px]">Total</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Select
                                  value={item.productId?.toString() || ""}
                                  onValueChange={(value) => selectProduct(index, value)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products?.map((product) => (
                                      <SelectItem key={product.id} value={product.id.toString()}>
                                        {product.name} - {formatCurrency(product.unitPrice || "0")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  value={item.description}
                                  onChange={(e) => updateLineItem(index, "description", e.target.value)}
                                  placeholder="Description"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {formatCurrency(item.totalAmount)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLineItem(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Totals */}
                {lineItems.length > 0 && (
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span>{formatCurrency(totals.subtotal.toFixed(2))}</span>
                      </div>
                      <div className="flex justify-between font-bold pt-2 border-t">
                        <span>Total:</span>
                        <span>{formatCurrency(totals.total.toFixed(2))}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPO.isPending}>
                  {createPO.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create PO
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search POs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {(vendors || []).map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label htmlFor="po-date-from" className="text-sm text-muted-foreground whitespace-nowrap">
                Ordered
              </Label>
              <Input
                id="po-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
                aria-label="Order date from"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
                aria-label="Order date to"
              />
            </div>
            <Button
              variant={duplicatesOnly ? "default" : "outline"}
              onClick={() => setDuplicatesOnly((v) => !v)}
              aria-pressed={duplicatesOnly}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicates
              {redundantIds.size > 0 && (
                <Badge variant="secondary" className="ml-2 font-mono">
                  {redundantIds.size}
                </Badge>
              )}
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Export CSV
            </Button>
            {(statusFilter !== "all" || vendorFilter !== "all" || dateFrom || dateTo || duplicatesOnly || search) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStatusFilter("all");
                  setVendorFilter("all");
                  setDateFrom("");
                  setDateTo("");
                  setDuplicatesOnly(false);
                  setSearch("");
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Reset filters
              </Button>
            )}
          </div>

          {/* Totals describe the whole filtered set, not the visible page. */}
          {summary && summary.total > 0 && (
            <div className="mt-3 flex items-center gap-4 flex-wrap text-sm">
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground font-mono">{summary.total}</span> PO
                {summary.total === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground">
                Total value{" "}
                <span className="font-medium text-foreground font-mono">{formatCurrency(summary.totalValue)}</span>
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {summary.byStatus.map((b) => (
                  <Badge key={b.status} variant="outline" className={getStatusColor(b.status) || ""}>
                    {b.status}: {b.count} · {formatCurrency(b.value)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {selectedCount > 0 && (
            <div className="mt-3 flex items-center gap-3 flex-wrap rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-sm font-medium">
                {selectedCount} selected
                {selectedVisibleIds.length !== selectedCount && (
                  <span className="font-normal text-muted-foreground">
                    {" "}({selectedVisibleIds.length} on this page)
                  </span>
                )}
              </span>
              {redundantIds.size > 0 && (
                <Button variant="outline" size="sm" onClick={selectDuplicates}>
                  <Copy className="h-4 w-4 mr-2" />
                  Select duplicates only
                </Button>
              )}
              <Select
                value=""
                onValueChange={(status) => {
                  if (status) bulkUpdateStatus.mutate({ ids: selectedAllIds, status: status as any });
                }}
                disabled={bulkUpdateStatus.isPending}
              >
                <SelectTrigger className="w-[170px] h-8">
                  <SelectValue placeholder={bulkUpdateStatus.isPending ? "Updating…" : "Set status…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkDeletePOs.isPending}
              >
                {bulkDeletePOs.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete {selectedCount}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}

          {selectedCount === 0 && redundantIds.size > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {redundantIds.size} duplicate {redundantIds.size === 1 ? "copy" : "copies"} found from repeated
              document imports.{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => {
                  setDuplicatesOnly(true);
                  setStatusFilter("all");
                  setSearch("");
                }}
              >
                Review them
              </button>
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredPOs || filteredPOs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{duplicatesOnly ? "No duplicate purchase orders found" : "No purchase orders found"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                      aria-label="Select all purchase orders in view"
                    />
                  </TableHead>
                  <SortableHead label="PO #" sortKey="poNumber" />
                  <SortableHead label="Vendor Name" sortKey="vendor" />
                  <SortableHead label="Total Amount" sortKey="totalAmount" className="text-right" />
                  <SortableHead label="Status" sortKey="status" />
                  <SortableHead label="Order Date" sortKey="orderDate" />
                  <SortableHead label="Expected Date" sortKey="expectedDate" />
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.map((po) => {
                  // Prefer the server-joined vendor (always present) and only fall
                  // back to the client vendor list, then to the id, so the real
                  // name shows even when the vendor isn't in the loaded list.
                  const vendor = po.vendor ?? vendors?.find((v) => v.id === po.vendorId);
                  // Server join makes po.vendor.name essentially always present; if a
                  // vendor is somehow unresolvable, show a neutral label rather than
                  // leaking a raw "Vendor #<id>".
                  const vendorName = vendor?.name || (po.vendorId ? "Unknown vendor" : "-");
                  return (
                    <TableRow
                      key={po.id}
                      className={`cursor-pointer ${selectedIds.has(po.id) ? "bg-muted/50" : ""}`}
                      data-state={selectedIds.has(po.id) ? "selected" : undefined}
                      onClick={() => setDetailPoId(po.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(po.id)}
                          onCheckedChange={(checked) => toggleRow(po.id, checked === true)}
                          aria-label={`Select purchase order ${po.poNumber}`}
                        />
                      </TableCell>
                      {/* The PO number is a real <button> so keyboard / screen-reader
                          users get a proper control; the row onClick is just a
                          mouse convenience. role/tabIndex on the <tr> itself would
                          break table semantics for assistive tech. */}
                      <TableCell className="font-mono">
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailPoId(po.id);
                          }}
                        >
                          {po.poNumber}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{vendorName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(po.totalAmount)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={po.status}
                          onValueChange={(value) => {
                            if (value === po.status) return;
                            updatePO.mutate({ id: po.id, status: value as any });
                          }}
                          disabled={updatePO.isPending}
                        >
                          <SelectTrigger
                            className={`h-7 w-32 border-0 px-2 ${getStatusColor(po.status) || ""}`}
                          >
                            <SelectValue>{po.status}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="received">Received</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {po.orderDate ? format(new Date(po.orderDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        {po.expectedDate ? format(new Date(po.expectedDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const progress = receiptProgressMap.get(po.id);
                          if (!progress || progress.lineCount === 0) {
                            return <span className="text-muted-foreground">-</span>;
                          }
                          const pct = Math.round(progress.percentReceived);
                          return (
                            <div className="flex items-center gap-2 min-w-[90px]">
                              <div
                                className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"
                                role="progressbar"
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${pct}% received`}
                              >
                                <div
                                  className={`h-full rounded-full ${
                                    progress.isOverReceived
                                      ? "bg-amber-500"
                                      : pct >= 100
                                        ? "bg-emerald-500"
                                        : "bg-primary"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-muted-foreground tabular-nums">
                                {pct}%
                              </span>
                              {progress.isOverReceived && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300">over</Badge>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        {documentCountMap.get(po.id) ? (
                          <Badge variant="outline" className="font-mono">
                            {documentCountMap.get(po.id)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {po.notes || "-"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Chat with ${vendor?.name || "vendor"} on WhatsApp`}
                            onClick={(e) => handleOpenChat(po, vendor, e)}
                            disabled={!vendor || (autoLinkMutation.isPending && (autoLinkMutation.variables as { vendorId: number } | undefined)?.vendorId === vendor?.id)}
                          >
                            {autoLinkMutation.isPending && (autoLinkMutation.variables as { vendorId: number } | undefined)?.vendorId === vendor?.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MessageCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Open actions menu">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {po.status === "draft" && (
                                <DropdownMenuItem
                                  onClick={() => approvePO.mutate({ id: po.id })}
                                  disabled={approvePO.isPending}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve (mark as Sent)
                                </DropdownMenuItem>
                              )}
                              {(po.status === "draft" || po.status === "sent") && (
                                <DropdownMenuItem
                                  onClick={() => sendPOToSupplier.mutate({ poId: po.id })}
                                  disabled={sendPOToSupplier.isPending}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Send to Supplier
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeletePOId(po.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete purchase order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {totalCount > 0 && (
            <div className="flex items-center justify-between gap-4 flex-wrap pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing{" "}
                  <span className="font-mono text-foreground">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)}
                  </span>{" "}
                  of <span className="font-mono text-foreground">{totalCount}</span>
                </span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-[110px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  Page {page + 1} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PO detail drawer */}
      <PurchaseOrderDetailSheet
        poId={detailPoId}
        open={detailPoId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailPoId(null);
            // Drop the ?po=<id> deep-link param on close so the URL stays in sync
            // and the drawer doesn't reopen on refresh / when the link is shared.
            if (new URLSearchParams(locationSearch).has("po")) {
              navigate(window.location.pathname, { replace: true });
            }
          }
        }}
        onChanged={() => utils.purchaseOrders.list.invalidate()}
      />

      {/* Delete PO confirmation */}
      <Dialog open={deletePOId !== null} onOpenChange={(open) => { if (!open) setDeletePOId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete purchase order?</DialogTitle>
            <DialogDescription>
              This will permanently delete the purchase order and all its items. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletePOId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deletePO.isPending}
              onClick={() => { if (deletePOId !== null) deletePO.mutate({ id: deletePOId }); }}
            >
              {deletePO.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) setBulkDeleteOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} purchase order{selectedCount === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the selected purchase orders, their line items, and any
              receiving records and supplier-portal uploads attached to them. Linked shipments,
              payments and source documents are kept and unlinked. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={bulkDeletePOs.isPending || selectedCount === 0}
              onClick={() => bulkDeletePOs.mutate({ ids: selectedAllIds })}
            >
              {bulkDeletePOs.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete {selectedCount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {chatTarget && (
        <WhatsAppDrawer
          open={!!chatTarget}
          onOpenChange={(open) => !open && setChatTarget(null)}
          contactId={chatTarget.contactId}
          whatsappNumber={chatTarget.whatsappNumber}
          contactName={chatTarget.contactName}
          subtitle={chatTarget.subtitle}
        />
      )}

      {linkTarget && (
        <LinkContactDialog
          open={!!linkTarget}
          onOpenChange={(open) => !open && setLinkTarget(null)}
          vendorId={linkTarget.vendorId}
          vendorName={linkTarget.vendorName}
          vendorPhone={linkTarget.vendorPhone}
          onLinked={(contact) => {
            const waNumber = contact.whatsappNumber || contact.phone;
            if (waNumber) {
              setChatTarget({
                contactId: contact.id,
                whatsappNumber: waNumber,
                contactName: contact.fullName || linkTarget.vendorName,
                subtitle: `${linkTarget.vendorName} · PO ${linkTarget.poNumber}`,
              });
            }
            setLinkTarget(null);
          }}
        />
      )}
    </div>
  );
}
