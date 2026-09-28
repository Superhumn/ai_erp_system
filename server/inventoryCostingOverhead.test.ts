import { describe, expect, it, vi, beforeEach } from "vitest";

// allocateOverheadToLayers must adjust unit cost on existing layers instead of
// creating new ones; the previous freight/copacker allocation inserted a second
// layer with the same quantity, doubling on-hand inventory in valuation.
vi.mock("./db", () => ({
  getActiveCostLayers: vi.fn(),
  updateInventoryCostLayer: vi.fn().mockResolvedValue(undefined),
  createInventoryCostLayer: vi.fn().mockResolvedValue({ id: 1 }),
}));

import * as db from "./db";
import { allocateOverheadToLayers } from "./inventoryCostingService";

describe("allocateOverheadToLayers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("spreads the amount per remaining unit and never inserts a layer", async () => {
    vi.mocked(db.getActiveCostLayers).mockResolvedValue([
      { id: 1, originalQuantity: "100.0000", remainingQuantity: "60.0000", unitCost: "2.0000" },
      { id: 2, originalQuantity: "40.0000", remainingQuantity: "40.0000", unitCost: "3.0000" },
    ] as any);
    const touched = await allocateOverheadToLayers({ productId: 3, warehouseId: 1, totalAmount: 50 });
    // 50 over 100 remaining units = 0.5 per unit
    expect(touched).toBe(2);
    expect(db.getActiveCostLayers).toHaveBeenCalledWith(3, "asc", 1);
    expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(1, { unitCost: "2.5000", totalCost: "250.00" });
    expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(2, { unitCost: "3.5000", totalCost: "140.00" });
    expect(db.createInventoryCostLayer).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no active stock or no amount", async () => {
    vi.mocked(db.getActiveCostLayers).mockResolvedValue([]);
    expect(await allocateOverheadToLayers({ productId: 3, totalAmount: 50 })).toBe(0);
    expect(await allocateOverheadToLayers({ productId: 3, totalAmount: 0 })).toBe(0);
    expect(db.updateInventoryCostLayer).not.toHaveBeenCalled();
  });
});
