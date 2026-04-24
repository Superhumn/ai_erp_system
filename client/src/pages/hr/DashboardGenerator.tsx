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
  /** Four-digit year extracted from the period. */
  year: number;
  /** Period display label (e.g. "2026", "Q3 2026", "Jan 2026"). Used as X-axis key and React key. */
  label: string;
  /** Sortable key from Period — unique across monthly/quarterly/annual periods. Used as React key. */
  sortKey: number;
  revenue: number | null;
  cogs: number | null;
  opex: number | null;
  cashBalance: number | null;
  headcount: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  netIncome: number | null;
  netMargin: number | null;
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
  /** "Revenue" when the model has a revenue row; "ARR" for ARR-only SaaS models. */
  topLineLabel: string;
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
 * Bridge the new canonical FinancialModel into the per-period ProjectionRow[]
 * shape that the existing UI renders from. Derived series (gross profit, net
 * income, margins) come from `deriveSeries` when the raw values are missing.
 *
 * `topLineLabel` is "Revenue" when the model has a revenue row, otherwise
 * "ARR" — consumers must use this label instead of hard-coding "Revenue".
 */
function toParsedData(model: FinancialModel): ParsedData {
  const derived = deriveSeries(model);
  const hasRevenue =
    model.metrics.revenue !== undefined &&
    model.metrics.revenue.some((v) => v !== null);
  const topLineLabel = hasRevenue ? "Revenue" : "ARR";
  const top = hasRevenue
    ? (model.metrics.revenue ?? [])
    : (model.metrics.arr ?? []);

  const rows: ProjectionRow[] = model.periods.map((p, i) => {
    const revenue = top[i] ?? null;
    const cogs = model.metrics.cogs?.[i] ?? null;
    const opex = model.metrics.opex?.[i] ?? null;
    const cashBalance = model.metrics.cashBalance?.[i] ?? null;
    const headcount = model.metrics.headcount?.[i] ?? null;

    const derivedGrossProfit = derived.grossProfit?.[i];
    const grossProfit =
      derivedGrossProfit !== undefined
        ? derivedGrossProfit
        : revenue !== null && cogs !== null
          ? revenue - cogs
          : null;

    const derivedGrossMargin = derived.grossMargin?.[i];
    const grossMargin =
      derivedGrossMargin !== undefined
        ? derivedGrossMargin
        : revenue !== null && revenue > 0 && grossProfit !== null
          ? (grossProfit / revenue) * 100
          : null;

    const derivedNetIncome = derived.netIncome?.[i];
    const netIncome =
      derivedNetIncome !== undefined
        ? derivedNetIncome
        : grossProfit !== null && opex !== null
          ? grossProfit - opex
          : null;

    const derivedNetMargin = derived.netMargin?.[i];
    const netMargin =
      derivedNetMargin !== undefined
        ? derivedNetMargin
        : revenue !== null && revenue > 0 && netIncome !== null
          ? (netIncome / revenue) * 100
          : null;
    return {
      year: p.year,
      label: p.label,
      sortKey: p.sortKey,
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
    topLineLabel,
  };
}

async function parseWorkbook(
  file: File,
): Promise<{ data: ParsedData; model: FinancialModel }> {
  const { model } = await parseFinancialProjection(file);
  if (model.periods.length === 0) {
    throw new Error(
      "Couldn't find any projection rows. Make sure the sheet has time-period headers (years, FY, or dates) and labeled metric rows.",
    );
  }
  return { data: toParsedData(model), model };
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

// ── View toggle button ───────────────────────────────────────────────────

function ViewToggleButton({
  active, onClick, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function DashboardGenerator() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [model, setModel] = useState<FinancialModel | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [view, setView] = useState<"investor" | "internal">("investor");
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
      const { data: parsed, model: parsedModel } = await parseWorkbook(file);
      setData(parsed);
      setModel(parsedModel);
      setFileName(file.name);
      toast.success(`Dashboard generated from "${file.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse workbook";
      setParseError(msg);
      setData(null);
      setModel(null);
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
    setModel(null);
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
          {data && (
            <div
              className="inline-flex rounded-lg border bg-background p-0.5"
              role="tablist"
              aria-label="Dashboard view"
            >
              <ViewToggleButton
                active={view === "investor"}
                onClick={() => setView("investor")}
                icon={Sparkles}
                label="Investor"
              />
              <ViewToggleButton
                active={view === "internal"}
                onClick={() => setView("internal")}
                icon={FileSpreadsheet}
                label="Internal"
              />
            </div>
          )}
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

      {data && model && metrics && (
        <Dashboard
          data={data}
          model={model}
          metrics={metrics}
          fileName={fileName}
          view={view}
        />
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
  data, model, metrics, fileName, view,
}: {
  data: ParsedData;
  model: FinancialModel;
  metrics: NonNullable<ReturnType<typeof useDashboardMetrics>>;
  fileName: string | null;
  view: "investor" | "internal";
}) {
  const { meta, rows, topLineLabel } = data;
  const currency = meta.currency || "USD";
  const money = MoneyTooltip(currency);

  const profitSeries = rows.map((r) => ({
    label: r.label,
    [topLineLabel]: r.revenue,
    "Net Income": r.netIncome,
  }));

  const costSeries = rows.map((r) => ({
    label: r.label,
    COGS: r.cogs,
    OpEx: r.opex,
  }));

  const cashSeries = rows.map((r) => ({
    label: r.label,
    Cash: r.cashBalance,
  }));

  const headcountSeries = rows.map((r) => ({
    label: r.label,
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
              <Badge variant="secondary">{rows.length}-period plan</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {rows[0].label} – {rows[rows.length - 1].label}
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
          label={`${metrics.last.label} ${topLineLabel}`}
          value={fmtMoney(metrics.last.revenue, currency)}
          sub={`from ${fmtMoney(metrics.first.revenue, currency)} in ${metrics.first.label}`}
        />
        <KpiCard
          icon={TrendingUp}
          label={`${topLineLabel} CAGR`}
          value={fmtPct(metrics.cagr)}
          sub={`${metrics.periods}-period plan`}
          tone={metrics.cagr >= 100 ? "good" : metrics.cagr >= 40 ? "default" : "warn"}
        />
        <KpiCard
          icon={DollarSign}
          label="Ending Cash"
          value={fmtMoney(metrics.last.cashBalance, currency)}
          sub={`min ${fmtMoney(metrics.minCash, currency)}`}
          tone={(metrics.last.cashBalance ?? 0) >= 0 ? "default" : "bad"}
        />
        <KpiCard
          icon={Flame}
          label="Period-End Burn"
          value={metrics.lastBurn > 0 ? fmtMoney(metrics.lastBurn, currency) : "Profitable"}
          sub={metrics.lastBurn > 0 ? `${metrics.last.label} net loss` : `${metrics.last.label} net positive`}
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
              <div className="font-medium text-sm">Runway at period-end burn</div>
              <div className="text-xs text-muted-foreground">
                Based on {metrics.last.label} burn of {fmtMoney(metrics.lastBurn, currency)}
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
            <CardTitle className="text-base">{topLineLabel} &amp; Net Income</CardTitle>
            <CardDescription>Top line vs. bottom line</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profitSeries} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmtAxis(v, currency)} />
                <Tooltip content={money} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey={topLineLabel}
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
                <XAxis dataKey="label" fontSize={11} />
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
            <CardDescription>Period-end cash position</CardDescription>
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
                <XAxis dataKey="label" fontSize={11} />
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
                <XAxis dataKey="label" fontSize={11} />
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

      {/* Period summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period Summary</CardTitle>
          <CardDescription>Full breakdown by period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">{topLineLabel}</TableHead>
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
                  <TableRow key={r.sortKey}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.revenue, currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.cogs, currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.grossProfit, currency)}</TableCell>
                    <TableCell className="text-right">{fmtPct(r.grossMargin)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.opex, currency)}</TableCell>
                    <TableCell className={`text-right ${(r.netIncome ?? 0) < 0 ? "text-red-600" : "text-emerald-600"}`}>
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

      {view === "internal" && <InternalPanels model={model} />}
    </div>
  );
}

// ── Internal-only panels ─────────────────────────────────────────────────

// Human-readable labels for canonical metric keys.
const METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue",
  arr: "ARR",
  cogs: "COGS",
  grossProfit: "Gross Profit",
  opex: "Operating Expenses",
  sm: "Sales & Marketing",
  rd: "Research & Development",
  ga: "General & Administrative",
  ebitda: "EBITDA",
  netIncome: "Net Income",
  cashBalance: "Cash Balance",
  headcount: "Headcount",
  magicNumber: "Magic Number",
  cacPayback: "CAC Payback",
  ltvCac: "LTV : CAC",
  customers: "Customers",
  newLogos: "New Logos",
  churnedLogos: "Churned Logos",
  nrr: "NRR",
  grr: "GRR",
  acv: "ACV",
  arpu: "ARPU",
  cac: "CAC",
  ltv: "LTV",
};

function DetectionDiagnostics({ model }: { model: FinancialModel }) {
  const [expanded, setExpanded] = useState(false);
  const detected = Object.keys(model.metrics).length;
  const extras = model.extras.length;
  const first = model.periods[0];
  const last = model.periods[model.periods.length - 1];
  const layoutLabel = model.meta.layout === "columns"
    ? "periods as columns"
    : "periods as rows";

  const mappedKeys = Object.keys(model.metrics).filter(
    (k) => model.metrics[k as keyof typeof model.metrics]?.some((v) => v !== null),
  );

  return (
    <Card className="border-dashed">
      <button
        type="button"
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            Detected: {detected} metric{detected === 1 ? "" : "s"}
            {" · "}
            {model.periods.length} period{model.periods.length === 1 ? "" : "s"}
            {first && last && ` (${first.label}–${last.label})`}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Sheet &quot;{model.meta.sourceSheet}&quot; &middot; {layoutLabel}
            {extras > 0 && ` · ${extras} unmapped row${extras === 1 ? "" : "s"}`}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {expanded ? "Hide" : "Show"} details
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          {mappedKeys.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Mapped metrics
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mappedKeys.map((k) => (
                  <Badge key={k} variant="secondary" className="text-xs">
                    {METRIC_LABELS[k] ?? k}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {model.extras.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Unmapped rows ({model.extras.length})
              </div>
              <div className="overflow-x-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Row label</TableHead>
                      {model.periods.map((p) => (
                        <TableHead key={p.sortKey} className="text-right text-xs">
                          {p.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {model.extras.slice(0, 12).map((ex, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{ex.label}</TableCell>
                        {ex.values.map((v, j) => (
                          <TableCell key={j} className="text-right text-xs">
                            {v === null ? "—" : fmtNumber(v)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {model.extras.length > 12 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Showing first 12 of {model.extras.length} unmapped rows.
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Something missing? Make sure row labels use canonical names
            (Revenue, COGS, Operating Expenses, Cash Balance, Headcount, ARR,
            NRR, GRR, Magic Number, CAC Payback, LTV:CAC) — the parser matches
            those plus common synonyms. &quot;Total X&quot; rows take precedence
            over subcategory rows.
          </div>
        </div>
      )}
    </Card>
  );
}

function InternalPanels({ model }: { model: FinancialModel }) {
  const derived = useMemo(() => deriveSeries(model), [model]);
  const periods = model.periods;

  // Margin trajectory: gross margin % and net margin % over time.
  const marginSeries = periods.map((p, i) => ({
    year: p.label,
    "Gross Margin %": derived.grossMargin?.[i] ?? null,
    "Net Margin %": derived.netMargin?.[i] ?? null,
  }));
  const hasMargin = derived.grossMargin?.some((v) => v !== null)
    || derived.netMargin?.some((v) => v !== null);

  // YoY growth on the primary top-line series (revenue or ARR).
  const growthSeries = periods.map((p, i) => ({
    year: p.label,
    "YoY Growth %": derived.yoyGrowth?.[i] ?? null,
  }));
  const hasGrowth = derived.yoyGrowth?.some((v) => v !== null);

  // Customers / logos line.
  const customers = model.metrics.customers;
  const hasCustomers = customers && customers.some((v) => v !== null);
  const customerSeries = periods.map((p, i) => ({
    year: p.label,
    Customers: customers?.[i] ?? null,
  }));

  // Retention + efficiency KPIs (last non-null value each).
  const lastOf = (arr?: (number | null)[]) => {
    if (!arr) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null) return arr[i] as number;
    }
    return null;
  };
  const nrr = lastOf(model.metrics.nrr);
  const grr = lastOf(model.metrics.grr);
  const magic = lastOf(model.metrics.magicNumber);
  const cacPay = lastOf(model.metrics.cacPayback);
  const ltvCac = lastOf(model.metrics.ltvCac);
  const ruleOf40 = derived.ruleOf40Last;

  const retentionCards = [
    nrr !== null && (
      <KpiCard
        key="nrr"
        icon={TrendingUp}
        label="Net Revenue Retention"
        value={fmtPct(nrr)}
        sub="Series B bar: 120%+"
        tone={nrr >= 120 ? "good" : nrr >= 105 ? "default" : "warn"}
      />
    ),
    grr !== null && (
      <KpiCard
        key="grr"
        icon={ShieldCheck}
        label="Gross Revenue Retention"
        value={fmtPct(grr)}
        sub="Series B bar: 90%+"
        tone={grr >= 90 ? "good" : grr >= 80 ? "default" : "warn"}
      />
    ),
  ].filter(Boolean);

  const efficiencyCards = [
    ruleOf40 !== null && (
      <KpiCard
        key="r40"
        icon={TrendingUp}
        label="Rule of 40"
        value={fmtPct(ruleOf40)}
        sub="Growth % + margin %"
        tone={ruleOf40 >= 40 ? "good" : ruleOf40 >= 20 ? "default" : "warn"}
      />
    ),
    magic !== null && (
      <KpiCard
        key="magic"
        icon={Sparkles}
        label="Magic Number"
        value={magic.toFixed(2)}
        sub="Net new ARR ÷ S&M"
        tone={magic >= 1 ? "good" : magic >= 0.75 ? "default" : "warn"}
      />
    ),
    cacPay !== null && (
      <KpiCard
        key="cacp"
        icon={Clock}
        label="CAC Payback"
        value={`${cacPay.toFixed(0)} mo`}
        sub="Lower is better"
        tone={cacPay <= 12 ? "good" : cacPay <= 18 ? "default" : "warn"}
      />
    ),
    ltvCac !== null && (
      <KpiCard
        key="ltv"
        icon={DollarSign}
        label="LTV : CAC"
        value={`${ltvCac.toFixed(1)}x`}
        sub="Series B bar: 3x+"
        tone={ltvCac >= 3 ? "good" : ltvCac >= 2 ? "default" : "warn"}
      />
    ),
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-6 w-0.5 bg-primary rounded-full" />
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Internal view &middot; additional detail
        </h3>
      </div>

      <DetectionDiagnostics model={model} />

      {(hasMargin || hasGrowth) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {hasMargin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Margin Trajectory</CardTitle>
                <CardDescription>Gross margin vs net margin</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={marginSeries} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="year" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      formatter={(v) => (typeof v === "number" ? `${v.toFixed(1)}%` : v)}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Gross Margin %"
                      stroke={CHART.netIncome}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="Net Margin %"
                      stroke={CHART.opex}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasGrowth && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Year-over-Year Growth</CardTitle>
                <CardDescription>
                  {model.metrics.revenue ? "Revenue" : "ARR"} growth rate
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={growthSeries} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="year" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      formatter={(v) => (typeof v === "number" ? `${v.toFixed(1)}%` : v)}
                    />
                    <Bar dataKey="YoY Growth %" fill={CHART.revenue} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {hasCustomers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer Growth</CardTitle>
            <CardDescription>Customer count over the plan</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={customerSeries} margin={{ left: 0, right: 10 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip content={NumberTooltip} />
                <Line
                  type="monotone"
                  dataKey="Customers"
                  stroke={CHART.headcount}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(retentionCards.length > 0 || efficiencyCards.length > 0) && (
        <div className="space-y-3">
          {retentionCards.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Retention
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{retentionCards}</div>
            </>
          )}
          {efficiencyCards.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Efficiency
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{efficiencyCards}</div>
            </>
          )}
        </div>
      )}

      {retentionCards.length === 0
        && efficiencyCards.length === 0
        && !hasMargin
        && !hasGrowth
        && !hasCustomers && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No additional internal metrics detected. Add rows like NRR, GRR,
              Magic Number, CAC Payback, or LTV:CAC to your model to see them here.
            </CardContent>
          </Card>
        )}
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
    const periods = rows.length;
    const firstRevenue = first.revenue;
    const lastRevenue = last.revenue;
    const cagr =
      periods > 1 && firstRevenue !== null && firstRevenue > 0 && lastRevenue !== null && lastRevenue > 0
        ? (Math.pow(lastRevenue / firstRevenue, 1 / (periods - 1)) - 1) * 100
        : 0;
    const validHeadcounts = rows.map((r) => r.headcount).filter((v): v is number => v !== null);
    const peakHeadcount = validHeadcounts.length > 0 ? Math.max(...validHeadcounts) : null;
    const validCash = rows.map((r) => r.cashBalance).filter((v): v is number => v !== null);
    const minCash = validCash.length > 0 ? Math.min(...validCash) : null;
    const validGM = rows.map((r) => r.grossMargin).filter((v): v is number => v !== null);
    const bestGrossMargin = validGM.length > 0 ? Math.max(...validGM) : null;
    const lastNetIncome = last.netIncome ?? 0;
    const lastBurn = lastNetIncome < 0 ? -lastNetIncome : 0;
    const lastCash = last.cashBalance ?? 0;
    const runwayMonths = lastBurn > 0 ? (lastCash / lastBurn) * 12 : Infinity;
    return { first, last, periods, cagr, peakHeadcount, minCash, bestGrossMargin, lastBurn, runwayMonths };
  }, [data]);
}
