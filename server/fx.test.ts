import { describe, it, expect } from "vitest";
import { pickRate, convertAmount, GROUP_CURRENCY } from "./fxService";

const d = (s: string) => new Date(s + "T00:00:00Z");

// EUR→USD rates published over time.
const eurUsd = [
  { rate: "1.05", asOfDate: d("2026-01-01") },
  { rate: "1.10", asOfDate: d("2026-06-01") },
  { rate: "1.20", asOfDate: d("2026-12-01") },
];

describe("pickRate (frozen at transaction date)", () => {
  it("same currency is always 1", () => {
    expect(pickRate([], "USD", "USD", d("2026-06-15"))).toBe(1);
  });

  it("uses the most recent rate on or before the transaction date", () => {
    expect(pickRate(eurUsd, "EUR", "USD", d("2026-06-15"))).toBe(1.1);
  });

  it("freezes: a rate published AFTER the transaction date is never used", () => {
    // Txn on 2026-03-01 must use the Jan rate (1.05), not the later June/Dec rates.
    expect(pickRate(eurUsd, "EUR", "USD", d("2026-03-01"))).toBe(1.05);
  });

  it("returns null when no rate exists on or before the date", () => {
    expect(pickRate(eurUsd, "EUR", "USD", d("2025-12-31"))).toBeNull();
  });

  it("picks the exact-date rate when one exists", () => {
    expect(pickRate(eurUsd, "EUR", "USD", d("2026-12-01"))).toBe(1.2);
  });
});

describe("convertAmount", () => {
  it("applies the rate", () => {
    expect(convertAmount(200, 1.1)).toBeCloseTo(220);
  });
  it("identity rate returns the amount", () => {
    expect(convertAmount(999.99, 1)).toBeCloseTo(999.99);
  });
});

describe("group currency", () => {
  it("is USD", () => {
    expect(GROUP_CURRENCY).toBe("USD");
  });
});
