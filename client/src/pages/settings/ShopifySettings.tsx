import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ShoppingBag,
  RefreshCw,
  Settings,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Link as LinkIcon,
  Package,
  MapPin,
} from "lucide-react";
import { Link } from "wouter";

export default function ShopifySettings() {
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [newSkuMapping, setNewSkuMapping] = useState({
    shopifyProductId: "",
    shopifyVariantId: "",
    productId: "",
  });

  const { data: stores, isLoading, refetch } = trpc.shopify.stores.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();

  const updateStore = trpc.shopify.stores.update.useMutation({
    onSuccess: () => {
      toast.success("Store settings updated");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const createSkuMapping = trpc.shopify.skuMappings.create.useMutation({
    onSuccess: () => {
      toast.success("SKU mapping created");
      setShowAddMapping(false);
      setNewSkuMapping({ shopifyProductId: "", shopifyVariantId: "", productId: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const syncOrders = trpc.shopify.sync.orders.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.created + result.updated} orders`);
    },
    onError: (error) => toast.error(error.message),
  });

  const syncProducts = trpc.shopify.sync.products.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.created + result.updated} products`);
    },
    onError: (error) => toast.error(error.message),
  });

  const syncInventory = trpc.shopify.sync.inventory.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced inventory for ${result.updated} items`);
    },
    onError: (error) => toast.error(error.message),
  });

  const syncCustomers = trpc.shopify.sync.customers.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.created + result.updated} customers`);
    },
    onError: (error) => toast.error(error.message),
  });

  const isSyncing = syncOrders.isPending || syncProducts.isPending || syncInventory.isPending || syncCustomers.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href="/settings/integrations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="h-8 w-8" />
            Shopify Settings
          </h1>
          <p className="text-muted-foreground">Manage your Shopify store connections and sync settings</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !stores || stores.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Shopify stores connected</h3>
            <p className="text-muted-foreground mb-4">Connect a store from the Integrations page to get started.</p>
            <Link href="/settings/integrations">
              <Button>
                <LinkIcon className="h-4 w-4 mr-2" />
                Go to Integrations
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Connected Stores */}
          {stores.map((store: any) => (
            <Card key={store.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBag className="h-5 w-5" />
                      {store.storeName || store.storeDomain}
                    </CardTitle>
                    <CardDescription>{store.storeDomain}</CardDescription>
                  </div>
                  <Badge className={store.isEnabled ? "bg-green-500/10 text-green-600" : "bg-gray-500/10 text-gray-600"}>
                    {store.isEnabled ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" /> Active</>
                    ) : (
                      <><XCircle className="w-3 h-3 mr-1" /> Disabled</>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Sync Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label className="font-medium">Sync Orders</Label>
                      <p className="text-xs text-muted-foreground">Automatically import orders from Shopify</p>
                    </div>
                    <Switch
                      checked={store.syncOrders}
                      onCheckedChange={(checked) =>
                        updateStore.mutate({ id: store.id, isActive: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label className="font-medium">Sync Inventory</Label>
                      <p className="text-xs text-muted-foreground">Keep inventory levels in sync</p>
                    </div>
                    <Switch
                      checked={store.syncInventory}
                      onCheckedChange={(checked) =>
                        updateStore.mutate({ id: store.id, isActive: checked })
                      }
                    />
                  </div>
                </div>

                {/* Sync Actions */}
                <div>
                  <Label className="text-sm font-medium mb-3 block">Manual Sync</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncOrders.mutate({ storeId: store.id })}
                      disabled={isSyncing}
                    >
                      {syncOrders.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sync Orders
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncProducts.mutate({ storeId: store.id })}
                      disabled={isSyncing}
                    >
                      {syncProducts.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
                      Sync Products
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncInventory.mutate({ storeId: store.id })}
                      disabled={isSyncing}
                    >
                      {syncInventory.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                      Sync Inventory
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncCustomers.mutate({ storeId: store.id })}
                      disabled={isSyncing}
                    >
                      {syncCustomers.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sync Customers
                    </Button>
                  </div>
                </div>

                {/* Last Sync Info */}
                {store.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(store.lastSyncAt).toLocaleString()}
                  </p>
                )}

                {/* SKU Mappings */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">SKU Mappings</Label>
                    <Dialog open={showAddMapping && selectedStoreId === store.id} onOpenChange={(open) => { setShowAddMapping(open); setSelectedStoreId(open ? store.id : null); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Mapping
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add SKU Mapping</DialogTitle>
                          <DialogDescription>
                            Map a Shopify product variant to an ERP product.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Shopify Product ID</Label>
                            <Input
                              placeholder="e.g. 7654321098765"
                              value={newSkuMapping.shopifyProductId}
                              onChange={(e) => setNewSkuMapping({ ...newSkuMapping, shopifyProductId: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Shopify Variant ID</Label>
                            <Input
                              placeholder="e.g. 43210987654321"
                              value={newSkuMapping.shopifyVariantId}
                              onChange={(e) => setNewSkuMapping({ ...newSkuMapping, shopifyVariantId: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>ERP Product ID</Label>
                            <Input
                              placeholder="e.g. 42"
                              value={newSkuMapping.productId}
                              onChange={(e) => setNewSkuMapping({ ...newSkuMapping, productId: e.target.value })}
                            />
                            {products && products.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Available: {products.slice(0, 5).map((p: any) => `${p.name} (#${p.id})`).join(", ")}
                                {products.length > 5 ? `, +${products.length - 5} more` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowAddMapping(false)}>Cancel</Button>
                          <Button
                            onClick={() => {
                              createSkuMapping.mutate({
                                storeId: store.id,
                                shopifyProductId: newSkuMapping.shopifyProductId,
                                shopifyVariantId: newSkuMapping.shopifyVariantId,
                                productId: parseInt(newSkuMapping.productId),
                              });
                            }}
                            disabled={createSkuMapping.isPending}
                          >
                            {createSkuMapping.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Create Mapping
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <SkuMappingTable storeId={store.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function SkuMappingTable({ storeId }: { storeId: number }) {
  const { data: mappings, isLoading } = trpc.shopify.skuMappings.list.useQuery({ storeId });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-2">Loading mappings...</div>;
  }

  if (!mappings || mappings.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No SKU mappings configured yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shopify Product ID</TableHead>
          <TableHead>Shopify Variant ID</TableHead>
          <TableHead>ERP Product ID</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mappings.map((mapping: any) => (
          <TableRow key={mapping.id}>
            <TableCell className="font-mono text-sm">{mapping.shopifyProductId}</TableCell>
            <TableCell className="font-mono text-sm">{mapping.shopifyVariantId}</TableCell>
            <TableCell>{mapping.productId}</TableCell>
            <TableCell>
              <Badge variant={mapping.isActive ? "default" : "secondary"}>
                {mapping.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
