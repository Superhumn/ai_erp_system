// CFO dashboard metrics derived from invoice aggregates.
//
// The dashboard used to download every invoice and compute these in the browser. At 1M
// invoices that response is ~430 MB. The server now aggregates per customer and per cohort
// in SQL (server/db.ts getCfoAggregates) and these pure functions turn those rows
// into the same figures the browser code produced. Formulas are unchanged; see each note.

export const DAY_MS = 86_400_000;

/** One customer's invoices, pre-aggregated. Customers are keyed by display name, as before. */
export type CustomerInvoiceAgg = {
  name: string;
  count: number;
  total: number;
  /** Earliest / latest invoice time (issueDate), epoch ms. */
  firstAt: number;
  lastAt: number;
  /** Revenue in [now − 90d, now) and [now − 180d, now − 90d). */
  rev90: number;
  revPrior90: number;
  /** Revenue in the current calendar month and the same month one year earlier. */
  revThisMonth: number;
  revYearAgoMonth: number;
};

/**
 * Combine per-customer-id aggregates that share a display name into one entry, as the
 * browser did by keying its Map on the name. SQL groups by id because it is ~4× cheaper.
 */
export function mergeCustomerAggs(rows: CustomerInvoiceAgg[]): CustomerInvoiceAgg[] {
  const byName = new Map<string, CustomerInvoiceAgg>();
  for (const r of rows) {
    const c = byName.get(r.name);
    if (!c) {
      byName.set(r.name, { ...r });
      continue;
    }
    c.count += r.count;
    c.total += r.total;
    c.firstAt = Math.min(c.firstAt, r.firstAt);
    c.lastAt = Math.max(c.lastAt, r.lastAt);
    c.rev90 += r.rev90;
    c.revPrior90 += r.revPrior90;
    c.revThisMonth += r.revThisMonth;
    c.revYearAgoMonth += r.revYearAgoMonth;
  }
  return [...byName.values()];
}

/**
 * Customers acquired in each quarter of the window. `quarterStarts` holds 9 ascending epochs
 * (7 quarters ago … next quarter); cohortQ is the bucket index 0–7, like the cohort cells.
 */
export function cohortSizes(customers: CustomerInvoiceAgg[], quarterStarts: number[]): CohortSize[] {
  const counts = new Map<number, number>();
  const last = quarterStarts.length - 1;
  for (const c of customers) {
    if (c.firstAt < quarterStarts[0] || c.firstAt >= quarterStarts[last]) continue;
    let b = 0;
    while (b + 1 < last && c.firstAt >= quarterStarts[b + 1]) b++;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts].map(([cohortQ, customers]) => ({ cohortQ, customers }));
}

/** Revenue by (acquisition quarter, quarters since acquisition) for recent cohorts. */
export type CohortCell = { cohortQ: number; offset: number; revenue: number };
export type CohortSize = { cohortQ: number; customers: number };

export type RecurringProfile = {
  name: string;
  cadenceDays: number;
  avgAmount: number;
  lastOrder: number;
  daysSinceLast: number;
  status: "active" | "at_risk" | "churned";
};

/**
 * Recurring-order cadence (B2B MRR). For each customer with ≥2 invoices the mean gap
 * between consecutive invoices equals (last − first) / (count − 1).
 * Active = last order within 1.5× cadence; at risk = 1.5–3×; churned = >3×.
 */
export function recurringMetrics(customers: CustomerInvoiceAgg[], nowMs: number) {
  const profiles: RecurringProfile[] = [];
  for (const c of customers) {
    if (c.count < 2) continue;
    const cadenceDays = (c.lastAt - c.firstAt) / DAY_MS / (c.count - 1);
    const avgAmount = c.total / c.count;
    const daysSinceLast = (nowMs - c.lastAt) / DAY_MS;
    let status: RecurringProfile["status"] = "active";
    if (daysSinceLast > cadenceDays * 3) status = "churned";
    else if (daysSinceLast > cadenceDays * 1.5) status = "at_risk";
    profiles.push({ name: c.name, cadenceDays, avgAmount, lastOrder: c.lastAt, daysSinceLast, status });
  }
  if (profiles.length === 0) return null;
  const active = profiles.filter((p) => p.status === "active");
  const atRisk = profiles.filter((p) => p.status === "at_risk").sort((a, b) => b.avgAmount - a.avgAmount);
  const churned = profiles.filter((p) => p.status === "churned");
  const detectedMRR = active.reduce((s, p) => s + p.avgAmount / (p.cadenceDays / 30.44), 0);
  const atRiskARR = atRisk.reduce((s, p) => s + (p.avgAmount / (p.cadenceDays / 30.44)) * 12, 0);
  return {
    total: profiles.length,
    active: active.length,
    atRisk: atRisk.length,
    churned: churned.length,
    detectedMRR,
    detectedARR: detectedMRR * 12,
    atRiskARR,
    atRiskCustomers: atRisk.slice(0, 5),
  };
}

/** NRR / GRR / logo retention: this month vs the same month a year ago, per customer. */
export function retentionMetrics(customers: CustomerInvoiceAgg[]) {
  let cohortSize = 0, revYearAgo = 0, revNow = 0, revCapped = 0, logosRetained = 0;
  for (const c of customers) {
    const prior = c.revYearAgoMonth;
    if (prior <= 0) continue;
    cohortSize++;
    revYearAgo += prior;
    revNow += c.revThisMonth;
    revCapped += Math.min(c.revThisMonth, prior);
    if (c.revThisMonth > 0) logosRetained++;
  }
  if (cohortSize === 0 || revYearAgo === 0) return null;
  return {
    nrr: (revNow / revYearAgo) * 100,
    grr: (revCapped / revYearAgo) * 100,
    logoRetention: (logosRetained / cohortSize) * 100,
    cohortSize,
  };
}

/** ARR movement over the last 6 months: trailing 90 days vs the 90 days before, ×4. */
export function arrMovementMetrics(customers: CustomerInvoiceAgg[]) {
  let starting = 0, newArr = 0, expansion = 0, contraction = 0, churn = 0;
  for (const c of customers) {
    const current = c.rev90 * 4;
    const prior = c.revPrior90 * 4;
    starting += prior;
    if (prior === 0 && current > 0) newArr += current;
    else if (current === 0 && prior > 0) churn += prior;
    else if (current > prior) expansion += current - prior;
    else if (current < prior) contraction += prior - current;
  }
  const ending = starting + newArr + expansion - contraction - churn;
  if (starting === 0 && newArr === 0) return null;
  return { starting, new: newArr, expansion, contraction, churn, ending };
}

/** Top-5 customers by lifetime invoiced revenue and their share of the total. */
export function concentrationMetrics(customers: CustomerInvoiceAgg[]) {
  if (customers.length === 0) return { top5: [], totalRev: 0, topPct: 0 };
  const sorted = [...customers].sort((a, b) => b.total - a.total);
  const totalRev = sorted.reduce((s, c) => s + c.total, 0);
  const top5 = sorted.slice(0, 5).map((c) => ({
    name: c.name,
    value: c.total,
    pct: totalRev > 0 ? (c.total / totalRev) * 100 : 0,
  }));
  return { top5, totalRev, topPct: top5[0]?.pct ?? 0 };
}

/** Customers whose first-ever invoice is on or after `cutoffMs`, and all invoiced customers. */
export function newCustomerCounts(customers: CustomerInvoiceAgg[], cutoffMs: number) {
  return {
    newCustomers: customers.filter((c) => c.firstAt >= cutoffMs).length,
    customerCount: customers.length,
  };
}

/** Quarter index used for cohorts: year × 4 + quarter (0–3). */
export function quarterIndex(d: Date): number {
  return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);
}

/**
 * Revenue retention by acquisition quarter for the last 8 quarters. Each cell is revenue
 * in that offset quarter as a % of the cohort's first-quarter revenue.
 */
export function cohortHeatmap(cells: CohortCell[], sizes: CohortSize[], currentQ: number) {
  const byCohort = new Map<number, Map<number, number>>();
  for (const c of cells) {
    if (!byCohort.has(c.cohortQ)) byCohort.set(c.cohortQ, new Map());
    const m = byCohort.get(c.cohortQ)!;
    m.set(c.offset, (m.get(c.offset) ?? 0) + c.revenue);
  }
  const sizeByCohort = new Map(sizes.map((s) => [s.cohortQ, s.customers]));
  const rows = Array.from(byCohort.entries())
    .filter(([qi]) => qi >= currentQ - 7 && qi <= currentQ)
    .sort((a, b) => a[0] - b[0])
    .map(([qi, offsets]) => {
      const q0Rev = offsets.get(0) ?? 0;
      const cellsOut: (number | null)[] = [];
      for (let o = 0; o <= currentQ - qi; o++) {
        const rev = offsets.get(o) ?? 0;
        cellsOut.push(q0Rev > 0 ? (rev / q0Rev) * 100 : null);
      }
      return { label: `Q${(qi % 4) + 1} ${Math.floor(qi / 4)}`, n: sizeByCohort.get(qi) ?? 0, cells: cellsOut };
    });
  if (rows.length === 0) return null;
  return { rows, maxOffset: Math.max(...rows.map((r) => r.cells.length)) };
}
