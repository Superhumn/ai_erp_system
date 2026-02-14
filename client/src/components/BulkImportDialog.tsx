import { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Link as LinkIcon,
  RefreshCw,
  LogOut,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";

export type ImportModule =
  | "customers"
  | "vendors"
  | "products"
  | "employees"
  | "invoices"
  | "contracts"
  | "projects"
  | "rawMaterials"
  | "purchaseOrders"
  | "salesOrders"
  | "accounts"
  | "payments"
  | "shipments"
  | "carriers"
  | "workOrders";

export interface ImportFieldConfig {
  required: string[];
  optional: string[];
}

type ImportStep = "source" | "select" | "preview" | "map" | "importing" | "complete";

const MODULE_FIELD_CONFIGS: Record<ImportModule, ImportFieldConfig> = {
  customers: {
    required: ["name"],
    optional: ["email", "phone", "type", "address", "city", "state", "country", "postalCode", "notes"],
  },
  vendors: {
    required: ["name"],
    optional: ["email", "phone", "contactName", "address", "city", "state", "country", "postalCode", "paymentTerms", "notes"],
  },
  products: {
    required: ["name"],
    optional: ["sku", "description", "category", "type", "unitPrice", "price", "costPrice", "cost", "unit"],
  },
  employees: {
    required: ["firstName", "lastName"],
    optional: ["email", "phone", "title", "jobTitle", "department", "employmentType", "salary", "hireDate"],
  },
  invoices: {
    required: ["customerId", "amount"],
    optional: ["dueDate", "description", "notes"],
  },
  contracts: {
    required: ["title"],
    optional: ["type", "partyName", "value", "startDate", "endDate", "description"],
  },
  projects: {
    required: ["name"],
    optional: ["description", "type", "priority", "startDate", "targetEndDate", "budget"],
  },
  rawMaterials: {
    required: ["name"],
    optional: ["sku", "description", "category", "unit", "unitCost", "currency", "minOrderQty", "leadTimeDays"],
  },
  purchaseOrders: {
    required: ["vendorId"],
    optional: ["orderDate", "expectedDate", "notes"],
  },
  salesOrders: {
    required: ["customerId"],
    optional: ["orderDate", "notes"],
  },
  accounts: {
    required: ["code", "name", "type"],
    optional: ["subtype", "description"],
  },
  payments: {
    required: ["amount", "paymentMethod"],
    optional: ["type", "paymentDate", "referenceNumber", "notes"],
  },
  shipments: {
    required: ["type"],
    optional: ["carrier", "trackingNumber", "shipDate", "deliveryDate", "notes"],
  },
  carriers: {
    required: ["name"],
    optional: ["type", "contactName", "email", "phone", "country", "website", "notes"],
  },
  workOrders: {
    required: ["bomId", "quantity"],
    optional: ["priority", "notes"],
  },
};

const MODULE_LABELS: Record<ImportModule, string> = {
  customers: "Customers",
  vendors: "Vendors",
  products: "Products",
  employees: "Employees",
  invoices: "Invoices",
  contracts: "Contracts",
  projects: "Projects",
  rawMaterials: "Raw Materials",
  purchaseOrders: "Purchase Orders",
  salesOrders: "Sales Orders",
  accounts: "Accounts",
  payments: "Payments",
  shipments: "Shipments",
  carriers: "Carriers",
  workOrders: "Work Orders",
};

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: ImportModule;
  onImportComplete?: () => void;
  fieldConfig?: ImportFieldConfig;
}

export function BulkImportDialog({
  open,
  onOpenChange,
  module,
  onImportComplete,
  fieldConfig,
}: BulkImportDialogProps) {
  const fields = fieldConfig || MODULE_FIELD_CONFIGS[module];
  const allFields = [...fields.required, ...fields.optional];

  const [step, setStep] = useState<ImportStep>("source");
  const [sourceTab, setSourceTab] = useState<"csv" | "sheets">("csv");
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importResults, setImportResults] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);

  // Google Sheets state
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google connection status
  const { data: connectionStatus, refetch: refetchConnection } =
    trpc.sheetsImport.getConnectionStatus.useQuery(undefined, {
      enabled: open && sourceTab === "sheets",
    });

  const { data: authUrlData } = trpc.sheetsImport.getAuthUrl.useQuery(undefined, {
    enabled: open && sourceTab === "sheets" && !connectionStatus?.connected,
  });

  const { data: spreadsheets, isLoading: spreadsheetsLoading, refetch: refetchSpreadsheets } =
    trpc.sheetsImport.listSpreadsheets.useQuery(undefined, {
      enabled: open && sourceTab === "sheets" && !!connectionStatus?.connected,
    });

  const disconnectMutation = trpc.sheetsImport.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      refetchConnection();
    },
  });

  const getSheetNamesMutation = trpc.sheetsImport.getSheetNames.useMutation();
  const fetchSheetMutation = trpc.sheetsImport.fetchSheet.useMutation();
  const importDataMutation = trpc.sheetsImport.importData.useMutation();

  const resetState = useCallback(() => {
    setStep("source");
    setSourceTab("csv");
    setCsvData(null);
    setCsvFileName("");
    setColumnMapping({});
    setImportResults(null);
    setSelectedSpreadsheet(null);
    setSelectedSheet("");
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(resetState, 300);
  }, [onOpenChange, resetState]);

  const autoMapColumns = useCallback(
    (headers: string[]) => {
      const mapping: Record<string, string> = {};
      headers.forEach((header) => {
        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matchedField = allFields.find((field) => {
          const normalizedField = field.toLowerCase();
          return normalizedHeader === normalizedField ||
            normalizedHeader.includes(normalizedField) ||
            normalizedField.includes(normalizedHeader);
        });
        if (matchedField) {
          mapping[header] = matchedField;
        }
      });
      return mapping;
    },
    [allFields]
  );

  // CSV file handling
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv") && !file.name.endsWith(".txt")) {
        toast.error("Please select a CSV, TSV, or TXT file");
        return;
      }

      setCsvFileName(file.name);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            toast.error(`Parse error: ${results.errors[0].message}`);
            return;
          }

          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];

          if (headers.length === 0 || rows.length === 0) {
            toast.error("File is empty or has no data rows");
            return;
          }

          setCsvData({ headers, rows });
          const mapping = autoMapColumns(headers);
          setColumnMapping(mapping);
          setStep("map");
          toast.success(`Loaded ${rows.length} rows from ${file.name}`);
        },
        error: (error) => {
          toast.error(`Failed to parse file: ${error.message}`);
        },
      });

      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [autoMapColumns]
  );

  // Drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv") && !file.name.endsWith(".txt")) {
        toast.error("Please drop a CSV, TSV, or TXT file");
        return;
      }

      setCsvFileName(file.name);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];

          if (headers.length === 0 || rows.length === 0) {
            toast.error("File is empty or has no data rows");
            return;
          }

          setCsvData({ headers, rows });
          const mapping = autoMapColumns(headers);
          setColumnMapping(mapping);
          setStep("map");
          toast.success(`Loaded ${rows.length} rows from ${file.name}`);
        },
        error: (error) => {
          toast.error(`Failed to parse file: ${error.message}`);
        },
      });
    },
    [autoMapColumns]
  );

  // Google Sheets handling
  const handleConnectGoogle = () => {
    if (authUrlData?.url) {
      window.location.href = authUrlData.url;
    } else {
      toast.error("Google OAuth not configured. Please contact administrator.");
    }
  };

  const handleSelectSpreadsheet = async (spreadsheet: { id: string; name: string }) => {
    setSelectedSpreadsheet(spreadsheet);
    try {
      const result = await getSheetNamesMutation.mutateAsync({ spreadsheetId: spreadsheet.id });
      if (result.sheets.length > 0) {
        setSelectedSheet(result.sheets[0]);
      }
      setStep("preview");
    } catch (error: any) {
      toast.error(error.message || "Failed to load spreadsheet");
    }
  };

  const handleFetchPreview = async () => {
    if (!selectedSpreadsheet) return;
    try {
      const result = await fetchSheetMutation.mutateAsync({
        spreadsheetId: selectedSpreadsheet.id,
        sheetName: selectedSheet || undefined,
      });

      setCsvData({ headers: result.headers, rows: result.rows });
      const mapping = autoMapColumns(result.headers);
      setColumnMapping(mapping);
      setStep("map");
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch sheet data");
    }
  };

  // Import
  const handleImport = async () => {
    if (!csvData) return;

    setStep("importing");
    try {
      const result = await importDataMutation.mutateAsync({
        targetModule: module as any,
        data: csvData.rows,
        columnMapping,
      });

      setImportResults(result);
      setStep("complete");

      if (result.imported > 0) {
        toast.success(`Successfully imported ${result.imported} records`);
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} records failed to import`);
      }
    } catch (error: any) {
      toast.error(error.message || "Import failed");
      setStep("map");
    }
  };

  const requiredFieldsMapped = fields.required.every((field) =>
    Object.values(columnMapping).includes(field)
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Import {MODULE_LABELS[module]}
          </DialogTitle>
          <DialogDescription>
            Import records from a CSV file or Google Sheets spreadsheet
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Step: Source Selection */}
          {step === "source" && (
            <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as "csv" | "sheets")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="csv" className="flex items-center gap-2">
                  <FileUp className="h-4 w-4" />
                  CSV File
                </TabsTrigger>
                <TabsTrigger value="sheets" className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Google Sheets
                </TabsTrigger>
              </TabsList>

              <TabsContent value="csv">
                <div
                  className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-1">Drop your CSV file here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
                  <Button variant="outline" type="button">
                    Select File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Expected fields for {MODULE_LABELS[module]}:</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Required:</span> {fields.required.join(", ")}
                  </p>
                  {fields.optional.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Optional:</span> {fields.optional.join(", ")}
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="sheets">
                {!connectionStatus?.connected ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg text-center">
                      <LinkIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-medium mb-1">Connect your Google account</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Access your spreadsheets directly from Google Drive
                      </p>
                      {authUrlData?.error ? (
                        <p className="text-sm text-yellow-600">{authUrlData.error}</p>
                      ) : (
                        <Button onClick={handleConnectGoogle}>
                          Connect with Google
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-800 dark:text-green-200">
                          Connected as {connectionStatus.email}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => disconnectMutation.mutate()}>
                          <LogOut className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => refetchSpreadsheets()}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <ScrollArea className="h-72 border rounded-lg">
                      {spreadsheetsLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : spreadsheets?.spreadsheets?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                          <FileSpreadsheet className="h-10 w-10 mb-2" />
                          <p className="text-sm">No spreadsheets found</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {spreadsheets?.spreadsheets?.map((sheet: any) => (
                            <button
                              key={sheet.id}
                              onClick={() => handleSelectSpreadsheet({ id: sheet.id, name: sheet.name })}
                              className="w-full p-3 text-left hover:bg-muted transition-colors flex items-center gap-3"
                            >
                              <FileSpreadsheet className="h-6 w-6 text-green-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{sheet.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Modified: {new Date(sheet.modifiedTime).toLocaleDateString()}
                                </p>
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Step: Sheet Preview (Google Sheets only) */}
          {step === "preview" && selectedSpreadsheet && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <span className="font-medium text-sm">{selectedSpreadsheet.name}</span>
              </div>

              <div className="space-y-2">
                <Label>Sheet</Label>
                <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSheetNamesMutation.data?.sheets.map((name: string) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("source")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleFetchPreview} disabled={fetchSheetMutation.isPending}>
                  {fetchSheetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Load Data
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Column Mapping */}
          {step === "map" && csvData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {csvFileName ? `File: ${csvFileName}` : selectedSpreadsheet?.name || "Data loaded"}
                  </p>
                  <p className="text-xs text-muted-foreground">{csvData.rows.length} rows found</p>
                </div>
                {!requiredFieldsMapped && (
                  <Badge variant="destructive" className="text-xs">
                    Missing required fields: {fields.required.filter((f) => !Object.values(columnMapping).includes(f)).join(", ")}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {csvData.headers.map((header) => (
                  <div key={header} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm truncate block">{header}</Label>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <Select
                      value={columnMapping[header] || "_skip"}
                      onValueChange={(value) => {
                        setColumnMapping((prev) => {
                          const next = { ...prev };
                          if (value === "_skip") {
                            delete next[header];
                          } else {
                            next[header] = value;
                          }
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_skip">Skip column</SelectItem>
                        {allFields.map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                            {fields.required.includes(field) ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-2">Preview (first 5 rows)</h4>
                <ScrollArea className="h-36 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvData.headers.map((header) => (
                          <TableHead key={header} className="text-xs whitespace-nowrap">
                            {header}
                            {columnMapping[header] && (
                              <Badge variant="secondary" className="ml-1 text-[10px]">
                                {columnMapping[header]}
                              </Badge>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.rows.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>
                          {csvData.headers.map((header) => (
                            <TableCell key={header} className="text-xs">
                              {row[header] || ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div className="py-12 flex flex-col items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium">Importing data...</h3>
              <p className="text-muted-foreground text-sm">Processing {csvData?.rows.length || 0} records</p>
            </div>
          )}

          {/* Step: Complete */}
          {step === "complete" && importResults && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                {importResults.failed === 0 ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-yellow-600" />
                )}
                <h3 className="text-lg font-medium">Import Complete</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-600">{importResults.imported}</p>
                  <p className="text-sm text-green-800 dark:text-green-200">Records imported</p>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-center">
                  <p className="text-3xl font-bold text-red-600">{importResults.failed}</p>
                  <p className="text-sm text-red-800 dark:text-red-200">Records failed</p>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="p-3 bg-muted rounded-lg">
                  <h4 className="text-sm font-medium mb-1">Errors:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                    {importResults.errors.slice(0, 10).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {importResults.errors.length > 10 && (
                      <li>... and {importResults.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => {
                setCsvData(null);
                setCsvFileName("");
                setColumnMapping({});
                setStep("source");
              }}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleImport} disabled={!requiredFieldsMapped}>
                Import {csvData?.rows.length || 0} Records
                <Upload className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
          {step === "complete" && (
            <>
              <Button variant="outline" onClick={() => {
                resetState();
              }}>
                Import More
              </Button>
              <Button onClick={() => {
                handleClose();
                onImportComplete?.();
              }}>
                Done
              </Button>
            </>
          )}
          {(step === "source" || step === "select") && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
