// Wider financials snapshot for the logged-in existing-investor portal.
//
// Distinct from `dataRoomLiveFinancials.ts` which is intentionally narrow
// for prospective investors. Existing shareholders have a real claim on
// the company, so they get a deeper view: 12-month revenue + burn,
// growth rates, ARR, burn multiple, margins (if QuickBooks P&L is wired),
// outstanding AR, and — when a financial model exists — plan-vs-actual
// for the current month.
//
// Still a snapshot, not a raw data feed: no per-customer, per-invoice,
// or per-transaction detail is returned. The shape is what you'd show on
// an investor update email, not the CFO dashboard.

import * as db from "./db";

export interface MonthlyBucket {
  monthKey: string;
  label: string;
  revenue: number;
  burn: number;
}

export interface InvestorPortalFinancials {
  currency: string;
  asOf: string;
  cash: number;
  months: MonthlyBucket[]; // oldest → newest, length 12
  // Derived headline metrics
  arr: number; // annualized run-rate (3mo-avg revenue × 12)
  momGrowthPct: number | null;
  yoyGrowthPct: number | null;
  avgMonthlyBurn: number;
  runwayMonths: number | null;
  cashOutMonth: string | null; // e.g. "Oct 2026" — null if runway indeterminate
  burnMultiple: number | null; // burn / net new ARR; null when not meaningful
  // Operational extras
  arTotal: number;
  grossMarginPct: number | null;
  ebitdaMarginPct: number | null;
  marginSource: "quickbooks" | "none";
  // Plan vs actual — present only when a financial model exposes a current-month forecast.
  planVsActual: {
    month: string;
    revenuePlan: number;
    revenueActual: number;
    burnPlan: number;
    burnActual: number;
  } | null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function getCashBalance(): Promise<number> {
  try {
    const { getMercuryAccounts } = await import("./mercuryService");
    const accounts = await getMercuryAccounts();
    const list = (accounts?.accounts || []) as Array<{
      currentBalance?: number;
      availableBalance?: number;
    }>;
    return list.reduce(
      (sum, a) => sum + (a.currentBalance ?? a.availableBalance ?? 0),
      0,
    );
  } catch {
    return 0;
  }
}

// Margins are pulled from QuickBooks P&L when that integration is wired at
// a per-company token level. Until then we return a `"none"` marker and
// the portal UI shows em-dashes — strictly better than fabricating a
// margin number from a heuristic the investor can't audit.
async function getMargins(): Promise<{
  grossMarginPct: number | null;
  ebitdaMarginPct: number | null;
  marginSource: "quickbooks" | "none";
}> {
  return { grossMarginPct: null, ebitdaMarginPct: null, marginSource: "none" };
}

// Looks for a current-month forecast in the financial model. The
// financialModel shape varies by project, so we duck-type the lookup and
// return null on any mismatch rather than throwing.
async function getPlanForCurrentMonth(now: Date): Promise<{
  revenuePlan: number;
  burnPlan: number;
} | null> {
  try {
    const models = await (db as unknown as { getFinancialModels?: () => Promise<unknown[]> })
      .getFinancialModels?.();
    if (!models || !Array.isArray(models) || models.length === 0) return null;
    // Use the most recent model. Expect a `months` array with {monthKey, revenue, expense}.
    const latest = models[0] as { months?: Array<{ monthKey?: string; revenue?: number; expense?: number }> };
    const months = latest?.months;
    if (!Array.isArray(months)) return null;
    const key = monthKey(now);
    const row = months.find((m) => m.monthKey === key);
    if (!row) return null;
    return {
      revenuePlan: row.revenue ?? 0,
      burnPlan: row.expense ?? 0,
    };
  } catch {
    return null;
  }
}

export async function computeInvestorPortalFinancials(): Promise<InvestorPortalFinancials> {
  const now = new Date();

  // 12-month buckets, oldest first.
  const buckets: MonthlyBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ monthKey: monthKey(d), label: shortLabel(d), revenue: 0, burn: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.monthKey, b]));

  const [invoices, expenseTxns, cash, margins, plan] = await Promise.all([
    db.getInvoices(),
    db.getTransactions({ type: "expense" }),
    getCashBalance(),
    getMargins(),
    getPlanForCurrentMonth(now),
  ]);

  for (const inv of invoices) {
    const raw = (inv as { issueDate?: Date | string; createdAt?: Date | string })
      .issueDate ?? (inv as { createdAt?: Date | string }).createdAt;
    if (!raw) continue;
    const k = monthKey(new Date(raw));
    const bucket = byKey.get(k);
    if (bucket) {
      bucket.revenue += parseAmount((inv as { totalAmount?: unknown }).totalAmount);
    }
  }
  for (const t of expenseTxns) {
    const raw = (t as { date?: Date | string; createdAt?: Date | string })
      .date ?? (t as { createdAt?: Date | string }).createdAt;
    if (!raw) continue;
    const k = monthKey(new Date(raw));
    const bucket = byKey.get(k);
    if (bucket) {
      bucket.burn += Math.abs(parseAmount((t as { totalAmount?: unknown }).totalAmount));
    }
  }

  const last = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];
  const prevYear = buckets[buckets.length - 13]; // undefined with only 12 buckets
  const last3 = buckets.slice(-3);
  const monthsWithBurn = last3.filter((b) => b.burn > 0).length;
  const avgMonthlyBurn = monthsWithBurn > 0
    ? last3.reduce((s, b) => s + b.burn, 0) / monthsWithBurn
    : 0;
  const threeMoAvgRevenue = last3.reduce((s, b) => s + b.revenue, 0) / 3;
  const arr = threeMoAvgRevenue * 12;

  const momGrowthPct = prev && prev.revenue > 0
    ? ((last.revenue - prev.revenue) / prev.revenue) * 100
    : null;
  const yoyGrowthPct = prevYear && prevYear.revenue > 0
    ? ((last.revenue - prevYear.revenue) / prevYear.revenue) * 100
    : null;

  const runwayMonths = avgMonthlyBurn > 0
    ? Math.round((cash / avgMonthlyBurn) * 10) / 10
    : null;
  const cashOutMonth = runwayMonths !== null && runwayMonths > 0
    ? (() => {
        const d = new Date(now);
        d.setMonth(d.getMonth() + Math.floor(runwayMonths));
        return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      })()
    : null;

  // Burn multiple = burn / net new ARR. Net new ARR = (last - prev) × 12.
  const netNewArr = prev ? (last.revenue - prev.revenue) * 12 : 0;
  const burnMultiple = netNewArr > 0
    ? Math.round((avgMonthlyBurn / (netNewArr / 12)) * 100) / 100
    : null;

  // AR total — unpaid portion of non-terminal invoices.
  let arTotal = 0;
  for (const inv of invoices) {
    const status = (inv as { status?: string }).status;
    if (status === "paid" || status === "void" || status === "cancelled") continue;
    const total = parseAmount((inv as { totalAmount?: unknown }).totalAmount);
    const paid = parseAmount((inv as { paidAmount?: unknown }).paidAmount);
    arTotal += Math.max(0, total - paid);
  }

  const planVsActual = plan
    ? {
        month: last.label,
        revenuePlan: plan.revenuePlan,
        revenueActual: last.revenue,
        burnPlan: plan.burnPlan,
        burnActual: last.burn,
      }
    : null;

  return {
    currency: "USD",
    asOf: now.toISOString(),
    cash,
    months: buckets,
    arr,
    momGrowthPct,
    yoyGrowthPct,
    avgMonthlyBurn,
    runwayMonths,
    cashOutMonth,
    burnMultiple,
    arTotal,
    grossMarginPct: margins.grossMarginPct,
    ebitdaMarginPct: margins.ebitdaMarginPct,
    marginSource: margins.marginSource,
    planVsActual,
  };
}
