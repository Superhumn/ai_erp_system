// Wider financials snapshot for the logged-in existing-investor portal.
//
// Distinct from `dataRoomLiveFinancials.ts` which is intentionally narrow
// for prospective investors. Existing shareholders have a real claim on
// the company, so they get a deeper view: 13 months of revenue + burn
// buckets (so YoY is actually computable), growth rates, ARR, burn
// multiple, margins (if QuickBooks P&L is wired), and outstanding AR.
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
  // 13 buckets (oldest → newest). We need 12 for the trailing-12-month
  // trend plus one extra at the start so the same-month-prior-year bucket
  // exists and yoyGrowthPct can actually be computed.
  months: MonthlyBucket[];
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

export async function computeInvestorPortalFinancials(options?: {
  companyId?: number;
}): Promise<InvestorPortalFinancials> {
  const now = new Date();
  const companyId = options?.companyId;

  // 13 monthly buckets, oldest first. The 13th (oldest) bucket is the
  // same-month one year ago, used only for YoY. Downstream consumers
  // still treat `last 12` as the headline trend.
  const BUCKETS = 13;
  const buckets: MonthlyBucket[] = [];
  for (let i = BUCKETS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ monthKey: monthKey(d), label: shortLabel(d), revenue: 0, burn: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.monthKey, b]));

  // Scope to the investor's company — prevents cross-company aggregation
  // in multi-tenant setups and keeps the aggregate small on single-tenant
  // installs too.
  const [invoices, expenseTxns, cash, margins] = await Promise.all([
    db.getInvoices(companyId ? { companyId } : undefined),
    db.getTransactions({ type: "expense", ...(companyId ? { companyId } : {}) }),
    getCashBalance(),
    getMargins(),
  ]);

  // The oldest bucket defines the earliest date we care about — drop
  // anything older in memory since the DB helper doesn't support a
  // date-range filter today. When this becomes a hot path, the right
  // next step is a date-scoped db helper (see Plan section in PR).
  const earliest = new Date(now.getFullYear(), now.getMonth() - (BUCKETS - 1), 1).getTime();

  for (const inv of invoices) {
    const raw = (inv as { issueDate?: Date | string; createdAt?: Date | string })
      .issueDate ?? (inv as { createdAt?: Date | string }).createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (d.getTime() < earliest) continue;
    const bucket = byKey.get(monthKey(d));
    if (bucket) {
      bucket.revenue += parseAmount((inv as { totalAmount?: unknown }).totalAmount);
    }
  }
  for (const t of expenseTxns) {
    const raw = (t as { date?: Date | string; createdAt?: Date | string })
      .date ?? (t as { createdAt?: Date | string }).createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (d.getTime() < earliest) continue;
    const bucket = byKey.get(monthKey(d));
    if (bucket) {
      bucket.burn += Math.abs(parseAmount((t as { totalAmount?: unknown }).totalAmount));
    }
  }

  const last = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];
  // With 13 buckets, index 0 is the same month one year before `last`.
  const prevYear = buckets[0];
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
  };
}
