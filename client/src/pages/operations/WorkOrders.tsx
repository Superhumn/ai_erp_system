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
import { Plus, Play, CheckCircle, Eye, Factory } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function WorkOrders() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWorkOrder, setNewWorkOrder] = useState({
    bomId: 0,
    productId: 0,
    warehouseId: 0,
    quantity: "",
    priority: "normal" as const,
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: workOrders, isLoading } = trpc.workOrders.list.useQuery();
  const { data: boms } = trpc.bom.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();

  const createMutation = trpc.workOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Work order created");
      setIsCreateOpen(false);
      utils.workOrders.list.invalidate();
      setNewWorkOrder({ bomId: 0, productId: 0, warehouseId: 0, quantity: "", priority: "normal", notes: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const startMutation = trpc.workOrders.startProduction.useMutation({
    onSuccess: () => {
      toast.success("Production started");
      utils.workOrders.list.invalidate();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
      case "scheduled": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "in_progress": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
      case "completed": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
      case "cancelled": return "bg-red-500/8 text-red-600 dark:text-red-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500/8 text-red-600 dark:text-red-400";
      case "high": return "bg-orange-500/8 text-orange-600 dark:text-orange-400";
      case "normal": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
      case "low": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const handleBomSelect = (bomId: string) => {
    const bom = boms?.find(b => b.id === parseInt(bomId));
    setNewWorkOrder({
      ...newWorkOrder,
      bomId: parseInt(bomId),
      productId: bom?.productId || 0,
    });
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Work Orders</h1>
            <p className="text-muted-foreground">Manage production runs and material consumption</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Work Order</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Work Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Bill of Materials</Label>
                  <SelectWithCreate
                    value={newWorkOrder.bomId === 0 ? "" : newWorkOrder.bomId.toString()}
                    onValueChange={handleBomSelect}
                    placeholder="Select BOM"
                    items={boms?.filter(b => b.status === 'active').map((bom) => ({
                      id: bom.id,
                      label: `${bom.name} (v${bom.version})`,
                    })) || []}
                    entityType="bom"
                    onEntityCreated={() => {
                      utils.bom.list.invalidate();
                    }}
                    emptyMessage="No active BOMs available. Create one to continue."
                  />
                </div>
                <div>
                  <Label>Production Location</Label>
                  <SelectWithCreate
                    value={newWorkOrder.warehouseId === 0 ? "" : newWorkOrder.warehouseId.toString()}
                    onValueChange={v => setNewWorkOrder({ ...newWorkOrder, warehouseId: parseInt(v) })}
                    placeholder="Select location"
                    items={warehouses?.map((wh) => ({
                      id: wh.id,
                      label: wh.name,
                    })) || []}
                    entityType="location"
                    onEntityCreated={() => {
                      utils.warehouses.list.invalidate();
                    }}
                    emptyMessage="No locations available. Create one to continue."
                  />
                </div>
                <div>
                  <Label>Quantity to Produce</Label>
                  <Input
                    type="number"
                    value={newWorkOrder.quantity}
                    onChange={e => setNewWorkOrder({ ...newWorkOrder, quantity: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={newWorkOrder.priority} onValueChange={(v: any) => setNewWorkOrder({ ...newWorkOrder, priority: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={newWorkOrder.notes}
                    onChange={e => setNewWorkOrder({ ...newWorkOrder, notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate(newWorkOrder)}
                  disabled={!newWorkOrder.bomId || !newWorkOrder.quantity}
                >
                  Create Work Order
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{workOrders?.filter(w => w.status === 'draft').length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{workOrders?.filter(w => w.status === 'scheduled').length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em] text-yellow-600">{workOrders?.filter(w => w.status === 'in_progress').length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em] text-green-600">{workOrders?.filter(w => w.status === 'completed').length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                  </TableRow>
                ) : workOrders?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No work orders yet. Create one to start production.
                    </TableCell>
                  </TableRow>
                ) : (
                  workOrders?.map(wo => {
                    const product = products?.find(p => p.id === wo.productId);
                    const warehouse = warehouses?.find(w => w.id === wo.warehouseId);
                    return (
                      <TableRow key={wo.id}>
                        <TableCell className="font-mono">{wo.workOrderNumber}</TableCell>
                        <TableCell>{product?.name || `Product #${wo.productId}`}</TableCell>
                        <TableCell>{wo.quantity} {wo.unit}</TableCell>
                        <TableCell>{warehouse?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(wo.priority || 'normal')}>
                            {wo.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(wo.status)}>
                            {wo.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(wo.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Link href={`/operations/work-orders/${wo.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            {wo.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startMutation.mutate({ id: wo.id })}
                              >
                                <Play className="w-4 h-4 text-green-600" />
                              </Button>
                            )}
                            {wo.status === 'in_progress' && (
                              <Link href={`/operations/work-orders/${wo.id}`}>
                                <Button variant="ghost" size="sm">
                                  <CheckCircle className="w-4 h-4 text-blue-600" />
                                </Button>
                              </Link>
                            )}
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
