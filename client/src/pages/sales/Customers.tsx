import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AITriggerButton } from "@/components/FloatingAIAssistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Users, Plus, Search, Loader2, RefreshCw, ShoppingBag, Database } from "lucide-react";
import { toast } from "sonner";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [syncType, setSyncType] = useState<"shopify" | "hubspot">("shopify");
  const [syncCredentials, setSyncCredentials] = useState({
    shopifyAccessToken: "",
    shopifyStoreDomain: "",
    hubspotAccessToken: "",
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

  const { data: customers, isLoading, refetch } = trpc.customers.list.useQuery();
  const { data: syncStatus } = trpc.customers.getSyncStatus.useQuery();
  
  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer created successfully");
      setIsOpen(false);
      setFormData({
        name: "", email: "", phone: "", type: "business",
        address: "", city: "", state: "", country: "", postalCode: "", notes: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncShopify = trpc.customers.syncFromShopify.useMutation({
    onSuccess: (result) => {
      toast.success(`Shopify sync complete: ${result.imported} imported, ${result.updated} updated`);
      setIsSyncOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Shopify sync failed: ${error.message}`);
    },
  });

  const syncHubspot = trpc.customers.syncFromHubspot.useMutation({
    onSuccess: (result) => {
      toast.success(`HubSpot sync complete: ${result.imported} imported, ${result.updated} updated`);
      setIsSyncOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`HubSpot sync failed: ${error.message}`);
    },
  });

  const filteredCustomers = customers?.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      customer.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    const matchesSource = sourceFilter === "all" || 
      (sourceFilter === "shopify" && customer.shopifyCustomerId) ||
      (sourceFilter === "hubspot" && customer.hubspotContactId) ||
      (sourceFilter === "manual" && !customer.shopifyCustomerId && !customer.hubspotContactId);
    return matchesSearch && matchesStatus && matchesSource;
  });

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    inactive: "bg-gray-500/10 text-gray-600",
    prospect: "bg-blue-500/10 text-blue-600",
  };

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
    if (syncType === "shopify") {
      if (!syncCredentials.shopifyAccessToken || !syncCredentials.shopifyStoreDomain) {
        toast.error("Please enter Shopify credentials");
        return;
      }
      syncShopify.mutate({
        shopifyAccessToken: syncCredentials.shopifyAccessToken,
        shopifyStoreDomain: syncCredentials.shopifyStoreDomain,
      });
    } else {
      if (!syncCredentials.hubspotAccessToken) {
        toast.error("Please enter HubSpot access token");
        return;
      }
      syncHubspot.mutate({
        hubspotAccessToken: syncCredentials.hubspotAccessToken,
      });
    }
  };

  const getSourceBadge = (customer: any) => {
    if (customer.shopifyCustomerId) {
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 text-xs">Shopify</Badge>;
    }
    if (customer.hubspotContactId) {
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 text-xs">HubSpot</Badge>;
    }
    return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 text-xs">Manual</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Customers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer database with Shopify and HubSpot sync.
          </p>
        </div>
        <div className="flex gap-2">
          <AITriggerButton message="Analyze my customer base - show me top customers, ordering patterns, and any customers at risk of churning" label="AI Analysis" />
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
                  Import customers from Shopify or HubSpot.
                </DialogDescription>
              </DialogHeader>
              <Tabs value={syncType} onValueChange={(v) => setSyncType(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="shopify" className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    Shopify
                  </TabsTrigger>
                  <TabsTrigger value="hubspot" className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    HubSpot
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="shopify" className="space-y-4 mt-4">
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
                      Create a private app in Shopify Admin → Settings → Apps and sales channels
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="hubspot" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="hubspotToken">Access Token</Label>
                    <Input
                      id="hubspotToken"
                      type="password"
                      placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={syncCredentials.hubspotAccessToken}
                      onChange={(e) => setSyncCredentials({ ...syncCredentials, hubspotAccessToken: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Create a private app in HubSpot → Settings → Integrations → Private Apps
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSyncOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSync} 
                  disabled={syncShopify.isPending || syncHubspot.isPending}
                >
                  {(syncShopify.isPending || syncHubspot.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Start Sync
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              <div className="text-2xl font-bold">{syncStatus.total}</div>
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
              <div className="text-2xl font-bold text-green-600">{syncStatus.shopify}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-orange-600" />
                From HubSpot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{syncStatus.hubspot}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Manual Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{syncStatus.manual}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="hubspot">HubSpot</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCustomers?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No customers found</p>
              <p className="text-sm mt-1">Add customers manually or sync from Shopify/HubSpot</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers?.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.email || "-"}</TableCell>
                    <TableCell>{customer.phone || "-"}</TableCell>
                    <TableCell className="capitalize">{customer.type}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[customer.status] || ""}>
                        {customer.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{getSourceBadge(customer)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {customer.lastSyncedAt 
                        ? new Date(customer.lastSyncedAt).toLocaleDateString()
                        : "-"}
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
