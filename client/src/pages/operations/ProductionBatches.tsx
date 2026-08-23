import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Loader2, ArrowLeft, Factory } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

type BatchStatus = "planned" | "in_progress" | "completed" | "cancelled";

const STATUS_OPTIONS: { value: BatchStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusColor(status: string) {
  switch (status) {
    case "planned": return "bg-primary/10 text-primary";
    case "in_progress": return "bg-primary/10 text-primary";
    case "completed": return "bg-muted text-muted-foreground";
    case "cancelled": return "bg-[oklch(0.30_0.02_262)] text-white";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function ProductionBatches() {
  const utils = trpc.useUtils();
  const { data: batches, isLoading } = trpc.productionBatches.list.useQuery(undefined);
  const { data: products } = trpc.products.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    productId: "",
    quantity: "",
    warehouseId: "",
    status: "planned" as BatchStatus,
    startDate: "",
    notes: "",
  });

  const [editBatch, setEditBatch] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    status: "planned" as BatchStatus,
    completionDate: "",
    notes: "",
  });

  const createBatch = trpc.productionBatches.create.useMutation({
    onSuccess: () => {
      toast.success("Production batch created");
      utils.productionBatches.list.invalidate();
      setCreateOpen(false);
      setCreateForm({ productId: "", quantity: "", warehouseId: "", status: "planned", startDate: "", notes: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateBatch = trpc.productionBatches.update.useMutation({
    onSuccess: () => {
      toast.success("Production batch updated");
      utils.productionBatches.list.invalidate();
      setEditBatch(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!createForm.productId) {
      toast.error("Product is required");
      return;
    }
    if (!createForm.quantity.trim()) {
      toast.error("Quantity is required");
      return;
    }
    createBatch.mutate({
      productId: Number(createForm.productId),
      quantity: createForm.quantity.trim(),
      warehouseId: createForm.warehouseId ? Number(createForm.warehouseId) : undefined,
      status: createForm.status,
      startDate: createForm.startDate ? new Date(createForm.startDate) : undefined,
      notes: createForm.notes || undefined,
    });
  };

  const openEdit = (batch: any) => {
    setEditForm({
      status: (batch.status as BatchStatus) || "planned",
      completionDate: batch.completionDate ? new Date(batch.completionDate).toISOString().slice(0, 10) : "",
      notes: batch.notes ?? "",
    });
    setEditBatch(batch);
  };

  const handleUpdate = () => {
    if (!editBatch) return;
    updateBatch.mutate({
      id: editBatch.id,
      status: editForm.status,
      completionDate: editForm.completionDate ? new Date(editForm.completionDate) : undefined,
      notes: editForm.notes || undefined,
    });
  };

  const rows = (batches as any[] | undefined) ?? [];
  const countBy = (s: BatchStatus) => rows.filter((b) => b.status === s).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/operations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Operations
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Production Batches
          </h1>
          <p className="text-muted-foreground">Track manufacturing batches and their progress.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New batch</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create production batch</DialogTitle>
              <DialogDescription>Start tracking a new manufacturing batch.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product *</Label>
                <Select value={createForm.productId} onValueChange={(v) => setCreateForm({ ...createForm, productId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products?.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    value={createForm.quantity}
                    onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={createForm.status} onValueChange={(v) => setCreateForm({ ...createForm, status: v as BatchStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Location</Label>
                  <Select value={createForm.warehouseId || "none"} onValueChange={(v) => setCreateForm({ ...createForm, warehouseId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {warehouses?.map((w: any) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createBatch.isPending}>
                {createBatch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUS_OPTIONS.map((s) => (
          <Card key={s.value}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{countBy(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Batches Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No production batches yet. Create one to start tracking.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((b) => {
                  const product = products?.find((p: any) => p.id === b.productId);
                  const warehouse = warehouses?.find((w: any) => w.id === b.warehouseId);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono">{b.batchNumber}</TableCell>
                      <TableCell>{product?.name || `Product #${b.productId}`}</TableCell>
                      <TableCell>{b.quantity}</TableCell>
                      <TableCell>{warehouse?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(b.status)}>{String(b.status).replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>{b.startDate ? new Date(b.startDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>{b.completionDate ? new Date(b.completionDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" aria-label="Edit batch" onClick={() => openEdit(b)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editBatch} onOpenChange={(o) => !o && setEditBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update batch {editBatch?.batchNumber}</DialogTitle>
            <DialogDescription>Update the batch status, completion date, or notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as BatchStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Completion date</Label>
                <Input
                  type="date"
                  value={editForm.completionDate}
                  onChange={(e) => setEditForm({ ...editForm, completionDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBatch(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateBatch.isPending}>
              {updateBatch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
