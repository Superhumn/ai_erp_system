import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Mercury banking service so the test doesn't hit the network and
// we can exercise the "cash balance unavailable" path deterministically.
vi.mock("./mercuryService", () => ({
  getMercuryAccounts: vi.fn(),
}));

// Mock the db module so we control what invoices/transactions are returned.
vi.mock("./db", () => ({
  getInvoices: vi.fn(),
  getTransactions: vi.fn(),
}));

import * as mercury from "./mercuryService";
import * as db from "./db";
import { computeLiveFinancials } from "./dataRoomLiveFinancials";

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setDate(1); // prevent month overflow on dates like Jan 31
  d.setMonth(d.getMonth() - n);
  d.setDate(15);
  return d;
}

describe("computeLiveFinancials", () => {
  beforeEach(() => {
    vi.mocked(mercury.getMercuryAccounts).mockReset();
    vi.mocked(db.getInvoices).mockReset();
    vi.mocked(db.getTransactions).mockReset();
  });

  it("returns the last three months as three revenue/burn buckets", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.last3MoRevenue).toHaveLength(3);
    expect(snapshot.last3MoBurn).toHaveLength(3);
    // Bucket keys should be in chronological (oldest → newest) order.
    const keys = snapshot.last3MoRevenue.map((b) => b.monthKey);
    expect(keys).toEqual([...keys].sort((a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      return ay === by ? am - bm : ay - by;
    }));
  });

  it("sums cash across Mercury accounts, preferring currentBalance", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({
      accounts: [
        { currentBalance: 1000, availableBalance: 900 },
        { currentBalance: 500, availableBalance: 450 },
        { availableBalance: 200 }, // falls back to availableBalance
      ],
    });
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.cash).toBe(1700);
  });

  it("degrades to cash = 0 when Mercury throws", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockRejectedValue(
      new Error("MERCURY_API_TOKEN not configured"),
    );
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.cash).toBe(0);
  });

  it("buckets invoices into the last three months by issueDate", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "1000", status: "sent" },
      { issueDate: monthsAgo(0), totalAmount: "500", status: "sent" },
      { issueDate: monthsAgo(1), totalAmount: "2000", status: "paid" },
      { issueDate: monthsAgo(2), totalAmount: "3000", status: "paid" },
      { issueDate: monthsAgo(6), totalAmount: "9999", status: "paid" }, // out of range
    ] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    const [oldest, middle, newest] = snapshot.last3MoRevenue;
    expect(oldest.revenue).toBe(3000);
    expect(middle.revenue).toBe(2000);
    expect(newest.revenue).toBe(1500);
  });

  it("computes avg burn over only months that actually had expenses", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([
      { date: monthsAgo(0), totalAmount: "-10000" },
      { date: monthsAgo(1), totalAmount: "-8000" },
      // month -2 has no expenses and must be excluded from the average
    ] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.avgMonthlyBurn).toBe(9000);
  });

  it("derives runway as cash / avgMonthlyBurn rounded to 1 decimal", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({
      accounts: [{ currentBalance: 100000 }],
    });
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([
      { date: monthsAgo(0), totalAmount: "-10000" },
      { date: monthsAgo(1), totalAmount: "-10000" },
      { date: monthsAgo(2), totalAmount: "-10000" },
    ] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.runwayMonths).toBe(10);
  });

  it("returns runway = null when no burn data is available", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({
      accounts: [{ currentBalance: 50000 }],
    });
    vi.mocked(db.getInvoices).mockResolvedValue([] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.runwayMonths).toBeNull();
  });

  it("omits AR when includeAr is false", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "1000", paidAmount: "0", status: "sent" },
    ] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    expect(snapshot.arTotal).toBeNull();
  });

  it("computes AR as sum of (total - paid) over non-paid invoices when includeAr is true", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([
      { issueDate: monthsAgo(0), totalAmount: "1000", paidAmount: "200", status: "sent" },
      { issueDate: monthsAgo(1), totalAmount: "500", paidAmount: "0", status: "partial" },
      { issueDate: monthsAgo(2), totalAmount: "9999", paidAmount: "9999", status: "paid" },
      { issueDate: monthsAgo(2), totalAmount: "1234", paidAmount: "0", status: "void" },
    ] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: true });
    expect(snapshot.arTotal).toBe(1300); // 800 + 500
  });

  it("does not leak per-customer detail — shape is exactly the trimmed contract", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(db.getInvoices).mockResolvedValue([
      {
        issueDate: monthsAgo(0),
        totalAmount: "1000",
        customer: { name: "Acme Corp", email: "cfo@acme.com" },
      },
    ] as any);
    vi.mocked(db.getTransactions).mockResolvedValue([] as any);

    const snapshot = await computeLiveFinancials({ includeAr: false });
    // Snapshot only exposes the trimmed fields — no customers array, no invoice list.
    expect(Object.keys(snapshot).sort()).toEqual([
      "arTotal",
      "asOf",
      "avgMonthlyBurn",
      "cash",
      "currency",
      "last3MoBurn",
      "last3MoRevenue",
      "runwayMonths",
    ]);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("Acme Corp");
    expect(serialized).not.toContain("cfo@acme.com");
  });
});
