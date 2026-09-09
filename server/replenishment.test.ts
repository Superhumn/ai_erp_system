import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_TIME_DAYS,
  classifyUrgency,
  compareByUrgency,
  dailyDemand,
  daysOfCover,
  reorderPoint,
  safetyStockUnits,
  suggestReplenishment,
} from "./replenishment";

describe("dailyDemand", () => {
  it("averages sales across the window", () => {
    expect(dailyDemand(300, 30)).toBe(10);
  });

  it("is zero when nothing sold, or the window is empty", () => {
    expect(dailyDemand(0, 30)).toBe(0);
    expect(dailyDemand(300, 0)).toBe(0);
    expect(dailyDemand(-5, 30)).toBe(0);
  });
});

describe("reorder point", () => {
  it("covers the lead time plus the safety buffer", () => {
    // 10/day, 14-day lead, 7 days safety => 140 + 70
    expect(reorderPoint(10, 14, 7)).toBe(210);
  });

  it("is zero without demand — a dead product needs no buffer", () => {
    expect(reorderPoint(0, 14, 7)).toBe(0);
    expect(safetyStockUnits(0, 7)).toBe(0);
  });

  it("treats a negative lead time as immediate", () => {
    expect(reorderPoint(10, -5, 7)).toBe(70);
  });
});

describe("days of cover", () => {
  it("divides available stock by daily demand", () => {
    expect(daysOfCover(100, 10)).toBe(10);
  });

  it("is null when nothing is moving, rather than infinite", () => {
    expect(daysOfCover(100, 0)).toBeNull();
  });

  it("floors negative stock at zero days", () => {
    expect(daysOfCover(-20, 10)).toBe(0);
  });
});

describe("urgency", () => {
  it("judges cover against the lead time, not a fixed threshold", () => {
    // 10 days of cover is fine for a 3-day lead time...
    expect(classifyUrgency(10, 3)).toBe("ok");
    // ...and already too late for a 30-day one.
    expect(classifyUrgency(10, 30)).toBe("urgent");
  });

  it("flags a stockout and an absence of demand distinctly", () => {
    expect(classifyUrgency(0, 14)).toBe("stockout");
    expect(classifyUrgency(null, 14)).toBe("no_demand");
  });

  it("calls the safety window 'soon'", () => {
    // Lead time 10, safety 7 => cover between 10 and 17 is "soon".
    expect(classifyUrgency(12, 10)).toBe("soon");
    expect(classifyUrgency(20, 10)).toBe("ok");
  });

  it("orders most pressing first, then largest order", () => {
    const rows = [
      { urgency: "ok" as const, suggestedQuantity: 100 },
      { urgency: "stockout" as const, suggestedQuantity: 5 },
      { urgency: "urgent" as const, suggestedQuantity: 10 },
      { urgency: "urgent" as const, suggestedQuantity: 50 },
    ];
    expect([...rows].sort(compareByUrgency)).toEqual([
      { urgency: "stockout", suggestedQuantity: 5 },
      { urgency: "urgent", suggestedQuantity: 50 },
      { urgency: "urgent", suggestedQuantity: 10 },
      { urgency: "ok", suggestedQuantity: 100 },
    ]);
  });
});

describe("suggestReplenishment", () => {
  it("does not order when stock is above the reorder point", () => {
    const result = suggestReplenishment({
      onHand: 1000, dailyDemand: 10, leadTimeDays: 14,
    });
    expect(result.shouldOrder).toBe(false);
    expect(result.suggestedQuantity).toBe(0);
  });

  it("orders up to the reorder point plus a coverage horizon", () => {
    // rop = 10*14 + 10*7 = 210; target = 210 + 10*30 = 510; have 100.
    const result = suggestReplenishment({
      onHand: 100, dailyDemand: 10, leadTimeDays: 14,
    });
    expect(result.reorderPoint).toBe(210);
    expect(result.shouldOrder).toBe(true);
    expect(result.suggestedQuantity).toBe(410);
  });

  it("counts stock already on order", () => {
    // The old low-stock notification ignored this and kept firing on products
    // whose replenishment was already in transit.
    const withoutPo = suggestReplenishment({
      onHand: 100, dailyDemand: 10, leadTimeDays: 14,
    });
    const withPo = suggestReplenishment({
      onHand: 100, onOrder: 400, dailyDemand: 10, leadTimeDays: 14,
    });
    expect(withoutPo.shouldOrder).toBe(true);
    expect(withPo.shouldOrder).toBe(false);
    expect(withPo.rationale).toMatch(/on order/);
  });

  it("excludes reserved stock from what is available", () => {
    const result = suggestReplenishment({
      onHand: 300, reserved: 250, dailyDemand: 10, leadTimeDays: 14,
    });
    expect(result.available).toBe(50);
    expect(result.shouldOrder).toBe(true);
  });

  it("lets a hand-entered reorder level win", () => {
    const result = suggestReplenishment({
      onHand: 100, dailyDemand: 10, leadTimeDays: 14, reorderLevel: 50,
    });
    // 100 available is above the manual level of 50, so no order — even though
    // the computed point of 210 would have triggered one.
    expect(result.reorderPoint).toBe(50);
    expect(result.reorderPointIsManual).toBe(true);
    expect(result.shouldOrder).toBe(false);
  });

  it("lets a hand-entered order quantity win", () => {
    const result = suggestReplenishment({
      onHand: 0, dailyDemand: 10, leadTimeDays: 14, reorderQuantity: 250,
    });
    expect(result.suggestedQuantity).toBe(250);
    expect(result.rationale).toMatch(/order quantity set manually/);
  });

  it("raises an order to the minimum order quantity", () => {
    const result = suggestReplenishment({
      onHand: 0, dailyDemand: 10, leadTimeDays: 14,
      reorderQuantity: 10, minimumOrderQuantity: 100,
    });
    expect(result.suggestedQuantity).toBe(100);
    expect(result.rationale).toMatch(/minimum order quantity/);
  });

  it("rounds a suggestion up — you cannot order 4.2 units", () => {
    const result = suggestReplenishment({
      onHand: 0, dailyDemand: 0.14, leadTimeDays: 2, safetyDays: 1,
      coverageDays: 3,
    });
    expect(Number.isInteger(result.suggestedQuantity)).toBe(true);
  });

  it("declines to invent a number with no demand and no manual level", () => {
    const result = suggestReplenishment({ onHand: 0, dailyDemand: 0 });
    expect(result.urgency).toBe("no_demand");
    expect(result.shouldOrder).toBe(false);
    expect(result.suggestedQuantity).toBe(0);
    expect(result.rationale).toMatch(/No recorded demand/);
  });

  it("still orders a dead-but-configured product against its manual level", () => {
    const result = suggestReplenishment({
      onHand: 5, dailyDemand: 0, reorderLevel: 20, reorderQuantity: 50,
    });
    expect(result.shouldOrder).toBe(true);
    expect(result.suggestedQuantity).toBe(50);
  });

  it("falls back to the default lead time when none is known", () => {
    const result = suggestReplenishment({ onHand: 0, dailyDemand: 1 });
    expect(result.leadTimeDays).toBe(DEFAULT_LEAD_TIME_DAYS);
  });

  it("handles negative on-hand without proposing a negative order", () => {
    const result = suggestReplenishment({
      onHand: -10, dailyDemand: 5, leadTimeDays: 7,
    });
    expect(result.suggestedQuantity).toBeGreaterThan(0);
    expect(result.urgency).toBe("stockout");
  });

  it("explains itself in the rationale", () => {
    const result = suggestReplenishment({
      onHand: 100, dailyDemand: 10, leadTimeDays: 14,
    });
    expect(result.rationale).toMatch(/10\/day over a 14-day lead time/);
  });
});
