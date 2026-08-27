/**
 * FEFO (First Expired, First Out) lot selection and expiry classification.
 *
 * Deliberately free of database access so the picking rules can be tested
 * directly rather than through mocks — the same split as `cycleCountLogic.ts`.
 *
 * Lots carry an `expiryDate` that until now was written and never read: nothing
 * chose lots by expiry, and nothing swept stock that had gone out of date. The
 * consequence is the expensive kind — shipping a fresher lot while an older one
 * quietly expires on the shelf.
 */

/** Quantities are decimal(15,4) in the database. */
const SCALE = 4;

/**
 * Rounds to the database's scale. Picking repeatedly subtracts allocations from
 * a running remainder, and without this a chain of subtractions leaves values
 * like 1.0000000000000002 that never compare equal to zero.
 */
export function roundQty(value: number): number {
  return Number(value.toFixed(SCALE));
}

export interface PickableLot {
  lotId: number;
  /** Quantity available to pick from this lot, in the product's unit. */
  quantity: number;
  /** null / undefined = does not expire. */
  expiryDate?: Date | string | null;
}

export interface LotAllocation {
  lotId: number;
  quantity: number;
}

export interface FefoSelection {
  allocations: LotAllocation[];
  /** Quantity that could not be covered. 0 when the pick is fully satisfied. */
  shortfall: number;
}

function expiryTime(lot: PickableLot): number | null {
  if (lot.expiryDate === null || lot.expiryDate === undefined) return null;
  const time = new Date(lot.expiryDate).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * FEFO order: soonest expiry first.
 *
 * Lots with no expiry sort last — they are never at risk, so consuming them
 * ahead of a dated lot is exactly the waste FEFO exists to prevent. Equal
 * expiry (including two undated lots) falls back to the lower lot id, so the
 * order is stable and the older lot goes first.
 */
export function compareByExpiry(a: PickableLot, b: PickableLot): number {
  const aTime = expiryTime(a);
  const bTime = expiryTime(b);

  if (aTime === null && bTime === null) return a.lotId - b.lotId;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  if (aTime !== bTime) return aTime - bTime;
  return a.lotId - b.lotId;
}

/** Lots in the order FEFO would consume them. Does not mutate the input. */
export function sortByFefo(lots: readonly PickableLot[]): PickableLot[] {
  return [...lots].sort(compareByExpiry);
}

/**
 * Allocates `quantity` across `lots`, soonest-expiry first.
 *
 * Returns rather than throws on a shortfall: a pick preview wants to show what
 * is short, while an actual shipment must refuse it. Leaving that call to the
 * caller keeps both honest.
 */
export function selectFefoLots(
  lots: readonly PickableLot[],
  quantity: number,
): FefoSelection {
  if (!Number.isFinite(quantity)) {
    throw new Error("Pick quantity must be a finite number");
  }
  if (quantity <= 0) {
    throw new Error("Pick quantity must be greater than zero");
  }

  const allocations: LotAllocation[] = [];
  let remaining = roundQty(quantity);

  for (const lot of sortByFefo(lots)) {
    if (remaining <= 0) break;
    const available = roundQty(lot.quantity);
    if (available <= 0) continue;

    const take = roundQty(Math.min(available, remaining));
    allocations.push({ lotId: lot.lotId, quantity: take });
    remaining = roundQty(remaining - take);
  }

  return { allocations, shortfall: Math.max(0, remaining) };
}

/** Whole days until `lot` expires; negative once it has. null if undated. */
export function daysUntilExpiry(
  lot: PickableLot,
  asOf: Date,
): number | null {
  const time = expiryTime(lot);
  if (time === null) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  // Compare calendar days so a lot expiring later today reads as 0, not -1.
  const startOfDay = (ms: number) => Math.floor(ms / msPerDay);
  return startOfDay(time) - startOfDay(asOf.getTime());
}

export function isExpired(lot: PickableLot, asOf: Date): boolean {
  const days = daysUntilExpiry(lot, asOf);
  return days !== null && days < 0;
}

export type ExpiryBucket = "expired" | "critical" | "warning" | "ok" | "undated";

/**
 * Buckets a lot for the expiry report. Thresholds are deliberately coarse —
 * the point is to sort the shelf into "gone", "act now", and "plan for it".
 */
export function expiryBucket(
  lot: PickableLot,
  asOf: Date,
  thresholds: { critical: number; warning: number } = {
    critical: 30,
    warning: 90,
  },
): ExpiryBucket {
  const days = daysUntilExpiry(lot, asOf);
  if (days === null) return "undated";
  if (days < 0) return "expired";
  if (days <= thresholds.critical) return "critical";
  if (days <= thresholds.warning) return "warning";
  return "ok";
}

/** The lots a sweep should act on: dated, in the past, still holding stock. */
export function expiredLots<T extends PickableLot>(
  lots: readonly T[],
  asOf: Date,
): T[] {
  return lots.filter((lot) => isExpired(lot, asOf) && roundQty(lot.quantity) > 0);
}
