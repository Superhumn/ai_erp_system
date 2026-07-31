import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Truck, DollarSign, TrendingUp, Warehouse, Receipt } from "lucide-react";

export default function Costing() {
  const [profitStart, setProfitStart] = useState("");
  const [profitEnd, setProfitEnd] = useState("");
  const [valuationWarehouseId, setValuationWarehouseId] = useState("");

  const [freightOpen, setFreightOpen] = useState(false);
  const [freightForm, setFreightForm] = useState({
    purchaseOrderId: "",
    shipmentId: "",
    totalFreightCost: "",
    totalCustomsDuties: "",
    totalInsuranceCost: "",
    totalHandlingFees: "",
    allocationMethod: "weight" as "weight" | "volume" | "quantity" | "value" | "manual",
  });

  const [costBasisOpen, setCostBasisOpen] = useState(false);
  const [costBasisForm, setCostBasisForm] = useState({
    productId: "",
    warehouseId: "",
    receivedQuantity: "",
    unitCost: "",
  });

  const utils = trpc.useUtils();

  const profitabilityInput: { startDate?: Date; endDate?: Date } = {};
  if (profitStart) profitabilityInput.startDate = new Date(profitStart);
  if (profitEnd) profitabilityInput.endDate = new Date(profitEnd);
  const { data: profitability, isLoading: profitLoading } = trpc.cogs.profitability.useQuery(profitabilityInput);

  const valuationInput: { warehouseId?: number } = {};
  if (valuationWarehouseId) valuationInput.warehouseId = Number(valuationWarehouseId);
  const { data: valuation, isLoading: valuationLoading } = trpc.cogs.valuation.useQuery(valuationInput);

  const { data: transactions, isLoading: transactionsLoading } = trpc.cogs.getTransactions.useQuery({ limit: 100 });

  const allocateFreightMutation = trpc.cogs.allocateFreight.useMutation({
    onSuccess: () => {
      toast.success("Freight allocated successfully");
      setFreightOpen(false);
      resetFreightForm();
      utils.cogs.valuation.invalidate();
      utils.cogs.getTransactions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCostBasisMutation = trpc.cogs.updateCostBasis.useMutation({
    onSuccess: () => {
      toast.success("Cost basis updated successfully");
      setCostBasisOpen(false);
      resetCostBasisForm();
      utils.cogs.valuation.invalidate();
      utils.cogs.profitability.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetFreightForm = () => {
    setFreightForm({
      purchaseOrderId: "",
      shipmentId: "",
      totalFreightCost: "",
      totalCustomsDuties: "",
      totalInsuranceCost: "",
      totalHandlingFees: "",
      allocationMethod: "weight",
    });
  };

  const resetCostBasisForm = () => {
    setCostBasisForm({
      productId: "",
      warehouseId: "",
      receivedQuantity: "",
      unitCost: "",
    });
  };

  const handleAllocateFreight = () => {
    if (!freightForm.totalFreightCost) {
      toast.error("Total freight cost is required");
      return;
    }
    allocateFreightMutation.mutate({
      purchaseOrderId: freightForm.purchaseOrderId ? Number(freightForm.purchaseOrderId) : undefined,
      shipmentId: freightForm.shipmentId ? Number(freightForm.shipmentId) : undefined,
      totalFreightCost: Number(freightForm.totalFreightCost),
      totalCustomsDuties: freightForm.totalCustomsDuties ? Number(freightForm.totalCustomsDuties) : undefined,
      totalInsuranceCost: freightForm.totalInsuranceCost ? Number(freightForm.totalInsuranceCost) : undefined,
      totalHandlingFees: freightForm.totalHandlingFees ? Number(freightForm.totalHandlingFees) : undefined,
      allocationMethod: freightForm.allocationMethod,
    });
  };

  const handleUpdateCostBasis = () => {
    if (!costBasisForm.productId || !costBasisForm.warehouseId || !costBasisForm.receivedQuantity || !costBasisForm.unitCost) {
      toast.error("Product, warehouse, quantity, and unit cost are all required");
      return;
    }
    updateCostBasisMutation.mutate({
      productId: Number(costBasisForm.productId),
      warehouseId: Number(costBasisForm.warehouseId),
      receivedQuantity: Number(costBasisForm.receivedQuantity),
      unitCost: Number(costBasisForm.unitCost),
    });
  };

  const valuationIsArray = Array.isArray(valuation);
  const valuationRows: any[] = valuationIsArray ? (valuation as any[]) : [];
  const valuationObject: any = !valuationIsArray && valuation ? valuation : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Product Costing & COGS</h1>
          <p className="text-muted-foreground">Track profitability, landed cost, inventory valuation, and cost of goods sold</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Allocate Freight Dialog */}
          <Dialog open={freightOpen} onOpenChange={(open) => {
            setFreightOpen(open);
            if (!open) resetFreightForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Truck className="h-4 w-4 mr-2" />
                Allocate Freight
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Allocate Freight & Landed Costs</DialogTitle>
                <DialogDescription>
                  Distribute freight, duties, insurance, and handling across received items to compute landed cost.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Purchase Order ID</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 1024"
                      value={freightForm.purchaseOrderId}
                      onChange={(e) => setFreightForm({ ...freightForm, purchaseOrderId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shipment ID</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 512"
                      value={freightForm.shipmentId}
                      onChange={(e) => setFreightForm({ ...freightForm, shipmentId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Total Freight Cost *</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={freightForm.totalFreightCost}
                      onChange={(e) => setFreightForm({ ...freightForm, totalFreightCost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Customs Duties</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={freightForm.totalCustomsDuties}
                      onChange={(e) => setFreightForm({ ...freightForm, totalCustomsDuties: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Total Insurance Cost</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={freightForm.totalInsuranceCost}
                      onChange={(e) => setFreightForm({ ...freightForm, totalInsuranceCost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Handling Fees</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={freightForm.totalHandlingFees}
                      onChange={(e) => setFreightForm({ ...freightForm, totalHandlingFees: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Allocation Method</Label>
                  <Select
                    value={freightForm.allocationMethod}
                    onValueChange={(v: any) => setFreightForm({ ...freightForm, allocationMethod: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight">By Weight</SelectItem>
                      <SelectItem value="volume">By Volume</SelectItem>
                      <SelectItem value="quantity">By Quantity</SelectItem>
                      <SelectItem value="value">By Value</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFreightOpen(false)}>Cancel</Button>
                <Button onClick={handleAllocateFreight} disabled={allocateFreightMutation.isPending}>
                  Allocate Freight
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Update Cost Basis Dialog */}
          <Dialog open={costBasisOpen} onOpenChange={(open) => {
            setCostBasisOpen(open);
            if (!open) resetCostBasisForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <DollarSign className="h-4 w-4 mr-2" />
                Update Cost Basis
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Update Cost Basis</DialogTitle>
                <DialogDescription>
                  Record a receipt to recompute the weighted-average cost basis for a product at a warehouse.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Product ID *</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 42"
                      value={costBasisForm.productId}
                      onChange={(e) => setCostBasisForm({ ...costBasisForm, productId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Warehouse ID *</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 3"
                      value={costBasisForm.warehouseId}
                      onChange={(e) => setCostBasisForm({ ...costBasisForm, warehouseId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Received Quantity *</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={costBasisForm.receivedQuantity}
                      onChange={(e) => setCostBasisForm({ ...costBasisForm, receivedQuantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Cost *</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={costBasisForm.unitCost}
                      onChange={(e) => setCostBasisForm({ ...costBasisForm, unitCost: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCostBasisOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateCostBasis} disabled={updateCostBasisMutation.isPending}>
                  Update Cost Basis
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="profitability">
        <TabsList>
          <TabsTrigger value="profitability">
            <TrendingUp className="h-4 w-4 mr-2" />
            Profitability
          </TabsTrigger>
          <TabsTrigger value="valuation">
            <Warehouse className="h-4 w-4 mr-2" />
            Inventory Valuation
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Receipt className="h-4 w-4 mr-2" />
            COGS Transactions
          </TabsTrigger>
        </TabsList>

        {/* Profitability Tab */}
        <TabsContent value="profitability" className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={profitStart} onChange={(e) => setProfitStart(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={profitEnd} onChange={(e) => setProfitEnd(e.target.value)} className="w-44" />
            </div>
            {(profitStart || profitEnd) && (
              <Button variant="ghost" onClick={() => { setProfitStart(""); setProfitEnd(""); }}>Clear</Button>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Per-Product Profitability</CardTitle>
              <CardDescription>Revenue, cost of goods sold, and gross margin by product</CardDescription>
            </CardHeader>
            <CardContent>
              {profitLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading profitability...</div>
              ) : !profitability || profitability.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No profitability data for the selected range.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Units Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(profitability as any[]).map((row: any, i: number) => (
                      <TableRow key={row.productId ?? row.id ?? i}>
                        <TableCell className="font-medium">{row.productName ?? row.productId ?? "-"}</TableCell>
                        <TableCell>{row.sku ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.unitsSold ?? row.quantitySold ?? row.quantity ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.revenue ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.cogs ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.grossProfit ?? row.profit ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.margin ?? row.grossMargin ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Valuation Tab */}
        <TabsContent value="valuation" className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Warehouse ID</Label>
              <Input
                type="number"
                placeholder="All warehouses"
                value={valuationWarehouseId}
                onChange={(e) => setValuationWarehouseId(e.target.value)}
                className="w-44"
              />
            </div>
            {valuationWarehouseId && (
              <Button variant="ghost" onClick={() => setValuationWarehouseId("")}>Clear</Button>
            )}
          </div>
          {valuationLoading ? (
            <Card>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">Loading valuation...</div>
              </CardContent>
            </Card>
          ) : !valuation ? (
            <Card>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Warehouse className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No valuation data available.</p>
                </div>
              </CardContent>
            </Card>
          ) : valuationIsArray ? (
            <Card>
              <CardHeader>
                <CardTitle>Inventory Valuation</CardTitle>
                <CardDescription>On-hand value by product and warehouse</CardDescription>
              </CardHeader>
              <CardContent>
                {valuationRows.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No valuation rows.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuationRows.map((row: any, i: number) => (
                        <TableRow key={row.productId ?? row.id ?? i}>
                          <TableCell className="font-medium">{row.productName ?? row.productId ?? "-"}</TableCell>
                          <TableCell>{row.warehouseName ?? row.warehouseId ?? "-"}</TableCell>
                          <TableCell className="text-right">{row.quantity ?? row.onHand ?? "-"}</TableCell>
                          <TableCell className="text-right">{row.unitCost ?? row.costBasis ?? "-"}</TableCell>
                          <TableCell className="text-right">{row.totalValue ?? row.value ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tracking-[-0.02em]">{valuationObject?.totalValue ?? "-"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tracking-[-0.02em]">{valuationObject?.totalQuantity ?? valuationObject?.totalUnits ?? "-"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tracking-[-0.02em]">{valuationObject?.productCount ?? valuationObject?.totalProducts ?? "-"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Unit Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tracking-[-0.02em]">{valuationObject?.averageUnitCost ?? valuationObject?.avgUnitCost ?? "-"}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* COGS Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>COGS Transactions</CardTitle>
              <CardDescription>Cost of goods sold entries recorded against sales</CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
              ) : !transactions || transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No COGS transactions found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Sales Order</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(transactions as any[]).map((row: any, i: number) => (
                      <TableRow key={row.id ?? i}>
                        <TableCell>{row.date ?? row.createdAt ?? row.transactionDate ?? "-"}</TableCell>
                        <TableCell className="font-medium">{row.productName ?? row.productId ?? "-"}</TableCell>
                        <TableCell>{row.salesOrderNumber ?? row.salesOrderId ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.quantity ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.unitCost ?? row.costBasis ?? "-"}</TableCell>
                        <TableCell className="text-right">{row.totalCost ?? row.cogs ?? row.amount ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
