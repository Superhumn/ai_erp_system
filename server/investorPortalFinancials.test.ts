import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./mercuryService", () => ({
  getMercuryAccounts: vi.fn(),
}));
vi.mock("./db", () => ({
  getInvoices: vi.fn(),
  getTransactions: vi.fn(),
}));

import * as mercury from "./mercuryService";
import * as db from "./db";
import { computeInvestorPortalFinancials } from "./investorPortalFinancials";

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setDate(1); // prevent month overflow on dates like Jan 31
  d.setMonth(d.getMonth() - n);
  d.setDate(15);
  return d;
}

describe("computeInvestorPortalFinancials", () => {
  beforeEach(() => {
    vi.mocked(mercury.getMercuryAccounts).mockReset();
    vi.mocked(db.getInvoices).mockReset();
    vi.mocked(db.getTransactions).mockReset();

    // Safe defaults: cash is zero, no invoices/transactions.
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);
  });

  it("returns thirteen monthly buckets in chronological order (12 for trend, +1 for YoY)", async () => {
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.months).toHaveLength(13);
    const keys = snapshot.months.map((m) => m.monthKey);
    expect(keys).toEqual([...keys].sort((a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      return ay === by ? am - bm : ay - by;
    }));
  });

  it("computes YoY growth from the oldest bucket (same month prior year)", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "20000" },  // this month
      { issueDate: monthsAgo(12), totalAmount: "10000" }, // same month last year
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.yoyGrowthPct).toBeCloseTo(100, 5);
  });

  it("computes ARR as 3mo-avg revenue × 12", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "30000" },
      { issueDate: monthsAgo(1), totalAmount: "30000" },
      { issueDate: monthsAgo(2), totalAmount: "30000" },
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.arr).toBe(30000 * 12);
  });

  it("derives MoM growth from the last two buckets", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "12000" }, // this month
      { issueDate: monthsAgo(1), totalAmount: "10000" }, // last month
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.momGrowthPct).toBeCloseTo(20, 5);
  });

  it("returns MoM null when the prior month had no revenue (avoids divide-by-zero)", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "12000" },
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.momGrowthPct).toBeNull();
  });

  it("computes runway and cash-out month when burn is present", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({
      accounts: [{ currentBalance: 200000 }],
    });
    vi.mocked(db.getTransactions).mockResolvedValue([
      { date: monthsAgo(0), totalAmount: "-20000" },
      { date: monthsAgo(1), totalAmount: "-20000" },
      { date: monthsAgo(2), totalAmount: "-20000" },
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.runwayMonths).toBe(10);
    expect(snapshot.cashOutMonth).not.toBeNull();
  });

  it("leaves runway and cash-out null when there's no burn data", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({
      accounts: [{ currentBalance: 200000 }],
    });
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.runwayMonths).toBeNull();
    expect(snapshot.cashOutMonth).toBeNull();
  });

  it("computes burn multiple only when net-new ARR is positive", async () => {
    // Shrinking revenue → netNewArr ≤ 0 → burnMultiple should be null.
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "8000" },
      { issueDate: monthsAgo(1), totalAmount: "10000" },
    ] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([
      { date: monthsAgo(0), totalAmount: "-5000" },
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.burnMultiple).toBeNull();
  });

  // Margins are sourced from QuickBooks once the per-company OAuth token
  // lookup is wired in the investor-portal path. Until then, the helper
  // returns `marginSource = "none"` and the UI shows em-dashes — better
  // than fabricating a number the investor can't audit.
  it("reports marginSource = 'none' until QuickBooks is wired up", async () => {
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.marginSource).toBe("none");
    expect(snapshot.grossMarginPct).toBeNull();
    expect(snapshot.ebitdaMarginPct).toBeNull();
  });

  it("always includes AR total for existing investors (no opt-in required)", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "1000", paidAmount: "400", status: "sent" },
      { issueDate: monthsAgo(1), totalAmount: "500", paidAmount: "500", status: "paid" }, // excluded
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    expect(snapshot.arTotal).toBe(600);
  });

  it("never exposes per-invoice or per-customer detail in the snapshot", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      {
        issueDate: monthsAgo(0),
        totalAmount: "1000",
        customer: { name: "Acme", email: "cfo@acme.com" },
      },
    ] as any);
    const snapshot = await computeInvestorPortalFinancials();
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("Acme");
    expect(serialized).not.toContain("cfo@acme.com");
    // Snapshot surface is stable — regression guard against accidentally
    // adding identifying fields in the future.
    expect(Object.keys(snapshot).sort()).toEqual([
      "arTotal",
      "arr",
      "asOf",
      "avgMonthlyBurn",
      "burnMultiple",
      "cash",
      "cashOutMonth",
      "currency",
      "ebitdaMarginPct",
      "grossMarginPct",
      "marginSource",
      "momGrowthPct",
      "months",
      "runwayMonths",
      "yoyGrowthPct",
    ]);
  });

  it("scopes invoices and transactions to companyId when provided", async () => {
    await computeInvestorPortalFinancials({ companyId: 42 });
    expect(db.getInvoices).toHaveBeenCalledWith({ companyId: 42 });
    expect(db.getTransactions).toHaveBeenCalledWith({ type: "expense", companyId: 42 });
  });
});
