import { describe, it, expect } from "vitest";
import { currencyOr, normalizeCurrencyCode, startOfUtcDay, DEFAULT_BASE_CURRENCY } from "./currencyService";

describe("normalizeCurrencyCode", () => {
  it("uppercases and trims a valid code", () => {
    expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
    expect(normalizeCurrencyCode("usd")).toBe("USD");
  });

  it("rejects anything that is not three letters", () => {
    expect(normalizeCurrencyCode("euros")).toBeNull();
    expect(normalizeCurrencyCode("US")).toBeNull();
    expect(normalizeCurrencyCode("$")).toBeNull();
    expect(normalizeCurrencyCode("US1")).toBeNull();
    expect(normalizeCurrencyCode("")).toBeNull();
    expect(normalizeCurrencyCode(null)).toBeNull();
    expect(normalizeCurrencyCode(undefined)).toBeNull();
  });
});

describe("currencyOr", () => {
  it("returns the normalized code when usable", () => {
    expect(currencyOr("gbp")).toBe("GBP");
  });

  it("falls back when the code is unusable", () => {
    expect(currencyOr(null)).toBe(DEFAULT_BASE_CURRENCY);
    expect(currencyOr("dollars", "EUR")).toBe("EUR");
  });
});

describe("startOfUtcDay", () => {
  it("truncates to midnight UTC so one day holds one rate per pair", () => {
    const d = startOfUtcDay(new Date("2026-08-20T17:45:31.123Z"));
    expect(d.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const once = startOfUtcDay(new Date("2026-08-20T17:45:31Z"));
    expect(startOfUtcDay(once).getTime()).toBe(once.getTime());
  });
});
