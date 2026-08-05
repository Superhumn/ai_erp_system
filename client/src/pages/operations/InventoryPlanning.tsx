import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Package, Edit, Truck, TrendingUp } from "lucide-react";

export default function InventoryPlanning() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    forecastedQuantity: "",
    poStatus: "",
    freightStatus: "",
    freightTrackingNumber: "",
  });

  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.inventoryManagement.list.useQuery();

  const updateMutation = trpc.inventoryManagement.update.useMutation({
    onSuccess: () => {
      toast.success("Inventory plan updated successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      utils.inventoryManagement.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      forecastedQuantity: "",
      poStatus: "",
      freightStatus: "",
      freightTrackingNumber: "",
    });
  };

  const handleEdit = (row: any) => {
    setEditingId(row.id);
    setFormData({
      forecastedQuantity: row.forecastedQuantity != null ? String(row.forecastedQuantity) : "",
      poStatus: row.poStatus || "",
      freightStatus: row.freightStatus || "",
      freightTrackingNumber: row.freightTrackingNumber || "",
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (editingId == null) {
      toast.error("No row selected");
      return;
    }
    const payload: {
      id: number;
      forecastedQuantity?: string;
      poStatus?: string;
      freightStatus?: string;
      freightTrackingNumber?: string;
    } = { id: editingId };
    if (formData.forecastedQuantity.trim() !== "") payload.forecastedQuantity = formData.forecastedQuantity;
    if (formData.poStatus.trim() !== "") payload.poStatus = formData.poStatus;
    if (formData.freightStatus.trim() !== "") payload.freightStatus = formData.freightStatus;
    if (formData.freightTrackingNumber.trim() !== "") payload.freightTrackingNumber = formData.freightTrackingNumber;
    updateMutation.mutate(payload);
  };

  const getProductLabel = (row: any) =>
    row.productName ?? row.product?.name ?? (row.productId != null ? `#${row.productId}` : "—");

  const getPoStatusColor = (status: string) => {
    switch (status) {
      case "received": return "bg-muted text-muted-foreground";
      case "ordered": return "bg-primary/10 text-primary";
      case "not_started": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getFreightStatusColor = (status: string) => {
    switch (status) {
      case "delivered": return "bg-muted text-muted-foreground";
      case "in_transit": return "bg-primary/10 text-primary";
      case "pending": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const formatStatus = (status: string) =>
    status ? status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Inventory Planning</h1>
          <p className="text-muted-foreground">Forecast demand and track purchase orders and freight</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planning Board</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading planning board...</div>
          ) : !rows || rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No inventory plans found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Forecasted Qty</TableHead>
                  <TableHead>PO Status</TableHead>
                  <TableHead>Freight Status</TableHead>
                  <TableHead>Tracking #</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{getProductLabel(row)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        {row.forecastedQuantity != null && row.forecastedQuantity !== "" ? row.forecastedQuantity : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.poStatus ? (
                        <Badge className={getPoStatusColor(row.poStatus)}>{formatStatus(row.poStatus)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.freightStatus ? (
                        <Badge className={getFreightStatusColor(row.freightStatus)}>{formatStatus(row.freightStatus)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.freightTrackingNumber ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Truck className="h-3 w-3 text-muted-foreground" />
                          {row.freightTrackingNumber}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(row)}>
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

      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setEditingId(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Inventory Plan</DialogTitle>
            <DialogDescription>Update forecast, purchase order, and freight details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Forecasted Quantity</Label>
              <Input
                type="number"
                placeholder="e.g., 1000"
                value={formData.forecastedQuantity}
                onChange={(e) => setFormData({ ...formData, forecastedQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>PO Status</Label>
              <Select value={formData.poStatus} onValueChange={(v) => setFormData({ ...formData, poStatus: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select PO status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Freight Status</Label>
              <Select value={formData.freightStatus} onValueChange={(v) => setFormData({ ...formData, freightStatus: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select freight status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Freight Tracking Number</Label>
              <Input
                placeholder="e.g., 1Z999AA10123456784"
                value={formData.freightTrackingNumber}
                onChange={(e) => setFormData({ ...formData, freightTrackingNumber: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              Update Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
