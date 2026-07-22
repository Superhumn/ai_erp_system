import { useState } from "react";
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
import { ClipboardList, Plus, Search, Loader2, Sparkles, Send, Trash2, MoreHorizontal, CheckCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { getStatusColor } from "@/lib/statusColors";
import WhatsAppDrawer from "@/components/WhatsAppDrawer";
import LinkContactDialog from "@/components/LinkContactDialog";
import PurchaseOrderDetailSheet from "./PurchaseOrderDetailSheet";

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

  const { data: purchaseOrders, isLoading, refetch } = trpc.purchaseOrders.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const utils = trpc.useUtils();

  const poIds = (purchaseOrders || []).map((po) => po.id);
  const { data: invoiceCounts } = trpc.purchaseOrders.parsedInvoiceCounts.useQuery(
    { purchaseOrderIds: poIds },
    { enabled: poIds.length > 0 }
  );
  const invoiceCountMap = new Map<number, number>(
    (invoiceCounts || []).map((c) => [c.purchaseOrderId, c.count])
  );

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
      utils.purchaseOrders.list.invalidate();
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
      utils.purchaseOrders.list.invalidate();
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
      utils.purchaseOrders.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updatePO = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Purchase order updated");
      utils.purchaseOrders.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const approvePO = trpc.purchaseOrders.approve.useMutation({
    onSuccess: () => {
      toast.success("Purchase order approved");
      utils.purchaseOrders.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const sendPOToSupplier = trpc.purchaseOrders.sendToSupplier.useMutation({
    onSuccess: () => {
      toast.success("PO sent to supplier");
      utils.purchaseOrders.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const filteredPOs = purchaseOrders?.filter((po) => {
    const matchesSearch = po.poNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
                        <p className="text-xs text-amber-600">
                          ⚠️ Default vendor suggested. Material not found in inventory.
                        </p>
                      )}
                      {poPreview.isPriceEstimated && (
                        <p className="text-xs text-amber-600">
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
                  className="bg-green-600 hover:bg-green-700"
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
                                  <Trash2 className="h-4 w-4 text-red-500" />
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
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredPOs || filteredPOs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No purchase orders found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected Date</TableHead>
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
                  const vendor = (po as any).vendor || vendors?.find((v) => v.id === po.vendorId);
                  const vendorName = vendor?.name || (po.vendorId ? `Vendor #${po.vendorId}` : "-");
                  return (
                    <TableRow
                      key={po.id}
                      className="cursor-pointer"
                      onClick={() => setDetailPoId(po.id)}
                    >
                      <TableCell className="font-mono text-primary underline-offset-2 hover:underline">
                        {po.poNumber}
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
                      <TableCell className="text-right">
                        {invoiceCountMap.get(po.id) ? (
                          <Badge variant="outline" className="font-mono">
                            {invoiceCountMap.get(po.id)}
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
                              <MessageCircle className="h-4 w-4 text-muted-foreground hover:text-green-600" />
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
        </CardContent>
      </Card>

      {/* PO detail drawer */}
      <PurchaseOrderDetailSheet
        poId={detailPoId}
        open={detailPoId !== null}
        onOpenChange={(open) => { if (!open) setDetailPoId(null); }}
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
