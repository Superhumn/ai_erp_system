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
import { Upload, FileText, Truck, Package, AlertCircle, CheckCircle, Clock, Edit2, X, ChevronRight, History, Loader2, FolderOpen, Cloud, ChevronLeft, File, RefreshCw } from "lucide-react";
import { useDropzone } from "react-dropzone";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
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
  const [uploadType, setUploadType] = useState<"po" | "freight">("po");
  const [isUploading, setIsUploading] = useState(false);
  const [parsedPO, setParsedPO] = useState<ParsedPO | null>(null);
  const [parsedFreight, setParsedFreight] = useState<ParsedFreightInvoice | null>(null);
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
  const matchMaterialsMutation = trpc.documentImport.matchMaterials.useMutation();
  const historyQuery = trpc.documentImport.getHistory.useQuery({ limit: 50 });
  
  // Google Drive queries - only enabled when Drive tab is active
  const googleConnectionQuery = trpc.sheetsImport.getConnectionStatus.useQuery(undefined, {
    enabled: activeTab === "drive"
  });
  const googleAuthUrlQuery = trpc.sheetsImport.getAuthUrl.useQuery(undefined, {
    enabled: activeTab === "drive" && !googleConnectionQuery.data?.connected
  });
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
        } else if (result.documentType === "freight_invoice" && result.freightInvoice) {
          setParsedFreight(result.freightInvoice);
          setUploadType("freight");
          setShowPreview(true);
        } else {
          console.error("[DocumentImport] Unknown document type or missing data:", {
            documentType: result.documentType,
            hasPurchaseOrder: !!result.purchaseOrder,
            hasFreightInvoice: !!result.freightInvoice,
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

  const updateLineItem = (index: number, field: string, value: any) => {
    if (!parsedPO) return;
    
    const newLineItems = [...parsedPO.lineItems];
    newLineItems[index] = { ...newLineItems[index], [field]: value };
    setParsedPO({ ...parsedPO, lineItems: newLineItems });
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Import</h1>
          <p className="text-muted-foreground">
            Upload purchase orders and freight invoices to import into inventory and history
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
                <div className="flex items-center justify-between w-full">
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
                  <AITriggerButton message="Help with document import - extract data, validate content, and categorize documents" label="AI Document Assistant" />
                </div>
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
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Package className="h-8 w-8 text-blue-500" />
                  <div>
                    <h3 className="font-medium">Purchase Orders</h3>
                    <p className="text-sm text-muted-foreground">
                      Import POs to create vendor records, track orders, and update inventory when received
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary">Auto-create vendors</Badge>
                      <Badge variant="secondary">Match materials</Badge>
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
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary">Auto-link to PO</Badge>
                      <Badge variant="secondary">Cost tracking</Badge>
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
                          <Badge variant={log.documentType === "purchase_order" ? "default" : "secondary"}>
                            {log.documentType === "purchase_order" ? "Purchase Order" : "Freight Invoice"}
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
                                } else if (result.data.documentType === 'freight_invoice' && result.data.freightInvoice) {
                                  setParsedFreight(result.data.freightInvoice);
                                  setUploadType('freight');
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
                              value={item.unitPrice} 
                              onChange={(e) => updateLineItem(index, "unitPrice", parseFloat(e.target.value))}
                              className="h-8 w-24"
                            />
                          ) : (
                            `$${item.unitPrice.toFixed(2)}`
                          )}
                        </TableCell>
                        <TableCell>${item.totalPrice.toFixed(2)}</TableCell>
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
                    Subtotal: <span className="font-medium">${parsedPO.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="text-lg font-bold">
                    Total: ${parsedPO.totalAmount.toFixed(2)}
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
                  Total: ${parsedFreight.totalAmount.toFixed(2)}
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
    </div>
  );
}
