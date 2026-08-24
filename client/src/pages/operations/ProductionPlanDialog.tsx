import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, Loader2, Plus } from "lucide-react";

const PLAN_UNITS = [
  { value: "EA", label: "Units / packages" },
  { value: "CASE", label: "Cases" },
  { value: "BATCH", label: "Batches" },
  { value: "LB", label: "Pounds" },
  { value: "KG", label: "Kilograms" },
  { value: "G", label: "Grams" },
  { value: "OZ", label: "Ounces" },
] as const;

type PlanUnit = (typeof PLAN_UNITS)[number]["value"];
type PlanSource = "recipe" | "bom";

const number = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const qty = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function ProductionPlanDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PlanSource>("recipe");
  const [recipeId, setRecipeId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [formulation, setFormulation] = useState<"wet" | "dry">("wet");
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState<PlanUnit>("LB");
  const [unitsPerCase, setUnitsPerCase] = useState("");
  const [unitWeightGrams, setUnitWeightGrams] = useState("");
  const [safetyMarginPercent, setSafetyMarginPercent] = useState("0");
  const [orderBufferPercent, setOrderBufferPercent] = useState("0");
  const [netOffInventory, setNetOffInventory] = useState(false);
  const [accountForYield, setAccountForYield] = useState(true);
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: products } = trpc.products.list.useQuery({});
  const { data: recipes } = trpc.recipes.list.useQuery({});

  const selectedRecipe = recipes?.find((r) => String(r.id) === recipeId);
  const resolvedProductId = productId
    ? parseInt(productId, 10)
    : selectedRecipe?.outputProductId ?? undefined;

  const planInput = useMemo(
    () => ({
      productId: resolvedProductId,
      recipeId: source === "recipe" && recipeId ? parseInt(recipeId, 10) : undefined,
      formulation,
      quantity: number(quantity) ?? 0,
      unit,
      unitsPerCase: number(unitsPerCase),
      unitWeightGrams: number(unitWeightGrams),
      safetyMarginPercent: parseFloat(safetyMarginPercent) || 0,
      orderBufferPercent: parseFloat(orderBufferPercent) || 0,
      netOffInventory,
      accountForYield,
      plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : undefined,
      plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : undefined,
      notes: notes || undefined,
    }),
    [
      resolvedProductId, source, recipeId, formulation, quantity, unit, unitsPerCase,
      unitWeightGrams, safetyMarginPercent, orderBufferPercent, netOffInventory,
      accountForYield, plannedStartDate, plannedEndDate, notes,
    ],
  );

  // The preview reads stock and open POs per material, so don't refire it on
  // every keystroke.
  const [debouncedInput, setDebouncedInput] = useState(planInput);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(planInput), 400);
    return () => clearTimeout(timer);
  }, [planInput]);

  const readyToPreview =
    open &&
    debouncedInput.quantity > 0 &&
    !!debouncedInput.productId &&
    (source === "bom" || !!debouncedInput.recipeId);

  const preview = trpc.forecasting.previewProductionPlan.useQuery(debouncedInput, {
    enabled: readyToPreview,
    retry: false,
  });

  const createPlan = trpc.forecasting.createProductionPlan.useMutation({
    onSuccess: (data) => {
      toast.success(
        `${data.plan?.planNumber} created — ${data.summary.materialCount} materials, ${data.summary.shortageCount} short.`,
      );
      setOpen(false);
      onCreated();
    },
    onError: (error) => toast.error(error.message),
  });

  const summary = preview.data?.summary;
  const requirements = preview.data?.requirements ?? [];
  const warnings = preview.data?.warnings ?? [];
  const previewError = preview.error?.message;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          New Production Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Production Plan</DialogTitle>
          <DialogDescription>
            Set a production target and see exactly what has to be purchased for it — no forecast required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] py-2">
          {/* ---------------- inputs ---------------- */}
          <div className="space-y-4">
            <Tabs value={source} onValueChange={(v) => setSource(v as PlanSource)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="recipe">From recipe</TabsTrigger>
                <TabsTrigger value="bom">From BOM</TabsTrigger>
              </TabsList>
              <TabsContent value="recipe" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label>Recipe</Label>
                  <Select value={recipeId} onValueChange={setRecipeId}>
                    <SelectTrigger><SelectValue placeholder="Pick a recipe" /></SelectTrigger>
                    <SelectContent>
                      {recipes?.map((recipe) => (
                        <SelectItem key={recipe.id} value={String(recipe.id)}>
                          {recipe.name} ({recipe.recipeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRecipe && (
                    <p className="text-xs text-muted-foreground">
                      Base batch {qty(parseFloat(selectedRecipe.baseBatchGrams?.toString() || "0"))} g ·
                      expected yield {(parseFloat(selectedRecipe.expectedYieldPct?.toString() || "1") * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Formulation</Label>
                  <Select value={formulation} onValueChange={(v) => setFormulation(v as "wet" | "dry")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wet">Wet</SelectItem>
                      <SelectItem value="dry">Dry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5 pr-3">
                    <Label className="text-sm">Account for yield loss</Label>
                    <p className="text-xs text-muted-foreground">
                      Scale the run up so finished output hits the target.
                    </p>
                  </div>
                  <Switch checked={accountForYield} onCheckedChange={setAccountForYield} />
                </div>
              </TabsContent>
              <TabsContent value="bom" className="pt-3">
                <p className="text-sm text-muted-foreground">
                  Materials come from the product's active bill of materials.
                </p>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label>Finished product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedRecipe?.outputProductId
                        ? products?.find((p) => p.id === selectedRecipe.outputProductId)?.name ?? "From recipe"
                        : "Pick a product"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as PlanUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLAN_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {unit === "CASE" && (
              <div className="space-y-2">
                <Label>Units per case</Label>
                <Input
                  type="number"
                  min="0"
                  value={unitsPerCase}
                  onChange={(e) => setUnitsPerCase(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>
            )}

            {(unit === "EA" || unit === "CASE") && (
              <div className="space-y-2">
                <Label>Net weight per unit (g)</Label>
                <Input
                  type="number"
                  min="0"
                  value={unitWeightGrams}
                  onChange={(e) => setUnitWeightGrams(e.target.value)}
                  placeholder="e.g. 227"
                />
                <p className="text-xs text-muted-foreground">
                  Needed to turn a pack count into recipe weight.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Safety margin %</Label>
                <Input
                  type="number"
                  min="0"
                  value={safetyMarginPercent}
                  onChange={(e) => setSafetyMarginPercent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Purchase buffer %</Label>
                <Input
                  type="number"
                  min="0"
                  value={orderBufferPercent}
                  onChange={(e) => setOrderBufferPercent(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5 pr-3">
                <Label className="text-sm">Net off finished stock</Label>
                <p className="text-xs text-muted-foreground">
                  Subtract what's already in inventory from the target.
                </p>
              </div>
              <Switch checked={netOffInventory} onCheckedChange={setNetOffInventory} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {/* ---------------- preview ---------------- */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="h-4 w-4" />
              Ingredient & material forecast
              {preview.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>

            {!readyToPreview && (
              <p className="text-sm text-muted-foreground">
                Pick a {source === "recipe" ? "recipe" : "product"}, a finished product and a quantity to see what
                this run consumes.
              </p>
            )}

            {readyToPreview && previewError && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span>{previewError}</span>
              </div>
            )}

            {summary && !previewError && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">To produce</div>
                    <div className="font-semibold tabular-nums">{qty(summary.plannedQuantity)} {summary.unit}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Batches</div>
                    <div className="font-semibold tabular-nums">{qty(summary.batches)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Material cost</div>
                    <div className="font-semibold tabular-nums">{money(summary.estimatedRunCost)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">To purchase</div>
                    <div className="font-semibold tabular-nums">{money(summary.estimatedPurchaseCost)}</div>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                    {warnings.map((warning, i) => (
                      <div key={i} className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="max-h-[340px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Needed</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">On order</TableHead>
                        <TableHead className="text-right">To buy</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead>Vendor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req, i) => (
                        <TableRow key={`${req.rawMaterialId ?? req.name}-${i}`}>
                          <TableCell>
                            <div className="font-medium">{req.name}</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {req.sku}
                              {req.isUrgent && req.shortageQuantity > 0 && (
                                <Badge variant="destructive" className="ml-1">lead time</Badge>
                              )}
                              {!req.rawMaterialId && <Badge variant="outline" className="ml-1">new</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {qty(req.requiredQuantity)} {req.unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{qty(req.currentInventory)}</TableCell>
                          <TableCell className="text-right tabular-nums">{qty(req.onOrderQuantity)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {req.suggestedOrderQuantity > 0 ? qty(req.suggestedOrderQuantity) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{money(req.estimatedRunCost)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{req.vendorName || "—"}</TableCell>
                        </TableRow>
                      ))}
                      {requirements.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                            No materials resolved for this run.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createPlan.mutate(planInput)}
            disabled={!readyToPreview || !!previewError || createPlan.isPending}
          >
            {createPlan.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
            ) : (
              "Create plan"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Read-only view of the materials a saved plan needs, and what's short. */
export function PlanMaterialsDialog({ planId, planNumber }: { planId: number; planNumber: string }) {
  const [open, setOpen] = useState(false);
  const { data: requirements, isLoading } = trpc.forecasting.getMaterialRequirements.useQuery(
    { productionPlanId: planId },
    { enabled: open },
  );

  const totalPurchase = (requirements ?? []).reduce(
    (sum, req) => sum + parseFloat(req.estimatedTotalCost?.toString() || "0"),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ClipboardList className="h-4 w-4 mr-1" />
          Materials
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Materials for {planNumber}</DialogTitle>
          <DialogDescription>
            Requirements netted against stock and open purchase orders.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Needed</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Short</TableHead>
                <TableHead className="text-right">To buy</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
                <TableHead>Vendor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requirements ?? []).map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="font-medium">{req.materialName}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {req.materialSku}
                      {req.isUrgent && <Badge variant="destructive" className="ml-1">lead time</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(parseFloat(req.requiredQuantity?.toString() || "0"))} {req.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(parseFloat(req.currentInventory?.toString() || "0"))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(parseFloat(req.shortageQuantity?.toString() || "0"))}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {qty(parseFloat(req.suggestedOrderQuantity?.toString() || "0"))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(parseFloat(req.estimatedTotalCost?.toString() || "0"))}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{req.vendorName || "—"}</TableCell>
                </TableRow>
              ))}
              {(requirements ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No material requirements recorded for this plan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
        <div className="flex justify-end text-sm text-muted-foreground">
          Estimated purchase cost: <span className="ml-2 font-medium text-foreground">{money(totalPurchase)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
