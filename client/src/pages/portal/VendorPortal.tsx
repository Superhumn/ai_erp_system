import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2, FileText, Truck, Upload, Package, Ship } from "lucide-react";

export default function VendorPortal() {
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [uploadType, setUploadType] = useState<"po" | "shipment" | "customs">("po");
  const [statusUpdateOpen, setStatusUpdateOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [customsUploadOpen, setCustomsUploadOpen] = useState(false);
  const [selectedClearanceId, setSelectedClearanceId] = useState<number | null>(null);
  const [customsDocType, setCustomsDocType] = useState<string>("commercial_invoice");
  
  // Queries
  const { data: vendorInfo } = trpc.vendorPortal.getVendorInfo.useQuery();
  const { data: purchaseOrders, isLoading: loadingPOs, refetch: refetchPOs } = trpc.vendorPortal.getPurchaseOrders.useQuery();
  const { data: shipments, isLoading: loadingShipments } = trpc.vendorPortal.getShipments.useQuery();
  const { data: customsClearances, isLoading: loadingCustoms, refetch: refetchCustoms } = (trpc as any).customs?.list?.useQuery() || { data: [], isLoading: false, refetch: () => {} };
  
  // Mutations
  const updatePOStatus = trpc.vendorPortal.updatePOStatus.useMutation({
    onSuccess: () => {
      toast.success("Purchase order status updated");
      setStatusUpdateOpen(false);
      refetchPOs();
    },
    onError: (error: any) => {
      toast.error("Failed to update status", { description: error.message });
    },
  });

  const uploadDocument = trpc.vendorPortal.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded");
      setUploadOpen(false);
    },
    onError: (error: any) => {
      toast.error("Failed to upload document", { description: error.message });
    },
  });

  const uploadCustomsDocument = trpc.vendorPortal.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Customs document uploaded");
      setCustomsUploadOpen(false);
      refetchCustoms();
    },
    onError: (error: any) => {
      toast.error("Failed to upload customs document", { description: error.message });
    },
  });
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadDocument.mutate({
        relatedEntityType: uploadType === "po" ? "purchase_order" : "shipment",
        relatedEntityId: uploadType === "po" ? selectedPOId! : selectedShipmentId!,
        documentType: "invoice",
        name: file.name,
        fileData: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCustomsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClearanceId) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadCustomsDocument.mutate({
        relatedEntityType: 'shipment' as any,
        relatedEntityId: selectedClearanceId || 0,
        documentType: customsDocType as any,
        name: file.name,
        fileData: base64,
        mimeType: file.type,
      } as any);
    };
    reader.readAsDataURL(file);
  };
  
  const openStatusUpdate = (po: any) => {
    setSelectedPO(po);
    setNewStatus(po.status);
    setStatusUpdateOpen(true);
  };

  // Check if user has vendor access
  if (user?.role !== "vendor" && user?.role !== "admin" && user?.role !== "ops") {
    return (
      <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                You don't have access to the Vendor Portal.
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
            <h1 className="text-2xl font-bold">Vendor Portal</h1>
            <p className="text-muted-foreground">
              Manage your purchase orders and upload documents
            </p>
          </div>
          {vendorInfo && (
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{vendorInfo.name}</span>
                {vendorInfo.type && (
                  <Badge variant="outline">{vendorInfo.type}</Badge>
                )}
              </div>
            </Card>
          )}
        </div>
        
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">
              <Package className="h-4 w-4 mr-2" />
              Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="shipments">
              <Truck className="h-4 w-4 mr-2" />
              Shipments
            </TabsTrigger>
            <TabsTrigger value="customs">
              <Ship className="h-4 w-4 mr-2" />
              Customs Clearances
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Purchase Orders</CardTitle>
                <CardDescription>
                  View and update status of purchase orders assigned to you
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPOs ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : !purchaseOrders?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No purchase orders found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead>Expected Date</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders?.map((po: any) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.poNumber}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {po.orderDate 
                              ? new Date(po.orderDate).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {po.expectedDate 
                              ? new Date(po.expectedDate).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="font-mono">
                            ${parseFloat(po.totalAmount || "0").toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                po.status === "received" ? "default" :
                                po.status === "confirmed" ? "secondary" :
                                "outline"
                              }
                            >
                              {po.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openStatusUpdate(po)}
                              >
                                Update Status
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedPOId(po.id);
                                  setUploadType("po");
                                  setUploadOpen(true);
                                }}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Upload
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
          </TabsContent>
          
          <TabsContent value="shipments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Shipments</CardTitle>
                <CardDescription>
                  View shipments and upload related documents
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
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedShipmentId(shipment.id);
                                setUploadType("shipment");
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
          
          <TabsContent value="customs" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Customs Clearances</CardTitle>
                <CardDescription>
                  Upload required documents for customs clearance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCustoms ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : !customsClearances?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No customs clearances found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clearance #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Port of Entry</TableHead>
                        <TableHead>Expected Clearance</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customsClearances?.map((clearance: any) => (
                        <TableRow key={clearance.id}>
                          <TableCell className="font-medium">
                            {clearance.clearanceNumber}
                          </TableCell>
                          <TableCell>
                            <Badge variant={clearance.type === "import" ? "default" : "secondary"}>
                              {clearance.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                clearance.status === "cleared" ? "default" :
                                clearance.status === "pending_documents" ? "outline" :
                                "secondary"
                              }
                            >
                              {clearance.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {clearance.portOfEntry || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {clearance.expectedClearanceDate 
                              ? new Date(clearance.expectedClearanceDate).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedClearanceId(clearance.id);
                                setCustomsUploadOpen(true);
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
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a document for this {uploadType === "po" ? "purchase order" : "shipment"}
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
        
        {/* Update Status Dialog */}
        <Dialog open={statusUpdateOpen} onOpenChange={setStatusUpdateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update PO Status</DialogTitle>
              <DialogDescription>
                Update the status of PO #{selectedPO?.poNumber}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="partial">Partial Shipment</SelectItem>
                    <SelectItem value="received">Received/Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusUpdateOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (selectedPO) {
                    updatePOStatus.mutate({
                      poId: selectedPO.id,
                      status: newStatus as any,
                    });
                  }
                }}
                disabled={updatePOStatus.isPending}
              >
                {updatePOStatus.isPending ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customs Document Upload Dialog */}
        <Dialog open={customsUploadOpen} onOpenChange={setCustomsUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Customs Document</DialogTitle>
              <DialogDescription>
                Upload a required document for customs clearance
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={customsDocType} onValueChange={setCustomsDocType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commercial_invoice">Commercial Invoice</SelectItem>
                    <SelectItem value="packing_list">Packing List</SelectItem>
                    <SelectItem value="bill_of_lading">Bill of Lading</SelectItem>
                    <SelectItem value="airway_bill">Airway Bill</SelectItem>
                    <SelectItem value="certificate_of_origin">Certificate of Origin</SelectItem>
                    <SelectItem value="customs_declaration">Customs Declaration</SelectItem>
                    <SelectItem value="import_license">Import License</SelectItem>
                    <SelectItem value="export_license">Export License</SelectItem>
                    <SelectItem value="insurance_certificate">Insurance Certificate</SelectItem>
                    <SelectItem value="inspection_certificate">Inspection Certificate</SelectItem>
                    <SelectItem value="phytosanitary_certificate">Phytosanitary Certificate</SelectItem>
                    <SelectItem value="fumigation_certificate">Fumigation Certificate</SelectItem>
                    <SelectItem value="dangerous_goods_declaration">Dangerous Goods Declaration</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customs-file">Select File</Label>
                <Input
                  id="customs-file"
                  type="file"
                  onChange={handleCustomsFileUpload}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, Word, Excel, Images
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomsUploadOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
