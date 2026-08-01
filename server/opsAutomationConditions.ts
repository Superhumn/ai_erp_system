// Pure predicate logic for the Ops Toolkit automation engine (Item 3).
// Kept dependency-free (no DB / email imports) so it can be unit-tested in
// isolation and reused by the engine.

import type {
  AutomationCondition, AutomationConditionOp, AutomationTriggerConfig,
} from "@shared/opsToolkit";

export type RecordLike = Record<string, unknown>;

function getFieldValue(record: RecordLike, field: string): unknown {
  return record?.[field];
}

/** Evaluate a single condition against a record. Missing values are "empty". */
export function evaluateCondition(record: RecordLike, cond: AutomationCondition): boolean {
  const raw = getFieldValue(record, cond.field);
  const op: AutomationConditionOp = cond.op;
  const target = cond.value;

  const isEmpty = raw === undefined || raw === null || raw === "";
  if (op === "empty") return isEmpty;
  if (op === "not_empty") return !isEmpty;

  const asString = raw === undefined || raw === null ? "" : String(raw);
  const targetString = target === undefined || target === null ? "" : String(target);

  switch (op) {
    case "eq": return asString === targetString;
    case "neq": return asString !== targetString;
    case "contains": return asString.toLowerCase().includes(targetString.toLowerCase());
    case "gt": case "gte": case "lt": case "lte": {
      const a = Number(raw); const b = Number(target);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        if (op === "gt") return asString > targetString;
        if (op === "gte") return asString >= targetString;
        if (op === "lt") return asString < targetString;
        return asString <= targetString;
      }
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    default: return false;
  }
}

/** All conditions must pass (AND). Empty list always passes. */
export function evaluateConditions(record: RecordLike, conditions: AutomationCondition[] | null | undefined): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(record, c));
}

/**
 * Whether a field_changed trigger should fire given before/after records.
 * Fires when the watched field changed (and, if `toValue` is set, became it).
 */
export function fieldChangeMatches(
  triggerConfig: AutomationTriggerConfig | null | undefined,
  record: RecordLike,
  previous: RecordLike | undefined,
): boolean {
  const field = triggerConfig?.field;
  if (!field) return true;
  const now = getFieldValue(record, field);
  const before = previous ? getFieldValue(previous, field) : undefined;
  const changed = String(now ?? "") !== String(before ?? "");
  if (!changed) return false;
  if (triggerConfig?.toValue !== undefined && triggerConfig.toValue !== "") {
    return String(now ?? "") === String(triggerConfig.toValue);
  }
  return true;
}

/** Simple {{field}} interpolation for email/notification bodies. */
export function interpolate(template: string, record: RecordLike): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = getFieldValue(record, key);
    return v === undefined || v === null ? "" : String(v);
  });
}
