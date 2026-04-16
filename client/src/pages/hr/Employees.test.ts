/**
 * Tests for Employees page utility functions.
 * Functions tested: fmt$, fmtNum, fmtPct, fmtDate, calcNextVestDate,
 * typeColors, statusColors
 */
import { describe, it, expect } from "vitest";
import { format, addMonths } from "date-fns";

// ── Re-implement pure functions from Employees.tsx ──

function fmt$(v: string | number | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtNum(v: string | number | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US");
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "-";
  if (v < 0.01) return "<0.01%";
  return v.toFixed(2) + "%";
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  try { return format(new Date(v), "MMM d, yyyy"); } catch { return "-"; }
}

function calcNextVestDate(
  vestingStart: string | Date | null | undefined,
  cliffMonths: number | null | undefined,
  schedule: string | null | undefined,
  sharesVested: string | null | undefined,
  totalShares: string | null | undefined,
): string {
  if (!vestingStart || !schedule || schedule === "none") return "-";
  const start = new Date(vestingStart);
  const cliff = cliffMonths ?? 0;
  const vested = parseFloat(sharesVested || "0");
  const total = parseFloat(totalShares || "0");
  if (total > 0 && vested >= total) return "Fully vested";

  const now = new Date();
  const cliffDate = addMonths(start, cliff);
  if (now < cliffDate) return fmtDate(cliffDate);

  const incrementMonths = schedule === "monthly" ? 1 : schedule === "quarterly" ? 3 : schedule === "annually" ? 12 : 1;
  let next = cliffDate;
  while (next <= now) {
    next = addMonths(next, incrementMonths);
  }
  return fmtDate(next);
}

const typeColors: Record<string, string> = {
  founder: "bg-purple-500/10 text-purple-600",
  employee: "bg-blue-500/10 text-blue-600",
  investor: "bg-emerald-500/10 text-emerald-600",
  advisor: "bg-amber-500/10 text-amber-600",
  board_member: "bg-indigo-500/10 text-indigo-600",
  contractor: "bg-cyan-500/10 text-cyan-600",
  full_time: "bg-blue-500/10 text-blue-600",
  part_time: "bg-teal-500/10 text-teal-600",
  intern: "bg-pink-500/10 text-pink-600",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  inactive: "bg-gray-500/10 text-gray-600",
  terminated: "bg-red-500/10 text-red-600",
  departed: "bg-orange-500/10 text-orange-600",
  on_leave: "bg-yellow-500/10 text-yellow-600",
};

// ── Tests ──

describe("Employees — fmt$", () => {
  it("formats a number as USD", () => {
    const result = fmt$(1234.56);
    expect(result).toMatch(/\$1,234\.56/);
  });

  it("formats string number as USD", () => {
    const result = fmt$("5000");
    expect(result).toMatch(/\$5,000/);
  });

  it("returns dash for null", () => {
    expect(fmt$(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(fmt$(undefined)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(fmt$("")).toBe("-");
  });

  it("returns dash for NaN", () => {
    expect(fmt$("abc")).toBe("-");
  });

  it("formats zero", () => {
    const result = fmt$(0);
    expect(result).toMatch(/\$0/);
  });

  it("formats negative values", () => {
    const result = fmt$(-1000);
    expect(result).toContain("1,000");
  });
});

describe("Employees — fmtNum", () => {
  it("formats number with thousands separator", () => {
    expect(fmtNum(1234567)).toBe("1,234,567");
  });

  it("formats string number", () => {
    expect(fmtNum("50000")).toBe("50,000");
  });

  it("returns dash for null", () => {
    expect(fmtNum(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(fmtNum(undefined)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(fmtNum("")).toBe("-");
  });

  it("returns dash for NaN", () => {
    expect(fmtNum("xyz")).toBe("-");
  });

  it("formats zero", () => {
    expect(fmtNum(0)).toBe("0");
  });
});

describe("Employees — fmtPct", () => {
  it("formats percentage with 2 decimals", () => {
    expect(fmtPct(45.678)).toBe("45.68%");
  });

  it("returns '<0.01%' for very small values", () => {
    expect(fmtPct(0.005)).toBe("<0.01%");
  });

  it("returns '<0.01%' for zero", () => {
    expect(fmtPct(0)).toBe("<0.01%");
  });

  it("returns dash for null", () => {
    expect(fmtPct(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(fmtPct(undefined)).toBe("-");
  });

  it("formats exact 1%", () => {
    expect(fmtPct(1)).toBe("1.00%");
  });

  it("formats 100%", () => {
    expect(fmtPct(100)).toBe("100.00%");
  });
});

describe("Employees — fmtDate", () => {
  it("formats ISO date string", () => {
    expect(fmtDate("2026-03-15")).toBe("Mar 15, 2026");
  });

  it("formats Date object", () => {
    expect(fmtDate(new Date(2026, 0, 1))).toBe("Jan 1, 2026");
  });

  it("returns dash for null", () => {
    expect(fmtDate(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(fmtDate(undefined)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(fmtDate("")).toBe("-");
  });
});

describe("Employees — calcNextVestDate", () => {
  it("returns dash when no vestingStart", () => {
    expect(calcNextVestDate(null, 12, "monthly", "0", "1000")).toBe("-");
  });

  it("returns dash when schedule is 'none'", () => {
    expect(calcNextVestDate("2024-01-01", 12, "none", "0", "1000")).toBe("-");
  });

  it("returns dash when no schedule", () => {
    expect(calcNextVestDate("2024-01-01", 12, null, "0", "1000")).toBe("-");
  });

  it("returns 'Fully vested' when all shares vested", () => {
    expect(calcNextVestDate("2024-01-01", 12, "monthly", "1000", "1000")).toBe("Fully vested");
  });

  it("returns 'Fully vested' when more than total shares vested", () => {
    expect(calcNextVestDate("2024-01-01", 12, "monthly", "1500", "1000")).toBe("Fully vested");
  });

  it("returns cliff date if before cliff", () => {
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);
    const result = calcNextVestDate(futureStart, 12, "monthly", "0", "1000");
    // Should return a formatted date approximately 12 months from the future start
    expect(result).not.toBe("-");
    expect(result).not.toBe("Fully vested");
  });

  it("returns future date for quarterly schedule", () => {
    const pastStart = "2020-01-01";
    const result = calcNextVestDate(pastStart, 12, "quarterly", "500", "1000");
    expect(result).not.toBe("-");
    expect(result).not.toBe("Fully vested");
    // The result should be a date string in "MMM d, yyyy" format
    expect(result).toMatch(/\w{3} \d{1,2}, \d{4}/);
  });

  it("returns future date for annual schedule", () => {
    const pastStart = "2020-01-01";
    const result = calcNextVestDate(pastStart, 12, "annually", "500", "4000");
    expect(result).not.toBe("-");
    expect(result).toMatch(/\w{3} \d{1,2}, \d{4}/);
  });

  it("defaults cliff to 0 when null", () => {
    const pastStart = "2020-01-01";
    const result = calcNextVestDate(pastStart, null, "monthly", "0", "1000");
    expect(result).not.toBe("-");
    expect(result).toMatch(/\w{3} \d{1,2}, \d{4}/);
  });
});

describe("Employees — typeColors", () => {
  it("has 9 type color mappings", () => {
    expect(Object.keys(typeColors)).toHaveLength(9);
  });

  it("maps founder to purple", () => {
    expect(typeColors.founder).toContain("purple");
  });

  it("maps employee to blue", () => {
    expect(typeColors.employee).toContain("blue");
  });

  it("maps investor to emerald", () => {
    expect(typeColors.investor).toContain("emerald");
  });

  it("maps intern to pink", () => {
    expect(typeColors.intern).toContain("pink");
  });
});

describe("Employees — statusColors", () => {
  it("has 5 status color mappings", () => {
    expect(Object.keys(statusColors)).toHaveLength(5);
  });

  it("maps active to emerald", () => {
    expect(statusColors.active).toContain("emerald");
  });

  it("maps terminated to red", () => {
    expect(statusColors.terminated).toContain("red");
  });

  it("maps on_leave to yellow", () => {
    expect(statusColors.on_leave).toContain("yellow");
  });
});
