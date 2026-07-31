import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { Users, Plus, Loader2, RefreshCw, ShoppingBag, Upload, ExternalLink, Mail, Phone, MapPin, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Link } from "wouter";
import { format } from "date-fns";

const customerStatusOptions = [
  { value: "active", label: "Active", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "inactive", label: "Inactive", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
  { value: "prospect", label: "Prospect", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
];

const sourceOptions = [
  { value: "shopify", label: "Shopify", color: "bg-green-500/10 text-green-600" },
  { value: "manual", label: "Manual", color: "bg-gray-500/10 text-gray-600" },
];

function CustomerSummaryBody({ customer }: { customer: any }) {
  const location = [customer.city, customer.state, customer.country].filter(Boolean).join(", ");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3 col-span-2">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Mail className="h-3 w-3" /> Email
          </div>
          <div className="font-medium">{customer.email || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Phone className="h-3 w-3" /> Phone
          </div>
          <div className="font-medium">{customer.phone || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Type</div>
          <div className="font-medium capitalize">{customer.type || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 col-span-2">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> Location
          </div>
          <div className="font-medium">
            {customer.address ? <>{customer.address}<br /></> : null}
            {location || "—"}
            {customer.postalCode ? ` ${customer.postalCode}` : ""}
          </div>
        </div>
      </div>

      {customer.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {customer.notes}
          </p>
        </div>
      )}

      {customer.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced {format(new Date(customer.lastSyncedAt), "MMM d, yyyy 'at' p")}
        </p>
      )}
    </div>
  );
}

export default function Customers() {
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [syncCredentials, setSyncCredentials] = useState({
    shopifyAccessToken: "",
    shopifyStoreDomain: "",
  });
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    type: "business" as "individual" | "business",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: customers, isLoading } = trpc.customers.list.useQuery();
  const { data: syncStatus } = trpc.customers.getSyncStatus.useQuery();

  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer created successfully");
      setIsOpen(false);
      setFormData({
        name: "", email: "", phone: "", type: "business",
        address: "", city: "", state: "", country: "", postalCode: "", notes: "",
      });
      utils.customers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteCustomer = trpc.customers.delete.useMutation({
    onSuccess: () => {
      toast.success("Customer deleted");
      setCustomerToDelete(null);
      setSelectedCustomer(null);
      utils.customers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateCustomer = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Customer updated");
      utils.customers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncShopify = trpc.customers.syncFromShopify.useMutation({
    onSuccess: (result) => {
      toast.success(`Shopify sync complete: ${result.imported} imported, ${result.updated} updated`);
      setIsSyncOpen(false);
      utils.customers.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Shopify sync failed: ${error.message}`);
    },
  });

  // Enrich for dense display — derive source + a single-line location.
  const enrichedCustomers = useMemo(
    () =>
      (customers || []).map((c: any) => ({
        ...c,
        _source: c.shopifyCustomerId ? "shopify" : "manual",
        _location: [c.city, c.state, c.country].filter(Boolean).join(", ") || "—",
      })),
    [customers],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCustomer.mutate({
      name: formData.name,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      type: formData.type,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      country: formData.country || undefined,
      postalCode: formData.postalCode || undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleSync = () => {
    if (!syncCredentials.shopifyAccessToken || !syncCredentials.shopifyStoreDomain) {
      toast.error("Please enter Shopify credentials");
      return;
    }
    syncShopify.mutate({
      shopifyAccessToken: syncCredentials.shopifyAccessToken,
      shopifyStoreDomain: syncCredentials.shopifyStoreDomain,
    });
  };

  const columns: Column<any>[] = [
    { key: "name", header: "Name", type: "text", sortable: true },
    { key: "email", header: "Email", type: "text", sortable: true },
    { key: "phone", header: "Phone", type: "text" },
    { key: "type", header: "Type", type: "text" },
    {
      key: "status",
      header: "Status",
      type: "status",
      options: customerStatusOptions,
      editable: true,
      filterable: true,
    },
    {
      key: "_source",
      header: "Source",
      type: "badge",
      options: sourceOptions,
      filterable: true,
    },
    { key: "_location", header: "Location", type: "text" },
    { key: "lastSyncedAt", header: "Last Synced", type: "date", sortable: true },
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-8 w-8" />
            Customers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer database with Shopify and HubSpot sync.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Customers
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Sync Customers</DialogTitle>
                <DialogDescription>
                  Import customers from Shopify.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="shopifyDomain">Store Domain</Label>
                  <Input
                    id="shopifyDomain"
                    placeholder="your-store.myshopify.com"
                    value={syncCredentials.shopifyStoreDomain}
                    onChange={(e) => setSyncCredentials({ ...syncCredentials, shopifyStoreDomain: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Your Shopify store URL without https://</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shopifyToken">Access Token</Label>
                  <Input
                    id="shopifyToken"
                    type="password"
                    placeholder="shpat_xxxxxxxxxxxxxxxx"
                    value={syncCredentials.shopifyAccessToken}
                    onChange={(e) => setSyncCredentials({ ...syncCredentials, shopifyAccessToken: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Create a private app in Shopify Admin &rarr; Settings &rarr; Apps and sales channels
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSyncOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSync}
                  disabled={syncShopify.isPending}
                >
                  {syncShopify.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Start Sync
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => window.location.href = "/import"}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Add Customer</DialogTitle>
                  <DialogDescription>
                    Add a new customer to your database.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Customer name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Type</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="individual">Individual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Street address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="State"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Country"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">Postal Code</Label>
                      <Input
                        id="postalCode"
                        value={formData.postalCode}
                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                        placeholder="12345"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createCustomer.isPending}>
                    {createCustomer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Customer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Sync Status Cards */}
      {syncStatus && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{syncStatus.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-green-600" />
                From Shopify
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em] text-green-600">{syncStatus.shopify}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Manual Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{syncStatus.manual}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customers Table */}
      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={enrichedCustomers}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No customers yet — add manually or sync from Shopify."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedCustomer(row)}
            onCellEdit={(rowId, key, value) => {
              if (key === "status") {
                updateCustomer.mutate({ id: Number(rowId), status: value });
              }
            }}
            expandedRowId={selectedCustomer?.id ?? null}
            compact
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedCustomer}
        onOpenChange={(o) => !o && setSelectedCustomer(null)}
        width="md"
        title={
          selectedCustomer && (
            <span className="flex items-center gap-2">
              {selectedCustomer.name}
              {(() => {
                const s = customerStatusOptions.find((x) => x.value === selectedCustomer.status);
                return s ? <Badge className={s.color}>{s.label}</Badge> : null;
              })()}
            </span>
          )
        }
        subtitle={
          selectedCustomer &&
          (selectedCustomer.type === "business" ? "Business" : "Individual")
        }
        actions={
          selectedCustomer && (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/sales/customers/${selectedCustomer.id}`}>
                  Open full page
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setCustomerToDelete({ id: selectedCustomer.id, name: selectedCustomer.name })}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          )
        }
      >
        {selectedCustomer && <CustomerSummaryBody customer={selectedCustomer} />}
      </DetailSheet>

      <AlertDialog open={!!customerToDelete} onOpenChange={(open) => !open && setCustomerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium">{customerToDelete?.name}</span>.
              Existing orders and invoices for this customer are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCustomer.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCustomer.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (customerToDelete) deleteCustomer.mutate({ id: customerToDelete.id });
              }}
            >
              {deleteCustomer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
