/**
 * Tests for Banking page utility functions.
 * Functions tested: fmtAxisK, balanceChartData logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from Banking.tsx ──

function fmtAxisK(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// Balance chart data calculation logic
function buildBalanceChartData(
  txnData: Array<{ date: string; amount: string; type: string }>
): Array<{ date: string; Balance: number }> {
  if (!txnData || txnData.length === 0) return [];
  const sorted = [...txnData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const daily: Record<string, number> = {};
  let running = 0;
  for (const txn of sorted) {
    const dateStr = new Date(txn.date).toISOString().slice(0, 10);
    const amt = parseFloat(txn.amount ?? "0");
    if (txn.type === "credit") running += amt;
    else running -= amt;
    daily[dateStr] = running;
  }
  return Object.entries(daily).map(([date, balance]) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Balance: balance,
  }));
}

// ── Tests ──

describe("Banking — fmtAxisK", () => {
  it("formats millions with M suffix", () => {
    expect(fmtAxisK(2_500_000)).toBe("$2.5M");
  });

  it("formats exact million", () => {
    expect(fmtAxisK(1_000_000)).toBe("$1.0M");
  });

  it("formats thousands with K suffix", () => {
    expect(fmtAxisK(25_000)).toBe("$25K");
  });

  it("formats exact thousand", () => {
    expect(fmtAxisK(1_000)).toBe("$1K");
  });

  it("formats small values without suffix", () => {
    expect(fmtAxisK(500)).toBe("$500");
  });

  it("formats zero", () => {
    expect(fmtAxisK(0)).toBe("$0");
  });

  it("formats negative millions", () => {
    expect(fmtAxisK(-5_000_000)).toBe("$-5.0M");
  });

  it("formats negative thousands", () => {
    expect(fmtAxisK(-10_000)).toBe("$-10K");
  });
});

describe("Banking — buildBalanceChartData", () => {
  it("returns empty array for empty input", () => {
    expect(buildBalanceChartData([])).toEqual([]);
  });

  it("returns empty array for null-like input", () => {
    expect(buildBalanceChartData(null as any)).toEqual([]);
  });

  it("computes running balance from credits", () => {
    const txns = [
      { date: "2026-01-01", amount: "1000", type: "credit" },
      { date: "2026-01-02", amount: "500", type: "credit" },
    ];
    const result = buildBalanceChartData(txns);
    expect(result).toHaveLength(2);
    expect(result[0].Balance).toBe(1000);
    expect(result[1].Balance).toBe(1500);
  });

  it("subtracts debits from running balance", () => {
    const txns = [
      { date: "2026-01-01", amount: "1000", type: "credit" },
      { date: "2026-01-02", amount: "300", type: "debit" },
    ];
    const result = buildBalanceChartData(txns);
    expect(result[1].Balance).toBe(700);
  });

  it("sorts transactions by date", () => {
    const txns = [
      { date: "2026-01-03", amount: "100", type: "credit" },
      { date: "2026-01-01", amount: "1000", type: "credit" },
      { date: "2026-01-02", amount: "500", type: "credit" },
    ];
    const result = buildBalanceChartData(txns);
    expect(result[0].Balance).toBe(1000);
    expect(result[1].Balance).toBe(1500);
    expect(result[2].Balance).toBe(1600);
  });

  it("aggregates multiple transactions on same day", () => {
    const txns = [
      { date: "2026-01-01", amount: "500", type: "credit" },
      { date: "2026-01-01", amount: "300", type: "credit" },
    ];
    const result = buildBalanceChartData(txns);
    expect(result).toHaveLength(1);
    expect(result[0].Balance).toBe(800);
  });

  it("handles mixed credits and debits on same day", () => {
    const txns = [
      { date: "2026-01-01", amount: "1000", type: "credit" },
      { date: "2026-01-01", amount: "200", type: "debit" },
    ];
    const result = buildBalanceChartData(txns);
    expect(result[0].Balance).toBe(800);
  });

  it("formats dates for display", () => {
    const txns = [{ date: "2026-06-15", amount: "100", type: "credit" }];
    const result = buildBalanceChartData(txns);
    expect(result[0].date).toMatch(/Jun\s+15/);
  });
});
