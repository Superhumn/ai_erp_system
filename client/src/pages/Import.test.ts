/**
 * Tests for Import page utility functions.
 * Functions tested: parseCsvText, DATA_SECTIONS, toggleFile logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from Import.tsx ──

const DATA_SECTIONS = [
  { value: "customers", label: "Customers" },
  { value: "vendors", label: "Vendors" },
  { value: "products", label: "Products" },
  { value: "employees", label: "Employees" },
  { value: "invoices", label: "Invoices" },
  { value: "contracts", label: "Contracts" },
  { value: "projects", label: "Projects" },
] as const;

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.replace(/^"|"$/g, "").trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
  return { headers, rows };
}

function toggleFile(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

// ── Tests ──

describe("Import page — DATA_SECTIONS", () => {
  it("has 7 importable data types", () => {
    expect(DATA_SECTIONS).toHaveLength(7);
  });

  it("includes all expected section values", () => {
    const values = DATA_SECTIONS.map(s => s.value);
    expect(values).toContain("customers");
    expect(values).toContain("vendors");
    expect(values).toContain("products");
    expect(values).toContain("employees");
    expect(values).toContain("invoices");
    expect(values).toContain("contracts");
    expect(values).toContain("projects");
  });

  it("each section has a label", () => {
    for (const section of DATA_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
    }
  });
});

describe("Import page — parseCsvText", () => {
  it("parses simple CSV with comma delimiter", () => {
    const csv = "Name,Email,Phone\nAlice,alice@test.com,123\nBob,bob@test.com,456";
    const result = parseCsvText(csv);
    expect(result.headers).toEqual(["Name", "Email", "Phone"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ Name: "Alice", Email: "alice@test.com", Phone: "123" });
    expect(result.rows[1]).toEqual({ Name: "Bob", Email: "bob@test.com", Phone: "456" });
  });

  it("parses tab-delimited text", () => {
    const tsv = "Name\tEmail\nAlice\talice@test.com";
    const result = parseCsvText(tsv);
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows[0]).toEqual({ Name: "Alice", Email: "alice@test.com" });
  });

  it("strips quotes from values", () => {
    const csv = '"Name","Email"\n"Alice","alice@test.com"';
    const result = parseCsvText(csv);
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows[0]).toEqual({ Name: "Alice", Email: "alice@test.com" });
  });

  it("returns empty for empty input", () => {
    const result = parseCsvText("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("returns empty for whitespace-only input", () => {
    const result = parseCsvText("   \n   \n   ");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("handles header-only CSV (no data rows)", () => {
    const result = parseCsvText("Name,Email");
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows).toEqual([]);
  });

  it("handles missing values as empty strings", () => {
    const csv = "A,B,C\n1,,3";
    const result = parseCsvText(csv);
    expect(result.rows[0]).toEqual({ A: "1", B: "", C: "3" });
  });

  it("handles rows with fewer columns than headers", () => {
    const csv = "A,B,C\n1";
    const result = parseCsvText(csv);
    expect(result.rows[0]).toEqual({ A: "1", B: "", C: "" });
  });

  it("handles Windows line endings (\\r\\n)", () => {
    const csv = "Name,Value\r\nAlice,100\r\nBob,200";
    const result = parseCsvText(csv);
    expect(result.rows).toHaveLength(2);
  });

  it("trims whitespace from headers and values", () => {
    const csv = " Name , Email \n Alice , alice@test.com ";
    const result = parseCsvText(csv);
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows[0]).toEqual({ Name: "Alice", Email: "alice@test.com" });
  });
});

describe("Import page — toggleFile", () => {
  it("adds id to empty set", () => {
    const result = toggleFile(new Set(), "file-1");
    expect(result.has("file-1")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("removes id if already in set", () => {
    const result = toggleFile(new Set(["file-1"]), "file-1");
    expect(result.has("file-1")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("does not mutate original set", () => {
    const original = new Set(["file-1"]);
    const result = toggleFile(original, "file-2");
    expect(original.size).toBe(1);
    expect(result.size).toBe(2);
  });

  it("handles multiple toggles", () => {
    let set = new Set<string>();
    set = toggleFile(set, "a");
    set = toggleFile(set, "b");
    expect(set.size).toBe(2);
    set = toggleFile(set, "a");
    expect(set.size).toBe(1);
    expect(set.has("b")).toBe(true);
  });
});
