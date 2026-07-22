import { describe, it, expect } from "vitest";
import { isConfidentialFolderName } from "./googleDrive";

describe("isConfidentialFolderName", () => {
  it("skips folders whose name starts with an underscore", () => {
    expect(isConfidentialFolderName("_secret")).toBe(true);
    expect(isConfidentialFolderName("_")).toBe(true);
    expect(isConfidentialFolderName("  _leading space")).toBe(true);
  });

  it('skips folders named "private" or "confidential" regardless of case', () => {
    expect(isConfidentialFolderName("private")).toBe(true);
    expect(isConfidentialFolderName("Private")).toBe(true);
    expect(isConfidentialFolderName("CONFIDENTIAL")).toBe(true);
    expect(isConfidentialFolderName("  Confidential  ")).toBe(true);
  });

  it("does not skip ordinary folder names", () => {
    expect(isConfidentialFolderName("2. Financial")).toBe(false);
    expect(isConfidentialFolderName("Confidential Docs")).toBe(false); // not an exact match
    expect(isConfidentialFolderName("Marketing")).toBe(false);
    expect(isConfidentialFolderName("")).toBe(false);
  });
});
