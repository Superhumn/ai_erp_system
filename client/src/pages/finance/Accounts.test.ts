/**
 * Tests for Accounts page utility functions.
 * Functions tested: typeColors, filteredAccounts logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from Accounts.tsx ──

const typeColors: Record<string, string> = {
  asset: "bg-blue-500/10 text-blue-600",
  liability: "bg-red-500/10 text-red-600",
  equity: "bg-purple-500/10 text-purple-600",
  revenue: "bg-green-500/10 text-green-600",
  expense: "bg-amber-500/10 text-amber-600",
};

function filterAccounts(
  accounts: Array<{ name: string; code: string }>,
  search: string,
): typeof accounts {
  if (!search) return accounts;
  return accounts.filter(
    (account) =>
      account.name.toLowerCase().includes(search.toLowerCase()) ||
      account.code.toLowerCase().includes(search.toLowerCase())
  );
}

// ── Tests ──

describe("Accounts — typeColors", () => {
  it("has all 5 account types", () => {
    expect(Object.keys(typeColors)).toHaveLength(5);
  });

  it("maps asset to blue", () => {
    expect(typeColors.asset).toContain("blue");
  });

  it("maps liability to red", () => {
    expect(typeColors.liability).toContain("red");
  });

  it("maps equity to purple", () => {
    expect(typeColors.equity).toContain("purple");
  });

  it("maps revenue to green", () => {
    expect(typeColors.revenue).toContain("green");
  });

  it("maps expense to amber", () => {
    expect(typeColors.expense).toContain("amber");
  });
});

describe("Accounts — filterAccounts", () => {
  const accounts = [
    { name: "Cash", code: "1000" },
    { name: "Accounts Receivable", code: "1200" },
    { name: "Revenue", code: "4000" },
    { name: "Cost of Goods Sold", code: "5000" },
  ];

  it("returns all accounts for empty search", () => {
    expect(filterAccounts(accounts, "")).toEqual(accounts);
  });

  it("filters by name", () => {
    const result = filterAccounts(accounts, "cash");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Cash");
  });

  it("filters by code", () => {
    const result = filterAccounts(accounts, "4000");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Revenue");
  });

  it("is case insensitive", () => {
    const result = filterAccounts(accounts, "REVENUE");
    expect(result).toHaveLength(1);
  });

  it("matches partial names", () => {
    const result = filterAccounts(accounts, "Accounts");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Accounts Receivable");
  });

  it("matches partial codes", () => {
    const result = filterAccounts(accounts, "50");
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("5000");
  });

  it("returns empty for no match", () => {
    expect(filterAccounts(accounts, "zzz")).toHaveLength(0);
  });
});
