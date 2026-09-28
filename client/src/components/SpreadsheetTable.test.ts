import { describe, it, expect } from "vitest";
import { toCsvRow } from "./SpreadsheetTable";

describe("toCsvRow", () => {
  it("quotes every cell and joins with commas", () => {
    expect(toCsvRow(["a", 1, true])).toBe('"a","1","true"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(toCsvRow(['Acme "Co"'])).toBe('"Acme ""Co"""');
  });

  it("keeps embedded newlines and commas inside the quoted cell", () => {
    expect(toCsvRow(["line1\nline2", "a,b"])).toBe('"line1\nline2","a,b"');
  });

  it("renders null / undefined as empty cells", () => {
    expect(toCsvRow([null, undefined, ""])).toBe('"","",""');
  });
});
