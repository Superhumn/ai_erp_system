/**
 * Structured reason codes for inventory quantity movements.
 *
 * Every adjustment, scrap, and cycle-count variance posts one of these onto
 * the `inventoryTransactions` ledger so shrinkage, damage, and expiry are
 * attributable rather than appearing as an unexplained quantity change.
 */

export const ADJUSTMENT_REASON_CODES = [
  "damage",
  "expiry",
  "theft",
  "shrinkage",
  "sample",
  "quality_hold",
  "found",
  "data_entry_error",
  "supplier_shortage",
  "repack",
  "other",
] as const;

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASON_CODES)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReasonCode, string> = {
  damage: "Damaged",
  expiry: "Expired",
  theft: "Theft",
  shrinkage: "Shrinkage",
  sample: "Sample / promotional",
  quality_hold: "Quality hold",
  found: "Found stock",
  data_entry_error: "Data entry correction",
  supplier_shortage: "Supplier short-ship",
  repack: "Repack / rework",
  other: "Other",
};

/** Reason codes that only ever decrease stock — used to validate scrap postings. */
export const DECREASE_ONLY_REASON_CODES: readonly AdjustmentReasonCode[] = [
  "damage",
  "expiry",
  "theft",
  "shrinkage",
  "sample",
];

export const CYCLE_COUNT_TYPES = ["full", "cycle", "spot", "abc"] as const;
export type CycleCountType = (typeof CYCLE_COUNT_TYPES)[number];

export const CYCLE_COUNT_STATUSES = [
  "draft",
  "in_progress",
  "pending_review",
  "approved",
  "cancelled",
] as const;
export type CycleCountStatus = (typeof CYCLE_COUNT_STATUSES)[number];
