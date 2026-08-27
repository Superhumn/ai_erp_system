/**
 * Pure decision logic for cycle counting and inventory adjustments.
 *
 * Kept free of database access so the state machine, variance maths and
 * adjustment guards can be exercised directly. `server/db.ts` holds the
 * persistence side and calls into these.
 */

import type { CycleCountStatus } from "@shared/inventoryAdjustments";

/** Statuses from which a count may still be edited or counted against. */
const ALLOWED_TRANSITIONS: Record<CycleCountStatus, CycleCountStatus[]> = {
  draft: ["in_progress", "cancelled"],
  in_progress: ["pending_review", "cancelled"],
  pending_review: ["approved", "in_progress", "cancelled"],
  approved: [],
  cancelled: [],
};

export function canTransition(from: CycleCountStatus, to: CycleCountStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: CycleCountStatus, to: CycleCountStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`A count in "${from}" cannot move to "${to}"`);
  }
}

/** Book quantity is withheld from counters on a blind count until it closes. */
export function shouldHideSystemQuantity(status: CycleCountStatus, blindCount: boolean): boolean {
  return blindCount && (status === "draft" || status === "in_progress");
}

export function computeVariance(systemQuantity: number, countedQuantity: number): number {
  return countedQuantity - systemQuantity;
}

export function computeVarianceValue(variance: number, unitCost: number): number {
  if (!Number.isFinite(unitCost)) return 0;
  return Number((variance * unitCost).toFixed(2));
}

export type VarianceLine = {
  countedQuantity: string | null;
  variance: string | null;
  varianceValue: string | null;
};

export type VarianceSummary = {
  totalLines: number;
  countedLines: number;
  linesWithVariance: number;
  accuracyPercent: number;
  netVarianceValue: number;
  absoluteVarianceValue: number;
};

/**
 * Accuracy is the share of counted lines that matched book exactly. Net value
 * nets overages against shortages; absolute value does not, so a count that
 * is "balanced" by offsetting errors still shows its true error magnitude.
 */
export function summarizeVariance(lines: VarianceLine[]): VarianceSummary {
  const counted = lines.filter((l) => l.countedQuantity !== null && l.countedQuantity !== undefined);
  const withVariance = counted.filter((l) => (parseFloat(l.variance ?? "0") || 0) !== 0);

  let net = 0;
  let absolute = 0;
  for (const line of counted) {
    const value = parseFloat(line.varianceValue ?? "0") || 0;
    net += value;
    absolute += Math.abs(value);
  }

  return {
    totalLines: lines.length,
    countedLines: counted.length,
    linesWithVariance: withVariance.length,
    accuracyPercent: counted.length > 0
      ? Number((((counted.length - withVariance.length) / counted.length) * 100).toFixed(2))
      : 0,
    netVarianceValue: Number(net.toFixed(2)),
    absoluteVarianceValue: Number(absolute.toFixed(2)),
  };
}

/**
 * Validate a proposed stock movement before it reaches the ledger.
 * Returns the resulting balance so callers do not recompute it.
 */
export function resolveAdjustment(params: {
  currentQuantity: number;
  quantityDelta: number;
  label?: string;
}): { previousQuantity: number; newQuantity: number } {
  const { currentQuantity, quantityDelta, label = "inventory" } = params;

  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Adjustment quantity must be a non-zero number");
  }

  const newQuantity = currentQuantity + quantityDelta;
  if (newQuantity < 0) {
    throw new Error(
      `Adjustment would drive ${label} negative (on hand ${currentQuantity}, delta ${quantityDelta})`,
    );
  }

  return { previousQuantity: currentQuantity, newQuantity };
}

/** Lines still owing a physical count before the sheet can go to review. */
export function uncountedLines<T extends { status: string }>(lines: T[]): T[] {
  return lines.filter((l) => l.status === "pending" || l.status === "recount");
}
