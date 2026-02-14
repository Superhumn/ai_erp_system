import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, ShoppingCart, Package, Truck,
  Calendar, DollarSign, User, MapPin,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  confirmed: "bg-blue-500/10 text-blue-600",
  processing: "bg-yellow-500/10 text-yellow-700",
  shipped: "bg-purple-500/10 text-purple-600",
  delivered: "bg-green-500/10 text-green-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id || "0");
  const [newStatus, setNewStatus] = useState<string>("");

  const { data: order, isLoading, refetch } = trpc.orders.get.useQuery({ id: orderId });
  const { data: customers } = trpc.customers.list.useQuery();

  const updateOrder = trpc.orders.update.useMutation({
    onSuccess: () => {
      toast.success("Order updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/sales/orders">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Order not found.</p>
      </div>
    );
  }

  const customer = customers?.find((c) => c.id === order.customerId);

  const handleStatusUpdate = (status: string) => {
    updateOrder.mutate({ id: orderId, status });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/sales/orders">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Orders</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              {order.orderNumber || `Order #${order.id}`}
            </h1>
            <p className="text-muted-foreground">
              {order.type === "sales" ? "Sales Order" : "Purchase Order"}
            </p>
          </div>
          <Badge className={statusColors[order.status || "draft"]}>{order.status}</Badge>
        </div>
        <div className="flex gap-2 items-center">
          <Select value="" onValueChange={handleStatusUpdate}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Update status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confirmed">Confirm</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Order Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {customer ? (
              <Link href={`/sales/customers/${customer.id}`}>
                <span className="text-lg font-semibold text-primary hover:underline cursor-pointer">{customer.name}</span>
              </Link>
            ) : (
              <span className="text-lg font-semibold">-</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Order Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(order.totalAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{order.items?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Addresses */}
        <Card>
          <CardHeader><CardTitle className="text-base">Shipping & Billing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {order.shippingAddress && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Shipping Address</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">{order.shippingAddress}</p>
              </div>
            )}
            {order.billingAddress && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Billing Address</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">{order.billingAddress}</p>
              </div>
            )}
            {order.notes && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            {order.items && order.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.description || item.productName || "-"}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No line items.</p>
            )}

            {/* Totals */}
            <div className="mt-4 pt-4 border-t space-y-1 text-right">
              <div className="flex justify-end gap-8">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-sm font-medium w-24">{formatCurrency(order.subtotal)}</span>
              </div>
              {order.taxAmount && parseFloat(String(order.taxAmount)) > 0 && (
                <div className="flex justify-end gap-8">
                  <span className="text-sm text-muted-foreground">Tax</span>
                  <span className="text-sm font-medium w-24">{formatCurrency(order.taxAmount)}</span>
                </div>
              )}
              {order.shippingAmount && parseFloat(String(order.shippingAmount)) > 0 && (
                <div className="flex justify-end gap-8">
                  <span className="text-sm text-muted-foreground">Shipping</span>
                  <span className="text-sm font-medium w-24">{formatCurrency(order.shippingAmount)}</span>
                </div>
              )}
              {order.discountAmount && parseFloat(String(order.discountAmount)) > 0 && (
                <div className="flex justify-end gap-8">
                  <span className="text-sm text-muted-foreground">Discount</span>
                  <span className="text-sm font-medium w-24 text-red-600">-{formatCurrency(order.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-end gap-8 pt-2 border-t">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg w-24">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
