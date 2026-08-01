import { describe, it, expect } from "vitest";
import { computePivot, applyFilters, matchesFilter } from "./pivot";
import type { PivotConfig } from "@shared/opsToolkit";

const rows = [
  { status: "shipped", region: "US", amount: "100" },
  { status: "shipped", region: "EU", amount: "50" },
  { status: "pending", region: "US", amount: "200" },
  { status: "pending", region: "US", amount: "25" },
];

describe("computePivot", () => {
  it("counts rows per row-key", () => {
    const cfg: PivotConfig = { rowField: "status", aggregation: "count" };
    const r = computePivot(rows, cfg);
    expect(r.rowKeys).toEqual(["pending", "shipped"]);
    expect(r.cells["shipped"]["Total"]).toBe(2);
    expect(r.cells["pending"]["Total"]).toBe(2);
    expect(r.grandTotal).toBe(4);
  });

  it("sums a numeric value field across a row x col grid", () => {
    const cfg: PivotConfig = { rowField: "status", colField: "region", valueField: "amount", aggregation: "sum" };
    const r = computePivot(rows, cfg);
    expect(r.colKeys).toEqual(["EU", "US"]);
    expect(r.cells["shipped"]["US"]).toBe(100);
    expect(r.cells["shipped"]["EU"]).toBe(50);
    expect(r.cells["pending"]["US"]).toBe(225);
    expect(r.cells["pending"]["EU"]).toBe(0);
    expect(r.rowTotals["pending"]).toBe(225);
    expect(r.colTotals["US"]).toBe(325);
    expect(r.grandTotal).toBe(375);
  });

  it("averages a value field", () => {
    const cfg: PivotConfig = { rowField: "status", valueField: "amount", aggregation: "avg" };
    const r = computePivot(rows, cfg);
    expect(r.cells["pending"]["Total"]).toBe(112.5); // (200+25)/2
    expect(r.cells["shipped"]["Total"]).toBe(75);    // (100+50)/2
  });

  it("respects filters", () => {
    const cfg: PivotConfig = {
      rowField: "region", aggregation: "count",
      filters: [{ field: "status", op: "eq", value: "pending" }],
    };
    const r = computePivot(rows, cfg);
    expect(r.rowKeys).toEqual(["US"]);
    expect(r.grandTotal).toBe(2);
  });
});

describe("filters", () => {
  it("matchesFilter handles contains and numeric compare", () => {
    expect(matchesFilter({ name: "Acme Corp" }, { field: "name", op: "contains", value: "acme" })).toBe(true);
    expect(matchesFilter({ qty: "12" }, { field: "qty", op: "gte", value: 10 })).toBe(true);
    expect(matchesFilter({ qty: "5" }, { field: "qty", op: "gte", value: 10 })).toBe(false);
  });
  it("applyFilters ANDs all predicates", () => {
    const out = applyFilters(rows, [
      { field: "status", op: "eq", value: "pending" },
      { field: "region", op: "eq", value: "US" },
    ]);
    expect(out).toHaveLength(2);
  });
});
