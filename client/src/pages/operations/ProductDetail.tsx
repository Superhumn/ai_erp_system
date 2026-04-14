import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Package, Tag, DollarSign, Barcode, Layers } from "lucide-react";
import { Link, useParams } from "wouter";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const productId = parseInt(params.id || "0");

  const { data: productRaw, isLoading } = trpc.products.get.useQuery({ id: productId });
  const product = productRaw as any;
  const { data: inventoryRaw } = trpc.inventory.list.useQuery({ productId });
  const inventory = inventoryRaw as any[] | undefined;
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    category: "",
    type: "physical" as "physical" | "digital" | "service",
    manufacturingStage: "finished_product" as "raw_material" | "semi_finished_good" | "finished_product",
    status: "active" as "active" | "inactive" | "discontinued",
    unitPrice: "",
    costPrice: "",
  });

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: async () => {
      toast.success("Product updated");
      await Promise.all([
        utils.products.get.invalidate({ id: productId }),
        utils.products.list.invalidate(),
      ]);
      setEditOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="p-6">Loading...</div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">Product not found</div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "inactive": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
      case "discontinued": return "bg-red-500/8 text-red-600 dark:text-red-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "finished_good": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "raw_material": return "bg-violet-500/8 text-violet-600 dark:text-violet-400";
      case "component": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
      case "service": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const totalInventory = inventory?.reduce((sum, inv) => 
    sum + parseFloat(inv.quantity?.toString() || "0"), 0) || 0;
  const manufacturingStageLabels: Record<string, string> = {
    raw_material: "Raw Material",
    semi_finished_good: "Semi-Finished Good",
    finished_product: "Product",
  };

  const openEdit = () => {
    setEditForm({
      name: product.name || "",
      description: product.description || "",
      category: product.category || "",
      type: (product.type || "physical") as "physical" | "digital" | "service",
      manufacturingStage: (product.manufacturingStage || "finished_product") as "raw_material" | "semi_finished_good" | "finished_product",
      status: (product.status || "active") as "active" | "inactive" | "discontinued",
      unitPrice: product.unitPrice?.toString?.() || "0",
      costPrice: product.costPrice?.toString?.() || "",
    });
    setEditOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/operations/products">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{product.name}</h1>
          <p className="text-muted-foreground font-mono">{product.sku}</p>
        </div>
        <Badge className={getStatusColor(product.status)}>{product.status}</Badge>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={openEdit}>Edit Product</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={editForm.type} onValueChange={(v: "physical" | "digital" | "service") => setEditForm({ ...editForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Physical</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Classification</Label>
                  <Select value={editForm.manufacturingStage} onValueChange={(v: "raw_material" | "semi_finished_good" | "finished_product") => setEditForm({ ...editForm, manufacturingStage: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw_material">Raw Material</SelectItem>
                      <SelectItem value="semi_finished_good">Semi-Finished Good</SelectItem>
                      <SelectItem value="finished_product">Product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v: "active" | "inactive" | "discontinued") => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unit Price</Label>
                  <Input type="number" step="0.01" value={editForm.unitPrice} onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Cost Price</Label>
                  <Input type="number" step="0.01" value={editForm.costPrice} onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                disabled={updateProduct.isPending || !editForm.name.trim()}
                onClick={() => updateProduct.mutate({
                  id: productId,
                  name: editForm.name.trim(),
                  description: editForm.description || undefined,
                  category: editForm.category || undefined,
                  type: editForm.type,
                  manufacturingStage: editForm.manufacturingStage,
                  status: editForm.status,
                  unitPrice: editForm.unitPrice || undefined,
                  costPrice: editForm.costPrice || undefined,
                } as any)}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Product Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Product Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Barcode className="w-4 h-4" />
                SKU
              </Label>
              <p className="font-mono">{product.sku}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Name</Label>
              <p className="font-medium">{product.name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Category
              </Label>
              <p>{product.category || "-"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Type
              </Label>
              <div className="mt-1">
                <Badge className={getTypeColor(product.type)}>{product.type}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Manufacturing Classification</Label>
              <div className="mt-1">
                <Badge>{manufacturingStageLabels[product.manufacturingStage || "finished_product"]}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge className={getStatusColor(product.status)}>{product.status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Inventory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Pricing & Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Unit Price</Label>
              <p className="text-xl font-semibold tracking-[-0.02em] font-mono">{formatCurrency(product.unitPrice)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Cost</Label>
              <p className="font-mono">{formatCurrency((product as any).cost)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Total Inventory</Label>
              <p className="text-xl font-semibold">{totalInventory} {(product as any).unit || 'units'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Unit</Label>
              <p>{(product as any).unit || "-"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {product.description && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{product.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Inventory by Location */}
      {inventory && inventory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Inventory by Location</CardTitle>
            <CardDescription>
              Available across {inventory.length} location(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inventory.map((inv) => (
                <div key={inv.id} className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">Warehouse #{inv.warehouseId}</p>
                    <p className="text-sm text-muted-foreground">Location: {(inv as any).location || "-"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold">{inv.quantity} {(product as any).unit || 'units'}</p>
                    {inv.reservedQuantity && parseFloat(inv.reservedQuantity.toString()) > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Reserved: {inv.reservedQuantity}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
