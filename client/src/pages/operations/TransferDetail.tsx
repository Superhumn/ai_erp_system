import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Plus, Send, CheckCircle, Package, Truck, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function TransferDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const transferId = parseInt(params.id || "0");
  
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isShipOpen, setIsShipOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    productId: 0,
    requestedQuantity: "",
    lotNumber: "",
    notes: "",
  });
  const [shipData, setShipData] = useState({
    trackingNumber: "",
    carrier: "",
  });
  const [receivedItems, setReceivedItems] = useState<{ itemId: number; receivedQuantity: number }[]>([]);

  const { data, isLoading, refetch } = trpc.transfers.getById.useQuery({ id: transferId });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  
  const addItemMutation = trpc.transfers.addItem.useMutation({
    onSuccess: () => {
      toast.success("Item added to transfer");
      setIsAddItemOpen(false);
      setNewItem({ productId: 0, requestedQuantity: "", lotNumber: "", notes: "" });
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const shipMutation = trpc.transfers.ship.useMutation({
    onSuccess: () => {
      toast.success("Transfer shipped");
      setIsShipOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const receiveMutation = trpc.transfers.receive.useMutation({
    onSuccess: () => {
      toast.success("Transfer received");
      setIsReceiveOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelMutation = trpc.transfers.cancel.useMutation({
    onSuccess: () => {
      toast.success("Transfer cancelled");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="p-6">
          <div className="text-center py-8 text-muted-foreground">Loading transfer details...</div>
        </div>
    );
  }

  if (!data?.transfer) {
    return (
      <div className="p-6">
          <div className="text-center py-8 text-muted-foreground">Transfer not found</div>
        </div>
    );
  }

  const { transfer, items } = data;

  const getWarehouseName = (id: number) => {
    const wh = warehouses?.find((w: any) => w.id === id);
    return wh?.name || `Location #${id}`;
  };

  const getProductName = (id: number) => {
    const product = products?.find((p: any) => p.id === id);
    return product?.name || `Product #${id}`;
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

  const handleAddItem = () => {
    if (!newItem.productId || !newItem.requestedQuantity) {
      toast.error("Please select a product and enter quantity");
      return;
    }
    addItemMutation.mutate({
      transferId,
      productId: newItem.productId,
      requestedQuantity: newItem.requestedQuantity,
      lotNumber: newItem.lotNumber || undefined,
      notes: newItem.notes || undefined,
    });
  };

  const handleShip = () => {
    shipMutation.mutate({
      id: transferId,
      trackingNumber: shipData.trackingNumber || undefined,
      carrier: shipData.carrier || undefined,
    });
  };

  const handleReceive = () => {
    if (receivedItems.length === 0) {
      // Auto-fill with requested quantities
      const autoItems = items.map((item: any) => ({
        itemId: item.id,
        receivedQuantity: parseFloat(item.requestedQuantity) || 0,
      }));
      receiveMutation.mutate({ id: transferId, items: autoItems });
    } else {
      receiveMutation.mutate({ id: transferId, items: receivedItems });
    }
  };

  const canAddItems = transfer.status === "draft" || transfer.status === "pending";
  const canShip = (transfer.status === "draft" || transfer.status === "pending") && items.length > 0;
  const canReceive = transfer.status === "in_transit";
  const canCancel = transfer.status !== "received" && transfer.status !== "cancelled";

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/operations/transfers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{transfer.transferNumber}</h1>
            <p className="text-muted-foreground">Inventory Transfer</p>
          </div>
          <Badge className={getStatusColor(transfer.status)}>
            {transfer.status.replace("_", " ")}
          </Badge>
        </div>

        {/* Transfer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-lg">Transfer Route</CardTitle>
              <AITriggerButton message="Analyze this transfer - suggest optimal routing and timing" label="AI Analysis" />
            </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">From</p>
                  <p className="font-medium">{getWarehouseName(transfer.fromWarehouseId)}</p>
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">To</p>
                  <p className="font-medium">{getWarehouseName(transfer.toWarehouseId)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Requested</p>
                  <p className="font-medium">
                    {transfer.requestedDate ? new Date(transfer.requestedDate).toLocaleDateString() : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expected Arrival</p>
                  <p className="font-medium">
                    {transfer.expectedArrival ? new Date(transfer.expectedArrival).toLocaleDateString() : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Shipped</p>
                  <p className="font-medium">
                    {transfer.shippedDate ? new Date(transfer.shippedDate).toLocaleDateString() : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Received</p>
                  <p className="font-medium">
                    {transfer.receivedDate ? new Date(transfer.receivedDate).toLocaleDateString() : "-"}
                  </p>
                </div>
              </div>
              {transfer.trackingNumber && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Tracking</p>
                  <p className="font-mono">{transfer.trackingNumber}</p>
                  {transfer.carrier && <p className="text-sm text-muted-foreground">{transfer.carrier}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {canAddItems && (
            <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Item to Transfer</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Product *</Label>
                    <Select
                      value={newItem.productId.toString()}
                      onValueChange={(v) => setNewItem({ ...newItem, productId: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name} ({p.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      value={newItem.requestedQuantity}
                      onChange={(e) => setNewItem({ ...newItem, requestedQuantity: e.target.value })}
                      placeholder="Enter quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Lot Number</Label>
                    <Input
                      value={newItem.lotNumber}
                      onChange={(e) => setNewItem({ ...newItem, lotNumber: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={newItem.notes}
                      onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddItem} disabled={addItemMutation.isPending}>Add Item</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canShip && (
            <Dialog open={isShipOpen} onOpenChange={setIsShipOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Send className="h-4 w-4 mr-2" />
                  Ship Transfer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ship Transfer</DialogTitle>
                  <DialogDescription>
                    This will deduct inventory from the source location and mark the transfer as in transit.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Tracking Number</Label>
                    <Input
                      value={shipData.trackingNumber}
                      onChange={(e) => setShipData({ ...shipData, trackingNumber: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Carrier</Label>
                    <Input
                      value={shipData.carrier}
                      onChange={(e) => setShipData({ ...shipData, carrier: e.target.value })}
                      placeholder="e.g., FedEx, UPS"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsShipOpen(false)}>Cancel</Button>
                  <Button onClick={handleShip} disabled={shipMutation.isPending}>
                    <Truck className="h-4 w-4 mr-2" />
                    Confirm Shipment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canReceive && (
            <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Receive Transfer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Receive Transfer</DialogTitle>
                  <DialogDescription>
                    This will add inventory to the destination location. Verify quantities received.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Shipped</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{getProductName(item.productId)}</TableCell>
                          <TableCell>{item.requestedQuantity}</TableCell>
                          <TableCell>{item.shippedQuantity || item.requestedQuantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReceiveOpen(false)}>Cancel</Button>
                  <Button onClick={handleReceive} disabled={receiveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm Receipt
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canCancel && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                if (confirm("Are you sure you want to cancel this transfer?")) {
                  cancelMutation.mutate({ id: transferId });
                }
              }}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Transfer
            </Button>
          )}
        </div>

        {/* Items Table */}
        <Card>
          <CardHeader>
            <CardTitle>Transfer Items</CardTitle>
            <CardDescription>Products included in this transfer</CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No items added yet. Add products to transfer.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Lot Number</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Shipped</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{getProductName(item.productId)}</TableCell>
                      <TableCell>{item.lotNumber || "-"}</TableCell>
                      <TableCell className="text-right">{item.requestedQuantity}</TableCell>
                      <TableCell className="text-right">{item.shippedQuantity || "-"}</TableCell>
                      <TableCell className="text-right">{item.receivedQuantity || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {transfer.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{transfer.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
  );
}
