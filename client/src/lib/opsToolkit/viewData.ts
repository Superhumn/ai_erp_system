// Helpers shared by the DataViews component (Item 1): inferring displayable
// columns from arbitrary ERP rows, grouping into kanban lanes, and reading
// date-ish fields for calendar/timeline placement. Pure, no React.

import type { ViewConfig, ViewFilter } from "@shared/opsToolkit";
import { applyFilters } from "./pivot";

export type Row = Record<string, unknown>;

export interface ColumnDescriptor {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "boolean";
}

const HIDDEN_KEYS = new Set(["password", "passwordHash", "salt", "openId", "token"]);

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v !== "string") return false;
  // ISO-ish date or datetime
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(v);
}

/** Infer a column set from the first rows, skipping objects/arrays and secrets. */
export function inferColumns(rows: Row[], sampleSize = 25): ColumnDescriptor[] {
  const seen = new Map<string, ColumnDescriptor>();
  for (const row of rows.slice(0, sampleSize)) {
    if (!row || typeof row !== "object") continue;
    for (const [key, value] of Object.entries(row)) {
      if (seen.has(key) || HIDDEN_KEYS.has(key) || key.startsWith("_")) continue;
      if (value !== null && typeof value === "object" && !(value instanceof Date)) continue;
      let kind: ColumnDescriptor["kind"] = "text";
      if (typeof value === "number") kind = "number";
      else if (typeof value === "boolean") kind = "boolean";
      else if (looksLikeDate(value)) kind = "date";
      seen.set(key, { key, label: humanize(key), kind });
    }
  }
  return [...seen.values()];
}

/** Fields that are good kanban/group candidates (short, enum-like text). */
export function groupableFields(columns: ColumnDescriptor[]): ColumnDescriptor[] {
  return columns.filter((c) => c.kind === "text" || c.kind === "boolean");
}

export function dateFields(columns: ColumnDescriptor[]): ColumnDescriptor[] {
  return columns.filter((c) => c.kind === "date");
}

export function numberFields(columns: ColumnDescriptor[]): ColumnDescriptor[] {
  return columns.filter((c) => c.kind === "number");
}

export function coerceDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function groupKey(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** Bucket rows by config.groupByField, honoring an explicit groupOrder if set. */
export function groupRows(rows: Row[], config: ViewConfig): { key: string; rows: Row[] }[] {
  const field = config.groupByField;
  if (!field) return [{ key: "All", rows }];
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    const k = groupKey(row[field]);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(row);
  }
  let keys = [...buckets.keys()];
  if (config.groupOrder && config.groupOrder.length) {
    const order = config.groupOrder;
    keys = keys.sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  } else {
    keys = keys.sort((a, b) => a.localeCompare(b));
  }
  return keys.map((key) => ({ key, rows: buckets.get(key)! }));
}

export function sortRows(rows: Row[], config: ViewConfig): Row[] {
  if (!config.sort) return rows;
  const { field, dir } = config.sort;
  const mult = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[field]; const bv = b[field];
    const an = Number(av); const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * mult;
    return String(av ?? "").localeCompare(String(bv ?? "")) * mult;
  });
}

/** Apply filters then sort — the standard pre-render pipeline for a view. */
export function prepareRows(rows: Row[], config: ViewConfig): Row[] {
  const filtered = applyFilters(rows, config.filters as ViewFilter[] | undefined);
  return sortRows(filtered, config);
}

export function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (looksLikeDate(v)) {
    const d = coerceDate(v);
    return d ? d.toLocaleDateString() : String(v);
  }
  return String(v);
}
