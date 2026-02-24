import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Truck, CheckCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
interface ReceivingItem {
  purchaseOrderItemId: number;
  rawMaterialId?: number;
  productId?: number;
  name: string;
  orderedQty: number;
  receivedQty: number;
  quantity: number;
  unit: string;
  lotNumber: string;
}

export default function POReceiving() {
  const [selectedPO, setSelectedPO] = useState<number | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number>(0);
  const [receivingItems, setReceivingItems] = useState<ReceivingItem[]>([]);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);

  const { data: purchaseOrders } = trpc.purchaseOrders.list.useQuery();
  const { data: poItems } = trpc.purchaseOrders.getItems.useQuery(
    { purchaseOrderId: selectedPO || 0 },
    { enabled: !!selectedPO }
  );
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: rawMaterials } = trpc.rawMaterials.list.useQuery();

  const receiveMutation = trpc.poReceiving.receive.useMutation({
    onSuccess: () => {
      toast.success("Items received and inventory updated");
      setIsReceiveOpen(false);
      setReceivingItems([]);
      setSelectedPO(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const pendingPOs = purchaseOrders?.filter(po => 
    po.status === 'sent' || po.status === 'confirmed' || po.status === 'partial'
  );

  const handleSelectPO = (poId: string) => {
    setSelectedPO(parseInt(poId));
    setReceivingItems([]);
  };

  const initializeReceiving = () => {
    if (!poItems) return;
    
    const items: ReceivingItem[] = poItems.map((item: any) => {
      const product = products?.find(p => p.id === item.productId);
      const rm = rawMaterials?.find(r => r.name === product?.name);
      return {
        purchaseOrderItemId: item.id,
        rawMaterialId: rm?.id,
        productId: item.productId,
        name: product?.name || `Product #${item.productId}`,
        orderedQty: parseFloat(item.quantity?.toString() || '0'),
        receivedQty: parseFloat(item.receivedQuantity?.toString() || '0'),
        quantity: parseFloat(item.quantity?.toString() || '0') - parseFloat(item.receivedQuantity?.toString() || '0'),
        unit: item.unit || 'EA',
        lotNumber: '',
      };
    });
    
    setReceivingItems(items.filter(i => i.quantity > 0));
    setIsReceiveOpen(true);
  };

  const updateReceivingItem = (index: number, field: keyof ReceivingItem, value: any) => {
    const updated = [...receivingItems];
    (updated[index] as any)[field] = value;
    setReceivingItems(updated);
  };

  const handleReceive = () => {
    if (!selectedPO || !selectedWarehouse) {
      toast.error("Please select a PO and warehouse");
      return;
    }

    receiveMutation.mutate({
      purchaseOrderId: selectedPO,
      warehouseId: selectedWarehouse,
      items: receivingItems.filter(i => i.quantity > 0).map(i => ({
        purchaseOrderItemId: i.purchaseOrderItemId,
        rawMaterialId: i.rawMaterialId,
        productId: i.productId,
        quantity: i.quantity,
        unit: i.unit,
        lotNumber: i.lotNumber || undefined,
      })),
    });
  };

  const selectedPOData = purchaseOrders?.find(po => po.id === selectedPO);

  return (
    <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">PO Receiving</h1>
          <p className="text-muted-foreground">Receive shipments and update raw material inventory</p>
        </div>

        {/* Pending POs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Pending Purchase Orders
            </CardTitle>
            <CardDescription>Select a PO to receive items</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPOs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No pending purchase orders to receive
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingPOs?.map(po => (
                    <TableRow key={po.id} className={selectedPO === po.id ? 'bg-muted' : ''}>
                      <TableCell className="font-mono">{po.poNumber}</TableCell>
                      <TableCell>{po.vendorId}</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>
                        <Badge className={
                          po.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }>
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={selectedPO === po.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleSelectPO(po.id.toString())}
                        >
                          {selectedPO === po.id ? 'Selected' : 'Select'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* PO Items */}
        {selectedPO && poItems && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    PO Items - {selectedPOData?.poNumber}
                  </CardTitle>
                  <CardDescription>Items to receive from this purchase order</CardDescription>
                </div>
                <Button onClick={initializeReceiving}>
                  <ArrowRight className="w-4 h-4 mr-2" /> Start Receiving
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poItems.map((item: any) => {
                    const product = products?.find(p => p.id === item.productId);
                    const ordered = parseFloat(item.quantity?.toString() || '0');
                    const received = parseFloat(item.receivedQuantity?.toString() || '0');
                    const remaining = ordered - received;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{product?.name || `Product #${item.productId}`}</TableCell>
                        <TableCell>{ordered} {item.unit}</TableCell>
                        <TableCell>{received} {item.unit}</TableCell>
                        <TableCell className={remaining > 0 ? 'font-medium' : 'text-muted-foreground'}>
                          {remaining} {item.unit}
                        </TableCell>
                        <TableCell>
                          {remaining === 0 ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" /> Complete
                            </Badge>
                          ) : received > 0 ? (
                            <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Receiving Dialog */}
        <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Receive Items - {selectedPOData?.poNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Receiving Location</Label>
                <Select value={selectedWarehouse.toString()} onValueChange={v => setSelectedWarehouse(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse/location" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map(wh => (
                      <SelectItem key={wh.id} value={wh.id.toString()}>
                        {wh.name} ({wh.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty to Receive</TableHead>
                    <TableHead>Lot Number</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivingItems.map((item, idx) => (
                    <TableRow key={item.purchaseOrderItemId}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Remaining: {item.orderedQty - item.receivedQty} {item.unit}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateReceivingItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.lotNumber}
                          onChange={e => updateReceivingItem(idx, 'lotNumber', e.target.value)}
                          placeholder="Optional"
                          className="w-32"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Button
                className="w-full"
                onClick={handleReceive}
                disabled={!selectedWarehouse || receivingItems.every(i => i.quantity === 0)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Receive Items & Update Inventory
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}
