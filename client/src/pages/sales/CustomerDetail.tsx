import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User, Mail, Phone, Building2, MapPin, Calendar } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const customerId = parseInt(params.id || "0");

  const { data: customer, isLoading } = trpc.customers.get.useQuery({ id: customerId });
  const { data: orders } = trpc.orders.list.useQuery({ customerId });

  if (isLoading) {
    return (
      <div className="p-6">Loading...</div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">Customer not found</div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "inactive": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
      case "suspended": return "bg-red-500/8 text-red-600 dark:text-red-400";
      case "pending": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const getOrderStatusColor = (status: string) => {
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

  const getSourceBadge = (customer: any) => {
    if (!customer.syncSource) return null;
    const colors: Record<string, string> = {
      quickbooks: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
      shopify: "bg-teal-500/8 text-teal-600 dark:text-teal-400",
    };
    return (
      <Badge className={colors[customer.syncSource] || "bg-gray-500/8 text-gray-600 dark:text-gray-400"}>
        {customer.syncSource}
      </Badge>
    );
  };

  const totalOrderValue = orders?.reduce((sum, order) => 
    sum + parseFloat(order.totalAmount?.toString() || "0"), 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sales/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{customer.name}</h1>
          <p className="text-muted-foreground">{customer.email || "No email"}</p>
        </div>
        <Badge className={getStatusColor(customer.status)}>{customer.status}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Name</Label>
              <p className="font-medium">{customer.name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <p>{customer.email || "-"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone
              </Label>
              <p>{customer.phone || "-"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Type
              </Label>
              <p className="capitalize">{customer.type}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge className={getStatusColor(customer.status)}>{customer.status}</Badge>
              </div>
            </div>
            {customer.syncSource && (
              <div>
                <Label className="text-muted-foreground">Source</Label>
                <div className="mt-1">
                  {getSourceBadge(customer)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Address & Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Address & Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.address && (
              <div>
                <Label className="text-muted-foreground">Address</Label>
                <p className="whitespace-pre-wrap">{customer.address}</p>
              </div>
            )}
            {customer.city && (
              <div>
                <Label className="text-muted-foreground">City</Label>
                <p>{customer.city}</p>
              </div>
            )}
            {customer.state && (
              <div>
                <Label className="text-muted-foreground">State</Label>
                <p>{customer.state}</p>
              </div>
            )}
            {customer.postalCode && (
              <div>
                <Label className="text-muted-foreground">Postal Code</Label>
                <p>{customer.postalCode}</p>
              </div>
            )}
            {customer.country && (
              <div>
                <Label className="text-muted-foreground">Country</Label>
                <p>{customer.country}</p>
              </div>
            )}
            {customer.lastSyncedAt && (
              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Last Synced
                </Label>
                <p className="text-sm">
                  {new Date(customer.lastSyncedAt).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            {orders?.length || 0} order(s) • Total value: {formatCurrency(totalOrderValue.toString())}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders && orders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">{order.orderNumber}</TableCell>
                    <TableCell>
                      {order.orderDate
                        ? format(new Date(order.orderDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(order.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getOrderStatusColor(order.status)}>{order.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No orders yet</p>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
