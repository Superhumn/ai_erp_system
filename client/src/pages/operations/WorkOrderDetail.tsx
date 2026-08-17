import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Play, CheckCircle, Package, AlertTriangle, MoreHorizontal, Trash2, Ban, Loader2, SlidersHorizontal, History } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams, useLocation } from "wouter";

export default function WorkOrderDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const workOrderId = parseInt(params.id || "0");
  const [completedQty, setCompletedQty] = useState("");
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [adjustMat, setAdjustMat] = useState<any>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [historyMat, setHistoryMat] = useState<any>(null);

  const { data: workOrder, isLoading, refetch } = trpc.workOrders.getById.useQuery({ id: workOrderId });
  const { data: materials } = trpc.workOrders.getMaterials.useQuery({ workOrderId });
  const { data: products } = trpc.products.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: rawMaterials } = trpc.rawMaterials.list.useQuery();
  const { data: rmInventory } = trpc.rawMaterialInventory.list.useQuery({ warehouseId: workOrder?.warehouseId || undefined });
  const utils = trpc.useUtils();

  const { data: rmTransactions, isLoading: isTxLoading } = trpc.rawMaterialInventory.getTransactions.useQuery(
    { rawMaterialId: historyMat?.rawMaterialId ?? 0 },
    { enabled: !!historyMat?.rawMaterialId }
  );

  const adjustMutation = trpc.rawMaterialInventory.adjust.useMutation({
    onSuccess: () => {
      toast.success("Inventory adjusted");
      utils.rawMaterialInventory.list.invalidate();
      utils.rawMaterialInventory.getTransactions.invalidate();
      setAdjustMat(null);
      setAdjustQty("");
      setAdjustNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  const startMutation = trpc.workOrders.startProduction.useMutation({
    onSuccess: () => {
      toast.success("Production started");
      refetch();
    },
  });

  const completeMutation = trpc.workOrders.completeProduction.useMutation({
    onSuccess: () => {
      toast.success("Production completed - materials consumed");
      setIsCompleteOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.workOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Work order updated");
      setShowCancelConfirm(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.workOrders.delete.useMutation({
    onSuccess: () => {
      toast.success("Work order deleted");
      setLocation("/operations/work-orders");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6">Loading...</div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-6">Work order not found</div>
    );
  }

  const product = products?.find(p => p.id === workOrder.productId);
  const warehouse = warehouses?.find(w => w.id === workOrder.warehouseId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "scheduled": return "bg-muted text-muted-foreground";
      case "in_progress": return "bg-primary/10 text-primary";
      case "completed": return "bg-muted text-muted-foreground";
      case "cancelled": return "bg-[oklch(0.30_0.02_262)] text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getMaterialStatus = (mat: any) => {
    if (!mat.rawMaterialId) return { available: true, qty: 0 };
    const inv = rmInventory?.find(i => i.rawMaterialId === mat.rawMaterialId);
    const available = parseFloat(inv?.quantity?.toString() || '0');
    const required = parseFloat(mat.requiredQuantity?.toString() || '0');
    return { available: available >= required, qty: available };
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/operations/work-orders">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">{workOrder.workOrderNumber}</h1>
            <p className="text-muted-foreground">{product?.name}</p>
          </div>
          <Badge className={getStatusColor(workOrder.status)}>{workOrder.status.replace('_', ' ')}</Badge>
          {workOrder.status === 'draft' && (
            <Button onClick={() => startMutation.mutate({ id: workOrder.id })}>
              <Play className="w-4 h-4 mr-2" /> Start Production
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {workOrder.status !== 'cancelled' && workOrder.status !== 'completed' && (
                <DropdownMenuItem onClick={() => setShowCancelConfirm(true)}>
                  <Ban className="w-4 h-4 mr-2" />
                  Cancel Work Order
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Work Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {workOrder.status === 'in_progress' && (
            <Dialog open={isCompleteOpen} onOpenChange={setIsCompleteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <CheckCircle className="w-4 h-4 mr-2" /> Complete Production
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Complete Production</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This will consume all required materials from inventory and mark the work order as complete.
                  </p>
                  <div>
                    <Label>Completed Quantity</Label>
                    <Input
                      type="number"
                      value={completedQty}
                      onChange={e => setCompletedQty(e.target.value)}
                      placeholder={workOrder.quantity?.toString()}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Target: {workOrder.quantity} {workOrder.unit}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => completeMutation.mutate({
                      id: workOrder.id,
                      completedQuantity: completedQty || workOrder.quantity?.toString() || '0'
                    })}
                  >
                    Complete & Consume Materials
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Work Order Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Quantity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{workOrder.quantity} {workOrder.unit}</div>
              {workOrder.completedQuantity && (
                <p className="text-sm text-muted-foreground">Completed: {workOrder.completedQuantity}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{warehouse?.name || '-'}</div>
              <p className="text-sm text-muted-foreground">{warehouse?.type}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={
                workOrder.priority === 'urgent' ? 'bg-[oklch(0.30_0.02_262)] text-white' :
                workOrder.priority === 'high' ? 'bg-muted text-foreground font-semibold' :
                'bg-muted text-muted-foreground'
              }>
                {workOrder.priority}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Required Materials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Required Materials
            </CardTitle>
            <CardDescription>
              Materials needed for this production run based on the BOM
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Consumed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No materials assigned to this work order
                    </TableCell>
                  </TableRow>
                ) : (
                  materials?.map(mat => {
                    const rm = rawMaterials?.find(r => r.id === mat.rawMaterialId);
                    const { available, qty } = getMaterialStatus(mat);
                    const required = parseFloat(mat.requiredQuantity?.toString() || '0');
                    return (
                      <TableRow key={mat.id}>
                        <TableCell>
                          <div className="font-medium">{mat.name || rm?.name}</div>
                          {rm?.sku && <div className="text-xs text-muted-foreground">{rm.sku}</div>}
                        </TableCell>
                        <TableCell>{mat.requiredQuantity} {mat.unit}</TableCell>
                        <TableCell>
                          <span className={qty < required ? 'text-foreground font-semibold' : ''}>
                            {qty.toFixed(2)} {mat.unit}
                          </span>
                        </TableCell>
                        <TableCell>
                          {mat.status === 'consumed' ? (
                            <Badge className="bg-muted text-muted-foreground">Consumed</Badge>
                          ) : mat.status === 'partial' ? (
                            <Badge className="bg-muted text-foreground font-semibold">Partial</Badge>
                          ) : mat.status === 'shortage' ? (
                            <Badge className="bg-[oklch(0.30_0.02_262)] text-white">
                              <AlertTriangle className="w-3 h-3 mr-1" /> Shortage
                            </Badge>
                          ) : available ? (
                            <Badge className="bg-muted text-muted-foreground">Ready</Badge>
                          ) : (
                            <Badge className="bg-[oklch(0.30_0.02_262)] text-white">
                              <AlertTriangle className="w-3 h-3 mr-1" /> Low Stock
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {mat.consumedQuantity ? `${mat.consumedQuantity} ${mat.unit}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {mat.rawMaterialId && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setAdjustMat(mat);
                                    setAdjustQty("");
                                    setAdjustNotes("");
                                  }}
                                >
                                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                                  Adjust Inventory
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setHistoryMat(mat)}>
                                  <History className="w-4 h-4 mr-2" />
                                  Transaction History
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(workOrder.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {workOrder.actualStartDate && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
                  <div>
                    <p className="font-medium">Production Started</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(workOrder.actualStartDate).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              {workOrder.actualEndDate && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <div>
                    <p className="font-medium">Production Completed</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(workOrder.actualEndDate).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel work order?</AlertDialogTitle>
              <AlertDialogDescription>
                Cancels {workOrder.workOrderNumber}. Reserved materials will be released. This does
                not delete the record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updateMutation.isPending}>Keep open</AlertDialogCancel>
              <AlertDialogAction
                disabled={updateMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  updateMutation.mutate({ id: workOrder.id, status: "cancelled" });
                }}
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Cancel work order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete work order?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently removes {workOrder.workOrderNumber}. Consumed materials remain in the
                inventory audit log. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  deleteMutation.mutate({ id: workOrder.id });
                }}
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete work order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!adjustMat} onOpenChange={(open) => !open && setAdjustMat(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust Inventory</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Adjust on-hand quantity for <span className="font-medium text-foreground">{adjustMat?.name}</span> at {warehouse?.name || 'this location'}. Use a negative value to decrease.
              </p>
              <div>
                <Label>Quantity Change</Label>
                <Input
                  type="number"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  placeholder="e.g. 10 or -5"
                />
                <p className="text-xs text-muted-foreground mt-1">Unit: {adjustMat?.unit}</p>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={adjustNotes}
                  onChange={e => setAdjustNotes(e.target.value)}
                  placeholder="Reason for adjustment (optional)"
                />
              </div>
              <Button
                className="w-full"
                disabled={adjustMutation.isPending || !adjustQty || !workOrder.warehouseId}
                onClick={() => {
                  if (!adjustMat?.rawMaterialId || !workOrder.warehouseId) return;
                  adjustMutation.mutate({
                    rawMaterialId: adjustMat.rawMaterialId,
                    warehouseId: workOrder.warehouseId,
                    quantity: parseFloat(adjustQty),
                    unit: adjustMat.unit || 'unit',
                    notes: adjustNotes || undefined,
                  });
                }}
              >
                {adjustMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply Adjustment
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!historyMat} onOpenChange={(open) => !open && setHistoryMat(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction History — {historyMat?.name}</DialogTitle>
            </DialogHeader>
            {isTxLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>New Qty</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!rmTransactions || rmTransactions.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transactions recorded
                      </TableCell>
                    </TableRow>
                  ) : (
                    rmTransactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-blue-500/8 text-blue-600 dark:text-blue-400">
                            {tx.transactionType}
                          </Badge>
                        </TableCell>
                        <TableCell>{tx.quantity} {tx.unit}</TableCell>
                        <TableCell>{tx.newQuantity} {tx.unit}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tx.notes || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
}
