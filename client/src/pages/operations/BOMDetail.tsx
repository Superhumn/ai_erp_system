import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowLeft, Trash2, Calculator, Package, History, Save, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function BOMDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const bomId = parseInt(params.id || "0");
  
  const [isAddComponentOpen, setIsAddComponentOpen] = useState(false);
  const [editingBom, setEditingBom] = useState(false);
  
  const { data: bom, isLoading, refetch } = trpc.bom.get.useQuery({ id: bomId });
  const { data: products } = trpc.products.list.useQuery();
  const { data: rawMaterials } = trpc.rawMaterials.list.useQuery();
  
  const updateBom = trpc.bom.update.useMutation({
    onSuccess: () => {
      toast.success("BOM updated");
      setEditingBom(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const addComponent = trpc.bom.addComponent.useMutation({
    onSuccess: () => {
      toast.success("Component added");
      setIsAddComponentOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const updateComponent = trpc.bom.updateComponent.useMutation({
    onSuccess: () => {
      toast.success("Component updated");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const deleteComponent = trpc.bom.deleteComponent.useMutation({
    onSuccess: () => {
      toast.success("Component removed");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const calculateCosts = trpc.bom.calculateCosts.useMutation({
    onSuccess: (result) => {
      if (result) {
        toast.success(`Costs calculated: $${result.totalCost.toFixed(2)}`);
      }
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const [newComponent, setNewComponent] = useState({
    componentType: "raw_material" as "product" | "raw_material" | "packaging" | "labor",
    productId: undefined as number | undefined,
    rawMaterialId: undefined as number | undefined,
    name: "",
    sku: "",
    quantity: "1",
    unit: "EA",
    wastagePercent: "0",
    unitCost: "0",
    leadTimeDays: 0,
    isOptional: false,
    notes: "",
  });
  
  const [bomEdits, setBomEdits] = useState({
    name: "",
    version: "",
    batchSize: "",
    batchUnit: "",
    laborCost: "",
    overheadCost: "",
    notes: "",
  });
  
  const handleAddComponent = () => {
    if (!newComponent.name || !newComponent.quantity) {
      toast.error("Please enter component name and quantity");
      return;
    }
    addComponent.mutate({
      bomId,
      ...newComponent,
    });
  };
  
  const handleActivate = () => {
    updateBom.mutate({ id: bomId, status: "active" });
  };
  
  const startEditing = () => {
    if (bom) {
      setBomEdits({
        name: bom.name,
        version: bom.version || "1.0",
        batchSize: bom.batchSize?.toString() || "1",
        batchUnit: bom.batchUnit || "EA",
        laborCost: bom.laborCost?.toString() || "0",
        overheadCost: bom.overheadCost?.toString() || "0",
        notes: bom.notes || "",
      });
      setEditingBom(true);
    }
  };
  
  const saveEdits = () => {
    updateBom.mutate({ id: bomId, ...bomEdits });
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "draft":
        return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
      case "obsolete":
        return <Badge className="bg-gray-100 text-gray-800">Obsolete</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  if (isLoading) {
    return (
      <div className="p-6">Loading...</div>
    );
  }
  
  if (!bom) {
    return (
      <div className="p-6">
          <p>BOM not found</p>
          <Button onClick={() => navigate("/operations/bom")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to BOMs
          </Button>
        </div>
    );
  }
  
  const materialCost = parseFloat(bom.totalMaterialCost?.toString() || "0");
  const laborCost = parseFloat(bom.laborCost?.toString() || "0");
  const overheadCost = parseFloat(bom.overheadCost?.toString() || "0");
  const totalCost = parseFloat(bom.totalCost?.toString() || "0");
  
  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/operations/bom")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{bom.name}</h1>
                {getStatusBadge(bom.status)}
              </div>
              <p className="text-muted-foreground">
                {bom.product?.name} ({bom.product?.sku}) • Version {bom.version}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => calculateCosts.mutate({ id: bomId })}>
              <Calculator className="h-4 w-4 mr-2" />
              Recalculate
            </Button>
            {bom.status === "draft" && (
              <Button onClick={handleActivate}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
          </div>
        </div>
        
        <Tabs defaultValue="components">
          <TabsList>
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
            <TabsTrigger value="details">BOM Details</TabsTrigger>
            <TabsTrigger value="history">Version History</TabsTrigger>
          </TabsList>
          
          {/* Components Tab */}
          <TabsContent value="components" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Components ({bom.components?.length || 0})</h2>
              <Dialog open={isAddComponentOpen} onOpenChange={setIsAddComponentOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Component
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Component</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Component Type</Label>
                      <Select
                        value={newComponent.componentType}
                        onValueChange={(v: any) => setNewComponent({ ...newComponent, componentType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="raw_material">Raw Material</SelectItem>
                          <SelectItem value="product">Sub-Assembly (Product)</SelectItem>
                          <SelectItem value="packaging">Packaging</SelectItem>
                          <SelectItem value="labor">Labor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {newComponent.componentType === "product" && (
                      <div className="space-y-2">
                        <Label>Select Product</Label>
                        <Select
                          value={newComponent.productId?.toString() || ""}
                          onValueChange={(v) => {
                            const prod = products?.find(p => p.id === parseInt(v));
                            setNewComponent({
                              ...newComponent,
                              productId: parseInt(v),
                              name: prod?.name || "",
                              sku: prod?.sku || "",
                              unitCost: prod?.costPrice?.toString() || "0",
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.sku} - {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {newComponent.componentType === "raw_material" && (
                      <div className="space-y-2">
                        <Label>Select Raw Material (or enter manually)</Label>
                        <Select
                          value={newComponent.rawMaterialId?.toString() || "manual"}
                          onValueChange={(v) => {
                            if (v === "manual") {
                              setNewComponent({ ...newComponent, rawMaterialId: undefined });
                            } else {
                              const mat = rawMaterials?.find(m => m.id === parseInt(v));
                              setNewComponent({
                                ...newComponent,
                                rawMaterialId: parseInt(v),
                                name: mat?.name || "",
                                sku: mat?.sku || "",
                                unit: mat?.unit || "EA",
                                unitCost: mat?.unitCost?.toString() || "0",
                              });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select or enter manually" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Enter Manually</SelectItem>
                            {rawMaterials?.map((m) => (
                              <SelectItem key={m.id} value={m.id.toString()}>
                                {m.sku || m.name} - {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Name *</Label>
                        <Input
                          value={newComponent.name}
                          onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                          placeholder="Component name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>SKU</Label>
                        <Input
                          value={newComponent.sku}
                          onChange={(e) => setNewComponent({ ...newComponent, sku: e.target.value })}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Quantity *</Label>
                        <Input
                          value={newComponent.quantity}
                          onChange={(e) => setNewComponent({ ...newComponent, quantity: e.target.value })}
                          placeholder="1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit</Label>
                        <Input
                          value={newComponent.unit}
                          onChange={(e) => setNewComponent({ ...newComponent, unit: e.target.value })}
                          placeholder="EA"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit Cost</Label>
                        <Input
                          value={newComponent.unitCost}
                          onChange={(e) => setNewComponent({ ...newComponent, unitCost: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Wastage %</Label>
                        <Input
                          value={newComponent.wastagePercent}
                          onChange={(e) => setNewComponent({ ...newComponent, wastagePercent: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Lead Time (days)</Label>
                        <Input
                          type="number"
                          value={newComponent.leadTimeDays}
                          onChange={(e) => setNewComponent({ ...newComponent, leadTimeDays: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setIsAddComponentOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddComponent} disabled={addComponent.isPending}>
                        {addComponent.isPending ? "Adding..." : "Add Component"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Component</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Wastage</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.components?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No components added yet. Click "Add Component" to start building your BOM.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bom.components?.map((comp) => (
                        <TableRow key={comp.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {comp.componentType?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{comp.name}</TableCell>
                          <TableCell className="text-muted-foreground">{comp.sku || "-"}</TableCell>
                          <TableCell className="text-right">{comp.quantity}</TableCell>
                          <TableCell>{comp.unit}</TableCell>
                          <TableCell className="text-right">
                            ${parseFloat(comp.unitCost?.toString() || "0").toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right">{comp.wastagePercent || 0}%</TableCell>
                          <TableCell className="text-right font-medium">
                            ${parseFloat(comp.totalCost?.toString() || "0").toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Remove this component?")) {
                                  deleteComponent.mutate({ id: comp.id, bomId });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Cost Analysis Tab */}
          <TabsContent value="costs" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between w-full">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Material Cost</CardTitle>
                  <AITriggerButton message="Analyze this BOM in detail - optimize component costs, identify supply risks, and suggest improvements" label="AI Analysis" />
                </div>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">${materialCost.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Labor Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">${laborCost.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Overhead Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">${overheadCost.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card className="bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Cost per Batch</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-primary">${totalCost.toFixed(2)}</span>
                  <p className="text-sm text-muted-foreground">
                    Per {bom.batchSize} {bom.batchUnit}
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown by Component</CardTitle>
              </CardHeader>
              <CardContent>
                {bom.components?.length === 0 ? (
                  <p className="text-muted-foreground">Add components to see cost breakdown</p>
                ) : (
                  <div className="space-y-2">
                    {bom.components?.map((comp) => {
                      const compCost = parseFloat(comp.totalCost?.toString() || "0");
                      const percentage = totalCost > 0 ? (compCost / materialCost) * 100 : 0;
                      return (
                        <div key={comp.id} className="p-6 flex items-center gap-4">
                          <div className="w-48 truncate">{comp.name}</div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>
                          <div className="w-20 text-right">${compCost.toFixed(2)}</div>
                          <div className="w-16 text-right text-muted-foreground">
                            {percentage.toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>BOM Details</CardTitle>
                  <CardDescription>Edit bill of materials information</CardDescription>
                </div>
                {!editingBom ? (
                  <Button variant="outline" onClick={startEditing}>Edit</Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditingBom(false)}>Cancel</Button>
                    <Button onClick={saveEdits}>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {editingBom ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>BOM Name</Label>
                        <Input
                          value={bomEdits.name}
                          onChange={(e) => setBomEdits({ ...bomEdits, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Version</Label>
                        <Input
                          value={bomEdits.version}
                          onChange={(e) => setBomEdits({ ...bomEdits, version: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Batch Size</Label>
                        <Input
                          value={bomEdits.batchSize}
                          onChange={(e) => setBomEdits({ ...bomEdits, batchSize: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Batch Unit</Label>
                        <Input
                          value={bomEdits.batchUnit}
                          onChange={(e) => setBomEdits({ ...bomEdits, batchUnit: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Labor Cost</Label>
                        <Input
                          value={bomEdits.laborCost}
                          onChange={(e) => setBomEdits({ ...bomEdits, laborCost: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Overhead Cost</Label>
                        <Input
                          value={bomEdits.overheadCost}
                          onChange={(e) => setBomEdits({ ...bomEdits, overheadCost: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        value={bomEdits.notes}
                        onChange={(e) => setBomEdits({ ...bomEdits, notes: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label className="text-muted-foreground">Product</Label>
                      <p className="font-medium">{bom.product?.name}</p>
                      <p className="text-sm text-muted-foreground">{bom.product?.sku}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Version</Label>
                      <p className="font-medium">{bom.version}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Batch Size</Label>
                      <p className="font-medium">{bom.batchSize} {bom.batchUnit}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <div className="mt-1">{getStatusBadge(bom.status)}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Labor Cost</Label>
                      <p className="font-medium">${laborCost.toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Overhead Cost</Label>
                      <p className="font-medium">${overheadCost.toFixed(2)}</p>
                    </div>
                    {bom.notes && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground">Notes</Label>
                        <p>{bom.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Version History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bom.history?.length === 0 ? (
                  <p className="text-muted-foreground">No version history available</p>
                ) : (
                  <div className="space-y-4">
                    {bom.history?.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                        <div className="w-16 text-sm font-medium">v{entry.version}</div>
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-1">
                            {entry.changeType}
                          </Badge>
                          <p className="text-sm">{entry.changeDescription}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(entry.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
