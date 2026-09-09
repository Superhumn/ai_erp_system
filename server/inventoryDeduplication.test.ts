import { describe, it, expect } from "vitest";
import { classifyDuplicateGroup, resolveMergedQuantities } from "./inventoryDeduplication";

describe("classifyDuplicateGroup", () => {
  it("keeps the oldest row and marks the rest for removal", () => {
    const r = classifyDuplicateGroup([{ id: 7, quantity: "5" }, { id: 3, quantity: "5" }, { id: 9, quantity: "5" }]);
    expect(r.keepId).toBe(3);
    expect(r.removeIds).toEqual([7, 9]);
  });

  it("suggests keep_one when every copy holds the same quantity", () => {
    // The old update wrote one total to every copy, so these are echoes of one
    // real row — summing them would multiply real stock.
    const r = classifyDuplicateGroup([{ id: 1, quantity: "40" }, { id: 2, quantity: "40" }]);
    expect(r.allIdentical).toBe(true);
    expect(r.suggestedStrategy).toBe("keep_one");
    expect(r.keepQuantity).toBe(40);
  });

  it("suggests sum when the copies were incremented independently", () => {
    const r = classifyDuplicateGroup([{ id: 1, quantity: "12" }, { id: 2, quantity: "8" }]);
    expect(r.allIdentical).toBe(false);
    expect(r.suggestedStrategy).toBe("sum");
    expect(r.summedQuantity).toBe(20);
  });

  it("treats quantities equal within stored precision as identical", () => {
    // DECIMAL(15,4): anything below that resolution is the same number.
    const r = classifyDuplicateGroup([{ id: 1, quantity: "10.00001" }, { id: 2, quantity: "10.00002" }]);
    expect(r.allIdentical).toBe(true);
  });

  it("does not treat a real difference at stored precision as identical", () => {
    const r = classifyDuplicateGroup([{ id: 1, quantity: "10.0001" }, { id: 2, quantity: "10.0002" }]);
    expect(r.allIdentical).toBe(false);
  });

  it("reads quantities off the oldest row, not input order", () => {
    const r = classifyDuplicateGroup([{ id: 5, quantity: "99" }, { id: 2, quantity: "40" }]);
    expect(r.keepId).toBe(2);
    expect(r.keepQuantity).toBe(40);
  });

  it("treats unparseable quantities as zero rather than NaN", () => {
    const r = classifyDuplicateGroup([{ id: 1, quantity: "n/a" }, { id: 2, quantity: "5" }]);
    expect(r.keepQuantity).toBe(0);
    expect(r.summedQuantity).toBe(5);
    expect(Number.isNaN(r.summedQuantity)).toBe(false);
  });

  it("rejects an empty group", () => {
    expect(() => classifyDuplicateGroup([])).toThrow();
  });
});

describe("resolveMergedQuantities", () => {
  it("leaves the quantity alone under keep_one", () => {
    const r = resolveMergedQuantities({ id: 1, quantity: "40" }, [{ id: 2, quantity: "40" }], "keep_one");
    expect(r.quantity).toBe(40);
  });

  it("totals every copy under sum", () => {
    const r = resolveMergedQuantities(
      { id: 1, quantity: "12" },
      [{ id: 2, quantity: "8" }, { id: 3, quantity: "5" }],
      "sum",
    );
    expect(r.quantity).toBe(25);
  });

  it("sums reservations under keep_one too", () => {
    // A reservation is a real claim recorded against whichever row the writer
    // found; dropping it would release stock nobody freed.
    const r = resolveMergedQuantities(
      { id: 1, quantity: "40", reservedQuantity: "3" },
      [{ id: 2, quantity: "40", reservedQuantity: "2" }],
      "keep_one",
    );
    expect(r.quantity).toBe(40);
    expect(r.reservedQuantity).toBe(5);
  });

  it("treats a missing reservation as zero", () => {
    const r = resolveMergedQuantities({ id: 1, quantity: "40" }, [{ id: 2, quantity: "40" }], "keep_one");
    expect(r.reservedQuantity).toBe(0);
  });

  it("returns the keeper's own figures when nothing is removed", () => {
    const r = resolveMergedQuantities({ id: 1, quantity: "7", reservedQuantity: "1" }, [], "sum");
    expect(r).toEqual({ quantity: 7, reservedQuantity: 1 });
  });
});
