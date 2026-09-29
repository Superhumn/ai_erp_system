import { describe, expect, it } from "vitest";
import { containsPattern, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, resolvePage } from "./listPaging";

describe("resolvePage", () => {
  it("defaults", () => {
    expect(resolvePage()).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
  });
  it("clamps limit and offset", () => {
    expect(resolvePage({ limit: 10_000, offset: -5 })).toEqual({ limit: MAX_PAGE_LIMIT, offset: 0 });
    expect(resolvePage({ limit: 0, offset: 20.7 })).toEqual({ limit: 1, offset: 20 });
  });
});

describe("containsPattern", () => {
  it("wraps and trims", () => {
    expect(containsPattern("  SO-12 ")).toBe("%SO-12%");
  });
  it("escapes LIKE wildcards", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
  it("returns null for blank input", () => {
    expect(containsPattern("")).toBeNull();
    expect(containsPattern("   ")).toBeNull();
    expect(containsPattern(undefined)).toBeNull();
  });
});
