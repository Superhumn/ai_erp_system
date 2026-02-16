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
import { ClipboardList, Plus, Search, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

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
  const createPO = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase order created successfully");
      setIsOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({ vendorId: 0, expectedDeliveryDate: "", notes: "" });
    setLineItems([]);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      productId: undefined,
      description: "",
      quantity: "1",
      unitPrice: "0",
      totalAmount: "0",
    }]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number | undefined) => {
    const updated = [...lineItems];
    
    if (field === "quantity") {
      let numericValue =
        typeof value === "number"
          ? value
          : parseFloat(value?.toString() ?? "0");

      if (Number.isNaN(numericValue)) {
        numericValue = 0;
      }

      if (numericValue < 0) {
        toast.warning("Quantity cannot be negative. It has been reset to 0.");
        numericValue = 0;
      }

      updated[index] = {
        ...updated[index],
        quantity: numericValue.toString(),
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    // Recalculate total
    const qty = parseFloat(updated[index].quantity) || 0;
    const price = parseFloat(updated[index].unitPrice) || 0;

    updated[index].totalAmount = (qty * price).toFixed(2);
    
    setLineItems(updated);
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products?.find(p => p.id === parseInt(productId));
    if (product) {
      const updated = [...lineItems];
      updated[index] = {
        ...updated[index],
        productId: product.id,
        description: product.name,
        unitPrice: product.unitPrice?.toString() || "0",
      };
      // Recalculate
      const qty = parseFloat(updated[index].quantity) || 0;
      const price = parseFloat(updated[index].unitPrice) || 0;
      updated[index].totalAmount = (qty * price).toFixed(2);
      setLineItems(updated);
    }
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
    return { subtotal, total: subtotal };
  };

  const filteredPOs = purchaseOrders?.filter((po) => {
    const matchesSearch = po.poNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    pending: "bg-amber-500/10 text-amber-600",
    approved: "bg-blue-500/10 text-blue-600",
    ordered: "bg-purple-500/10 text-purple-600",
    partial: "bg-indigo-500/10 text-indigo-600",
    received: "bg-green-500/10 text-green-600",
    cancelled: "bg-red-500/10 text-red-600",
  };

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

  const totals = calculateTotals();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            Purchase Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage vendor orders and track deliveries.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
                <DialogDescription>
                  Create a new purchase order for a vendor.
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
              <p className="text-sm">Create your first PO to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono">{po.poNumber}</TableCell>
                    <TableCell className="font-medium">Vendor #{po.vendorId || "-"}</TableCell>
                    <TableCell>
                      {po.orderDate
                        ? format(new Date(po.orderDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {po.expectedDate
                        ? format(new Date(po.expectedDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(po.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[po.status]}>{po.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
