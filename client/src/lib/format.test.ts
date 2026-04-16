/**
 * Tests for shared formatting utilities — client/src/lib/format.ts
 */
import { describe, it, expect } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats positive numbers as USD", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats negative numbers", () => {
    expect(formatCurrency(-500)).toBe("-$500.00");
  });

  it("handles string inputs by parsing to float", () => {
    expect(formatCurrency("99.99")).toBe("$99.99");
  });

  it("handles string with leading/trailing spaces", () => {
    expect(formatCurrency("  42.5  ")).toBe("$42.50");
  });

  it("returns dash for null", () => {
    expect(formatCurrency(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatCurrency(undefined)).toBe("-");
  });

  it("returns dash for NaN string", () => {
    expect(formatCurrency("not-a-number")).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(formatCurrency("")).toBe("-");
  });

  it("formats large numbers with commas", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00");
  });

  it("formats whole option to strip decimals", () => {
    expect(formatCurrency(1234.56, { whole: true })).toBe("$1,235");
  });

  it("formats whole option for zero", () => {
    expect(formatCurrency(0, { whole: true })).toBe("$0");
  });

  it("formats whole option for large number", () => {
    expect(formatCurrency(999999.99, { whole: true })).toBe("$1,000,000");
  });

  it("returns dash for null with whole option", () => {
    expect(formatCurrency(null, { whole: true })).toBe("-");
  });

  it("handles very small numbers", () => {
    expect(formatCurrency(0.01)).toBe("$0.01");
  });

  it("handles very large numbers", () => {
    const result = formatCurrency(123456789.12);
    expect(result).toBe("$123,456,789.12");
  });
});
