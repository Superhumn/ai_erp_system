import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Package, Truck, Upload, Warehouse, Edit2, Save, X } from "lucide-react";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function CopackerPortal() {
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  
  // Queries
  const { data: warehouse } = trpc.copackerPortal.getWarehouse.useQuery();
  const { data: inventory, isLoading: loadingInventory, refetch: refetchInventory } = trpc.copackerPortal.getInventory.useQuery();
  const { data: shipments, isLoading: loadingShipments } = trpc.copackerPortal.getShipments.useQuery();
  
  // Mutations
  const updateInventory = trpc.copackerPortal.updateInventory.useMutation({
    onSuccess: () => {
      toast.success("Inventory updated");
      setEditingId(null);
      refetchInventory();
    },
    onError: (error) => {
      toast.error("Failed to update inventory", { description: error.message });
    },
  });
  
  const uploadDocument = trpc.copackerPortal.uploadShipmentDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded");
      setUploadOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to upload document", { description: error.message });
    },
  });
  
  const startEdit = (item: any) => {
    setEditingId(item.inventory.id);
    setEditQuantity(item.inventory.quantity?.toString() || "0");
    setEditNotes("");
  };
  
  const cancelEdit = () => {
    setEditingId(null);
    setEditQuantity("");
    setEditNotes("");
  };
  
  const saveEdit = (inventoryId: number) => {
    updateInventory.mutate({
      inventoryId,
      quantity: parseFloat(editQuantity) || 0,
      notes: editNotes || undefined,
    });
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedShipmentId) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadDocument.mutate({
        shipmentId: selectedShipmentId,
        documentType: "other",
        name: file.name,
        fileData: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  // Check if user has copacker access
  if (user?.role !== "copacker" && user?.role !== "admin" && user?.role !== "ops") {
    return (
      <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                You don't have access to the Copacker Portal.
              </p>
            </CardContent>
          </Card>
        </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Copacker Portal</h1>
            <p className="text-muted-foreground">
              Manage inventory and shipment documents for your facility
            </p>
          </div>
          {warehouse && (
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{warehouse.name}</span>
                <Badge variant="outline">{warehouse.type}</Badge>
              </div>
            </Card>
          )}
        </div>
        
        <Tabs defaultValue="inventory">
          <TabsList>
            <TabsTrigger value="inventory">
              <Package className="h-4 w-4 mr-2" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="shipments">
              <Truck className="h-4 w-4 mr-2" />
              Shipments
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="inventory" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>Inventory at Your Facility</CardTitle>
                <CardDescription>
                  Update stock quantities as products are received or shipped
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingInventory ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : !inventory?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No inventory items found for your facility
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Current Quantity</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory?.map((item: any) => (
                        <TableRow key={item.inventory.id}>
                          <TableCell className="font-medium">
                            {item.product?.name || "Unknown Product"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.product?.sku || "—"}
                          </TableCell>
                          <TableCell>
                            {editingId === item.inventory.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={editQuantity}
                                  onChange={(e) => setEditQuantity(e.target.value)}
                                  className="w-24"
                                />
                                <Input
                                  placeholder="Notes (optional)"
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  className="w-40"
                                />
                              </div>
                            ) : (
                              <span className="font-mono">
                                {parseFloat(item.inventory.quantity || "0").toLocaleString()}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{item.product?.unit || "units"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.inventory.updatedAt 
                              ? new Date(item.inventory.updatedAt).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingId === item.inventory.id ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => saveEdit(item.inventory.id)}
                                  disabled={updateInventory.isPending}
                                >
                                  <Save className="h-4 w-4 mr-1" />
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEdit}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(item)}
                              >
                                <Edit2 className="h-4 w-4 mr-1" />
                                Update
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="shipments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Shipments</CardTitle>
                <CardDescription>
                  View shipments and upload required documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingShipments ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : !shipments?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No shipments found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shipment #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Carrier</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ship Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipments?.map((shipment: any) => (
                        <TableRow key={shipment.id}>
                          <TableCell className="font-medium">
                            {shipment.shipmentNumber}
                          </TableCell>
                          <TableCell>
                            <Badge variant={shipment.type === "inbound" ? "default" : "secondary"}>
                              {shipment.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{shipment.carrier || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {shipment.trackingNumber || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{shipment.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {shipment.shipDate 
                              ? new Date(shipment.shipDate).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedShipmentId(shipment.id);
                                setUploadOpen(true);
                              }}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              Upload Doc
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Upload Document Dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Shipment Document</DialogTitle>
              <DialogDescription>
                Upload a document for this shipment (BOL, packing list, etc.)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="file">Select File</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, Word, Excel, Images
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
