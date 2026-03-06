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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DollarSign,
  Layers,
  BarChart3,
  Settings2,
  Plus,
  TrendingUp,
  TrendingDown,
  Calculator,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [activeTab, setActiveTab] = useState("dashboard");
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

  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Queries
  const { data: configs, isLoading: configsLoading } = trpc.inventoryCosting.configs.list.useQuery({});
  const { data: costLayers, isLoading: layersLoading } = trpc.inventoryCosting.layers.list.useQuery({});
  const { data: cogsRecords, isLoading: cogsLoading } = trpc.inventoryCosting.cogs.list.useQuery({});
  const { data: cogsDashboard } = trpc.inventoryCosting.cogs.dashboard.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});

  // Mutations
  const createConfigMutation = trpc.inventoryCosting.configs.create.useMutation({
    onSuccess: () => {
      toast({ title: "Costing Method Configured", description: "Product costing method has been set." });
      setConfigDialogOpen(false);
      resetConfigForm();
      utils.inventoryCosting.configs.list.invalidate();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createLayerMutation = trpc.inventoryCosting.layers.create.useMutation({
    onSuccess: () => {
      toast({ title: "Cost Layer Added", description: "Inventory cost layer has been recorded." });
      setLayerDialogOpen(false);
      resetLayerForm();
      utils.inventoryCosting.layers.list.invalidate();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recordCogsMutation = trpc.inventoryCosting.cogs.record.useMutation({
    onSuccess: (data) => {
      toast({
        title: "COGS Recorded",
        description: `Total COGS: $${data.totalCogs.toFixed(2)} | Unit COGS: $${data.unitCogs.toFixed(4)}${data.grossMargin !== null ? ` | Margin: $${data.grossMargin.toFixed(2)}` : ""}`,
      });
      setCogsDialogOpen(false);
      resetCogsForm();
      utils.inventoryCosting.cogs.list.invalidate();
      utils.inventoryCosting.cogs.dashboard.invalidate();
      utils.inventoryCosting.layers.list.invalidate();
    },
    onError: (error) => {
      toast({ title: "COGS Calculation Failed", description: error.message, variant: "destructive" });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Costing & COGS</h1>
          <p className="text-muted-foreground">
            FIFO, LIFO, and Weighted Average costing methods with automated COGS tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfigDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configure Method
          </Button>
          <Button variant="outline" onClick={() => setLayerDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Cost Layer
          </Button>
          <Button onClick={() => setCogsDialogOpen(true)}>
            <Calculator className="h-4 w-4 mr-2" />
            Record COGS
          </Button>
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
            <div className="text-2xl font-bold">
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
            <div className="text-2xl font-bold">
              ${cogsDashboard?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {(cogsDashboard?.totalQuantitySold || 0).toFixed(0)} units sold
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
            <div className="text-2xl font-bold">
              ${cogsDashboard?.grossMargin?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {cogsDashboard?.grossMarginPercent?.toFixed(1) || "0.0"}% margin rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cost Layers</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {costLayers?.filter((l: any) => l.status === "active").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {configs?.length || 0} products configured
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            COGS Records
          </TabsTrigger>
          <TabsTrigger value="layers">
            <Layers className="h-4 w-4 mr-2" />
            Cost Layers
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings2 className="h-4 w-4 mr-2" />
            Costing Config
          </TabsTrigger>
        </TabsList>

        {/* COGS Records Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          {cogsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (cogsRecords?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No COGS Records Yet</h3>
                <p className="text-muted-foreground text-center max-w-sm mt-2">
                  Record your first COGS entry by clicking "Record COGS" above. Configure costing methods per product first.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Product</th>
                        <th className="text-left p-3 font-medium">Method</th>
                        <th className="text-right p-3 font-medium">Qty Sold</th>
                        <th className="text-right p-3 font-medium">Unit COGS</th>
                        <th className="text-right p-3 font-medium">Total COGS</th>
                        <th className="text-right p-3 font-medium">Revenue</th>
                        <th className="text-right p-3 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cogsRecords?.map((record: any) => {
                        const margin = parseFloat(record.grossMarginPercent || "0");
                        return (
                          <tr key={record.id} className="border-b hover:bg-muted/25">
                            <td className="p-3">
                              {new Date(record.periodDate).toLocaleDateString()}
                            </td>
                            <td className="p-3">{getProductName(record.productId)}</td>
                            <td className="p-3">
                              <Badge variant="outline">
                                {record.costingMethod === "weighted_average" ? "WA" : record.costingMethod.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">{parseFloat(record.quantitySold).toFixed(2)}</td>
                            <td className="p-3 text-right">${parseFloat(record.unitCogs).toFixed(4)}</td>
                            <td className="p-3 text-right font-medium">${parseFloat(record.totalCogs).toFixed(2)}</td>
                            <td className="p-3 text-right">
                              {record.totalRevenue ? `$${parseFloat(record.totalRevenue).toFixed(2)}` : "-"}
                            </td>
                            <td className="p-3 text-right">
                              {record.grossMarginPercent ? (
                                <span className={margin >= 0 ? "text-green-600" : "text-red-600"}>
                                  {margin.toFixed(1)}%
                                </span>
                              ) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cost Layers Tab */}
        <TabsContent value="layers" className="space-y-4">
          {layersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (costLayers?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No Cost Layers</h3>
                <p className="text-muted-foreground text-center max-w-sm mt-2">
                  Add cost layers when receiving inventory to track purchase costs for FIFO/LIFO/Weighted Average calculations.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Layer Date</th>
                        <th className="text-left p-3 font-medium">Product</th>
                        <th className="text-right p-3 font-medium">Original Qty</th>
                        <th className="text-right p-3 font-medium">Remaining Qty</th>
                        <th className="text-right p-3 font-medium">Unit Cost</th>
                        <th className="text-right p-3 font-medium">Total Value</th>
                        <th className="text-left p-3 font-medium">Reference</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costLayers?.map((layer: any) => {
                        const remainingQty = parseFloat(layer.remainingQuantity);
                        const unitCost = parseFloat(layer.unitCost);
                        return (
                          <tr key={layer.id} className="border-b hover:bg-muted/25">
                            <td className="p-3">
                              {new Date(layer.layerDate).toLocaleDateString()}
                            </td>
                            <td className="p-3">{getProductName(layer.productId)}</td>
                            <td className="p-3 text-right">{parseFloat(layer.originalQuantity).toFixed(2)}</td>
                            <td className="p-3 text-right">{remainingQty.toFixed(2)}</td>
                            <td className="p-3 text-right">${unitCost.toFixed(4)}</td>
                            <td className="p-3 text-right font-medium">
                              ${(remainingQty * unitCost).toFixed(2)}
                            </td>
                            <td className="p-3">
                              {layer.referenceType ? (
                                <span className="text-muted-foreground">
                                  {layer.referenceId != null && layer.referenceId !== ""
                                    ? `${layer.referenceType} #${layer.referenceId}`
                                    : layer.referenceType}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="p-3">
                              <Badge variant={layer.status === "active" ? "default" : "secondary"}>
                                {layer.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-4">
          {/* Method Explanation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["fifo", "lifo", "weighted_average"] as CostingMethod[]).map((method) => (
              <Card key={method}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{methodLabels[method]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{methodDescriptions[method]}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {configs?.filter((c: any) => c.costingMethod === method).length || 0} products using this method
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {configsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (configs?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No Costing Methods Configured</h3>
                <p className="text-muted-foreground text-center max-w-sm mt-2">
                  Configure a costing method per product to enable COGS tracking. Default is Weighted Average.
                </p>
                <Button className="mt-4" onClick={() => setConfigDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Configure Product
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Product</th>
                        <th className="text-left p-3 font-medium">Costing Method</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Effective Date</th>
                        <th className="text-left p-3 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configs?.map((config: any) => (
                        <tr key={config.id} className="border-b hover:bg-muted/25">
                          <td className="p-3">{getProductName(config.productId)}</td>
                          <td className="p-3">
                            <Badge>{methodLabels[config.costingMethod as CostingMethod]}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={config.isActive ? "default" : "secondary"}>
                              {config.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {config.effectiveDate ? new Date(config.effectiveDate).toLocaleDateString() : "-"}
                          </td>
                          <td className="p-3 text-muted-foreground">{config.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Configure Costing Method Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Costing Method</DialogTitle>
            <DialogDescription>
              Set the inventory costing method for a product. This determines how COGS is calculated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product</Label>
              <Select value={configProductId} onValueChange={setConfigProductId}>
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
            <div>
              <Label>Costing Method</Label>
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
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={configNotes}
                onChange={(e) => setConfigNotes(e.target.value)}
                placeholder="Reason for choosing this method..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!configProductId) return;
                createConfigMutation.mutate({
                  productId: parseInt(configProductId),
                  costingMethod: configMethod,
                  notes: configNotes || undefined,
                });
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
