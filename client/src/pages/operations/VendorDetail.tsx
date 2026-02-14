import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Loader2, Mail, Phone, MapPin, Building2,
  Package, DollarSign, Clock, Edit, Save, X, Truck,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  inactive: "bg-gray-500/10 text-gray-600",
  suspended: "bg-red-500/10 text-red-600",
};

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const vendorId = parseInt(id || "0");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const { data: vendor, isLoading, refetch } = trpc.vendors.get.useQuery({ id: vendorId });
  const { data: purchaseOrders } = trpc.purchaseOrders.list.useQuery({ vendorId });

  const updateVendor = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated");
      setIsEditing(false);
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

  if (!vendor) {
    return (
      <div className="space-y-4">
        <Link href="/operations/vendors">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Vendor not found.</p>
      </div>
    );
  }

  const startEditing = () => {
    setEditForm({
      name: vendor.name || "",
      contactName: vendor.contactName || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      status: vendor.status || "active",
      paymentTerms: vendor.paymentTerms || "",
      defaultLeadTimeDays: vendor.defaultLeadTimeDays || "",
      notes: vendor.notes || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateVendor.mutate({
      id: vendorId,
      ...editForm,
      defaultLeadTimeDays: editForm.defaultLeadTimeDays ? parseInt(editForm.defaultLeadTimeDays) : undefined,
    });
  };

  const totalPOs = purchaseOrders?.length || 0;
  const totalSpend = purchaseOrders?.reduce((sum, po) => sum + parseFloat(String(po.totalAmount || 0)), 0) || 0;
  const activePOs = purchaseOrders?.filter((po) => po.status !== "received" && po.status !== "cancelled").length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/operations/vendors">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Vendors</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {vendor.name}
            </h1>
            <p className="text-muted-foreground capitalize">{vendor.type || "General"} Vendor</p>
          </div>
          <Badge className={statusColors[vendor.status || "active"]}>{vendor.status || "active"}</Badge>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}><X className="h-4 w-4 mr-2" />Cancel</Button>
              <Button onClick={handleSave} disabled={updateVendor.isPending}>
                {updateVendor.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={startEditing}><Edit className="h-4 w-4 mr-2" />Edit</Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalPOs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active POs</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{activePOs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalSpend)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lead Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{vendor.defaultLeadTimeDays || "-"} days</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info */}
        <Card>
          <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <div className="space-y-3">
                <div><Label>Company Name</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div><Label>Contact Name</Label><Input value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
                <div><Label>Payment Terms</Label><Input value={editForm.paymentTerms} onChange={(e) => setEditForm({ ...editForm, paymentTerms: e.target.value })} /></div>
                <div><Label>Lead Time (days)</Label><Input type="number" value={editForm.defaultLeadTimeDays} onChange={(e) => setEditForm({ ...editForm, defaultLeadTimeDays: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
              </div>
            ) : (
              <>
                {vendor.contactName && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{vendor.contactName}</span>
                  </div>
                )}
                {vendor.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${vendor.email}`} className="text-sm hover:underline">{vendor.email}</a>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{vendor.phone}</span>
                  </div>
                )}
                {vendor.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      <div>{vendor.address}</div>
                      <div>{[vendor.city, vendor.state, vendor.country].filter(Boolean).join(", ")}</div>
                    </div>
                  </div>
                )}
                {vendor.paymentTerms && (
                  <div className="pt-2 border-t">
                    <p className="text-sm"><span className="text-muted-foreground">Payment:</span> {vendor.paymentTerms}</p>
                  </div>
                )}
                {vendor.taxId && (
                  <div>
                    <p className="text-sm"><span className="text-muted-foreground">Tax ID:</span> {vendor.taxId}</p>
                  </div>
                )}
                {vendor.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">{vendor.notes}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Purchase Orders */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>{totalPOs} purchase orders on record</CardDescription>
          </CardHeader>
          <CardContent>
            {!purchaseOrders || purchaseOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No purchase orders yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell>
                        <Link href={`/operations/purchase-orders/${po.id}`}>
                          <span className="font-medium text-primary hover:underline cursor-pointer">
                            {po.poNumber || `#${po.id}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {po.orderDate ? format(new Date(po.orderDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {po.expectedDate ? format(new Date(po.expectedDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{po.status}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(po.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
