import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { ShoppingCart, Plus, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/format";

const orderStatusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
  { value: "pending", label: "Pending", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "processing", label: "Processing", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "shipped", label: "Shipped", color: "bg-indigo-500/8 text-indigo-600 dark:text-indigo-400" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
];

function OrderSummaryBody({ order }: { order: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Customer</div>
          <div className="font-medium">{order._customerName || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Order Date</div>
          <div className="font-medium">
            {order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Items</div>
          <div className="font-medium">{order._itemCount ?? "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Total</div>
          <div className="font-semibold font-mono">{formatCurrency(order.totalAmount)}</div>
        </div>
      </div>

      <div className="rounded-lg border p-3 text-sm space-y-1.5">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-mono">{formatCurrency(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax</span>
          <span className="font-mono">{formatCurrency(order.taxAmount)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Shipping</span>
          <span className="font-mono">{formatCurrency(order.shippingAmount)}</span>
        </div>
        {order.discountAmount && parseFloat(order.discountAmount) !== 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Discount</span>
            <span className="font-mono">-{formatCurrency(order.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1.5 border-t font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatCurrency(order.totalAmount)}</span>
        </div>
      </div>

      {order.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {order.notes}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<number | string>>(new Set());
  const [formData, setFormData] = useState({
    customerId: 0,
    subtotal: "",
    tax: "",
    total: "",
  });
  const [newCustomerName, setNewCustomerName] = useState("");

  const utils = trpc.useUtils();
  const { data: orders, isLoading } = trpc.orders.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const createCustomer = trpc.customers.create.useMutation();

  const bulkDeleteOrders = trpc.orders.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} order(s)`);
      setSelectedOrders(new Set());
      utils.orders.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: () => {
      toast.success("Order created successfully");
      setIsOpen(false);
      setFormData({ customerId: 0, subtotal: "", tax: "", total: "" });
      setNewCustomerName("");
      utils.orders.list.invalidate();
      utils.customers.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Enrich orders for dense display: resolve customer name and item count.
  const customerById = useMemo(() => {
    const map = new Map<number, string>();
    (customers || []).forEach((c: any) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const enrichedOrders = useMemo(
    () =>
      (orders || []).map((o: any) => ({
        ...o,
        _customerName: o.customerId
          ? customerById.get(o.customerId) || `Customer #${o.customerId}`
          : "—",
        _itemCount: o.items?.length ?? o.itemCount ?? null,
      })),
    [orders, customerById],
  );

  // Dense column set: most fields visible at a glance.
  const columns: Column<any>[] = [
    { key: "orderNumber", header: "Order #", type: "text", sortable: true },
    { key: "_customerName", header: "Customer", type: "text", sortable: true },
    { key: "orderDate", header: "Date", type: "date", sortable: true },
    { key: "status", header: "Status", type: "status", options: orderStatusOptions, filterable: true },
    { key: "_itemCount", header: "Items", type: "number", sortable: true },
    { key: "subtotal", header: "Subtotal", type: "currency", sortable: true },
    { key: "taxAmount", header: "Tax", type: "currency" },
    { key: "shippingAmount", header: "Shipping", type: "currency" },
    { key: "discountAmount", header: "Discount", type: "currency" },
    { key: "totalAmount", header: "Total", type: "currency", sortable: true },
    {
      key: "notes",
      header: "Notes",
      type: "text",
      render: (_row, val) => {
        const s = typeof val === "string" ? val : "";
        return s.length > 40 ? s.slice(0, 40) + "…" : s || "—";
      },
    },
  ];

  const bulkActions = [
    { key: "delete", label: "Delete", variant: "destructive" as const },
  ];

  const handleBulkAction = (action: string, ids: Set<number | string>) => {
    if (action === "delete") {
      bulkDeleteOrders.mutate({ ids: Array.from(ids).map((id) => Number(id)) });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let customerId = formData.customerId;
    if (!customerId && newCustomerName.trim()) {
      try {
        const newCust = await createCustomer.mutateAsync({ name: newCustomerName.trim() });
        customerId = newCust.id;
      } catch (err: any) {
        toast.error("Failed to create customer: " + err.message);
        return;
      }
    }
    createOrder.mutate({
      customerId: customerId || undefined,
      orderDate: new Date(),
      subtotal: formData.subtotal,
      taxAmount: formData.tax || "0",
      totalAmount: formData.total,
    });
  };

  const selectedStatus = selectedOrder
    ? orderStatusOptions.find((s) => s.value === selectedOrder.status)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingCart className="h-8 w-8" />
            Sales Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customer orders — click any row for a summary, or open the full page.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Order
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Order</DialogTitle>
                <DialogDescription>Create a new sales order.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer</Label>
                  {customers && customers.length > 0 ? (
                    <Select
                      value={formData.customerId.toString()}
                      onValueChange={(value) => setFormData({ ...formData, customerId: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Enter customer name to create"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        No customers yet — type a name and it will be created with the order
                      </p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subtotal">Subtotal</Label>
                    <Input
                      id="subtotal"
                      type="number"
                      step="0.01"
                      value={formData.subtotal}
                      onChange={(e) => {
                        const subtotal = e.target.value;
                        const tax = parseFloat(formData.tax) || 0;
                        const total = (parseFloat(subtotal) || 0) + tax;
                        setFormData({ ...formData, subtotal, total: total.toFixed(2) });
                      }}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax">Tax</Label>
                    <Input
                      id="tax"
                      type="number"
                      step="0.01"
                      value={formData.tax}
                      onChange={(e) => {
                        const tax = e.target.value;
                        const subtotal = parseFloat(formData.subtotal) || 0;
                        const total = subtotal + (parseFloat(tax) || 0);
                        setFormData({ ...formData, tax, total: total.toFixed(2) });
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="total">Total</Label>
                    <Input
                      id="total"
                      type="number"
                      step="0.01"
                      value={formData.total}
                      onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createOrder.isPending}>
                  {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Order
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={enrichedOrders}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No orders yet — create your first order to get started."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedOrder(row)}
            expandedRowId={selectedOrder?.id ?? null}
            selectedRows={selectedOrders}
            onSelectionChange={setSelectedOrders}
            bulkActions={bulkActions}
            onBulkAction={handleBulkAction}
            compact
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedOrder}
        onOpenChange={(o) => !o && setSelectedOrder(null)}
        width="md"
        title={
          selectedOrder && (
            <span className="flex items-center gap-2 font-mono">
              {selectedOrder.orderNumber}
              {selectedStatus && (
                <Badge className={selectedStatus.color}>{selectedStatus.label}</Badge>
              )}
            </span>
          )
        }
        subtitle={selectedOrder?._customerName}
        actions={
          selectedOrder && (
            <Link href={`/sales/orders/${selectedOrder.id}`}>
              <Button size="sm" variant="outline">
                Open full page
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </Link>
          )
        }
      >
        {selectedOrder && <OrderSummaryBody order={selectedOrder} />}
      </DetailSheet>
    </div>
  );
}
