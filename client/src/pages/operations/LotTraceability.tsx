import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Package, Truck, Factory, ArrowRight, Search, GitBranch } from "lucide-react";
import { toast } from "sonner";

export default function LotTraceability() {
  const [activeTab, setActiveTab] = useState("trace");
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [isLinkSupplierOpen, setIsLinkSupplierOpen] = useState(false);
  const [isLinkProductionOpen, setIsLinkProductionOpen] = useState(false);
  const [isLinkShipmentOpen, setIsLinkShipmentOpen] = useState(false);

  const { data: products } = trpc.products.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();

  const { data: traceData, refetch: refetchTrace } = trpc.lotTrace.getFullTrace.useQuery(
    { lotId: selectedLotId! },
    { enabled: !!selectedLotId }
  );

  // Supplier link form
  const [supplierForm, setSupplierForm] = useState({
    vendorId: 0,
    vendorLotCode: "",
    receivedQuantity: "",
    unit: "LB",
    notes: "",
  });

  // Production link form
  const [prodForm, setProdForm] = useState({
    workOrderId: 0,
    inputLotId: 0,
    outputLotId: 0,
    inputProductId: 0,
    outputProductId: 0,
    quantityConsumed: "",
    unit: "LB",
  });

  // Shipment link form
  const [shipForm, setShipForm] = useState({
    customerId: 0,
    quantityShipped: "",
    unit: "LB",
    notes: "",
  });

  const addSupplierLink = trpc.lotTrace.addSupplierLink.useMutation({
    onSuccess: () => { toast.success("Supplier lot linked"); setIsLinkSupplierOpen(false); refetchTrace(); },
    onError: (e) => toast.error(e.message),
  });

  const addProductionLink = trpc.lotTrace.addProductionLink.useMutation({
    onSuccess: () => { toast.success("Production link added"); setIsLinkProductionOpen(false); refetchTrace(); },
    onError: (e) => toast.error(e.message),
  });

  const addCustomerShipment = trpc.lotTrace.addCustomerShipment.useMutation({
    onSuccess: () => { toast.success("Customer shipment linked"); setIsLinkShipmentOpen(false); refetchTrace(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lot Traceability</h1>
        <p className="text-muted-foreground">Track lots from supplier through production to customer — full FDA/FSMA forward and backward trace</p>
      </div>

      {/* Lot selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label>Enter Lot ID</Label>
              <Input
                type="number"
                value={selectedLotId || ""}
                onChange={e => setSelectedLotId(Number(e.target.value) || null)}
                placeholder="Enter a lot ID to trace"
              />
            </div>
            <Button onClick={() => refetchTrace()} disabled={!selectedLotId}>
              <Search className="h-4 w-4 mr-2" />Trace Lot
            </Button>
          </div>
        </CardContent>
      </Card>

      {traceData && traceData.lot && (
        <>
          {/* Lot header info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Lot: {traceData.lot.lotCode}
                </CardTitle>
                <Badge variant={traceData.lot.status === "active" ? "default" : "secondary"}>
                  {traceData.lot.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block">Product</span>
                  <span className="font-medium">{products?.find(p => p.id === traceData.lot!.productId)?.name || traceData.lot.productId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Type</span>
                  <span className="capitalize">{traceData.lot.productType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Source</span>
                  <span className="capitalize">{traceData.lot.sourceType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Manufacture Date</span>
                  <span>{traceData.lot.manufactureDate ? new Date(traceData.lot.manufactureDate).toLocaleDateString() : "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Expiry Date</span>
                  <span>{traceData.lot.expiryDate ? new Date(traceData.lot.expiryDate).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trace visualization */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* UPSTREAM: Supplier */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Truck className="h-4 w-4" /> Supplier Origin
                  </CardTitle>
                  <Dialog open={isLinkSupplierOpen} onOpenChange={setIsLinkSupplierOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"><Plus className="h-3 w-3" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Link Supplier Lot</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Vendor *</Label>
                          <Select value={supplierForm.vendorId?.toString() || ""} onValueChange={v => setSupplierForm(p => ({ ...p, vendorId: Number(v) }))}>
                            <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                            <SelectContent>
                              {vendors?.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Vendor Lot Code *</Label>
                          <Input value={supplierForm.vendorLotCode} onChange={e => setSupplierForm(p => ({ ...p, vendorLotCode: e.target.value }))} placeholder="Vendor's lot/batch number" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Received Qty</Label>
                            <Input value={supplierForm.receivedQuantity} onChange={e => setSupplierForm(p => ({ ...p, receivedQuantity: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <Select value={supplierForm.unit} onValueChange={v => setSupplierForm(p => ({ ...p, unit: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LB">LB</SelectItem>
                                <SelectItem value="KG">KG</SelectItem>
                                <SelectItem value="EA">EA</SelectItem>
                                <SelectItem value="GAL">GAL</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <Button onClick={() => {
                        if (!supplierForm.vendorId || !supplierForm.vendorLotCode) { toast.error("Vendor and lot code required"); return; }
                        addSupplierLink.mutate({ lotId: selectedLotId!, ...supplierForm, receivedQuantity: supplierForm.receivedQuantity || undefined });
                      }} disabled={addSupplierLink.isPending}>
                        Link Supplier Lot
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {traceData.supplierLinks.length > 0 ? (
                  traceData.supplierLinks.map(sl => (
                    <div key={sl.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{vendors?.find(v => v.id === sl.vendorId)?.name || `Vendor #${sl.vendorId}`}</span>
                      </div>
                      <p className="text-sm font-mono text-muted-foreground">Lot: {sl.vendorLotCode}</p>
                      {sl.receivedQuantity && <p className="text-sm">{sl.receivedQuantity} {sl.unit}</p>}
                      {sl.receivedDate && <p className="text-xs text-muted-foreground">Received: {new Date(sl.receivedDate).toLocaleDateString()}</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No supplier links recorded</p>
                )}
              </CardContent>
            </Card>

            {/* MIDSTREAM: Production */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Factory className="h-4 w-4" /> Production Links
                  </CardTitle>
                  <Dialog open={isLinkProductionOpen} onOpenChange={setIsLinkProductionOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"><Plus className="h-3 w-3" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Link Production</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Work Order ID *</Label>
                          <Input type="number" value={prodForm.workOrderId || ""} onChange={e => setProdForm(p => ({ ...p, workOrderId: Number(e.target.value) }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Input Lot ID (consumed)</Label>
                            <Input type="number" value={prodForm.inputLotId || ""} onChange={e => setProdForm(p => ({ ...p, inputLotId: Number(e.target.value) }))} />
                          </div>
                          <div>
                            <Label>Output Lot ID (produced)</Label>
                            <Input type="number" value={prodForm.outputLotId || ""} onChange={e => setProdForm(p => ({ ...p, outputLotId: Number(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Input Product</Label>
                            <Select value={prodForm.inputProductId?.toString() || ""} onValueChange={v => setProdForm(p => ({ ...p, inputProductId: Number(v) }))}>
                              <SelectTrigger><SelectValue placeholder="Raw material" /></SelectTrigger>
                              <SelectContent>
                                {products?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Output Product</Label>
                            <Select value={prodForm.outputProductId?.toString() || ""} onValueChange={v => setProdForm(p => ({ ...p, outputProductId: Number(v) }))}>
                              <SelectTrigger><SelectValue placeholder="Finished good" /></SelectTrigger>
                              <SelectContent>
                                {products?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Qty Consumed *</Label>
                            <Input value={prodForm.quantityConsumed} onChange={e => setProdForm(p => ({ ...p, quantityConsumed: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <Select value={prodForm.unit} onValueChange={v => setProdForm(p => ({ ...p, unit: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LB">LB</SelectItem>
                                <SelectItem value="KG">KG</SelectItem>
                                <SelectItem value="EA">EA</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <Button onClick={() => {
                        if (!prodForm.workOrderId || !prodForm.inputLotId || !prodForm.outputLotId || !prodForm.quantityConsumed) { toast.error("All fields required"); return; }
                        addProductionLink.mutate(prodForm);
                      }} disabled={addProductionLink.isPending}>
                        Link Production
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* This lot was produced from these input lots */}
                {traceData.productionOutputs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Made From (Inputs)</p>
                    {traceData.productionOutputs.map(pl => (
                      <div key={pl.id} className="p-3 rounded-lg border space-y-1 mb-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline">WO #{pl.workOrderId}</Badge>
                          <span>Lot #{pl.inputLotId}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium">This Lot</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{pl.quantityConsumed} {pl.unit} consumed</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* This lot was consumed to make these output lots */}
                {traceData.productionInputs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Used To Make (Outputs)</p>
                    {traceData.productionInputs.map(pl => (
                      <div key={pl.id} className="p-3 rounded-lg border space-y-1 mb-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">This Lot</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>Lot #{pl.outputLotId}</span>
                          <Badge variant="outline">WO #{pl.workOrderId}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{pl.quantityConsumed} {pl.unit} consumed</p>
                      </div>
                    ))}
                  </div>
                )}
                {traceData.productionOutputs.length === 0 && traceData.productionInputs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No production links recorded</p>
                )}
              </CardContent>
            </Card>

            {/* DOWNSTREAM: Customer Shipments */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" /> Customer Shipments
                  </CardTitle>
                  <Dialog open={isLinkShipmentOpen} onOpenChange={setIsLinkShipmentOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"><Plus className="h-3 w-3" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Link Customer Shipment</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Customer *</Label>
                          <Select value={shipForm.customerId?.toString() || ""} onValueChange={v => setShipForm(p => ({ ...p, customerId: Number(v) }))}>
                            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                            <SelectContent>
                              {customers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Qty Shipped *</Label>
                            <Input value={shipForm.quantityShipped} onChange={e => setShipForm(p => ({ ...p, quantityShipped: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <Select value={shipForm.unit} onValueChange={v => setShipForm(p => ({ ...p, unit: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LB">LB</SelectItem>
                                <SelectItem value="KG">KG</SelectItem>
                                <SelectItem value="EA">EA</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input value={shipForm.notes} onChange={e => setShipForm(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                      </div>
                      <Button onClick={() => {
                        if (!shipForm.customerId || !shipForm.quantityShipped) { toast.error("Customer and quantity required"); return; }
                        addCustomerShipment.mutate({ lotId: selectedLotId!, ...shipForm });
                      }} disabled={addCustomerShipment.isPending}>
                        Link Shipment
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {traceData.customerShipments.length > 0 ? (
                  traceData.customerShipments.map(cs => (
                    <div key={cs.id} className="p-3 rounded-lg border space-y-1">
                      <span className="font-medium">{customers?.find(c => c.id === cs.customerId)?.name || `Customer #${cs.customerId}`}</span>
                      <p className="text-sm">{cs.quantityShipped} {cs.unit}</p>
                      {cs.shippedDate && <p className="text-xs text-muted-foreground">Shipped: {new Date(cs.shippedDate).toLocaleDateString()}</p>}
                      {cs.notes && <p className="text-xs text-muted-foreground">{cs.notes}</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No customer shipments recorded</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{traceData.supplierLinks.length}</p>
                <p className="text-sm text-muted-foreground">Supplier Lots</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{traceData.productionOutputs.length}</p>
                <p className="text-sm text-muted-foreground">Input Lots</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{traceData.productionInputs.length}</p>
                <p className="text-sm text-muted-foreground">Output Lots</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{traceData.customerShipments.length}</p>
                <p className="text-sm text-muted-foreground">Customer Shipments</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {selectedLotId && traceData && !traceData.lot && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Lot #{selectedLotId} not found. Enter a valid lot ID.</CardContent></Card>
      )}

      {!selectedLotId && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Enter a lot ID above to trace its full journey — from supplier through production to customer delivery.
        </CardContent></Card>
      )}
    </div>
  );
}
