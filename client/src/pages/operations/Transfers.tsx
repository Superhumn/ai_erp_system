import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, ArrowRight, Truck, Package, Eye, Send, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function Transfers() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    fromWarehouseId: 0,
    toWarehouseId: 0,
    requestedDate: new Date().toISOString().split("T")[0],
    expectedArrival: "",
    notes: "",
  });

  const { data: transfers, isLoading, refetch } = trpc.transfers.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  
  const createMutation = trpc.transfers.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Transfer ${result.transferNumber} created`);
      setIsOpen(false);
      resetForm();
      refetch();
      // Navigate to the transfer detail page
      setLocation(`/operations/transfers/${result.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      fromWarehouseId: 0,
      toWarehouseId: 0,
      requestedDate: new Date().toISOString().split("T")[0],
      expectedArrival: "",
      notes: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.fromWarehouseId || !formData.toWarehouseId) {
      toast.error("Please select source and destination locations");
      return;
    }
    if (formData.fromWarehouseId === formData.toWarehouseId) {
      toast.error("Source and destination must be different");
      return;
    }

    createMutation.mutate({
      fromWarehouseId: formData.fromWarehouseId,
      toWarehouseId: formData.toWarehouseId,
      requestedDate: new Date(formData.requestedDate),
      expectedArrival: formData.expectedArrival ? new Date(formData.expectedArrival) : undefined,
      notes: formData.notes || undefined,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "in_transit": return "bg-blue-100 text-blue-800";
      case "received": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getWarehouseName = (id: number) => {
    const wh = warehouses?.find((w: any) => w.id === id);
    return wh?.name || `Location #${id}`;
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory Transfers</h1>
            <p className="text-muted-foreground">Move inventory between locations</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Inventory Transfer</DialogTitle>
                <DialogDescription>
                  Start a new transfer request between locations
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>From Location *</Label>
                  <Select
                    value={formData.fromWarehouseId.toString()}
                    onValueChange={(v) => setFormData({ ...formData, fromWarehouseId: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source location" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses?.map((wh: any) => (
                        <SelectItem key={wh.id} value={wh.id.toString()}>
                          {wh.name} {wh.city && `(${wh.city})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To Location *</Label>
                  <Select
                    value={formData.toWarehouseId.toString()}
                    onValueChange={(v) => setFormData({ ...formData, toWarehouseId: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination location" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses?.filter((wh: any) => wh.id !== formData.fromWarehouseId).map((wh: any) => (
                        <SelectItem key={wh.id} value={wh.id.toString()}>
                          {wh.name} {wh.city && `(${wh.city})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Request Date *</Label>
                    <Input
                      type="date"
                      value={formData.requestedDate}
                      onChange={(e) => setFormData({ ...formData, requestedDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Arrival</Label>
                    <Input
                      type="date"
                      value={formData.expectedArrival}
                      onChange={(e) => setFormData({ ...formData, expectedArrival: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes about this transfer..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                  Create Transfer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
              <AITriggerButton message="Analyze inventory transfers - optimize routes and timing, identify consolidation opportunities" label="AI Transfer Analysis" />
            </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {transfers?.filter((t: any) => t.status === "draft").length || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {transfers?.filter((t: any) => t.status === "pending").length || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Transit</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {transfers?.filter((t: any) => t.status === "in_transit").length || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Received</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {transfers?.filter((t: any) => t.status === "received").length || 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transfers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Transfer Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading transfers...</div>
            ) : !transfers || transfers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transfers found. Create your first inventory transfer.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer: any) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-mono text-sm">
                        {transfer.transferNumber}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{getWarehouseName(transfer.fromWarehouseId)}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{getWarehouseName(transfer.toWarehouseId)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {transfer.requestedDate ? new Date(transfer.requestedDate).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        {transfer.expectedArrival ? new Date(transfer.expectedArrival).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(transfer.status)}>
                          {transfer.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {transfer.trackingNumber ? (
                          <span className="text-sm font-mono">{transfer.trackingNumber}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setLocation(`/operations/transfers/${transfer.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
