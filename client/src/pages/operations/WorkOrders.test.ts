/**
 * Tests for WorkOrders page utility functions.
 * Functions tested: getStatusColor, getPriorityColor, handleBomSelect logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from WorkOrders.tsx ──

function getStatusColor(status: string): string {
  switch (status) {
    case "draft": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    case "scheduled": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
    case "in_progress": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
    case "completed": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
    case "cancelled": return "bg-red-500/8 text-red-600 dark:text-red-400";
    default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "urgent": return "bg-red-500/8 text-red-600 dark:text-red-400";
    case "high": return "bg-orange-500/8 text-orange-600 dark:text-orange-400";
    case "normal": return "bg-blue-500/8 text-blue-600 dark:text-blue-400";
    case "low": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
  }
}

// BOM select logic
function resolveBomSelection(
  bomId: string,
  boms: Array<{ id: number; productId: number | null }> | undefined,
): { bomId: number; productId: number } {
  const bom = boms?.find(b => b.id === parseInt(bomId));
  return {
    bomId: parseInt(bomId),
    productId: bom?.productId || 0,
  };
}

// ── Tests ──

describe("WorkOrders — getStatusColor", () => {
  it("returns gray for draft", () => {
    expect(getStatusColor("draft")).toContain("gray");
  });

  it("returns blue for scheduled", () => {
    expect(getStatusColor("scheduled")).toContain("blue");
  });

  it("returns amber for in_progress", () => {
    expect(getStatusColor("in_progress")).toContain("amber");
  });

  it("returns emerald for completed", () => {
    expect(getStatusColor("completed")).toContain("emerald");
  });

  it("returns red for cancelled", () => {
    expect(getStatusColor("cancelled")).toContain("red");
  });

  it("returns gray for unknown status", () => {
    expect(getStatusColor("unknown")).toContain("gray");
  });

  it("includes dark mode variants", () => {
    expect(getStatusColor("completed")).toContain("dark:");
  });
});

describe("WorkOrders — getPriorityColor", () => {
  it("returns red for urgent", () => {
    expect(getPriorityColor("urgent")).toContain("red");
  });

  it("returns orange for high", () => {
    expect(getPriorityColor("high")).toContain("orange");
  });

  it("returns blue for normal", () => {
    expect(getPriorityColor("normal")).toContain("blue");
  });

  it("returns gray for low", () => {
    expect(getPriorityColor("low")).toContain("gray");
  });

  it("returns gray for unknown priority", () => {
    expect(getPriorityColor("unknown")).toContain("gray");
  });
});

describe("WorkOrders — resolveBomSelection", () => {
  const boms = [
    { id: 1, productId: 10 },
    { id: 2, productId: 20 },
    { id: 3, productId: null },
  ];

  it("returns matching BOM and product IDs", () => {
    const result = resolveBomSelection("1", boms);
    expect(result.bomId).toBe(1);
    expect(result.productId).toBe(10);
  });

  it("returns second BOM correctly", () => {
    const result = resolveBomSelection("2", boms);
    expect(result.bomId).toBe(2);
    expect(result.productId).toBe(20);
  });

  it("returns 0 for BOM with null productId", () => {
    const result = resolveBomSelection("3", boms);
    expect(result.bomId).toBe(3);
    expect(result.productId).toBe(0);
  });

  it("returns 0 for non-existent BOM", () => {
    const result = resolveBomSelection("999", boms);
    expect(result.bomId).toBe(999);
    expect(result.productId).toBe(0);
  });

  it("handles undefined boms list", () => {
    const result = resolveBomSelection("1", undefined);
    expect(result.bomId).toBe(1);
    expect(result.productId).toBe(0);
  });
});
