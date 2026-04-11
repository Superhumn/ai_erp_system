import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Slider } from "@/components/ui/slider";
import { FileBarChart, Download, Printer, Loader2, Play, Upload, FileText, ExternalLink, Shield } from "lucide-react";
import { toast } from "sonner";

// ── Report type definitions ──────────────────────────────────────
const reportTypes = [
  { id: "detailed_cap_table", name: "Detailed Cap Table", description: "Capitalization summary with all security ledgers", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "stakeholders", name: "Stakeholders", description: "Stakeholder Information Report", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "stakeholder_transactions", name: "Stakeholder Transaction Report", description: "List of transactions for a stakeholder", needsStakeholder: true, needsDateRange: false, needsExitVal: false },
  { id: "termination_modelling", name: "Termination Modelling", description: "Create a Termination Modelling Report", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "exercised_options", name: "Exercised Options", description: "All the exercised Options", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "iso_nso_details", name: "ISO/NSO Details", description: "Summary of the ISO/NSO details for options grants", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "waterfall", name: "Waterfall Report", description: "Proceeds distribution report on hypothetical liquidation event", needsStakeholder: false, needsDateRange: false, needsExitVal: true },
  { id: "vesting_details", name: "Vesting Details", description: "Summary of vest events for whole company or per stakeholder", needsStakeholder: true, needsDateRange: false, needsExitVal: false },
  { id: "rsu_release", name: "RSU Release Report", description: "Settled RSU and tax withholdings", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "implied_ownership", name: "Implied Ownership Report", description: "List of stakeholder ownership and implied ownership", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "raw_captable", name: "Raw Cap Table", description: "Includes all cap table details", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "iso_disqualifying", name: "ISO Disqualifying Disposition Report", description: "Review ISO qualification details of all ISO dispositions", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
  { id: "securities_cancelled", name: "Securities Cancelled Report", description: "Report of securities cancelled within a date range", needsStakeholder: false, needsDateRange: true, needsExitVal: false },
  { id: "granted_securities", name: "Granted Securities Report", description: "Report of securities granted within a date range", needsStakeholder: false, needsDateRange: true, needsExitVal: false },
  { id: "rsa_rsu_settlement", name: "RSA/RSU Settlement Report", description: "Report of RSA/RSU securities settled within a date range", needsStakeholder: false, needsDateRange: true, needsExitVal: false },
  { id: "stakeholder_ownership", name: "Stakeholder Ownership Report", description: "Summary of ownership by stakeholder", needsStakeholder: false, needsDateRange: false, needsExitVal: false },
] as const;

type ReportType = (typeof reportTypes)[number];

interface ReportData {
  headers: string[];
  rows: any[][];
  title: string;
  generatedAt: string;
}

// ── CSV helper ───────────────────────────────────────────────────
function downloadCSV(report: ReportData) {
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [report.headers.map(escape).join(",")];
  for (const row of report.rows) {
    lines.push(row.map(escape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Valuation helpers ──────────────────────────────────────────
function formatValuationCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(2)}`;
}

function formatFMV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return `$${num.toFixed(2)}`;
}

function statusColor(status: string | null | undefined): string {
  switch (status) {
    case "approved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "expired": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "draft": return "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function EquityReports() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [showParamsDialog, setShowParamsDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Parameters
  const [stakeholderId, setStakeholderId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exitValuation, setExitValuation] = useState("");

  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 409A Valuations query
  const valuationsQuery = trpc.capTable.valuations.list.useQuery();
  const valuations = valuationsQuery.data ?? [];
  const currentValuation = valuations.length > 0 ? valuations[0] : null;

  // Documents linked to valuations
  const valuationDocsQuery = trpc.documents.list.useQuery({
    referenceType: "valuation",
  });
  const valuationDocs = valuationDocsQuery.data ?? [];

  // Upload mutation
  const uploadDoc = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Valuation report uploaded successfully");
      valuationDocsQuery.refetch();
    },
    onError: (err: any) => {
      toast.error("Upload failed: " + err.message);
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.");
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadDoc.mutate({
        name: file.name,
        type: "report",
        referenceType: "valuation",
        referenceId: currentValuation?.id,
        fileData: base64,
        mimeType: file.type || "application/pdf",
        description: `409A Valuation Report - ${file.name}`,
      });
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const stakeholdersQuery = trpc.capTable.stakeholders.list.useQuery();
  const grantsQuery = trpc.capTable.grants.list.useQuery();

  // SAFE/Convertible Note conversion modeler state
  const [convPreMoneyVal, setConvPreMoneyVal] = useState(100_000_000);
  const [convRoundPrice, setConvRoundPrice] = useState(10);

  // Conversion model computation
  const conversionModel = useMemo(() => {
    const allGrants = grantsQuery.data ?? [];
    const allStakeholders = stakeholdersQuery.data ?? [];

    // Active SAFEs & convertible notes (not cancelled, not terminated, not converted)
    const safeNotes = allGrants.filter(
      (g: any) =>
        (g.grantType === "safe" || g.grantType === "convertible_note") &&
        g.status !== "cancelled" &&
        g.status !== "expired" &&
        g.status !== "converted"
    );

    // Pre-money shares: all non-SAFE, non-convertible-note grants that are not cancelled/terminated
    const preMoneyShares = allGrants
      .filter(
        (g: any) =>
          g.grantType !== "safe" &&
          g.grantType !== "convertible_note" &&
          g.status !== "cancelled" &&
          g.status !== "expired"
      )
      .reduce((sum: number, g: any) => sum + parseFloat(g.shares || "0"), 0);

    // Build per-investor rows
    const rows = safeNotes.map((g: any) => {
      const stakeholder = allStakeholders.find((s: any) => s.id === g.stakeholderId);
      const investorName = stakeholder?.name || `Stakeholder #${g.stakeholderId}`;
      const isNote = g.grantType === "convertible_note";

      // Investment amount: for convertible notes, principal + accrued interest
      const principal = parseFloat(g.principalAmount || g.totalValue || "0");
      const interestRate = parseFloat(g.interestRate || "0") / 100;
      // Approximate accrued interest from grant date to now
      let accruedInterest = 0;
      if (isNote && interestRate > 0 && g.grantDate) {
        const grantDate = new Date(g.grantDate);
        const now = new Date();
        const yearsElapsed = (now.getTime() - grantDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        accruedInterest = principal * interestRate * yearsElapsed;
      }
      const investmentAmount = isNote ? principal + accruedInterest : principal;

      const valuationCap = parseFloat(g.valuationCap || "0");
      const discountRate = parseFloat(g.discountRate || "0") / 100;
      const isUncapped = valuationCap === 0;

      // Determine if this is a post-money SAFE (checked by certificate number prefix or notes)
      const certNum = g.certificateNumber || "";
      const notes = (g.notes || "").toLowerCase();
      const isPostMoney = notes.includes("post-money") || notes.includes("post money");

      // Calculate conversion price
      let capPrice = Infinity;
      if (!isUncapped) {
        if (isPostMoney) {
          // For post-money SAFEs, we need iterative solve; approximate:
          // cap price = cap / (pre-money shares + all SAFE shares)
          // We'll do a first-pass estimate
          capPrice = valuationCap / (preMoneyShares + (valuationCap / convRoundPrice));
        } else {
          // Pre-money: cap / pre-money shares
          capPrice = valuationCap / preMoneyShares;
        }
      }

      let discountPrice = Infinity;
      if (discountRate > 0) {
        discountPrice = convRoundPrice * (1 - discountRate);
      }

      // Conversion price = min(cap price, discount price, round price)
      let conversionPrice: number;
      if (isUncapped && discountRate === 0) {
        conversionPrice = convRoundPrice;
      } else if (isUncapped) {
        conversionPrice = Math.min(discountPrice, convRoundPrice);
      } else {
        conversionPrice = Math.min(capPrice, discountPrice, convRoundPrice);
      }

      const sharesIssued = investmentAmount / conversionPrice;

      return {
        id: g.id,
        investorName,
        type: isNote ? "Convertible Note" : "SAFE",
        investmentAmount,
        principal,
        accruedInterest,
        valuationCap,
        isUncapped,
        discountRate,
        isPostMoney,
        capPrice: isUncapped ? null : capPrice,
        discountPrice: discountRate > 0 ? discountPrice : null,
        conversionPrice,
        sharesIssued,
      };
    });

    // Post-money SAFE iterative correction
    // For post-money SAFEs, shares = investment / (cap / (preMoneyShares + totalSAFEShares))
    // This requires iteration since totalSAFEShares depends on all conversions
    // Do 5 iterations to converge
    for (let iter = 0; iter < 5; iter++) {
      const totalSafeShares = rows.reduce((s, r) => s + r.sharesIssued, 0);
      for (const row of rows) {
        if (row.isPostMoney && !row.isUncapped) {
          const adjustedCapPrice = row.valuationCap / (preMoneyShares + totalSafeShares);
          row.capPrice = adjustedCapPrice;
          const newConvPrice = Math.min(
            adjustedCapPrice,
            row.discountPrice ?? Infinity,
            convRoundPrice
          );
          row.conversionPrice = newConvPrice;
          row.sharesIssued = row.investmentAmount / newConvPrice;
        }
      }
    }

    const totalNewShares = rows.reduce((s, r) => s + r.sharesIssued, 0);
    const fullyDiluted = preMoneyShares + totalNewShares;
    const totalDilutionPct = (totalNewShares / fullyDiluted) * 100;
    const postMoneyVal = convPreMoneyVal + rows.reduce((s, r) => s + r.investmentAmount, 0);

    // Compute ownership percentages
    const rowsWithOwnership = rows.map((r) => ({
      ...r,
      ownershipPct: (r.sharesIssued / fullyDiluted) * 100,
    }));

    // Pre vs post comparison for existing shareholders
    // Group existing shares by stakeholder
    const existingByStakeholder: Record<number, { name: string; shares: number }> = {};
    for (const g of allGrants) {
      if (
        g.grantType === "safe" ||
        g.grantType === "convertible_note" ||
        g.status === "cancelled" ||
        g.status === "expired"
      )
        continue;
      const sid = (g as any).stakeholderId;
      if (!existingByStakeholder[sid]) {
        const sh = allStakeholders.find((s: any) => s.id === sid);
        existingByStakeholder[sid] = { name: sh?.name || `#${sid}`, shares: 0 };
      }
      existingByStakeholder[sid].shares += parseFloat((g as any).shares || "0");
    }

    const prePostComparison = Object.entries(existingByStakeholder)
      .map(([sid, data]) => ({
        stakeholderId: Number(sid),
        name: data.name,
        shares: data.shares,
        preOwnershipPct: (data.shares / preMoneyShares) * 100,
        postOwnershipPct: (data.shares / fullyDiluted) * 100,
        dilutionPct: ((data.shares / preMoneyShares) * 100) - ((data.shares / fullyDiluted) * 100),
      }))
      .sort((a, b) => b.shares - a.shares)
      .slice(0, 15); // Top 15

    return {
      rows: rowsWithOwnership,
      preMoneyShares,
      totalNewShares,
      fullyDiluted,
      totalDilutionPct,
      postMoneyVal,
      prePostComparison,
    };
  }, [grantsQuery.data, stakeholdersQuery.data, convPreMoneyVal, convRoundPrice]);

  const generateMutation = trpc.capTable.generateReport.useMutation({
    onSuccess: (data) => {
      setReportData(data);
      setShowParamsDialog(false);
      setShowResultDialog(true);
    },
    onError: (err) => {
      toast.error("Failed to generate report: " + err.message);
    },
  });

  const stakeholders = stakeholdersQuery.data ?? [];

  function handleGenerate(report: ReportType) {
    setSelectedReport(report);
    // If report needs parameters, show the params dialog first
    if (report.needsStakeholder || report.needsDateRange || report.needsExitVal) {
      setStakeholderId("");
      setStartDate("");
      setEndDate("");
      setExitValuation("");
      setShowParamsDialog(true);
    } else {
      // Generate directly
      generateMutation.mutate({ reportType: report.id });
    }
  }

  function submitWithParams() {
    if (!selectedReport) return;
    generateMutation.mutate({
      reportType: selectedReport.id,
      stakeholderId: stakeholderId ? parseInt(stakeholderId) : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      exitValuation: exitValuation || undefined,
    });
  }

  function handlePrint() {
    if (!printRef.current || !reportData) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${reportData.title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { font-size: 12px; color: #666; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
      </style></head><body>
      <h1>${reportData.title}</h1>
      <p>Generated: ${new Date(reportData.generatedAt).toLocaleString()}</p>
      <table>
        <thead><tr>${reportData.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${reportData.rows.map(r => `<tr>${r.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Equity Reports</h1>

      {/* ── 409A Valuation Section ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-base">409A Valuation</CardTitle>
          </div>
          <CardDescription className="text-sm">
            Current company valuation and FMV per share for equity pricing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Valuation Info */}
            <div className="space-y-4">
              {valuationsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading valuation data...
                </div>
              ) : currentValuation ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Valuation</p>
                      <p className="text-2xl font-bold text-primary">
                        {formatValuationCurrency(currentValuation.totalValuation)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">FMV Per Share</p>
                      <p className="text-2xl font-bold">
                        {formatFMV(currentValuation.fairMarketValue)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Valuation Date: </span>
                      <span className="font-medium">
                        {new Date(currentValuation.valuationDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expiration: </span>
                      <span className="font-medium">
                        {currentValuation.expirationDate
                          ? new Date(currentValuation.expirationDate).toLocaleDateString()
                          : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Provider: </span>
                      <span className="font-medium">{currentValuation.provider || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status: </span>
                      <Badge variant="secondary" className={`text-xs ${statusColor(currentValuation.status)}`}>
                        {currentValuation.status || "draft"}
                      </Badge>
                    </div>
                  </div>
                  {currentValuation.methodology && (
                    <p className="text-xs text-muted-foreground">
                      Methodology: {currentValuation.methodology}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground py-4">
                  No 409A valuation on file. Upload a valuation report to get started.
                </div>
              )}

              {/* Historical valuations */}
              {valuations.length > 1 && (
                <div className="border-t pt-3 mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Previous Valuations</p>
                  <div className="space-y-1">
                    {valuations.slice(1, 4).map((v: any) => (
                      <div key={v.id} className="flex items-center justify-between text-xs">
                        <span>{new Date(v.valuationDate).toLocaleDateString()}</span>
                        <span className="font-medium">{formatFMV(v.fairMarketValue)}/share</span>
                        <Badge variant="secondary" className={`text-xs ${statusColor(v.status)}`}>
                          {v.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Upload Area + Uploaded Documents */}
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-4 text-center space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Upload Valuation Report</p>
                <p className="text-xs text-muted-foreground">PDF, DOC, or XLSX up to 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  {isUploading ? "Uploading..." : "Choose File"}
                </Button>
              </div>

              {/* Uploaded docs list */}
              {valuationDocsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading documents...
                </div>
              ) : valuationDocs.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Uploaded Reports</p>
                  {valuationDocs.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 border rounded-md text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="truncate">{doc.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""}
                        </span>
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 text-blue-600" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No valuation reports uploaded yet
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SAFE & Convertible Conversion Model ──────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-base">SAFE &amp; Convertible Conversion Model</CardTitle>
          </div>
          <CardDescription className="text-sm">
            Model how SAFEs and convertible notes convert at a priced round. Adjust the pre-money valuation and round price to see dilution impact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {grantsQuery.isLoading || stakeholdersQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading cap table data...
            </div>
          ) : conversionModel.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No active SAFEs or convertible notes found in the cap table.
            </p>
          ) : (
            <>
              {/* Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Pre-Money Valuation</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[convPreMoneyVal]}
                      onValueChange={(v) => setConvPreMoneyVal(v[0])}
                      min={10_000_000}
                      max={500_000_000}
                      step={1_000_000}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono font-semibold w-20 text-right">
                      ${(convPreMoneyVal / 1_000_000).toFixed(0)}M
                    </span>
                  </div>
                  <Input
                    type="number"
                    value={convPreMoneyVal}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 10_000_000 && v <= 500_000_000) setConvPreMoneyVal(v);
                    }}
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Round Price Per Share</Label>
                  <Input
                    type="number"
                    value={convRoundPrice}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) setConvRoundPrice(v);
                    }}
                    step="0.01"
                    min="0.01"
                  />
                  <p className="text-xs text-muted-foreground">
                    Implied pre-money shares: {conversionModel.preMoneyShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              {/* Conversion Table */}
              <div className="border rounded-md overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs whitespace-nowrap">Investor</TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Investment</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Valuation Cap</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Discount</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Cap Price</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Discount Price</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Conversion Price</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Shares Issued</TableHead>
                      <TableHead className="text-xs whitespace-nowrap text-right">Ownership %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversionModel.rows.map((row) => (
                      <TableRow key={row.id} className="text-sm">
                        <TableCell className="py-1.5 font-medium text-xs">{row.investorName}</TableCell>
                        <TableCell className="py-1.5 text-xs">
                          <Badge variant="secondary" className="text-[10px]">
                            {row.type}{row.isPostMoney ? " (Post)" : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          ${row.investmentAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          {row.accruedInterest > 0 && (
                            <span className="block text-[10px] text-muted-foreground">
                              (${row.principal.toLocaleString(undefined, { maximumFractionDigits: 0 })} + ${row.accruedInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })} int.)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          {row.isUncapped ? (
                            <span className="text-muted-foreground italic">Uncapped</span>
                          ) : (
                            `$${(row.valuationCap / 1_000_000).toFixed(0)}M`
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          {row.discountRate > 0 ? `${(row.discountRate * 100).toFixed(0)}%` : "-"}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          {row.capPrice != null ? `$${row.capPrice.toFixed(4)}` : "-"}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          {row.discountPrice != null ? `$${row.discountPrice.toFixed(4)}` : "-"}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono font-semibold">
                          ${row.conversionPrice.toFixed(4)}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          {row.sharesIssued.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-mono">
                          {row.ownershipPct.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Summary Row */}
                    <TableRow className="bg-muted/50 font-semibold border-t-2">
                      <TableCell className="py-2 text-xs" colSpan={2}>TOTALS</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono">
                        ${conversionModel.rows.reduce((s, r) => s + r.investmentAmount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell colSpan={5} />
                      <TableCell className="py-2 text-xs text-right font-mono">
                        {conversionModel.totalNewShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono">
                        {conversionModel.totalDilutionPct.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">New Shares Issued</p>
                  <p className="text-lg font-bold">{conversionModel.totalNewShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Total Dilution</p>
                  <p className="text-lg font-bold text-red-600">{conversionModel.totalDilutionPct.toFixed(2)}%</p>
                </div>
                <div className="border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Post-Money Valuation</p>
                  <p className="text-lg font-bold">${(conversionModel.postMoneyVal / 1_000_000).toFixed(1)}M</p>
                </div>
                <div className="border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Fully Diluted Shares</p>
                  <p className="text-lg font-bold">{conversionModel.fullyDiluted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
              </div>

              {/* Pre vs Post Comparison */}
              {conversionModel.prePostComparison.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Pre vs Post Conversion Ownership</h3>
                  <div className="border rounded-md overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Shareholder</TableHead>
                          <TableHead className="text-xs text-right">Shares</TableHead>
                          <TableHead className="text-xs text-right">Pre-Conversion %</TableHead>
                          <TableHead className="text-xs text-right">Post-Conversion %</TableHead>
                          <TableHead className="text-xs text-right">Dilution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversionModel.prePostComparison.map((row) => (
                          <TableRow key={row.stakeholderId} className="text-sm">
                            <TableCell className="py-1.5 text-xs font-medium">{row.name}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">
                              {row.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">
                              {row.preOwnershipPct.toFixed(2)}%
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono">
                              {row.postOwnershipPct.toFixed(2)}%
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-mono text-red-600">
                              -{row.dilutionPct.toFixed(2)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Reports Table ─────────────────────────────────────── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Description</TableHead>
            <TableHead className="text-xs text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reportTypes.map((report) => (
            <TableRow key={report.id} className="text-sm">
              <TableCell className="font-medium py-1.5 text-sm">{report.name}</TableCell>
              <TableCell className="text-muted-foreground py-1.5 text-xs">{report.description}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => handleGenerate(report)}
                      disabled={generateMutation.isPending}
                    >
                      {generateMutation.isPending && selectedReport?.id === report.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-1" />
                      )}
                      Generate Report
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

      {/* Parameters Dialog */}
      <Dialog open={showParamsDialog} onOpenChange={setShowParamsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Parameters</DialogTitle>
            <DialogDescription>
              Configure parameters for: {selectedReport?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedReport?.needsStakeholder && (
              <div className="space-y-2">
                <Label>Stakeholder (optional)</Label>
                <Select value={stakeholderId} onValueChange={setStakeholderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All stakeholders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stakeholders</SelectItem>
                    {stakeholders.map((s: any) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name} ({s.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedReport?.needsDateRange && (
              <>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
            {selectedReport?.needsExitVal && (
              <div className="space-y-2">
                <Label>Exit Valuation ($)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50000000"
                  value={exitValuation}
                  onChange={(e) => setExitValuation(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowParamsDialog(false)}>Cancel</Button>
            <Button onClick={submitWithParams} disabled={generateMutation.isPending}>
              {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{reportData?.title}</DialogTitle>
            <DialogDescription>
              Generated: {reportData ? new Date(reportData.generatedAt).toLocaleString() : ""} | {reportData?.rows.length ?? 0} rows
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md" ref={printRef}>
            {reportData && (
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportData.headers.map((h, i) => (
                      <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={reportData.headers.length} className="text-center text-muted-foreground py-8">
                        No data found for this report.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.rows.map((row, ri) => (
                      <TableRow key={ri} className={ri === reportData.rows.length - 1 && row[0] === "TOTAL" ? "font-semibold bg-muted/50" : ""}>
                        {row.map((cell: any, ci: number) => (
                          <TableCell key={ci} className="whitespace-nowrap">{cell ?? "-"}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button variant="outline" onClick={() => reportData && downloadCSV(reportData)}>
              <Download className="h-4 w-4 mr-1" />
              Download CSV
            </Button>
            <Button onClick={() => setShowResultDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
