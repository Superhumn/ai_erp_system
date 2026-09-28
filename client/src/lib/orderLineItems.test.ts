import { describe, expect, it } from "vitest";
import { emptyOrderLine, isUsableOrderLine, orderItemsPayload, orderLineTotal, orderLinesSubtotal } from "./orderLineItems";

describe("orderLineItems", () => {
  it("computes 2-dp line totals and treats blanks as zero", () => {
    expect(orderLineTotal({ name: "Granola", quantity: "3", unitPrice: "12.505" })).toBe(37.52);
    expect(orderLineTotal({ name: "Granola", quantity: "", unitPrice: "10" })).toBe(0);
    expect(orderLineTotal({ name: "Granola", quantity: "2", unitPrice: "abc" })).toBe(0);
  });

  it("only counts lines with a description and a positive quantity", () => {
    expect(isUsableOrderLine(emptyOrderLine())).toBe(false);
    expect(isUsableOrderLine({ name: "  ", quantity: "1", unitPrice: "1" })).toBe(false);
    expect(isUsableOrderLine({ name: "Bars", quantity: "0", unitPrice: "1" })).toBe(false);
    expect(isUsableOrderLine({ name: "Bars", quantity: "1", unitPrice: "" })).toBe(true);
    expect(orderLinesSubtotal([
      { name: "Bars", quantity: "10", unitPrice: "12.50" },
      { name: "", quantity: "5", unitPrice: "100" },
      { name: "Bites", quantity: "4", unitPrice: "25" },
    ])).toBe(225);
  });

  it("builds the orders.create items payload with string money, or undefined when there is nothing usable", () => {
    expect(orderItemsPayload([emptyOrderLine()])).toBeUndefined();
    expect(orderItemsPayload([])).toBeUndefined();
    expect(orderItemsPayload([
      { name: " Granola 12oz ", quantity: "10", unitPrice: "12.5" },
      { name: "", quantity: "1", unitPrice: "1" },
    ])).toEqual([{ name: "Granola 12oz", quantity: "10", unitPrice: "12.50", totalAmount: "125.00" }]);
  });
});
