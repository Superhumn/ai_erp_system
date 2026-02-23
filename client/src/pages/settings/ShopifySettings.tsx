import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Store, Link2, Settings, MapPin, Package, AlertCircle } from "lucide-react";

export default function ShopifySettings() {
  const [storeDomain, setStoreDomain] = useState("");
  const [storeName, setStoreName] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const { data: stores, refetch: refetchStores } = trpc.shopify.stores.list.useQuery();

  const createStore = trpc.shopify.stores.create.useMutation({
    onSuccess: () => {
      toast.success("Shopify store connected");
      setStoreDomain("");
      setStoreName("");
      setAccessToken("");
      refetchStores();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateStore = trpc.shopify.stores.update.useMutation({
    onSuccess: () => {
      toast.success("Store updated");
      refetchStores();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Get SKU mappings for first store
  const firstStoreId = stores?.[0]?.id;
  const { data: skuMappings } = trpc.shopify.skuMappings.list.useQuery(
    { storeId: firstStoreId! },
    { enabled: !!firstStoreId }
  );

  const { data: locationMappings } = trpc.shopify.locationMappings.list.useQuery(
    { storeId: firstStoreId! },
    { enabled: !!firstStoreId }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shopify Integration</h1>
        <p className="text-muted-foreground">Configure your Shopify store connections, SKU mappings, and sync settings</p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            Connected Stores
          </CardTitle>
          <CardDescription>Manage your Shopify store connections</CardDescription>
        </CardHeader>
        <CardContent>
          {stores && stores.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Domain</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store: any) => (
                  <TableRow key={store.id}>
                    <TableCell className="font-mono text-sm">{store.storeDomain}</TableCell>
                    <TableCell>{store.storeName || "-"}</TableCell>
                    <TableCell>
                      <Badge className={store.isEnabled ? "bg-green-500" : "bg-gray-500"}>
                        {store.isEnabled ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>{store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleString() : "Never"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStore.mutate({ id: store.id, isActive: !store.isEnabled })}
                      >
                        {store.isEnabled ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No Shopify stores connected yet</p>
            </div>
          )}

          <Separator className="my-4" />

          <div className="space-y-4">
            <h3 className="font-medium">Add New Store</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Store Name</Label>
                <Input
                  placeholder="My Store"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>
              <div>
                <Label>Store Domain</Label>
                <Input
                  placeholder="mystore.myshopify.com"
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                />
              </div>
              <div>
                <Label>Access Token</Label>
                <Input
                  type="password"
                  placeholder="shpat_..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={() => createStore.mutate({ storeDomain, storeName, accessToken })}
              disabled={!storeDomain || !storeName || createStore.isPending}
            >
              <Link2 className="w-4 h-4 mr-2" />
              Connect Store
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SKU Mappings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            SKU Mappings
          </CardTitle>
          <CardDescription>Map Shopify product SKUs to ERP products</CardDescription>
        </CardHeader>
        <CardContent>
          {skuMappings && skuMappings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shopify SKU</TableHead>
                  <TableHead>Shopify Product ID</TableHead>
                  <TableHead>ERP Product ID</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skuMappings.map((mapping: any) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-mono">{mapping.shopifySku}</TableCell>
                    <TableCell>{mapping.shopifyProductId || "-"}</TableCell>
                    <TableCell>{mapping.productId}</TableCell>
                    <TableCell>
                      <Badge className={mapping.isActive ? "bg-green-500" : "bg-gray-500"}>
                        {mapping.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              {firstStoreId
                ? "No SKU mappings configured. Mappings will be created automatically when products are synced."
                : "Connect a store above to view SKU mappings."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Location Mappings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Location Mappings
          </CardTitle>
          <CardDescription>Map Shopify locations to ERP warehouses</CardDescription>
        </CardHeader>
        <CardContent>
          {locationMappings && locationMappings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shopify Location ID</TableHead>
                  <TableHead>Shopify Location Name</TableHead>
                  <TableHead>ERP Warehouse ID</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationMappings.map((mapping: any) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-mono">{mapping.shopifyLocationId}</TableCell>
                    <TableCell>{mapping.shopifyLocationName || "-"}</TableCell>
                    <TableCell>{mapping.warehouseId}</TableCell>
                    <TableCell>
                      <Badge className={mapping.isActive ? "bg-green-500" : "bg-gray-500"}>
                        {mapping.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              {firstStoreId
                ? "No location mappings configured. Add mappings to sync inventory by location."
                : "Connect a store above to view location mappings."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Sync Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Inventory Authority</Label>
              <p className="text-sm text-muted-foreground">Which system is the source of truth for inventory</p>
            </div>
            <Select defaultValue="hybrid">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="erp">ERP</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-sync Interval</Label>
              <p className="text-sm text-muted-foreground">How often to sync inventory levels</p>
            </div>
            <Select defaultValue="15">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Every 5 min</SelectItem>
                <SelectItem value="15">Every 15 min</SelectItem>
                <SelectItem value="30">Every 30 min</SelectItem>
                <SelectItem value="60">Every hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Shopify API Credentials Required</p>
              <p className="text-sm text-muted-foreground">
                Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in your environment variables to enable the full Shopify integration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
