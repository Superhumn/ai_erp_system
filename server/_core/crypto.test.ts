import { describe, it, expect } from "vitest";
import { secureCompare } from "./crypto";

describe("secureCompare", () => {
  it("returns true for identical strings", () => {
    expect(secureCompare("s3cret-value", "s3cret-value")).toBe(true);
    expect(secureCompare("", "")).toBe(true);
  });

  it("returns false for strings that differ in content but not length", () => {
    expect(secureCompare("abcdef", "abcdeg")).toBe(false);
  });

  it("returns false (and does not throw) for different lengths", () => {
    expect(() => secureCompare("short", "much-longer-secret")).not.toThrow();
    expect(secureCompare("short", "much-longer-secret")).toBe(false);
  });

  it("returns false for missing or non-string inputs instead of throwing", () => {
    expect(secureCompare(undefined, "secret")).toBe(false);
    expect(secureCompare("secret", undefined)).toBe(false);
    expect(secureCompare(null, null)).toBe(false);
    expect(secureCompare(["secret"], "secret")).toBe(false);
    expect(secureCompare(123 as unknown, "123")).toBe(false);
  });

  it("handles multi-byte characters by byte length", () => {
    expect(secureCompare("héllo", "héllo")).toBe(true);
    expect(secureCompare("héllo", "hello")).toBe(false);
  });
});
