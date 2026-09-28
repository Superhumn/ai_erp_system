import { describe, it, expect } from "vitest";
import { entityConfig } from "./QuickCreateDialog";

// Mirror of the zod enum in server/routers/warehouses.ts (`create` input).
// If the server enum changes, update both.
const SERVER_WAREHOUSE_TYPES = ["warehouse", "store", "distribution", "copacker", "3pl", "factory"];

describe("QuickCreateDialog location type options", () => {
  it("only offers values the warehouses.create procedure accepts", () => {
    const typeField = entityConfig.location.fields.find((f) => f.name === "type");
    expect(typeField?.options?.length).toBeGreaterThan(0);
    for (const opt of typeField!.options!) {
      expect(SERVER_WAREHOUSE_TYPES).toContain(opt.value);
    }
  });
});
