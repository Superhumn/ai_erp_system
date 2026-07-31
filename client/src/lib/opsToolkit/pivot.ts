// Pure pivot-table engine for the Ops Toolkit report builder (Item 4).
// No React / DOM dependencies so it can be unit-tested in isolation.

import type { PivotConfig, PivotResult, ViewFilter, FilterOp } from "@shared/opsToolkit";

type Row = Record<string, unknown>;

const EMPTY = "—";

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  // Drizzle decimal columns arrive as strings; strip currency/commas.
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

function keyOf(v: unknown): string {
  if (v === null || v === undefined || v === "") return EMPTY;
  return String(v);
}

export function matchesFilter(row: Row, f: ViewFilter): boolean {
  const raw = row[f.field];
  const op: FilterOp = f.op;
  const isEmpty = raw === undefined || raw === null || raw === "";
  if (op === "empty") return isEmpty;
  if (op === "not_empty") return !isEmpty;
  const s = isEmpty ? "" : String(raw);
  const t = f.value === undefined || f.value === null ? "" : String(f.value);
  switch (op) {
    case "eq": return s === t;
    case "neq": return s !== t;
    case "contains": return s.toLowerCase().includes(t.toLowerCase());
    case "gt": case "gte": case "lt": case "lte": {
      const a = toNumber(raw); const b = toNumber(f.value);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        if (op === "gt") return s > t;
        if (op === "gte") return s >= t;
        if (op === "lt") return s < t;
        return s <= t;
      }
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    default: return true;
  }
}

export function applyFilters(rows: Row[], filters?: ViewFilter[]): Row[] {
  if (!filters || filters.length === 0) return rows;
  return rows.filter((r) => filters.every((f) => matchesFilter(r, f)));
}

/**
 * Compute a pivot grid from rows. `count` ignores valueField; the other
 * aggregations operate on numeric coercions of valueField and skip non-numeric
 * cells. Returns stable, sorted row/column keys plus totals.
 */
export function computePivot(rows: Row[], config: PivotConfig): PivotResult {
  const filtered = applyFilters(rows, config.filters);
  const { rowField, colField, valueField, aggregation } = config;

  // Accumulate sums and counts per cell so avg can be derived.
  const sums: Record<string, Record<string, number>> = {};
  const counts: Record<string, Record<string, number>> = {};
  const mins: Record<string, Record<string, number>> = {};
  const maxs: Record<string, Record<string, number>> = {};
  const rowKeySet = new Set<string>();
  const colKeySet = new Set<string>();

  for (const row of filtered) {
    const rk = keyOf(row[rowField]);
    const ck = colField ? keyOf(row[colField]) : "Total";
    rowKeySet.add(rk);
    colKeySet.add(ck);
    sums[rk] ??= {}; counts[rk] ??= {}; mins[rk] ??= {}; maxs[rk] ??= {};
    counts[rk][ck] = (counts[rk][ck] ?? 0) + 1;
    if (aggregation !== "count") {
      const n = toNumber(valueField ? row[valueField] : undefined);
      if (!Number.isNaN(n)) {
        sums[rk][ck] = (sums[rk][ck] ?? 0) + n;
        mins[rk][ck] = mins[rk][ck] === undefined ? n : Math.min(mins[rk][ck], n);
        maxs[rk][ck] = maxs[rk][ck] === undefined ? n : Math.max(maxs[rk][ck], n);
      }
    }
  }

  const rowKeys = [...rowKeySet].sort((a, b) => a.localeCompare(b));
  const colKeys = [...colKeySet].sort((a, b) => a.localeCompare(b));

  const cells: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;

  for (const rk of rowKeys) {
    cells[rk] = {};
    for (const ck of colKeys) {
      let val = 0;
      const c = counts[rk]?.[ck] ?? 0;
      switch (aggregation) {
        case "count": val = c; break;
        case "sum": val = sums[rk]?.[ck] ?? 0; break;
        case "avg": val = c > 0 && sums[rk]?.[ck] !== undefined ? (sums[rk][ck] / c) : 0; break;
        case "min": val = mins[rk]?.[ck] ?? 0; break;
        case "max": val = maxs[rk]?.[ck] ?? 0; break;
      }
      val = Math.round(val * 100) / 100;
      cells[rk][ck] = val;
      // Row/col/grand totals use additive semantics; for min/max/avg these are
      // best-effort "sum of cells" summaries (still useful as magnitude checks).
      rowTotals[rk] = (rowTotals[rk] ?? 0) + val;
      colTotals[ck] = (colTotals[ck] ?? 0) + val;
      grandTotal += val;
    }
    rowTotals[rk] = Math.round((rowTotals[rk] ?? 0) * 100) / 100;
  }
  for (const ck of colKeys) colTotals[ck] = Math.round((colTotals[ck] ?? 0) * 100) / 100;
  grandTotal = Math.round(grandTotal * 100) / 100;

  return { rowKeys, colKeys, cells, rowTotals, colTotals, grandTotal };
}
