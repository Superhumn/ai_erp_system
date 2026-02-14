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
  ArrowLeft, Loader2, Package, DollarSign, Layers,
  Edit, Save, X, BarChart3, Warehouse,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  inactive: "bg-gray-500/10 text-gray-600",
  discontinued: "bg-red-500/10 text-red-600",
};

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = parseInt(id || "0");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const { data: product, isLoading, refetch } = trpc.products.get.useQuery({ id: productId });
  const { data: inventory } = trpc.inventory.list.useQuery({ productId });
  const { data: boms } = trpc.bom.list.useQuery();

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success("Product updated");
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

  if (!product) {
    return (
      <div className="space-y-4">
        <Link href="/operations/products">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Product not found.</p>
      </div>
    );
  }

  const startEditing = () => {
    setEditForm({
      name: product.name || "",
      description: product.description || "",
      category: product.category || "",
      unitPrice: product.unitPrice || "",
      costPrice: product.costPrice || "",
      status: product.status || "active",
      taxable: product.taxable ?? true,
      taxRate: product.taxRate || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateProduct.mutate({
      id: productId,
      ...editForm,
      unitPrice: editForm.unitPrice ? String(editForm.unitPrice) : undefined,
      costPrice: editForm.costPrice ? String(editForm.costPrice) : undefined,
      taxRate: editForm.taxRate ? String(editForm.taxRate) : undefined,
    });
  };

  const productInventory = inventory?.filter((inv) => inv.productId === productId) || [];
  const totalStock = productInventory.reduce((sum, inv) => sum + parseInt(String(inv.quantity || 0)), 0);
  const productBOM = boms?.find((b) => b.productId === productId);
  const margin = product.unitPrice && product.costPrice
    ? ((parseFloat(String(product.unitPrice)) - parseFloat(String(product.costPrice))) / parseFloat(String(product.unitPrice)) * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/operations/products">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Products</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" />
              {product.name}
            </h1>
            <p className="text-muted-foreground">SKU: {product.sku} | {product.category || "Uncategorized"}</p>
          </div>
          <Badge className={statusColors[product.status || "active"]}>{product.status || "active"}</Badge>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}><X className="h-4 w-4 mr-2" />Cancel</Button>
              <Button onClick={handleSave} disabled={updateProduct.isPending}>
                {updateProduct.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
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
            <CardTitle className="text-sm font-medium">Unit Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(product.unitPrice)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(product.costPrice)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margin</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margin ? `${margin}%` : "N/A"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStock}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Details */}
        <Card>
          <CardHeader><CardTitle>Product Details</CardTitle></CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Unit Price</Label><Input type="number" step="0.01" value={editForm.unitPrice} onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })} /></div>
                  <div><Label>Cost Price</Label><Input type="number" step="0.01" value={editForm.costPrice} onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })} /></div>
                </div>
                <div><Label>Description</Label><Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} /></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div><span className="text-sm text-muted-foreground">Type:</span> <span className="text-sm capitalize">{product.type || "physical"}</span></div>
                <div><span className="text-sm text-muted-foreground">Category:</span> <span className="text-sm">{product.category || "-"}</span></div>
                <div><span className="text-sm text-muted-foreground">Taxable:</span> <span className="text-sm">{product.taxable ? "Yes" : "No"}{product.taxRate ? ` (${product.taxRate}%)` : ""}</span></div>
                {product.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">{product.description}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory by Location */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory by Location</CardTitle>
            <CardDescription>{productInventory.length} locations with stock</CardDescription>
          </CardHeader>
          <CardContent>
            {productInventory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No inventory records.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productInventory.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.warehouseName || `WH #${inv.warehouseId}`}</TableCell>
                      <TableCell className="text-right">{inv.quantity}</TableCell>
                      <TableCell className="text-right">{inv.reservedQuantity || 0}</TableCell>
                      <TableCell className="text-right font-medium">{parseInt(String(inv.quantity || 0)) - parseInt(String(inv.reservedQuantity || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BOM */}
      {productBOM && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Bill of Materials
            </CardTitle>
            <CardDescription>
              <Link href={`/operations/bom/${productBOM.id}`}>
                <span className="text-primary hover:underline cursor-pointer">View full BOM details</span>
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              BOM #{productBOM.id} - Version {productBOM.version || 1}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
