import { describe, it, expect } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats USD by default", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("accepts numeric strings", () => {
    expect(formatCurrency("1234.5")).toBe("$1,234.50");
  });

  it("returns a dash for missing or unparseable values", () => {
    expect(formatCurrency(null)).toBe("-");
    expect(formatCurrency(undefined)).toBe("-");
    expect(formatCurrency("not a number")).toBe("-");
  });

  it("drops the decimals in whole mode", () => {
    expect(formatCurrency(1234.5, { whole: true })).toBe("$1,235");
  });

  it("formats a non-USD currency with its own symbol", () => {
    // A landed cost in a EUR-based RFQ must not render with a "$".
    expect(formatCurrency(1234.5, { currency: "EUR" })).toContain("€");
    expect(formatCurrency(1234.5, { currency: "EUR" })).not.toContain("$");
    expect(formatCurrency(1234.5, { currency: "GBP" })).toContain("£");
  });

  it("honours whole mode for a non-USD currency", () => {
    const formatted = formatCurrency(1234.5, { currency: "EUR", whole: true });
    expect(formatted).not.toContain(".5");
  });

  it("accepts a lowercase currency code", () => {
    expect(formatCurrency(10, { currency: "eur" })).toContain("€");
  });

  it("falls back to USD rather than throwing on a malformed code", () => {
    expect(formatCurrency(10, { currency: "XX" })).toBe("$10.00");
  });

  it("prefixes an unrecognised but well-formed code rather than faking a symbol", () => {
    // Intl accepts any three-letter code and prefixes it. That is honest —
    // better than rendering an unknown currency as dollars.
    expect(formatCurrency(10, { currency: "ZZZ" })).toContain("ZZZ");
    expect(formatCurrency(10, { currency: "ZZZ" })).not.toContain("$");
  });

  it("treats an explicit USD the same as the default", () => {
    expect(formatCurrency(99.9, { currency: "USD" })).toBe(formatCurrency(99.9));
  });
});
