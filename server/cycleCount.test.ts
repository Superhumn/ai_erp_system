import { describe, it, expect } from "vitest";
import {
  assertTransition,
  canTransition,
  computeVariance,
  computeVarianceValue,
  resolveAdjustment,
  shouldHideSystemQuantity,
  summarizeVariance,
  uncountedLines,
} from "./cycleCountLogic";
import {
  ADJUSTMENT_REASON_CODES,
  DECREASE_ONLY_REASON_CODES,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReasonCode,
} from "@shared/inventoryAdjustments";

describe("cycle count state machine", () => {
  it("walks the happy path draft -> in_progress -> pending_review -> approved", () => {
    expect(canTransition("draft", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "pending_review")).toBe(true);
    expect(canTransition("pending_review", "approved")).toBe(true);
  });

  it("refuses to approve a count that never went to review", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("in_progress", "approved")).toBe(false);
    expect(() => assertTransition("in_progress", "approved")).toThrow(/cannot move to "approved"/);
  });

  it("treats approved and cancelled as terminal", () => {
    for (const target of ["draft", "in_progress", "pending_review", "approved", "cancelled"] as const) {
      expect(canTransition("approved", target)).toBe(false);
      expect(canTransition("cancelled", target)).toBe(false);
    }
  });

  it("allows a reviewer to send a count back for recounting", () => {
    expect(canTransition("pending_review", "in_progress")).toBe(true);
  });

  it("allows cancellation from any open state but not after approval", () => {
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("pending_review", "cancelled")).toBe(true);
    expect(() => assertTransition("approved", "cancelled")).toThrow();
  });
});

describe("blind counts", () => {
  it("hides book quantity while the count is open", () => {
    expect(shouldHideSystemQuantity("draft", true)).toBe(true);
    expect(shouldHideSystemQuantity("in_progress", true)).toBe(true);
  });

  it("reveals book quantity once the count reaches review", () => {
    expect(shouldHideSystemQuantity("pending_review", true)).toBe(false);
    expect(shouldHideSystemQuantity("approved", true)).toBe(false);
  });

  it("never hides anything on a non-blind count", () => {
    expect(shouldHideSystemQuantity("draft", false)).toBe(false);
    expect(shouldHideSystemQuantity("in_progress", false)).toBe(false);
  });
});

describe("variance maths", () => {
  it("reports a shortage as negative and an overage as positive", () => {
    expect(computeVariance(100, 94)).toBe(-6);
    expect(computeVariance(100, 107)).toBe(7);
    expect(computeVariance(100, 100)).toBe(0);
  });

  it("values variance at unit cost, rounded to cents", () => {
    expect(computeVarianceValue(-6, 12.345)).toBe(-74.07);
    expect(computeVarianceValue(3, 0)).toBe(0);
  });

  it("values variance at zero when no cost is known", () => {
    expect(computeVarianceValue(-6, NaN)).toBe(0);
  });
});

describe("variance summary", () => {
  const line = (counted: string | null, variance: string | null, value: string | null) => ({
    countedQuantity: counted,
    variance,
    varianceValue: value,
  });

  it("scores accuracy over counted lines only", () => {
    const summary = summarizeVariance([
      line("100", "0", "0.00"),
      line("50", "-2", "-20.00"),
      line(null, null, null), // not yet counted
    ]);

    expect(summary.totalLines).toBe(3);
    expect(summary.countedLines).toBe(2);
    expect(summary.linesWithVariance).toBe(1);
    expect(summary.accuracyPercent).toBe(50);
  });

  it("separates net variance from absolute so offsetting errors still show", () => {
    const summary = summarizeVariance([
      line("110", "10", "100.00"),
      line("90", "-10", "-100.00"),
    ]);

    expect(summary.netVarianceValue).toBe(0);
    expect(summary.absoluteVarianceValue).toBe(200);
    expect(summary.accuracyPercent).toBe(0);
  });

  it("reports 100% accuracy when every counted line matched", () => {
    const summary = summarizeVariance([line("10", "0", "0.00"), line("20", "0", "0.00")]);
    expect(summary.accuracyPercent).toBe(100);
    expect(summary.linesWithVariance).toBe(0);
  });

  it("does not divide by zero on an uncounted sheet", () => {
    const summary = summarizeVariance([line(null, null, null)]);
    expect(summary.accuracyPercent).toBe(0);
    expect(summary.countedLines).toBe(0);
  });

  it("handles an empty sheet", () => {
    expect(summarizeVariance([])).toMatchObject({ totalLines: 0, countedLines: 0, accuracyPercent: 0 });
  });
});

describe("uncounted lines gate", () => {
  it("blocks review while lines are pending or flagged for recount", () => {
    const lines = [
      { status: "counted" },
      { status: "pending" },
      { status: "recount" },
      { status: "approved" },
    ];
    expect(uncountedLines(lines)).toHaveLength(2);
  });

  it("passes a fully counted sheet", () => {
    expect(uncountedLines([{ status: "counted" }, { status: "counted" }])).toHaveLength(0);
  });
});

describe("adjustment guards", () => {
  it("computes the resulting balance", () => {
    expect(resolveAdjustment({ currentQuantity: 100, quantityDelta: -6 }))
      .toEqual({ previousQuantity: 100, newQuantity: 94 });
  });

  it("rejects a no-op adjustment", () => {
    expect(() => resolveAdjustment({ currentQuantity: 100, quantityDelta: 0 }))
      .toThrow(/non-zero/);
  });

  it("rejects non-finite deltas", () => {
    expect(() => resolveAdjustment({ currentQuantity: 100, quantityDelta: NaN })).toThrow(/non-zero/);
    expect(() => resolveAdjustment({ currentQuantity: 100, quantityDelta: Infinity })).toThrow(/non-zero/);
  });

  it("refuses to drive stock negative", () => {
    expect(() => resolveAdjustment({ currentQuantity: 5, quantityDelta: -6 }))
      .toThrow(/would drive inventory negative/);
  });

  it("names the lot balance when that is what would go negative", () => {
    expect(() => resolveAdjustment({ currentQuantity: 0, quantityDelta: -1, label: "lot balance" }))
      .toThrow(/would drive lot balance negative/);
  });

  it("allows a decrease to exactly zero", () => {
    expect(resolveAdjustment({ currentQuantity: 5, quantityDelta: -5 }).newQuantity).toBe(0);
  });

  it("allows building stock from an empty position", () => {
    expect(resolveAdjustment({ currentQuantity: 0, quantityDelta: 12 }).newQuantity).toBe(12);
  });
});

describe("adjustment reason codes", () => {
  it("labels every code", () => {
    for (const code of ADJUSTMENT_REASON_CODES) {
      expect(ADJUSTMENT_REASON_LABELS[code]).toBeTruthy();
    }
  });

  it("keeps decrease-only codes within the known set", () => {
    for (const code of DECREASE_ONLY_REASON_CODES) {
      expect(ADJUSTMENT_REASON_CODES).toContain(code);
    }
  });

  it("covers the shrinkage causes a count needs to explain", () => {
    const required: AdjustmentReasonCode[] = ["damage", "expiry", "theft", "shrinkage", "found"];
    for (const code of required) {
      expect(ADJUSTMENT_REASON_CODES).toContain(code);
    }
  });
});
