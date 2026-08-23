import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User, Mail, Phone, Building2, MapPin, Calendar, Pencil, Loader2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const customerId = parseInt(params.id || "0");

  const utils = trpc.useUtils();
  const { data: customer, isLoading } = trpc.customers.get.useQuery({ id: customerId });
  const { data: orders } = trpc.orders.list.useQuery({ customerId });

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "active",
    address: "",
    city: "",
    state: "",
    country: "",
    creditLimit: "",
    paymentTerms: "",
    notes: "",
  });

  const updateCustomer = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Customer updated");
      utils.customers.get.invalidate({ id: customerId });
      setEditOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEdit = () => {
    if (!customer) return;
    setForm({
      name: customer.name ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      status: (customer.status as string) || "active",
      address: customer.address ?? "",
      city: customer.city ?? "",
      state: customer.state ?? "",
      country: customer.country ?? "",
      creditLimit: customer.creditLimit != null ? String(customer.creditLimit) : "",
      paymentTerms: customer.paymentTerms != null ? String(customer.paymentTerms) : "",
      notes: customer.notes ?? "",
    });
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    updateCustomer.mutate({
      id: customerId,
      name: form.name.trim(),
      email: form.email || undefined,
      phone: form.phone || undefined,
      status: form.status as "active" | "inactive" | "prospect",
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      creditLimit: form.creditLimit || undefined,
      paymentTerms: form.paymentTerms ? Number(form.paymentTerms) : undefined,
      notes: form.notes || undefined,
    });
  };

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
      case "active": return "bg-muted text-foreground";
      case "inactive": return "bg-muted text-muted-foreground";
      case "suspended": return "bg-[oklch(0.30_0.02_262)] text-white";
      case "pending": return "bg-muted text-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "pending": return "bg-muted text-foreground";
      case "confirmed": return "bg-primary/10 text-primary";
      case "processing": return "bg-primary/10 text-primary";
      case "shipped": return "bg-primary/10 text-primary";
      case "delivered": return "bg-muted text-foreground";
      case "cancelled": return "bg-[oklch(0.30_0.02_262)] text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getSourceBadge = (customer: any) => {
    if (!customer.syncSource) return null;
    const colors: Record<string, string> = {
      quickbooks: "bg-muted text-foreground",
      shopify: "bg-muted text-foreground",
    };
    return (
      <Badge className={colors[customer.syncSource] || "bg-muted text-muted-foreground"}>
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
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="w-4 h-4 mr-2" /> Edit
        </Button>
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

      {/* Edit Customer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Update this customer's details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Credit limit</Label>
                <Input value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
              </div>
              <div>
                <Label>Payment terms (days)</Label>
                <Input
                  type="number"
                  value={form.paymentTerms}
                  onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateCustomer.isPending}>
              {updateCustomer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
