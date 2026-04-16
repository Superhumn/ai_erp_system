/**
 * Tests for BOM page utility functions.
 * Functions tested: getStatusBadge logic, summary stats computation
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from BOM.tsx ──

function getStatusColorClass(status: string): string {
  switch (status) {
    case "active": return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
    case "draft": return "bg-amber-500/8 text-amber-600 dark:text-amber-400";
    case "obsolete": return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    default: return "";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active": return "Active";
    case "draft": return "Draft";
    case "obsolete": return "Obsolete";
    default: return status;
  }
}

function computeBomStats(boms: Array<{ status: string }> | undefined) {
  if (!boms) return { activeBoms: 0, draftBoms: 0, totalBoms: 0 };
  return {
    activeBoms: boms.filter(b => b.status === "active").length,
    draftBoms: boms.filter(b => b.status === "draft").length,
    totalBoms: boms.length,
  };
}

// ── Tests ──

describe("BOM — getStatusColorClass", () => {
  it("returns emerald for active", () => {
    expect(getStatusColorClass("active")).toContain("emerald");
  });

  it("returns amber for draft", () => {
    expect(getStatusColorClass("draft")).toContain("amber");
  });

  it("returns gray for obsolete", () => {
    expect(getStatusColorClass("obsolete")).toContain("gray");
  });

  it("returns empty string for unknown", () => {
    expect(getStatusColorClass("unknown")).toBe("");
  });
});

describe("BOM — getStatusLabel", () => {
  it("returns 'Active' for active", () => {
    expect(getStatusLabel("active")).toBe("Active");
  });

  it("returns 'Draft' for draft", () => {
    expect(getStatusLabel("draft")).toBe("Draft");
  });

  it("returns 'Obsolete' for obsolete", () => {
    expect(getStatusLabel("obsolete")).toBe("Obsolete");
  });

  it("returns raw status for unknown", () => {
    expect(getStatusLabel("pending")).toBe("pending");
  });
});

describe("BOM — computeBomStats", () => {
  it("returns zeros for undefined", () => {
    expect(computeBomStats(undefined)).toEqual({ activeBoms: 0, draftBoms: 0, totalBoms: 0 });
  });

  it("returns zeros for empty array", () => {
    expect(computeBomStats([])).toEqual({ activeBoms: 0, draftBoms: 0, totalBoms: 0 });
  });

  it("counts active BOMs", () => {
    const boms = [
      { status: "active" },
      { status: "active" },
      { status: "draft" },
    ];
    const result = computeBomStats(boms);
    expect(result.activeBoms).toBe(2);
  });

  it("counts draft BOMs", () => {
    const boms = [
      { status: "draft" },
      { status: "active" },
    ];
    expect(computeBomStats(boms).draftBoms).toBe(1);
  });

  it("counts total correctly", () => {
    const boms = [
      { status: "active" },
      { status: "draft" },
      { status: "obsolete" },
    ];
    expect(computeBomStats(boms).totalBoms).toBe(3);
  });

  it("handles all obsolete BOMs", () => {
    const boms = [
      { status: "obsolete" },
      { status: "obsolete" },
    ];
    const result = computeBomStats(boms);
    expect(result.activeBoms).toBe(0);
    expect(result.draftBoms).toBe(0);
    expect(result.totalBoms).toBe(2);
  });
});
