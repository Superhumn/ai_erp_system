import { describe, it, expect } from "vitest";
import { parseDateInput, toDateInputValue } from "./dateInput";

describe("parseDateInput", () => {
  it("parses yyyy-MM-dd as local midnight, not UTC", () => {
    const d = parseDateInput("2026-03-01");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
    // The naive `new Date("2026-03-01")` is UTC midnight; ours must only match
    // it when the local timezone offset is zero.
    const naive = new Date("2026-03-01");
    expect(d!.getTime() - naive.getTime()).toBe(d!.getTimezoneOffset() * 60_000);
  });

  it("returns undefined for blank, null and undefined", () => {
    expect(parseDateInput("")).toBeUndefined();
    expect(parseDateInput("   ")).toBeUndefined();
    expect(parseDateInput(null)).toBeUndefined();
    expect(parseDateInput(undefined)).toBeUndefined();
  });

  it("returns undefined for garbage", () => {
    expect(parseDateInput("not-a-date")).toBeUndefined();
  });

  it("still accepts a full ISO timestamp", () => {
    const d = parseDateInput("2026-03-01T15:30:00.000Z");
    expect(d?.toISOString()).toBe("2026-03-01T15:30:00.000Z");
  });
});

describe("toDateInputValue", () => {
  it("formats a local Date as yyyy-MM-dd", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateInputValue(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("round-trips a date-only string without shifting a day", () => {
    for (const s of ["2026-01-01", "2026-02-28", "2026-12-31"]) {
      expect(toDateInputValue(parseDateInput(s))).toBe(s);
      expect(toDateInputValue(s)).toBe(s);
    }
  });

  it("returns an empty string for blank or invalid input", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue("")).toBe("");
    expect(toDateInputValue(new Date("garbage"))).toBe("");
  });
});
