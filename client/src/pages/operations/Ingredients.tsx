import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Carrot, AlertTriangle, DollarSign } from "lucide-react";

type Category = "protein" | "spice" | "liquid" | "produce" | "packaging" | "other";
type UnitOfMeasure = "g" | "kg" | "lb" | "oz" | "ml" | "l" | "each";
type CostUnit = "per_lb" | "per_kg" | "per_oz" | "per_each";

export default function Ingredients() {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [costTarget, setCostTarget] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "other" as Category,
    unitOfMeasure: "g" as UnitOfMeasure,
    costPerUnit: "0",
    costUnit: "per_kg" as CostUnit,
    leadTimeDays: "",
    shelfLifeDays: "",
    isAllergen: false,
    allergenType: "",
    notes: "",
    isActive: true,
  });
  const [costForm, setCostForm] = useState({
    costPerUnit: "",
    costUnit: "per_kg" as CostUnit,
    effectiveDate: "",
    source: "",
  });

  const utils = trpc.useUtils();
  const { data: ingredients, isLoading } = trpc.ingredients.list.useQuery(
    categoryFilter !== "all" ? { category: categoryFilter } : undefined
  );

  const createMutation = trpc.ingredients.create.useMutation({
    onSuccess: () => {
      toast.success("Ingredient created successfully");
      setIsOpen(false);
      resetForm();
      utils.ingredients.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addCostMutation = trpc.ingredients.addCost.useMutation({
    onSuccess: () => {
      toast.success("Cost added successfully");
      setCostTarget(null);
      resetCostForm();
      utils.ingredients.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setFormData({
      name: "",
      sku: "",
      category: "other",
      unitOfMeasure: "g",
      costPerUnit: "0",
      costUnit: "per_kg",
      leadTimeDays: "",
      shelfLifeDays: "",
      isAllergen: false,
      allergenType: "",
      notes: "",
      isActive: true,
    });
  };

  const resetCostForm = () => {
    setCostForm({
      costPerUnit: "",
      costUnit: "per_kg",
      effectiveDate: "",
      source: "",
    });
  };

  const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }
    if (!formData.sku) {
      toast.error("SKU is required");
      return;
    }
    createMutation.mutate({
      name: formData.name,
      sku: formData.sku,
      category: formData.category,
      unitOfMeasure: formData.unitOfMeasure,
      costPerUnit: formData.costPerUnit,
      costUnit: formData.costUnit,
      leadTimeDays: numOrUndef(formData.leadTimeDays),
      shelfLifeDays: numOrUndef(formData.shelfLifeDays),
      isAllergen: formData.isAllergen,
      allergenType: formData.allergenType || undefined,
      notes: formData.notes || undefined,
      isActive: formData.isActive,
    });
  };

  const handleAddCost = () => {
    if (!costTarget) return;
    if (!costForm.costPerUnit) {
      toast.error("Cost per unit is required");
      return;
    }
    addCostMutation.mutate({
      ingredientId: costTarget.id,
      costPerUnit: costForm.costPerUnit,
      costUnit: costForm.costUnit,
      effectiveDate: costForm.effectiveDate ? new Date(costForm.effectiveDate) : undefined,
      source: costForm.source || undefined,
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "protein": return "bg-red-500/8 text-red-600 dark:text-red-400";
      case "spice": return "bg-orange-500/8 text-orange-600 dark:text-orange-400";
      case "liquid": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "produce": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "packaging": return "bg-violet-500/8 text-violet-600 dark:text-violet-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Ingredients</h1>
          <p className="text-muted-foreground">Manage ingredients, costs, and allergen data</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Ingredient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Ingredient</DialogTitle>
              <DialogDescription>Add a new ingredient with cost and allergen details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g., Chicken Breast"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SKU *</Label>
                  <Input
                    placeholder="e.g., ING-001"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v: any) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="protein">Protein</SelectItem>
                      <SelectItem value="spice">Spice</SelectItem>
                      <SelectItem value="liquid">Liquid</SelectItem>
                      <SelectItem value="produce">Produce</SelectItem>
                      <SelectItem value="packaging">Packaging</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Unit of Measure</Label>
                  <Select value={formData.unitOfMeasure} onValueChange={(v: any) => setFormData({ ...formData, unitOfMeasure: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">Grams (g)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="lb">Pounds (lb)</SelectItem>
                      <SelectItem value="oz">Ounces (oz)</SelectItem>
                      <SelectItem value="ml">Milliliters (ml)</SelectItem>
                      <SelectItem value="l">Liters (l)</SelectItem>
                      <SelectItem value="each">Each</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost Per Unit</Label>
                  <Input
                    placeholder="0.00"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cost Unit</Label>
                  <Select value={formData.costUnit} onValueChange={(v: any) => setFormData({ ...formData, costUnit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_lb">Per Pound</SelectItem>
                      <SelectItem value="per_kg">Per Kilogram</SelectItem>
                      <SelectItem value="per_oz">Per Ounce</SelectItem>
                      <SelectItem value="per_each">Per Each</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Lead Time (days)</Label>
                  <Input
                    type="number"
                    value={formData.leadTimeDays}
                    onChange={(e) => setFormData({ ...formData, leadTimeDays: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Shelf Life (days)</Label>
                  <Input
                    type="number"
                    value={formData.shelfLifeDays}
                    onChange={(e) => setFormData({ ...formData, shelfLifeDays: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={formData.isAllergen}
                      onCheckedChange={(checked) => setFormData({ ...formData, isAllergen: checked })}
                    />
                    <Label>Allergen</Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Allergen Type</Label>
                  <Input
                    placeholder="e.g., Peanut, Gluten"
                    value={formData.allergenType}
                    onChange={(e) => setFormData({ ...formData, allergenType: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional notes about this ingredient..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                Create Ingredient
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="protein">Protein</SelectItem>
            <SelectItem value="spice">Spice</SelectItem>
            <SelectItem value="liquid">Liquid</SelectItem>
            <SelectItem value="produce">Produce</SelectItem>
            <SelectItem value="packaging">Packaging</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ingredients Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Ingredients</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading ingredients...</div>
          ) : !ingredients || ingredients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Carrot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No ingredients found. Add your first ingredient.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Allergen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingredients.map((ing: any) => (
                  <TableRow key={ing.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Carrot className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{ing.name}</p>
                        {ing.isActive === false && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{ing.sku}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(ing.category)}>
                        {ing.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{ing.unitOfMeasure}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{ing.costPerUnit}</span>
                        <span className="text-xs text-muted-foreground"> {ing.costUnit}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ing.isAllergen ? (
                        <Badge className="bg-amber-500/8 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Allergen
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setCostTarget(ing);
                        resetCostForm();
                      }}>
                        <DollarSign className="h-4 w-4 mr-1" />
                        Add Cost
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Cost Dialog */}
      <Dialog open={!!costTarget} onOpenChange={(open) => {
        if (!open) {
          setCostTarget(null);
          resetCostForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cost</DialogTitle>
            <DialogDescription>
              {costTarget ? `Record a new cost for ${costTarget.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cost Per Unit *</Label>
                <Input
                  placeholder="0.00"
                  value={costForm.costPerUnit}
                  onChange={(e) => setCostForm({ ...costForm, costPerUnit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Unit</Label>
                <Select value={costForm.costUnit} onValueChange={(v: any) => setCostForm({ ...costForm, costUnit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_lb">Per Pound</SelectItem>
                    <SelectItem value="per_kg">Per Kilogram</SelectItem>
                    <SelectItem value="per_oz">Per Ounce</SelectItem>
                    <SelectItem value="per_each">Per Each</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={costForm.effectiveDate}
                onChange={(e) => setCostForm({ ...costForm, effectiveDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Input
                placeholder="e.g., Supplier quote, invoice"
                value={costForm.source}
                onChange={(e) => setCostForm({ ...costForm, source: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostTarget(null)}>Cancel</Button>
            <Button onClick={handleAddCost} disabled={addCostMutation.isPending}>
              Add Cost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
