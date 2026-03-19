import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Link as LinkIcon,
  RefreshCw,
  LogOut,
  FolderOpen,
  FileText,
  Download,
  FileUp,
  Database,
  Users,
  Package,
  Building2,
  Receipt,
  ShoppingCart,
  FileSignature,
  FolderKanban,
  BookOpen,
  SkipForward,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";

type ImportMethod = "csv" | "sheets";
type CsvStep = "choose" | "upload" | "map" | "import" | "complete";
type SheetsStep = "connect" | "select" | "preview" | "map" | "import" | "complete";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  customers: <Users className="h-4 w-4" />,
  vendors: <Building2 className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  accounts: <BookOpen className="h-4 w-4" />,
  employees: <Users className="h-4 w-4" />,
  invoices: <Receipt className="h-4 w-4" />,
  purchaseOrders: <ShoppingCart className="h-4 w-4" />,
  contracts: <FileSignature className="h-4 w-4" />,
  projects: <FolderKanban className="h-4 w-4" />,
};

export default function Import() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  // Shared state
  const [importMethod, setImportMethod] = useState<ImportMethod>("csv");
  const [targetModule, setTargetModule] = useState<string>("customers");
  const [sheetData, setSheetData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importResults, setImportResults] = useState<{ imported: number; skipped?: number; failed: number; errors: string[] } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // CSV state
  const [csvStep, setCsvStep] = useState<CsvStep>("choose");
  const [csvDelimiter, setCsvDelimiter] = useState<"," | ";" | "\t" | "|">(",");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sheets state
  const [sheetsStep, setSheetsStep] = useState<SheetsStep>("connect");
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  // API: Module definitions from backend
  const { data: modulesData } = trpc.csvImport.getModules.useQuery(undefined, { enabled: isAuthenticated });

  // API: CSV template
  const { data: templateData } = trpc.csvImport.getTemplate.useQuery(
    { module: targetModule },
    { enabled: isAuthenticated && !!targetModule }
  );

  // API: CSV parsing
  const parseCsvMutation = trpc.csvImport.parseCSV.useMutation();
  const csvImportMutation = trpc.csvImport.importData.useMutation();

  // API: Google Sheets
  const { data: connectionStatus, refetch: refetchConnection, isLoading: connectionLoading } =
    trpc.sheetsImport.getConnectionStatus.useQuery(undefined, { enabled: isAuthenticated });
  const { data: authUrlData } = trpc.sheetsImport.getAuthUrl.useQuery(undefined, {
    enabled: isAuthenticated && !connectionStatus?.connected,
  });
  const { data: spreadsheets, isLoading: spreadsheetsLoading, refetch: refetchSpreadsheets } =
    trpc.sheetsImport.listSpreadsheets.useQuery(undefined, {
      enabled: isAuthenticated && connectionStatus?.connected,
    });
  const disconnectMutation = trpc.sheetsImport.disconnect.useMutation({
    onSuccess: () => { toast.success("Google account disconnected"); refetchConnection(); },
  });
  const getSheetNamesMutation = trpc.sheetsImport.getSheetNames.useMutation();
  const fetchSheetMutation = trpc.sheetsImport.fetchSheet.useMutation();
  const sheetsImportMutation = trpc.sheetsImport.importData.useMutation();

  const modules = modulesData?.modules || {};

  // Handle OAuth callback
  useEffect(() => {
    if (searchParams) {
      const params = new URLSearchParams(searchParams);
      if (params.get("success") === "connected") {
        toast.success("Google account connected successfully!");
        refetchConnection();
        setImportMethod("sheets");
        setLocation("/import");
      } else if (params.get("error")) {
        toast.error(`Connection failed: ${params.get("error")}`);
        setLocation("/import");
      }
    }
  }, [searchParams, refetchConnection, setLocation]);

  // Auto-advance sheets when connected
  useEffect(() => {
    if (connectionStatus?.connected && sheetsStep === "connect" && importMethod === "sheets") {
      setSheetsStep("select");
    }
  }, [connectionStatus?.connected, sheetsStep, importMethod]);

  // Auto-map columns when data is loaded
  const autoMapColumns = useCallback((headers: string[], module: string) => {
    const moduleDef = modules[module];
    if (!moduleDef) return {};
    const allFields = [...moduleDef.required, ...moduleDef.optional];

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
  }, [modules]);

  // CSV handlers
  const handleDownloadTemplate = () => {
    if (!templateData?.csv) return;
    const blob = new Blob([templateData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateData.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (file: File) => {
    if (!file.name.match(/\.(csv|tsv|txt)$/i)) {
      toast.error("Please select a CSV, TSV, or TXT file");
      return;
    }
    if (file.size > 5_000_000) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    const text = await file.text();
    try {
      const result = await parseCsvMutation.mutateAsync({ csvText: text, delimiter: csvDelimiter });
      setSheetData({ headers: result.headers, rows: result.rows });
      setColumnMapping(autoMapColumns(result.headers, targetModule));
      setCsvStep("map");
      toast.success(`Parsed ${result.totalRows} rows from ${file.name}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to parse CSV file");
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleCsvImport = async () => {
    if (!sheetData) return;
    setCsvStep("import");
    try {
      const result = await csvImportMutation.mutateAsync({
        targetModule: targetModule as any,
        data: sheetData.rows,
        columnMapping,
        skipDuplicates,
      });
      setImportResults(result);
      setCsvStep("complete");
      if (result.imported > 0) toast.success(`Successfully imported ${result.imported} records`);
      if (result.failed > 0) toast.warning(`${result.failed} records failed to import`);
    } catch (error: any) {
      toast.error(error.message || "Import failed");
      setCsvStep("map");
    }
  };

  // Sheets handlers
  const handleConnectGoogle = () => {
    if (authUrlData?.url) window.location.href = authUrlData.url;
    else toast.error("Google OAuth not configured. Please contact administrator.");
  };

  const handleSelectSpreadsheet = async (spreadsheet: { id: string; name: string }) => {
    setSelectedSpreadsheet(spreadsheet);
    try {
      const result = await getSheetNamesMutation.mutateAsync({ spreadsheetId: spreadsheet.id });
      if (result.sheets.length > 0) setSelectedSheet(result.sheets[0]);
      setSheetsStep("preview");
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
      setSheetData({ headers: result.headers, rows: result.rows });
      setColumnMapping(autoMapColumns(result.headers, targetModule));
      setSheetsStep("map");
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch sheet data");
    }
  };

  const handleSheetsImport = async () => {
    if (!sheetData) return;
    setSheetsStep("import");
    try {
      const result = await sheetsImportMutation.mutateAsync({
        targetModule: targetModule as any,
        data: sheetData.rows,
        columnMapping,
      });
      setImportResults(result);
      setSheetsStep("complete");
      if (result.imported > 0) toast.success(`Successfully imported ${result.imported} records`);
      if (result.failed > 0) toast.warning(`${result.failed} records failed to import`);
    } catch (error: any) {
      toast.error(error.message || "Import failed");
      setSheetsStep("map");
    }
  };

  const handleReset = () => {
    setSheetData(null);
    setColumnMapping({});
    setImportResults(null);
    setCsvStep("choose");
    setSheetsStep(connectionStatus?.connected ? "select" : "connect");
    setSelectedSpreadsheet(null);
    setSelectedSheet("");
  };

  const getModuleViewPath = (module: string) => {
    const paths: Record<string, string> = {
      customers: "/sales/customers",
      vendors: "/operations/vendors",
      products: "/operations/products",
      accounts: "/finance/accounts",
      employees: "/hr/employees",
      invoices: "/finance/invoices",
      purchaseOrders: "/operations/purchase-orders",
      contracts: "/legal/contracts",
      projects: "/projects",
    };
    return paths[module] || `/${module}`;
  };

  if (authLoading || connectionLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to use the import feature.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentModuleDef = modules[targetModule];
  const allFields = currentModuleDef ? [...currentModuleDef.required, ...currentModuleDef.optional] : [];
  const requiredFieldsMapped = currentModuleDef?.required.every(
    (field: string) => Object.values(columnMapping).includes(field)
  );

  // Shared column mapping UI
  const renderColumnMapping = (onBack: () => void, onImport: () => void, isPending: boolean) => (
    <Card>
      <CardHeader>
        <CardTitle>Map Columns</CardTitle>
        <CardDescription>
          Map your data columns to {currentModuleDef?.label || targetModule} fields.
          Required fields are marked with *.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex items-center gap-2">
            <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} id="skip-dupes" />
            <Label htmlFor="skip-dupes" className="text-sm">Skip duplicate records</Label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sheetData?.headers.map((header) => (
            <div key={header} className="flex items-center gap-2 p-2 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{header}</p>
                {sheetData.rows[0]?.[header] && (
                  <p className="text-xs text-muted-foreground truncate">e.g. {sheetData.rows[0][header]}</p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select
                value={columnMapping[header] || "_skip"}
                onValueChange={(value) => {
                  setColumnMapping((prev) => ({
                    ...prev,
                    [header]: value === "_skip" ? "" : value,
                  }));
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Skip column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_skip">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <SkipForward className="h-3 w-3" /> Skip column
                    </span>
                  </SelectItem>
                  {allFields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                      {currentModuleDef?.required.includes(field) ? " *" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <Separator />

        <div>
          <h4 className="font-medium mb-2">Preview (first 5 rows)</h4>
          <ScrollArea className="h-48 border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  {sheetData?.headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap">
                      {header}
                      {columnMapping[header] && (
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {columnMapping[header]}
                        </Badge>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheetData?.rows.slice(0, 5).map((row, i) => (
                  <TableRow key={i}>
                    {sheetData.headers.map((header) => (
                      <TableCell key={header} className="whitespace-nowrap">{row[header]}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={onImport} disabled={!requiredFieldsMapped || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {sheetData?.rows.length || 0} Records
            <Upload className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Shared importing/spinner UI
  const renderImporting = () => (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <h3 className="text-lg font-medium">Importing data...</h3>
          <p className="text-muted-foreground">Please wait while we process your records</p>
        </div>
      </CardContent>
    </Card>
  );

  // Shared results UI
  const renderResults = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {importResults && importResults.failed === 0 ? (
            <CheckCircle className="h-6 w-6 text-green-600" />
          ) : (
            <AlertCircle className="h-6 w-6 text-yellow-600" />
          )}
          Import Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
            <p className="text-3xl font-bold text-green-600">{importResults?.imported || 0}</p>
            <p className="text-sm text-green-800 dark:text-green-200">Imported</p>
          </div>
          {(importResults?.skipped ?? 0) > 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
              <p className="text-3xl font-bold text-blue-600">{importResults?.skipped || 0}</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">Skipped (duplicates)</p>
            </div>
          )}
          <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-center">
            <p className="text-3xl font-bold text-red-600">{importResults?.failed || 0}</p>
            <p className="text-sm text-red-800 dark:text-red-200">Failed</p>
          </div>
        </div>

        {importResults && importResults.errors.length > 0 && (
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Errors:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
              {importResults.errors.slice(0, 10).map((error, i) => (
                <li key={i}>- {error}</li>
              ))}
              {importResults.errors.length > 10 && (
                <li>... and {importResults.errors.length - 10} more errors</li>
              )}
            </ul>
          </div>
        )}

        <div className="flex gap-4">
          <Button onClick={handleReset} className="flex-1">
            Import More Data
          </Button>
          <Button variant="outline" onClick={() => setLocation(getModuleViewPath(targetModule))}>
            View {currentModuleDef?.label || targetModule}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" />
          Import Data
        </h1>
        <p className="text-muted-foreground mt-1">
          Bring your existing data into the ERP system from CSV files or Google Sheets
        </p>
      </div>

      {/* Module Selector - always visible at top */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <Label className="text-sm font-medium">Import into:</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(modules).map(([key, mod]: [string, any]) => (
                <Button
                  key={key}
                  variant={targetModule === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTargetModule(key)}
                  className="gap-1.5"
                >
                  {MODULE_ICONS[key]}
                  {mod.label}
                </Button>
              ))}
            </div>
          </div>
          {currentModuleDef && (
            <p className="text-sm text-muted-foreground mt-2">{currentModuleDef.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Import Method Tabs */}
      <Tabs value={importMethod} onValueChange={(v) => { setImportMethod(v as ImportMethod); handleReset(); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="csv" className="gap-2">
            <FileUp className="h-4 w-4" /> CSV File Upload
          </TabsTrigger>
          <TabsTrigger value="sheets" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Google Sheets
          </TabsTrigger>
        </TabsList>

        {/* ========== CSV IMPORT TAB ========== */}
        <TabsContent value="csv">
          {csvStep === "choose" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Upload Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Upload CSV File
                  </CardTitle>
                  <CardDescription>
                    Upload a CSV, TSV, or TXT file with your data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Delimiter:</Label>
                    <Select value={csvDelimiter} onValueChange={(v) => setCsvDelimiter(v as any)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=",">Comma (,)</SelectItem>
                        <SelectItem value=";">Semicolon (;)</SelectItem>
                        <SelectItem value={"\t"}>Tab</SelectItem>
                        <SelectItem value="|">Pipe (|)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv,.txt"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    {parseCsvMutation.isPending ? (
                      <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
                    ) : (
                      <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    )}
                    <p className="font-medium">
                      {parseCsvMutation.isPending ? "Parsing file..." : "Drop your file here or click to browse"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supports CSV, TSV, and TXT files up to 5MB
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Template Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Download Template
                  </CardTitle>
                  <CardDescription>
                    Get a pre-formatted CSV template for {currentModuleDef?.label || targetModule}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <h4 className="font-medium text-sm">Required fields:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {currentModuleDef?.required.map((field: string) => (
                        <Badge key={field} variant="default">{field}</Badge>
                      ))}
                    </div>
                    <h4 className="font-medium text-sm mt-3">Optional fields:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {currentModuleDef?.optional.map((field: string) => (
                        <Badge key={field} variant="outline">{field}</Badge>
                      ))}
                    </div>
                  </div>

                  {currentModuleDef?.fieldDescriptions && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View field descriptions
                      </summary>
                      <div className="mt-2 space-y-1 pl-2 border-l-2">
                        {Object.entries(currentModuleDef.fieldDescriptions).map(([field, desc]: [string, any]) => (
                          <p key={field}>
                            <span className="font-medium">{field}:</span>{" "}
                            <span className="text-muted-foreground">{desc}</span>
                          </p>
                        ))}
                      </div>
                    </details>
                  )}

                  <Button onClick={handleDownloadTemplate} className="w-full" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download {currentModuleDef?.label || targetModule} Template (.csv)
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {csvStep === "map" && sheetData && renderColumnMapping(
            () => { setCsvStep("choose"); setSheetData(null); },
            handleCsvImport,
            csvImportMutation.isPending
          )}

          {csvStep === "import" && renderImporting()}
          {csvStep === "complete" && importResults && renderResults()}
        </TabsContent>

        {/* ========== GOOGLE SHEETS TAB ========== */}
        <TabsContent value="sheets">
          {/* Step 1: Connect */}
          {sheetsStep === "connect" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Connect Google Account
                </CardTitle>
                <CardDescription>
                  Connect your Google account to access your spreadsheets from Google Drive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {connectionStatus?.connected ? (
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">Connected</p>
                        <p className="text-sm text-green-600 dark:text-green-400">{connectionStatus.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate()}>
                        <LogOut className="h-4 w-4 mr-2" /> Disconnect
                      </Button>
                      <Button onClick={() => setSheetsStep("select")}>
                        Continue <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="font-medium mb-2">What you'll get access to:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>- Browse all spreadsheets in your Google Drive</li>
                        <li>- Import data from any sheet without making it public</li>
                        <li>- Automatic token refresh for seamless access</li>
                      </ul>
                    </div>
                    {authUrlData?.error ? (
                      <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                        <p className="text-yellow-800 dark:text-yellow-200">
                          {authUrlData.error}. Please ask an administrator to configure Google OAuth credentials.
                        </p>
                      </div>
                    ) : (
                      <Button onClick={handleConnectGoogle} size="lg" className="w-full">
                        <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Connect with Google
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Select Spreadsheet */}
          {sheetsStep === "select" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Select Spreadsheet
                </CardTitle>
                <CardDescription>Choose a spreadsheet from your Google Drive</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => refetchSpreadsheets()}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                  </Button>
                </div>
                <ScrollArea className="h-96 border rounded-lg">
                  {spreadsheetsLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : spreadsheets?.spreadsheets?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <FileSpreadsheet className="h-12 w-12 mb-2" />
                      <p>No spreadsheets found in your Drive</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {spreadsheets?.spreadsheets?.map((sheet: any) => (
                        <button
                          key={sheet.id}
                          onClick={() => handleSelectSpreadsheet({ id: sheet.id, name: sheet.name })}
                          className="w-full p-4 text-left hover:bg-muted transition-colors flex items-center gap-3"
                        >
                          <FileSpreadsheet className="h-8 w-8 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{sheet.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Modified: {new Date(sheet.modifiedTime).toLocaleDateString()}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <div className="mt-4">
                  <Button variant="outline" onClick={() => setSheetsStep("connect")}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview & Select Sheet */}
          {sheetsStep === "preview" && selectedSpreadsheet && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  {selectedSpreadsheet.name}
                </CardTitle>
                <CardDescription>Select a sheet tab and preview the data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label>Sheet</Label>
                    <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sheet" />
                      </SelectTrigger>
                      <SelectContent>
                        {getSheetNamesMutation.data?.sheets.map((name: string) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setSheetsStep("select")}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={handleFetchPreview} disabled={fetchSheetMutation.isPending}>
                    {fetchSheetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Load & Preview Data
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Map columns */}
          {sheetsStep === "map" && sheetData && renderColumnMapping(
            () => { setSheetsStep("preview"); setSheetData(null); },
            handleSheetsImport,
            sheetsImportMutation.isPending
          )}

          {sheetsStep === "import" && renderImporting()}
          {sheetsStep === "complete" && importResults && renderResults()}
        </TabsContent>
      </Tabs>

      {/* Import Guide */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Getting Started with Data Import</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <h4 className="font-medium mb-2">1. Prepare Your Data</h4>
              <p className="text-muted-foreground">
                Export data from your existing system (QuickBooks, Cin7, Excel, etc.) as a CSV file.
                Or use our downloadable templates to format your data correctly.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">2. Recommended Import Order</h4>
              <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Chart of Accounts</li>
                <li>Customers & Vendors</li>
                <li>Products</li>
                <li>Employees</li>
                <li>Invoices & Purchase Orders</li>
                <li>Contracts & Projects</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium mb-2">3. Other Import Options</h4>
              <ul className="text-muted-foreground space-y-1">
                <li>- <strong>OCR Document Import:</strong> Upload PDFs/invoices at <a href="/operations/document-import" className="text-primary hover:underline">Operations &gt; Document Import</a></li>
                <li>- <strong>QuickBooks Sync:</strong> Connect at <a href="/settings/integrations" className="text-primary hover:underline">Settings &gt; Integrations</a></li>
                <li>- <strong>Shopify Sync:</strong> Auto-import orders from your Shopify store</li>
                <li>- <strong>AI Assistant:</strong> Use the AI command bar (Ctrl+K) to create records by voice or text</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
