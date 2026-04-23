import { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, ReferenceLine, TooltipProps, Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  DollarSign, Flame, Clock, TrendingUp, Target, Presentation, BarChart3,
  Calculator, Shield, Activity, Sparkles, Loader2, ChevronDown, ChevronUp,
  AlertTriangle, Users, Zap, PieChart, Download,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";

// ── Helpers ───────────────────────────────────────────────────
function fmtCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return "—";
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function fmtAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const CHART = {
  cash: "#06b6d4",
  revenue: "#3b82f6",
  burn: "#ef4444",
  ebitda: "#8b5cf6",
  grossProfit: "#22c55e",
  warn: "#f59e0b",
  muted: "#94a3b8",
};

function ChartTip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">
            {typeof e.value === "number" ? fmtAxis(e.value) : e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Series B benchmark bands (SaaS). Sources: Bessemer, ICONIQ, OpenView 2024-25.
const BENCHMARKS = {
  runway:     { great: 18,  ok: 12,  poor: 6  },
  burnMult:   { great: 1,   ok: 2,   poor: 3  },  // lower is better
  rule40:     { great: 40,  ok: 20,  poor: 0  },
  grossMargin:{ great: 70,  ok: 60,  poor: 40 },
  ltvCac:     { great: 3,   ok: 2,   poor: 1  },
  cacPayback: { great: 12,  ok: 18,  poor: 24 }, // months, lower better
  nrr:        { great: 120, ok: 105, poor: 90 },
  mom:        { great: 15,  ok: 8,   poor: 3  },
  concentration: { great: 15, ok: 25, poor: 40 }, // top customer %, lower better
};

function benchColor(v: number | null, band: { great: number; ok: number; poor: number }, lowerBetter = false): string {
  if (v === null || !Number.isFinite(v)) return "text-muted-foreground";
  if (lowerBetter) {
    if (v <= band.great) return "text-emerald-600 dark:text-emerald-400";
    if (v <= band.ok)    return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }
  if (v >= band.great) return "text-emerald-600 dark:text-emerald-400";
  if (v >= band.ok)    return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function benchLabel(v: number | null, band: { great: number; ok: number; poor: number }, lowerBetter = false): string {
  if (v === null || !Number.isFinite(v)) return "No data";
  if (lowerBetter) {
    if (v <= band.great) return "Top quartile";
    if (v <= band.ok)    return "On track";
    return "Below benchmark";
  }
  if (v >= band.great) return "Top quartile";
  if (v >= band.ok)    return "On track";
  return "Below benchmark";
}

type KpiCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  hint?: string;
};

function KpiCard({ icon: Icon, label, value, sub, tone, hint }: KpiCardProps) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold leading-tight ${tone ?? ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{hint}</p>}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────
export default function CFODashboard() {
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [strategyResults, setStrategyResults] = useState<Record<string, string>>({});

  const { data: bankBalances } = trpc.banking.balances.useQuery();
  const { data: invoicesList } = trpc.invoices.list.useQuery();
  const { data: modelData } = trpc.financialModel.list.useQuery({});
  const { data: kpiGoals } = trpc.kpiGoals.list.useQuery({ year: new Date().getFullYear() });

  // ── Cash ────────────────────────────────────────────────────
  const cashPosition = useMemo(() =>
    bankBalances?.accounts?.reduce(
      (s: number, a: any) => s + (a.currentBalance ?? a.availableBalance ?? 0), 0
    ) ?? 0, [bankBalances]);

  // ── Revenue (last 12 months) ────────────────────────────────
  const monthlyRevenue = useMemo(() => {
    const buckets: { key: string; label: string; revenue: number; date: Date }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        revenue: 0,
        date: d,
      });
    }
    for (const inv of (invoicesList ?? [])) {
      const d = new Date((inv as any).issueDate || (inv as any).createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = buckets.find((b) => b.key === k);
      if (bucket) bucket.revenue += parseFloat((inv as any).totalAmount || "0");
    }
    return buckets;
  }, [invoicesList]);

  const thisMonthRev = monthlyRevenue[monthlyRevenue.length - 1]?.revenue ?? 0;
  const lastMonthRev = monthlyRevenue[monthlyRevenue.length - 2]?.revenue ?? 0;
  const threeMonthAvgRev = useMemo(() =>
    monthlyRevenue.slice(-3).reduce((s, b) => s + b.revenue, 0) / 3, [monthlyRevenue]);
  const momGrowth = lastMonthRev > 0
    ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : 0;
  const yoyRev = monthlyRevenue[0]?.revenue ?? 0;
  const yoyGrowth = yoyRev > 0 ? ((thisMonthRev - yoyRev) / yoyRev) * 100 : 0;

  const arr = threeMonthAvgRev * 12;
  const netNewArr = (thisMonthRev - lastMonthRev) * 12;

  // ── Burn / Runway ───────────────────────────────────────────
  const estimatedBurn = useMemo(() => Math.max(threeMonthAvgRev * 0.7, 10000), [threeMonthAvgRev]);
  const runwayMonths = estimatedBurn > 0 ? Math.round((cashPosition / estimatedBurn) * 10) / 10 : 0;
  const zeroCashDate = useMemo(() => {
    if (!Number.isFinite(runwayMonths) || runwayMonths <= 0) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + Math.floor(runwayMonths));
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [runwayMonths]);

  // ── Burn Multiple ───────────────────────────────────────────
  const burnMultiple = netNewArr > 0 ? estimatedBurn / (netNewArr / 12) : null;

  // ── Model-driven metrics ────────────────────────────────────
  const { grossMarginPct, ebitdaMarginPct } = useMemo(() => {
    const rows = modelData ?? [];
    const y1 = rows.filter((r: any) => r.year === 1 || r.year === new Date().getFullYear());
    const find = (name: string) => y1
      .filter((r: any) => (r.metricName || "").toLowerCase() === name.toLowerCase())
      .reduce((s: number, r: any) => s + parseFloat(r.projectedValue ?? "0"), 0);
    const rev = find("revenue");
    const gp  = find("gross profit");
    const eb  = find("ebitda");
    return {
      grossMarginPct: rev > 0 ? (gp / rev) * 100 : null,
      ebitdaMarginPct: rev > 0 ? (eb / rev) * 100 : null,
    };
  }, [modelData]);

  const rule40 = (yoyGrowth || 0) + (ebitdaMarginPct ?? 0);

  // ── Unit economics from KPI goals ──────────────────────────
  const unitEcon = useMemo(() => {
    const find = (needle: string) => {
      const hit = (kpiGoals ?? []).find((k: any) =>
        (k.metricName || "").toLowerCase().includes(needle.toLowerCase())
      );
      if (!hit) return null;
      const a = parseFloat((hit as any).actualValue ?? "0");
      const t = parseFloat((hit as any).targetValue ?? "0");
      return { actual: a || null, target: t || null };
    };
    const cac = find("acquisition cost");
    const ltv = find("lifetime value");
    const ratio = find("ltv:cac");
    const computedRatio = cac?.actual && ltv?.actual ? ltv.actual / cac.actual : null;
    return {
      cac: cac?.actual,
      ltv: ltv?.actual,
      ratio: ratio?.actual ?? computedRatio,
      cacPayback: cac?.actual && grossMarginPct && threeMonthAvgRev > 0
        ? cac.actual / ((threeMonthAvgRev * (grossMarginPct / 100)) / Math.max(1, (kpiGoals ?? []).length))
        : null,
    };
  }, [kpiGoals, grossMarginPct, threeMonthAvgRev]);

  // ── Customer concentration & AR aging ──────────────────────
  const concentration = useMemo(() => {
    if (!invoicesList?.length) return { top5: [], totalRev: 0, topPct: 0 };
    const byCustomer = new Map<string, number>();
    for (const inv of invoicesList) {
      const name = (inv as any).customer?.name || `Customer ${(inv as any).customerId ?? "—"}`;
      byCustomer.set(name, (byCustomer.get(name) ?? 0) + parseFloat((inv as any).totalAmount || "0"));
    }
    const sorted = Array.from(byCustomer.entries()).sort((a, b) => b[1] - a[1]);
    const totalRev = sorted.reduce((s, [, v]) => s + v, 0);
    const top5 = sorted.slice(0, 5).map(([name, v]) => ({ name, value: v, pct: totalRev > 0 ? (v / totalRev) * 100 : 0 }));
    const topPct = top5[0]?.pct ?? 0;
    return { top5, totalRev, topPct };
  }, [invoicesList]);

  const arAging = useMemo(() => {
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
    const now = Date.now();
    for (const inv of invoicesList ?? []) {
      if ((inv as any).status === "paid" || (inv as any).status === "cancelled") continue;
      const due = (inv as any).dueDate ? new Date((inv as any).dueDate).getTime() : now;
      const days = Math.max(0, Math.floor((now - due) / 86400000));
      const amt = parseFloat((inv as any).totalAmount || "0");
      if (days === 0) buckets.current += amt;
      else if (days <= 30) buckets.d30 += amt;
      else if (days <= 60) buckets.d60 += amt;
      else buckets.d90 += amt;
    }
    return buckets;
  }, [invoicesList]);
  const totalAR = arAging.current + arAging.d30 + arAging.d60 + arAging.d90;
  const dso = thisMonthRev > 0 ? Math.round((totalAR / thisMonthRev) * 30) : null;

  // ── 18-month cash runway projection (3 scenarios) ──────────
  const runwayProjection = useMemo(() => {
    const rows: Array<{ month: string; Bear: number; Base: number; Bull: number }> = [];
    let bear = cashPosition, base = cashPosition, bull = cashPosition;
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      rows.push({
        month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        Bear: Math.max(0, Math.round(bear)),
        Base: Math.max(0, Math.round(base)),
        Bull: Math.max(0, Math.round(bull)),
      });
      // Bear: -25% revenue, same burn. Base: flat. Bull: +20% revenue.
      const revBase = threeMonthAvgRev;
      bear -= estimatedBurn - (revBase * 0.75 - revBase);
      base -= estimatedBurn - 0;
      bull -= estimatedBurn - (revBase * 0.20);
    }
    return rows;
  }, [cashPosition, estimatedBurn, threeMonthAvgRev]);

  // ── Strategy AI accordion ──────────────────────────────────
  const strategyMutation = trpc.financialReports.aiAnalysis.useMutation({
    onSuccess: (data, variables: any) => {
      const id = variables?.strategyId;
      if (id) setStrategyResults((p) => ({ ...p, [id]: data.analysis }));
    },
  });

  const handleStrategyClick = (id: string, prompt: string) => {
    if (expandedStrategy === id) { setExpandedStrategy(null); return; }
    setExpandedStrategy(id);
    if (!strategyResults[id]) {
      strategyMutation.mutate({ reportType: "cfo_strategy", reportData: prompt, strategyId: id });
    }
  };

  const strategyItems = [
    { id: "fundraising", icon: Target, label: "Fundraising Readiness Check",
      prompt: `Series B fundraising readiness. Metrics — cash $${Math.round(cashPosition)}, burn $${Math.round(estimatedBurn)}/mo, runway ${runwayMonths}mo, ARR $${Math.round(arr)}, MoM growth ${momGrowth.toFixed(1)}%, burn multiple ${burnMultiple?.toFixed(2) ?? "n/a"}, Rule of 40 ${rule40.toFixed(0)}. Produce: investor-pitch gap analysis, data-room completeness checklist, fundraise timeline (start-to-close weeks), target investor segments, and 3 must-fix risks before outreach.` },
    { id: "board_report", icon: Presentation, label: "Board Report Generator",
      prompt: `Generate a board-quality narrative using: cash $${Math.round(cashPosition)}, ARR $${Math.round(arr)}, MoM ${momGrowth.toFixed(1)}%, burn multiple ${burnMultiple?.toFixed(2) ?? "n/a"}, Rule of 40 ${rule40.toFixed(0)}, runway ${runwayMonths}mo, top-customer concentration ${concentration.topPct.toFixed(0)}%, DSO ${dso ?? "n/a"}d. Sections: highlights, KPI scorecard vs plan, risks, capital plan, asks.` },
    { id: "scenario", icon: BarChart3, label: "Scenario Planning",
      prompt: `Build Bear/Base/Bull 18-month scenarios. Anchors: cash $${Math.round(cashPosition)}, burn $${Math.round(estimatedBurn)}/mo, ARR $${Math.round(arr)}. For each: monthly cash path, hiring envelope, required ARR to sustain, decision triggers, and cost levers (rank by reversibility).` },
    { id: "tax", icon: Calculator, label: "Tax Planning",
      prompt: `Startup tax strategy given annualized revenue ~$${Math.round(threeMonthAvgRev * 12)}. Cover: §174 R&D capitalization impact, R&D tax credit eligibility + estimated value, quarterly estimated tax liability, state nexus exposure, 83(b)/QSBS posture, and entity-level optimization.` },
    { id: "compliance", icon: Shield, label: "Compliance Checklist",
      prompt: `SOX-lite / Series-B-ready controls checklist: revenue recognition (ASC 606), segregation of duties, approval matrix, month-end close calendar, vendor management, data security (SOC 2 readiness). Priority-rank and estimate effort.` },
    { id: "working_capital", icon: Activity, label: "Working Capital Analysis",
      prompt: `Analyze working capital: cash $${Math.round(cashPosition)}, DSO ${dso ?? "n/a"}d, AR aging current/30/60/90+ = ${fmtCompact(arAging.current)}/${fmtCompact(arAging.d30)}/${fmtCompact(arAging.d60)}/${fmtCompact(arAging.d90)}. Recommend: collections actions, payment terms, factoring/ABL fit, CCC improvements, and cash-conversion targets for next quarter.` },
  ];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            CFO Dashboard
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Series B operating view — cash, growth, unit economics, and concentration, benchmarked against SaaS peers.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => handleStrategyClick("board_report", strategyItems[1].prompt)}>
          <Download className="h-3 w-3 mr-1" /> Board Pack
        </Button>
      </div>

      {/* ── 1 · LIQUIDITY ───────────────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1 · Liquidity</h3>
        <span className="text-[11px] text-muted-foreground/70">Can we pay the bills, and for how long?</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard icon={DollarSign} label="Cash" value={fmtCompact(cashPosition)} sub="Across all accounts" />
        <KpiCard icon={Flame} label="Net Burn" value={`${fmtCompact(estimatedBurn)}/mo`} sub="Trailing 3mo est." />
        <KpiCard icon={Clock} label="Runway"
                 value={`${runwayMonths} mo`}
                 tone={benchColor(runwayMonths, BENCHMARKS.runway)}
                 hint={benchLabel(runwayMonths, BENCHMARKS.runway)} />
        <KpiCard icon={Activity} label="Zero-cash date"
                 value={zeroCashDate ?? "—"}
                 sub={zeroCashDate ? "At current burn" : "No burn detected"} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-600" /> Cash runway — 18mo scenarios
          </CardTitle>
          <CardDescription className="text-xs">Bear (-25% rev) · Base (flat) · Bull (+20% rev) · dashed line = zero cash</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={runwayProjection}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} width={55} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={0} stroke={CHART.burn} strokeDasharray="3 3" />
              <Area type="monotone" dataKey="Bull" stroke={CHART.grossProfit} fill={CHART.grossProfit} fillOpacity={0.12} />
              <Area type="monotone" dataKey="Base" stroke={CHART.cash}        fill={CHART.cash}        fillOpacity={0.18} />
              <Area type="monotone" dataKey="Bear" stroke={CHART.burn}        fill={CHART.burn}        fillOpacity={0.1}  />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── 2 · GROWTH QUALITY ──────────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">2 · Growth Quality</h3>
        <span className="text-[11px] text-muted-foreground/70">How fast, and is it durable?</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard icon={TrendingUp} label="ARR" value={fmtCompact(arr)} sub="From trailing 3mo avg" />
        <KpiCard icon={Zap} label="Net New ARR"
                 value={fmtCompact(netNewArr)}
                 tone={netNewArr >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                 sub="MoM change × 12" />
        <KpiCard icon={Activity} label="MoM Growth"
                 value={`${momGrowth >= 0 ? "+" : ""}${momGrowth.toFixed(1)}%`}
                 tone={benchColor(momGrowth, BENCHMARKS.mom)}
                 hint={benchLabel(momGrowth, BENCHMARKS.mom)} />
        <KpiCard icon={TrendingUp} label="YoY Growth"
                 value={`${yoyGrowth >= 0 ? "+" : ""}${yoyGrowth.toFixed(0)}%`}
                 sub="vs 12 months ago" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" /> Revenue trajectory — trailing 12mo
          </CardTitle>
          <CardDescription className="text-xs">
            3mo avg {fmtCompact(threeMonthAvgRev)} · YoY {yoyGrowth >= 0 ? "+" : ""}{yoyGrowth.toFixed(0)}%
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} width={55} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="revenue" fill={CHART.revenue} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── 3 · CAPITAL EFFICIENCY ──────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3 · Capital Efficiency</h3>
        <span className="text-[11px] text-muted-foreground/70">How much growth per dollar burned?</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard icon={PieChart} label="Burn Multiple"
                 value={burnMultiple !== null ? burnMultiple.toFixed(2) : "—"}
                 tone={benchColor(burnMultiple, BENCHMARKS.burnMult, true)}
                 hint={burnMultiple !== null ? benchLabel(burnMultiple, BENCHMARKS.burnMult, true) : "Needs net-new ARR"} />
        <KpiCard icon={Target} label="Rule of 40"
                 value={`${rule40.toFixed(0)}`}
                 tone={benchColor(rule40, BENCHMARKS.rule40)}
                 hint={benchLabel(rule40, BENCHMARKS.rule40)} />
        <KpiCard icon={BarChart3} label="Gross Margin"
                 value={grossMarginPct !== null ? `${grossMarginPct.toFixed(0)}%` : "—"}
                 tone={benchColor(grossMarginPct, BENCHMARKS.grossMargin)}
                 hint={grossMarginPct !== null ? benchLabel(grossMarginPct, BENCHMARKS.grossMargin) : "Needs model"} />
        <KpiCard icon={Users} label="LTV : CAC"
                 value={unitEcon.ratio ? `${unitEcon.ratio.toFixed(1)}x` : "—"}
                 tone={benchColor(unitEcon.ratio, BENCHMARKS.ltvCac)}
                 hint={unitEcon.ratio ? benchLabel(unitEcon.ratio, BENCHMARKS.ltvCac) : "Add KPI goals"} />
      </div>

      {/* ── 4 · RISK RADAR ──────────────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">4 · Risk Radar</h3>
        <span className="text-[11px] text-muted-foreground/70">Concentration and collections exposure.</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" /> Customer concentration
            </CardTitle>
            <CardDescription className="text-xs">
              Top customer {concentration.topPct.toFixed(0)}% ·{" "}
              <span className={benchColor(concentration.topPct, BENCHMARKS.concentration, true)}>
                {benchLabel(concentration.topPct, BENCHMARKS.concentration, true)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {concentration.top5.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No customer revenue yet.</p>
            ) : (
              <div className="space-y-2">
                {concentration.top5.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] w-5 text-muted-foreground">{i + 1}.</span>
                    <span className="text-xs flex-1 truncate">{c.name}</span>
                    <div className="w-32 bg-muted rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                    </div>
                    <span className="text-[11px] font-medium w-16 text-right">{formatCurrency(c.value)}</span>
                    <span className="text-[11px] text-muted-foreground w-10 text-right">{c.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> AR aging & DSO
            </CardTitle>
            <CardDescription className="text-xs">
              Total AR {fmtCompact(totalAR)} · DSO {dso !== null ? `${dso}d` : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={[
                { bucket: "Current", value: arAging.current, fill: CHART.grossProfit },
                { bucket: "1-30d",   value: arAging.d30,     fill: CHART.cash },
                { bucket: "31-60d",  value: arAging.d60,     fill: CHART.warn },
                { bucket: "60+d",    value: arAging.d90,     fill: CHART.burn },
              ]}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} width={55} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {[CHART.grossProfit, CHART.cash, CHART.warn, CHART.burn].map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {arAging.d90 > 0 && (
              <p className="text-[11px] text-red-600 mt-1">
                {fmtCompact(arAging.d90)} over 60 days — collections follow-up recommended.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 5 · ACTIONS ─────────────────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">5 · Actions</h3>
        <span className="text-[11px] text-muted-foreground/70">Click a topic to generate analysis grounded in your current metrics.</span>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> CFO Strategy · AI advisors
          </CardTitle>
          <CardDescription className="text-xs">Click a topic to generate analysis grounded in your current metrics.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {strategyItems.map(({ id, icon: Icon, label, prompt }) => (
              <div key={id}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => handleStrategyClick(id, prompt)}
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {strategyMutation.isPending && expandedStrategy === id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : expandedStrategy === id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {expandedStrategy === id && strategyResults[id] && (
                  <div className="px-4 pb-4">
                    <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" /> AI Analysis
                      </div>
                      {strategyResults[id]}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
