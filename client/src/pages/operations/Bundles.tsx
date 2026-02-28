import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Plus, Search, Loader2, PackageOpen, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

const bundleTypeLabels: Record<string, string> = {
  bundle: "Bundle",
  kit: "Kit",
  variety_pack: "Variety Pack",
  multipak: "Multipak",
};

export default function Bundles() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBundleId, setSelectedBundleId] = useState<number | null>(null);
  const [isComponentDialogOpen, setIsComponentDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    type: "bundle" as "bundle" | "kit" | "variety_pack" | "multipak",
    unitPrice: "",
    costPrice: "",
    category: "",
    shopifyProductId: "",
    shopifyVariantId: "",
    autoDeductComponents: true,
    notes: "",
  });
  const [componentForm, setComponentForm] = useState({
    productId: "",
    quantity: "1",
    unit: "EA",
  });

  const { data: bundleList, isLoading, refetch } = trpc.bundles.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: selectedBundle, refetch: refetchBundle } = trpc.bundles.get.useQuery(
    { id: selectedBundleId! },
    { enabled: !!selectedBundleId }
  );

  const createMutation = trpc.bundles.create.useMutation({
    onSuccess: () => {
      toast.success("Bundle created successfully");
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.bundles.delete.useMutation({
    onSuccess: () => {
      toast.success("Bundle deleted");
      setSelectedBundleId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const addComponentMutation = trpc.bundles.addComponent.useMutation({
    onSuccess: () => {
      toast.success("Component added");
      setIsComponentDialogOpen(false);
      setComponentForm({ productId: "", quantity: "1", unit: "EA" });
      refetchBundle();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteComponentMutation = trpc.bundles.deleteComponent.useMutation({
    onSuccess: () => {
      toast.success("Component removed");
      refetchBundle();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const syncToShopifyMutation = trpc.bundles.syncToShopify.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced to Shopify: ${data.availableQuantity} available`);
      refetchBundle();
    },
    onError: (err) => toast.error(err.message),
  });

  const deductMutation = trpc.bundles.deductInventory.useMutation({
    onSuccess: (data) => {
      if (data.warning) {
        toast.warning(data.message);
      } else {
        toast.success("Inventory deducted successfully");
      }
      refetchBundle();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setFormData({
      sku: "",
      name: "",
      description: "",
      type: "bundle",
      unitPrice: "",
      costPrice: "",
      category: "",
      shopifyProductId: "",
      shopifyVariantId: "",
      autoDeductComponents: true,
      notes: "",
    });
  }

  const filteredBundles = (bundleList || []).filter((b) => {
    const matchesSearch =
      !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.sku.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bundles & Kits</h1>
          <p className="text-muted-foreground">
            Manage product bundles, variety packs, and kits with automatic component inventory deduction
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Bundle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Bundle / Kit</DialogTitle>
              <DialogDescription>
                Create a new product bundle or kit. Add component products after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input
                    placeholder="BNDL-001"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bundle">Bundle</SelectItem>
                      <SelectItem value="kit">Kit</SelectItem>
                      <SelectItem value="variety_pack">Variety Pack</SelectItem>
                      <SelectItem value="multipak">Multipak</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="Summer Variety Pack"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="A curated selection of..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Selling Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="29.99"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    placeholder="Snacks"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Shopify Product ID</Label>
                  <Input
                    placeholder="Optional"
                    value={formData.shopifyProductId}
                    onChange={(e) => setFormData({ ...formData, shopifyProductId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Shopify Variant ID</Label>
                  <Input
                    placeholder="Optional"
                    value={formData.shopifyVariantId}
                    onChange={(e) => setFormData({ ...formData, shopifyVariantId: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  createMutation.mutate({
                    ...formData,
                    shopifyProductId: formData.shopifyProductId || undefined,
                    shopifyVariantId: formData.shopifyVariantId || undefined,
                  })
                }
                disabled={!formData.sku || !formData.name || !formData.unitPrice || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Bundle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{bundleList?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total Bundles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {bundleList?.filter((b) => b.status === "active").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {bundleList?.filter((b) => b.type === "variety_pack").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Variety Packs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {bundleList?.reduce((sum, b) => sum + (b.componentCount || 0), 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">Total Components</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Bundle List */}
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search bundles..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="discontinued">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Components</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBundles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        <PackageOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No bundles found. Create your first bundle to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBundles.map((bundle) => (
                      <TableRow
                        key={bundle.id}
                        className={`cursor-pointer ${selectedBundleId === bundle.id ? "bg-muted" : ""}`}
                        onClick={() => setSelectedBundleId(bundle.id)}
                      >
                        <TableCell className="font-mono text-sm">{bundle.sku}</TableCell>
                        <TableCell className="font-medium">{bundle.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{bundleTypeLabels[bundle.type] || bundle.type}</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(bundle.unitPrice)}</TableCell>
                        <TableCell>
                          <span className={parseFloat(bundle.availableQuantity || "0") > 0 ? "text-green-600 font-medium" : "text-red-500"}>
                            {parseFloat(bundle.availableQuantity || "0")}
                          </span>
                        </TableCell>
                        <TableCell>{bundle.componentCount || 0}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              bundle.status === "active" ? "default" : bundle.status === "inactive" ? "secondary" : "destructive"
                            }
                          >
                            {bundle.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Bundle Detail Panel */}
        <div className="col-span-1">
          {selectedBundle ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{selectedBundle.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono">{selectedBundle.sku}</p>
                    </div>
                    <Badge variant="outline">{bundleTypeLabels[selectedBundle.type] || selectedBundle.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Selling Price:</span>
                      <div className="font-medium">{formatCurrency(selectedBundle.unitPrice)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost:</span>
                      <div className="font-medium">{formatCurrency(selectedBundle.costPrice)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Available:</span>
                      <div className="font-medium text-green-600">
                        {selectedBundle.availability?.availableQuantity || 0} units
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Auto-Deduct:</span>
                      <div className="font-medium">
                        {selectedBundle.autoDeductComponents ? "Yes" : "No"}
                      </div>
                    </div>
                  </div>
                  {selectedBundle.shopifyProductId && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Shopify Product ID:</span>
                      <div className="font-mono text-xs">{selectedBundle.shopifyProductId}</div>
                    </div>
                  )}
                  {selectedBundle.description && (
                    <p className="text-sm text-muted-foreground">{selectedBundle.description}</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    {selectedBundle.shopifyProductId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncToShopifyMutation.mutate({ bundleId: selectedBundle.id })}
                        disabled={syncToShopifyMutation.isPending}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1 ${syncToShopifyMutation.isPending ? "animate-spin" : ""}`} />
                        Sync to Shopify
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Delete this bundle?")) {
                          deleteMutation.mutate({ id: selectedBundle.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Components */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Components</h4>
                    <Dialog open={isComponentDialogOpen} onOpenChange={setIsComponentDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Component Product</DialogTitle>
                          <DialogDescription>
                            Select a product and specify how many are included per bundle.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Product</Label>
                            <Select
                              value={componentForm.productId}
                              onValueChange={(v) => setComponentForm({ ...componentForm, productId: v })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a product..." />
                              </SelectTrigger>
                              <SelectContent>
                                {(products || []).map((p) => (
                                  <SelectItem key={p.id} value={p.id.toString()}>
                                    {p.sku} - {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Quantity per Bundle</Label>
                              <Input
                                type="number"
                                step="1"
                                min="1"
                                value={componentForm.quantity}
                                onChange={(e) => setComponentForm({ ...componentForm, quantity: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unit</Label>
                              <Input
                                value={componentForm.unit}
                                onChange={(e) => setComponentForm({ ...componentForm, unit: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() =>
                              addComponentMutation.mutate({
                                bundleId: selectedBundle.id,
                                productId: parseInt(componentForm.productId),
                                quantity: componentForm.quantity,
                                unit: componentForm.unit,
                              })
                            }
                            disabled={!componentForm.productId || addComponentMutation.isPending}
                          >
                            {addComponentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Add Component
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedBundle.components.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No components yet. Add products to this bundle.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedBundle.components.map((comp: any) => (
                        <div
                          key={comp.component.id}
                          className="flex items-center justify-between border rounded-lg p-3"
                        >
                          <div>
                            <div className="font-medium text-sm">
                              {comp.product?.name || "Unknown Product"}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {comp.product?.sku || "N/A"} &middot; {comp.component.quantity} {comp.component.unit}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedBundle.availability?.components && (
                              <span className="text-xs text-muted-foreground">
                                {selectedBundle.availability.components.find(
                                  (c: any) => c.productId === comp.component.productId
                                )?.totalAvailable || 0}{" "}
                                avail
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteComponentMutation.mutate({
                                  id: comp.component.id,
                                  bundleId: selectedBundle.id,
                                });
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Deduction History */}
              {selectedBundle.deductionLogs && selectedBundle.deductionLogs.length > 0 && (
                <Card>
                  <CardHeader>
                    <h4 className="font-semibold">Recent Deductions</h4>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedBundle.deductionLogs.slice(0, 5).map((log: any) => (
                        <div key={log.id} className="flex items-center justify-between text-sm border-b pb-2">
                          <div>
                            <span className="font-medium">{log.bundleQuantity} units</span>
                            {log.shopifyOrderId && (
                              <span className="text-muted-foreground ml-2">
                                Shopify #{log.shopifyOrderId}
                              </span>
                            )}
                          </div>
                          <Badge
                            variant={
                              log.status === "deducted"
                                ? "default"
                                : log.status === "reversed"
                                  ? "secondary"
                                  : log.status === "failed"
                                    ? "destructive"
                                    : "outline"
                            }
                          >
                            {log.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">Select a bundle to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
