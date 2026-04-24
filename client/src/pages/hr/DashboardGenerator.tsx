import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, BarChart, Bar, Legend, TooltipProps,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Download, Upload, Sparkles, DollarSign, TrendingUp, Users,
  Flame, Clock, RefreshCw, ShieldCheck, FileSpreadsheet, AlertTriangle,
} from "lucide-react";
import {
  parseFinancialProjection,
  deriveSeries,
  type FinancialModel,
} from "@/lib/financialProjectionParser";

// ── Shapes ────────────────────────────────────────────────────────────────

interface ProjectionRow {
  year: number;
  revenue: number;
  cogs: number;
  opex: number;
  cashBalance: number;
  headcount: number;
  grossProfit: number;
  grossMargin: number;
  netIncome: number;
  netMargin: number;
}

interface CompanyMeta {
  companyName: string;
  currency: string;
  raiseAmount: number | null;
  valuation: number | null;
  stage: string;
}

interface ParsedData {
  meta: CompanyMeta;
  rows: ProjectionRow[];
}

// ── Formatters ────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$", INR: "₹", JPY: "¥",
};

function sym(cur: string) {
  return CURRENCY_SYMBOL[cur.toUpperCase()] ?? `${cur} `;
}

function fmtMoney(n: number | null | undefined, currency = "USD") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const s = n < 0 ? "-" : "";
  const $ = sym(currency);
  if (abs >= 1_000_000_000) return `${s}${$}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${s}${$}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${s}${$}${(abs / 1_000).toFixed(0)}K`;
  return `${s}${$}${abs.toFixed(0)}`;
}

function fmtAxis(n: number, currency = "USD") {
  const abs = Math.abs(n);
  const $ = sym(currency);
  if (abs >= 1_000_000) return `${$}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${$}${(n / 1_000).toFixed(0)}K`;
  return `${$}${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function fmtNumber(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

// ── Palette ───────────────────────────────────────────────────────────────

const CHART = {
  revenue: "#2563eb",
  netIncome: "#10b981",
  netIncomeNeg: "#ef4444",
  cogs: "#f59e0b",
  opex: "#8b5cf6",
  cash: "#06b6d4",
  headcount: "#0ea5e9",
  grid: "#e5e7eb",
};

// ── Excel template generation ─────────────────────────────────────────────

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    ["Field", "Value"],
    ["Company Name", "Acme Co."],
    ["Currency", "USD"],
    ["Stage", "Series A"],
    ["Raise Amount", 5_000_000],
    ["Valuation", 25_000_000],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const projections: (string | number)[][] = [
    ["Year", "Revenue", "COGS", "Operating Expenses", "Cash Balance", "Headcount"],
    [2026, 500_000, 200_000, 800_000, 3_000_000, 12],
    [2027, 1_500_000, 550_000, 2_000_000, 2_500_000, 25],
    [2028, 4_000_000, 1_400_000, 4_500_000, 1_500_000, 55],
    [2029, 10_000_000, 3_500_000, 8_500_000, 3_000_000, 120],
    [2030, 25_000_000, 8_500_000, 15_000_000, 10_000_000, 250],
  ];
  const projSheet = XLSX.utils.aoa_to_sheet(projections);
  projSheet["!cols"] = [
    { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, projSheet, "Projections");

  XLSX.writeFile(wb, "vc-corner-dashboard-template.xlsx");
}

// ── Parsing ──────────────────────────────────────────────────────────────

/**
 * Bridge the new canonical FinancialModel into the per-year ProjectionRow[]
 * shape that the existing UI renders from. Derived series (gross profit, net
 * income, margins) come from `deriveSeries` when the raw values are missing.
 */
function toParsedData(model: FinancialModel): ParsedData {
  const derived = deriveSeries(model);
  const top = model.metrics.revenue ?? model.metrics.arr ?? [];

  const rows: ProjectionRow[] = model.periods.map((p, i) => {
    const revenue = top[i] ?? 0;
    const cogs = model.metrics.cogs?.[i] ?? 0;
    const opex = model.metrics.opex?.[i] ?? 0;
    const cashBalance = model.metrics.cashBalance?.[i] ?? 0;
    const headcount = model.metrics.headcount?.[i] ?? 0;
    const grossProfit = derived.grossProfit?.[i] ?? revenue - cogs;
    const grossMargin = derived.grossMargin?.[i] ?? (revenue > 0 ? (grossProfit / revenue) * 100 : 0);
    const netIncome = derived.netIncome?.[i] ?? grossProfit - opex;
    const netMargin = derived.netMargin?.[i] ?? (revenue > 0 ? (netIncome / revenue) * 100 : 0);
    return {
      year: p.year,
      revenue, cogs, opex, cashBalance, headcount,
      grossProfit, grossMargin, netIncome, netMargin,
    };
  });

  return {
    meta: {
      companyName: model.meta.companyName ?? "Your Company",
      currency: model.meta.currency ?? "USD",
      stage: model.meta.stage ?? "",
      raiseAmount: model.meta.raiseAmount ?? null,
      valuation: model.meta.valuation ?? null,
    },
    rows,
  };
}

async function parseWorkbook(file: File): Promise<ParsedData> {
  const { model } = await parseFinancialProjection(file);
  if (model.periods.length === 0) {
    throw new Error(
      "Couldn't find any projection rows. Make sure the sheet has time-period headers (years, FY, or dates) and labeled metric rows.",
    );
  }
  return toParsedData(model);
}

// ── Chart tooltip ─────────────────────────────────────────────────────────

function MoneyTooltip(currency: string) {
  return function Tip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm text-xs">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
            <span className="text-muted-foreground">{e.name}:</span>
            <span className="font-medium">
              {typeof e.value === "number" ? fmtMoney(e.value, currency) : e.value}
            </span>
          </div>
        ))}
      </div>
    );
  };
}

function NumberTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">{typeof e.value === "number" ? fmtNumber(e.value) : e.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  const toneCls =
    tone === "good" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "bad" ? "text-red-600 dark:text-red-400" :
    tone === "warn" ? "text-amber-600 dark:text-amber-400" :
    "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tracking-[-0.02em] ${toneCls}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function DashboardGenerator() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const ok = /\.(xlsx|xls)$/i.test(file.name);
    if (!ok) {
      toast.error("Please drop an .xlsx or .xls file");
      return;
    }
    setIsParsing(true);
    setParseError(null);
    try {
      const parsed = await parseWorkbook(file);
      setData(parsed);
      setFileName(file.name);
      toast.success(`Dashboard generated from "${file.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse workbook";
      setParseError(msg);
      setData(null);
      toast.error(msg);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile],
  );

  const reset = useCallback(() => {
    setData(null);
    setFileName(null);
    setParseError(null);
  }, []);

  // Derived metrics
  const metrics = useDashboardMetrics(data);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Intro header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Dashboard Generator
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Turn your 5-year financial projections into a polished, investor-grade dashboard in seconds.
            Fill the Excel template, drop the file, and the dashboard appears instantly.{" "}
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              Your data never leaves your device.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          {data && (
            <Button variant="ghost" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Start over
            </Button>
          )}
        </div>
      </div>

      {/* Drop zone (shown until a dashboard is generated) */}
      {!data && (
        <Card>
          <CardContent className="p-0">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                m-6 rounded-xl border-2 border-dashed p-12 text-center cursor-pointer
                transition-colors
                ${isDragging ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50 hover:bg-muted/30"}
              `}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                  {isParsing ? (
                    <RefreshCw className="h-7 w-7 text-primary animate-spin" />
                  ) : (
                    <Upload className="h-7 w-7 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-base">
                    {isParsing ? "Generating your dashboard..." : "Drop your Excel file here"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse &middot; supports .xlsx and .xls
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Parsed in your browser. Nothing is uploaded.
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onPick}
              />
            </div>

            {parseError && (
              <div className="mx-6 mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Couldn't read that file</div>
                  <div className="opacity-80">{parseError}</div>
                </div>
              </div>
            )}

            {/* 3-step how-it-works */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-6">
              <StepCard
                n={1}
                title="Download the template"
                desc="Get an Excel with two sheets: Summary and Projections."
                icon={FileSpreadsheet}
              />
              <StepCard
                n={2}
                title="Fill in your numbers"
                desc="Five years of revenue, COGS, OpEx, cash balance, and headcount."
                icon={Sparkles}
              />
              <StepCard
                n={3}
                title="Drop it back"
                desc="Your investor-grade dashboard renders instantly, client-side."
                icon={TrendingUp}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {data && metrics && (
        <Dashboard data={data} metrics={metrics} fileName={fileName} />
      )}
    </div>
  );
}

function StepCard({
  n, title, desc, icon: Icon,
}: {
  n: number;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
          {n}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

// ── Dashboard view ───────────────────────────────────────────────────────

function Dashboard({
  data, metrics, fileName,
}: {
  data: ParsedData;
  metrics: NonNullable<ReturnType<typeof useDashboardMetrics>>;
  fileName: string | null;
}) {
  const { meta, rows } = data;
  const currency = meta.currency || "USD";
  const money = MoneyTooltip(currency);

  const profitSeries = rows.map((r) => ({
    year: r.year,
    Revenue: r.revenue,
    "Net Income": r.netIncome,
  }));

  const costSeries = rows.map((r) => ({
    year: r.year,
    COGS: r.cogs,
    OpEx: r.opex,
  }));

  const cashSeries = rows.map((r) => ({
    year: r.year,
    Cash: r.cashBalance,
  }));

  const headcountSeries = rows.map((r) => ({
    year: r.year,
    Headcount: r.headcount,
  }));

  return (
    <div className="space-y-6">
      {/* Company header */}
      <Card>
        <CardContent className="p-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">{meta.companyName}</h3>
              {meta.stage && <Badge variant="outline">{meta.stage}</Badge>}
              <Badge variant="secondary">{rows.length}-year plan</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {rows[0].year} – {rows[rows.length - 1].year}
              {fileName && <> &middot; {fileName}</>}
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            {meta.raiseAmount !== null && (
              <div>
                <div className="text-muted-foreground text-xs">Target raise</div>
                <div className="font-semibold">{fmtMoney(meta.raiseAmount, currency)}</div>
              </div>
            )}
            {meta.valuation !== null && (
              <div>
                <div className="text-muted-foreground text-xs">Valuation</div>
                <div className="font-semibold">{fmtMoney(meta.valuation, currency)}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          icon={DollarSign}
          label={`${metrics.last.year} Revenue`}
          value={fmtMoney(metrics.last.revenue, currency)}
          sub={`from ${fmtMoney(metrics.first.revenue, currency)} in ${metrics.first.year}`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Revenue CAGR"
          value={fmtPct(metrics.cagr)}
          sub={`${metrics.years}-year plan`}
          tone={metrics.cagr >= 100 ? "good" : metrics.cagr >= 40 ? "default" : "warn"}
        />
        <KpiCard
          icon={DollarSign}
          label="Ending Cash"
          value={fmtMoney(metrics.last.cashBalance, currency)}
          sub={`min ${fmtMoney(metrics.minCash, currency)}`}
          tone={metrics.last.cashBalance >= 0 ? "default" : "bad"}
        />
        <KpiCard
          icon={Flame}
          label="Y-End Burn"
          value={metrics.lastBurn > 0 ? fmtMoney(metrics.lastBurn, currency) : "Profitable"}
          sub={metrics.lastBurn > 0 ? `${metrics.last.year} net loss` : `${metrics.last.year} net positive`}
          tone={metrics.lastBurn === 0 ? "good" : "warn"}
        />
        <KpiCard
          icon={Users}
          label="Peak Headcount"
          value={fmtNumber(metrics.peakHeadcount)}
          sub={`best GM ${fmtPct(metrics.bestGrossMargin)}`}
        />
      </div>

      {/* Runway callout */}
      {metrics.lastBurn > 0 && Number.isFinite(metrics.runwayMonths) && (
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="font-medium text-sm">Runway at year-end burn</div>
              <div className="text-xs text-muted-foreground">
                Based on {metrics.last.year} burn of {fmtMoney(metrics.lastBurn, currency)}
                &nbsp;and ending cash of {fmtMoney(metrics.last.cashBalance, currency)}
              </div>
            </div>
            <div className="text-xl font-semibold tracking-[-0.02em]">
              {metrics.runwayMonths.toFixed(0)} months
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue &amp; Net Income</CardTitle>
            <CardDescription>Top line vs. bottom line</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profitSeries} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmtAxis(v, currency)} />
                <Tooltip content={money} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Revenue"
                  stroke={CHART.revenue}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Net Income"
                  stroke={CHART.netIncome}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Structure</CardTitle>
            <CardDescription>COGS and Operating Expenses</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costSeries} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmtAxis(v, currency)} />
                <Tooltip content={money} />
                <Legend />
                <Bar dataKey="COGS" stackId="c" fill={CHART.cogs} radius={[0, 0, 0, 0]} />
                <Bar dataKey="OpEx" stackId="c" fill={CHART.opex} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash Balance</CardTitle>
            <CardDescription>Year-end cash position</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashSeries} margin={{ left: 0, right: 10 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.cash} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART.cash} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmtAxis(v, currency)} />
                <Tooltip content={money} />
                <Area
                  type="monotone"
                  dataKey="Cash"
                  stroke={CHART.cash}
                  strokeWidth={2}
                  fill="url(#cashGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Headcount</CardTitle>
            <CardDescription>Team size over the plan</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={headcountSeries} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip content={NumberTooltip} />
                <Line
                  type="monotone"
                  dataKey="Headcount"
                  stroke={CHART.headcount}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Yearly table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yearly Summary</CardTitle>
          <CardDescription>Full breakdown of each year</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">GM %</TableHead>
                  <TableHead className="text-right">OpEx</TableHead>
                  <TableHead className="text-right">Net Income</TableHead>
                  <TableHead className="text-right">NM %</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.year}>
                    <TableCell className="font-medium">{r.year}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.revenue, currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.cogs, currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.grossProfit, currency)}</TableCell>
                    <TableCell className="text-right">{fmtPct(r.grossMargin)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.opex, currency)}</TableCell>
                    <TableCell className={`text-right ${r.netIncome < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {fmtMoney(r.netIncome, currency)}
                    </TableCell>
                    <TableCell className="text-right">{fmtPct(r.netMargin)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.cashBalance, currency)}</TableCell>
                    <TableCell className="text-right">{fmtNumber(r.headcount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper type so <Dashboard> can type its metrics prop from useMemo output.
function useDashboardMetrics(data: ParsedData | null) {
  return useMemo(() => {
    if (!data) return null;
    const rows = data.rows;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const years = rows.length;
    const cagr =
      years > 1 && first.revenue > 0
        ? (Math.pow(last.revenue / first.revenue, 1 / (years - 1)) - 1) * 100
        : 0;
    const peakHeadcount = Math.max(...rows.map((r) => r.headcount));
    const minCash = Math.min(...rows.map((r) => r.cashBalance));
    const bestGrossMargin = Math.max(...rows.map((r) => r.grossMargin));
    const lastBurn = last.netIncome < 0 ? -last.netIncome : 0;
    const runwayMonths = lastBurn > 0 ? (last.cashBalance / lastBurn) * 12 : Infinity;
    return { first, last, years, cagr, peakHeadcount, minCash, bestGrossMargin, lastBurn, runwayMonths };
  }, [data]);
}
