import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ShoppingCart, Calendar, DollarSign, User } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";

function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = parseInt(params.id || "0");

  const { data: order, isLoading } = trpc.orders.get.useQuery({ id: orderId });
  const { data: orderItems } = (trpc as any).orderItems?.list?.useQuery({ orderId }) || { data: [] };
  const { data: products } = trpc.products.list.useQuery();

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "confirmed": return "bg-blue-100 text-blue-800";
      case "processing": return "bg-purple-100 text-purple-800";
      case "shipped": return "bg-indigo-100 text-indigo-800";
      case "delivered": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
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
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-muted-foreground">Order Details</p>
        </div>
        <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
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
              <div className="mt-1">
                <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
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
                {(orderItems || []).map((item: any) => {
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
