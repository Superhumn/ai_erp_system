import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, Package, DollarSign, Calendar,
  Building2, CheckCircle, Send, Truck, Clock,
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
  pending: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-blue-500/10 text-blue-600",
  sent: "bg-purple-500/10 text-purple-600",
  acknowledged: "bg-indigo-500/10 text-indigo-600",
  shipped: "bg-cyan-500/10 text-cyan-600",
  partially_received: "bg-orange-500/10 text-orange-600",
  received: "bg-green-500/10 text-green-600",
  cancelled: "bg-red-500/10 text-red-600",
};

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const poId = parseInt(id || "0");

  const { data: po, isLoading, refetch } = trpc.purchaseOrders.get.useQuery({ id: poId });
  const { data: items } = trpc.purchaseOrders.getItems.useQuery({ purchaseOrderId: poId });
  const { data: vendors } = trpc.vendors.list.useQuery();

  const approvePO = trpc.purchaseOrders.approve.useMutation({
    onSuccess: () => { toast.success("PO approved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updatePO = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => { toast.success("PO updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const sendToSupplier = trpc.purchaseOrders.sendToSupplier.useMutation({
    onSuccess: () => { toast.success("PO sent to supplier"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!po) {
    return (
      <div className="space-y-4">
        <Link href="/operations/purchase-orders">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Purchase order not found.</p>
      </div>
    );
  }

  const vendor = vendors?.find((v) => v.id === po.vendorId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/operations/purchase-orders">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Purchase Orders</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" />
              {po.poNumber || `PO #${po.id}`}
            </h1>
            <p className="text-muted-foreground">Purchase Order</p>
          </div>
          <Badge className={statusColors[po.status || "draft"]}>{po.status}</Badge>
        </div>
        <div className="flex gap-2">
          {po.status === "draft" && (
            <Button variant="outline" onClick={() => approvePO.mutate({ id: poId })} disabled={approvePO.isPending}>
              <CheckCircle className="h-4 w-4 mr-2" />Approve
            </Button>
          )}
          {(po.status === "approved") && (
            <Button variant="outline" onClick={() => sendToSupplier.mutate({ poId })} disabled={sendToSupplier.isPending}>
              <Send className="h-4 w-4 mr-2" />Send to Supplier
            </Button>
          )}
          {po.status !== "received" && po.status !== "cancelled" && (
            <Select value="" onValueChange={(status) => updatePO.mutate({ id: poId, status })}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Update status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shipped">Mark Shipped</SelectItem>
                <SelectItem value="received">Mark Received</SelectItem>
                <SelectItem value="cancelled">Cancel</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendor</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {vendor ? (
              <Link href={`/operations/vendors/${vendor.id}`}>
                <span className="font-semibold text-primary hover:underline cursor-pointer">{vendor.name}</span>
              </Link>
            ) : <span className="font-semibold">-</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Order Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-semibold">
              {po.orderDate ? format(new Date(po.orderDate), "MMM d, yyyy") : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-semibold">
              {po.expectedDate ? format(new Date(po.expectedDate), "MMM d, yyyy") : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(po.totalAmount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
          <CardDescription>{items?.length || 0} items</CardDescription>
        </CardHeader>
        <CardContent>
          {items && items.length > 0 ? (
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
                {items.map((item: any) => (
                  <TableRow key={item.id}>
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

          <div className="mt-4 pt-4 border-t space-y-1 text-right">
            <div className="flex justify-end gap-8">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-sm font-medium w-28">{formatCurrency(po.subtotal)}</span>
            </div>
            {po.taxAmount && parseFloat(String(po.taxAmount)) > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-sm text-muted-foreground">Tax</span>
                <span className="text-sm font-medium w-28">{formatCurrency(po.taxAmount)}</span>
              </div>
            )}
            {po.shippingAmount && parseFloat(String(po.shippingAmount)) > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-sm text-muted-foreground">Shipping</span>
                <span className="text-sm font-medium w-28">{formatCurrency(po.shippingAmount)}</span>
              </div>
            )}
            <div className="flex justify-end gap-8 pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-lg w-28">{formatCurrency(po.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipping Info */}
      {po.shippingAddress && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Shipping Address</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{po.shippingAddress}</p></CardContent>
        </Card>
      )}

      {po.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{po.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
