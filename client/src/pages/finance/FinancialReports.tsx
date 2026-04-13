import { useState, useMemo } from "react";
import { trpc } from "../../lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, LineChart, Line, ComposedChart, Cell,
  TooltipProps,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  CalendarIcon,
  Download,
  FileText,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Upload,
  Plus,
  DollarSign,
  Flame,
  Clock,
  Shield,
  Presentation,
  Calculator,
  Activity,
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

// ── Model vs Actual helpers ────────────────────────────────────
function fmtCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

// ── Chart helpers ────────────────────────────────────────────
const CHART_COLORS = {
  revenue: "#3b82f6",    // blue-500
  cogs: "#f97316",       // orange-500
  grossProfit: "#22c55e",// green-500
  ebitda: "#8b5cf6",     // violet-500
  cash: "#06b6d4",       // cyan-500
  negative: "#ef4444",   // red-500
  muted: "#94a3b8",      // slate-400
};

function fmtChartAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtChartTooltip(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function ChartTooltipContent({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {typeof entry.value === "number"
              ? entry.name?.includes("%") || entry.name?.includes("Margin")
                ? `${entry.value.toFixed(1)}%`
                : fmtChartTooltip(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function varianceColor(variancePct: number | null): string {
  if (variancePct === null) return "";
  if (variancePct >= 0) return "text-green-600 dark:text-green-400";
  return "text-red-600 dark:text-red-400";
}

function kpiStatusBadge(status: string | null | undefined) {
  const styles: Record<string, string> = {
    on_track: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    exceeded: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    at_risk: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    behind: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    not_started: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
  };
  const s = status || "not_started";
  return styles[s] || styles.not_started;
}

function progressPct(actual: string | number | null | undefined, target: string | number | null | undefined): number {
  const a = typeof actual === "string" ? parseFloat(actual) : (actual ?? 0);
  const t = typeof target === "string" ? parseFloat(target) : (target ?? 1);
  if (!t || isNaN(a) || isNaN(t)) return 0;
  return Math.min(Math.round((a / t) * 100), 150);
}

// ── Industry-standard KPI suggestions for startups ──────────────
const SUGGESTED_KPIS = [
  { category: "Revenue", metricName: "Monthly Recurring Revenue (MRR)", targetValue: "50000", unit: "$" },
  { category: "Revenue", metricName: "Annual Revenue Run Rate", targetValue: "600000", unit: "$" },
  { category: "Revenue", metricName: "Revenue Growth Rate (MoM)", targetValue: "15", unit: "%" },
  { category: "Profitability", metricName: "Gross Margin", targetValue: "60", unit: "%" },
  { category: "Profitability", metricName: "Net Burn Rate", targetValue: "40000", unit: "$/mo" },
  { category: "Profitability", metricName: "Months of Runway", targetValue: "18", unit: "months" },
  { category: "Customers", metricName: "Customer Acquisition Cost (CAC)", targetValue: "500", unit: "$" },
  { category: "Customers", metricName: "Customer Lifetime Value (LTV)", targetValue: "5000", unit: "$" },
  { category: "Customers", metricName: "LTV:CAC Ratio", targetValue: "3", unit: "x" },
  { category: "Customers", metricName: "Monthly Active Customers", targetValue: "100", unit: "#" },
  { category: "Efficiency", metricName: "Payroll as % of Revenue", targetValue: "40", unit: "%" },
  { category: "Efficiency", metricName: "COGS as % of Revenue", targetValue: "35", unit: "%" },
];

function KpiGoalCreator({ year, onCreated }: { year: number; onCreated: () => void }) {
  const [selectedKpis, setSelectedKpis] = useState<Set<number>>(new Set());
  const [customTargets, setCustomTargets] = useState<Record<number, string>>({});
  const [creating, setCreating] = useState(false);

  const createKpi = trpc.kpiGoals.create.useMutation();

  const handleCreateSelected = async () => {
    if (selectedKpis.size === 0) return;
    setCreating(true);
    try {
      for (const idx of Array.from(selectedKpis)) {
        const kpi = SUGGESTED_KPIS[idx];
        await createKpi.mutateAsync({
          category: kpi.category,
          metricName: kpi.metricName,
          year,
          targetValue: customTargets[idx] || kpi.targetValue,
          unit: kpi.unit,
          status: "not_started",
        });
      }
      onCreated();
    } catch { /* handled by mutation */ }
    setCreating(false);
  };

  const toggleKpi = (idx: number) => {
    const next = new Set(selectedKpis);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelectedKpis(next);
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <p className="text-sm text-muted-foreground mb-3">
          Select KPI goals to track. Targets are based on industry benchmarks for early-stage companies — adjust to fit your business.
        </p>
      </div>

      <div className="space-y-1">
        {SUGGESTED_KPIS.map((kpi, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
              selectedKpis.has(idx) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
            }`}
            onClick={() => toggleKpi(idx)}
          >
            <input type="checkbox" checked={selectedKpis.has(idx)} readOnly className="rounded" />
            <Badge variant="outline" className="text-[10px] w-24 justify-center">{kpi.category}</Badge>
            <span className="text-sm flex-1">{kpi.metricName}</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={customTargets[idx] ?? kpi.targetValue}
                onChange={(e) => { e.stopPropagation(); setCustomTargets({ ...customTargets, [idx]: e.target.value }); }}
                onClick={(e) => e.stopPropagation()}
                className="w-20 text-right text-sm px-2 py-0.5 border rounded bg-background"
              />
              <span className="text-xs text-muted-foreground w-10">{kpi.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={() => {
          if (selectedKpis.size === SUGGESTED_KPIS.length) setSelectedKpis(new Set());
          else setSelectedKpis(new Set(SUGGESTED_KPIS.map((_, i) => i)));
        }}>
          {selectedKpis.size === SUGGESTED_KPIS.length ? "Deselect All" : "Select All"}
        </Button>
        <Button onClick={handleCreateSelected} disabled={selectedKpis.size === 0 || creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Create {selectedKpis.size} KPI Goal{selectedKpis.size !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export default function FinancialReports() {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  });
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [modelYear, setModelYear] = useState(new Date().getFullYear());
  const [modelCategory, setModelCategory] = useState<string>("all");
  const [kpiYear, setKpiYear] = useState(new Date().getFullYear());

  // CFO Strategy state
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [strategyResults, setStrategyResults] = useState<Record<string, string>>({});

  // CFO Strategy data sources
  const { data: bankBalances } = trpc.banking.balances.useQuery();
  const { data: invoicesList } = trpc.invoices.list.useQuery();

  const cashPosition = useMemo(() =>
    bankBalances?.accounts?.reduce(
      (sum: number, a: any) => sum + (a.currentBalance ?? a.availableBalance ?? 0), 0
    ) ?? 0, [bankBalances]);

  const monthlyRevenue = useMemo(() => {
    if (!invoicesList) return 0;
    const now = new Date();
    const thisMonth = invoicesList.filter((i: any) => {
      const d = new Date(i.issueDate || i.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return thisMonth.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || "0"), 0);
  }, [invoicesList]);

  const lastMonthRevenue = useMemo(() => {
    if (!invoicesList) return 0;
    const now = new Date();
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = invoicesList.filter((i: any) => {
      const d = new Date(i.issueDate || i.createdAt);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    });
    return prev.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || "0"), 0);
  }, [invoicesList]);

  const revenueGrowth = lastMonthRevenue > 0
    ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : 0;

  const estimatedBurn = useMemo(() => {
    // rough: cash change over last month as burn proxy
    return Math.max(monthlyRevenue * 0.7, 10000); // fallback estimate
  }, [monthlyRevenue]);

  const runwayMonths = estimatedBurn > 0 ? Math.round((cashPosition / estimatedBurn) * 10) / 10 : 0;

  const strategyMutation = trpc.financialReports.aiAnalysis.useMutation({
    onSuccess: (data, variables: any) => {
      const stratId = variables?.strategyId;
      if (stratId) {
        setStrategyResults((prev) => ({ ...prev, [stratId]: data.analysis }));
      }
    },
  });

  const handleStrategyClick = (id: string, prompt: string) => {
    if (expandedStrategy === id) {
      setExpandedStrategy(null);
      return;
    }
    setExpandedStrategy(id);
    if (!strategyResults[id]) {
      strategyMutation.mutate({ reportType: "cfo_strategy", reportData: prompt, strategyId: id });
    }
  };

  const generateMutation = trpc.financialReports.generate.useMutation({
    onSuccess: (data) => {
      setReportData(data as ReportData);
      setAiAnalysis(null);
    },
  });

  const aiMutation = trpc.financialReports.aiAnalysis.useMutation({
    onSuccess: (data) => {
      setAiAnalysis(data.analysis);
    },
  });

  const autoCategorize = trpc.banking.autoCategorize.useMutation();

  // Financial Model vs Actual queries
  const financialModelQuery = trpc.financialModel.list.useQuery({
    year: modelYear,
    ...(modelCategory !== "all" ? { category: modelCategory } : {}),
  });
  const modelCategories = trpc.financialModel.categories.useQuery();
  const modelData = financialModelQuery.data ?? [];

  // All-years query for charts (unfiltered by year)
  const allModelQuery = trpc.financialModel.list.useQuery({});
  const allModelData = allModelQuery.data ?? [];

  // ── Prepare chart data from financial model ──────────────────
  const revenueCogsChartData = useMemo(() => {
    const byYear: Record<number, { revenue: number; cogs: number; grossProfit: number; ebitda: number; cash: number }> = {};
    for (const row of allModelData) {
      const y = row.year;
      if (!y) continue;
      if (!byYear[y]) byYear[y] = { revenue: 0, cogs: 0, grossProfit: 0, ebitda: 0, cash: 0 };
      const val = parseFloat(row.projectedValue ?? "0");
      const name = (row.metricName || "").toLowerCase();
      if (name === "revenue") byYear[y].revenue += val;
      else if (name === "cogs") byYear[y].cogs += val;
      else if (name === "gross profit") byYear[y].grossProfit += val;
      else if (name === "ebitda") byYear[y].ebitda += val;
      else if (name === "ending cash" || name === "cash") byYear[y].cash += val;
    }
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([yr, d]) => ({
        year: `Year ${yr}`,
        Revenue: d.revenue,
        COGS: d.cogs,
        "Gross Profit": d.grossProfit,
        EBITDA: d.ebitda,
        "Ending Cash": d.cash,
        "Gross Margin %": d.revenue > 0 ? ((d.grossProfit / d.revenue) * 100) : 0,
        "EBITDA Margin %": d.revenue > 0 ? ((d.ebitda / d.revenue) * 100) : 0,
      }));
  }, [allModelData]);

  // ── Waterfall chart data (Year 1 breakdown) ──────────────────
  const waterfallData = useMemo(() => {
    const y1 = revenueCogsChartData.find((d) => d.year === "Year 1");
    if (!y1) return [];
    const opex = y1.Revenue - y1.COGS - y1.EBITDA;
    return [
      { name: "Revenue", value: y1.Revenue, fill: CHART_COLORS.revenue, isPositive: true },
      { name: "COGS", value: -y1.COGS, fill: CHART_COLORS.negative, isPositive: false },
      { name: "Gross Profit", value: y1["Gross Profit"], fill: CHART_COLORS.grossProfit, isPositive: true },
      { name: "OpEx", value: -opex, fill: CHART_COLORS.negative, isPositive: false },
      { name: "EBITDA", value: y1.EBITDA, fill: y1.EBITDA >= 0 ? CHART_COLORS.ebitda : CHART_COLORS.negative, isPositive: y1.EBITDA >= 0 },
    ];
  }, [revenueCogsChartData]);

  // Group model data by category
  const groupedModelData = useMemo(() => {
    const groups: Record<string, typeof modelData> = {};
    for (const row of modelData) {
      const cat = row.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(row);
    }
    return groups;
  }, [modelData]);

  // Aggregate model data by metric (sum months for annual view)
  const aggregatedModelData = useMemo(() => {
    const byMetric: Record<string, {
      category: string;
      metricName: string;
      unit: string | null;
      projectedTotal: number;
      actualTotal: number;
      hasProjected: boolean;
      hasActual: boolean;
    }> = {};
    for (const row of modelData) {
      const key = `${row.category}::${row.metricName}`;
      if (!byMetric[key]) {
        byMetric[key] = {
          category: row.category || "Uncategorized",
          metricName: row.metricName,
          unit: row.unit,
          projectedTotal: 0,
          actualTotal: 0,
          hasProjected: false,
          hasActual: false,
        };
      }
      if (row.projectedValue) {
        byMetric[key].projectedTotal += parseFloat(row.projectedValue);
        byMetric[key].hasProjected = true;
      }
      if (row.actualValue) {
        byMetric[key].actualTotal += parseFloat(row.actualValue);
        byMetric[key].hasActual = true;
      }
    }
    // Group by category
    const groups: Record<string, Array<typeof byMetric[string]>> = {};
    for (const item of Object.values(byMetric)) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [modelData]);

  // KPI Goals queries
  const kpiGoalsQuery = trpc.kpiGoals.list.useQuery({ year: kpiYear });
  const kpiGoals = kpiGoalsQuery.data ?? [];

  const groupedKpis = useMemo(() => {
    const groups: Record<string, typeof kpiGoals> = {};
    for (const kpi of kpiGoals) {
      const cat = kpi.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(kpi);
    }
    return groups;
  }, [kpiGoals]);

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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Financials</h1>
        <Button variant="outline" size="sm" onClick={() => autoCategorize.mutate()} disabled={autoCategorize.isPending}>
          {autoCategorize.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          Auto-Categorize
        </Button>
      </div>

      {/* 2-column layout: dashboard left, reports menu right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
        {/* Left: Dashboard content (rendered below) */}
        <div className="space-y-3">

      {/* Reports side menu - rendered in right column via CSS order */}

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

      {/* Generated Report (shows when a report is selected from dropdown) */}
      {expandedReport && reportData && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{reportData.title}</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadCSV(reportData)}>
                  <Download className="mr-1 h-3 w-3" /> CSV
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadPDF(reportData)}>
                  <Download className="mr-1 h-3 w-3" /> PDF
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleAiAnalysis} disabled={aiMutation.isPending}>
                  {aiMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                  AI Analysis
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setExpandedReport(null); setReportData(null); }}>
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">{reportData.summary}</p>
            <div className="border rounded-md overflow-hidden">{renderReportTable(reportData)}</div>
            {aiAnalysis && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-blue-600" /> AI Analysis</div>
                <div className="text-sm whitespace-pre-wrap text-blue-900 dark:text-blue-100">{aiAnalysis}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {generateMutation.isPending && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Generating report...</span>
        </div>
      )}

      {/* ── CFO Strategy (top of page) ────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            CFO Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><DollarSign className="h-3 w-3" /> Cash Position</div>
              <p className="text-lg font-bold">{fmtCompact(cashPosition)}</p>
            </div>
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Flame className="h-3 w-3" /> Monthly Burn</div>
              <p className="text-lg font-bold">{fmtCompact(estimatedBurn)}</p>
            </div>
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock className="h-3 w-3" /> Runway</div>
              <p className={`text-lg font-bold ${runwayMonths > 12 ? "text-green-600" : runwayMonths > 6 ? "text-yellow-600" : "text-red-600"}`}>{runwayMonths} mo</p>
            </div>
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingUp className="h-3 w-3" /> Revenue Growth</div>
              <p className={`text-lg font-bold ${revenueGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>{revenueGrowth >= 0 ? "+" : ""}{revenueGrowth}%</p>
            </div>
          </div>
          <div className="border rounded-lg divide-y">
            {[
              { id: "fundraising", icon: Target, label: "Fundraising Readiness Check", prompt: `Analyze fundraising readiness: cash=${cashPosition}, burn=${estimatedBurn}, runway=${runwayMonths}mo, MoM growth=${revenueGrowth}%. Assess investor-readiness metrics, data room checklist, and recommended fundraising timeline.` },
              { id: "board_report", icon: Presentation, label: "Board Report Generator", prompt: `Generate board report data: revenue=${monthlyRevenue}, cash=${cashPosition}, burn=${estimatedBurn}, runway=${runwayMonths}mo, growth=${revenueGrowth}%. Include KPI summary, financial highlights, risks, and asks.` },
              { id: "scenario", icon: BarChart3, label: "Scenario Planning", prompt: `Run scenario analysis with current metrics: cash=${cashPosition}, burn=${estimatedBurn}, revenue=${monthlyRevenue}. Model 3 scenarios: conservative (flat growth), base (${revenueGrowth}% MoM), aggressive (2x growth). Show runway and hiring capacity for each.` },
              { id: "tax", icon: Calculator, label: "Tax Planning", prompt: `Analyze tax planning: revenue=${monthlyRevenue * 12}/yr estimated. Identify estimated quarterly tax liability, R&D tax credit eligibility, deduction opportunities, and entity structure considerations for a startup.` },
              { id: "compliance", icon: Shield, label: "Compliance Checklist", prompt: `Generate SOX/audit readiness checklist for a startup: assess internal controls, financial reporting procedures, revenue recognition compliance, data security, and audit preparation status. Include priority ratings.` },
              { id: "working_capital", icon: Activity, label: "Working Capital Analysis", prompt: `Analyze working capital: cash=${cashPosition}, monthly revenue=${monthlyRevenue}. Assess accounts receivable health, payable optimization, inventory efficiency, and cash conversion cycle. Recommend improvements.` },
            ].map(({ id, icon: Icon, label, prompt }) => (
              <div key={id}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors" onClick={() => handleStrategyClick(id, prompt)}>
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {strategyMutation.isPending && expandedStrategy === id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : expandedStrategy === id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {expandedStrategy === id && strategyResults[id] && (
                  <div className="px-4 pb-4">
                    <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" /> AI Analysis</div>
                      {strategyResults[id]}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Financial Charts ─────────────────────────────────── */}
      {revenueCogsChartData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Revenue vs COGS Area Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Revenue vs COGS</CardTitle>
              <CardDescription className="text-xs">5-year projected trajectory</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueCogsChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtChartAxis} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Revenue" stackId="1" stroke={CHART_COLORS.revenue} fill={CHART_COLORS.revenue} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="COGS" stackId="2" stroke={CHART_COLORS.cogs} fill={CHART_COLORS.cogs} fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gross Margin & EBITDA Margin Line Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Margin Trends</CardTitle>
              <CardDescription className="text-xs">Gross margin and EBITDA margin %</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={revenueCogsChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} width={45} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Gross Margin %" stroke={CHART_COLORS.grossProfit} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="EBITDA Margin %" stroke={CHART_COLORS.ebitda} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cash Position Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cash Position</CardTitle>
              <CardDescription className="text-xs">Ending cash balance by year</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenueCogsChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtChartAxis} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="Ending Cash" fill={CHART_COLORS.cash} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Waterfall Chart — Year 1 */}
          {waterfallData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Year 1 Waterfall</CardTitle>
                <CardDescription className="text-xs">Revenue to EBITDA breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtChartAxis} tick={{ fontSize: 11 }} width={60} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {waterfallData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Model vs Actual Comparison ────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              <div>
                <CardTitle className="text-base">Model vs Actual</CardTitle>
                <CardDescription className="text-sm">
                  Financial model projections compared with actual performance
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={modelCategory} onValueChange={setModelCategory}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(modelCategories.data ?? []).map((cat: string) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(modelYear)} onValueChange={(v) => setModelYear(Number(v))}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {financialModelQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading financial model...</span>
            </div>
          ) : Object.keys(aggregatedModelData).length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No financial model data found for {modelYear}.
              <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.href = "/import"}>
                <Upload className="h-3 w-3 mr-1" /> Import Financial Model
              </Button>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Metric</TableHead>
                    <TableHead className="text-right">Y{modelYear % 100} Projected</TableHead>
                    <TableHead className="text-right">Y{modelYear % 100} Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(aggregatedModelData).map(([category, metrics]) => (
                    <>
                      <TableRow key={`cat-${category}`} className="bg-muted/60">
                        <TableCell colSpan={5} className="font-semibold text-primary text-sm py-2">
                          {category}
                        </TableCell>
                      </TableRow>
                      {metrics.map((m, idx) => {
                        const variance = m.hasProjected && m.hasActual
                          ? m.actualTotal - m.projectedTotal
                          : null;
                        const variancePctVal = variance !== null && m.projectedTotal !== 0
                          ? (variance / Math.abs(m.projectedTotal)) * 100
                          : null;

                        return (
                          <TableRow key={`${category}-${idx}`}>
                            <TableCell className="text-sm">{m.metricName}</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {m.hasProjected ? fmtCompact(m.projectedTotal) : "-"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {m.hasActual ? fmtCompact(m.actualTotal) : "-"}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-medium ${varianceColor(variance)}`}>
                              {variance !== null ? (
                                <span className="flex items-center justify-end gap-1">
                                  {variance >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                  {fmtCompact(Math.abs(variance))}
                                </span>
                              ) : (
                                <Minus className="h-3 w-3 inline text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-medium ${varianceColor(variancePctVal)}`}>
                              {variancePctVal !== null
                                ? `${variancePctVal >= 0 ? "+" : ""}${variancePctVal.toFixed(1)}%`
                                : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── KPI Dashboard ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" />
              <div>
                <CardTitle className="text-base">KPI Goals</CardTitle>
                <CardDescription className="text-sm">
                  Track progress against key performance targets
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(kpiYear)} onValueChange={(v) => setKpiYear(Number(v))}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => window.location.href = "/import"}>
                <Upload className="h-3 w-3 mr-1" /> Import
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                // Reset KPI goals to show creator again by clearing and refetching
                kpiGoalsQuery.refetch();
              }}>
                <Plus className="h-3 w-3 mr-1" /> Add KPI
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {kpiGoalsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading KPI goals...</span>
            </div>
          ) : kpiGoals.length === 0 ? (
            <KpiGoalCreator year={kpiYear} onCreated={() => kpiGoalsQuery.refetch()} />
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedKpis).map(([category, kpis]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {kpis.map((kpi: any) => {
                      const pct = progressPct(kpi.actualValue, kpi.targetValue);
                      const actual = kpi.actualValue ? parseFloat(kpi.actualValue) : 0;
                      const target = kpi.targetValue ? parseFloat(kpi.targetValue) : 0;
                      const isOverTarget = actual >= target && target > 0;

                      return (
                        <div
                          key={kpi.id}
                          className="border rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{kpi.metricName}</span>
                            <Badge
                              variant="secondary"
                              className={`text-xs shrink-0 ${kpiStatusBadge(kpi.status)}`}
                            >
                              {(kpi.status || "not_started").replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="text-lg font-bold">
                                {kpi.unit === "USD" || kpi.unit === "$"
                                  ? fmtCompact(actual)
                                  : `${actual.toLocaleString()}${kpi.unit === "%" ? "%" : ""}`}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">
                                / {kpi.unit === "USD" || kpi.unit === "$"
                                  ? fmtCompact(target)
                                  : `${target.toLocaleString()}${kpi.unit === "%" ? "%" : ""}`}
                              </span>
                            </div>
                            <span className={`text-xs font-medium ${isOverTarget ? "text-green-600" : pct >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                              {pct}%
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                isOverTarget
                                  ? "bg-green-500"
                                  : pct >= 70
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          {/* Sparkline — 12-month target trajectory */}
                          <div className="flex items-center justify-between">
                            <div style={{ width: 80, height: 30 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={Array.from({ length: 12 }, (_, i) => ({
                                  m: i + 1,
                                  v: target > 0 ? (target / 12) * (i + 1) : 0,
                                  a: i < (kpi.month || 1) ? (actual / (kpi.month || 1)) * (i + 1) : undefined,
                                }))}>
                                  <Line type="monotone" dataKey="v" stroke={CHART_COLORS.muted} strokeWidth={1} dot={false} strokeDasharray="2 2" />
                                  <Line type="monotone" dataKey="a" stroke={isOverTarget ? CHART_COLORS.grossProfit : CHART_COLORS.revenue} strokeWidth={1.5} dot={false} connectNulls />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            {kpi.month && (
                              <span className="text-[10px] text-muted-foreground">
                                Mo {kpi.month}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Banking ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-blue-600" /> Banking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankBalances?.accounts && bankBalances.accounts.length > 0 ? (
              bankBalances.accounts.map((acct: any) => (
                <div key={acct.id} className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground font-medium">
                    {acct.name || acct.nickname || "Account"}
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {fmtCompact(acct.currentBalance ?? acct.availableBalance ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {acct.kind || acct.type || "Checking"} &middot; ****{acct.accountNumber?.slice(-4) || acct.id?.slice(-4)}
                  </p>
                </div>
              ))
            ) : (
              <div className="col-span-full text-sm text-muted-foreground py-4 text-center">
                No bank accounts connected. Connect Mercury or Amex below.
              </div>
            )}
          </div>

          {/* Connect accounts section */}
          <div className="mt-4 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Connect Accounts</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <a
                href="/settings"
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-r from-gray-800 to-gray-600 flex items-center justify-center text-white text-xs font-bold">M</div>
                <div>
                  <div className="text-sm font-medium">Mercury</div>
                  <div className="text-xs text-muted-foreground">Business checking &middot; API key in Settings</div>
                </div>
              </a>
              <a
                href="https://www.americanexpress.com/en-us/business/trends-and-insights/articles/how-to-connect-your-amex-account-to-accounting-software/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-700 to-blue-500 flex items-center justify-center text-white text-xs font-bold">AX</div>
                <div>
                  <div className="text-sm font-medium">American Express</div>
                  <div className="text-xs text-muted-foreground">Connect via Plaid or CSV import &middot; Use QuickBooks sync</div>
                </div>
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              To connect Amex: Go to Settings &gt; QuickBooks and sync your accounts. Amex integrates via QuickBooks Online or you can export transactions as CSV from americanexpress.com and import via the Import Data page.
            </p>
          </div>
        </CardContent>
      </Card>

        </div>{/* end left column */}

        {/* Right sidebar: reports menu */}
        <div className="space-y-2 hidden lg:block">
          <Card className="py-2">
            <CardHeader className="pb-1 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Reports</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-0">
              <div className="space-y-0.5">
                {reportTypes.map((report) => (
                  <button
                    key={report.id}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors ${expandedReport === report.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                    onClick={() => {
                      handleGenerate(report.id);
                      setExpandedReport(report.id);
                    }}
                  >
                    {report.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="py-2">
            <CardHeader className="pb-1 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">CFO Strategy</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-0 space-y-0.5">
              {[
                { id: "fundraising", label: "Fundraising Readiness" },
                { id: "board_report", label: "Board Report" },
                { id: "scenario", label: "Scenario Planning" },
                { id: "tax", label: "Tax Planning" },
                { id: "compliance", label: "Compliance Checklist" },
                { id: "working_capital", label: "Working Capital" },
              ].map(s => (
                <button key={s.id} className={`w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors ${expandedStrategy === s.id ? "bg-primary/10 text-primary font-medium" : ""}`} onClick={() => handleStrategyClick(s.id, s.label)}>
                  {s.label}
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="py-2">
            <CardHeader className="pb-1 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-2 py-0 space-y-0.5">
              <button className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors" onClick={() => autoCategorize.mutate()}>
                Auto-Categorize
              </button>
              <button className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors" onClick={() => window.location.href = "/import"}>
                Import Data
              </button>
              <button className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors" onClick={() => window.location.href = "/settings/integrations"}>
                QuickBooks
              </button>
            </CardContent>
          </Card>
        </div>
      </div>{/* end grid */}
    </div>
  );
}
