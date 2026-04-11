import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Badge } from "../../components/ui/badge";
import {
  CalendarIcon,
  Download,
  FileText,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

const reportTypes = [
  { id: "profit_loss", name: "Profit & Loss (Income Statement)", description: "Revenue, expenses, and net income for a period" },
  { id: "balance_sheet", name: "Balance Sheet", description: "Assets, liabilities, and equity at a point in time" },
  { id: "cash_flow", name: "Cash Flow Statement", description: "Cash inflows and outflows by operating, investing, and financing" },
  { id: "runway", name: "Runway & Burn Rate", description: "Monthly burn rate and months of runway remaining" },
  { id: "revenue_by_customer", name: "Revenue by Customer", description: "Revenue breakdown by customer" },
  { id: "revenue_by_product", name: "Revenue by Product", description: "Revenue breakdown by product/SKU" },
  { id: "expense_by_category", name: "Expenses by Category", description: "Expense breakdown by account category" },
  { id: "expense_by_vendor", name: "Expenses by Vendor", description: "Spending breakdown by vendor" },
  { id: "accounts_receivable", name: "Accounts Receivable Aging", description: "Outstanding invoices by age (current, 30, 60, 90+ days)" },
  { id: "accounts_payable", name: "Accounts Payable Aging", description: "Outstanding bills by age" },
  { id: "cogs_summary", name: "Cost of Goods Sold", description: "COGS breakdown by product, period, and method" },
  { id: "inventory_valuation", name: "Inventory Valuation", description: "Current inventory value by product and location" },
  { id: "tax_summary", name: "Tax Summary", description: "Revenue, deductible expenses, and estimated tax liability" },
  { id: "monthly_summary", name: "Monthly Financial Summary", description: "Month-over-month revenue, expenses, and key metrics" },
];

type ReportRow = {
  label: string;
  amount: number | string | null;
  type: string;
  pct?: string;
  count?: number;
  quantity?: number | null;
  unitCost?: number | null;
  revenue?: number;
  expenses?: number;
  cumulative?: number;
};

type ReportData = {
  title: string;
  headers: string[];
  rows: ReportRow[];
  generatedAt: string;
  summary: string;
};

function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return formatCurrency(value);
}

function downloadCSV(report: ReportData) {
  const lines: string[] = [report.headers.join(",")];
  for (const row of report.rows) {
    const cells: string[] = [
      `"${row.label}"`,
      typeof row.amount === "number" ? row.amount.toFixed(2) : (row.amount ?? ""),
    ];
    if (row.pct !== undefined) cells.push(row.pct);
    if (row.count !== undefined) cells.push(String(row.count));
    if (row.quantity !== undefined && row.quantity !== null) cells.push(String(row.quantity));
    if (row.unitCost !== undefined && row.unitCost !== null) cells.push(String(row.unitCost));
    if (row.revenue !== undefined) cells.push(row.revenue.toFixed(2));
    if (row.expenses !== undefined) cells.push(row.expenses.toFixed(2));
    if (row.cumulative !== undefined) cells.push(row.cumulative.toFixed(2));
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPDF(report: ReportData) {
  // Simple text-based PDF-like content for download
  const content = [
    report.title,
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    "",
    report.headers.join(" | "),
    "-".repeat(60),
    ...report.rows.map((row) => {
      const parts = [row.label, formatAmount(row.amount)];
      if (row.pct) parts.push(row.pct);
      if (row.count !== undefined) parts.push(`${row.count} items`);
      return parts.join(" | ");
    }),
    "",
    `Summary: ${report.summary}`,
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinancialReports() {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  });
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const generateMutation = (trpc as any).financialReports.generate.useMutation({
    onSuccess: (data: any) => {
      setReportData(data as ReportData);
      setAiAnalysis(null);
    },
  });

  const aiMutation = (trpc as any).financialReports.aiAnalysis.useMutation({
    onSuccess: (data: any) => {
      setAiAnalysis(data.analysis);
    },
  });

  const autoCategorize = (trpc as any).financialReports.autoCategorize.useMutation();

  const handleGenerate = (reportId: string) => {
    setSelectedReport(reportId);
    setExpandedReport(reportId);
    generateMutation.mutate({
      reportType: reportId,
      startDate: dateRange.from?.toISOString(),
      endDate: dateRange.to?.toISOString(),
    });
  };

  const handleAiAnalysis = () => {
    if (!reportData || !selectedReport) return;
    aiMutation.mutate({
      reportType: selectedReport,
      reportData: JSON.stringify(reportData.rows),
    });
  };

  const renderReportTable = (report: ReportData) => {
    const hasExtraColumns =
      report.rows.some((r) => r.pct !== undefined) ||
      report.rows.some((r) => r.count !== undefined) ||
      report.rows.some((r) => r.quantity !== undefined) ||
      report.rows.some((r) => r.revenue !== undefined);

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">{report.headers[0]}</TableHead>
            {report.rows.some((r) => r.revenue !== undefined) && (
              <TableHead className="text-right">Revenue</TableHead>
            )}
            {report.rows.some((r) => r.expenses !== undefined) && (
              <TableHead className="text-right">Expenses</TableHead>
            )}
            {report.rows.some((r) => r.quantity !== undefined) && (
              <TableHead className="text-right">Quantity</TableHead>
            )}
            {report.rows.some((r) => r.unitCost !== undefined) && (
              <TableHead className="text-right">Unit Cost</TableHead>
            )}
            <TableHead className="text-right">
              {report.headers[1] || "Amount"}
            </TableHead>
            {report.rows.some((r) => r.pct !== undefined) && (
              <TableHead className="text-right">% of Total</TableHead>
            )}
            {report.rows.some((r) => r.count !== undefined) && (
              <TableHead className="text-right">Count</TableHead>
            )}
            {report.rows.some((r) => r.cumulative !== undefined) && (
              <TableHead className="text-right">Cumulative</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.map((row, idx) => (
            <TableRow
              key={idx}
              className={
                row.type === "header"
                  ? "bg-muted/60 font-semibold"
                  : row.type === "total"
                    ? "bg-muted/40 font-bold border-t-2"
                    : row.type === "subtotal"
                      ? "font-semibold border-t"
                      : ""
              }
            >
              <TableCell
                className={
                  row.type === "header"
                    ? "font-semibold text-primary"
                    : row.type === "total"
                      ? "font-bold"
                      : row.type === "subtotal"
                        ? "font-semibold"
                        : ""
                }
              >
                {row.label}
              </TableCell>
              {report.rows.some((r) => r.revenue !== undefined) && (
                <TableCell className="text-right">
                  {row.revenue !== undefined ? formatCurrency(row.revenue) : ""}
                </TableCell>
              )}
              {report.rows.some((r) => r.expenses !== undefined) && (
                <TableCell className="text-right">
                  {row.expenses !== undefined ? formatCurrency(row.expenses) : ""}
                </TableCell>
              )}
              {report.rows.some((r) => r.quantity !== undefined) && (
                <TableCell className="text-right">
                  {row.quantity !== null && row.quantity !== undefined
                    ? Number(row.quantity).toFixed(0)
                    : ""}
                </TableCell>
              )}
              {report.rows.some((r) => r.unitCost !== undefined) && (
                <TableCell className="text-right">
                  {row.unitCost !== null && row.unitCost !== undefined
                    ? formatCurrency(row.unitCost)
                    : ""}
                </TableCell>
              )}
              <TableCell
                className={`text-right ${
                  typeof row.amount === "number" && row.amount < 0
                    ? "text-red-600"
                    : ""
                }`}
              >
                {formatAmount(row.amount)}
              </TableCell>
              {report.rows.some((r) => r.pct !== undefined) && (
                <TableCell className="text-right text-muted-foreground">
                  {row.pct || ""}
                </TableCell>
              )}
              {report.rows.some((r) => r.count !== undefined) && (
                <TableCell className="text-right">
                  {row.count !== undefined ? row.count : ""}
                </TableCell>
              )}
              {report.rows.some((r) => r.cumulative !== undefined) && (
                <TableCell className="text-right">
                  {row.cumulative !== undefined
                    ? formatCurrency(row.cumulative)
                    : ""}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold">Financial Reports</h1>
          <p className="text-muted-foreground text-sm">
            Generate comprehensive financial reports for your startup
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => autoCategorize.mutate()}
            disabled={autoCategorize.isPending}
          >
            {autoCategorize.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Auto-Categorize Transactions
          </Button>
        </div>
      </div>

      {/* Auto-Categorize result */}
      {autoCategorize.data && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CardContent className="pt-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              Auto-categorization complete: {autoCategorize.data.categorized} of{" "}
              {autoCategorize.data.total} transactions categorized.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Date Range Picker */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Report Period:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from && dateRange.to
                    ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
                    : "Select date range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{
                    from: dateRange.from,
                    to: dateRange.to,
                  }}
                  onSelect={(range) => {
                    if (range) {
                      setDateRange({ from: range.from, to: range.to });
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            {/* Quick presets */}
            <div className="flex gap-1">
              {[
                { label: "This Month", fn: () => { const now = new Date(); setDateRange({ from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }); } },
                { label: "This Quarter", fn: () => { const now = new Date(); const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); setDateRange({ from: qStart, to: now }); } },
                { label: "YTD", fn: () => { setDateRange({ from: new Date(new Date().getFullYear(), 0, 1), to: new Date() }); } },
                { label: "Last Year", fn: () => { const y = new Date().getFullYear() - 1; setDateRange({ from: new Date(y, 0, 1), to: new Date(y, 11, 31) }); } },
              ].map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  onClick={preset.fn}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report List */}
      <div className="space-y-3">
        {reportTypes.map((report) => {
          const isExpanded = expandedReport === report.id;
          const isActive = selectedReport === report.id;
          const isLoading = generateMutation.isPending && selectedReport === report.id;

          return (
            <Card key={report.id} className={isActive && reportData ? "border-primary/50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  >
                    <div className="p-2 rounded-md bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{report.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {report.description}
                      </CardDescription>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground ml-auto" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
                    )}
                  </div>
                  <Button
                    className="ml-4"
                    size="sm"
                    onClick={() => handleGenerate(report.id)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <BarChart3 className="mr-2 h-4 w-4" />
                    )}
                    Generate
                  </Button>
                </div>
              </CardHeader>

              {/* Report results */}
              {isExpanded && isActive && reportData && (
                <CardContent className="pt-0 space-y-4">
                  {/* Summary badge */}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      Generated {new Date(reportData.generatedAt).toLocaleString()}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadCSV(reportData)}
                      >
                        <Download className="mr-1 h-3 w-3" />
                        CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPDF(reportData)}
                      >
                        <Download className="mr-1 h-3 w-3" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAiAnalysis}
                        disabled={aiMutation.isPending}
                      >
                        {aiMutation.isPending ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1 h-3 w-3" />
                        )}
                        AI Analysis
                      </Button>
                    </div>
                  </div>

                  {/* Summary line */}
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                    {reportData.summary}
                  </p>

                  {/* Table */}
                  <div className="border rounded-md overflow-hidden">
                    {renderReportTable(reportData)}
                  </div>

                  {/* AI Analysis */}
                  {aiAnalysis && (
                    <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-blue-600" />
                          AI Financial Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                          {aiAnalysis}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              )}

              {/* Loading state when expanded */}
              {isExpanded && isLoading && (
                <CardContent className="pt-0">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">
                      Generating report...
                    </span>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
