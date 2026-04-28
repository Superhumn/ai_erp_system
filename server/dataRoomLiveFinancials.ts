// Computes the trimmed, investor-facing metric shape for the data room's
// live current-financials page. This is intentionally a narrow subset of
// the CFO dashboard — no AR aging detail, customer concentration, or risk
// signals.
//
// Kept on the server so the public (unauth, link-code-scoped) procedure
// never has to expose raw invoice / bank / expense rows to the browser.
//
// All money is in whatever currency the underlying invoices / bank
// accounts use; we do not normalize here. The investor page renders
// whatever we hand back.

import * as db from "./db";

export interface LiveFinancialsSnapshot {
  currency: string;
  asOf: string; // ISO timestamp — when this snapshot was computed
  cash: number;
  last3MoRevenue: Array<{ monthKey: string; label: string; revenue: number }>;
  last3MoBurn: Array<{ monthKey: string; label: string; burn: number }>;
  avgMonthlyBurn: number;
  runwayMonths: number | null; // null when burn <= 0 (runway indeterminate)
  // AR total is only included when `includeAr` is enabled on the room.
  arTotal: number | null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Best-effort current cash balance from Mercury. If Mercury is not
// configured or the API call fails, we return 0 rather than throwing —
// the public page should degrade gracefully.
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

export async function computeLiveFinancials(opts: {
  includeAr: boolean;
  companyId?: number;
}): Promise<LiveFinancialsSnapshot> {
  const now = new Date();
  const buckets: Array<{ monthKey: string; label: string; date: Date }> = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ monthKey: monthKey(d), label: monthLabel(d), date: d });
  }
  // The earliest date we care about — drop anything older in memory,
  // since `db.getInvoices`/`getTransactions` don't yet support a
  // date-range filter. A date-scoped helper is the right follow-up when
  // this page turns into a hot path.
  const earliest = buckets[0].date.getTime();

  // Scope to the room's company so a multi-tenant install doesn't
  // aggregate revenue/expenses across every customer in the DB.
  const companyId = opts.companyId;

  // Revenue from invoices, bucketed by issueDate (fallback createdAt).
  const invoices = await db.getInvoices(companyId ? { companyId } : undefined);
  const revenueByMonth: Record<string, number> = Object.fromEntries(
    buckets.map((b) => [b.monthKey, 0]),
  );
  for (const inv of invoices) {
    const raw = (inv as { issueDate?: Date | string; createdAt?: Date | string })
      .issueDate ?? (inv as { createdAt?: Date | string }).createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (d.getTime() < earliest) continue;
    const k = monthKey(d);
    if (k in revenueByMonth) {
      revenueByMonth[k] += parseAmount(
        (inv as { totalAmount?: unknown }).totalAmount,
      );
    }
  }
  const last3MoRevenue = buckets.map((b) => ({
    monthKey: b.monthKey,
    label: b.label,
    revenue: revenueByMonth[b.monthKey],
  }));

  // Burn from the in-system expense ledger. We do not wire QuickBooks here —
  // the point of the live page is to stay simple and reflect the ERP's
  // authoritative view rather than depending on a third-party sync.
  const expenseTxns = await db.getTransactions({ type: "expense", ...(companyId ? { companyId } : {}) });
  const burnByMonth: Record<string, number> = Object.fromEntries(
    buckets.map((b) => [b.monthKey, 0]),
  );
  for (const t of expenseTxns) {
    const raw = (t as { date?: Date | string; createdAt?: Date | string })
      .date ?? (t as { createdAt?: Date | string }).createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (d.getTime() < earliest) continue;
    const k = monthKey(d);
    if (k in burnByMonth) {
      burnByMonth[k] += Math.abs(
        parseAmount((t as { totalAmount?: unknown }).totalAmount),
      );
    }
  }
  const last3MoBurn = buckets.map((b) => ({
    monthKey: b.monthKey,
    label: b.label,
    burn: burnByMonth[b.monthKey],
  }));

  const monthsWithBurn = last3MoBurn.filter((b) => b.burn > 0).length;
  const avgMonthlyBurn =
    monthsWithBurn > 0
      ? last3MoBurn.reduce((s, b) => s + b.burn, 0) / monthsWithBurn
      : 0;

  const cash = await getCashBalance();
  const runwayMonths =
    avgMonthlyBurn > 0
      ? Math.round((cash / avgMonthlyBurn) * 10) / 10
      : null;

  let arTotal: number | null = null;
  if (opts.includeAr) {
    // AR = unpaid / partial invoices. We sum (totalAmount - paidAmount)
    // across non-void invoices.
    arTotal = 0;
    for (const inv of invoices) {
      const status = (inv as { status?: string }).status;
      if (status === "paid" || status === "void" || status === "cancelled") continue;
      const total = parseAmount((inv as { totalAmount?: unknown }).totalAmount);
      const paid = parseAmount((inv as { paidAmount?: unknown }).paidAmount);
      arTotal += Math.max(0, total - paid);
    }
  }

  return {
    currency: "USD",
    asOf: now.toISOString(),
    cash,
    last3MoRevenue,
    last3MoBurn,
    avgMonthlyBurn,
    runwayMonths,
    arTotal,
  };
}
