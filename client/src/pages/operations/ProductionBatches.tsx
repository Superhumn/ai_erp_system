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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Factory, Edit } from "lucide-react";

type BatchStatus = "planned" | "in_progress" | "completed" | "cancelled";

export default function ProductionBatches() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createForm, setCreateForm] = useState({
    productId: "",
    quantity: "",
    status: "planned" as BatchStatus,
    startDate: "",
    warehouseId: "",
    notes: "",
  });
  const [editForm, setEditForm] = useState({
    status: "planned" as BatchStatus,
    completionDate: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: batches, isLoading } = trpc.productionBatches.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const createMutation = trpc.productionBatches.create.useMutation({
    onSuccess: () => {
      toast.success("Production batch created successfully");
      setIsOpen(false);
      resetCreateForm();
      utils.productionBatches.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.productionBatches.update.useMutation({
    onSuccess: () => {
      toast.success("Production batch updated successfully");
      setEditingId(null);
      utils.productionBatches.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetCreateForm = () => {
    setCreateForm({
      productId: "",
      quantity: "",
      status: "planned",
      startDate: "",
      warehouseId: "",
      notes: "",
    });
  };

  const handleEdit = (batch: any) => {
    setEditingId(batch.id);
    setEditForm({
      status: batch.status || "planned",
      completionDate: batch.completionDate ? String(batch.completionDate).slice(0, 10) : "",
      notes: batch.notes || "",
    });
  };

  const handleCreate = () => {
    if (!createForm.productId) {
      toast.error("Product is required");
      return;
    }
    if (!createForm.quantity) {
      toast.error("Quantity is required");
      return;
    }
    createMutation.mutate({
      productId: Number(createForm.productId),
      quantity: createForm.quantity,
      status: createForm.status,
      startDate: createForm.startDate ? new Date(createForm.startDate) : undefined,
      warehouseId: createForm.warehouseId ? Number(createForm.warehouseId) : undefined,
      notes: createForm.notes || undefined,
    });
  };

  const handleUpdate = () => {
    if (editingId === null) return;
    updateMutation.mutate({
      id: editingId,
      status: editForm.status,
      completionDate: editForm.completionDate ? new Date(editForm.completionDate) : undefined,
      notes: editForm.notes || undefined,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "in_progress": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
      case "completed": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "cancelled": return "bg-red-500/8 text-red-600 dark:text-red-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "in_progress": return "In Progress";
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const formatDate = (value: any) => {
    if (!value) return "—";
    return String(value).slice(0, 10);
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Production Batches</h1>
            <p className="text-muted-foreground">Plan and track manufacturing runs</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) resetCreateForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Production Batch</DialogTitle>
                <DialogDescription>Create a new manufacturing batch</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Product ID *</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 42"
                      value={createForm.productId}
                      onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      placeholder="e.g., 1000"
                      value={createForm.quantity}
                      onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={createForm.status} onValueChange={(v: any) => setCreateForm({ ...createForm, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={createForm.startDate}
                      onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Warehouse ID</Label>
                    <Input
                      type="number"
                      placeholder="Optional"
                      value={createForm.warehouseId}
                      onChange={(e) => setCreateForm({ ...createForm, warehouseId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes about this batch..."
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  Create Batch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Batches Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Batches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading batches...</div>
            ) : !batches || batches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No production batches found. Create your first batch.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Product ID</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Completion Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch: any) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                      <TableCell>{batch.productId}</TableCell>
                      <TableCell>{batch.quantity}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(batch.status)}>
                          {getStatusLabel(batch.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(batch.startDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(batch.completionDate)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(batch)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Production Batch</DialogTitle>
              <DialogDescription>Update the batch status, completion date, and notes</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v: any) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Completion Date</Label>
                <Input
                  type="date"
                  value={editForm.completionDate}
                  onChange={(e) => setEditForm({ ...editForm, completionDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional notes about this batch..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                Update Batch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
