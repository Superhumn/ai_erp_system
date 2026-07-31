import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Edit, Layers } from "lucide-react";

type Channel = "shopify" | "amazon" | "wholesale" | "retail";

const CHANNELS: Channel[] = ["shopify", "amazon", "wholesale", "retail"];

export default function Allocations() {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const [createForm, setCreateForm] = useState({
    channel: "shopify" as Channel,
    productId: "",
    warehouseId: "",
    storeId: "",
    allocatedQuantity: "",
    reservedQuantity: "0",
  });

  const [editForm, setEditForm] = useState({
    allocatedQuantity: "",
    reservedQuantity: "",
    remainingQuantity: "",
    channelReportedQuantity: "",
  });

  const utils = trpc.useUtils();
  const { data: allocations, isLoading } = trpc.allocations.list.useQuery(
    channelFilter !== "all" ? { channel: channelFilter as Channel } : undefined
  );

  const createMutation = trpc.allocations.create.useMutation({
    onSuccess: () => {
      toast.success("Allocation created successfully");
      setIsOpen(false);
      resetCreateForm();
      utils.allocations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.allocations.update.useMutation({
    onSuccess: () => {
      toast.success("Allocation updated successfully");
      setIsEditOpen(false);
      setEditingId(null);
      utils.allocations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetCreateForm = () => {
    setCreateForm({
      channel: "shopify",
      productId: "",
      warehouseId: "",
      storeId: "",
      allocatedQuantity: "",
      reservedQuantity: "0",
    });
  };

  const num = (v: string) => (v === "" ? undefined : Number(v));

  const handleCreate = () => {
    const productId = num(createForm.productId);
    const warehouseId = num(createForm.warehouseId);
    if (productId === undefined) {
      toast.error("Product ID is required");
      return;
    }
    if (warehouseId === undefined) {
      toast.error("Warehouse ID is required");
      return;
    }
    if (createForm.allocatedQuantity === "") {
      toast.error("Allocated quantity is required");
      return;
    }
    createMutation.mutate({
      channel: createForm.channel,
      productId,
      warehouseId,
      storeId: num(createForm.storeId),
      allocatedQuantity: createForm.allocatedQuantity,
      reservedQuantity: createForm.reservedQuantity,
    });
  };

  const handleEdit = (row: any) => {
    setEditingId(row.id);
    setEditForm({
      allocatedQuantity: row.allocatedQuantity ?? "",
      reservedQuantity: row.reservedQuantity ?? "",
      remainingQuantity: row.remainingQuantity ?? "",
      channelReportedQuantity: row.channelReportedQuantity ?? "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (editingId === null) return;
    const payload: {
      id: number;
      allocatedQuantity?: string;
      reservedQuantity?: string;
      remainingQuantity?: string;
      channelReportedQuantity?: string;
    } = { id: editingId };
    if (editForm.allocatedQuantity !== "") payload.allocatedQuantity = editForm.allocatedQuantity;
    if (editForm.reservedQuantity !== "") payload.reservedQuantity = editForm.reservedQuantity;
    if (editForm.remainingQuantity !== "") payload.remainingQuantity = editForm.remainingQuantity;
    if (editForm.channelReportedQuantity !== "") payload.channelReportedQuantity = editForm.channelReportedQuantity;
    updateMutation.mutate(payload);
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case "shopify": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "amazon": return "bg-orange-500/8 text-orange-600 dark:text-orange-400";
      case "wholesale": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "retail": return "bg-violet-500/8 text-violet-600 dark:text-violet-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Channel Allocations</h1>
          <p className="text-muted-foreground">Manage inventory allocation across sales channels</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetCreateForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Allocation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Allocation</DialogTitle>
              <DialogDescription>Allocate inventory for a product to a sales channel</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={createForm.channel} onValueChange={(v: any) => setCreateForm({ ...createForm, channel: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Product ID *</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 101"
                    value={createForm.productId}
                    onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Warehouse ID *</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 1"
                    value={createForm.warehouseId}
                    onChange={(e) => setCreateForm({ ...createForm, warehouseId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Store ID</Label>
                  <Input
                    type="number"
                    placeholder="Optional"
                    value={createForm.storeId}
                    onChange={(e) => setCreateForm({ ...createForm, storeId: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Allocated Quantity *</Label>
                  <Input
                    placeholder="e.g., 100"
                    value={createForm.allocatedQuantity}
                    onChange={(e) => setCreateForm({ ...createForm, allocatedQuantity: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reserved Quantity</Label>
                  <Input
                    placeholder="0"
                    value={createForm.reservedQuantity}
                    onChange={(e) => setCreateForm({ ...createForm, reservedQuantity: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                Create Allocation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Allocations Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading allocations...</div>
          ) : !allocations || allocations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No allocations found. Add your first channel allocation.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Warehouse ID</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Reserved</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge className={getChannelColor(row.channel)}>
                        {row.channel.charAt(0).toUpperCase() + row.channel.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.productId}</TableCell>
                    <TableCell>{row.warehouseId}</TableCell>
                    <TableCell>{row.allocatedQuantity}</TableCell>
                    <TableCell>{row.reservedQuantity}</TableCell>
                    <TableCell>{row.remainingQuantity}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(row)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) setEditingId(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Allocation</DialogTitle>
            <DialogDescription>Update quantities for this allocation</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Allocated Quantity</Label>
              <Input
                value={editForm.allocatedQuantity}
                onChange={(e) => setEditForm({ ...editForm, allocatedQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Reserved Quantity</Label>
              <Input
                value={editForm.reservedQuantity}
                onChange={(e) => setEditForm({ ...editForm, reservedQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Remaining Quantity</Label>
              <Input
                value={editForm.remainingQuantity}
                onChange={(e) => setEditForm({ ...editForm, remainingQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Channel Reported Quantity</Label>
              <Input
                value={editForm.channelReportedQuantity}
                onChange={(e) => setEditForm({ ...editForm, channelReportedQuantity: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              Update Allocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
