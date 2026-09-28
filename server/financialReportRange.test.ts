import { describe, expect, it } from "vitest";
import { inReportRange, onOrBefore, parseReportRange } from "./financialReportRange";

describe("parseReportRange", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("treats a bare end date as the whole day and defaults asOf to it", () => {
    const r = parseReportRange("2026-01-01", "2026-03-31", now);
    expect(r.start).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(r.end).toEqual(new Date("2026-03-31T23:59:59.999Z"));
    expect(r.asOf).toEqual(r.end);
  });

  it("keeps full ISO timestamps as given", () => {
    const r = parseReportRange("2026-01-01T05:00:00.000Z", "2026-09-28T10:30:00.000Z", now);
    expect(r.start).toEqual(new Date("2026-01-01T05:00:00.000Z"));
    expect(r.end).toEqual(new Date("2026-09-28T10:30:00.000Z"));
  });

  it("is unbounded with asOf = now when nothing (or garbage) is supplied", () => {
    expect(parseReportRange(undefined, undefined, now)).toEqual({ start: undefined, end: undefined, asOf: now });
    expect(parseReportRange("not a date", "also not", now)).toEqual({ start: undefined, end: undefined, asOf: now });
  });
});

describe("inReportRange / onOrBefore", () => {
  const range = parseReportRange("2026-02-01", "2026-02-28");

  it("is inclusive at both ends", () => {
    expect(inReportRange(range, new Date("2026-02-01T00:00:00Z"))).toBe(true);
    expect(inReportRange(range, "2026-02-28T23:59:59Z")).toBe(true);
    expect(inReportRange(range, new Date("2026-01-31T23:59:59Z"))).toBe(false);
    expect(inReportRange(range, new Date("2026-03-01T00:00:00Z"))).toBe(false);
  });

  it("keeps undated or unparseable rows", () => {
    expect(inReportRange(range, null)).toBe(true);
    expect(inReportRange(range, "??")).toBe(true);
  });

  it("onOrBefore compares against the as-of date", () => {
    const asOf = new Date("2026-02-28T23:59:59.999Z");
    expect(onOrBefore(asOf, "2026-02-28")).toBe(true);
    expect(onOrBefore(asOf, "2026-03-01")).toBe(false);
    expect(onOrBefore(asOf, undefined)).toBe(true);
  });
});
