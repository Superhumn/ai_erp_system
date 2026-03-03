import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCostVisibility } from "@/hooks/useCostVisibility";

export default function RawMaterials() {
  const { canSeeCosts } = useCostVisibility();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  const { data: materials, isLoading, refetch } = trpc.rawMaterials.list.useQuery(
    categoryFilter !== "all" ? { category: categoryFilter } : undefined
  );
  const { data: vendors } = trpc.vendors.list.useQuery();
  const utils = trpc.useUtils();
  
  const createMaterial = trpc.rawMaterials.create.useMutation({
    onSuccess: () => {
      toast.success("Raw material created");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const updateMaterial = trpc.rawMaterials.update.useMutation({
    onSuccess: () => {
      toast.success("Raw material updated");
      setEditingMaterial(null);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const deleteMaterial = trpc.rawMaterials.delete.useMutation({
    onSuccess: () => {
      toast.success("Raw material deleted");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  
  const [newMaterial, setNewMaterial] = useState({
    name: "",
    sku: "",
    description: "",
    category: "",
    unit: "kg",
    unitCost: "0",
    currency: "USD",
    minOrderQty: "1",
    leadTimeDays: 7,
    preferredVendorId: undefined as number | undefined,
    notes: "",
  });
  
  const handleCreate = () => {
    if (!newMaterial.name || !newMaterial.unit) {
      toast.error("Please enter name and unit");
      return;
    }
    createMaterial.mutate(newMaterial);
  };
  
  const handleUpdate = () => {
    if (!editingMaterial) return;
    updateMaterial.mutate({
      id: editingMaterial.id,
      ...editingMaterial,
    });
  };
  
  const categories = Array.from(new Set(materials?.map(m => m.category).filter(Boolean)));
  
  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Raw Materials</h1>
            <p className="text-muted-foreground">Manage ingredients and packaging materials for BOMs</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Raw Material</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input
                      value={newMaterial.name}
                      onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                      placeholder="e.g., Soy Protein Isolate"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input
                      value={newMaterial.sku}
                      onChange={(e) => setNewMaterial({ ...newMaterial, sku: e.target.value })}
                      placeholder="e.g., RM-SPI-001"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={newMaterial.category}
                      onChange={(e) => setNewMaterial({ ...newMaterial, category: e.target.value })}
                      placeholder="e.g., Protein, Spice, Packaging"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit *</Label>
                    <Select
                      value={newMaterial.unit}
                      onValueChange={(v) => setNewMaterial({ ...newMaterial, unit: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="lb">lb</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="mL">mL</SelectItem>
                        <SelectItem value="EA">EA (Each)</SelectItem>
                        <SelectItem value="case">Case</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Unit Cost</Label>
                    <Input
                      value={newMaterial.unitCost}
                      onChange={(e) => setNewMaterial({ ...newMaterial, unitCost: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                      value={newMaterial.currency}
                      onValueChange={(v) => setNewMaterial({ ...newMaterial, currency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="THB">THB</SelectItem>
                        <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Lead Time (days)</Label>
                    <Input
                      type="number"
                      value={newMaterial.leadTimeDays}
                      onChange={(e) => setNewMaterial({ ...newMaterial, leadTimeDays: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Vendor</Label>
                  <SelectWithCreate
                    value={newMaterial.preferredVendorId?.toString() || ""}
                    onValueChange={(v) => setNewMaterial({ 
                      ...newMaterial, 
                      preferredVendorId: v === "" ? undefined : parseInt(v) 
                    })}
                    placeholder="Select vendor (optional)"
                    items={vendors?.map((v) => ({
                      id: v.id,
                      label: v.name,
                    })) || []}
                    entityType="vendor"
                    onEntityCreated={() => {
                      utils.vendors.list.invalidate();
                    }}
                    emptyMessage="No vendors available"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={newMaterial.description}
                    onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })}
                    placeholder="Optional description..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createMaterial.isPending}>
                    {createMaterial.isPending ? "Creating..." : "Add Material"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Filters */}
        <div className="flex gap-4">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat || "uncategorized"}>
                  {cat || "Uncategorized"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Materials Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  {canSeeCosts && <TableHead className="text-right">Unit Cost</TableHead>}
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : materials?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No raw materials found. Add materials to use in your BOMs.
                    </TableCell>
                  </TableRow>
                ) : (
                  materials?.map((mat) => (
                    <TableRow key={mat.id}>
                      <TableCell className="font-mono text-sm">{mat.sku || "-"}</TableCell>
                      <TableCell className="font-medium">{mat.name}</TableCell>
                      <TableCell>{mat.category || "-"}</TableCell>
                      <TableCell>{mat.unit}</TableCell>
                      {canSeeCosts && (
                        <TableCell className="text-right">
                          {mat.currency} {parseFloat(mat.unitCost?.toString() || "0").toFixed(4)}
                        </TableCell>
                      )}
                      <TableCell>{mat.leadTimeDays || 0} days</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            mat.status === "active"
                              ? "bg-green-100 text-green-800"
                              : mat.status === "inactive"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {mat.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingMaterial(mat)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Delete this material?")) {
                                deleteMaterial.mutate({ id: mat.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        {/* Edit Dialog */}
        <Dialog open={!!editingMaterial} onOpenChange={() => setEditingMaterial(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Raw Material</DialogTitle>
            </DialogHeader>
            {editingMaterial && (
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={editingMaterial.name}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input
                      value={editingMaterial.sku || ""}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, sku: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit Cost</Label>
                    <Input
                      value={editingMaterial.unitCost || ""}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, unitCost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={editingMaterial.status}
                      onValueChange={(v) => setEditingMaterial({ ...editingMaterial, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="discontinued">Discontinued</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setEditingMaterial(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdate} disabled={updateMaterial.isPending}>
                    {updateMaterial.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
}
