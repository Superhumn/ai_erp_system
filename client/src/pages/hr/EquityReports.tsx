import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FileBarChart, Download, Printer, Loader2, Play } from "lucide-react";
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

export default function EquityReports() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [showParamsDialog, setShowParamsDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  // Parameters
  const [stakeholderId, setStakeholderId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exitValuation, setExitValuation] = useState("");

  const printRef = useRef<HTMLDivElement>(null);

  const stakeholdersQuery = trpc.capTable.stakeholders.list.useQuery();
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
    <div className="p-4 space-y-2">
      <h1 className="text-lg font-semibold">Equity Reports</h1>
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
        </CardContent>
      </Card>

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
