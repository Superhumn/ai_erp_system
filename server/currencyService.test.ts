import { describe, it, expect } from "vitest";
import { currencyOr, normalizeCurrencyCode, parseRatePaste, startOfUtcDay, DEFAULT_BASE_CURRENCY } from "./currencyService";

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

describe("parseRatePaste", () => {
  const ok = (text: string, base?: string) =>
    parseRatePaste(text, base ? { base } : {}).filter(r => !r.error);

  it("reads a bare currency and rate against the given base", () => {
    expect(ok("CNY 7.24", "USD")[0]).toMatchObject({
      fromCurrency: "USD", toCurrency: "CNY", rate: 7.24,
    });
  });

  it("reads an explicit pair in the shapes people paste", () => {
    for (const line of ["USD/CNY 7.24", "USD->CNY 7.24", "USD CNY 7.24"]) {
      expect(ok(line)[0]).toMatchObject({ fromCurrency: "USD", toCurrency: "CNY", rate: 7.24 });
    }
  });

  it("reads an equation", () => {
    expect(ok("1 EUR = 1.1667 USD")[0]).toMatchObject({
      fromCurrency: "EUR", toCurrency: "USD", rate: 1.1667,
    });
  });

  it("treats commas and tabs as separators", () => {
    expect(ok("CNY,7.24", "USD")[0]).toMatchObject({ toCurrency: "CNY", rate: 7.24 });
    expect(ok("USD\tCNY\t7.24")[0]).toMatchObject({ fromCurrency: "USD", rate: 7.24 });
  });

  it("reads a multi-line paste and skips blanks and comments", () => {
    const rows = ok("# from the bank\nCNY 7.24\n\nINR 83.12\n", "USD");
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.toCurrency)).toEqual(["CNY", "INR"]);
  });

  it("strips a trailing comment from an otherwise valid line", () => {
    // Annotating a pasted list is the normal case, not an edge case.
    expect(ok("CNY 7.24  # rate the bank gave us", "USD")[0]).toMatchObject({
      toCurrency: "CNY", rate: 7.24,
    });
    expect(ok("1 EUR = 1.1667 USD # ECB 2026-08-21")[0]).toMatchObject({
      fromCurrency: "EUR", toCurrency: "USD", rate: 1.1667,
    });
  });

  it("keeps the original line in `raw` so the user sees what they pasted", () => {
    const rows = parseRatePaste("CNY 7.24  # from the bank", { base: "USD" });
    expect(rows[0].raw).toBe("CNY 7.24  # from the bank");
  });

  it("skips a line that is only a comment after stripping", () => {
    expect(parseRatePaste("   #  just a note", {})).toEqual([]);
  });

  it("uppercases lowercase codes", () => {
    expect(ok("cny 7.24", "usd")[0]).toMatchObject({ fromCurrency: "USD", toCurrency: "CNY" });
  });

  it("defaults the base when none is given", () => {
    expect(ok("CNY 7.24")[0].fromCurrency).toBe(DEFAULT_BASE_CURRENCY);
  });

  it("reports an unreadable line instead of dropping it", () => {
    // Silently importing 2 of 3 pasted rates is worse than saying which failed.
    const rows = parseRatePaste("CNY 7.24\nwhat even is this\nINR 83.12", { base: "USD" });
    expect(rows).toHaveLength(3);
    expect(rows[1].error).toMatch(/Could not read/);
    expect(rows[1].line).toBe(2);
  });

  it("rejects a rate that is not a positive number", () => {
    const rows = parseRatePaste("CNY 0\nINR -3", { base: "USD" });
    expect(rows.every(r => /positive number/.test(r.error ?? ""))).toBe(true);
  });

  it("rejects a thousands-separated number rather than guessing", () => {
    // "1,234.5" with commas as separators would silently read as 1 then 234.5.
    const rows = parseRatePaste("VND 25,400", { base: "USD" });
    expect(rows[0].error).toBeTruthy();
  });

  it("rejects a currency against itself", () => {
    expect(parseRatePaste("USD 1.0", { base: "USD" })[0].error).toMatch(/itself/);
  });

  it("returns nothing for empty input", () => {
    expect(parseRatePaste("", {})).toEqual([]);
    expect(parseRatePaste("   \n\n", {})).toEqual([]);
  });
});
