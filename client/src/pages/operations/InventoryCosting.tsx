import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  Layers,
  TrendingUp,
  TrendingDown,
  Settings2,
  Plus,
  Calculator,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

type CostingMethod = "fifo" | "lifo" | "weighted_average";

const methodLabels: Record<CostingMethod, string> = {
  fifo: "FIFO (First In, First Out)",
  lifo: "LIFO (Last In, First Out)",
  weighted_average: "Weighted Average",
};

const methodDescriptions: Record<CostingMethod, string> = {
  fifo: "Oldest inventory costs are assigned to COGS first. Best when costs are rising.",
  lifo: "Newest inventory costs are assigned to COGS first. Minimizes taxable income when prices rise.",
  weighted_average: "Average cost across all inventory. Smooths out price fluctuations.",
};

export default function InventoryCosting() {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [layerDialogOpen, setLayerDialogOpen] = useState(false);
  const [cogsDialogOpen, setCogsDialogOpen] = useState(false);

  // Config form state
  const [configProductId, setConfigProductId] = useState("");
  const [configMethod, setConfigMethod] = useState<CostingMethod>("weighted_average");
  const [configNotes, setConfigNotes] = useState("");

  // Layer form state
  const [layerProductId, setLayerProductId] = useState("");
  const [layerQuantity, setLayerQuantity] = useState("");
  const [layerUnitCost, setLayerUnitCost] = useState("");
  const [layerReference, setLayerReference] = useState("");

  // COGS form state
  const [cogsProductId, setCogsProductId] = useState("");
  const [cogsQuantity, setCogsQuantity] = useState("");
  const [cogsRevenue, setCogsRevenue] = useState("");

  const utils = trpc.useUtils();

  // Queries
  const { data: configs, isLoading: configsLoading } = trpc.inventoryCosting.configs.list.useQuery({});
  const { data: costLayers, isLoading: layersLoading } = trpc.inventoryCosting.layers.list.useQuery({});
  const { data: cogsRecords } = trpc.inventoryCosting.cogs.list.useQuery({});
  const { data: cogsDashboard } = trpc.inventoryCosting.cogs.dashboard.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});

  // Mutations
  const createConfigMutation = trpc.inventoryCosting.configs.create.useMutation({
    onSuccess: () => {
      toast.success("Product costing method has been set.");
      setConfigDialogOpen(false);
      resetConfigForm();
      utils.inventoryCosting.configs.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createLayerMutation = trpc.inventoryCosting.layers.create.useMutation({
    onSuccess: () => {
      toast.success("Inventory cost layer has been recorded.");
      setLayerDialogOpen(false);
      resetLayerForm();
      utils.inventoryCosting.layers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const recordCogsMutation = trpc.inventoryCosting.cogs.record.useMutation({
    onSuccess: (data) => {
      toast.success(`Total COGS: $${data.totalCogs.toFixed(2)} | Unit COGS: $${data.unitCogs.toFixed(4)}${data.grossMargin !== null ? ` | Margin: $${data.grossMargin.toFixed(2)}` : ""}`);
      setCogsDialogOpen(false);
      resetCogsForm();
      utils.inventoryCosting.cogs.list.invalidate();
      utils.inventoryCosting.cogs.dashboard.invalidate();
      utils.inventoryCosting.layers.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function resetConfigForm() {
    setConfigProductId("");
    setConfigMethod("weighted_average");
    setConfigNotes("");
  }
  function resetLayerForm() {
    setLayerProductId("");
    setLayerQuantity("");
    setLayerUnitCost("");
    setLayerReference("");
  }
  function resetCogsForm() {
    setCogsProductId("");
    setCogsQuantity("");
    setCogsRevenue("");
  }

  function getProductName(productId: number): string {
    const product = products?.find((p: any) => p.id === productId);
    return product ? `${product.name} (${product.sku})` : `Product #${productId}`;
  }

  function getProductMethod(productId: number): string {
    const config = configs?.find((c: any) => c.productId === productId);
    if (!config) return "-";
    const method = config.costingMethod as CostingMethod;
    return method === "weighted_average" ? "WA" : method.toUpperCase();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Inventory Costing & COGS</h1>
          <p className="text-muted-foreground">
            COGS auto-calculated from PO prices, freight, and copacker fees. No manual entry needed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Method
          </Button>
                    <GenerateSummaryButton products={products || []} />
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total COGS (30d)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">
              ${cogsDashboard?.totalCogs?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {cogsDashboard?.recordCount || 0} transactions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue (30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">
              ${cogsDashboard?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {((cogsDashboard as any)?.totalQuantitySold || 0).toFixed(0)} units sold
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
            {(cogsDashboard?.grossMargin || 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">
              ${cogsDashboard?.grossMargin?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {(cogsDashboard as any)?.grossMarginPercent?.toFixed(1) || "0.0"}% margin rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cost Layers</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">
              {costLayers?.filter((l: any) => l.status === "active").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {configs?.length || 0} products configured
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Costing Config Summary */}
      {!configsLoading && configs && configs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Costing Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3">
              {(["fifo", "lifo", "weighted_average"] as CostingMethod[]).map((method) => {
                const count = configs?.filter((c: any) => c.costingMethod === method).length || 0;
                if (count === 0) return null;
                return (
                  <div key={method} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{method === "weighted_average" ? "WA" : method.toUpperCase()}</Badge>
                    <span className="text-muted-foreground">{count} product{count !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Layers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Layers ({costLayers?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {layersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (costLayers?.length || 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Layers className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Cost Layers</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-2">
                Add cost layers when receiving inventory to track purchase costs for FIFO/LIFO/Weighted Average calculations.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Remaining Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costLayers?.map((layer: any) => {
                  const remainingQty = parseFloat(layer.remainingQuantity);
                  const originalQty = parseFloat(layer.originalQuantity);
                  const unitCost = parseFloat(layer.unitCost);
                  return (
                    <TableRow key={layer.id}>
                      <TableCell className="font-medium">{getProductName(layer.productId)}</TableCell>
                      <TableCell className="text-right">{originalQty.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">${unitCost.toFixed(4)}</TableCell>
                      <TableCell className="text-right font-mono">${(remainingQty * unitCost).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getProductMethod(layer.productId)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {layer.referenceType ? (
                          layer.referenceId != null && layer.referenceId !== ""
                            ? `${layer.referenceType} #${layer.referenceId}`
                            : layer.referenceType
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(layer.layerDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={remainingQty === 0 ? "text-muted-foreground" : ""}>
                          {remainingQty.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Configure System-Wide Costing Method Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Costing Method</DialogTitle>
            <DialogDescription>
              Set the costing method used across all products. This determines how COGS is calculated system-wide.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Method</Label>
              <Select value={configMethod} onValueChange={(v) => setConfigMethod(v as CostingMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                  <SelectItem value="lifo">LIFO (Last In, First Out)</SelectItem>
                  <SelectItem value="weighted_average">Weighted Average</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {methodDescriptions[configMethod]}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This applies to all products uniformly. To change it, update the <code>COSTING_METHOD</code> environment variable on your server.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Close</Button>
            <Button
              onClick={() => {
                toast.success(`Costing method set to ${configMethod.replace('_', ' ')}. Update COSTING_METHOD env var on Railway to persist.`);
                setConfigDialogOpen(false);
              }}
              disabled={!configProductId || createConfigMutation.isPending}
            >
              {createConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Cost Layer Dialog */}
      <Dialog open={layerDialogOpen} onOpenChange={setLayerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cost Layer</DialogTitle>
            <DialogDescription>
              Record a new inventory purchase lot with its cost. This creates a cost layer for FIFO/LIFO calculations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product</Label>
              <Select value={layerProductId} onValueChange={setLayerProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={layerQuantity}
                  onChange={(e) => setLayerQuantity(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={layerUnitCost}
                  onChange={(e) => setLayerUnitCost(e.target.value)}
                  placeholder="12.50"
                />
              </div>
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input
                value={layerReference}
                onChange={(e) => setLayerReference(e.target.value)}
                placeholder="PO #1234 or other reference"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLayerDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!layerProductId || !layerQuantity || !layerUnitCost) return;
                createLayerMutation.mutate({
                  productId: parseInt(layerProductId),
                  quantity: parseFloat(layerQuantity),
                  unitCost: parseFloat(layerUnitCost),
                  referenceType: layerReference ? "manual" : undefined,
                  notes: layerReference || undefined,
                });
              }}
              disabled={!layerProductId || !layerQuantity || !layerUnitCost || createLayerMutation.isPending}
            >
              {createLayerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Layer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record COGS Dialog */}
      <Dialog open={cogsDialogOpen} onOpenChange={setCogsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record COGS</DialogTitle>
            <DialogDescription>
              Calculate and record cost of goods sold for a sale. Uses the product's configured costing method.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product</Label>
              <Select value={cogsProductId} onValueChange={setCogsProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity Sold</Label>
                <Input
                  type="number"
                  value={cogsQuantity}
                  onChange={(e) => setCogsQuantity(e.target.value)}
                  placeholder="50"
                />
              </div>
              <div>
                <Label>Unit Revenue ($, optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cogsRevenue}
                  onChange={(e) => setCogsRevenue(e.target.value)}
                  placeholder="25.00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCogsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!cogsProductId || !cogsQuantity) return;
                recordCogsMutation.mutate({
                  productId: parseInt(cogsProductId),
                  quantitySold: parseFloat(cogsQuantity),
                  unitRevenue: cogsRevenue ? parseFloat(cogsRevenue) : undefined,
                });
              }}
              disabled={!cogsProductId || !cogsQuantity || recordCogsMutation.isPending}
            >
              {recordCogsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Calculate & Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// ============================================
// GENERATE COGS SUMMARY BUTTON (Issue #271)
// ============================================
type CogsPeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

function GenerateSummaryButton({ products }: { products: any[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [periodType, setPeriodType] = useState<CogsPeriodType>("monthly");
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date(); return d.toISOString().slice(0, 10);
  });

  const handlePeriodTypeChange = (type: CogsPeriodType) => {
    setPeriodType(type);
    const now = new Date();
    if (type === "monthly") {
      setPeriodStart(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setPeriodEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else if (type === "quarterly") {
      const q = Math.floor(now.getMonth() / 3);
      setPeriodStart(new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10));
      setPeriodEnd(new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10));
    } else if (type === "yearly") {
      setPeriodStart(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setPeriodEnd(new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10));
    }
  };

  const generateMutation = trpc.inventoryCosting.cogs.generateSummary.useMutation({
    onSuccess: () => {
      toast.success("CoGS period summary generated");
      setOpen(false);
      utils.inventoryCosting.cogs.dashboard.invalidate();
      utils.inventoryCosting.cogs.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Calculator className="h-4 w-4 mr-2" />
        Generate Summary
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate CoGS Period Summary</DialogTitle>
            <DialogDescription>
              Aggregate layer consumption events into a period summary row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Period Type</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {(["daily", "weekly", "monthly", "quarterly", "yearly"] as CogsPeriodType[]).map((t) => (
                  <Button
                    key={t}
                    variant={periodType === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePeriodTypeChange(t)}
                    className="capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Period Start</Label><Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
              <div><Label>Period End</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
            </div>
            <div>
              <Label>Product (optional)</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="All products" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All products</SelectItem>
                  {products?.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => generateMutation.mutate({
                productId: productId ? parseInt(productId) : undefined,
                periodType,
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
              })}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate Summary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
