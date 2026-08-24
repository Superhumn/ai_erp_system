import { describe, it, expect } from "vitest";
import {
  GRAMS_PER_LB,
  PlanUnitError,
  applyYieldLoss,
  bomBatchMultiplier,
  componentRequiredQuantity,
  computeMaterialShortage,
  computePlanTargets,
  convertPlanQuantity,
  isOrderUrgent,
  latestOrderDate,
  normalizePlanUnit,
  planUnitDimension,
  toGrams,
} from "./productionPlanning";

describe("normalizePlanUnit", () => {
  it("maps aliases onto plan units", () => {
    expect(normalizePlanUnit("lbs")).toBe("LB");
    expect(normalizePlanUnit("Pounds")).toBe("LB");
    expect(normalizePlanUnit(" each ")).toBe("EA");
    expect(normalizePlanUnit("packages")).toBe("EA");
    expect(normalizePlanUnit("g")).toBe("G");
    expect(normalizePlanUnit("cases")).toBe("CASE");
    expect(normalizePlanUnit("batches")).toBe("BATCH");
  });

  it("returns null for unknown units", () => {
    expect(normalizePlanUnit("furlong")).toBeNull();
    expect(normalizePlanUnit("")).toBeNull();
    expect(normalizePlanUnit(undefined)).toBeNull();
  });
});

describe("planUnitDimension", () => {
  it("classifies units", () => {
    expect(planUnitDimension("EA")).toBe("count");
    expect(planUnitDimension("CASE")).toBe("count");
    expect(planUnitDimension("BATCH")).toBe("batch");
    expect(planUnitDimension("LB")).toBe("weight");
  });
});

describe("convertPlanQuantity", () => {
  it("converts within the weight axis", () => {
    expect(convertPlanQuantity(2, "KG", "G")).toBe(2000);
    expect(convertPlanQuantity(1, "LB", "G")).toBeCloseTo(GRAMS_PER_LB, 5);
    expect(convertPlanQuantity(16, "OZ", "LB")).toBeCloseTo(1, 6);
  });

  it("converts cases to units with a case size", () => {
    expect(convertPlanQuantity(10, "CASE", "EA", { unitsPerCase: 12 })).toBe(120);
    expect(convertPlanQuantity(120, "EA", "CASE", { unitsPerCase: 12 })).toBe(10);
  });

  it("crosses count and weight with a unit weight", () => {
    // 100 packages at 227 g each = 22,700 g = 50.04 lb
    expect(convertPlanQuantity(100, "EA", "G", { unitWeightGrams: 227 })).toBe(22700);
    expect(convertPlanQuantity(100, "EA", "LB", { unitWeightGrams: 227 })).toBeCloseTo(50.045, 3);
    expect(
      convertPlanQuantity(10, "CASE", "LB", { unitsPerCase: 12, unitWeightGrams: 454 }),
    ).toBeCloseTo(120.11, 2);
  });

  it("converts batches using the batch size", () => {
    expect(convertPlanQuantity(3, "BATCH", "G", { batchGrams: 1000 })).toBe(3000);
    expect(convertPlanQuantity(4500, "G", "BATCH", { batchGrams: 1000 })).toBe(4.5);
    expect(convertPlanQuantity(2, "BATCH", "EA", { batchUnits: 50 })).toBe(100);
  });

  it("is a no-op for identical units", () => {
    expect(convertPlanQuantity(7.5, "LB", "LB")).toBe(7.5);
  });

  it("names the missing fact when it can't convert", () => {
    expect(() => convertPlanQuantity(10, "CASE", "EA")).toThrow(PlanUnitError);
    expect(() => convertPlanQuantity(10, "CASE", "EA")).toThrow(/units per case/);
    expect(() => convertPlanQuantity(10, "EA", "LB")).toThrow(/unit weight in grams/);
    expect(() => convertPlanQuantity(10, "BATCH", "G")).toThrow(/batch size/);
  });

  it("ignores zero or negative context values", () => {
    expect(() => convertPlanQuantity(10, "CASE", "EA", { unitsPerCase: 0 })).toThrow(PlanUnitError);
    expect(() => convertPlanQuantity(10, "EA", "G", { unitWeightGrams: -5 })).toThrow(PlanUnitError);
  });
});

describe("toGrams", () => {
  it("shortcuts to the gram axis", () => {
    expect(toGrams(2.5, "KG")).toBe(2500);
    expect(toGrams(24, "EA", { unitWeightGrams: 100 })).toBe(2400);
  });
});

describe("computePlanTargets", () => {
  it("adds the safety margin", () => {
    const r = computePlanTargets({ quantity: 1000, safetyMarginPercent: 20 });
    expect(r.targetQuantity).toBe(1000);
    expect(r.safetyStock).toBe(200);
    expect(r.plannedQuantity).toBe(1200);
  });

  it("nets off finished goods on hand when asked", () => {
    const r = computePlanTargets({
      quantity: 1000,
      safetyMarginPercent: 20,
      currentInventory: 300,
      netOffInventory: true,
    });
    expect(r.plannedQuantity).toBe(900);
  });

  it("ignores inventory when netting is off", () => {
    const r = computePlanTargets({ quantity: 1000, currentInventory: 300, netOffInventory: false });
    expect(r.plannedQuantity).toBe(1000);
  });

  it("never plans a negative quantity", () => {
    const r = computePlanTargets({ quantity: 100, currentInventory: 500, netOffInventory: true });
    expect(r.plannedQuantity).toBe(0);
  });

  it("defaults a missing margin to zero", () => {
    expect(computePlanTargets({ quantity: 50 }).plannedQuantity).toBe(50);
  });
});

describe("bomBatchMultiplier", () => {
  it("scales a recipe-synced BOM stated in grams", () => {
    // Recipe base batch = 1000 g; plan 50 lb → 22.68 batches
    const m = bomBatchMultiplier({
      plannedQuantity: 50,
      planUnit: "LB",
      batchSize: 1000,
      batchUnit: "G",
    });
    expect(m).toBeCloseTo(22.68, 2);
  });

  it("treats a BATCH plan as batches directly", () => {
    expect(
      bomBatchMultiplier({ plannedQuantity: 6, planUnit: "BATCH", batchSize: 1000, batchUnit: "G" }),
    ).toBe(6);
  });

  it("handles a per-unit BOM", () => {
    expect(
      bomBatchMultiplier({ plannedQuantity: 500, planUnit: "EA", batchSize: 1, batchUnit: "EA" }),
    ).toBe(500);
  });

  it("handles a BOM batch that yields many units", () => {
    expect(
      bomBatchMultiplier({ plannedQuantity: 500, planUnit: "EA", batchSize: 100, batchUnit: "EA" }),
    ).toBe(5);
  });

  it("falls back to the planned quantity when batch size is missing", () => {
    expect(
      bomBatchMultiplier({ plannedQuantity: 42, planUnit: "EA", batchSize: 0, batchUnit: "EA" }),
    ).toBe(42);
  });
});

describe("componentRequiredQuantity", () => {
  it("scales by batches", () => {
    expect(componentRequiredQuantity({ componentQuantity: 250, batchMultiplier: 4 })).toBe(1000);
  });

  it("adds wastage", () => {
    expect(
      componentRequiredQuantity({ componentQuantity: 100, wastagePercent: 5, batchMultiplier: 2 }),
    ).toBe(210);
  });

  it("ignores negative wastage", () => {
    expect(
      componentRequiredQuantity({ componentQuantity: 100, wastagePercent: -10, batchMultiplier: 1 }),
    ).toBe(100);
  });
});

describe("applyYieldLoss", () => {
  it("grosses up for expected yield", () => {
    expect(applyYieldLoss(900, 0.9)).toBe(1000);
  });

  it("leaves quantities alone at 100% yield or better", () => {
    expect(applyYieldLoss(900, 1)).toBe(900);
    expect(applyYieldLoss(900, 1.05)).toBe(900);
  });

  it("ignores a missing or nonsense yield", () => {
    expect(applyYieldLoss(900, null)).toBe(900);
    expect(applyYieldLoss(900, 0)).toBe(900);
  });
});

describe("computeMaterialShortage", () => {
  it("nets against stock and open orders", () => {
    const r = computeMaterialShortage({ requiredQuantity: 1000, onHand: 300, onOrder: 200 });
    expect(r.shortageQuantity).toBe(500);
    expect(r.suggestedOrderQuantity).toBe(500);
  });

  it("applies the purchase buffer", () => {
    const r = computeMaterialShortage({
      requiredQuantity: 1000,
      onHand: 0,
      orderBufferPercent: 10,
    });
    expect(r.suggestedOrderQuantity).toBe(1100);
  });

  it("returns zero when covered", () => {
    const r = computeMaterialShortage({
      requiredQuantity: 100,
      onHand: 80,
      onOrder: 50,
      orderBufferPercent: 10,
    });
    expect(r.shortageQuantity).toBe(0);
    expect(r.suggestedOrderQuantity).toBe(0);
  });
});

describe("order timing", () => {
  const requiredBy = new Date("2026-09-01T00:00:00Z");

  it("backs the order date off by the lead time", () => {
    expect(latestOrderDate(requiredBy, 14).toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });

  it("flags orders that can no longer arrive in time", () => {
    expect(isOrderUrgent(new Date("2026-08-24T00:00:00Z"), requiredBy, 14)).toBe(true);
    expect(isOrderUrgent(new Date("2026-08-01T00:00:00Z"), requiredBy, 14)).toBe(false);
  });
});
