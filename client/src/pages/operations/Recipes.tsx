import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calculator, Link2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Recipes() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [formulation, setFormulation] = useState<"wet" | "dry">("wet");
  const [newRecipe, setNewRecipe] = useState({
    recipeId: "",
    name: "",
    category: "other",
    status: "development",
    baseBatchGrams: "1000",
    expectedYieldPct: "1.0000",
    isSubRecipe: false,
    hasMoistureVariants: false,
  });

  const recipeQueryInput = statusFilter === "all" ? undefined : { status: statusFilter };
  const { data: recipes, isLoading, refetch } = trpc.recipes.list.useQuery(recipeQueryInput);
  const { data: products } = trpc.products.list.useQuery({});
  const batchCost = trpc.recipes.batchCost.useQuery(
    selectedRecipeId ? { id: selectedRecipeId, formulation } : undefined as any,
    { enabled: !!selectedRecipeId },
  );

  const createRecipe = trpc.recipes.create.useMutation({
    onSuccess: () => {
      toast.success("Recipe created");
      setCreateOpen(false);
      setNewRecipe({
        recipeId: "",
        name: "",
        category: "other",
        status: "development",
        baseBatchGrams: "1000",
        expectedYieldPct: "1.0000",
        isSubRecipe: false,
        hasMoistureVariants: false,
      });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const saveSnapshot = trpc.recipes.saveBatchSnapshot.useMutation({
    onSuccess: () => toast.success("Batch cost snapshot saved"),
    onError: (err) => toast.error(err.message),
  });

  const syncToBom = trpc.recipes.syncToBom.useMutation({
    onSuccess: (r) => {
      toast.success(`BOM #${r.bomId} synced (${r.componentCount} components)`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedRecipe = useMemo(
    () => recipes?.find((r) => r.id === selectedRecipeId),
    [recipes, selectedRecipeId],
  );

  const [syncProductId, setSyncProductId] = useState<string>("");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Recipe Costing</h1>
          <p className="text-muted-foreground">Manage formulations, batch costing, and yield-adjusted costs</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Recipe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Recipe</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Recipe ID</Label>
                  <Input value={newRecipe.recipeId} onChange={(e) => setNewRecipe({ ...newRecipe, recipeId: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={newRecipe.name} onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={newRecipe.category} onValueChange={(v) => setNewRecipe({ ...newRecipe, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["beef", "pork", "chicken", "seafood", "dairy", "blend", "other"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={newRecipe.status} onValueChange={(v) => setNewRecipe({ ...newRecipe, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["development", "production", "discontinued"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Base Batch (g)</Label>
                  <Input value={newRecipe.baseBatchGrams} onChange={(e) => setNewRecipe({ ...newRecipe, baseBatchGrams: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Expected Yield %</Label>
                  <Input value={newRecipe.expectedYieldPct} onChange={(e) => setNewRecipe({ ...newRecipe, expectedYieldPct: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={createRecipe.isPending}
                  onClick={() => createRecipe.mutate(newRecipe as any)}
                >
                  Create Recipe
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="discontinued">Discontinued</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipe ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Batch (g)</TableHead>
                <TableHead className="text-right">Yield %</TableHead>
                <TableHead>BOM</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center">Loading...</TableCell></TableRow>
              ) : recipes?.length ? recipes.map((recipe) => (
                <TableRow key={recipe.id}>
                  <TableCell className="font-mono text-xs">{recipe.recipeId}</TableCell>
                  <TableCell>{recipe.name}</TableCell>
                  <TableCell>{recipe.category}</TableCell>
                  <TableCell><Badge>{recipe.status}</Badge></TableCell>
                  <TableCell className="text-right">{recipe.baseBatchGrams}</TableCell>
                  <TableCell className="text-right">{(parseFloat(recipe.expectedYieldPct?.toString() || "0") * 100).toFixed(1)}%</TableCell>
                  <TableCell>
                    {(recipe as { bomId?: number | null }).bomId ? (
                      <Badge variant="secondary">#{String((recipe as { bomId?: number }).bomId)}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRecipeId(recipe.id)}>
                      <Calculator className="h-4 w-4 mr-1" />
                      Cost
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No recipes yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedRecipeId && selectedRecipe && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">{selectedRecipe.name} Costing</h3>
                <p className="text-sm text-muted-foreground">Live batch cost by formulation</p>
                {(selectedRecipe as { bomId?: number | null }).bomId != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Linked BOM #{(selectedRecipe as { bomId: number }).bomId}
                    {(selectedRecipe as { outputProductId?: number | null }).outputProductId != null &&
                      ` · Product #${String((selectedRecipe as { outputProductId: number }).outputProductId)}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={formulation} onValueChange={(v: "wet" | "dry") => setFormulation(v)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wet">Wet</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={saveSnapshot.isPending}
                  onClick={() => saveSnapshot.mutate({ recipeId: selectedRecipeId, formulationType: formulation })}
                >
                  Save Snapshot
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 border rounded-lg p-3 bg-muted/30">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label className="text-xs">Finished product (BOM output)</Label>
                <Select value={syncProductId} onValueChange={setSyncProductId}>
                  <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                  <SelectContent>
                    {(products as { id: number; name: string; sku?: string }[] | undefined)?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} {p.sku ? `(${p.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={!syncProductId || !selectedRecipeId || syncToBom.isPending}
                onClick={() => {
                  if (!selectedRecipeId || !syncProductId) return;
                  syncToBom.mutate({
                    recipeId: selectedRecipeId,
                    productId: parseInt(syncProductId, 10),
                    formulation,
                  });
                }}
              >
                {syncToBom.isPending ? "Syncing…" : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Sync recipe → BOM
                  </>
                )}
              </Button>
            </div>
            {batchCost.data ? (
              <div className="grid grid-cols-4 gap-3 text-sm">
                <Card><CardContent className="pt-4"><div>Total Cost</div><div className="font-semibold">${batchCost.data.totalCost.toFixed(2)}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div>Cost / lb</div><div className="font-semibold">${batchCost.data.costPerLb.toFixed(2)}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div>Cost / kg</div><div className="font-semibold">${batchCost.data.costPerKg.toFixed(2)}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div>Yield Adj / lb</div><div className="font-semibold">${batchCost.data.yieldAdjustedCostPerLb.toFixed(2)}</div></CardContent></Card>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No cost output yet. Add recipe lines to calculate.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
