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
  revPerFte:  { great: 200_000, ok: 150_000, poor: 100_000 },
  forecastAcc:{ great: 90,  ok: 80,  poor: 70 }, // % accuracy, higher is better
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
  const { data: employees } = trpc.hr.employees.list.useQuery({ status: "active" });
  const { data: expenseTxns } = trpc.transactions.list.useQuery({ type: "expense" });
  const { data: openDeals } = trpc.crm.deals.list.useQuery({ status: "open" });
  const { data: allPOs } = trpc.purchaseOrders.list.useQuery();

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

  // YoY: compare current month to the same calendar month 12 months ago
  const yoyBaseRev = useMemo(() => {
    const now = new Date();
    const sameMonthLastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const key = `${sameMonthLastYear.getFullYear()}-${sameMonthLastYear.getMonth()}`;
    let total = 0;
    for (const inv of (invoicesList ?? [])) {
      const d = new Date((inv as any).issueDate || (inv as any).createdAt);
      if (`${d.getFullYear()}-${d.getMonth()}` === key)
        total += parseFloat((inv as any).totalAmount || "0");
    }
    return total;
  }, [invoicesList]);
  const yoyGrowth = yoyBaseRev > 0 ? ((thisMonthRev - yoyBaseRev) / yoyBaseRev) * 100 : 0;

  const arr = threeMonthAvgRev * 12;
  const netNewArr = (thisMonthRev - lastMonthRev) * 12;

  // ── Burn / Runway ───────────────────────────────────────────
  // Prefer actual expenses (trailing 3mo avg) when available; fall back to proxy.
  const { actualBurn, burnSource } = useMemo(() => {
    const txns = expenseTxns ?? [];
    if (txns.length === 0) return { actualBurn: 0, burnSource: "none" as const };
    const now = new Date();
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[`${d.getFullYear()}-${d.getMonth()}`] = 0;
    }
    for (const t of txns) {
      const d = new Date((t as any).date || (t as any).createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (k in buckets) buckets[k] += Math.abs(parseFloat((t as any).totalAmount || "0"));
    }
    const sum = Object.values(buckets).reduce((a, b) => a + b, 0);
    const monthsWithData = Object.values(buckets).filter((v) => v > 0).length;
    if (monthsWithData === 0) return { actualBurn: 0, burnSource: "none" as const };
    return { actualBurn: sum / monthsWithData, burnSource: "ledger" as const };
  }, [expenseTxns]);

  const estimatedBurn = useMemo(() =>
    actualBurn > 0 ? actualBurn : Math.max(threeMonthAvgRev * 0.7, 10000),
    [actualBurn, threeMonthAvgRev]);
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

  // Headcount & revenue per FTE
  const headcount = (employees ?? []).length;
  const revPerFte = headcount > 0 ? arr / headcount : null;
  const burnPerFte = headcount > 0 ? estimatedBurn / headcount : null;

  // DPO — Days Payable Outstanding
  const dpo = useMemo(() => {
    const pos = allPOs ?? [];
    const unpaid = pos.filter((p: any) =>
      p.status !== "paid" && p.status !== "cancelled" && p.status !== "closed");
    const outstandingAP = unpaid.reduce((s: number, p: any) => s + parseFloat(p.totalAmount || "0"), 0);
    const monthlyCogsProxy = estimatedBurn * 0.5; // rough — assumes ~50% of burn is vendor-paid
    return monthlyCogsProxy > 0 ? Math.round((outstandingAP / monthlyCogsProxy) * 30) : null;
  }, [allPOs, estimatedBurn]);

  // Pipeline (from open CRM deals)
  const pipeline = useMemo(() => {
    const deals = openDeals ?? [];
    const open = deals.reduce((s: number, d: any) => s + parseFloat(d.amount || "0"), 0);
    const weighted = deals.reduce((s: number, d: any) =>
      s + parseFloat(d.amount || "0") * ((d.probability ?? 50) / 100), 0);
    const quarterlyRunRate = threeMonthAvgRev * 3;
    const coverage = quarterlyRunRate > 0 ? open / quarterlyRunRate : null;
    return { open, weighted, coverage, count: deals.length };
  }, [openDeals, threeMonthAvgRev]);

  // Forecast accuracy — how close past projections tracked actuals
  const forecastAccuracy = useMemo(() => {
    const rows = modelData ?? [];
    const withBoth = rows.filter((r: any) =>
      r.projectedValue && r.actualValue &&
      parseFloat(r.projectedValue) !== 0);
    if (withBoth.length === 0) return { accuracy: null, samples: 0 };
    const variances = withBoth.map((r: any) => {
      const p = parseFloat(r.projectedValue);
      const a = parseFloat(r.actualValue);
      return Math.abs(a - p) / Math.abs(p);
    });
    const meanVariance = variances.reduce((s, v) => s + v, 0) / variances.length;
    return { accuracy: Math.max(0, (1 - meanVariance) * 100), samples: withBoth.length };
  }, [modelData]);

  // Margin trajectory from financial model (multi-year projection)
  const marginTrajectory = useMemo(() => {
    const rows = modelData ?? [];
    const byYear: Record<number, { revenue: number; gp: number; eb: number }> = {};
    for (const r of rows) {
      const y = (r as any).year;
      if (!y) continue;
      if (!byYear[y]) byYear[y] = { revenue: 0, gp: 0, eb: 0 };
      const val = parseFloat((r as any).projectedValue ?? "0");
      const name = ((r as any).metricName || "").toLowerCase();
      if (name === "revenue") byYear[y].revenue += val;
      else if (name === "gross profit") byYear[y].gp += val;
      else if (name === "ebitda") byYear[y].eb += val;
    }
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([yr, d]) => ({
        year: `Y${yr}`,
        "Gross Margin %": d.revenue > 0 ? Math.round((d.gp / d.revenue) * 1000) / 10 : 0,
        "EBITDA Margin %": d.revenue > 0 ? Math.round((d.eb / d.revenue) * 1000) / 10 : 0,
      }));
  }, [modelData]);

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
  const cashGapDays = dso !== null && dpo !== null ? dso - dpo : null;

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

      {/* Executive summary banner — section health + top concern */}
      {(() => {
        const dot = (ok: boolean, warn: boolean) =>
          ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-red-500";
        const liquidityDot = dot(runwayMonths >= 18, runwayMonths >= 12);
        const growthDot    = dot(momGrowth >= 15, momGrowth >= 8);
        const efficiencyDot = burnMultiple === null
          ? "bg-muted-foreground"
          : dot(burnMultiple <= 1, burnMultiple <= 2);
        const riskDot      = dot(concentration.topPct <= 15 && arAging.d90 === 0, concentration.topPct <= 25);

        let headline = "All sections on track.";
        if (runwayMonths > 0 && runwayMonths < 6)
          headline = `Runway ${runwayMonths}mo — cash is the headline. Cut burn or accelerate a raise this week.`;
        else if (concentration.topPct > 40)
          headline = `Customer concentration ${concentration.topPct.toFixed(0)}% — diversification should be a board topic.`;
        else if (runwayMonths > 0 && runwayMonths < 12)
          headline = `Runway ${runwayMonths}mo — plan the next raise in the current quarter.`;
        else if (burnMultiple !== null && burnMultiple > 3)
          headline = `Burn multiple ${burnMultiple.toFixed(2)} — growth efficiency is off; revisit pricing or CAC.`;
        else if (momGrowth < 3)
          headline = `Growth slowing (${momGrowth.toFixed(1)}% MoM). Pipeline review recommended.`;
        else if (arAging.d90 > 0)
          headline = `${fmtCompact(arAging.d90)} AR over 60 days — trigger collections cadence.`;

        return (
          <div className="border rounded-lg bg-muted/30 px-3 py-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${liquidityDot}`} />Liquidity</span>
              <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${growthDot}`} />Growth</span>
              <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${efficiencyDot}`} />Efficiency</span>
              <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${riskDot}`} />Risk</span>
            </div>
            <span className="text-xs text-foreground flex-1 min-w-0">{headline}</span>
          </div>
        );
      })()}

      {/* ── 1 · LIQUIDITY ───────────────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1 · Liquidity</h3>
        <span className="text-[11px] text-muted-foreground/70">Can we pay the bills, and for how long?</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard icon={DollarSign} label="Cash" value={fmtCompact(cashPosition)} sub="Across all accounts" />
        <KpiCard icon={Flame} label="Net Burn"
                 value={`${fmtCompact(estimatedBurn)}/mo`}
                 sub={burnSource === "ledger" ? "From expense ledger · 3mo avg" : "Proxy estimate — no ledger data"} />
        <KpiCard icon={Clock} label="Runway"
                 value={`${runwayMonths} mo`}
                 tone={benchColor(runwayMonths, BENCHMARKS.runway)}
                 hint={benchLabel(runwayMonths, BENCHMARKS.runway)} />
        <KpiCard icon={Activity} label="Zero-cash date"
                 value={zeroCashDate ?? "—"}
                 sub={
                   cashPosition <= 0
                     ? "No cash available"
                     : estimatedBurn <= 0
                       ? "No burn detected"
                       : zeroCashDate
                         ? "At current burn"
                         : "At current burn"
                 } />
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
                 sub="vs same month last year" />
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

      {pipeline.count > 0 && (
        <div className="border rounded-lg bg-muted/20 px-3 py-2 flex items-center gap-4 flex-wrap text-xs">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3 w-3" /> Pipeline
          </span>
          <span><span className="text-muted-foreground">Open:</span> <span className="font-semibold">{fmtCompact(pipeline.open)}</span> <span className="text-muted-foreground">({pipeline.count} deals)</span></span>
          <span><span className="text-muted-foreground">Weighted:</span> <span className="font-semibold">{fmtCompact(pipeline.weighted)}</span></span>
          {pipeline.coverage !== null && (
            <span>
              <span className="text-muted-foreground">Coverage:</span>{" "}
              <span className={`font-semibold ${pipeline.coverage >= 3 ? "text-emerald-600 dark:text-emerald-400" : pipeline.coverage >= 2 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                {pipeline.coverage.toFixed(1)}x
              </span>{" "}
              <span className="text-[10px] text-muted-foreground">vs last qtr run-rate (3x target)</span>
            </span>
          )}
        </div>
      )}

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
        <KpiCard icon={Users} label="Headcount"
                 value={headcount > 0 ? String(headcount) : "—"}
                 sub="Active employees" />
        <KpiCard icon={TrendingUp} label="Revenue / FTE"
                 value={revPerFte ? fmtCompact(revPerFte) : "—"}
                 tone={benchColor(revPerFte, BENCHMARKS.revPerFte)}
                 hint={revPerFte ? benchLabel(revPerFte, BENCHMARKS.revPerFte) : "Add headcount"} />
        <KpiCard icon={Flame} label="Burn / FTE"
                 value={burnPerFte ? `${fmtCompact(burnPerFte)}/mo` : "—"}
                 sub="Monthly cost per head" />
        <KpiCard icon={Target} label="Forecast Accuracy"
                 value={forecastAccuracy.accuracy !== null ? `${forecastAccuracy.accuracy.toFixed(0)}%` : "—"}
                 tone={benchColor(forecastAccuracy.accuracy, BENCHMARKS.forecastAcc)}
                 hint={forecastAccuracy.accuracy !== null
                   ? `${benchLabel(forecastAccuracy.accuracy, BENCHMARKS.forecastAcc)} · ${forecastAccuracy.samples} samples`
                   : "Enter actuals"} />
      </div>

      {marginTrajectory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-600" /> Margin trajectory — financial model
            </CardTitle>
            <CardDescription className="text-xs">
              Projected gross and EBITDA margin % by year. Series B benchmark: gross ≥70%, EBITDA improving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={marginTrajectory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} width={45} />
                <Tooltip content={<ChartTip />} />
                <ReferenceLine y={70} stroke={CHART.grossProfit} strokeDasharray="2 3" label={{ value: "70% target", fontSize: 9, fill: CHART.grossProfit, position: "insideTopRight" }} />
                <Line type="monotone" dataKey="Gross Margin %" stroke={CHART.grossProfit} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="EBITDA Margin %" stroke={CHART.ebitda} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── 4 · RISK RADAR ──────────────────────────────────── */}
      <div className="flex items-baseline gap-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">4 · Risk Radar</h3>
        <span className="text-[11px] text-muted-foreground/70">Concentration and collections exposure.</span>
      </div>

      {(dso !== null || dpo !== null) && (
        <div className="border rounded-lg bg-muted/20 px-3 py-2 flex items-center gap-4 flex-wrap text-xs">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> Working Capital
          </span>
          <span><span className="text-muted-foreground">DSO:</span> <span className="font-semibold">{dso !== null ? `${dso}d` : "—"}</span></span>
          <span><span className="text-muted-foreground">DPO:</span> <span className="font-semibold">{dpo !== null ? `${dpo}d` : "—"}</span></span>
          {cashGapDays !== null && (
            <span>
              <span className="text-muted-foreground">Cash gap:</span>{" "}
              <span className={`font-semibold ${cashGapDays > 30 ? "text-red-600 dark:text-red-400" : cashGapDays > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {cashGapDays > 0 ? "+" : ""}{cashGapDays}d
              </span>{" "}
              <span className="text-[10px] text-muted-foreground">
                {cashGapDays > 0 ? "we finance customers" : "vendors finance us"}
              </span>
            </span>
          )}
        </div>
      )}

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
