import { describe, it, expect } from "vitest";
import {
  evaluateCondition, evaluateConditions, fieldChangeMatches, interpolate,
} from "./opsAutomationConditions";
import type { AutomationCondition } from "@shared/opsToolkit";

describe("evaluateCondition", () => {
  const rec = { status: "shipped", total: "1200.50", notes: "" };

  it("handles eq / neq", () => {
    expect(evaluateCondition(rec, { field: "status", op: "eq", value: "shipped" })).toBe(true);
    expect(evaluateCondition(rec, { field: "status", op: "eq", value: "pending" })).toBe(false);
    expect(evaluateCondition(rec, { field: "status", op: "neq", value: "pending" })).toBe(true);
  });

  it("handles contains (case-insensitive)", () => {
    expect(evaluateCondition(rec, { field: "status", op: "contains", value: "SHIP" })).toBe(true);
    expect(evaluateCondition(rec, { field: "status", op: "contains", value: "xyz" })).toBe(false);
  });

  it("compares numbers even when stored as strings", () => {
    expect(evaluateCondition(rec, { field: "total", op: "gt", value: "1000" })).toBe(true);
    expect(evaluateCondition(rec, { field: "total", op: "lte", value: "1000" })).toBe(false);
    expect(evaluateCondition(rec, { field: "total", op: "gte", value: "1200.50" })).toBe(true);
  });

  it("handles empty / not_empty", () => {
    expect(evaluateCondition(rec, { field: "notes", op: "empty" })).toBe(true);
    expect(evaluateCondition(rec, { field: "status", op: "not_empty" })).toBe(true);
    expect(evaluateCondition(rec, { field: "missing", op: "empty" })).toBe(true);
  });
});

describe("evaluateConditions", () => {
  const rec = { status: "shipped", priority: "high" };
  it("ANDs all conditions; empty list passes", () => {
    expect(evaluateConditions(rec, [])).toBe(true);
    expect(evaluateConditions(rec, undefined)).toBe(true);
    const both: AutomationCondition[] = [
      { field: "status", op: "eq", value: "shipped" },
      { field: "priority", op: "eq", value: "high" },
    ];
    expect(evaluateConditions(rec, both)).toBe(true);
    both[1].value = "low";
    expect(evaluateConditions(rec, both)).toBe(false);
  });
});

describe("fieldChangeMatches", () => {
  it("fires only when the watched field actually changes", () => {
    expect(fieldChangeMatches({ field: "status" }, { status: "b" }, { status: "a" })).toBe(true);
    expect(fieldChangeMatches({ field: "status" }, { status: "a" }, { status: "a" })).toBe(false);
  });
  it("respects a target toValue", () => {
    expect(fieldChangeMatches({ field: "status", toValue: "shipped" }, { status: "shipped" }, { status: "pending" })).toBe(true);
    expect(fieldChangeMatches({ field: "status", toValue: "shipped" }, { status: "delivered" }, { status: "pending" })).toBe(false);
  });
  it("any update qualifies when no field is configured", () => {
    expect(fieldChangeMatches({}, { a: 1 }, { a: 2 })).toBe(true);
  });
});

describe("interpolate", () => {
  it("substitutes {{field}} tokens and blanks unknowns", () => {
    expect(interpolate("Order {{orderNumber}} is {{status}}", { orderNumber: "SO-1", status: "shipped" }))
      .toBe("Order SO-1 is shipped");
    expect(interpolate("Hi {{missing}}!", {})).toBe("Hi !");
  });
});
