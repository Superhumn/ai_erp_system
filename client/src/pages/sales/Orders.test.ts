import { describe, it, expect } from "vitest";
import { orderStatusOptions } from "./Orders";
import { orders } from "../../../../drizzle/schema";

describe("Orders status options", () => {
  it("only offers statuses the orders.status enum accepts", () => {
    const allowed = new Set<string>(orders.status.enumValues);
    for (const o of orderStatusOptions) {
      expect(allowed.has(o.value), `"${o.value}" is not an orders.status value`).toBe(true);
    }
  });

  it("does not offer a draft status and does offer refunded", () => {
    const values = orderStatusOptions.map((o) => o.value);
    expect(values).not.toContain("draft");
    expect(values).toContain("refunded");
  });
});
