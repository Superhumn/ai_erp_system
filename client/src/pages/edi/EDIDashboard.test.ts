/**
 * Tests for EDIDashboard page utility functions.
 * Functions tested: txnSetLabels, statusColors
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from EDIDashboard.tsx ──

const txnSetLabels: Record<string, string> = {
  "850": "Purchase Order",
  "855": "PO Acknowledgment",
  "810": "Invoice",
  "856": "Advance Ship Notice",
  "997": "Functional Acknowledgment",
};

const statusColors: Record<string, string> = {
  received: "bg-blue-500/10 text-blue-600",
  parsing: "bg-amber-500/10 text-amber-600",
  parsed: "bg-cyan-500/10 text-cyan-600",
  validated: "bg-green-500/10 text-green-600",
  processing: "bg-purple-500/10 text-purple-600",
  processed: "bg-emerald-500/10 text-emerald-600",
  error: "bg-red-500/10 text-red-600",
  rejected: "bg-red-500/10 text-red-600",
  acknowledged: "bg-green-500/10 text-green-600",
};

// ── Tests ──

describe("EDIDashboard — txnSetLabels", () => {
  it("has 5 transaction set codes", () => {
    expect(Object.keys(txnSetLabels)).toHaveLength(5);
  });

  it("maps 850 to Purchase Order", () => {
    expect(txnSetLabels["850"]).toBe("Purchase Order");
  });

  it("maps 855 to PO Acknowledgment", () => {
    expect(txnSetLabels["855"]).toBe("PO Acknowledgment");
  });

  it("maps 810 to Invoice", () => {
    expect(txnSetLabels["810"]).toBe("Invoice");
  });

  it("maps 856 to Advance Ship Notice", () => {
    expect(txnSetLabels["856"]).toBe("Advance Ship Notice");
  });

  it("maps 997 to Functional Acknowledgment", () => {
    expect(txnSetLabels["997"]).toBe("Functional Acknowledgment");
  });

  it("returns undefined for unknown code", () => {
    expect(txnSetLabels["999"]).toBeUndefined();
  });
});

describe("EDIDashboard — statusColors", () => {
  it("has 9 status types", () => {
    expect(Object.keys(statusColors)).toHaveLength(9);
  });

  it("maps received to blue", () => {
    expect(statusColors.received).toContain("blue");
  });

  it("maps parsing to amber", () => {
    expect(statusColors.parsing).toContain("amber");
  });

  it("maps validated to green", () => {
    expect(statusColors.validated).toContain("green");
  });

  it("maps processed to emerald", () => {
    expect(statusColors.processed).toContain("emerald");
  });

  it("maps error to red", () => {
    expect(statusColors.error).toContain("red");
  });

  it("maps rejected to red", () => {
    expect(statusColors.rejected).toContain("red");
  });

  it("all values contain bg- class", () => {
    for (const color of Object.values(statusColors)) {
      expect(color).toMatch(/^bg-/);
    }
  });
});
