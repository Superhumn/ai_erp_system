import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Eye, Trash2, Package, FileText, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function BOM() {
  const [, navigate] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const utils = trpc.useUtils();
  const { data: boms, isLoading } = trpc.bom.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const { data: products } = trpc.products.list.useQuery();

  const createBom = trpc.bom.create.useMutation({
    onSuccess: (result) => {
      toast.success("BOM created successfully");
      setIsCreateOpen(false);
      utils.bom.list.invalidate();
      navigate(`/operations/bom/${result.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const deleteBom = trpc.bom.delete.useMutation({
    onSuccess: () => {
      toast.success("BOM deleted");
      utils.bom.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const [newBom, setNewBom] = useState({
    productId: 0,
    name: "",
    version: "1.0",
    batchSize: "1",
    batchUnit: "EA",
    notes: "",
  });
  
  const handleCreate = () => {
    if (!newBom.productId || !newBom.name) {
      toast.error("Please select a product and enter a name");
      return;
    }
    createBom.mutate(newBom);
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-primary/10 text-primary">Active</Badge>;
      case "draft":
        return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
      case "obsolete":
        return <Badge className="bg-muted text-muted-foreground">Obsolete</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  // Summary stats
  const activeBoms = boms?.filter(b => b.status === "active").length || 0;
  const draftBoms = boms?.filter(b => b.status === "draft").length || 0;
  const totalBoms = boms?.length || 0;
  
  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Bill of Materials</h1>
            <p className="text-muted-foreground">Manage product recipes and component lists</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New BOM
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Bill of Materials</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Product *</Label>
                  <SelectWithCreate
                    value={newBom.productId === 0 ? "" : newBom.productId.toString()}
                    onValueChange={(v) => {
                      const product = products?.find(p => p.id === parseInt(v));
                      setNewBom({ 
                        ...newBom, 
                        productId: parseInt(v),
                        name: product ? `${product.name} BOM` : newBom.name
                      });
                    }}
                    placeholder="Select product"
                    items={products?.map((p) => ({
                      id: p.id,
                      label: `${p.sku} - ${p.name}`,
                    })) || []}
                    entityType="product"
                    onEntityCreated={() => {
                      utils.products.list.invalidate();
                    }}
                    emptyMessage="No products available. Create one to continue."
                  />
                </div>
                <div className="space-y-2">
                  <Label>BOM Name *</Label>
                  <Input
                    value={newBom.name}
                    onChange={(e) => setNewBom({ ...newBom, name: e.target.value })}
                    placeholder="e.g., Beef Barbacoa 8oz Recipe"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Version</Label>
                    <Input
                      value={newBom.version}
                      onChange={(e) => setNewBom({ ...newBom, version: e.target.value })}
                      placeholder="1.0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Batch Size</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newBom.batchSize}
                        onChange={(e) => setNewBom({ ...newBom, batchSize: e.target.value })}
                        placeholder="1"
                        className="w-20"
                      />
                      <Input
                        value={newBom.batchUnit}
                        onChange={(e) => setNewBom({ ...newBom, batchUnit: e.target.value })}
                        placeholder="EA"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={newBom.notes}
                    onChange={(e) => setNewBom({ ...newBom, notes: e.target.value })}
                    placeholder="Optional notes..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createBom.isPending}>
                    {createBom.isPending ? "Creating..." : "Create BOM"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total BOMs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{totalBoms}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active BOMs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <span className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{activeBoms}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Draft BOMs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-muted-foreground" />
                <span className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{draftBoms}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Filters */}
        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="obsolete">Obsolete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* BOM Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>BOM Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Batch Size</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : boms?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No BOMs found. Create your first bill of materials.
                    </TableCell>
                  </TableRow>
                ) : (
                  boms?.map((bom) => {
                    const product = products?.find(p => p.id === bom.productId);
                    return (
                      <TableRow key={bom.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{product?.name || "Unknown"}</div>
                            <div className="text-sm text-muted-foreground">{product?.sku}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <button className="text-left hover:underline" onClick={() => navigate(`/operations/bom/${bom.id}`)}>
                            {bom.name}
                          </button>
                        </TableCell>
                        <TableCell>{bom.version}</TableCell>
                        <TableCell>
                          {bom.batchSize} {bom.batchUnit}
                        </TableCell>
                        <TableCell>
                          {bom.totalCost ? `$${parseFloat(bom.totalCost).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(bom.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/operations/bom/${bom.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Delete this BOM?")) {
                                  deleteBom.mutate({ id: bom.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
  );
}
