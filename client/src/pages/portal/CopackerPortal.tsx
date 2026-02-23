import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Package, Truck, Upload, Warehouse, Save, ClipboardPaste, Download, FileSpreadsheet, CheckCircle, AlertCircle, Sparkles, Mail, Loader2 } from "lucide-react";

type AIMatchedItem = {
  inventoryId: number;
  productId: number;
  productName: string;
  sku: string;
  currentQuantity: number;
  newQuantity: number;
  aiProductName: string;
  matchType: 'sku' | 'exact_name' | 'fuzzy_name';
};

type AIUnmatchedItem = {
  productName: string;
  sku?: string;
  quantity: number;
};

export default function CopackerPortal() {
  const { user } = useAuth();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [changedIds, setChangedIds] = useState<Set<number>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [csvPreview, setCsvPreview] = useState<Array<{ sku: string; quantity: number; name?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  // AI import state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiMatched, setAiMatched] = useState<AIMatchedItem[]>([]);
  const [aiUnmatched, setAiUnmatched] = useState<AIUnmatchedItem[]>([]);

  // Email form state
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");

  // Queries
  const { data: warehouse } = trpc.copackerPortal.getWarehouse.useQuery();
  const { data: inventory, isLoading: loadingInventory, refetch: refetchInventory } = trpc.copackerPortal.getInventory.useQuery();
  const { data: shipments, isLoading: loadingShipments } = trpc.copackerPortal.getShipments.useQuery();

  // Initialize quantities from inventory data
  useEffect(() => {
    if (inventory && Object.keys(quantities).length === 0) {
      const initial: Record<number, string> = {};
      inventory.forEach((item: any) => {
        initial[item.inventory.id] = parseFloat(item.inventory.quantity || "0").toString();
      });
      setQuantities(initial);
    }
  }, [inventory]);

  // Mutations
  const batchUpdate = trpc.copackerPortal.batchUpdateInventory.useMutation({
    onSuccess: (data) => {
      toast.success(`Inventory updated: ${data.updated} items changed, ${data.skipped} unchanged`);
      setChangedIds(new Set());
      refetchInventory();
    },
    onError: (error) => {
      toast.error("Failed to update inventory", { description: error.message });
    },
  });

  const csvImport = trpc.copackerPortal.importCsv.useMutation({
    onSuccess: (data) => {
      const parts = [];
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.created > 0) parts.push(`${data.created} created`);
      if (data.notFound.length > 0) parts.push(`${data.notFound.length} SKUs not found`);
      toast.success(`CSV import complete: ${parts.join(', ')}`);
      if (data.notFound.length > 0) {
        toast.warning(`SKUs not found: ${data.notFound.join(', ')}`);
      }
      setCsvUploadOpen(false);
      setCsvPreview([]);
      refetchInventory();
      setQuantities({});
    },
    onError: (error) => {
      toast.error("CSV import failed", { description: error.message });
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

  const aiImport = trpc.copackerPortal.importWithAI.useMutation({
    onSuccess: (data) => {
      setAiMatched(data.matched);
      setAiUnmatched(data.unmatched);
      setAiPreviewOpen(true);
      if (data.matched.length === 0) {
        toast.warning("AI could not match any items to your inventory");
      }
    },
    onError: (error) => {
      toast.error("AI import failed", { description: error.message });
    },
  });

  const aiConfirm = trpc.copackerPortal.confirmAIImport.useMutation({
    onSuccess: (data) => {
      toast.success(`AI import applied: ${data.updated} items updated`);
      setAiPreviewOpen(false);
      setAiMatched([]);
      setAiUnmatched([]);
      refetchInventory();
      setQuantities({});
    },
    onError: (error) => {
      toast.error("Failed to apply AI import", { description: error.message });
    },
  });

  const sendEmailForm = trpc.copackerPortal.sendInventoryEmailForm.useMutation({
    onSuccess: () => {
      toast.success(`Inventory count form sent to ${emailAddress}`);
      setEmailFormOpen(false);
      setEmailAddress("");
    },
    onError: (error) => {
      toast.error("Failed to send email", { description: error.message });
    },
  });

  const handleQuantityChange = useCallback((inventoryId: number, value: string) => {
    setQuantities(prev => ({ ...prev, [inventoryId]: value }));
    setChangedIds(prev => new Set(prev).add(inventoryId));
  }, []);

  const submitQuickCount = () => {
    if (changedIds.size === 0) {
      toast.info("No changes to submit");
      return;
    }

    const items = Array.from(changedIds).map(id => ({
      inventoryId: id,
      quantity: parseFloat(quantities[id] || "0") || 0,
      notes: "Quick count",
    }));

    batchUpdate.mutate({ items });
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseCsvText(text);
    };
    reader.readAsText(file);
  };

  const parseCsvText = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      toast.error("CSV must have a header row and at least one data row");
      return;
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const skuCol = header.findIndex(h => h === 'sku' || h === 'item' || h === 'product_sku' || h === 'item_sku');
    const qtyCol = header.findIndex(h => h === 'quantity' || h === 'qty' || h === 'count' || h === 'on_hand' || h === 'onhand');

    if (skuCol === -1 || qtyCol === -1) {
      toast.error("CSV must have 'SKU' and 'Quantity' columns");
      return;
    }

    const rows: Array<{ sku: string; quantity: number }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
      const sku = cols[skuCol];
      const qty = parseFloat(cols[qtyCol]);

      if (sku && !isNaN(qty)) {
        rows.push({ sku, quantity: qty });
      }
    }

    if (rows.length === 0) {
      toast.error("No valid rows found in CSV");
      return;
    }

    setCsvPreview(rows);
    setCsvUploadOpen(true);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard is empty");
        return;
      }

      const delimiter = text.includes('\t') ? '\t' : ',';
      const lines = text.trim().split('\n');

      const rows: Array<{ sku: string; quantity: number }> = [];
      for (const line of lines) {
        const cols = line.split(delimiter).map(c => c.trim().replace(/"/g, ''));
        if (cols.length >= 2) {
          const sku = cols[0];
          const qty = parseFloat(cols[1]);
          if (sku && !isNaN(qty) && sku.toLowerCase() !== 'sku') {
            rows.push({ sku, quantity: qty });
          }
        }
      }

      if (rows.length === 0) {
        toast.error("No valid data found. Paste should have SKU and Quantity columns.");
        return;
      }

      setCsvPreview(rows);
      setCsvUploadOpen(true);
    } catch {
      toast.error("Could not read clipboard. Try uploading a CSV file instead.");
    }
  };

  const submitCsvImport = () => {
    csvImport.mutate({
      rows: csvPreview.map(r => ({
        sku: r.sku,
        quantity: r.quantity,
      })),
    });
  };

  const downloadTemplate = () => {
    const headers = "SKU,Quantity,Notes";
    const rows = inventory?.map((item: any) =>
      `${item.product?.sku || ""},${parseFloat(item.inventory.quantity || "0")},`
    ).join('\n') || '';
    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-count-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAIFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      aiImport.mutate({
        fileData: base64,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);

    // Reset file input
    if (aiFileInputRef.current) {
      aiFileInputRef.current.value = "";
    }
  };

  const submitAIImport = () => {
    aiConfirm.mutate({
      items: aiMatched.map(item => ({
        inventoryId: item.inventoryId,
        quantity: item.newQuantity,
      })),
    });
  };

  const handleSendEmailForm = () => {
    if (!emailAddress.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    sendEmailForm.mutate({ email: emailAddress });
  };

  const handleShipmentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const changeCount = changedIds.size;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Copacker Portal</h1>
          <p className="text-muted-foreground">
            Update inventory counts and manage shipment documents
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

      <Tabs defaultValue="quick-count">
        <TabsList>
          <TabsTrigger value="quick-count">
            <Package className="h-4 w-4 mr-2" />
            Quick Count
          </TabsTrigger>
          <TabsTrigger value="shipments">
            <Truck className="h-4 w-4 mr-2" />
            Shipments
          </TabsTrigger>
        </TabsList>

        {/* Quick Count Tab - All items editable at once */}
        <TabsContent value="quick-count" className="mt-4 space-y-4">
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePasteFromClipboard}>
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Paste from Spreadsheet
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => aiFileInputRef.current?.click()}
                disabled={aiImport.isPending}
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {aiImport.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {aiImport.isPending ? "AI Reading..." : "Upload Any File (AI)"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmailFormOpen(true)}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email Count Form
              </Button>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleCsvFile}
              />
              <input
                ref={aiFileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.tsv"
                className="hidden"
                onChange={handleAIFileUpload}
              />
            </div>

            <Button
              onClick={submitQuickCount}
              disabled={changeCount === 0 || batchUpdate.isPending}
              className="min-w-[160px]"
            >
              <Save className="h-4 w-4 mr-2" />
              {batchUpdate.isPending ? "Saving..." : `Submit Count${changeCount > 0 ? ` (${changeCount})` : ''}`}
            </Button>
          </div>

          {/* Quick count table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Inventory Count</CardTitle>
              <CardDescription>
                Enter current quantities for each item, then click Submit Count
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInventory ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : !inventory?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4" />
                  <p>No inventory items found for your facility</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="w-[140px]">Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory?.map((item: any) => {
                      const id = item.inventory.id;
                      const currentValue = quantities[id] ?? parseFloat(item.inventory.quantity || "0").toString();
                      const originalValue = parseFloat(item.inventory.quantity || "0");
                      const hasChanged = changedIds.has(id);
                      const newValue = parseFloat(currentValue) || 0;
                      const diff = newValue - originalValue;

                      return (
                        <TableRow
                          key={id}
                          className={hasChanged ? "bg-blue-50/50" : undefined}
                        >
                          <TableCell className="font-medium">
                            {item.product?.name || "Unknown Product"}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">
                            {item.product?.sku || "--"}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={currentValue}
                              onChange={(e) => handleQuantityChange(id, e.target.value)}
                              className={`w-[120px] font-mono ${hasChanged ? 'border-blue-400 bg-blue-50' : ''}`}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.product?.unit || "units"}
                          </TableCell>
                          <TableCell>
                            {hasChanged ? (
                              <Badge
                                variant="outline"
                                className={diff > 0
                                  ? "bg-green-50 text-green-700 border-green-300"
                                  : diff < 0
                                    ? "bg-red-50 text-red-700 border-red-300"
                                    : "bg-gray-50 text-gray-600 border-gray-300"
                                }
                              >
                                {diff > 0 ? `+${diff}` : diff === 0 ? 'no change' : diff}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {item.inventory.updatedAt
                                  ? new Date(item.inventory.updatedAt).toLocaleDateString()
                                  : ""}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shipments Tab */}
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
                        <TableCell>{shipment.carrier || "--"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {shipment.trackingNumber || "--"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{shipment.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {shipment.shipDate
                            ? new Date(shipment.shipDate).toLocaleDateString()
                            : "--"}
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

      {/* Upload Shipment Document Dialog */}
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
              <Label htmlFor="shipment-file">Select File</Label>
              <Input
                id="shipment-file"
                type="file"
                onChange={handleShipmentFileUpload}
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

      {/* CSV Import Preview Dialog */}
      <Dialog open={csvUploadOpen} onOpenChange={setCsvUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Inventory from CSV
            </DialogTitle>
            <DialogDescription>
              Review the data below before importing. {csvPreview.length} items found.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvPreview.map((row, idx) => {
                  const matchedItem = inventory?.find(
                    (item: any) => item.product?.sku === row.sku
                  );
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{row.sku}</TableCell>
                      <TableCell className="font-mono">{row.quantity}</TableCell>
                      <TableCell>
                        {matchedItem ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle className="h-3 w-3" />
                            {matchedItem.product?.name}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 text-sm">
                            <AlertCircle className="h-3 w-3" />
                            No match
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCsvUploadOpen(false); setCsvPreview([]); }}>
              Cancel
            </Button>
            <Button
              onClick={submitCsvImport}
              disabled={csvImport.isPending}
            >
              {csvImport.isPending ? "Importing..." : `Import ${csvPreview.length} Items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Import Preview Dialog */}
      <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              AI-Parsed Inventory Results
            </DialogTitle>
            <DialogDescription>
              AI extracted {aiMatched.length + aiUnmatched.length} items from your file.
              {aiMatched.length > 0 && ` ${aiMatched.length} matched to your inventory.`}
              {aiUnmatched.length > 0 && ` ${aiUnmatched.length} could not be matched.`}
            </DialogDescription>
          </DialogHeader>

          {aiMatched.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-green-700">Matched Items</h4>
              <div className="max-h-[300px] overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-center">Current</TableHead>
                      <TableHead className="text-center">New</TableHead>
                      <TableHead>Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiMatched.map((item, idx) => {
                      const diff = item.newQuantity - item.currentQuantity;
                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-sm">{item.productName}</div>
                              {item.aiProductName !== item.productName && (
                                <div className="text-xs text-muted-foreground">
                                  AI read: "{item.aiProductName}"
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {item.sku || "--"}
                          </TableCell>
                          <TableCell className="text-center font-mono">{item.currentQuantity}</TableCell>
                          <TableCell className="text-center">
                            <span className="font-mono font-medium">{item.newQuantity}</span>
                            {diff !== 0 && (
                              <Badge
                                variant="outline"
                                className={`ml-1 text-xs ${diff > 0
                                  ? "bg-green-50 text-green-700 border-green-300"
                                  : "bg-red-50 text-red-700 border-red-300"
                                }`}
                              >
                                {diff > 0 ? `+${diff}` : diff}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                item.matchType === 'sku'
                                  ? "bg-green-50 text-green-700 border-green-300"
                                  : item.matchType === 'exact_name'
                                    ? "bg-blue-50 text-blue-700 border-blue-300"
                                    : "bg-amber-50 text-amber-700 border-amber-300"
                              }
                            >
                              {item.matchType === 'sku' ? 'SKU' : item.matchType === 'exact_name' ? 'Name' : 'Fuzzy'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {aiUnmatched.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-amber-700">Unmatched Items (will be skipped)</h4>
              <div className="max-h-[150px] overflow-auto border rounded-lg border-amber-200 bg-amber-50/50">
                <Table>
                  <TableBody>
                    {aiUnmatched.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-1 text-amber-700">
                            <AlertCircle className="h-3 w-3" />
                            {item.productName} {item.sku ? `(${item.sku})` : ''} - Qty: {item.quantity}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAiPreviewOpen(false); setAiMatched([]); setAiUnmatched([]); }}>
              Cancel
            </Button>
            <Button
              onClick={submitAIImport}
              disabled={aiConfirm.isPending || aiMatched.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {aiConfirm.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                `Apply ${aiMatched.length} Updates`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Count Form Dialog */}
      <Dialog open={emailFormOpen} onOpenChange={setEmailFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Send Inventory Count Form
            </DialogTitle>
            <DialogDescription>
              Send a pre-filled inventory form via email. The recipient can reply with updated counts,
              or attach any file (CSV, Excel, PDF, photo of count sheet). AI will parse their response.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-address">Recipient Email</Label>
              <Input
                id="email-address"
                type="email"
                placeholder="copacker@example.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p className="font-medium mb-1">The email will include:</p>
              <ul className="list-disc ml-4 space-y-0.5 text-blue-700">
                <li>Table of all products with current counts</li>
                <li>"New Count" column for them to fill in</li>
                <li>Instructions to reply or attach a file</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEmailFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendEmailForm}
              disabled={sendEmailForm.isPending || !emailAddress.trim()}
            >
              {sendEmailForm.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Form
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
