import { describe, expect, it } from "vitest";
import {
  compareByExpiry,
  daysUntilExpiry,
  expiredLots,
  expiryBucket,
  isExpired,
  roundQty,
  selectFefoLots,
  sortByFefo,
  type PickableLot,
} from "./fefo";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-06-15T12:00:00Z");

const lot = (
  lotId: number,
  quantity: number,
  expiryDate?: string | null,
): PickableLot => ({ lotId, quantity, expiryDate: expiryDate ?? null });

describe("FEFO ordering", () => {
  it("consumes the soonest-expiring lot first", () => {
    const order = sortByFefo([
      lot(1, 10, "2026-12-01"),
      lot(2, 10, "2026-07-01"),
      lot(3, 10, "2026-09-01"),
    ]).map((l) => l.lotId);
    expect(order).toEqual([2, 3, 1]);
  });

  it("sorts undated lots last", () => {
    // A lot that never expires is never at risk, so burning it ahead of a
    // dated lot is the waste FEFO exists to prevent.
    const order = sortByFefo([
      lot(1, 10, null),
      lot(2, 10, "2027-01-01"),
    ]).map((l) => l.lotId);
    expect(order).toEqual([2, 1]);
  });

  it("breaks ties on the older lot", () => {
    const order = sortByFefo([
      lot(9, 10, "2026-08-01"),
      lot(4, 10, "2026-08-01"),
    ]).map((l) => l.lotId);
    expect(order).toEqual([4, 9]);
  });

  it("orders two undated lots by lot id", () => {
    expect(compareByExpiry(lot(7, 1), lot(3, 1))).toBeGreaterThan(0);
  });

  it("does not mutate the caller's array", () => {
    const lots = [lot(1, 5, "2026-12-01"), lot(2, 5, "2026-07-01")];
    sortByFefo(lots);
    expect(lots.map((l) => l.lotId)).toEqual([1, 2]);
  });

  it("treats an unparseable date as undated rather than throwing", () => {
    const order = sortByFefo([
      lot(1, 5, "not-a-date"),
      lot(2, 5, "2026-07-01"),
    ]).map((l) => l.lotId);
    expect(order).toEqual([2, 1]);
  });
});

describe("FEFO allocation", () => {
  it("takes everything from one lot when it covers the pick", () => {
    const { allocations, shortfall } = selectFefoLots(
      [lot(1, 100, "2026-07-01")],
      30,
    );
    expect(allocations).toEqual([{ lotId: 1, quantity: 30, binCode: null }]);
    expect(shortfall).toBe(0);
  });

  it("spans lots in expiry order when one is not enough", () => {
    const { allocations, shortfall } = selectFefoLots(
      [lot(1, 10, "2026-12-01"), lot(2, 25, "2026-07-01")],
      30,
    );
    expect(allocations).toEqual([
      { lotId: 2, quantity: 25, binCode: null },
      { lotId: 1, quantity: 5, binCode: null },
    ]);
    expect(shortfall).toBe(0);
  });

  it("reports a shortfall rather than over-allocating", () => {
    const { allocations, shortfall } = selectFefoLots(
      [lot(1, 4, "2026-07-01")],
      10,
    );
    expect(allocations).toEqual([{ lotId: 1, quantity: 4, binCode: null }]);
    expect(shortfall).toBe(6);
  });

  it("reports the whole quantity short when there is no stock at all", () => {
    expect(selectFefoLots([], 12)).toEqual({ allocations: [], shortfall: 12 });
  });

  it("skips empty and negative lots", () => {
    const { allocations } = selectFefoLots(
      [lot(1, 0, "2026-07-01"), lot(2, -5, "2026-07-15"), lot(3, 8, "2026-08-01")],
      5,
    );
    expect(allocations).toEqual([{ lotId: 3, quantity: 5, binCode: null }]);
  });

  it("stops once the pick is satisfied", () => {
    const { allocations } = selectFefoLots(
      [lot(1, 100, "2026-07-01"), lot(2, 100, "2026-08-01")],
      10,
    );
    expect(allocations).toHaveLength(1);
  });

  it("does not drift on fractional quantities", () => {
    // Repeated subtraction is where a naive implementation leaves a 1e-15
    // remainder and reports a phantom shortfall.
    const { allocations, shortfall } = selectFefoLots(
      [lot(1, 0.1, "2026-07-01"), lot(2, 0.2, "2026-07-02")],
      0.3,
    );
    expect(shortfall).toBe(0);
    expect(allocations).toEqual([
      { lotId: 1, quantity: 0.1, binCode: null },
      { lotId: 2, quantity: 0.2, binCode: null },
    ]);
  });

  it("refuses a non-positive or non-finite pick", () => {
    expect(() => selectFefoLots([lot(1, 10)], 0)).toThrow(/greater than zero/);
    expect(() => selectFefoLots([lot(1, 10)], -5)).toThrow(/greater than zero/);
    expect(() => selectFefoLots([lot(1, 10)], NaN)).toThrow(/finite/);
    expect(() => selectFefoLots([lot(1, 10)], Infinity)).toThrow(/finite/);
  });
});

describe("expiry classification", () => {
  it("counts a lot expiring later today as due today, not overdue", () => {
    expect(daysUntilExpiry(lot(1, 5, "2026-06-15T23:00:00Z"), NOW)).toBe(0);
    expect(isExpired(lot(1, 5, "2026-06-15T23:00:00Z"), NOW)).toBe(false);
  });

  it("counts a lot from earlier today as expired only once the day has passed", () => {
    expect(isExpired(lot(1, 5, "2026-06-15T01:00:00Z"), NOW)).toBe(false);
    expect(isExpired(lot(1, 5, "2026-06-14T23:00:00Z"), NOW)).toBe(true);
  });

  it("returns null days for an undated lot", () => {
    expect(daysUntilExpiry(lot(1, 5, null), NOW)).toBeNull();
    expect(isExpired(lot(1, 5, null), NOW)).toBe(false);
  });

  it("buckets by urgency", () => {
    expect(expiryBucket(lot(1, 5, "2026-06-01"), NOW)).toBe("expired");
    expect(expiryBucket(lot(1, 5, "2026-07-01"), NOW)).toBe("critical");
    expect(expiryBucket(lot(1, 5, "2026-08-15"), NOW)).toBe("warning");
    expect(expiryBucket(lot(1, 5, "2027-01-01"), NOW)).toBe("ok");
    expect(expiryBucket(lot(1, 5, null), NOW)).toBe("undated");
  });

  it("puts a boundary day in the tighter bucket", () => {
    // 30 days out is critical, 31 is only a warning.
    expect(expiryBucket(lot(1, 5, "2026-07-15"), NOW)).toBe("critical");
    expect(expiryBucket(lot(1, 5, "2026-07-16"), NOW)).toBe("warning");
  });

  it("honours custom thresholds", () => {
    expect(
      expiryBucket(lot(1, 5, "2026-06-20"), NOW, { critical: 3, warning: 10 }),
    ).toBe("warning");
  });
});

describe("expiry sweep", () => {
  it("selects only dated, past, still-stocked lots", () => {
    const found = expiredLots(
      [
        lot(1, 5, "2026-06-01"), // expired with stock — sweep
        lot(2, 0, "2026-06-01"), // expired but empty — nothing to do
        lot(3, 5, "2027-01-01"), // still good
        lot(4, 5, null), // never expires
      ],
      NOW,
    ).map((l) => l.lotId);
    expect(found).toEqual([1]);
  });
});

describe("roundQty", () => {
  it("clears binary-float drift", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(1 - 0.9)).toBe(0.1);
  });

  it("keeps 4 decimal places and discards the rest", () => {
    expect(roundQty(1.00004)).toBe(1);
    expect(roundQty(1.00006)).toBe(1.0001);
    expect(roundQty(12.3456789)).toBe(12.3457);
  });
});

describe("bins", () => {
  const binned = (
    lotId: number,
    quantity: number,
    binCode: string,
    pickSequence: number,
    expiryDate?: string | null,
  ): PickableLot => ({
    lotId, quantity, binCode, pickSequence, expiryDate: expiryDate ?? null,
  });

  it("treats the same lot in two bins as two pickable positions", () => {
    const { allocations, shortfall } = selectFefoLots(
      [binned(1, 6, "A-01", 1, "2026-07-01"), binned(1, 6, "B-02", 2, "2026-07-01")],
      10,
    );
    expect(shortfall).toBe(0);
    expect(allocations).toEqual([
      { lotId: 1, quantity: 6, binCode: "A-01" },
      { lotId: 1, quantity: 4, binCode: "B-02" },
    ]);
  });

  it("walks bins in pick sequence when expiry ties", () => {
    const order = sortByFefo([
      binned(1, 5, "Z-99", 9, "2026-07-01"),
      binned(2, 5, "A-01", 1, "2026-07-01"),
    ]).map((l) => l.binCode);
    expect(order).toEqual(["A-01", "Z-99"]);
  });

  it("still puts expiry ahead of the walk order", () => {
    // The far bin holds the older stock — FEFO sends the picker there first.
    const order = sortByFefo([
      binned(1, 5, "A-01", 1, "2026-12-01"),
      binned(2, 5, "Z-99", 9, "2026-07-01"),
    ]).map((l) => l.binCode);
    expect(order).toEqual(["Z-99", "A-01"]);
  });

  it("sorts unsequenced bins after sequenced ones", () => {
    const order = sortByFefo([
      { lotId: 1, quantity: 5, expiryDate: "2026-07-01" },
      binned(2, 5, "A-01", 3, "2026-07-01"),
    ]).map((l) => l.binCode ?? "unbinned");
    expect(order).toEqual(["A-01", "unbinned"]);
  });

  it("is deterministic for two bins with the same sequence", () => {
    const order = sortByFefo([
      binned(1, 5, "B-02", 1, "2026-07-01"),
      binned(1, 5, "A-01", 1, "2026-07-01"),
    ]).map((l) => l.binCode);
    expect(order).toEqual(["A-01", "B-02"]);
  });
});
