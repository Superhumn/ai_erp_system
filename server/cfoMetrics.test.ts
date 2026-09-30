/**
 * Parity: the CFO metrics computed from per-customer aggregates (shared/cfoMetrics.ts, fed
 * by SQL) must equal what CFODashboard used to compute in the browser from every invoice.
 * The `legacy*` functions below are the pre-change browser code, kept verbatim in logic.
 */
import { describe, expect, it } from "vitest";
import {
  arrMovementMetrics,
  cohortHeatmap,
  cohortSizes,
  mergeCustomerAggs,
  concentrationMetrics,
  newCustomerCounts,
  quarterIndex,
  recurringMetrics,
  retentionMetrics,
  type CustomerInvoiceAgg,
} from "../shared/cfoMetrics";

type Inv = { customerName: string; t: number; amt: number };
const DAY = 86_400_000;

// Deterministic PRNG so failures reproduce.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function makeInvoices(n: number, now: number, seed: number): Inv[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    customerName: `C${Math.floor(r() * 40)}`,
    t: now - Math.floor(r() * 900) * DAY - Math.floor(r() * DAY),
    amt: Math.round(r() * 100000) / 100,
  }));
}

/** What the SQL GROUP BY returns, computed in JS from the same invoices. */
function aggregate(invs: Inv[], now: number, thisMonth: [number, number], yearAgo: [number, number]): CustomerInvoiceAgg[] {
  const by = new Map<string, CustomerInvoiceAgg>();
  for (const i of invs) {
    const c = by.get(i.customerName) ?? {
      name: i.customerName, count: 0, total: 0, firstAt: Infinity, lastAt: -Infinity,
      rev90: 0, revPrior90: 0, revThisMonth: 0, revYearAgoMonth: 0,
    };
    c.count++;
    c.total += i.amt;
    c.firstAt = Math.min(c.firstAt, i.t);
    c.lastAt = Math.max(c.lastAt, i.t);
    if (i.t >= now - 90 * DAY) c.rev90 += i.amt;
    if (i.t >= now - 180 * DAY && i.t < now - 90 * DAY) c.revPrior90 += i.amt;
    if (i.t >= thisMonth[0] && i.t < thisMonth[1]) c.revThisMonth += i.amt;
    if (i.t >= yearAgo[0] && i.t < yearAgo[1]) c.revYearAgoMonth += i.amt;
    by.set(i.customerName, c);
  }
  return [...by.values()];
}

// ── Legacy browser implementations ────────────────────────────────────────────
function legacyRecurring(invs: Inv[], now: number) {
  const byCustomer = new Map<string, { name: string; times: number[]; amounts: number[] }>();
  for (const inv of invs) {
    if (!byCustomer.has(inv.customerName)) byCustomer.set(inv.customerName, { name: inv.customerName, times: [], amounts: [] });
    const c = byCustomer.get(inv.customerName)!;
    c.times.push(inv.t);
    c.amounts.push(inv.amt);
  }
  const profiles = Array.from(byCustomer.values()).map((c) => {
    c.times.sort((a, b) => a - b);
    const n = c.times.length;
    if (n < 2) return null;
    const intervals = c.times.slice(1).map((t, i) => (t - c.times[i]) / DAY);
    const cadenceDays = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const avgAmount = c.amounts.reduce((a, b) => a + b, 0) / c.amounts.length;
    const daysSinceLast = (now - c.times[n - 1]) / DAY;
    let status = "active";
    if (daysSinceLast > cadenceDays * 3) status = "churned";
    else if (daysSinceLast > cadenceDays * 1.5) status = "at_risk";
    return { cadenceDays, avgAmount, status };
  }).filter((p): p is NonNullable<typeof p> => p !== null);
  const active = profiles.filter((p) => p.status === "active");
  const atRisk = profiles.filter((p) => p.status === "at_risk");
  return {
    active: active.length,
    atRisk: atRisk.length,
    detectedMRR: active.reduce((s, p) => s + p.avgAmount / (p.cadenceDays / 30.44), 0),
  };
}

function legacyArrMovement(invs: Inv[], now: number) {
  const byCustomer = new Map<string, Inv[]>();
  for (const i of invs) byCustomer.set(i.customerName, [...(byCustomer.get(i.customerName) ?? []), i]);
  let starting = 0, newArr = 0, expansion = 0, contraction = 0, churn = 0;
  for (const h of byCustomer.values()) {
    const current = h.filter((i) => i.t >= now - 90 * DAY).reduce((s, i) => s + i.amt, 0) * 4;
    const prior = h.filter((i) => i.t >= now - 180 * DAY && i.t < now - 90 * DAY).reduce((s, i) => s + i.amt, 0) * 4;
    starting += prior;
    if (prior === 0 && current > 0) newArr += current;
    else if (current === 0 && prior > 0) churn += prior;
    else if (current > prior) expansion += current - prior;
    else if (current < prior) contraction += prior - current;
  }
  return { starting, new: newArr, expansion, contraction, churn };
}

function legacyCohortCells(invs: Inv[]) {
  const firstQ = new Map<string, number>();
  for (const i of invs) {
    const qi = quarterIndex(new Date(i.t));
    if (!firstQ.has(i.customerName) || qi < firstQ.get(i.customerName)!) firstQ.set(i.customerName, qi);
  }
  const cells: { cohortQ: number; offset: number; revenue: number }[] = [];
  for (const i of invs) {
    const cohortQ = firstQ.get(i.customerName)!;
    cells.push({ cohortQ, offset: quarterIndex(new Date(i.t)) - cohortQ, revenue: i.amt });
  }
  const sizes = new Map<number, number>();
  for (const q of firstQ.values()) sizes.set(q, (sizes.get(q) ?? 0) + 1);
  return { cells, sizes: [...sizes].map(([cohortQ, customers]) => ({ cohortQ, customers })) };
}

describe("CFO metrics from aggregates match the legacy browser computation", () => {
  const now = new Date(2026, 8, 15, 12).getTime();
  const nowD = new Date(now);
  const thisMonth: [number, number] = [new Date(2026, 8, 1).getTime(), new Date(2026, 9, 1).getTime()];
  const yearAgo: [number, number] = [new Date(2025, 8, 1).getTime(), new Date(2025, 9, 1).getTime()];

  for (const seed of [1, 7, 42, 99]) {
    const invs = makeInvoices(600, now, seed);
    const aggs = aggregate(invs, now, thisMonth, yearAgo);

    it(`recurring cadence (seed ${seed})`, () => {
      const got = recurringMetrics(aggs, now)!;
      const want = legacyRecurring(invs, now);
      expect(got.active).toBe(want.active);
      expect(got.atRisk).toBe(want.atRisk);
      expect(got.detectedMRR).toBeCloseTo(want.detectedMRR, 6);
    });

    it(`ARR movement (seed ${seed})`, () => {
      const got = arrMovementMetrics(aggs)!;
      const want = legacyArrMovement(invs, now);
      for (const k of Object.keys(want) as (keyof typeof want)[]) expect(got[k]).toBeCloseTo(want[k], 6);
    });

    it(`cohort heatmap (seed ${seed})`, () => {
      const { cells, sizes } = legacyCohortCells(invs);
      const currentQ = quarterIndex(nowD);
      // The server only sends cells for cohorts in the last 8 quarters; the shaping must not depend on the rest.
      const recent = cells.filter((c) => c.cohortQ >= currentQ - 7);
      expect(cohortHeatmap(recent, sizes, currentQ)).toEqual(cohortHeatmap(cells, sizes, currentQ));
    });
  }

  it("retention compares this month with the same month a year ago", () => {
    const invs: Inv[] = [
      { customerName: "A", t: yearAgo[0] + DAY, amt: 100 },
      { customerName: "A", t: thisMonth[0] + DAY, amt: 150 },
      { customerName: "B", t: yearAgo[0] + DAY, amt: 100 },
      { customerName: "C", t: thisMonth[0] + DAY, amt: 500 }, // new, not in the cohort
    ];
    expect(retentionMetrics(aggregate(invs, now, thisMonth, yearAgo))).toEqual({
      nrr: 75, grr: 50, logoRetention: 50, cohortSize: 2,
    });
  });

  it("concentration ranks customers by lifetime revenue", () => {
    const c = concentrationMetrics(aggregate([
      { customerName: "A", t: now, amt: 300 },
      { customerName: "B", t: now, amt: 100 },
      { customerName: "A", t: now, amt: 100 },
    ], now, thisMonth, yearAgo));
    expect(c.totalRev).toBe(500);
    expect(c.top5.map((x) => [x.name, x.pct])).toEqual([["A", 80], ["B", 20]]);
  });

  it("new customers are those whose first invoice is on or after the cutoff", () => {
    const aggs = aggregate([
      { customerName: "Old", t: now - 400 * DAY, amt: 1 },
      { customerName: "Old", t: now - DAY, amt: 1 },
      { customerName: "New", t: now - DAY, amt: 1 },
    ], now, thisMonth, yearAgo);
    expect(newCustomerCounts(aggs, now - 90 * DAY)).toEqual({ newCustomers: 1, customerCount: 2 });
  });

  it("merging per-id aggregates by name equals aggregating by name", () => {
    const invs = makeInvoices(400, now, 5);
    // Split each name across two customer ids, as two customer rows sharing a name would be.
    const halves = [invs.filter((_, i) => i % 2 === 0), invs.filter((_, i) => i % 2 === 1)];
    const perId = halves.flatMap((h) => aggregate(h, now, thisMonth, yearAgo));
    const sortByName = (a: CustomerInvoiceAgg[]) => [...a].sort((x, y) => x.name.localeCompare(y.name));
    const got = sortByName(mergeCustomerAggs(perId));
    const want = sortByName(aggregate(invs, now, thisMonth, yearAgo));
    expect(got.map((c) => c.name)).toEqual(want.map((c) => c.name));
    got.forEach((c, i) => {
      for (const k of Object.keys(c) as (keyof CustomerInvoiceAgg)[]) {
        if (k === "name") continue;
        expect(c[k]).toBeCloseTo(want[i][k] as number, 6);
      }
    });
  });

  it("cohort sizes match the legacy count of first-invoice quarters", () => {
    // Few invoices per customer, so many customers' first invoice falls inside the window.
    const invs = makeInvoices(600, now, 11).map((inv, i) => ({ ...inv, customerName: `C${i % 300}` }));
    const currentQ = quarterIndex(nowD);
    const qStarts = Array.from({ length: 9 }, (_, i) => new Date(2026, 8 - 3 * 7 + 3 * i - 2, 1).getTime());
    // quarterStarts[7] must be the start of the current quarter (Jul 1 2026).
    expect(qStarts[7]).toBe(new Date(2026, 6, 1).getTime());
    const got = cohortSizes(aggregate(invs, now, thisMonth, yearAgo), qStarts)
      .map((s) => ({ cohortQ: currentQ - 7 + s.cohortQ, customers: s.customers }))
      .sort((a, b) => a.cohortQ - b.cohortQ);
    const want = legacyCohortCells(invs).sizes
      .filter((s) => s.cohortQ >= currentQ - 7 && s.cohortQ <= currentQ)
      .sort((a, b) => a.cohortQ - b.cohortQ);
    expect(want.length).toBeGreaterThan(3);
    expect(got).toEqual(want);
  });
});
