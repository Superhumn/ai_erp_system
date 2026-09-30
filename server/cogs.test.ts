import { describe, expect, it } from "vitest";
import { isCOGSTransaction } from "../shared/cogs";

describe("isCOGSTransaction", () => {
  it("matches keywords in the description, case-insensitively", () => {
    expect(isCOGSTransaction({ description: "Inbound Freight from Shenzhen" })).toBe(true);
  });
  it("matches COGS reference types", () => {
    expect(isCOGSTransaction({ referenceType: "Purchase_Order" })).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isCOGSTransaction({ description: "Office rent", referenceType: "invoice" })).toBe(false);
    expect(isCOGSTransaction({})).toBe(false);
  });
});
