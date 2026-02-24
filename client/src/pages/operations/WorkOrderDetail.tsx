import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Play, CheckCircle, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function WorkOrderDetail() {
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(params.id || "0");
  const [completedQty, setCompletedQty] = useState("");
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);

  const { data: workOrder, isLoading, refetch } = trpc.workOrders.getById.useQuery({ id: workOrderId });
  const { data: materials } = trpc.workOrders.getMaterials.useQuery({ workOrderId });
  const { data: products } = trpc.products.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: rawMaterials } = trpc.rawMaterials.list.useQuery();
  const { data: rmInventory } = trpc.rawMaterialInventory.list.useQuery({ warehouseId: workOrder?.warehouseId || undefined });

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
      case "draft": return "bg-gray-100 text-gray-800";
      case "scheduled": return "bg-blue-100 text-blue-800";
      case "in_progress": return "bg-yellow-100 text-yellow-800";
      case "completed": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
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
            <h1 className="text-2xl font-bold">{workOrder.workOrderNumber}</h1>
            <p className="text-muted-foreground">{product?.name}</p>
          </div>
          <Badge className={getStatusColor(workOrder.status)}>{workOrder.status.replace('_', ' ')}</Badge>
          {workOrder.status === 'draft' && (
            <Button onClick={() => startMutation.mutate({ id: workOrder.id })}>
              <Play className="w-4 h-4 mr-2" /> Start Production
            </Button>
          )}
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
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-sm font-medium text-muted-foreground">Quantity</CardTitle>
              <AITriggerButton message="Analyze this work order - optimize task sequencing and resource allocation" label="AI Analysis" />
            </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{workOrder.quantity} {workOrder.unit}</div>
              {workOrder.completedQuantity && (
                <p className="text-sm text-green-600">Completed: {workOrder.completedQuantity}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{warehouse?.name || '-'}</div>
              <p className="text-sm text-muted-foreground">{warehouse?.type}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={
                workOrder.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                workOrder.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                'bg-blue-100 text-blue-800'
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                          <span className={qty < required ? 'text-red-600 font-medium' : ''}>
                            {qty.toFixed(2)} {mat.unit}
                          </span>
                        </TableCell>
                        <TableCell>
                          {mat.status === 'consumed' ? (
                            <Badge className="bg-green-100 text-green-800">Consumed</Badge>
                          ) : mat.status === 'partial' ? (
                            <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>
                          ) : mat.status === 'shortage' ? (
                            <Badge className="bg-red-100 text-red-800">
                              <AlertTriangle className="w-3 h-3 mr-1" /> Shortage
                            </Badge>
                          ) : available ? (
                            <Badge className="bg-blue-100 text-blue-800">Ready</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">
                              <AlertTriangle className="w-3 h-3 mr-1" /> Low Stock
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {mat.consumedQuantity ? `${mat.consumedQuantity} ${mat.unit}` : '-'}
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
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(workOrder.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {workOrder.actualStartDate && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
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
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
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
      </div>
  );
}
