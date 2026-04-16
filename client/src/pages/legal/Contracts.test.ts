/**
 * Tests for Contracts page utility functions.
 * Functions tested: typeColors, filteredContracts logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from Contracts.tsx ──

const typeColors: Record<string, string> = {
  customer: "bg-blue-500/10 text-blue-600",
  vendor: "bg-purple-500/10 text-purple-600",
  employment: "bg-green-500/10 text-green-600",
  nda: "bg-amber-500/10 text-amber-600",
  partnership: "bg-indigo-500/10 text-indigo-600",
  other: "bg-gray-500/10 text-gray-600",
};

function filterContracts(
  contracts: Array<{ title: string; contractNumber: string; partyName?: string | null; status: string }>,
  search: string,
  statusFilter: string,
): typeof contracts {
  return contracts.filter((contract) => {
    const matchesSearch =
      contract.title.toLowerCase().includes(search.toLowerCase()) ||
      contract.contractNumber.toLowerCase().includes(search.toLowerCase()) ||
      contract.partyName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || contract.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
}

// ── Tests ──

describe("Contracts — typeColors", () => {
  it("has 6 contract types", () => {
    expect(Object.keys(typeColors)).toHaveLength(6);
  });

  it("maps customer to blue", () => {
    expect(typeColors.customer).toContain("blue");
  });

  it("maps vendor to purple", () => {
    expect(typeColors.vendor).toContain("purple");
  });

  it("maps employment to green", () => {
    expect(typeColors.employment).toContain("green");
  });

  it("maps nda to amber", () => {
    expect(typeColors.nda).toContain("amber");
  });

  it("maps partnership to indigo", () => {
    expect(typeColors.partnership).toContain("indigo");
  });

  it("maps other to gray", () => {
    expect(typeColors.other).toContain("gray");
  });
});

describe("Contracts — filterContracts", () => {
  const contracts = [
    { title: "Supply Agreement", contractNumber: "CON-001", partyName: "Acme Corp", status: "active" },
    { title: "NDA", contractNumber: "CON-002", partyName: "Widget Inc", status: "active" },
    { title: "Employment", contractNumber: "CON-003", partyName: "John Doe", status: "expired" },
    { title: "License", contractNumber: "CON-004", partyName: null, status: "draft" },
  ];

  it("returns all contracts with empty search and 'all' status", () => {
    expect(filterContracts(contracts, "", "all")).toHaveLength(4);
  });

  it("filters by title", () => {
    const result = filterContracts(contracts, "supply", "all");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Supply Agreement");
  });

  it("filters by contract number", () => {
    const result = filterContracts(contracts, "CON-002", "all");
    expect(result).toHaveLength(1);
  });

  it("filters by party name", () => {
    const result = filterContracts(contracts, "widget", "all");
    expect(result).toHaveLength(1);
  });

  it("filters by status", () => {
    const result = filterContracts(contracts, "", "expired");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Employment");
  });

  it("combines search and status filter", () => {
    const result = filterContracts(contracts, "CON", "active");
    expect(result).toHaveLength(2);
  });

  it("returns empty for no match", () => {
    expect(filterContracts(contracts, "zzz", "all")).toHaveLength(0);
  });

  it("handles null partyName gracefully", () => {
    const result = filterContracts(contracts, "License", "all");
    expect(result).toHaveLength(1);
    expect(result[0].partyName).toBeNull();
  });

  it("is case insensitive", () => {
    expect(filterContracts(contracts, "NDA", "all")).toHaveLength(1);
    expect(filterContracts(contracts, "nda", "all")).toHaveLength(1);
  });
});
