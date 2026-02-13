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
import { Upload, FileText, Truck, Package, AlertCircle, CheckCircle, Clock, Edit2, X, ChevronRight, History, Loader2, FolderOpen, Cloud, ChevronLeft, File, RefreshCw, ShoppingCart, Factory, Warehouse, Users, Box, ScrollText, BookOpen } from "lucide-react";
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

interface ParsedSalesOrder {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  orderDate: string;
  shippingAddress?: string;
  billingAddress?: string;
  lineItems: ParsedLineItem[];
  subtotal: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  currency?: string;
  notes?: string;
  confidence: number;
}

interface ParsedInvoice {
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  issueDate: string;
  dueDate?: string;
  type: "invoice" | "credit_note" | "quote";
  lineItems: ParsedLineItem[];
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  currency?: string;
  paymentTerms?: string;
  purchaseOrderNumber?: string;
  notes?: string;
  terms?: string;
  confidence: number;
}

interface ParsedBOMComponent {
  name: string;
  sku?: string;
  componentType: "raw_material" | "product" | "packaging" | "labor";
  quantity: number;
  unit?: string;
  unitCost?: number;
  wastagePercent?: number;
  notes?: string;
}

interface ParsedBillOfMaterials {
  productName: string;
  productSku?: string;
  version?: string;
  batchSize?: number;
  batchUnit?: string;
  components: ParsedBOMComponent[];
  laborCost?: number;
  overheadCost?: number;
  notes?: string;
  confidence: number;
}

interface ParsedWorkOrder {
  productName: string;
  productSku?: string;
  quantity: number;
  unit?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  notes?: string;
  confidence: number;
}

interface ParsedInventoryAdjustment {
  adjustmentType: "count" | "adjustment" | "transfer";
  warehouseName?: string;
  items: {
    productName: string;
    productSku?: string;
    currentQuantity?: number;
    newQuantity?: number;
    adjustmentQuantity?: number;
    unit?: string;
    reason?: string;
  }[];
  performedDate?: string;
  notes?: string;
  confidence: number;
}

interface ParsedCustomer {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  type: "individual" | "business";
  creditLimit?: number;
  paymentTerms?: number;
  notes?: string;
  confidence: number;
}

interface ParsedProduct {
  name: string;
  sku: string;
  description?: string;
  category?: string;
  type: "physical" | "digital" | "service";
  unitPrice: number;
  costPrice?: number;
  currency?: string;
  taxable?: boolean;
  taxRate?: number;
  notes?: string;
  confidence: number;
}

interface ParsedContract {
  contractNumber?: string;
  title: string;
  type: "customer" | "vendor" | "employment" | "nda" | "partnership" | "lease" | "service" | "other";
  partyName: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  autoRenewal?: boolean;
  value?: number;
  currency?: string;
  description?: string;
  terms?: string;
  keyDates?: { dateType: string; date: string; description?: string }[];
  notes?: string;
  confidence: number;
}

interface ParsedJournalEntry {
  description: string;
  date: string;
  lines: {
    accountName: string;
    accountNumber?: string;
    description?: string;
    debit: number;
    credit: number;
  }[];
  totalAmount: number;
  currency?: string;
  referenceNumber?: string;
  notes?: string;
  confidence: number;
}

type UploadType = "po" | "freight" | "vendor_invoice" | "customs" | "sales_order" | "invoice" | "bom" | "work_order" | "inventory_adjustment" | "customer" | "product" | "contract" | "journal_entry";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  purchase_order: "Purchase Order",
  vendor_invoice: "Vendor Invoice",
  freight_invoice: "Freight Invoice",
  customs_document: "Customs Document",
  sales_order: "Sales Order",
  invoice: "Invoice",
  bill_of_materials: "Bill of Materials",
  work_order: "Work Order",
  inventory_adjustment: "Inventory Adjustment",
  customer: "Customer",
  product: "Product",
  contract: "Contract",
  journal_entry: "Journal Entry",
};

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
  const [uploadType, setUploadType] = useState<UploadType>("po");
  const [isUploading, setIsUploading] = useState(false);
  const [parsedPO, setParsedPO] = useState<ParsedPO | null>(null);
  const [parsedFreight, setParsedFreight] = useState<ParsedFreightInvoice | null>(null);
  const [parsedVendorInvoice, setParsedVendorInvoice] = useState<ParsedVendorInvoice | null>(null);
  const [parsedCustoms, setParsedCustoms] = useState<ParsedCustomsDocument | null>(null);
  const [parsedSalesOrder, setParsedSalesOrder] = useState<ParsedSalesOrder | null>(null);
  const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
  const [parsedBOM, setParsedBOM] = useState<ParsedBillOfMaterials | null>(null);
  const [parsedWorkOrder, setParsedWorkOrder] = useState<ParsedWorkOrder | null>(null);
  const [parsedInventoryAdj, setParsedInventoryAdj] = useState<ParsedInventoryAdjustment | null>(null);
  const [parsedCustomer, setParsedCustomer] = useState<ParsedCustomer | null>(null);
  const [parsedProduct, setParsedProduct] = useState<ParsedProduct | null>(null);
  const [parsedContract, setParsedContract] = useState<ParsedContract | null>(null);
  const [parsedJournalEntry, setParsedJournalEntry] = useState<ParsedJournalEntry | null>(null);
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
  const importSalesOrderMutation = trpc.documentImport.importSalesOrder.useMutation();
  const importInvoiceMutation = trpc.documentImport.importInvoice.useMutation();
  const importBOMMutation = trpc.documentImport.importBillOfMaterials.useMutation();
  const importWorkOrderMutation = trpc.documentImport.importWorkOrder.useMutation();
  const importInventoryAdjMutation = trpc.documentImport.importInventoryAdjustment.useMutation();
  const importCustomerMutation = trpc.documentImport.importCustomer.useMutation();
  const importProductMutation = trpc.documentImport.importProduct.useMutation();
  const importContractMutation = trpc.documentImport.importContract.useMutation();
  const importJournalEntryMutation = trpc.documentImport.importJournalEntry.useMutation();
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
        } else if (result.documentType === "sales_order" && result.salesOrder) {
          setParsedSalesOrder(result.salesOrder);
          setUploadType("sales_order");
          setShowPreview(true);
        } else if (result.documentType === "invoice" && result.invoice) {
          setParsedInvoice(result.invoice);
          setUploadType("invoice");
          setShowPreview(true);
        } else if (result.documentType === "bill_of_materials" && result.billOfMaterials) {
          setParsedBOM(result.billOfMaterials);
          setUploadType("bom");
          setShowPreview(true);
        } else if (result.documentType === "work_order" && result.workOrder) {
          setParsedWorkOrder(result.workOrder);
          setUploadType("work_order");
          setShowPreview(true);
        } else if (result.documentType === "inventory_adjustment" && result.inventoryAdjustment) {
          setParsedInventoryAdj(result.inventoryAdjustment);
          setUploadType("inventory_adjustment");
          setShowPreview(true);
        } else if (result.documentType === "customer" && result.customer) {
          setParsedCustomer(result.customer);
          setUploadType("customer");
          setShowPreview(true);
        } else if (result.documentType === "product" && result.product) {
          setParsedProduct(result.product);
          setUploadType("product");
          setShowPreview(true);
        } else if (result.documentType === "contract" && result.contract) {
          setParsedContract(result.contract);
          setUploadType("contract");
          setShowPreview(true);
        } else if (result.documentType === "journal_entry" && result.journalEntry) {
          setParsedJournalEntry(result.journalEntry);
          setUploadType("journal_entry");
          setShowPreview(true);
        } else {
          console.error("[DocumentImport] Unknown document type or missing data:", {
            documentType: result.documentType,
            success: result.success,
            error: result.error,
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

  const handleImportSalesOrder = async () => {
    if (!parsedSalesOrder) return;
    try {
      await importSalesOrderMutation.mutateAsync({ orderData: parsedSalesOrder });
      toast.success(`Sales order ${parsedSalesOrder.orderNumber} imported successfully!`);
      setParsedSalesOrder(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import sales order.");
    }
  };

  const handleImportInvoice = async () => {
    if (!parsedInvoice) return;
    try {
      await importInvoiceMutation.mutateAsync({ invoiceData: parsedInvoice });
      toast.success(`Invoice ${parsedInvoice.invoiceNumber} imported successfully!`);
      setParsedInvoice(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import invoice.");
    }
  };

  const handleImportBOM = async () => {
    if (!parsedBOM) return;
    try {
      await importBOMMutation.mutateAsync({ bomData: parsedBOM });
      toast.success(`BOM for ${parsedBOM.productName} imported successfully!`);
      setParsedBOM(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import bill of materials.");
    }
  };

  const handleImportWorkOrder = async () => {
    if (!parsedWorkOrder) return;
    try {
      await importWorkOrderMutation.mutateAsync({ workOrderData: parsedWorkOrder });
      toast.success(`Work order for ${parsedWorkOrder.productName} imported successfully!`);
      setParsedWorkOrder(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import work order.");
    }
  };

  const handleImportInventoryAdj = async () => {
    if (!parsedInventoryAdj) return;
    try {
      await importInventoryAdjMutation.mutateAsync({ adjustmentData: parsedInventoryAdj });
      toast.success("Inventory adjustment imported successfully!");
      setParsedInventoryAdj(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import inventory adjustment.");
    }
  };

  const handleImportCustomer = async () => {
    if (!parsedCustomer) return;
    try {
      await importCustomerMutation.mutateAsync({ customerData: parsedCustomer });
      toast.success(`Customer ${parsedCustomer.name} imported successfully!`);
      setParsedCustomer(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import customer.");
    }
  };

  const handleImportProduct = async () => {
    if (!parsedProduct) return;
    try {
      await importProductMutation.mutateAsync({ productData: parsedProduct });
      toast.success(`Product ${parsedProduct.name} imported successfully!`);
      setParsedProduct(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import product.");
    }
  };

  const handleImportContract = async () => {
    if (!parsedContract) return;
    try {
      await importContractMutation.mutateAsync({ contractData: parsedContract });
      toast.success(`Contract "${parsedContract.title}" imported successfully!`);
      setParsedContract(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import contract.");
    }
  };

  const handleImportJournalEntry = async () => {
    if (!parsedJournalEntry) return;
    try {
      await importJournalEntryMutation.mutateAsync({ entryData: parsedJournalEntry });
      toast.success("Journal entry imported successfully!");
      setParsedJournalEntry(null);
      setShowPreview(false);
      historyQuery.refetch();
    } catch (error) {
      toast.error("Failed to import journal entry.");
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
            Upload any business document to automatically extract and import structured data
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
                  Drag and drop or click to upload any business document for AI-powered parsing
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
            </div>
          </div>

          {/* Supported Document Types */}
          <Card>
            <CardHeader>
              <CardTitle>Supported Document Types</CardTitle>
              <CardDescription>Upload any of these document types - the AI will auto-detect and extract structured data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Package className="h-8 w-8 text-blue-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Purchase Orders</h3>
                    <p className="text-sm text-muted-foreground">Import POs to create vendor records, track orders, and update inventory</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <FileText className="h-8 w-8 text-purple-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Vendor Invoices</h3>
                    <p className="text-sm text-muted-foreground">Import invoices from suppliers with line items and payment terms</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Truck className="h-8 w-8 text-green-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Freight Invoices</h3>
                    <p className="text-sm text-muted-foreground">Import freight invoices to track shipping costs and link to POs</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <FileText className="h-8 w-8 text-orange-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Customs Documents</h3>
                    <p className="text-sm text-muted-foreground">Bills of lading, customs entries, certificates of origin</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <ShoppingCart className="h-8 w-8 text-indigo-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Sales Orders</h3>
                    <p className="text-sm text-muted-foreground">Import customer orders with line items and shipping details</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <FileText className="h-8 w-8 text-cyan-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Invoices & Quotes</h3>
                    <p className="text-sm text-muted-foreground">Import outbound invoices, credit notes, and quotes to customers</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Factory className="h-8 w-8 text-amber-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Bills of Materials</h3>
                    <p className="text-sm text-muted-foreground">Import product recipes, formulas, and component lists</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Factory className="h-8 w-8 text-red-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Work Orders</h3>
                    <p className="text-sm text-muted-foreground">Import manufacturing/production work orders</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Warehouse className="h-8 w-8 text-teal-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Inventory Adjustments</h3>
                    <p className="text-sm text-muted-foreground">Import stock counts, adjustments, and transfer documents</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Users className="h-8 w-8 text-sky-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Customers</h3>
                    <p className="text-sm text-muted-foreground">Import customer/client records from documents</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Box className="h-8 w-8 text-pink-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Products</h3>
                    <p className="text-sm text-muted-foreground">Import product catalogs, spec sheets, and price lists</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <ScrollText className="h-8 w-8 text-violet-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Contracts</h3>
                    <p className="text-sm text-muted-foreground">Import contracts, agreements, NDAs, and leases</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <BookOpen className="h-8 w-8 text-emerald-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">Journal Entries</h3>
                    <p className="text-sm text-muted-foreground">Import accounting journal entries and financial records</p>
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
                          <Badge variant="default">
                            {DOCUMENT_TYPE_LABELS[log.documentType] || log.documentType}
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
                                const d = result.data;
                                if (d.documentType === 'purchase_order' && d.purchaseOrder) { setParsedPO(d.purchaseOrder); setUploadType('po'); }
                                else if (d.documentType === 'vendor_invoice' && d.vendorInvoice) { setParsedVendorInvoice(d.vendorInvoice); setUploadType('vendor_invoice'); }
                                else if (d.documentType === 'freight_invoice' && d.freightInvoice) { setParsedFreight(d.freightInvoice); setUploadType('freight'); }
                                else if (d.documentType === 'customs_document' && d.customsDocument) { setParsedCustoms(d.customsDocument); setUploadType('customs'); }
                                else if (d.documentType === 'sales_order' && d.salesOrder) { setParsedSalesOrder(d.salesOrder); setUploadType('sales_order'); }
                                else if (d.documentType === 'invoice' && d.invoice) { setParsedInvoice(d.invoice); setUploadType('invoice'); }
                                else if (d.documentType === 'bill_of_materials' && d.billOfMaterials) { setParsedBOM(d.billOfMaterials); setUploadType('bom'); }
                                else if (d.documentType === 'work_order' && d.workOrder) { setParsedWorkOrder(d.workOrder); setUploadType('work_order'); }
                                else if (d.documentType === 'inventory_adjustment' && d.inventoryAdjustment) { setParsedInventoryAdj(d.inventoryAdjustment); setUploadType('inventory_adjustment'); }
                                else if (d.documentType === 'customer' && d.customer) { setParsedCustomer(d.customer); setUploadType('customer'); }
                                else if (d.documentType === 'product' && d.product) { setParsedProduct(d.product); setUploadType('product'); }
                                else if (d.documentType === 'contract' && d.contract) { setParsedContract(d.contract); setUploadType('contract'); }
                                else if (d.documentType === 'journal_entry' && d.journalEntry) { setParsedJournalEntry(d.journalEntry); setUploadType('journal_entry'); }
                                setShowPreview(true);
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

      {/* Sales Order Preview Dialog */}
      <Dialog open={showPreview && uploadType === "sales_order" && !!parsedSalesOrder} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Sales Order</DialogTitle>
            <DialogDescription>Review and edit the extracted sales order data before importing</DialogDescription>
          </DialogHeader>
          {parsedSalesOrder && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedSalesOrder.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedSalesOrder.confidence * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Order Number</Label><Input value={parsedSalesOrder.orderNumber} onChange={(e) => setParsedSalesOrder({ ...parsedSalesOrder, orderNumber: e.target.value })} /></div>
                <div><Label>Customer Name</Label><Input value={parsedSalesOrder.customerName} onChange={(e) => setParsedSalesOrder({ ...parsedSalesOrder, customerName: e.target.value })} /></div>
                <div><Label>Order Date</Label><Input type="date" value={parsedSalesOrder.orderDate} onChange={(e) => setParsedSalesOrder({ ...parsedSalesOrder, orderDate: e.target.value })} /></div>
                <div><Label>Customer Email</Label><Input value={parsedSalesOrder.customerEmail || ""} onChange={(e) => setParsedSalesOrder({ ...parsedSalesOrder, customerEmail: e.target.value })} /></div>
              </div>
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Unit Price</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedSalesOrder.lineItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.sku || "-"}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>${(item.unitPrice ?? 0).toFixed(2)}</TableCell>
                        <TableCell>${(item.totalPrice ?? 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end"><div className="text-lg font-bold">Total: ${(parsedSalesOrder.totalAmount ?? 0).toFixed(2)}</div></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportSalesOrder} disabled={importSalesOrderMutation.isPending}>
              {importSalesOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Sales Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Dialog */}
      <Dialog open={showPreview && uploadType === "invoice" && !!parsedInvoice} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Invoice</DialogTitle>
            <DialogDescription>Review and edit the extracted invoice data before importing</DialogDescription>
          </DialogHeader>
          {parsedInvoice && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedInvoice.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedInvoice.confidence * 100)}%</Badge>
                <Badge variant="outline">{parsedInvoice.type.replace(/_/g, ' ').toUpperCase()}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Invoice Number</Label><Input value={parsedInvoice.invoiceNumber} onChange={(e) => setParsedInvoice({ ...parsedInvoice, invoiceNumber: e.target.value })} /></div>
                <div><Label>Customer Name</Label><Input value={parsedInvoice.customerName} onChange={(e) => setParsedInvoice({ ...parsedInvoice, customerName: e.target.value })} /></div>
                <div><Label>Issue Date</Label><Input type="date" value={parsedInvoice.issueDate} onChange={(e) => setParsedInvoice({ ...parsedInvoice, issueDate: e.target.value })} /></div>
                <div><Label>Due Date</Label><Input type="date" value={parsedInvoice.dueDate || ""} onChange={(e) => setParsedInvoice({ ...parsedInvoice, dueDate: e.target.value })} /></div>
                <div><Label>Payment Terms</Label><Input value={parsedInvoice.paymentTerms || ""} onChange={(e) => setParsedInvoice({ ...parsedInvoice, paymentTerms: e.target.value })} /></div>
                <div><Label>PO Number</Label><Input value={parsedInvoice.purchaseOrderNumber || ""} onChange={(e) => setParsedInvoice({ ...parsedInvoice, purchaseOrderNumber: e.target.value })} /></div>
              </div>
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Unit Price</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedInvoice.lineItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.sku || "-"}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>${(item.unitPrice ?? 0).toFixed(2)}</TableCell>
                        <TableCell>${(item.totalPrice ?? 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <div className="space-y-1 text-right">
                  <div className="text-sm">Subtotal: <span className="font-medium">${(parsedInvoice.subtotal ?? 0).toFixed(2)}</span></div>
                  <div className="text-lg font-bold">Total: ${(parsedInvoice.totalAmount ?? 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportInvoice} disabled={importInvoiceMutation.isPending}>
              {importInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill of Materials Preview Dialog */}
      <Dialog open={showPreview && uploadType === "bom" && !!parsedBOM} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Bill of Materials</DialogTitle>
            <DialogDescription>Review and edit the extracted BOM data before importing</DialogDescription>
          </DialogHeader>
          {parsedBOM && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedBOM.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedBOM.confidence * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div><Label>Product Name</Label><Input value={parsedBOM.productName} onChange={(e) => setParsedBOM({ ...parsedBOM, productName: e.target.value })} /></div>
                <div><Label>Product SKU</Label><Input value={parsedBOM.productSku || ""} onChange={(e) => setParsedBOM({ ...parsedBOM, productSku: e.target.value })} /></div>
                <div><Label>Version</Label><Input value={parsedBOM.version || ""} onChange={(e) => setParsedBOM({ ...parsedBOM, version: e.target.value })} /></div>
              </div>
              <div>
                <Label className="mb-2 block">Components</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Unit Cost</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedBOM.components.map((comp, index) => (
                      <TableRow key={index}>
                        <TableCell>{comp.name}</TableCell>
                        <TableCell>{comp.sku || "-"}</TableCell>
                        <TableCell><Badge variant="outline">{comp.componentType}</Badge></TableCell>
                        <TableCell>{comp.quantity}</TableCell>
                        <TableCell>{comp.unit || "EA"}</TableCell>
                        <TableCell>{comp.unitCost != null ? `$${comp.unitCost.toFixed(2)}` : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportBOM} disabled={importBOMMutation.isPending}>
              {importBOMMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Bill of Materials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Order Preview Dialog */}
      <Dialog open={showPreview && uploadType === "work_order" && !!parsedWorkOrder} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Work Order</DialogTitle>
            <DialogDescription>Review and edit the extracted work order data before importing</DialogDescription>
          </DialogHeader>
          {parsedWorkOrder && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedWorkOrder.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedWorkOrder.confidence * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Product Name</Label><Input value={parsedWorkOrder.productName} onChange={(e) => setParsedWorkOrder({ ...parsedWorkOrder, productName: e.target.value })} /></div>
                <div><Label>Product SKU</Label><Input value={parsedWorkOrder.productSku || ""} onChange={(e) => setParsedWorkOrder({ ...parsedWorkOrder, productSku: e.target.value })} /></div>
                <div><Label>Quantity</Label><Input type="number" value={parsedWorkOrder.quantity} onChange={(e) => setParsedWorkOrder({ ...parsedWorkOrder, quantity: parseFloat(e.target.value) || 0 })} /></div>
                <div><Label>Unit</Label><Input value={parsedWorkOrder.unit || "EA"} onChange={(e) => setParsedWorkOrder({ ...parsedWorkOrder, unit: e.target.value })} /></div>
                <div><Label>Start Date</Label><Input type="date" value={parsedWorkOrder.scheduledStartDate || ""} onChange={(e) => setParsedWorkOrder({ ...parsedWorkOrder, scheduledStartDate: e.target.value })} /></div>
                <div><Label>End Date</Label><Input type="date" value={parsedWorkOrder.scheduledEndDate || ""} onChange={(e) => setParsedWorkOrder({ ...parsedWorkOrder, scheduledEndDate: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportWorkOrder} disabled={importWorkOrderMutation.isPending}>
              {importWorkOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory Adjustment Preview Dialog */}
      <Dialog open={showPreview && uploadType === "inventory_adjustment" && !!parsedInventoryAdj} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Inventory Adjustment</DialogTitle>
            <DialogDescription>Review and edit the extracted inventory data before importing</DialogDescription>
          </DialogHeader>
          {parsedInventoryAdj && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedInventoryAdj.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedInventoryAdj.confidence * 100)}%</Badge>
                <Badge variant="outline">{parsedInventoryAdj.adjustmentType.toUpperCase()}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Warehouse</Label><Input value={parsedInventoryAdj.warehouseName || ""} onChange={(e) => setParsedInventoryAdj({ ...parsedInventoryAdj, warehouseName: e.target.value })} /></div>
                <div><Label>Date</Label><Input type="date" value={parsedInventoryAdj.performedDate || ""} onChange={(e) => setParsedInventoryAdj({ ...parsedInventoryAdj, performedDate: e.target.value })} /></div>
              </div>
              <div>
                <Label className="mb-2 block">Items</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Current Qty</TableHead><TableHead>New Qty</TableHead><TableHead>Adjustment</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedInventoryAdj.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.productSku || "-"}</TableCell>
                        <TableCell>{item.currentQuantity ?? "-"}</TableCell>
                        <TableCell>{item.newQuantity ?? "-"}</TableCell>
                        <TableCell>{item.adjustmentQuantity ?? "-"}</TableCell>
                        <TableCell>{item.reason || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportInventoryAdj} disabled={importInventoryAdjMutation.isPending}>
              {importInventoryAdjMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Inventory Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Preview Dialog */}
      <Dialog open={showPreview && uploadType === "customer" && !!parsedCustomer} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Customer</DialogTitle>
            <DialogDescription>Review and edit the extracted customer data before importing</DialogDescription>
          </DialogHeader>
          {parsedCustomer && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedCustomer.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedCustomer.confidence * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Name</Label><Input value={parsedCustomer.name} onChange={(e) => setParsedCustomer({ ...parsedCustomer, name: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={parsedCustomer.email || ""} onChange={(e) => setParsedCustomer({ ...parsedCustomer, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={parsedCustomer.phone || ""} onChange={(e) => setParsedCustomer({ ...parsedCustomer, phone: e.target.value })} /></div>
                <div><Label>Type</Label><Input value={parsedCustomer.type} onChange={(e) => setParsedCustomer({ ...parsedCustomer, type: e.target.value as any })} /></div>
                <div><Label>Address</Label><Input value={parsedCustomer.address || ""} onChange={(e) => setParsedCustomer({ ...parsedCustomer, address: e.target.value })} /></div>
                <div><Label>City</Label><Input value={parsedCustomer.city || ""} onChange={(e) => setParsedCustomer({ ...parsedCustomer, city: e.target.value })} /></div>
                <div><Label>State</Label><Input value={parsedCustomer.state || ""} onChange={(e) => setParsedCustomer({ ...parsedCustomer, state: e.target.value })} /></div>
                <div><Label>Country</Label><Input value={parsedCustomer.country || ""} onChange={(e) => setParsedCustomer({ ...parsedCustomer, country: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportCustomer} disabled={importCustomerMutation.isPending}>
              {importCustomerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Preview Dialog */}
      <Dialog open={showPreview && uploadType === "product" && !!parsedProduct} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Product</DialogTitle>
            <DialogDescription>Review and edit the extracted product data before importing</DialogDescription>
          </DialogHeader>
          {parsedProduct && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedProduct.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedProduct.confidence * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Name</Label><Input value={parsedProduct.name} onChange={(e) => setParsedProduct({ ...parsedProduct, name: e.target.value })} /></div>
                <div><Label>SKU</Label><Input value={parsedProduct.sku} onChange={(e) => setParsedProduct({ ...parsedProduct, sku: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={parsedProduct.category || ""} onChange={(e) => setParsedProduct({ ...parsedProduct, category: e.target.value })} /></div>
                <div><Label>Type</Label><Input value={parsedProduct.type} onChange={(e) => setParsedProduct({ ...parsedProduct, type: e.target.value as any })} /></div>
                <div><Label>Unit Price</Label><Input type="number" value={parsedProduct.unitPrice} onChange={(e) => setParsedProduct({ ...parsedProduct, unitPrice: parseFloat(e.target.value) || 0 })} /></div>
                <div><Label>Cost Price</Label><Input type="number" value={parsedProduct.costPrice ?? ""} onChange={(e) => setParsedProduct({ ...parsedProduct, costPrice: parseFloat(e.target.value) || undefined })} /></div>
              </div>
              {parsedProduct.description && (
                <div><Label>Description</Label><p className="text-sm text-muted-foreground mt-1">{parsedProduct.description}</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportProduct} disabled={importProductMutation.isPending}>
              {importProductMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Preview Dialog */}
      <Dialog open={showPreview && uploadType === "contract" && !!parsedContract} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Contract</DialogTitle>
            <DialogDescription>Review and edit the extracted contract data before importing</DialogDescription>
          </DialogHeader>
          {parsedContract && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedContract.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedContract.confidence * 100)}%</Badge>
                <Badge variant="outline">{parsedContract.type.replace(/_/g, ' ').toUpperCase()}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Title</Label><Input value={parsedContract.title} onChange={(e) => setParsedContract({ ...parsedContract, title: e.target.value })} /></div>
                <div><Label>Party Name</Label><Input value={parsedContract.partyName} onChange={(e) => setParsedContract({ ...parsedContract, partyName: e.target.value })} /></div>
                <div><Label>Contract Number</Label><Input value={parsedContract.contractNumber || ""} onChange={(e) => setParsedContract({ ...parsedContract, contractNumber: e.target.value })} /></div>
                <div><Label>Value</Label><Input type="number" value={parsedContract.value ?? ""} onChange={(e) => setParsedContract({ ...parsedContract, value: parseFloat(e.target.value) || undefined })} /></div>
                <div><Label>Start Date</Label><Input type="date" value={parsedContract.startDate || ""} onChange={(e) => setParsedContract({ ...parsedContract, startDate: e.target.value })} /></div>
                <div><Label>End Date</Label><Input type="date" value={parsedContract.endDate || ""} onChange={(e) => setParsedContract({ ...parsedContract, endDate: e.target.value })} /></div>
              </div>
              {parsedContract.description && (
                <div><Label>Description</Label><p className="text-sm text-muted-foreground mt-1">{parsedContract.description}</p></div>
              )}
              {parsedContract.keyDates && parsedContract.keyDates.length > 0 && (
                <div>
                  <Label className="mb-2 block">Key Dates</Label>
                  <Table>
                    <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {parsedContract.keyDates.map((kd, index) => (
                        <TableRow key={index}>
                          <TableCell>{kd.dateType}</TableCell>
                          <TableCell>{kd.date}</TableCell>
                          <TableCell>{kd.description || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportContract} disabled={importContractMutation.isPending}>
              {importContractMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal Entry Preview Dialog */}
      <Dialog open={showPreview && uploadType === "journal_entry" && !!parsedJournalEntry} onOpenChange={(open) => !open && setShowPreview(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Journal Entry</DialogTitle>
            <DialogDescription>Review and edit the extracted accounting data before importing</DialogDescription>
          </DialogHeader>
          {parsedJournalEntry && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Extraction Confidence:</span>
                <Badge variant={parsedJournalEntry.confidence > 0.8 ? "default" : "secondary"}>{Math.round(parsedJournalEntry.confidence * 100)}%</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Description</Label><Input value={parsedJournalEntry.description} onChange={(e) => setParsedJournalEntry({ ...parsedJournalEntry, description: e.target.value })} /></div>
                <div><Label>Date</Label><Input type="date" value={parsedJournalEntry.date} onChange={(e) => setParsedJournalEntry({ ...parsedJournalEntry, date: e.target.value })} /></div>
                <div><Label>Reference Number</Label><Input value={parsedJournalEntry.referenceNumber || ""} onChange={(e) => setParsedJournalEntry({ ...parsedJournalEntry, referenceNumber: e.target.value })} /></div>
                <div><Label>Total Amount</Label><Input type="number" value={parsedJournalEntry.totalAmount} onChange={(e) => setParsedJournalEntry({ ...parsedJournalEntry, totalAmount: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div>
                <Label className="mb-2 block">Journal Lines</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>Account Name</TableHead><TableHead>Account #</TableHead><TableHead>Description</TableHead><TableHead>Debit</TableHead><TableHead>Credit</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedJournalEntry.lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>{line.accountName}</TableCell>
                        <TableCell>{line.accountNumber || "-"}</TableCell>
                        <TableCell>{line.description || "-"}</TableCell>
                        <TableCell>{line.debit > 0 ? `$${line.debit.toFixed(2)}` : "-"}</TableCell>
                        <TableCell>{line.credit > 0 ? `$${line.credit.toFixed(2)}` : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end gap-8 mt-2 text-sm font-medium">
                  <span>Total Debits: ${parsedJournalEntry.lines.reduce((s, l) => s + (l.debit || 0), 0).toFixed(2)}</span>
                  <span>Total Credits: ${parsedJournalEntry.lines.reduce((s, l) => s + (l.credit || 0), 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleImportJournalEntry} disabled={importJournalEntryMutation.isPending}>
              {importJournalEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Journal Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
