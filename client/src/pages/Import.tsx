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
import {
  IMPORT_FIELDS,
  IMPORT_SKIP,
  DRIVE_IMPORT_TYPES,
  buildDefaultMapping,
  missingRequiredFields,
  type ImportModule,
} from "@shared/importFields";

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

type ParsedSheet = { headers: string[]; rows: Record<string, any>[] };
type ParsedWorkbook = { sheetNames: string[]; sheets: Record<string, ParsedSheet> };

// Parse a CSV/TSV/XLSX file into one or more sheets. SheetJS handles RFC 4180
// CSV quoting (commas, escaped quotes and newlines inside quoted cells) and
// multi-tab workbooks — both of which the previous naive splitter dropped.
async function parseFileToWorkbook(file: File): Promise<ParsedWorkbook> {
  const name = file.name.toLowerCase();
  let workbook: XLSX.WorkBook;
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", raw: false });
  } else {
    // CSV / TSV / plain text — SheetJS detects the delimiter and quoting.
    const text = await file.text();
    workbook = XLSX.read(text, { type: "string", raw: false });
  }
  const sheets: Record<string, ParsedSheet> = {};
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    sheets[sheetName] = { headers, rows };
  }
  return { sheetNames: workbook.SheetNames, sheets };
}

type DrivePreview = { fileId: string; fileName: string; detectedType: string; rowCount: number; supported: boolean };

function DriveFileBrowser({ onImport }: { onImport: (selections: { fileId: string; type: string }[]) => void }) {
  const [showBrowser] = useState(true);
  const { data: spreadsheets, isLoading } = trpc.sheetsImport.listSpreadsheets.useQuery(undefined, { enabled: showBrowser });
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Confirmation step: previews from the server + the user's per-file choice
  // (a DRIVE_IMPORT_TYPES value, or "" to skip the file).
  const [previewing, setPreviewing] = useState(false);
  const [previews, setPreviews] = useState<DrivePreview[] | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});

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

  const runPreview = async (fileIds?: string[]) => {
    setPreviewing(true);
    try {
      const res = await utils.sheetsImport.previewGoogleDrive.fetch(
        fileIds && fileIds.length ? { fileIds } : {},
      );
      const rows = res.previews as DrivePreview[];
      setPreviews(rows);
      // Default each file to its detected type when we can import it, else skip.
      const next: Record<string, string> = {};
      rows.forEach((p) => { next[p.fileId] = p.supported ? p.detectedType : ""; });
      setChoices(next);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setPreviewing(false);
    }
  };

  // ---- Confirmation step ----
  if (previews) {
    const importable = previews.filter((p) => choices[p.fileId]);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Confirm destinations</h4>
          <Button variant="ghost" size="sm" onClick={() => setPreviews(null)}>Back</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          We detected where each sheet should go. Review and adjust before importing — nothing is written until you confirm.
        </p>

        <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
          {previews.map((p) => (
            <div key={p.fileId} className="flex items-center gap-3 p-3">
              <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {p.rowCount} row{p.rowCount === 1 ? "" : "s"}
                  {p.detectedType === "unknown" && " · type not recognised"}
                  {p.detectedType === "error" && " · could not read sheet"}
                </div>
              </div>
              <span className="text-muted-foreground text-xs shrink-0">→</span>
              <select
                value={choices[p.fileId] ?? ""}
                onChange={(e) => setChoices((c) => ({ ...c, [p.fileId]: e.target.value }))}
                className="text-sm border rounded-md px-2 py-1 bg-background w-44 shrink-0"
              >
                <option value="">— Don't import —</option>
                {DRIVE_IMPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={importable.length === 0}
          onClick={() => onImport(importable.map((p) => ({ fileId: p.fileId, type: choices[p.fileId] })))}
        >
          <CloudDownload className="h-4 w-4 mr-2" />
          Import {importable.length} file{importable.length === 1 ? "" : "s"}
        </Button>
      </div>
    );
  }

  // ---- Browse + select step ----
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
          <Button variant="outline" size="sm" disabled={previewing || files.length === 0} onClick={() => runPreview()}>
            {previewing && selectedIds.size === 0 ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Review All
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
          onClick={() => runPreview([...selectedIds])}
          disabled={previewing}
          className="w-full"
        >
          {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CloudDownload className="h-4 w-4 mr-2" />}
          Review {selectedIds.size} Selected File{selectedIds.size > 1 ? "s" : ""}
        </Button>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Select specific files, or click "Review All" — you'll confirm where each sheet goes before importing.
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

function CsvImportPanel({ file, onClear }: {
  file: File;
  onClear: () => void;
}) {
  const [targetModule, setTargetModule] = useState<ImportModule | "">("");
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  const parsed: ParsedSheet | null = workbook && activeSheet ? workbook.sheets[activeSheet] ?? null : null;

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

  // Re-suggest a column->field mapping whenever the active sheet or target
  // module changes. Manual dropdown edits live in columnMapping and are
  // intentionally NOT a dependency, so they survive until sheet/module changes.
  useEffect(() => {
    if (parsed && targetModule) {
      setColumnMapping(buildDefaultMapping(parsed.headers, targetModule));
    }
  }, [workbook, activeSheet, targetModule]);

  const handleParse = async () => {
    try {
      const wb = await parseFileToWorkbook(file);
      if (wb.sheetNames.length === 0) {
        toast.error("No sheets found in the file");
        return;
      }
      setWorkbook(wb);
      setActiveSheet(wb.sheetNames[0]);
      const first = wb.sheets[wb.sheetNames[0]];
      toast.success(
        `Parsed ${first.rows.length} rows` +
          (wb.sheetNames.length > 1 ? ` from "${wb.sheetNames[0]}" (${wb.sheetNames.length} sheets)` : ""),
      );
    } catch (err) {
      toast.error("Failed to parse file");
      console.error("Parse error:", err);
    }
  };

  const fields = targetModule ? IMPORT_FIELDS[targetModule] : [];
  const missingRequired = parsed && targetModule ? missingRequiredFields(targetModule, columnMapping) : [];
  const sectionLabel = DATA_SECTIONS.find(s => s.value === targetModule)?.label ?? "...";
  const ignoredColumns = parsed ? parsed.headers.filter(h => (columnMapping[h] ?? IMPORT_SKIP) === IMPORT_SKIP) : [];
  const mappedCount = parsed ? parsed.headers.length - ignoredColumns.length : 0;

  const handleImport = () => {
    if (!parsed || !targetModule) {
      toast.error("Please select a data section and parse the file first");
      return;
    }
    if (missingRequired.length > 0) {
      toast.error(`Map the required field(s) first: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }
    setImporting(true);
    const stringRows = parsed.rows.map(row => {
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) { obj[k] = String(v ?? ""); }
      return obj;
    });
    // Only send columns the user actually mapped to a field.
    const cleanMapping = Object.fromEntries(
      Object.entries(columnMapping).filter(([, field]) => field !== IMPORT_SKIP),
    );
    importMutation.mutate({
      targetModule,
      data: stringRows,
      columnMapping: cleanMapping,
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
            {workbook && workbook.sheetNames.length > 1 && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  This file has {workbook.sheetNames.length} sheets. Importing one at a time — choose which:
                </span>
                <select
                  value={activeSheet}
                  onChange={(e) => setActiveSheet(e.target.value)}
                  className="text-xs border rounded-md px-2 py-1 bg-background ml-auto shrink-0"
                >
                  {workbook.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name} ({workbook.sheets[name]?.rows.length ?? 0})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Found <strong>{parsed.rows.length}</strong> rows. Map each spreadsheet column to a{" "}
              <strong>{sectionLabel}</strong> field so the data lands in the right place
              (<span className="text-amber-600">*</span> = required):
            </div>

            {/* Column → field mapping */}
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {parsed.headers.map(h => {
                const sample = parsed.rows.find(r => String(r[h] ?? "").trim() !== "")?.[h];
                return (
                  <div key={h} className="flex items-center gap-3 p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{h}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        e.g. {sample != null && String(sample).trim() !== "" ? String(sample) : "—"}
                      </div>
                    </div>
                    <span className="text-muted-foreground text-xs shrink-0">→</span>
                    <select
                      value={columnMapping[h] ?? IMPORT_SKIP}
                      onChange={(e) => setColumnMapping(m => ({ ...m, [h]: e.target.value }))}
                      className="text-sm border rounded-md px-2 py-1 bg-background w-44 shrink-0"
                    >
                      <option value={IMPORT_SKIP}>— Don't import —</option>
                      {fields.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}{f.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {missingRequired.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Required field{missingRequired.length > 1 ? "s" : ""} not mapped:{" "}
                {missingRequired.map(f => f.label).join(", ")}
              </div>
            )}

            {/* Pre-flight transparency: exactly what will and won't be written. */}
            <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
              <div className="text-muted-foreground">
                Importing <strong>{mappedCount}</strong> of {parsed.headers.length} column{parsed.headers.length === 1 ? "" : "s"} into <strong>{sectionLabel}</strong>.
              </div>
              {ignoredColumns.length > 0 && (
                <div className="text-amber-600">
                  Will be ignored: {ignoredColumns.join(", ")}
                </div>
              )}
            </div>

            <Button onClick={handleImport} disabled={importing || !targetModule || missingRequired.length > 0}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import {parsed.rows.length} rows into {sectionLabel}
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
  // Id of the background import job we're currently tracking (null = none).
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [processedSheets, setProcessedSheets] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // CSV upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Google connection status — also check URL params for fresh connection
  const [forceConnected, setForceConnected] = useState(false);
  const { data: connectionStatus, refetch: refetchConnection, isLoading: connectionLoading } =
    trpc.sheetsImport.getConnectionStatus.useQuery(undefined, {
      enabled: isAuthenticated,
      onSuccess: (data: any) => {
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

  // Kick off a background import. The mutation returns immediately with a jobId;
  // the import itself keeps running server-side even if we leave the page.
  const startSyncMutation = trpc.sheetsImport.startSyncGoogleDrive.useMutation({
    onSuccess: ({ jobId }) => {
      setActiveJobId(jobId);
      setSyncState("syncing");
    },
    onError: (error) => {
      setSyncState("idle");
      toast.error(error.message);
    },
  });

  // On mount, reconnect to any import that's still running server-side so
  // leaving and returning to the page picks the progress back up.
  trpc.sheetsImport.getActiveSync.useQuery(undefined, {
    enabled: isAuthenticated && !!isGoogleConnected && activeJobId == null && syncState === "idle",
    refetchOnWindowFocus: false,
    onSuccess: (data: any) => {
      if (data?.jobId) {
        setActiveJobId(data.jobId);
        setSyncResults(data.results || []);
        setTotalSheets(data.totalSheets || 0);
        setProcessedSheets(data.processedSheets || 0);
        setCurrentFile(data.currentFile || null);
        setSyncState("syncing");
      }
    },
  } as any);

  // Poll the tracked job until it finishes. refetchInterval stops once the job
  // reaches a terminal state.
  const { data: jobStatus } = trpc.sheetsImport.getSyncStatus.useQuery(
    { jobId: activeJobId as number },
    {
      enabled: activeJobId != null,
      refetchInterval: (data: any) => (data && data.state !== "running" ? false : 2000),
    } as any,
  );

  // React to job-status updates: live progress while running, results on finish.
  useEffect(() => {
    if (!jobStatus) return;
    setSyncResults(jobStatus.results || []);
    setTotalSheets(jobStatus.totalSheets || 0);
    setProcessedSheets(jobStatus.processedSheets || 0);
    setCurrentFile(jobStatus.currentFile || null);
    if (jobStatus.state === "done" || jobStatus.state === "error") {
      setSyncState("done");
      setActiveJobId(null);
      refetchSyncHistory();
      const totalImported = (jobStatus.results || []).reduce(
        (sum: number, r: SyncResult) => sum + r.imported,
        0,
      );
      if (jobStatus.state === "error") {
        toast.error(jobStatus.error || "Import failed");
      } else if (totalImported > 0) {
        toast.success(`Imported ${totalImported} records from ${jobStatus.totalSheets} spreadsheets`);
      } else {
        toast.info("Sync complete. No new records were imported.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus]);

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

  const handleImportSelections = (selections: { fileId: string; type: string }[]) => {
    setSyncState("syncing");
    setSyncResults([]);
    setProcessedSheets(0);
    setCurrentFile(null);
    startSyncMutation.mutate({ selections } as any);
  };

  const handleReset = () => {
    setSyncState("idle");
    setSyncResults([]);
    setTotalSheets(0);
    setActiveJobId(null);
    setProcessedSheets(0);
    setCurrentFile(null);
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

              <DriveFileBrowser onImport={handleImportSelections} />

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
              {totalSheets > 0 && (
                <div className="w-full max-w-xs mt-4">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round((processedSheets / totalSheets) * 100))}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {processedSheets} of {totalSheets} sheet{totalSheets === 1 ? "" : "s"}
                    {currentFile ? ` · ${currentFile}` : ""}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
                This runs in the background — you can leave this page and it will keep importing.
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
            <CsvImportPanel file={csvFile} onClear={() => setCsvFile(null)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
