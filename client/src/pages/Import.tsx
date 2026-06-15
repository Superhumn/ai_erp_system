import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  CloudDownload,
  FileUp,
  History,
  FileText,
  File,
  Download,
  HardDrive,
  Search,
} from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";

type SyncResult = {
  sheet: string;
  type: string;
  imported: number;
  errors: string[];
};

type SyncState = "idle" | "syncing" | "done";

const DATA_SECTIONS = [
  { value: "customers", label: "Customers" },
  { value: "vendors", label: "Vendors" },
  { value: "products", label: "Products" },
  { value: "employees", label: "Employees" },
  { value: "invoices", label: "Invoices" },
  { value: "contracts", label: "Contracts" },
  { value: "projects", label: "Projects" },
] as const;

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.replace(/^"|"$/g, "").trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
  return { headers, rows };
}

function DriveFileBrowser({ onSyncAll }: { onSyncAll: () => void }) {
  const [showBrowser, setShowBrowser] = useState(true);
  const { data: spreadsheets, isLoading } = trpc.sheetsImport.listSpreadsheets.useQuery(undefined, { enabled: showBrowser });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  const syncSelectedMutation = trpc.sheetsImport.syncGoogleDrive.useMutation({
    onSuccess: (data) => {
      setSyncing(false);
      const totalImported = data.results.reduce((sum: number, r: any) => sum + r.imported, 0);
      toast.success(`Imported ${totalImported} records from ${selectedIds.size} files`);
      setSelectedIds(new Set());
    },
    onError: (error) => {
      setSyncing(false);
      toast.error(error.message);
    },
  });

  const toggleFile = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const files = (spreadsheets as any)?.spreadsheets || [];
  const query = search.trim().toLowerCase();
  const filteredFiles = query
    ? files.filter((f: any) => (f.name || "").toLowerCase().includes(query))
    : files;
  const allFilteredSelected = filteredFiles.length > 0 && filteredFiles.every((f: any) => selectedIds.has(f.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Google Drive Files</h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filteredFiles.length === 0} onClick={() => {
            if (allFilteredSelected) {
              const next = new Set(selectedIds);
              filteredFiles.forEach((f: any) => next.delete(f.id));
              setSelectedIds(next);
            } else {
              const next = new Set(selectedIds);
              filteredFiles.forEach((f: any) => next.add(f.id));
              setSelectedIds(next);
            }
          }}>
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </Button>
          <Button variant="outline" size="sm" onClick={onSyncAll}>
            <RefreshCw className="h-3 w-3 mr-1" /> Sync All
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No spreadsheets found in your Google Drive.
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No files match "{search}".
        </div>
      ) : (
        <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
          {filteredFiles.map((file: any) => (
            <label
              key={file.id}
              className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(file.id)}
                onChange={() => toggleFile(file.id)}
                className="rounded"
              />
              <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      {selectedIds.size > 0 && (
        <Button
          onClick={() => { setSyncing(true); syncSelectedMutation.mutate(); }}
          disabled={syncing}
          className="w-full"
        >
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CloudDownload className="h-4 w-4 mr-2" />}
          Sync {selectedIds.size} Selected File{selectedIds.size > 1 ? "s" : ""}
        </Button>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Select specific files to sync, or click "Sync All" to import everything.
      </p>
    </div>
  );
}

const DRIVE_TABS = [
  { label: "All", mimeType: undefined },
  { label: "Docs", mimeType: "application/vnd.google-apps.document" },
  { label: "Sheets", mimeType: "application/vnd.google-apps.spreadsheet" },
  { label: "PDFs", mimeType: "application/pdf" },
] as const;

function driveFileIcon(mimeType: string) {
  if (mimeType === "application/vnd.google-apps.document") return <FileText className="h-4 w-4 text-blue-600 shrink-0" />;
  if (mimeType === "application/vnd.google-apps.spreadsheet") return <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />;
  if (mimeType === "application/pdf") return <File className="h-4 w-4 text-red-500 shrink-0" />;
  if (mimeType?.includes("presentation") || mimeType === "application/vnd.google-apps.presentation") return <File className="h-4 w-4 text-yellow-500 shrink-0" />;
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function driveExportLabel(mimeType: string): { label: string; format: "pdf" | "xlsx" | "docx" | "csv" } | null {
  if (mimeType === "application/vnd.google-apps.document") return { label: "PDF", format: "pdf" };
  if (mimeType === "application/vnd.google-apps.spreadsheet") return { label: "XLSX", format: "xlsx" };
  if (mimeType === "application/pdf") return { label: "PDF", format: "pdf" };
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return { label: "XLSX", format: "xlsx" };
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return { label: "DOCX", format: "docx" };
  return null;
}

function formatFileSize(bytes: string | number | undefined) {
  if (!bytes) return "";
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(n) || n === 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function GoogleDriveFiles() {
  const [activeTab, setActiveTab] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const mimeType = DRIVE_TABS[activeTab].mimeType;

  const { data, isLoading, refetch } = trpc.sheetsImport.listDriveFiles.useQuery(
    mimeType ? { mimeType } : {},
  );

  const exportMutation = trpc.sheetsImport.exportFile.useMutation({
    onSuccess: (result) => {
      // Convert base64 to blob and trigger download
      const byteChars = atob(result.base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: result.mimeType });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDownloadingId(null);
      toast.success(`Downloaded ${result.filename}`);
    },
    onError: (error) => {
      setDownloadingId(null);
      toast.error(error.message);
    },
  });

  const handleDownload = (file: any) => {
    const exp = driveExportLabel(file.mimeType);
    if (!exp) {
      toast.error("Unsupported file type for download");
      return;
    }
    setDownloadingId(file.id);
    exportMutation.mutate({
      fileId: file.id,
      exportFormat: exp.format,
    });
  };

  const files = data?.files || [];
  const query = search.trim().toLowerCase();
  const filteredFiles = query
    ? files.filter((f: any) => (f.name || "").toLowerCase().includes(query))
    : files;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Google Drive Files
        </CardTitle>
        <CardDescription>Browse and download files from your Drive</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Tabs */}
        <div className="flex gap-1 mb-3 border-b">
          {DRIVE_TABS.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === i
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground p-1.5" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8"
          />
        </div>

        {/* File list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">No files found.</div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">No files match "{search}".</div>
        ) : (
          <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
            {filteredFiles.map((file: any) => {
              const exp = driveExportLabel(file.mimeType);
              const isDownloading = downloadingId === file.id;
              return (
                <div key={file.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors">
                  {driveFileIcon(file.mimeType)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 w-[70px] text-right">
                    {file.modifiedTime
                      ? new Date(file.modifiedTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : ""}
                  </span>
                  {exp ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      disabled={isDownloading}
                      onClick={() => handleDownload(file)}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          {file.mimeType.startsWith("application/vnd.google-apps.")
                            ? `as ${exp.label}`
                            : "Download"}
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0 w-[70px]" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CsvImportPanel({ file, onClear, parseXlsx }: {
  file: File;
  onClear: () => void;
  parseXlsx: (f: File) => Promise<{ headers: string[]; rows: Record<string, unknown>[] } | null>;
}) {
  const [targetModule, setTargetModule] = useState<string>("");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, any>[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  const importMutation = trpc.sheetsImport.importData.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} records (${data.failed} failed)`);
      if (data.errors?.length > 0) {
        toast.error(`${data.errors.length} errors: ${data.errors[0]}`);
      }
      setImporting(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setImporting(false);
    },
  });

  const handleParse = async () => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const result = await parseXlsx(file);
      if (result) {
        setParsed({ headers: result.headers, rows: result.rows as any });
        toast.success(`Parsed ${result.rows.length} rows`);
        // Auto-map columns by matching header names
        const mapping: Record<string, string> = {};
        result.headers.forEach(h => { mapping[h] = h.toLowerCase().replace(/\s+/g, "_"); });
        setColumnMapping(mapping);
      }
    } else {
      const text = await file.text();
      const result = parseCsvText(text);
      setParsed(result);
      toast.success(`Parsed ${result.rows.length} rows`);
      const mapping: Record<string, string> = {};
      result.headers.forEach(h => { mapping[h] = h.toLowerCase().replace(/\s+/g, "_"); });
      setColumnMapping(mapping);
    }
  };

  const handleImport = () => {
    if (!parsed || !targetModule) {
      toast.error("Please select a data section and parse the file first");
      return;
    }
    setImporting(true);
    const stringRows = parsed.rows.map(row => {
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) { obj[k] = String(v ?? ""); }
      return obj;
    });
    importMutation.mutate({
      targetModule: targetModule as any,
      data: stringRows,
      columnMapping,
    });
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          <span className="text-sm">{file.name}</span>
          <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>Remove</Button>
      </div>

      {/* Section Selector */}
      <div className="p-4 border rounded-lg space-y-3">
        <div>
          <label className="text-sm font-medium">Which section does this data belong to?</label>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {DATA_SECTIONS.map(s => (
              <button
                key={s.value}
                onClick={() => setTargetModule(s.value)}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  targetModule === s.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-muted hover:border-muted-foreground/50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {!parsed ? (
          <Button onClick={handleParse} disabled={!targetModule}>
            Parse File
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Found <strong>{parsed.rows.length}</strong> rows with columns: {parsed.headers.join(", ")}
            </div>

            {/* Column mapping preview */}
            <div className="max-h-32 overflow-y-auto text-xs border rounded p-2 bg-background">
              <table className="w-full">
                <thead>
                  <tr>
                    {parsed.headers.slice(0, 6).map(h => (
                      <th key={h} className="text-left p-1 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.slice(0, 6).map(h => (
                        <td key={h} className="p-1 text-muted-foreground truncate max-w-[120px]">{String(row[h] || "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 3 && <div className="text-center text-muted-foreground mt-1">... and {parsed.rows.length - 3} more rows</div>}
            </div>

            <Button onClick={handleImport} disabled={importing || !targetModule}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import {parsed.rows.length} rows into {targetModule || "..."}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Import() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [totalSheets, setTotalSheets] = useState(0);

  // CSV upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Google connection status — also check URL params for fresh connection
  const [forceConnected, setForceConnected] = useState(false);
  const { data: connectionStatus, refetch: refetchConnection, isLoading: connectionLoading } =
    trpc.sheetsImport.getConnectionStatus.useQuery(undefined, {
      enabled: isAuthenticated,
      onSuccess: (data) => {
        if (data?.connected) setForceConnected(true);
      },
    } as any);

  // Check if we just returned from Google OAuth
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true' || params.get('success')) {
      setForceConnected(true);
      refetchConnection();
    }
  }, [refetchConnection]);

  const isGoogleConnected = forceConnected || connectionStatus?.connected;

  // Google OAuth URL
  const { data: authUrlData } = trpc.sheetsImport.getAuthUrl.useQuery(undefined, {
    enabled: isAuthenticated && !isGoogleConnected,
  });

  // Past sync history — persists across page reloads
  const { data: syncHistory, refetch: refetchSyncHistory } = trpc.sheetsImport.getSyncHistory.useQuery(undefined, {
    enabled: isAuthenticated && !!isGoogleConnected,
  });

  // Sync mutation
  const syncMutation = trpc.sheetsImport.syncGoogleDrive.useMutation({
    onSuccess: (data) => {
      setSyncResults(data.results);
      setTotalSheets(data.totalSheets);
      setSyncState("done");
      refetchSyncHistory();
      const totalImported = data.results.reduce((sum: number, r: SyncResult) => sum + r.imported, 0);
      if (totalImported > 0) {
        toast.success(`Imported ${totalImported} records from ${data.totalSheets} spreadsheets`);
      } else {
        toast.info("Sync complete. No new records were imported.");
      }
    },
    onError: (error) => {
      setSyncState("idle");
      toast.error(error.message);
    },
  });

  // Disconnect mutation
  const disconnectMutation = trpc.sheetsImport.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      refetchConnection();
    },
  });

  // Handle OAuth callback
  useEffect(() => {
    if (searchParams) {
      const params = new URLSearchParams(searchParams);
      if (params.get("success") === "connected") {
        toast.success("Google account connected successfully!");
        refetchConnection();
        setLocation("/import");
      } else if (params.get("error")) {
        const error = params.get("error");
        toast.error(`Connection failed: ${error}`);
        setLocation("/import");
      }
    }
  }, [searchParams, refetchConnection, setLocation]);

  const handleConnectGoogle = () => {
    if (authUrlData?.url) {
      window.location.href = authUrlData.url;
    } else {
      toast.error("Google OAuth not configured. Please contact administrator.");
    }
  };

  const handleSync = () => {
    setSyncState("syncing");
    setSyncResults([]);
    syncMutation.mutate();
  };

  const handleReset = () => {
    setSyncState("idle");
    setSyncResults([]);
    setTotalSheets(0);
  };

  // CSV drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const isImageFile = useCallback((filename: string) => {
    return /\.(png|jpe?g|gif|webp)$/i.test(filename);
  }, []);

  const handleImageFile = useCallback((file: File) => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
    setCsvFile(file);
    toast.success("Image uploaded. File storage coming soon.");
  }, [imagePreviewUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (isImageFile(name)) {
      handleImageFile(file);
      return;
    }
    if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".pdf")) {
      if (name.endsWith(".pdf")) {
        toast.info("PDF import coming soon — please use CSV or XLSX");
        return;
      }
      setImagePreviewUrl(null);
      setCsvFile(file);
      toast.success(`File "${file.name}" ready for upload`);
    } else {
      toast.error("Please drop a CSV, XLSX, PDF, or image file");
    }
  }, [isImageFile, handleImageFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (isImageFile(name)) {
      handleImageFile(file);
      e.target.value = "";
      return;
    }
    if (name.endsWith(".pdf")) {
      toast.info("PDF import coming soon — please use CSV or XLSX");
      e.target.value = "";
      return;
    }
    setImagePreviewUrl(null);
    setCsvFile(file);
    toast.success(`File "${file.name}" ready for upload`);
  }, [isImageFile, handleImageFile]);

  const parseXlsxFile = useCallback(async (file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] } | null> => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        toast.error("No sheets found in the workbook");
        return null;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      return { headers, rows: jsonData };
    } catch (err) {
      toast.error("Failed to parse XLSX file");
      console.error("XLSX parse error:", err);
      return null;
    }
  }, []);

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "vendors": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "customers": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "products": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "employees": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "raw_materials": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "error": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "skipped": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
      default: return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
    }
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

  const totalImported = syncResults.reduce((sum, r) => sum + r.imported, 0);
  const totalErrors = syncResults.reduce((sum, r) => sum + r.errors.length, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Import Data</h1>
        <p className="text-muted-foreground mt-1">
          Sync your data from Google Drive or upload CSV files
        </p>
      </div>

      {/* Section 1: Google Drive Sync */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5" />
            Google Drive Sync
          </CardTitle>
          <CardDescription>
            Auto-detect and import all spreadsheets from your Google Drive into the right ERP tables
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectionLoading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">Checking connection...</div>
          ) : !isGoogleConnected ? (
            /* Not connected - show connect button */
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Connect your Google account to automatically sync spreadsheets from Drive.
                  Headers are analyzed to detect vendors, customers, products, employees, and raw materials.
                </p>
              </div>

              {authUrlData?.error ? (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <p className="text-yellow-800 dark:text-yellow-200 text-sm">
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
          ) : syncState === "idle" ? (
            /* Connected, ready to sync */
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-800 dark:text-green-200">
                    Connected as {connectionStatus.email}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Disconnect
                </Button>
              </div>

              <DriveFileBrowser onSyncAll={handleSync} />

              {/* Previously imported — persisted sync history */}
              {syncHistory && syncHistory.length > 0 && (
                <div className="space-y-3 pt-2">
                  <Separator />
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-medium text-muted-foreground">Previously Imported</h4>
                  </div>
                  {syncHistory.map((entry: any) => {
                    const entryResults: SyncResult[] = entry.results || [];
                    const entryImported = entryResults.reduce((sum: number, r: SyncResult) => sum + r.imported, 0);
                    const syncDate = new Date(entry.syncedAt);
                    const dateStr = syncDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    const timeStr = syncDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                    return (
                      <details key={entry.id} className="border rounded-lg">
                        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                          <div className="flex items-center gap-3 min-w-0">
                            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <span className="text-sm font-medium">
                              {entryImported} records from {entry.totalSheets} sheets
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                            {dateStr} at {timeStr}
                          </span>
                        </summary>
                        <div className="px-3 pb-3 space-y-1">
                          {entryResults.map((result: SyncResult, i: number) => (
                            <div
                              key={i}
                              className="flex items-center justify-between py-1.5 px-2 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="truncate text-muted-foreground">{result.sheet}</span>
                                <Badge className={`text-[10px] ${getTypeBadgeColor(result.type)}`}>
                                  {result.type}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {result.imported > 0 ? `+${result.imported}` : result.type === "error" ? "failed" : "skipped"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          ) : syncState === "syncing" ? (
            /* Syncing in progress */
            <div className="py-8 flex flex-col items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium">Syncing from Google Drive...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reading spreadsheets, detecting data types, and importing records
              </p>
            </div>
          ) : (
            /* Sync complete - show results */
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-semibold">{totalSheets}</p>
                  <p className="text-sm text-muted-foreground">Sheets found</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                  <p className="text-2xl font-semibold text-green-600">{totalImported}</p>
                  <p className="text-sm text-green-800 dark:text-green-200">Records imported</p>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-center">
                  <p className="text-2xl font-semibold text-red-600">{totalErrors}</p>
                  <p className="text-sm text-red-800 dark:text-red-200">Errors</p>
                </div>
              </div>

              <Separator />

              {/* Per-sheet results */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Import Log</h4>
                {syncResults.map((result, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{result.sheet}</span>
                      <Badge className={`text-xs ${getTypeBadgeColor(result.type)}`}>
                        {result.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result.imported > 0 ? (
                        <span className="text-sm text-green-600 font-medium">
                          +{result.imported} imported
                        </span>
                      ) : result.type === "skipped" || result.type === "unknown" ? (
                        <span className="text-sm text-muted-foreground">skipped</span>
                      ) : result.type === "error" ? (
                        <span className="text-sm text-red-600">failed</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">0 imported</span>
                      )}
                      {result.errors.length > 0 && (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Error details */}
              {totalErrors > 0 && (
                <details className="p-3 bg-muted rounded-lg">
                  <summary className="text-sm font-medium cursor-pointer">
                    View {totalErrors} error(s)
                  </summary>
                  <ul className="mt-2 text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                    {syncResults.flatMap((r) =>
                      r.errors.map((err, j) => (
                        <li key={`${r.sheet}-${j}`}>
                          <span className="font-medium">{r.sheet}:</span> {err}
                        </li>
                      ))
                    )}
                  </ul>
                </details>
              )}

              <Button onClick={handleReset} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Google Drive File Browser */}
      {isGoogleConnected && <GoogleDriveFiles />}

      {/* Section 3: File Upload */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            File Upload
          </CardTitle>
          <CardDescription>
            Upload a CSV, XLSX, PDF, or image file to import data manually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {csvFile ? csvFile.name : "Drop a CSV, XLSX, PDF, or image file here, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .csv, .tsv, .xlsx, .xls, .pdf, .png, .jpg, .gif, and .webp files
            </p>
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              id="csv-upload"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => document.getElementById("csv-upload")?.click()}
            >
              Choose File
            </Button>
          </div>

          {csvFile && imagePreviewUrl && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm">{csvFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(csvFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
                  setImagePreviewUrl(null);
                  setCsvFile(null);
                }}>
                  Remove
                </Button>
              </div>
              <div className="border rounded-lg p-4 flex justify-center bg-muted/30">
                <img
                  src={imagePreviewUrl}
                  alt={`Preview of ${csvFile.name}`}
                  className="max-h-64 max-w-full rounded object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Image preview. Full file storage coming soon.
              </p>
            </div>
          )}

          {csvFile && !imagePreviewUrl && (
            <CsvImportPanel file={csvFile} onClear={() => setCsvFile(null)} parseXlsx={parseXlsxFile} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
