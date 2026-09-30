import { describe, expect, it } from "vitest";
import { lastPage, pageRange } from "./paging";

describe("pageRange", () => {
  it("describes a middle page", () => {
    expect(pageRange(1, 50, 1_000_000)).toEqual({ from: 51, to: 100, pageCount: 20_000, hasPrev: true, hasNext: true });
  });
  it("clips the last page", () => {
    expect(pageRange(2, 50, 120)).toEqual({ from: 101, to: 120, pageCount: 3, hasPrev: true, hasNext: false });
  });
  it("handles an empty list", () => {
    expect(pageRange(0, 50, 0)).toEqual({ from: 0, to: 0, pageCount: 1, hasPrev: false, hasNext: false });
  });
});

describe("lastPage", () => {
  it("is 0 for empty and exact multiples round down", () => {
    expect(lastPage(50, 0)).toBe(0);
    expect(lastPage(50, 100)).toBe(1);
    expect(lastPage(50, 101)).toBe(2);
  });
});
