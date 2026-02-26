import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, FileText, Truck, Package, AlertCircle, CheckCircle, Clock, Edit2, X, ChevronRight, History, Loader2, FolderOpen, Cloud, ChevronLeft, File, RefreshCw, FlaskConical, Mail } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface ParsedLineItem {
  description: string;
  sku?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  matchedMaterialId?: number;
  matchedMaterialName?: string;
  confidence?: number;
}

interface ParsedPO {
  poNumber: string;
  vendorName: string;
  vendorEmail?: string;
  orderDate: string;
  deliveryDate?: string;
  subtotal: number;
  totalAmount: number;
  notes?: string;
  status?: string;
  lineItems: ParsedLineItem[];
  confidence: number;
}

interface ParsedFreightInvoice {
  invoiceNumber: string;
  carrierName: string;
  carrierEmail?: string;
  invoiceDate: string;
  shipmentDate?: string;
  deliveryDate?: string;
  origin?: string;
  destination?: string;
  trackingNumber?: string;
  weight?: string;
  dimensions?: string;
  freightCharges: number;
  fuelSurcharge?: number;
  accessorialCharges?: number;
  totalAmount: number;
  currency?: string;
  relatedPoNumber?: string;
  notes?: string;
  confidence: number;
}

interface ParsedVendorInvoice {
  invoiceNumber: string;
  vendorName: string;
  vendorEmail?: string;
  invoiceDate: string;
  dueDate?: string;
  lineItems: ParsedLineItem[];
  subtotal: number;
  taxAmount?: number;
  shippingAmount?: number;
  totalAmount: number;
  currency?: string;
  relatedPoNumber?: string;
  paymentTerms?: string;
  notes?: string;
  confidence: number;
}

interface ParsedCustomsLineItem {
  description: string;
  hsCode?: string;
  quantity: number;
  unit?: string;
  declaredValue: number;
  dutyRate?: number;
  dutyAmount?: number;
  countryOfOrigin?: string;
}

interface ParsedCustomsDocument {
  documentNumber: string;
  documentType: "bill_of_lading" | "customs_entry" | "commercial_invoice" | "packing_list" | "certificate_of_origin" | "import_permit" | "other";
  entryDate: string;
  shipperName: string;
  shipperCountry?: string;
  consigneeName: string;
  consigneeCountry?: string;
  countryOfOrigin: string;
  portOfEntry?: string;
  portOfExit?: string;
  vesselName?: string;
  voyageNumber?: string;
  containerNumber?: string;
  lineItems: ParsedCustomsLineItem[];
  totalDeclaredValue: number;
  totalDuties?: number;
  totalTaxes?: number;
  totalCharges: number;
  currency?: string;
  brokerName?: string;
  brokerReference?: string;
  relatedPoNumber?: string;
  trackingNumber?: string;
  notes?: string;
  confidence: number;
}

interface ParsedCoaTestResult {
  testName: string;
  category: "chemical" | "microbiological" | "physical" | "sensory" | "heavy_metal" | "allergen" | "other";
  method?: string;
  specification?: string;
  specMin?: string;
  specMax?: string;
  result: string;
  unit?: string;
  status: "pass" | "fail" | "marginal";
}

interface ParsedCoa {
  coaNumber: string;
  supplierName: string;
  supplierEmail?: string;
  productName: string;
  productSku?: string;
  lotCode?: string;
  batchNumber?: string;
  manufactureDate?: string;
  expiryDate?: string;
  analysisDate?: string;
  testResults: ParsedCoaTestResult[];
  overallStatus: "pass" | "fail" | "conditional_pass";
  allergenDeclarations?: string[];
  storageConditions?: string;
  notes?: string;
  confidence: number;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

export default function DocumentImport() {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadType, setUploadType] = useState<"po" | "freight" | "vendor_invoice" | "customs" | "coa">("po");
  const [isUploading, setIsUploading] = useState(false);
  const [parsedPO, setParsedPO] = useState<ParsedPO | null>(null);
  const [parsedFreight, setParsedFreight] = useState<ParsedFreightInvoice | null>(null);
  const [parsedVendorInvoice, setParsedVendorInvoice] = useState<ParsedVendorInvoice | null>(null);
  const [parsedCustoms, setParsedCustoms] = useState<ParsedCustomsDocument | null>(null);
  const [parsedCoa, setParsedCoa] = useState<ParsedCoa | null>(null);
  const [showEmailScan, setShowEmailScan] = useState(false);
  const [emailConfig, setEmailConfig] = useState({ host: "", port: 993, user: "", pass: "" });
  const [showPreview, setShowPreview] = useState(false);
  const [markAsReceived, setMarkAsReceived] = useState(true);
  const [updateInventory, setUpdateInventory] = useState(true);
  const [linkToPO, setLinkToPO] = useState(true);
  const [editingLineItem, setEditingLineItem] = useState<number | null>(null);
  
  // Google Drive state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: "My Drive" }]);
  const [selectedFiles, setSelectedFiles] = useState<DriveFile[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<Array<{ fileName: string; success: boolean; error?: string; data?: any }>>([]);

  const parseMutation = trpc.documentImport.parse.useMutation();
  const importPOMutation = trpc.documentImport.importPO.useMutation();
  const importFreightMutation = trpc.documentImport.importFreightInvoice.useMutation();
  const importVendorInvoiceMutation = trpc.documentImport.importVendorInvoice.useMutation();
  const importCustomsMutation = trpc.documentImport.importCustomsDocument.useMutation();
  const parseCoaMutation = trpc.documentImport.parseCoa.useMutation();
  const importCoaMutation = trpc.documentImport.importCoa.useMutation();
  const scanEmailMutation = trpc.documentImport.scanEmailForCoas.useMutation();
  const matchMaterialsMutation = trpc.documentImport.matchMaterials.useMutation();
  const historyQuery = trpc.documentImport.getHistory.useQuery({ limit: 50 });
  
  // Google Drive queries
  const googleConnectionQuery = trpc.sheetsImport.getConnectionStatus.useQuery();
  const googleAuthUrlQuery = trpc.sheetsImport.getAuthUrl.useQuery();
  const driveFoldersQuery = trpc.documentImport.listDriveFolders.useQuery(
    { parentFolderId: currentFolderId || undefined },
    { enabled: googleConnectionQuery.data?.connected && activeTab === "drive" }
  );
  const driveFilesQuery = trpc.documentImport.listDriveFiles.useQuery(
    { folderId: currentFolderId || "root" },
    { enabled: googleConnectionQuery.data?.connected && activeTab === "drive" && !!currentFolderId }
  );
  const parseFromDriveMutation = trpc.documentImport.parseFromDrive.useMutation();
  const batchParseFromDriveMutation = trpc.documentImport.batchParseFromDrive.useMutation();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setIsUploading(true);
    
    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        
        console.log("[DocumentImport] Uploading file:", file.name, "type:", file.type);
        
        const result = await parseMutation.mutateAsync({
          fileData: base64,
          fileName: file.name,
          mimeType: file.type,
        });
        
        console.log("[DocumentImport] Parse result:", result);
        
        if (result.documentType === "purchase_order" && result.purchaseOrder) {
          // Match line items to materials
          try {
            const matchedItems = await matchMaterialsMutation.mutateAsync({
              lineItems: result.purchaseOrder.lineItems,
            });

            setParsedPO({
              ...result.purchaseOrder,
              lineItems: matchedItems.map((item: any) => ({
                ...item,
                matchedMaterialId: item.rawMaterialId,
                matchedMaterialName: item.rawMaterialId ? item.description : undefined,
              })),
            });
          } catch (matchError) {
            console.error("[DocumentImport] Material matching error:", matchError);
            // Still show the PO without material matching
            setParsedPO({
              ...result.purchaseOrder,
              lineItems: result.purchaseOrder.lineItems.map((item: any) => ({
                ...item,
                matchedMaterialId: undefined,
                matchedMaterialName: undefined,
              })),
            });
          }
          setUploadType("po");
          setShowPreview(true);
        } else if (result.documentType === "vendor_invoice" && result.vendorInvoice) {
          // Match line items to materials for vendor invoices
          try {
            const matchedItems = await matchMaterialsMutation.mutateAsync({
              lineItems: result.vendorInvoice.lineItems,
            });

            setParsedVendorInvoice({
              ...result.vendorInvoice,
              lineItems: matchedItems.map((item: any) => ({
                ...item,
                matchedMaterialId: item.rawMaterialId,
                matchedMaterialName: item.rawMaterialId ? item.description : undefined,
              })),
            });
          } catch (matchError) {
            console.error("[DocumentImport] Material matching error:", matchError);
            setParsedVendorInvoice({
              ...result.vendorInvoice,
              lineItems: result.vendorInvoice.lineItems.map((item: any) => ({
                ...item,
                matchedMaterialId: undefined,
                matchedMaterialName: undefined,
              })),
            });
          }
          setUploadType("vendor_invoice");
          setShowPreview(true);
        } else if (result.documentType === "freight_invoice" && result.freightInvoice) {
          setParsedFreight(result.freightInvoice);
          setUploadType("freight");
          setShowPreview(true);
        } else if (result.documentType === "customs_document" && result.customsDocument) {
          setParsedCustoms(result.customsDocument);
          setUploadType("customs");
          setShowPreview(true);
        } else if (result.documentType === "coa" && result.coa) {
          setParsedCoa(result.coa);
          setUploadType("coa");
          setShowPreview(true);
        } else {
          console.error("[DocumentImport] Unknown document type or missing data:", {
            documentType: result.documentType,
            hasPurchaseOrder: !!result.purchaseOrder,
            hasFreightInvoice: !!result.freightInvoice,
            hasCustomsDocument: !!result.customsDocument,
            success: result.success,
            error: result.error,
            fullResult: result
          });
          toast.error(result.error || "Could not determine document type. Please try again or manually enter the data.");
        }
      } catch (error) {
        console.error("[DocumentImport] Upload error:", error);
        toast.error("Failed to parse document. Please try again.");
      } finally {
        setIsUploading(false);
      }
    };
    
    reader.onerror = () => {
      console.error("[DocumentImport] File read error");
      toast.error("Failed to read file. Please try again.");
      setIsUploading(false);
    };
    
    reader.readAsDataURL(file);
  }, [parseMutation, matchMaterialsMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    maxFiles: 1,
  });

  const handleImportPO = async () => {
    if (!parsedPO) return;
    
    try {
      const result = await importPOMutation.mutateAsync({
        poData: parsedPO,
        markAsReceived,
        updateInventory,
      });
      
      toast.success(`Purchase order ${parsedPO.poNumber} imported successfully!`);
      setParsedPO(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import purchase order. Please try again.");
    }
  };

  const handleImportFreight = async () => {
    if (!parsedFreight) return;

    try {
      const result = await importFreightMutation.mutateAsync({
        invoiceData: parsedFreight,
        linkToPO,
      });

      toast.success(`Freight invoice ${parsedFreight.invoiceNumber} imported successfully!`);
      setParsedFreight(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import freight invoice. Please try again.");
    }
  };

  const handleImportVendorInvoice = async () => {
    if (!parsedVendorInvoice) return;

    try {
      const result = await importVendorInvoiceMutation.mutateAsync({
        invoiceData: parsedVendorInvoice,
        markAsReceived,
        updateInventory,
      });

      toast.success(`Vendor invoice ${parsedVendorInvoice.invoiceNumber} imported successfully!`);
      setParsedVendorInvoice(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import vendor invoice. Please try again.");
    }
  };

  const handleImportCustoms = async () => {
    if (!parsedCustoms) return;

    try {
      const result = await importCustomsMutation.mutateAsync({
        documentData: parsedCustoms,
        linkToPO,
      });

      toast.success(`Customs document ${parsedCustoms.documentNumber} imported successfully!`);
      setParsedCustoms(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import customs document. Please try again.");
    }
  };

  const handleImportCoa = async () => {
    if (!parsedCoa) return;

    try {
      const result = await importCoaMutation.mutateAsync({
        coaData: parsedCoa,
        linkToProduct: true,
        linkToVendor: true,
        createMissingProduct: true,
      });

      if (result.success) {
        toast.success(`COA ${parsedCoa.coaNumber} imported successfully! ${result.createdRecords.length} records created.`);
      } else {
        toast.error(result.error || "Failed to import COA");
      }
      setParsedCoa(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      console.error("COA Import error:", error);
      toast.error("Failed to import COA. Please try again.");
    }
  };

  const handleScanEmail = async () => {
    if (!emailConfig.host || !emailConfig.user || !emailConfig.pass) {
      toast.error("Please fill in all email connection fields");
      return;
    }
    try {
      const result = await scanEmailMutation.mutateAsync({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: true,
        user: emailConfig.user,
        pass: emailConfig.pass,
        limit: 50,
      });

      if (result.found.length > 0) {
        toast.success(`Found ${result.found.length} email(s) with potential COA attachments`);
      } else {
        toast.info("No COA attachments found in recent emails");
      }
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} error(s) during scan`);
      }
    } catch (error) {
      console.error("Email scan error:", error);
      toast.error("Failed to scan email. Check your connection settings.");
    }
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    if (parsedPO) {
      const newLineItems = [...parsedPO.lineItems];
      newLineItems[index] = { ...newLineItems[index], [field]: value };
      setParsedPO({ ...parsedPO, lineItems: newLineItems });
    } else if (parsedVendorInvoice) {
      const newLineItems = [...parsedVendorInvoice.lineItems];
      newLineItems[index] = { ...newLineItems[index], [field]: value };
      setParsedVendorInvoice({ ...parsedVendorInvoice, lineItems: newLineItems });
    }
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Import</h1>
          <p className="text-muted-foreground">
            Upload purchase orders, invoices, COAs, and more to import via AI extraction
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Documents
          </TabsTrigger>
          <TabsTrigger value="drive" className="gap-2">
            <Cloud className="h-4 w-4" />
            Google Drive
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Import History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Upload Area */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Document</CardTitle>
                <CardDescription>
                  Drag and drop or click to upload a purchase order or freight invoice
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  <input {...getInputProps()} />
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Processing document...</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {isDragActive ? "Drop the file here" : "Drag & drop a file here, or click to select"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Supports PDF, images, Excel, and CSV files
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Purchase Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {historyQuery.data?.filter(h => h.documentType === "purchase_order").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Documents imported</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Freight Invoices
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {historyQuery.data?.filter(h => h.documentType === "freight_invoice").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Documents imported</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-emerald-500" />
                    COAs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {historyQuery.data?.filter(h => h.documentType === "coa").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">COAs imported</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full gap-1"
                    onClick={() => setShowEmailScan(true)}
                  >
                    <Mail className="h-3 w-3" />
                    Scan Email
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Supported Document Types */}
          <Card>
            <CardHeader>
              <CardTitle>Supported Document Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Package className="h-8 w-8 text-blue-500" />
                  <div>
                    <h3 className="font-medium">Purchase Orders</h3>
                    <p className="text-sm text-muted-foreground">
                      Import POs to create vendor records, track orders, and update inventory when received
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary">Auto-create vendors</Badge>
                      <Badge variant="secondary">Match materials</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <FileText className="h-8 w-8 text-purple-500" />
                  <div>
                    <h3 className="font-medium">Vendor Invoices</h3>
                    <p className="text-sm text-muted-foreground">
                      Import invoices from suppliers with line items, pricing, and payment terms
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary">Line item extraction</Badge>
                      <Badge variant="secondary">Payment tracking</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Truck className="h-8 w-8 text-green-500" />
                  <div>
                    <h3 className="font-medium">Freight Invoices</h3>
                    <p className="text-sm text-muted-foreground">
                      Import freight invoices to track shipping costs and link to related purchase orders
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary">Auto-link to PO</Badge>
                      <Badge variant="secondary">Cost tracking</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <FileText className="h-8 w-8 text-orange-500" />
                  <div>
                    <h3 className="font-medium">Customs Documents</h3>
                    <p className="text-sm text-muted-foreground">
                      Import bills of lading, customs entries, certificates of origin, and other import/export docs
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary">HS codes</Badge>
                      <Badge variant="secondary">Duties tracking</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
                  <FlaskConical className="h-8 w-8 text-emerald-500" />
                  <div>
                    <h3 className="font-medium">Certificates of Analysis (COA)</h3>
                    <p className="text-sm text-muted-foreground">
                      Import supplier COAs to auto-create QC inspections, test results, and COA records
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary">AI extraction</Badge>
                      <Badge variant="secondary">QC auto-fill</Badge>
                      <Badge variant="secondary">Email scan</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Import History</CardTitle>
              <CardDescription>
                Recent document imports and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : historyQuery.data?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No documents imported yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Records Created</TableHead>
                      <TableHead>Imported</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyQuery.data?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.fileName}
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.documentType === "coa" ? "default" : log.documentType === "purchase_order" ? "default" : log.documentType === "vendor_invoice" ? "default" : log.documentType === "customs_document" ? "default" : "secondary"}>
                            {log.documentType === "purchase_order" ? "Purchase Order" : log.documentType === "vendor_invoice" ? "Vendor Invoice" : log.documentType === "customs_document" ? "Customs Doc" : log.documentType === "coa" ? "COA" : "Freight Invoice"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.status === "completed" ? "default" : log.status === "failed" ? "destructive" : "secondary"}>
                            {log.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {log.status === "failed" && <AlertCircle className="h-3 w-3 mr-1" />}
                            {log.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.recordsCreated || 0} created, {log.recordsUpdated || 0} updated
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Google Drive Tab */}
        <TabsContent value="drive" className="space-y-6">
          {!googleConnectionQuery.data?.connected ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5" />
                  Connect Google Drive
                </CardTitle>
                <CardDescription>
                  Connect your Google account to import documents directly from Google Drive folders
                </CardDescription>
              </CardHeader>
              <CardContent>
                {googleAuthUrlQuery.data?.url ? (
                  <Button asChild>
                    <a href={googleAuthUrlQuery.data.url}>
                      <Cloud className="h-4 w-4 mr-2" />
                      Connect Google Drive
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this feature.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {/* Folder Browser */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Browse Folders</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        driveFoldersQuery.refetch();
                        driveFilesQuery.refetch();
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Breadcrumb */}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    {folderPath.map((folder, index) => (
                      <div key={folder.id || 'root'} className="flex items-center">
                        {index > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
                        <button
                          onClick={() => {
                            setCurrentFolderId(folder.id);
                            setFolderPath(folderPath.slice(0, index + 1));
                            setSelectedFiles([]);
                          }}
                          className="hover:text-foreground hover:underline"
                        >
                          {folder.name}
                        </button>
                      </div>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  {driveFoldersQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Folders */}
                      {driveFoldersQuery.data?.folders && driveFoldersQuery.data.folders.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Folders</Label>
                          <div className="grid gap-2">
                            {driveFoldersQuery.data.folders.map((folder: DriveFolder) => (
                              <button
                                key={folder.id}
                                onClick={() => {
                                  setCurrentFolderId(folder.id);
                                  setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
                                  setSelectedFiles([]);
                                }}
                                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent text-left"
                              >
                                <FolderOpen className="h-5 w-5 text-yellow-500" />
                                <span className="font-medium">{folder.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Files */}
                      {driveFilesQuery.data?.files && driveFilesQuery.data.files.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Files</Label>
                          <div className="grid gap-2">
                            {driveFilesQuery.data.files.map((file: DriveFile) => (
                              <div
                                key={file.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                                  selectedFiles.some(f => f.id === file.id) ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                                }`}
                                onClick={() => {
                                  setSelectedFiles(prev => 
                                    prev.some(f => f.id === file.id)
                                      ? prev.filter(f => f.id !== file.id)
                                      : [...prev, file]
                                  );
                                }}
                              >
                                <Checkbox 
                                  checked={selectedFiles.some(f => f.id === file.id)}
                                  onCheckedChange={() => {}}
                                />
                                <File className="h-5 w-5 text-blue-500" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {file.modifiedTime && new Date(file.modifiedTime).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!driveFoldersQuery.data?.folders?.length && !driveFilesQuery.data?.files?.length && currentFolderId && (
                        <div className="text-center py-8 text-muted-foreground">
                          This folder is empty or contains no supported files
                        </div>
                      )}

                      {!currentFolderId && (
                        <div className="text-center py-8 text-muted-foreground">
                          Select a folder to browse its contents
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Selected Files Panel */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Selected Files</CardTitle>
                  <CardDescription>
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedFiles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Click on files to select them for import
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {selectedFiles.map(file => (
                          <div key={file.id} className="flex items-center gap-2 p-2 rounded bg-muted">
                            <File className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-sm truncate flex-1">{file.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => setSelectedFiles(prev => prev.filter(f => f.id !== file.id))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button 
                        className="w-full"
                        disabled={isBatchProcessing}
                        onClick={async () => {
                          setIsBatchProcessing(true);
                          setBatchProgress({ current: 0, total: selectedFiles.length });
                          setBatchResults([]);

                          try {
                            const result = await batchParseFromDriveMutation.mutateAsync({
                              files: selectedFiles.map(f => ({
                                fileId: f.id,
                                fileName: f.name,
                                mimeType: f.mimeType,
                              })),
                            });

                            const results = result.results.map(r => ({
                              fileName: r.fileName,
                              success: r.success,
                              error: r.error,
                              data: r.data,
                            }));

                            setBatchResults(results);
                            
                            const successCount = results.filter(r => r.success).length;
                            if (successCount === results.length) {
                              toast.success(`Successfully parsed all ${successCount} files`);
                            } else {
                              toast.warning(`Parsed ${successCount} of ${results.length} files`);
                            }
                          } catch (error) {
                            console.error('Batch parse error:', error);
                            toast.error('Failed to process files from Google Drive');
                          } finally {
                            setIsBatchProcessing(false);
                          }
                        }}
                      >
                        {isBatchProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Import {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''}
                          </>
                        )}
                      </Button>
                    </>
                  )}

                  {/* Batch Results */}
                  {batchResults.length > 0 && (
                    <div className="space-y-2 border-t pt-4">
                      <Label className="text-xs text-muted-foreground">Import Results</Label>
                      {batchResults.map((result, index) => (
                        <div 
                          key={index}
                          className={`flex items-center gap-2 p-2 rounded text-sm ${
                            result.success ? 'bg-green-500/10' : 'bg-red-500/10'
                          }`}
                        >
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="truncate flex-1">{result.fileName}</span>
                          {result.success && result.data && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => {
                                if (result.data.documentType === 'purchase_order' && result.data.purchaseOrder) {
                                  setParsedPO(result.data.purchaseOrder);
                                  setUploadType('po');
                                  setShowPreview(true);
                                } else if (result.data.documentType === 'vendor_invoice' && result.data.vendorInvoice) {
                                  setParsedVendorInvoice(result.data.vendorInvoice);
                                  setUploadType('vendor_invoice');
                                  setShowPreview(true);
                                } else if (result.data.documentType === 'freight_invoice' && result.data.freightInvoice) {
                                  setParsedFreight(result.data.freightInvoice);
                                  setUploadType('freight');
                                  setShowPreview(true);
                                } else if (result.data.documentType === 'customs_document' && result.data.customsDocument) {
                                  setParsedCustoms(result.data.customsDocument);
                                  setUploadType('customs');
                                  setShowPreview(true);
                                } else if (result.data.documentType === 'coa' && result.data.coa) {
                                  setParsedCoa(result.data.coa);
                                  setUploadType('coa');
                                  setShowPreview(true);
                                }
                              }}
                            >
                              Review
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* PO Preview Dialog */}
      <Dialog open={showPreview && uploadType === "po" && !!parsedPO} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Purchase Order</DialogTitle>
            <DialogDescription>
              Review and edit the extracted data before importing
            </DialogDescription>
          </DialogHeader>
          
          {parsedPO && (
            <div className="space-y-6">
              {/* Confidence Score */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedPO.confidence > 0.8 ? "default" : parsedPO.confidence > 0.6 ? "secondary" : "destructive"}>
                  {Math.round(parsedPO.confidence * 100)}%
                </Badge>
              </div>

              {/* PO Details */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>PO Number</Label>
                  <Input 
                    value={parsedPO.poNumber} 
                    onChange={(e) => setParsedPO({ ...parsedPO, poNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Vendor Name</Label>
                  <Input 
                    value={parsedPO.vendorName} 
                    onChange={(e) => setParsedPO({ ...parsedPO, vendorName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Order Date</Label>
                  <Input 
                    type="date" 
                    value={parsedPO.orderDate} 
                    onChange={(e) => setParsedPO({ ...parsedPO, orderDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Delivery Date</Label>
                  <Input 
                    type="date" 
                    value={parsedPO.deliveryDate || ""} 
                    onChange={(e) => setParsedPO({ ...parsedPO, deliveryDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Matched Material</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedPO.lineItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input 
                              value={item.description} 
                              onChange={(e) => updateLineItem(index, "description", e.target.value)}
                              className="h-8"
                            />
                          ) : (
                            item.description
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input 
                              value={item.sku || ""} 
                              onChange={(e) => updateLineItem(index, "sku", e.target.value)}
                              className="h-8 w-24"
                            />
                          ) : (
                            item.sku || "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input 
                              type="number"
                              value={item.quantity} 
                              onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value))}
                              className="h-8 w-20"
                            />
                          ) : (
                            item.quantity
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input
                              type="number"
                              value={item.unitPrice ?? 0}
                              onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-8 w-24"
                            />
                          ) : (
                            `$${(item.unitPrice ?? 0).toFixed(2)}`
                          )}
                        </TableCell>
                        <TableCell>${(item.totalPrice ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          {item.matchedMaterialName ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {item.matchedMaterialName}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              No match
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingLineItem(editingLineItem === index ? null : index)}
                          >
                            {editingLineItem === index ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="space-y-1 text-right">
                  <div className="text-sm">
                    Subtotal: <span className="font-medium">${(parsedPO.subtotal ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="text-lg font-bold">
                    Total: ${(parsedPO.totalAmount ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-3 border-t pt-4">
                <Label>Import Options</Label>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="markReceived" 
                    checked={markAsReceived} 
                    onCheckedChange={(checked) => setMarkAsReceived(!!checked)}
                  />
                  <label htmlFor="markReceived" className="text-sm">
                    Mark as received (historical import)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="updateInventory" 
                    checked={updateInventory} 
                    onCheckedChange={(checked) => setUpdateInventory(!!checked)}
                  />
                  <label htmlFor="updateInventory" className="text-sm">
                    Update inventory quantities
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportPO} disabled={importPOMutation.isPending}>
              {importPOMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Purchase Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freight Invoice Preview Dialog */}
      <Dialog open={showPreview && uploadType === "freight" && !!parsedFreight} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Freight Invoice</DialogTitle>
            <DialogDescription>
              Review and edit the extracted data before importing
            </DialogDescription>
          </DialogHeader>
          
          {parsedFreight && (
            <div className="space-y-6">
              {/* Confidence Score */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedFreight.confidence > 0.8 ? "default" : parsedFreight.confidence > 0.6 ? "secondary" : "destructive"}>
                  {Math.round(parsedFreight.confidence * 100)}%
                </Badge>
              </div>

              {/* Invoice Details */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Invoice Number</Label>
                  <Input 
                    value={parsedFreight.invoiceNumber} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, invoiceNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Carrier Name</Label>
                  <Input 
                    value={parsedFreight.carrierName} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, carrierName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Invoice Date</Label>
                  <Input 
                    type="date" 
                    value={parsedFreight.invoiceDate} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, invoiceDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Shipment Date</Label>
                  <Input 
                    type="date" 
                    value={parsedFreight.shipmentDate || ""} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, shipmentDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Origin</Label>
                  <Input 
                    value={parsedFreight.origin || ""} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, origin: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Destination</Label>
                  <Input 
                    value={parsedFreight.destination || ""} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, destination: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tracking Number</Label>
                  <Input 
                    value={parsedFreight.trackingNumber || ""} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, trackingNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Related PO Number</Label>
                  <Input 
                    value={parsedFreight.relatedPoNumber || ""} 
                    onChange={(e) => setParsedFreight({ ...parsedFreight, relatedPoNumber: e.target.value })}
                  />
                </div>
              </div>

              {/* Charges */}
              <div className="space-y-3">
                <Label>Charges</Label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">Freight Charges</Label>
                    <Input 
                      type="number"
                      value={parsedFreight.freightCharges} 
                      onChange={(e) => setParsedFreight({ ...parsedFreight, freightCharges: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fuel Surcharge</Label>
                    <Input 
                      type="number"
                      value={parsedFreight.fuelSurcharge || 0} 
                      onChange={(e) => setParsedFreight({ ...parsedFreight, fuelSurcharge: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Accessorial</Label>
                    <Input 
                      type="number"
                      value={parsedFreight.accessorialCharges || 0} 
                      onChange={(e) => setParsedFreight({ ...parsedFreight, accessorialCharges: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="text-right text-lg font-bold">
                  Total: ${(parsedFreight.totalAmount ?? 0).toFixed(2)}
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-3 border-t pt-4">
                <Label>Import Options</Label>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="linkToPO" 
                    checked={linkToPO} 
                    onCheckedChange={(checked) => setLinkToPO(!!checked)}
                  />
                  <label htmlFor="linkToPO" className="text-sm">
                    Link to related purchase order (if found)
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportFreight} disabled={importFreightMutation.isPending}>
              {importFreightMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Freight Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Invoice Preview Dialog */}
      <Dialog open={showPreview && uploadType === "vendor_invoice" && !!parsedVendorInvoice} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Vendor Invoice</DialogTitle>
            <DialogDescription>
              Review and edit the extracted invoice data before importing
            </DialogDescription>
          </DialogHeader>

          {parsedVendorInvoice && (
            <div className="space-y-6">
              {/* Confidence Score */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedVendorInvoice.confidence > 0.8 ? "default" : parsedVendorInvoice.confidence > 0.6 ? "secondary" : "destructive"}>
                  {Math.round(parsedVendorInvoice.confidence * 100)}%
                </Badge>
              </div>

              {/* Invoice Details */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Invoice Number</Label>
                  <Input
                    value={parsedVendorInvoice.invoiceNumber}
                    onChange={(e) => setParsedVendorInvoice({ ...parsedVendorInvoice, invoiceNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Vendor Name</Label>
                  <Input
                    value={parsedVendorInvoice.vendorName}
                    onChange={(e) => setParsedVendorInvoice({ ...parsedVendorInvoice, vendorName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Invoice Date</Label>
                  <Input
                    type="date"
                    value={parsedVendorInvoice.invoiceDate}
                    onChange={(e) => setParsedVendorInvoice({ ...parsedVendorInvoice, invoiceDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={parsedVendorInvoice.dueDate || ""}
                    onChange={(e) => setParsedVendorInvoice({ ...parsedVendorInvoice, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Related PO Number</Label>
                  <Input
                    value={parsedVendorInvoice.relatedPoNumber || ""}
                    onChange={(e) => setParsedVendorInvoice({ ...parsedVendorInvoice, relatedPoNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <Input
                    value={parsedVendorInvoice.paymentTerms || ""}
                    onChange={(e) => setParsedVendorInvoice({ ...parsedVendorInvoice, paymentTerms: e.target.value })}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Matched Material</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedVendorInvoice.lineItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input
                              value={item.description}
                              onChange={(e) => updateLineItem(index, "description", e.target.value)}
                              className="h-8"
                            />
                          ) : (
                            item.description
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input
                              value={item.sku || ""}
                              onChange={(e) => updateLineItem(index, "sku", e.target.value)}
                              className="h-8 w-24"
                            />
                          ) : (
                            item.sku || "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value))}
                              className="h-8 w-20"
                            />
                          ) : (
                            item.quantity
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLineItem === index ? (
                            <Input
                              type="number"
                              value={item.unitPrice ?? 0}
                              onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-8 w-24"
                            />
                          ) : (
                            `$${(item.unitPrice ?? 0).toFixed(2)}`
                          )}
                        </TableCell>
                        <TableCell>${(item.totalPrice ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          {item.matchedMaterialName ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {item.matchedMaterialName}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              No match
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingLineItem(editingLineItem === index ? null : index)}
                          >
                            {editingLineItem === index ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="space-y-1 text-right">
                  <div className="text-sm">
                    Subtotal: <span className="font-medium">${(parsedVendorInvoice.subtotal ?? 0).toFixed(2)}</span>
                  </div>
                  {parsedVendorInvoice.taxAmount && (
                    <div className="text-sm">
                      Tax: <span className="font-medium">${(parsedVendorInvoice.taxAmount ?? 0).toFixed(2)}</span>
                    </div>
                  )}
                  {parsedVendorInvoice.shippingAmount && (
                    <div className="text-sm">
                      Shipping: <span className="font-medium">${(parsedVendorInvoice.shippingAmount ?? 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="text-lg font-bold">
                    Total: ${(parsedVendorInvoice.totalAmount ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-3 border-t pt-4">
                <Label>Import Options</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="markReceivedInvoice"
                    checked={markAsReceived}
                    onCheckedChange={(checked) => setMarkAsReceived(!!checked)}
                  />
                  <label htmlFor="markReceivedInvoice" className="text-sm">
                    Mark as received (historical import)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="updateInventoryInvoice"
                    checked={updateInventory}
                    onCheckedChange={(checked) => setUpdateInventory(!!checked)}
                  />
                  <label htmlFor="updateInventoryInvoice" className="text-sm">
                    Update inventory quantities
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportVendorInvoice} disabled={importVendorInvoiceMutation.isPending}>
              {importVendorInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Vendor Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* COA Preview Dialog */}
      <Dialog open={showPreview && uploadType === "coa" && !!parsedCoa} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-emerald-500" />
              Review Certificate of Analysis
            </DialogTitle>
            <DialogDescription>
              Review AI-extracted test results before importing into QC system
            </DialogDescription>
          </DialogHeader>

          {parsedCoa && (
            <div className="space-y-6">
              {/* Confidence & Overall Status */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Confidence:</span>
                  <Badge variant={parsedCoa.confidence > 0.8 ? "default" : parsedCoa.confidence > 0.6 ? "secondary" : "destructive"}>
                    {Math.round(parsedCoa.confidence * 100)}%
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Overall:</span>
                  <Badge className={
                    parsedCoa.overallStatus === "pass" ? "bg-green-500/10 text-green-600" :
                    parsedCoa.overallStatus === "fail" ? "bg-red-500/10 text-red-600" :
                    "bg-amber-500/10 text-amber-600"
                  }>
                    {parsedCoa.overallStatus.replace("_", " ").toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* COA Header Info */}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>COA Number</Label>
                  <Input
                    value={parsedCoa.coaNumber}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, coaNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Supplier</Label>
                  <Input
                    value={parsedCoa.supplierName}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, supplierName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Product Name</Label>
                  <Input
                    value={parsedCoa.productName}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, productName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label className="text-xs">Lot Code</Label>
                  <Input
                    value={parsedCoa.lotCode || ""}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, lotCode: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Analysis Date</Label>
                  <Input
                    type="date"
                    value={parsedCoa.analysisDate || ""}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, analysisDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Manufacture Date</Label>
                  <Input
                    type="date"
                    value={parsedCoa.manufactureDate || ""}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, manufactureDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input
                    type="date"
                    value={parsedCoa.expiryDate || ""}
                    onChange={(e) => setParsedCoa({ ...parsedCoa, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Allergen Declarations */}
              {parsedCoa.allergenDeclarations && parsedCoa.allergenDeclarations.length > 0 && (
                <div className="p-3 border rounded-lg bg-amber-500/5">
                  <Label className="text-xs text-amber-600 mb-1 block">Allergen Declarations</Label>
                  <div className="flex gap-2 flex-wrap">
                    {parsedCoa.allergenDeclarations.map((a, i) => (
                      <Badge key={i} variant="outline" className="text-amber-600 border-amber-300">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Test Results Table */}
              <div>
                <Label className="mb-2 block">Test Results ({parsedCoa.testResults.length} tests)</Label>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Specification</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedCoa.testResults.map((test, index) => (
                        <TableRow key={index} className={
                          test.status === "fail" ? "bg-red-500/5" :
                          test.status === "marginal" ? "bg-amber-500/5" : ""
                        }>
                          <TableCell className="font-medium">{test.testName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {test.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {test.method || "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {test.specification || (test.specMin || test.specMax
                              ? `${test.specMin || ""}${test.specMin && test.specMax ? " - " : ""}${test.specMax ? `max ${test.specMax}` : ""}`
                              : "-"
                            )}
                            {test.unit ? ` ${test.unit}` : ""}
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium">
                            {test.result}{test.unit ? ` ${test.unit}` : ""}
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              test.status === "pass" ? "bg-green-500/10 text-green-600" :
                              test.status === "fail" ? "bg-red-500/10 text-red-600" :
                              "bg-amber-500/10 text-amber-600"
                            }>
                              {test.status === "pass" && <CheckCircle className="h-3 w-3 mr-1" />}
                              {test.status === "fail" && <AlertCircle className="h-3 w-3 mr-1" />}
                              {test.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 border-t pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {parsedCoa.testResults.filter(t => t.status === "pass").length}
                  </div>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {parsedCoa.testResults.filter(t => t.status === "marginal").length}
                  </div>
                  <p className="text-xs text-muted-foreground">Marginal</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {parsedCoa.testResults.filter(t => t.status === "fail").length}
                  </div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {/* Storage & Notes */}
              {(parsedCoa.storageConditions || parsedCoa.notes) && (
                <div className="space-y-2 border-t pt-4">
                  {parsedCoa.storageConditions && (
                    <p className="text-sm"><span className="font-medium">Storage:</span> {parsedCoa.storageConditions}</p>
                  )}
                  {parsedCoa.notes && (
                    <p className="text-sm"><span className="font-medium">Notes:</span> {parsedCoa.notes}</p>
                  )}
                </div>
              )}

              {/* Import Info */}
              <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                Importing this COA will create: a QC Inspection record, {parsedCoa.testResults.length} test result records,
                and a Certificate of Analysis record linked to the product and vendor.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportCoa} disabled={importCoaMutation.isPending} className="gap-2">
              {importCoaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <FlaskConical className="h-4 w-4" />
              Import COA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Scan Dialog */}
      <Dialog open={showEmailScan} onOpenChange={setShowEmailScan}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Scan Email for COAs
            </DialogTitle>
            <DialogDescription>
              Connect to your email inbox to find supplier COA attachments
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="col-span-2">
                <Label>IMAP Server</Label>
                <Input
                  placeholder="imap.gmail.com"
                  value={emailConfig.host}
                  onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={emailConfig.user}
                  onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })}
                />
              </div>
              <div>
                <Label>Password / App Password</Label>
                <Input
                  type="password"
                  placeholder="App password"
                  value={emailConfig.pass}
                  onChange={(e) => setEmailConfig({ ...emailConfig, pass: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              For Gmail, use an App Password. The scan searches for emails with COA-related keywords and PDF/image attachments.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailScan(false)}>
              Cancel
            </Button>
            <Button onClick={handleScanEmail} disabled={scanEmailMutation.isPending} className="gap-2">
              {scanEmailMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Mail className="h-4 w-4" />
              Scan Inbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customs Document Preview Dialog */}
      <Dialog open={showPreview && uploadType === "customs" && !!parsedCustoms} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Customs Document</DialogTitle>
            <DialogDescription>
              Review and edit the extracted customs data before importing
            </DialogDescription>
          </DialogHeader>

          {parsedCustoms && (
            <div className="space-y-6">
              {/* Confidence Score */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedCustoms.confidence > 0.8 ? "default" : parsedCustoms.confidence > 0.6 ? "secondary" : "destructive"}>
                  {Math.round(parsedCustoms.confidence * 100)}%
                </Badge>
                <Badge variant="outline" className="ml-2">
                  {parsedCustoms.documentType.replace(/_/g, ' ').toUpperCase()}
                </Badge>
              </div>

              {/* Document Details */}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Document Number</Label>
                  <Input
                    value={parsedCustoms.documentNumber}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, documentNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Entry Date</Label>
                  <Input
                    type="date"
                    value={parsedCustoms.entryDate}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, entryDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Country of Origin</Label>
                  <Input
                    value={parsedCustoms.countryOfOrigin}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, countryOfOrigin: e.target.value })}
                  />
                </div>
              </div>

              {/* Shipper/Consignee Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 p-3 border rounded">
                  <h4 className="font-medium text-sm">Shipper</h4>
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={parsedCustoms.shipperName}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, shipperName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input
                      value={parsedCustoms.shipperCountry || ""}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, shipperCountry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2 p-3 border rounded">
                  <h4 className="font-medium text-sm">Consignee</h4>
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={parsedCustoms.consigneeName}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, consigneeName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input
                      value={parsedCustoms.consigneeCountry || ""}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, consigneeCountry: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Details */}
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label className="text-xs">Port of Entry</Label>
                  <Input
                    value={parsedCustoms.portOfEntry || ""}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, portOfEntry: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Port of Exit</Label>
                  <Input
                    value={parsedCustoms.portOfExit || ""}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, portOfExit: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Vessel Name</Label>
                  <Input
                    value={parsedCustoms.vesselName || ""}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, vesselName: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Container #</Label>
                  <Input
                    value={parsedCustoms.containerNumber || ""}
                    onChange={(e) => setParsedCustoms({ ...parsedCustoms, containerNumber: e.target.value })}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>HS Code</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Declared Value</TableHead>
                      <TableHead>Duty Rate</TableHead>
                      <TableHead>Duty Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedCustoms.lineItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {item.hsCode || "N/A"}
                          </code>
                        </TableCell>
                        <TableCell>{item.quantity} {item.unit || ""}</TableCell>
                        <TableCell>${(item.declaredValue ?? 0).toFixed(2)}</TableCell>
                        <TableCell>{item.dutyRate ? `${(item.dutyRate * 100).toFixed(1)}%` : "N/A"}</TableCell>
                        <TableCell>${(item.dutyAmount ?? 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="space-y-1 text-right">
                  <div className="text-sm">
                    Declared Value: <span className="font-medium">${(parsedCustoms.totalDeclaredValue ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="text-sm">
                    Total Duties: <span className="font-medium">${(parsedCustoms.totalDuties ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="text-sm">
                    Total Taxes: <span className="font-medium">${(parsedCustoms.totalTaxes ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="text-lg font-bold">
                    Total Charges: ${(parsedCustoms.totalCharges ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Broker Info */}
              {(parsedCustoms.brokerName || parsedCustoms.relatedPoNumber) && (
                <div className="grid gap-4 md:grid-cols-3 border-t pt-4">
                  <div>
                    <Label className="text-xs">Customs Broker</Label>
                    <Input
                      value={parsedCustoms.brokerName || ""}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, brokerName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Broker Reference</Label>
                    <Input
                      value={parsedCustoms.brokerReference || ""}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, brokerReference: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Related PO Number</Label>
                    <Input
                      value={parsedCustoms.relatedPoNumber || ""}
                      onChange={(e) => setParsedCustoms({ ...parsedCustoms, relatedPoNumber: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Import Options */}
              <div className="space-y-3 border-t pt-4">
                <Label>Import Options</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="linkToPOCustoms"
                    checked={linkToPO}
                    onCheckedChange={(checked) => setLinkToPO(!!checked)}
                  />
                  <label htmlFor="linkToPOCustoms" className="text-sm">
                    Link to related purchase order (if found)
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportCustoms} disabled={importCustomsMutation.isPending}>
              {importCustomsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Customs Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
