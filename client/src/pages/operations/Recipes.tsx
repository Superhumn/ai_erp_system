import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calculator, KeyRound, Link2, Loader2, Lock, Plus, Share2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

/** Extract a spreadsheet ID from a full Google Sheets URL, or pass through an ID. */
function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export default function Recipes() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [formulation, setFormulation] = useState<"wet" | "dry">("wet");
  const [deleteRecipeId, setDeleteRecipeId] = useState<number | null>(null);
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

  const deleteRecipe = trpc.recipes.delete.useMutation({
    onSuccess: () => {
      toast.success("Recipe deleted");
      setDeleteRecipeId(null);
      if (selectedRecipeId === deleteRecipeId) setSelectedRecipeId(null);
      refetch();
    },
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

  // --- Copacker sharing ---
  const [shareRecipeId, setShareRecipeId] = useState<number | null>(null);
  const { data: copackerWarehouses } = trpc.warehouses.list.useQuery({ type: "copacker" });
  const {
    data: shares,
    refetch: refetchShares,
  } = trpc.recipes.listShares.useQuery(
    { recipeId: shareRecipeId! },
    { enabled: !!shareRecipeId },
  );
  const shareRecipe = trpc.recipes.share.useMutation({
    onSuccess: (_, variables) => { toast.success("Share updated"); if (variables && shareRecipeId === variables.recipeId) refetchShares(); },
    onError: (err) => toast.error(err.message),
  });
  const unshareRecipe = trpc.recipes.unshare.useMutation({
    onSuccess: (_, variables) => { toast.success("Share removed"); if (variables && shareRecipeId === variables.recipeId) refetchShares(); },
    onError: (err) => toast.error(err.message),
  });
  const shareRecipeName = useMemo(
    () => recipes?.find((r) => r.id === shareRecipeId)?.name ?? "",
    [recipes, shareRecipeId],
  );
  const shareByWarehouse = useMemo(() => {
    const m = new Map<number, { shareIngredients: boolean; shareProcedures: boolean }>();
    (shares ?? []).forEach((s: any) => m.set(s.warehouseId, {
      shareIngredients: !!s.shareIngredients,
      shareProcedures: !!s.shareProcedures,
    }));
    return m;
  }, [shares]);

  // --- Import from Google Sheet ---
  const [importOpen, setImportOpen] = useState(false);
  const [importSheet, setImportSheet] = useState("");
  const [importRange, setImportRange] = useState("");
  const [importDefaultName, setImportDefaultName] = useState("");
  const importFromSheet = trpc.recipes.importFromGoogleSheet.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.recipesCreated} recipe(s), ${res.linesCreated} line(s), ${res.ingredientsCreated} new ingredient(s).`,
      );
      res.warnings?.slice(0, 4).forEach((w) => toast.warning(w));
      setImportOpen(false);
      setImportSheet("");
      setImportRange("");
      setImportDefaultName("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // --- Per-user access grants (owner only) ---
  const [accessRecipeId, setAccessRecipeId] = useState<number | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantCanEdit, setGrantCanEdit] = useState(false);
  const { data: accessGrants, refetch: refetchAccess } = trpc.recipes.listAccess.useQuery(
    { recipeId: accessRecipeId ?? 0 },
    { enabled: !!accessRecipeId },
  );
  const grantAccess = trpc.recipes.grant.useMutation({
    onSuccess: () => {
      toast.success("Access granted");
      setGrantEmail("");
      setGrantCanEdit(false);
      refetchAccess();
    },
    onError: (err) => toast.error(err.message),
  });
  const revokeAccess = trpc.recipes.revoke.useMutation({
    onSuccess: () => { toast.success("Access revoked"); refetchAccess(); },
    onError: (err) => toast.error(err.message),
  });
  const accessRecipeName = useMemo(
    () => recipes?.find((r) => r.id === accessRecipeId)?.name ?? "",
    [recipes, accessRecipeId],
  );
  const isOwner = (recipe: { createdBy?: number | null }) =>
    user?.id != null && recipe.createdBy === user.id;

  return (
    <div className="p-6 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold tracking-[-0.02em]">Recipes</h1>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Private — visible only to you and people you grant
          </span>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import from Google Sheet
        </Button>
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
                    {isOwner(recipe) && (
                      <Button variant="ghost" size="sm" onClick={() => setAccessRecipeId(recipe.id)}>
                        <KeyRound className="h-4 w-4 mr-1" />
                        Access
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setShareRecipeId(recipe.id)}>
                      <Share2 className="h-4 w-4 mr-1" />
                      Share
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete recipe"
                      onClick={() => setDeleteRecipeId(recipe.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
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

      <Dialog open={deleteRecipeId !== null} onOpenChange={(open) => { if (!open) setDeleteRecipeId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete recipe?</DialogTitle>
            <DialogDescription>
              This will permanently delete the recipe and all its lines, procedures, and copacker shares. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteRecipeId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteRecipe.isPending}
              onClick={() => { if (deleteRecipeId !== null) deleteRecipe.mutate({ id: deleteRecipeId }); }}
            >
              {deleteRecipe.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareRecipeId != null} onOpenChange={(open) => !open && setShareRecipeId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share recipe with copackers</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose which copacker facilities can see <span className="font-medium">{shareRecipeName}</span>{" "}
              in their portal. Toggle which parts (ingredients, procedures) each copacker receives.
            </p>
            {!copackerWarehouses?.length ? (
              <p className="text-sm text-muted-foreground">
                No copacker locations configured. Add a warehouse with type "copacker" first.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Copacker</TableHead>
                    <TableHead className="text-center">Ingredients</TableHead>
                    <TableHead className="text-center">Procedures</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {copackerWarehouses.map((wh: any) => {
                    const current = shareByWarehouse.get(wh.id);
                    const isShared = !!current;
                    return (
                      <TableRow key={wh.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{wh.name}</div>
                          {wh.code ? <div className="text-xs text-muted-foreground font-mono">{wh.code}</div> : null}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={current?.shareIngredients ?? true}
                            disabled={!isShared || shareRecipe.isPending}
                            onCheckedChange={(v) => {
                              if (!shareRecipeId) return;
                              shareRecipe.mutate({
                                recipeId: shareRecipeId,
                                warehouseId: wh.id,
                                shareIngredients: !!v,
                                shareProcedures: current?.shareProcedures ?? true,
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={current?.shareProcedures ?? true}
                            disabled={!isShared || shareRecipe.isPending}
                            onCheckedChange={(v) => {
                              if (!shareRecipeId) return;
                              shareRecipe.mutate({
                                recipeId: shareRecipeId,
                                warehouseId: wh.id,
                                shareIngredients: current?.shareIngredients ?? true,
                                shareProcedures: !!v,
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {isShared ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={unshareRecipe.isPending}
                              onClick={() => {
                                if (!shareRecipeId) return;
                                unshareRecipe.mutate({ recipeId: shareRecipeId, warehouseId: wh.id });
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Unshare
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={shareRecipe.isPending}
                              onClick={() => {
                                if (!shareRecipeId) return;
                                shareRecipe.mutate({
                                  recipeId: shareRecipeId,
                                  warehouseId: wh.id,
                                  shareIngredients: true,
                                  shareProcedures: true,
                                });
                              }}
                            >
                              <Share2 className="h-4 w-4 mr-1" />
                              Share
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import formulations from Google Sheet</DialogTitle>
            <DialogDescription>
              Paste a Google Sheets link or ID. Use a header row with columns like
              {" "}<span className="font-mono text-xs">Recipe</span>,{" "}
              <span className="font-mono text-xs">Ingredient</span>,{" "}
              <span className="font-mono text-xs">Quantity (g)</span>, and optionally{" "}
              <span className="font-mono text-xs">SKU</span>,{" "}
              <span className="font-mono text-xs">Category</span>,{" "}
              <span className="font-mono text-xs">Procedure</span>. Imported recipes are private
              to you until you grant access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>Google Sheet URL or ID</Label>
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={importSheet}
                onChange={(e) => setImportSheet(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Range (optional)</Label>
                <Input
                  placeholder="A1:Z1000"
                  value={importRange}
                  onChange={(e) => setImportRange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Default recipe name (optional)</Label>
                <Input
                  placeholder="Used when no Recipe column"
                  value={importDefaultName}
                  onChange={(e) => setImportDefaultName(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The sheet must be accessible by your connected Google account.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              disabled={!importSheet.trim() || importFromSheet.isPending}
              onClick={() =>
                importFromSheet.mutate({
                  spreadsheetId: extractSpreadsheetId(importSheet),
                  range: importRange.trim() || undefined,
                  defaultRecipeName: importDefaultName.trim() || undefined,
                })
              }
            >
              {importFromSheet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accessRecipeId != null} onOpenChange={(open) => !open && setAccessRecipeId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{accessRecipeName}</span> is private. Grant access to
              individual people by email. Only you (the owner) and people listed below can see it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label>Grant access to (email)</Label>
                <Input
                  type="email"
                  placeholder="person@company.com"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
                <Checkbox
                  checked={grantCanEdit}
                  onCheckedChange={(v) => setGrantCanEdit(!!v)}
                />
                Can edit
              </label>
              <Button
                className="mb-0.5"
                disabled={!grantEmail.trim() || grantAccess.isPending || accessRecipeId == null}
                onClick={() => {
                  if (accessRecipeId == null) return;
                  grantAccess.mutate({
                    recipeId: accessRecipeId,
                    email: grantEmail.trim(),
                    canEdit: grantCanEdit,
                  });
                }}
              >
                Grant
              </Button>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">People with access</Label>
              {accessGrants?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessGrants.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{g.userName ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{g.userEmail}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{g.canEdit ? "Edit" : "View"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={revokeAccess.isPending}
                            onClick={() => {
                              if (accessRecipeId == null) return;
                              revokeAccess.mutate({ recipeId: accessRecipeId, userId: g.userId });
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground pt-1">
                  No one else has access yet.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
