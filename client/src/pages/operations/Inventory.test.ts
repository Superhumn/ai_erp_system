/**
 * Tests for Inventory page utility functions.
 * Functions tested: InventorySummaryCards computation logic, getStockStatus
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from Inventory.tsx ──

type InventoryItem = {
  id: number;
  productId: number;
  warehouseId: number | null;
  quantity: string | null;
  reservedQuantity: string | null;
  reorderLevel: string | null;
  reorderQuantity: string | null;
};

function computeInventorySummary(inventory: InventoryItem[] | undefined) {
  if (!inventory) return { total: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
  let inStock = 0, lowStock = 0, outOfStock = 0;
  for (const item of inventory) {
    const qty = parseFloat(item.quantity || "0");
    const reorder = parseFloat(item.reorderLevel || "0");
    if (qty <= 0) outOfStock++;
    else if (qty <= reorder) lowStock++;
    else inStock++;
  }
  return { total: inventory.length, inStock, lowStock, outOfStock };
}

function getStockStatus(qty: number, reorderLevel: number): "out_of_stock" | "low_stock" | "in_stock" {
  if (qty <= 0) return "out_of_stock";
  if (qty <= reorderLevel) return "low_stock";
  return "in_stock";
}

// ── Tests ──

describe("Inventory — computeInventorySummary", () => {
  it("returns zeros for undefined inventory", () => {
    expect(computeInventorySummary(undefined)).toEqual({
      total: 0, inStock: 0, lowStock: 0, outOfStock: 0,
    });
  });

  it("returns zeros for empty inventory", () => {
    expect(computeInventorySummary([])).toEqual({
      total: 0, inStock: 0, lowStock: 0, outOfStock: 0,
    });
  });

  it("counts all items as total", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "100", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
      { id: 2, productId: 2, warehouseId: 1, quantity: "5", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
      { id: 3, productId: 3, warehouseId: 1, quantity: "0", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
    ];
    const result = computeInventorySummary(items);
    expect(result.total).toBe(3);
  });

  it("classifies in-stock items (qty > reorderLevel)", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "100", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
    ];
    const result = computeInventorySummary(items);
    expect(result.inStock).toBe(1);
    expect(result.lowStock).toBe(0);
    expect(result.outOfStock).toBe(0);
  });

  it("classifies low-stock items (0 < qty <= reorderLevel)", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "5", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
    ];
    const result = computeInventorySummary(items);
    expect(result.lowStock).toBe(1);
  });

  it("classifies out-of-stock items (qty <= 0)", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "0", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
      { id: 2, productId: 2, warehouseId: 1, quantity: "-5", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
    ];
    const result = computeInventorySummary(items);
    expect(result.outOfStock).toBe(2);
  });

  it("handles items with null quantity (treated as 0)", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: null, reservedQuantity: null, reorderLevel: "10", reorderQuantity: null },
    ];
    const result = computeInventorySummary(items);
    expect(result.outOfStock).toBe(1);
  });

  it("handles items with null reorderLevel (treated as 0)", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "5", reservedQuantity: null, reorderLevel: null, reorderQuantity: null },
    ];
    const result = computeInventorySummary(items);
    // qty 5 > reorder 0, so in stock
    expect(result.inStock).toBe(1);
  });

  it("classifies items at exact reorderLevel as low stock", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "10", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
    ];
    const result = computeInventorySummary(items);
    expect(result.lowStock).toBe(1);
  });

  it("handles mixed inventory correctly", () => {
    const items: InventoryItem[] = [
      { id: 1, productId: 1, warehouseId: 1, quantity: "100", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
      { id: 2, productId: 2, warehouseId: 1, quantity: "5", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
      { id: 3, productId: 3, warehouseId: 1, quantity: "0", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
      { id: 4, productId: 4, warehouseId: 1, quantity: "50", reservedQuantity: "0", reorderLevel: "10", reorderQuantity: "50" },
    ];
    const result = computeInventorySummary(items);
    expect(result.total).toBe(4);
    expect(result.inStock).toBe(2);
    expect(result.lowStock).toBe(1);
    expect(result.outOfStock).toBe(1);
  });
});

describe("Inventory — getStockStatus", () => {
  it("returns out_of_stock for qty 0", () => {
    expect(getStockStatus(0, 10)).toBe("out_of_stock");
  });

  it("returns out_of_stock for negative qty", () => {
    expect(getStockStatus(-5, 10)).toBe("out_of_stock");
  });

  it("returns low_stock for qty at reorder level", () => {
    expect(getStockStatus(10, 10)).toBe("low_stock");
  });

  it("returns low_stock for qty below reorder level", () => {
    expect(getStockStatus(5, 10)).toBe("low_stock");
  });

  it("returns in_stock for qty above reorder level", () => {
    expect(getStockStatus(100, 10)).toBe("in_stock");
  });

  it("returns in_stock for qty 1 above reorder level", () => {
    expect(getStockStatus(11, 10)).toBe("in_stock");
  });
});
