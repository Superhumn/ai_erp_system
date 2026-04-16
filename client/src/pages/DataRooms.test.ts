/**
 * Tests for DataRooms page utility functions.
 * Functions tested: generateSlug
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from DataRooms.tsx ──

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Tests ──

describe("DataRooms — generateSlug", () => {
  it("converts to lowercase", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(generateSlug("My Data Room")).toBe("my-data-room");
  });

  it("replaces special characters with hyphens", () => {
    expect(generateSlug("Series A: Due Diligence")).toBe("series-a-due-diligence");
  });

  it("collapses consecutive special chars into single hyphen", () => {
    expect(generateSlug("test!!!room")).toBe("test-room");
  });

  it("strips leading hyphens", () => {
    expect(generateSlug("!leading")).toBe("leading");
  });

  it("strips trailing hyphens", () => {
    expect(generateSlug("trailing!")).toBe("trailing");
  });

  it("handles already valid slug", () => {
    expect(generateSlug("valid-slug")).toBe("valid-slug");
  });

  it("handles numbers", () => {
    expect(generateSlug("Room 42")).toBe("room-42");
  });

  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });

  it("handles all special characters", () => {
    expect(generateSlug("@#$%^&*")).toBe("");
  });

  it("handles mixed alphanumeric and special", () => {
    expect(generateSlug("Q1-2026_fundraising")).toBe("q1-2026-fundraising");
  });
});
