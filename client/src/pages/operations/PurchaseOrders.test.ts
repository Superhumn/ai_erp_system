/**
 * Tests for PurchaseOrders page utility functions.
 * Functions tested: calculateTotals, addLineItem, updateLineItem, removeLineItem
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from PurchaseOrders.tsx ──

type LineItem = {
  productId?: number;
  description: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
};

function calculateTotals(lineItems: LineItem[]) {
  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0"));
  }, 0);
  return { subtotal, total: subtotal };
}

function addLineItem(lineItems: LineItem[]): LineItem[] {
  return [...lineItems, { description: "", quantity: "1", unitPrice: "0", totalAmount: "0" }];
}

function removeLineItem(lineItems: LineItem[], index: number): LineItem[] {
  return lineItems.filter((_, i) => i !== index);
}

function updateLineItemField(
  lineItems: LineItem[],
  index: number,
  field: keyof LineItem,
  value: string,
): LineItem[] {
  return lineItems.map((item, i) => {
    if (i !== index) return item;
    const updated = { ...item, [field]: value };
    // Recalculate total
    const qty = parseFloat(updated.quantity || "0");
    const price = parseFloat(updated.unitPrice || "0");
    updated.totalAmount = (qty * price).toFixed(2);
    return updated;
  });
}

// ── Tests ──

describe("PurchaseOrders — calculateTotals", () => {
  it("returns zero for empty line items", () => {
    expect(calculateTotals([])).toEqual({ subtotal: 0, total: 0 });
  });

  it("calculates subtotal from single item", () => {
    const items: LineItem[] = [
      { description: "Widget", quantity: "10", unitPrice: "5.00", totalAmount: "50.00" },
    ];
    expect(calculateTotals(items)).toEqual({ subtotal: 50, total: 50 });
  });

  it("calculates subtotal from multiple items", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "10", unitPrice: "5.00", totalAmount: "50.00" },
      { description: "B", quantity: "5", unitPrice: "20.00", totalAmount: "100.00" },
    ];
    const result = calculateTotals(items);
    expect(result.subtotal).toBe(150);
    expect(result.total).toBe(150);
  });

  it("handles items with empty quantity", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "", unitPrice: "5.00", totalAmount: "0" },
    ];
    expect(calculateTotals(items).subtotal).toBe(0);
  });

  it("handles items with empty unitPrice", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "10", unitPrice: "", totalAmount: "0" },
    ];
    expect(calculateTotals(items).subtotal).toBe(0);
  });

  it("handles decimal quantities and prices", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "2.5", unitPrice: "10.50", totalAmount: "26.25" },
    ];
    expect(calculateTotals(items).subtotal).toBeCloseTo(26.25);
  });

  it("subtotal equals total (no tax in this implementation)", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "1", unitPrice: "100", totalAmount: "100" },
    ];
    const result = calculateTotals(items);
    expect(result.subtotal).toBe(result.total);
  });
});

describe("PurchaseOrders — addLineItem", () => {
  it("adds a blank line item to empty list", () => {
    const result = addLineItem([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: "",
      quantity: "1",
      unitPrice: "0",
      totalAmount: "0",
    });
  });

  it("appends to existing list", () => {
    const existing: LineItem[] = [
      { description: "A", quantity: "5", unitPrice: "10", totalAmount: "50" },
    ];
    const result = addLineItem(existing);
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("A");
    expect(result[1].description).toBe("");
  });

  it("does not mutate the original array", () => {
    const original: LineItem[] = [];
    const result = addLineItem(original);
    expect(original).toHaveLength(0);
    expect(result).toHaveLength(1);
  });

  it("new item defaults quantity to 1", () => {
    const result = addLineItem([]);
    expect(result[0].quantity).toBe("1");
  });
});

describe("PurchaseOrders — removeLineItem", () => {
  it("removes item at index", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "1", unitPrice: "10", totalAmount: "10" },
      { description: "B", quantity: "2", unitPrice: "20", totalAmount: "40" },
      { description: "C", quantity: "3", unitPrice: "30", totalAmount: "90" },
    ];
    const result = removeLineItem(items, 1);
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("A");
    expect(result[1].description).toBe("C");
  });

  it("removes first item", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "1", unitPrice: "10", totalAmount: "10" },
      { description: "B", quantity: "2", unitPrice: "20", totalAmount: "40" },
    ];
    const result = removeLineItem(items, 0);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("B");
  });

  it("removes last item", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "1", unitPrice: "10", totalAmount: "10" },
      { description: "B", quantity: "2", unitPrice: "20", totalAmount: "40" },
    ];
    const result = removeLineItem(items, 1);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("A");
  });

  it("does not mutate original array", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "1", unitPrice: "10", totalAmount: "10" },
    ];
    removeLineItem(items, 0);
    expect(items).toHaveLength(1);
  });
});

describe("PurchaseOrders — updateLineItemField", () => {
  it("updates description without affecting totals", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "2", unitPrice: "10", totalAmount: "20" },
    ];
    const result = updateLineItemField(items, 0, "description", "Widget");
    expect(result[0].description).toBe("Widget");
    expect(result[0].totalAmount).toBe("20.00");
  });

  it("updates quantity and recalculates total", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "2", unitPrice: "10", totalAmount: "20" },
    ];
    const result = updateLineItemField(items, 0, "quantity", "5");
    expect(result[0].quantity).toBe("5");
    expect(result[0].totalAmount).toBe("50.00");
  });

  it("updates unitPrice and recalculates total", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "3", unitPrice: "10", totalAmount: "30" },
    ];
    const result = updateLineItemField(items, 0, "unitPrice", "25");
    expect(result[0].unitPrice).toBe("25");
    expect(result[0].totalAmount).toBe("75.00");
  });

  it("only updates the specified index", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "1", unitPrice: "10", totalAmount: "10" },
      { description: "B", quantity: "2", unitPrice: "20", totalAmount: "40" },
    ];
    const result = updateLineItemField(items, 1, "quantity", "5");
    expect(result[0].description).toBe("A");
    expect(result[0].totalAmount).toBe("10"); // unchanged item keeps original totalAmount
    expect(result[1].quantity).toBe("5");
    expect(result[1].totalAmount).toBe("100.00");
  });

  it("handles empty quantity gracefully", () => {
    const items: LineItem[] = [
      { description: "A", quantity: "2", unitPrice: "10", totalAmount: "20" },
    ];
    const result = updateLineItemField(items, 0, "quantity", "");
    expect(result[0].totalAmount).toBe("0.00");
  });
});
