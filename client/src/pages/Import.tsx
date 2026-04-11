import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";

type SyncResult = {
  sheet: string;
  type: string;
  imported: number;
  errors: string[];
};

type SyncState = "idle" | "syncing" | "done";

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

  // Sync mutation
  const syncMutation = trpc.sheetsImport.syncGoogleDrive.useMutation({
    onSuccess: (data) => {
      setSyncResults(data.results);
      setTotalSheets(data.totalSheets);
      setSyncState("done");
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".tsv"))) {
      setCsvFile(file);
      toast.success(`File "${file.name}" ready for upload`);
    } else {
      toast.error("Please drop a CSV or TSV file");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      toast.success(`File "${file.name}" ready for upload`);
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

              <Button onClick={handleSync} size="lg" className="w-full h-16 text-base">
                <RefreshCw className="h-5 w-5 mr-3" />
                Sync Everything from Google Drive
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Scans all Google Sheets in your Drive, detects data types from column headers, and imports to the matching ERP tables.
              </p>
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

      {/* Section 2: CSV Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            CSV Upload
          </CardTitle>
          <CardDescription>
            Upload a CSV file to import data manually
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
              {csvFile ? csvFile.name : "Drop a CSV file here, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .csv and .tsv files
            </p>
            <input
              type="file"
              accept=".csv,.tsv"
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

          {csvFile && (
            <div className="mt-4 flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm">{csvFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(csvFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCsvFile(null)}>
                  Remove
                </Button>
                <Button size="sm" onClick={() => toast.info("CSV import coming soon. Use Google Drive sync for now.")}>
                  Import
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
