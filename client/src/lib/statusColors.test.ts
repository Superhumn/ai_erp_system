/**
 * Tests for shared status color mappings — client/src/lib/statusColors.ts
 */
import { describe, it, expect } from "vitest";
import { commonStatusColors, getStatusColor } from "./statusColors";

describe("commonStatusColors", () => {
  it("has green-themed positive statuses", () => {
    const greenStatuses = [
      "active", "completed", "delivered", "paid", "received",
      "approved", "resolved", "cleared", "renewed", "closed", "posted", "arrived",
    ];
    for (const status of greenStatuses) {
      expect(commonStatusColors[status]).toContain("text-green-600");
    }
  });

  it("has amber-themed pending statuses", () => {
    const amberStatuses = [
      "pending", "in_progress", "partial", "on_hold", "on_leave",
      "investigating", "negotiating", "pending_review", "ordered",
    ];
    for (const status of amberStatuses) {
      expect(commonStatusColors[status]).toContain("text-amber-600");
    }
  });

  it("has blue-themed informational statuses", () => {
    expect(commonStatusColors["confirmed"]).toContain("text-blue-600");
    expect(commonStatusColors["sent"]).toContain("text-blue-600");
    expect(commonStatusColors["planning"]).toContain("text-blue-600");
    expect(commonStatusColors["open"]).toContain("text-blue-600");
  });

  it("has red-themed negative statuses", () => {
    const redStatuses = [
      "cancelled", "failed", "overdue", "rejected",
      "terminated", "escalated", "expired", "returned", "void",
    ];
    for (const status of redStatuses) {
      expect(commonStatusColors[status]).toContain("text-red-600");
    }
  });

  it("has gray-themed neutral statuses", () => {
    const grayStatuses = ["draft", "inactive", "prospect", "not_started", "discontinued"];
    for (const status of grayStatuses) {
      expect(commonStatusColors[status]).toMatch(/text-gray-(500|600)/);
    }
  });
});

describe("getStatusColor", () => {
  it("returns correct color for known status", () => {
    expect(getStatusColor("active")).toBe("bg-green-500/10 text-green-600");
  });

  it("returns correct color for pending", () => {
    expect(getStatusColor("pending")).toBe("bg-amber-500/10 text-amber-600");
  });

  it("returns correct color for cancelled", () => {
    expect(getStatusColor("cancelled")).toBe("bg-red-500/10 text-red-600");
  });

  it("returns fallback gray for unknown status", () => {
    expect(getStatusColor("some_unknown_status")).toBe("bg-gray-500/10 text-gray-500");
  });

  it("returns fallback gray for null", () => {
    expect(getStatusColor(null)).toBe("bg-gray-500/10 text-gray-500");
  });

  it("returns fallback gray for undefined", () => {
    expect(getStatusColor(undefined)).toBe("bg-gray-500/10 text-gray-500");
  });

  it("returns fallback gray for empty string", () => {
    expect(getStatusColor("")).toBe("bg-gray-500/10 text-gray-500");
  });
});
