import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Printer,
  FileText,
  Download,
  Eye,
  Plus,
  Trash2,
  Pencil,
  CheckCircle,
  Send,
  PackageCheck,
  X,
  Building2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { getStatusColor } from "@/lib/statusColors";
import { printPurchaseOrder } from "./printPurchaseOrder";

type EditItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  productId?: number | null;
};

const STATUS_OPTIONS = ["draft", "sent", "confirmed", "partial", "received", "cancelled"] as const;

function toDateInput(v: unknown): string {
  if (!v) return "";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function PurchaseOrderDetailSheet({
  poId,
  open,
  onOpenChange,
  onChanged,
}: {
  poId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: po, isLoading, refetch } = trpc.purchaseOrders.get.useQuery(
    { id: poId as number },
    { enabled: open && poId != null },
  );
  const { data: documents, isLoading: docsLoading } = trpc.purchaseOrders.documents.useQuery(
    { purchaseOrderId: poId as number },
    { enabled: open && poId != null },
  );
  const { data: products } = trpc.products.list.useQuery(undefined, { enabled: open });

  const [mode, setMode] = useState<"view" | "edit" | "receive">("view");
  const [header, setHeader] = useState({ expectedDate: "", shippingAddress: "", notes: "" });
  const [items, setItems] = useState<EditItem[]>([]);
  const [receipts, setReceipts] = useState<Record<number, string>>({});

  // Reset transient edit state whenever a different PO is opened.
  useEffect(() => {
    setMode("view");
  }, [poId]);

  useEffect(() => {
    if (po && mode === "edit") {
      setHeader({
        expectedDate: toDateInput(po.expectedDate),
        shippingAddress: po.shippingAddress || "",
        notes: po.notes || "",
      });
      setItems(
        (po.items || []).map((it: any) => ({
          description: it.description || "",
          quantity: String(it.quantity ?? "1"),
          unitPrice: String(it.unitPrice ?? "0"),
          totalAmount: String(it.totalAmount ?? "0"),
          productId: it.productId ?? null,
        })),
      );
    }
    if (po && mode === "receive") {
      const seed: Record<number, string> = {};
      for (const it of po.items || []) seed[it.id] = String(it.receivedQuantity ?? it.quantity ?? "0");
      setReceipts(seed);
    }
  }, [po, mode]);

  const invalidate = () => {
    refetch();
    utils.purchaseOrders.list.invalidate();
    onChanged?.();
  };

  const updatePO = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Purchase order updated");
      setMode("view");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateItems = trpc.purchaseOrders.updateItems.useMutation({
    onSuccess: () => {
      toast.success("Line items saved");
      setMode("view");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const receiveItems = trpc.purchaseOrders.receiveItems.useMutation({
    onSuccess: (r) => {
      toast.success(r.status ? `Receipt recorded — PO marked ${r.status}` : "Receipt recorded");
      setMode("view");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const approvePO = trpc.purchaseOrders.approve.useMutation({
    onSuccess: () => {
      toast.success("Approved and emailed to vendor");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const sendToSupplier = trpc.purchaseOrders.sendToSupplier.useMutation({
    onSuccess: () => {
      toast.success("Sent to supplier");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const editTotals = useMemo(() => {
    const subtotal = items.reduce(
      (s, it) => s + (parseFloat(it.quantity || "0") * parseFloat(it.unitPrice || "0") || 0),
      0,
    );
    return { subtotal };
  }, [items]);

  if (!open) return null;

  const vendor = (po as any)?.vendor as
    | { id: number; name: string; contactName?: string; email?: string; phone?: string; address?: string; city?: string; state?: string; country?: string; postalCode?: string }
    | null
    | undefined;

  const isDraft = po?.status === "draft";

  // ---- edit helpers ----
  const addItem = () => setItems((p) => [...p, { description: "", quantity: "1", unitPrice: "0", totalAmount: "0", productId: null }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof EditItem, value: string) => {
    setItems((p) =>
      p.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, [field]: value } as EditItem;
        if (field === "quantity" || field === "unitPrice") {
          const q = parseFloat(field === "quantity" ? value : it.quantity) || 0;
          const u = parseFloat(field === "unitPrice" ? value : it.unitPrice) || 0;
          next.totalAmount = (q * u).toFixed(2);
        }
        return next;
      }),
    );
  };
  const pickProduct = (i: number, productIdStr: string) => {
    const id = parseInt(productIdStr);
    const product = products?.find((p: any) => p.id === id);
    setItems((p) =>
      p.map((it, idx) => {
        if (idx !== i) return it;
        const unitPrice = product?.unitPrice || it.unitPrice || "0";
        const q = it.quantity || "1";
        return {
          ...it,
          productId: id,
          description: product?.name || it.description,
          unitPrice,
          totalAmount: (parseFloat(q) * parseFloat(unitPrice)).toFixed(2),
        };
      }),
    );
  };

  const saveItems = () => {
    const bad = items.findIndex(
      (it) => !it.description.trim() || !(parseFloat(it.quantity) > 0) || !(parseFloat(it.unitPrice) >= 0),
    );
    if (bad !== -1) {
      toast.error(`Line item #${bad + 1} needs a description, a quantity > 0, and a valid price.`);
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }
    updateItems.mutate({
      id: po!.id,
      items: items.map((it) => ({
        productId: it.productId ?? undefined,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalAmount: it.totalAmount,
      })),
    });
  };

  const saveHeader = () => {
    updatePO.mutate({
      id: po!.id,
      expectedDate: header.expectedDate ? new Date(header.expectedDate) : null,
      shippingAddress: header.shippingAddress || undefined,
      notes: header.notes || undefined,
    });
  };

  const saveReceipts = () => {
    const payload = Object.entries(receipts)
      .map(([id, q]) => ({ purchaseOrderItemId: Number(id), receivedQuantity: q || "0" }))
      .filter((r) => Number.isFinite(r.purchaseOrderItemId));
    if (payload.length === 0) return;
    receiveItems.mutate({ id: po!.id, items: payload });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="border-b">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5" />
                <span className="font-mono">{po?.poNumber || "Purchase Order"}</span>
                {po?.status && (
                  <Badge variant="outline" className={getStatusColor(po.status) || ""}>
                    {po.status}
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription>
                {vendor?.name ? `${vendor.name}` : "Purchase order details"}
              </SheetDescription>
            </div>
            {po && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => printPurchaseOrder(po as any, vendor, (po.items as any) || [])}
              >
                <Printer className="h-4 w-4 mr-2" />
                View / Print PO
              </Button>
            )}
          </div>
        </SheetHeader>

        {isLoading || !po ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Action bar */}
            {mode === "view" && (
              <div className="flex flex-wrap gap-2 p-4 border-b bg-muted/30">
                {po.status === "draft" && (
                  <Button size="sm" onClick={() => approvePO.mutate({ id: po.id })} disabled={approvePO.isPending}>
                    {approvePO.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Approve &amp; email
                  </Button>
                )}
                {(po.status === "draft" || po.status === "sent") && (
                  <Button size="sm" variant="outline" onClick={() => sendToSupplier.mutate({ poId: po.id })} disabled={sendToSupplier.isPending}>
                    {sendToSupplier.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Send to supplier
                  </Button>
                )}
                {isDraft && (
                  <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
                {po.status !== "draft" && po.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => setMode("receive")}>
                    <PackageCheck className="h-4 w-4 mr-2" />
                    Receive
                  </Button>
                )}
                <div className="ml-auto">
                  <Select
                    value={po.status}
                    onValueChange={(v) => {
                      if (v !== po.status) updatePO.mutate({ id: po.id, status: v as any });
                    }}
                    disabled={updatePO.isPending}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue>{po.status}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {mode === "edit" ? (
              <EditView
                header={header}
                setHeader={setHeader}
                items={items}
                products={products}
                addItem={addItem}
                removeItem={removeItem}
                updateItem={updateItem}
                pickProduct={pickProduct}
                subtotal={editTotals.subtotal}
                onCancel={() => setMode("view")}
                onSaveHeader={saveHeader}
                onSaveItems={saveItems}
                savingHeader={updatePO.isPending}
                savingItems={updateItems.isPending}
              />
            ) : mode === "receive" ? (
              <ReceiveView
                po={po}
                receipts={receipts}
                setReceipts={setReceipts}
                onCancel={() => setMode("view")}
                onSave={saveReceipts}
                saving={receiveItems.isPending}
              />
            ) : (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="mx-4 mt-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="items">Line items ({po.items?.length ?? 0})</TabsTrigger>
                  <TabsTrigger value="documents">Documents ({documents?.length ?? 0})</TabsTrigger>
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="p-4 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoBlock icon={<Building2 className="h-4 w-4" />} title="Vendor">
                      <div className="font-medium">{vendor?.name || "—"}</div>
                      {vendor?.contactName && <div className="text-muted-foreground">{vendor.contactName}</div>}
                      {vendor?.email && <div className="text-muted-foreground">{vendor.email}</div>}
                      {vendor?.phone && <div className="text-muted-foreground">{vendor.phone}</div>}
                      {vendor?.address && (
                        <div className="text-muted-foreground">
                          {[vendor.address, [vendor.city, vendor.state, vendor.postalCode].filter(Boolean).join(", "), vendor.country]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </InfoBlock>
                    <InfoBlock icon={<Truck className="h-4 w-4" />} title="Ship to">
                      <div className="whitespace-pre-line text-muted-foreground">{po.shippingAddress || "—"}</div>
                    </InfoBlock>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <Field label="Order date" value={po.orderDate ? format(new Date(po.orderDate), "MMM d, yyyy") : "—"} />
                    <Field label="Expected" value={po.expectedDate ? format(new Date(po.expectedDate), "MMM d, yyyy") : "—"} />
                    <Field label="Received" value={po.receivedDate ? format(new Date(po.receivedDate), "MMM d, yyyy") : "—"} />
                    <Field label="Created by" value={(po as any).createdByName || "—"} />
                    <Field label="Approved by" value={(po as any).approvedByName || "—"} />
                    <Field label="Currency" value={po.currency || "USD"} />
                  </div>

                  <Separator />

                  <div className="space-y-1.5 text-sm max-w-xs ml-auto">
                    <Row label="Subtotal" value={formatCurrency(po.subtotal)} />
                    <Row label="Tax" value={formatCurrency(po.taxAmount)} />
                    <Row label="Shipping" value={formatCurrency(po.shippingAmount)} />
                    <div className="flex justify-between border-t pt-2 font-bold text-base">
                      <span>Total</span>
                      <span>{formatCurrency(po.totalAmount)}</span>
                    </div>
                  </div>

                  {po.notes && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
                        <p className="text-sm whitespace-pre-line">{po.notes}</p>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Line items */}
                <TabsContent value="items" className="p-4">
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Unit price</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(po.items || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No line items on this PO.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (po.items as any[]).map((it) => (
                            <TableRow key={it.id}>
                              <TableCell>
                                <div className="font-medium">{it.description}</div>
                                {it.rawMaterial?.name && (
                                  <div className="text-xs text-muted-foreground">↳ {it.rawMaterial.name}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{it.quantity}</TableCell>
                              <TableCell className="text-right">{it.receivedQuantity ?? "0"}</TableCell>
                              <TableCell className="text-right">{formatCurrency(it.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(it.totalAmount)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Documents */}
                <TabsContent value="documents" className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    The original PO document (printable), plus invoices, packing lists and other files linked to this order.
                  </p>
                  <div className="border rounded-md p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Purchase Order {po.poNumber}</div>
                        <div className="text-xs text-muted-foreground">Generated document · this order</div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => printPurchaseOrder(po as any, vendor, (po.items as any) || [])}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </div>

                  {docsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (documents || []).length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
                      No vendor documents linked yet. Files uploaded via the supplier portal or parsed from vendor emails appear here.
                    </div>
                  ) : (
                    (documents || []).map((d) => (
                      <div key={d.id} className="border rounded-md p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{d.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {String(d.kind).replace(/_/g, " ")}
                              {d.date ? ` · ${format(new Date(d.date), "MMM d, yyyy")}` : ""}
                              {d.status ? ` · ${d.status}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {d.viewUrl ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={d.viewUrl} target="_blank" rel="noreferrer">
                                <Eye className="h-4 w-4 mr-1" /> View
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">No file stored</span>
                          )}
                          {d.downloadUrl && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={d.downloadUrl} target="_blank" rel="noreferrer" download>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EditView({
  header,
  setHeader,
  items,
  products,
  addItem,
  removeItem,
  updateItem,
  pickProduct,
  subtotal,
  onCancel,
  onSaveHeader,
  onSaveItems,
  savingHeader,
  savingItems,
}: {
  header: { expectedDate: string; shippingAddress: string; notes: string };
  setHeader: (h: { expectedDate: string; shippingAddress: string; notes: string }) => void;
  items: EditItem[];
  products: any[] | undefined;
  addItem: () => void;
  removeItem: (i: number) => void;
  updateItem: (i: number, field: keyof EditItem, value: string) => void;
  pickProduct: (i: number, v: string) => void;
  subtotal: number;
  onCancel: () => void;
  onSaveHeader: () => void;
  onSaveItems: () => void;
  savingHeader: boolean;
  savingItems: boolean;
}) {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Edit draft</h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Expected delivery</Label>
            <Input
              type="date"
              value={header.expectedDate}
              onChange={(e) => setHeader({ ...header, expectedDate: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Ship to</Label>
          <Textarea
            rows={2}
            value={header.shippingAddress}
            onChange={(e) => setHeader({ ...header, shippingAddress: e.target.value })}
            placeholder="Shipping address"
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
        </div>
        <Button size="sm" variant="secondary" onClick={onSaveHeader} disabled={savingHeader}>
          {savingHeader && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save details
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Line items</Label>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-3 w-3 mr-1" /> Add item
          </Button>
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Product</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[70px]">Qty</TableHead>
                <TableHead className="w-[90px]">Price</TableHead>
                <TableHead className="w-[90px]">Total</TableHead>
                <TableHead className="w-[36px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No items. Click "Add item".
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Select value={it.productId?.toString() || ""} onValueChange={(v) => pickProduct(i, v)}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Description" />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" type="number" min="0" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{formatCurrency(it.totalAmount)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-muted-foreground">
            Subtotal: <span className="font-medium text-foreground">{formatCurrency(subtotal.toFixed(2))}</span>
          </div>
          <Button size="sm" onClick={onSaveItems} disabled={savingItems}>
            {savingItems && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save line items
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReceiveView({
  po,
  receipts,
  setReceipts,
  onCancel,
  onSave,
  saving,
}: {
  po: any;
  receipts: Record<number, string>;
  setReceipts: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Receive items</h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter the quantity received for each line. The PO is marked <strong>partial</strong> or <strong>received</strong> automatically.
      </p>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="w-[120px] text-right">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(po.items as any[]).map((it) => (
              <TableRow key={it.id}>
                <TableCell>{it.description}</TableCell>
                <TableCell className="text-right">{it.quantity}</TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right"
                    type="number"
                    min="0"
                    value={receipts[it.id] ?? ""}
                    onChange={(e) => setReceipts((prev) => ({ ...prev, [it.id]: e.target.value }))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <PackageCheck className="h-4 w-4 mr-2" />
          Record receipt
        </Button>
      </div>
    </div>
  );
}
