/**
 * Tests for Vendors page utility functions.
 * Functions tested: formatCurrency, formatDate, ACTIVE_NEGOTIATION_STATUSES,
 * OPEN_PO_STATUSES, poAggregates logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from Vendors.tsx ──

function formatCurrency(value: number): string {
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ACTIVE_NEGOTIATION_STATUSES = new Set([
  "draft", "analyzing", "ready", "in_progress", "counter_offered",
]);

const OPEN_PO_STATUSES = new Set(["draft", "sent", "confirmed"]);

// PO aggregation logic
type PO = {
  vendorId: number;
  status: string;
  totalAmount?: string | null;
  leadTimeDays?: number | null;
  createdAt?: string;
};

function computePOAggregates(pos: PO[]) {
  const map = new Map<number, {
    totalSpend: number;
    poCount: number;
    openPOs: number;
    leadTimes: number[];
    lastPODate: string | null;
    lastPOAmount: number;
  }>();

  for (const po of pos) {
    let agg = map.get(po.vendorId);
    if (!agg) {
      agg = { totalSpend: 0, poCount: 0, openPOs: 0, leadTimes: [], lastPODate: null, lastPOAmount: 0 };
      map.set(po.vendorId, agg);
    }
    const amt = parseFloat(po.totalAmount || "0");
    agg.totalSpend += amt;
    agg.poCount++;
    if (OPEN_PO_STATUSES.has(po.status)) agg.openPOs++;
    if (po.leadTimeDays) agg.leadTimes.push(po.leadTimeDays);
    if (po.createdAt) {
      if (!agg.lastPODate || po.createdAt > agg.lastPODate) {
        agg.lastPODate = po.createdAt;
        agg.lastPOAmount = amt;
      }
    }
  }

  return map;
}

// ── Tests ──

describe("Vendors — formatCurrency", () => {
  it("formats positive numbers", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats large numbers", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00");
  });

  it("formats small numbers", () => {
    expect(formatCurrency(0.99)).toBe("$0.99");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatCurrency(1.999)).toBe("$2.00");
  });

  it("formats negative numbers", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500.00");
  });
});

describe("Vendors — formatDate", () => {
  it("formats Date object with year", () => {
    const result = formatDate(new Date(2026, 2, 15)); // Mar 15, 2026
    expect(result).toBe("Mar 15, 2026");
  });

  it("formats string date", () => {
    const result = formatDate("2026-06-20");
    expect(result).toMatch(/Jun\s+20,\s+2026/);
  });

  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatDate(undefined)).toBe("-");
  });
});

describe("Vendors — ACTIVE_NEGOTIATION_STATUSES", () => {
  it("contains 5 statuses", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.size).toBe(5);
  });

  it("includes draft", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("draft")).toBe(true);
  });

  it("includes analyzing", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("analyzing")).toBe(true);
  });

  it("includes ready", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("ready")).toBe(true);
  });

  it("includes in_progress", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("in_progress")).toBe(true);
  });

  it("includes counter_offered", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("counter_offered")).toBe(true);
  });

  it("does not include completed", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("completed")).toBe(false);
  });

  it("does not include cancelled", () => {
    expect(ACTIVE_NEGOTIATION_STATUSES.has("cancelled")).toBe(false);
  });
});

describe("Vendors — OPEN_PO_STATUSES", () => {
  it("contains 3 statuses", () => {
    expect(OPEN_PO_STATUSES.size).toBe(3);
  });

  it("includes draft, sent, confirmed", () => {
    expect(OPEN_PO_STATUSES.has("draft")).toBe(true);
    expect(OPEN_PO_STATUSES.has("sent")).toBe(true);
    expect(OPEN_PO_STATUSES.has("confirmed")).toBe(true);
  });

  it("does not include received", () => {
    expect(OPEN_PO_STATUSES.has("received")).toBe(false);
  });

  it("does not include cancelled", () => {
    expect(OPEN_PO_STATUSES.has("cancelled")).toBe(false);
  });
});

describe("Vendors — PO aggregate computation", () => {
  const testPOs: PO[] = [
    { vendorId: 1, status: "draft", totalAmount: "1000", leadTimeDays: 7, createdAt: "2026-01-01" },
    { vendorId: 1, status: "confirmed", totalAmount: "2000", leadTimeDays: 14, createdAt: "2026-02-01" },
    { vendorId: 1, status: "received", totalAmount: "500", createdAt: "2026-03-01" },
    { vendorId: 2, status: "sent", totalAmount: "3000", leadTimeDays: 10, createdAt: "2026-01-15" },
  ];

  it("groups POs by vendor", () => {
    const agg = computePOAggregates(testPOs);
    expect(agg.size).toBe(2);
  });

  it("calculates total spend per vendor", () => {
    const agg = computePOAggregates(testPOs);
    expect(agg.get(1)!.totalSpend).toBe(3500);
    expect(agg.get(2)!.totalSpend).toBe(3000);
  });

  it("counts total POs per vendor", () => {
    const agg = computePOAggregates(testPOs);
    expect(agg.get(1)!.poCount).toBe(3);
    expect(agg.get(2)!.poCount).toBe(1);
  });

  it("counts open POs using OPEN_PO_STATUSES", () => {
    const agg = computePOAggregates(testPOs);
    expect(agg.get(1)!.openPOs).toBe(2); // draft + confirmed
    expect(agg.get(2)!.openPOs).toBe(1); // sent
  });

  it("collects lead times", () => {
    const agg = computePOAggregates(testPOs);
    expect(agg.get(1)!.leadTimes).toEqual([7, 14]);
    expect(agg.get(2)!.leadTimes).toEqual([10]);
  });

  it("tracks last PO date and amount", () => {
    const agg = computePOAggregates(testPOs);
    expect(agg.get(1)!.lastPODate).toBe("2026-03-01");
    expect(agg.get(1)!.lastPOAmount).toBe(500);
  });

  it("handles empty PO list", () => {
    const agg = computePOAggregates([]);
    expect(agg.size).toBe(0);
  });

  it("handles POs with null amounts", () => {
    const pos: PO[] = [{ vendorId: 1, status: "draft", totalAmount: null }];
    const agg = computePOAggregates(pos);
    expect(agg.get(1)!.totalSpend).toBe(0);
  });
});
