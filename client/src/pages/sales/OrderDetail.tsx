import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ShoppingCart, Calendar, DollarSign, User, Loader2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { useEffect, useState } from "react";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { toast } from "sonner";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = parseInt(params.id || "0");

  const utils = trpc.useUtils();
  const { data: order, isLoading } = trpc.orders.get.useQuery({ id: orderId });
  const { data: orderItems } = trpc.orderItems.list.useQuery({ orderId });
  const { data: products } = trpc.products.list.useQuery();

  const updateOrderTrpc = trpc.orders.update.useMutation({
    onSuccess: () => {
      utils.orders.get.invalidate({ id: orderId });
      utils.orders.list.invalidate();
    },
  });

  // Track an optimistic local status so the UI updates instantly, even when
  // the request is queued offline. Cleared as soon as the server's value
  // catches up (online refetch or queued replay), otherwise the UI would be
  // stuck on the optimistic value forever.
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  useEffect(() => {
    if (pendingStatus && order?.status === pendingStatus) {
      setPendingStatus(null);
    }
  }, [order?.status, pendingStatus]);

  const updateStatus = useOfflineMutation<{ id: number; status: OrderStatus }>({
    path: "orders.update",
    label: "Order status",
    online: (input) => updateOrderTrpc.mutateAsync(input),
    optimistic: (input) => setPendingStatus(input.status),
  });

  async function handleStatusChange(next: string) {
    if (!ORDER_STATUSES.includes(next as OrderStatus)) return;
    try {
      const result = await updateStatus.mutate({ id: orderId, status: next as OrderStatus });
      if (!result.queued) {
        toast.success(`Order marked as ${next}`);
      }
    } catch (err) {
      setPendingStatus(null);
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">Loading...</div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">Order not found</div>
    );
  }

  const displayStatus = pendingStatus ?? order.status;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
      case "pending": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
      case "confirmed": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "processing": return "bg-violet-500/8 text-violet-600 dark:text-violet-400";
      case "shipped": return "bg-indigo-500/8 text-indigo-600 dark:text-indigo-400";
      case "delivered": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "cancelled": return "bg-red-500/8 text-red-600 dark:text-red-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sales/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{order.orderNumber}</h1>
          <p className="text-muted-foreground">Order Details</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(displayStatus)}>{displayStatus}</Badge>
          {updateStatus.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Order Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Order Number</Label>
              <p className="font-mono">{order.orderNumber}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer
              </Label>
              <p>Customer #{order.customerId || "-"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Order Date
              </Label>
              <p>
                {order.orderDate
                  ? format(new Date(order.orderDate), "MMM d, yyyy")
                  : "-"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1 flex items-center gap-2">
                <Select
                  value={displayStatus || ""}
                  onValueChange={handleStatusChange}
                  disabled={updateStatus.isPending}
                >
                  <SelectTrigger className="w-full sm:w-[180px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {updateStatus.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <Label className="text-muted-foreground">Subtotal</Label>
              <p className="font-mono">{formatCurrency(order.subtotal)}</p>
            </div>
            <div className="flex justify-between">
              <Label className="text-muted-foreground">Tax</Label>
              <p className="font-mono">{formatCurrency(order.taxAmount)}</p>
            </div>
            <div className="flex justify-between">
              <Label className="text-muted-foreground">Shipping</Label>
              <p className="font-mono">{formatCurrency(order.shippingAmount)}</p>
            </div>
            <div className="flex justify-between">
              <Label className="text-muted-foreground">Discount</Label>
              <p className="font-mono">{formatCurrency(order.discountAmount)}</p>
            </div>
            <div className="pt-4 border-t flex justify-between font-bold">
              <Label>Total Amount</Label>
              <p className="font-mono">{formatCurrency(order.totalAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
          <CardDescription>
            {orderItems?.length || 0} item(s) in this order
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orderItems && orderItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderItems.map((item) => {
                  const product = products?.find(p => p.id === item.productId);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {product?.name || `Product #${item.productId}`}
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency((parseFloat(item.quantity?.toString() || "0") * parseFloat(item.unitPrice?.toString() || "0")).toString())}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No items in this order</p>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
