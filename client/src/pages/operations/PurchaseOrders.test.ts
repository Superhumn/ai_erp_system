import { describe, it, expect } from "vitest";
import { PO_STATUS_FILTER_OPTIONS } from "./PurchaseOrders";
import { purchaseOrders } from "../../../../drizzle/schema";

describe("PurchaseOrders status filter options", () => {
  it("only offers statuses the purchaseOrders.status enum accepts", () => {
    const allowed = new Set<string>(purchaseOrders.status.enumValues);
    for (const o of PO_STATUS_FILTER_OPTIONS) {
      expect(allowed.has(o.value), `"${o.value}" is not a purchaseOrders.status value`).toBe(true);
    }
  });

  it("covers every PO status so no order is unfilterable", () => {
    const offered = new Set<string>(PO_STATUS_FILTER_OPTIONS.map((o) => o.value));
    for (const s of purchaseOrders.status.enumValues) expect(offered.has(s)).toBe(true);
  });
});
