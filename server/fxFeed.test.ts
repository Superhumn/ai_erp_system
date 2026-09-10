import { describe, it, expect } from "vitest";
import { parseFeedResponse, FxFeedError } from "./fxFeed";

const GOOD = JSON.stringify({
  amount: 1,
  base: "USD",
  date: "2026-08-21",
  rates: { EUR: 0.8571, GBP: 0.7412, JPY: 147.32 },
});

describe("parseFeedResponse — the happy path", () => {
  it("reads base, date and rates", () => {
    const feed = parseFeedResponse(GOOD, "USD");
    expect(feed.base).toBe("USD");
    expect(feed.asOf.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(feed.rates).toEqual({ EUR: 0.8571, GBP: 0.7412, JPY: 147.32 });
  });

  it("accepts a response with no amount field", () => {
    const feed = parseFeedResponse(
      JSON.stringify({ base: "EUR", date: "2026-08-21", rates: { USD: 1.1667 } }),
    );
    expect(feed.rates.USD).toBe(1.1667);
  });

  it("accepts numeric strings for rates", () => {
    const feed = parseFeedResponse(
      JSON.stringify({ base: "USD", date: "2026-08-21", rates: { EUR: "0.8571" } }),
    );
    expect(feed.rates.EUR).toBe(0.8571);
  });
});

describe("parseFeedResponse — refusing bad data", () => {
  it("refuses an HTML error page served with a 200", () => {
    // The failure mode that would otherwise write nothing useful and look fine.
    expect(() => parseFeedResponse("<html><body>502 Bad Gateway</body></html>")).toThrow(
      /did not return JSON/,
    );
  });

  it("refuses a response whose base is not what we asked for", () => {
    // Silently converting at the wrong base would corrupt every comparison.
    expect(() => parseFeedResponse(GOOD, "EUR")).toThrow(/Asked for base EUR/);
  });

  it.each([
    [JSON.stringify({ base: "USD", rates: { EUR: 0.85 } }), /date/],
    [JSON.stringify({ base: "USD", date: "21/08/2026", rates: { EUR: 0.85 } }), /date/],
    [JSON.stringify({ date: "2026-08-21", rates: { EUR: 0.85 } }), /base/],
    [JSON.stringify({ base: "US", date: "2026-08-21", rates: { EUR: 0.85 } }), /base/],
    [JSON.stringify({ base: "USD", date: "2026-08-21" }), /rates/],
    [JSON.stringify({ base: "USD", date: "2026-08-21", rates: [] }), /rates/],
    [JSON.stringify([1, 2, 3]), /not an object/],
  ])("refuses malformed payload %#", (body, pattern) => {
    expect(() => parseFeedResponse(body)).toThrow(pattern as RegExp);
  });

  it("refuses a response quoted for an amount other than 1", () => {
    const body = JSON.stringify({ amount: 100, base: "USD", date: "2026-08-21", rates: { JPY: 14732 } });
    expect(() => parseFeedResponse(body)).toThrow(/amount 100/);
  });

  it("refuses a non-numeric rate rather than storing NaN", () => {
    const body = JSON.stringify({ base: "USD", date: "2026-08-21", rates: { EUR: "n/a" } });
    expect(() => parseFeedResponse(body)).toThrow(/non-numeric rate for EUR/);
  });

  it.each([0, -1.5])("refuses a rate of %s", value => {
    const body = JSON.stringify({ base: "USD", date: "2026-08-21", rates: { EUR: value } });
    expect(() => parseFeedResponse(body)).toThrow(FxFeedError);
  });

  it("refuses an implausible magnitude", () => {
    // A units mix-up that would multiply a quote by a million.
    const body = JSON.stringify({ base: "USD", date: "2026-08-21", rates: { EUR: 1e9 } });
    expect(() => parseFeedResponse(body)).toThrow(/implausible rate/);
  });

  it("refuses a response with nothing usable in it", () => {
    const body = JSON.stringify({ base: "USD", date: "2026-08-21", rates: { "not-a-code": 1 } });
    expect(() => parseFeedResponse(body)).toThrow(/no usable rates/);
  });

  it("ignores a non-currency key alongside real rates", () => {
    const body = JSON.stringify({
      base: "USD", date: "2026-08-21", rates: { EUR: 0.8571, _meta: "x" },
    });
    expect(parseFeedResponse(body).rates).toEqual({ EUR: 0.8571 });
  });
});
