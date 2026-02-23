import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Package, Tag, DollarSign, Barcode, Layers } from "lucide-react";
import { Link, useParams } from "wouter";

function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const productId = parseInt(params.id || "0");

  const { data: product, isLoading } = trpc.products.get.useQuery({ id: productId });
  const { data: inventory } = trpc.inventory.list.useQuery({ productId });

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
      case "active": return "bg-green-100 text-green-800";
      case "inactive": return "bg-gray-100 text-gray-800";
      case "discontinued": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "finished_good": return "bg-blue-100 text-blue-800";
      case "raw_material": return "bg-purple-100 text-purple-800";
      case "component": return "bg-yellow-100 text-yellow-800";
      case "service": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const totalInventory = inventory?.reduce((sum, inv) => 
    sum + parseFloat(inv.quantity?.toString() || "0"), 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/operations/products">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-muted-foreground font-mono">{product.sku}</p>
        </div>
        <Badge className={getStatusColor(product.status)}>{product.status}</Badge>
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
              <p className="text-2xl font-bold font-mono">{formatCurrency((product as any).unitPrice)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Cost</Label>
              <p className="font-mono">{formatCurrency((product as any).cost || product.costPrice)}</p>
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
