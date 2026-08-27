/**
 * Replenishment planning.
 *
 * Reordering has been entirely hand-entered: `inventory.reorderLevel` and
 * `reorderQuantity` are typed in per product/warehouse, and the only thing that
 * consults them is a low-stock notification fired after the fact. Nothing
 * looked at how fast stock actually moves, how long a vendor takes to deliver,
 * or what is already on order — so a reorder level set once stayed right only
 * for as long as demand did.
 *
 * This module computes the numbers. It is free of database access so the
 * arithmetic can be tested directly, the same split as `fefo.ts` and
 * `cycleCountLogic.ts`.
 *
 * A hand-entered reorder level still wins when one is set. The point is to
 * stop *requiring* someone to keep it current, not to overrule a buyer who
 * knows something the history does not.
 */

const SCALE = 4;

export function round(value: number, scale = SCALE): number {
  return Number(value.toFixed(scale));
}

/** Lead time used when neither the product's vendor nor the caller supplies one. */
export const DEFAULT_LEAD_TIME_DAYS = 14;

/**
 * Extra days of demand held as buffer.
 *
 * A flat number of days rather than a statistical service level: the demand
 * history here is a simple total over a window, with no variance to compute a
 * proper safety factor from. Presenting a σ-based number off that data would
 * look more precise than it is.
 */
export const DEFAULT_SAFETY_DAYS = 7;

/** Days of demand a replenishment order aims to cover beyond the reorder point. */
export const DEFAULT_COVERAGE_DAYS = 30;

export type Urgency = "stockout" | "urgent" | "soon" | "ok" | "no_demand";

export interface ReplenishmentInput {
  onHand: number;
  /** Already committed to orders — not available to sell. */
  reserved?: number;
  /** On order from a vendor but not yet received. */
  onOrder?: number;
  /** Units per day, from `dailyDemand`. */
  dailyDemand: number;
  leadTimeDays?: number;
  /** Hand-entered level. When set it wins over the computed reorder point. */
  reorderLevel?: number | null;
  /** Hand-entered order quantity. When set it wins over computed coverage. */
  reorderQuantity?: number | null;
  minimumOrderQuantity?: number | null;
  safetyDays?: number;
  coverageDays?: number;
}

export interface ReplenishmentSuggestion {
  available: number;
  projectedOnHand: number;
  dailyDemand: number;
  leadTimeDays: number;
  reorderPoint: number;
  /** True when `reorderPoint` came from a hand-entered value. */
  reorderPointIsManual: boolean;
  safetyStock: number;
  daysOfCover: number | null;
  shouldOrder: boolean;
  suggestedQuantity: number;
  urgency: Urgency;
  /** Plain-language reason, for showing next to the number. */
  rationale: string;
}

/** Average units sold per day across a window. */
export function dailyDemand(quantitySold: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  if (!Number.isFinite(quantitySold) || quantitySold <= 0) return 0;
  return round(quantitySold / windowDays);
}

/** Buffer units: the demand expected across `safetyDays`. */
export function safetyStockUnits(
  demandPerDay: number,
  safetyDays = DEFAULT_SAFETY_DAYS,
): number {
  if (demandPerDay <= 0 || safetyDays <= 0) return 0;
  return round(demandPerDay * safetyDays);
}

/**
 * The level at which an order must be placed to avoid running out while
 * waiting for it: demand across the lead time, plus the safety buffer.
 */
export function reorderPoint(
  demandPerDay: number,
  leadTimeDays = DEFAULT_LEAD_TIME_DAYS,
  safetyDays = DEFAULT_SAFETY_DAYS,
): number {
  if (demandPerDay <= 0) return 0;
  const lead = Math.max(0, leadTimeDays);
  return round(demandPerDay * lead + safetyStockUnits(demandPerDay, safetyDays));
}

/** How many days the stock lasts at current demand. null when nothing is moving. */
export function daysOfCover(
  available: number,
  demandPerDay: number,
): number | null {
  if (demandPerDay <= 0) return null;
  return round(Math.max(0, available) / demandPerDay, 1);
}

/**
 * How pressing the reorder is, judged against the lead time rather than a
 * fixed number of days: 10 days of cover is comfortable for a 3-day lead time
 * and already too late for a 30-day one.
 */
export function classifyUrgency(
  cover: number | null,
  leadTimeDays: number,
): Urgency {
  if (cover === null) return "no_demand";
  if (cover <= 0) return "stockout";
  const lead = Math.max(1, leadTimeDays);
  if (cover < lead) return "urgent";
  if (cover < lead + DEFAULT_SAFETY_DAYS) return "soon";
  return "ok";
}

/**
 * What to order, and why.
 *
 * Counts stock already on order, which the hand-entered flow never did — the
 * reason the old low-stock notification would keep firing on a product whose
 * replenishment was already in transit.
 */
export function suggestReplenishment(
  input: ReplenishmentInput,
): ReplenishmentSuggestion {
  const onHand = Number.isFinite(input.onHand) ? input.onHand : 0;
  const reserved = Math.max(0, input.reserved ?? 0);
  const onOrder = Math.max(0, input.onOrder ?? 0);
  const demandPerDay = Math.max(0, input.dailyDemand);
  const leadTimeDays = Math.max(0, input.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS);
  const safetyDays = input.safetyDays ?? DEFAULT_SAFETY_DAYS;
  const coverageDays = input.coverageDays ?? DEFAULT_COVERAGE_DAYS;

  const available = round(onHand - reserved);
  const projectedOnHand = round(available + onOrder);
  const safetyStock = safetyStockUnits(demandPerDay, safetyDays);

  const manualLevel =
    input.reorderLevel !== null &&
    input.reorderLevel !== undefined &&
    Number.isFinite(input.reorderLevel)
      ? Math.max(0, input.reorderLevel)
      : null;

  const computedPoint = reorderPoint(demandPerDay, leadTimeDays, safetyDays);
  const point = manualLevel ?? computedPoint;
  const cover = daysOfCover(available, demandPerDay);
  const urgency = classifyUrgency(cover, leadTimeDays);

  // Nothing is moving and nothing was set by hand — there is no basis for a
  // number, and inventing one would be worse than saying so.
  if (demandPerDay <= 0 && manualLevel === null) {
    return {
      available, projectedOnHand, dailyDemand: demandPerDay, leadTimeDays,
      reorderPoint: 0, reorderPointIsManual: false, safetyStock: 0,
      daysOfCover: null, shouldOrder: false, suggestedQuantity: 0,
      urgency: "no_demand",
      rationale: "No recorded demand in the window and no reorder level set.",
    };
  }

  if (projectedOnHand > point) {
    return {
      available, projectedOnHand, dailyDemand: demandPerDay, leadTimeDays,
      reorderPoint: point, reorderPointIsManual: manualLevel !== null,
      safetyStock, daysOfCover: cover, shouldOrder: false, suggestedQuantity: 0,
      urgency,
      rationale:
        onOrder > 0
          ? `${projectedOnHand} projected (${available} on hand + ${onOrder} on order) is above the reorder point of ${point}.`
          : `${available} available is above the reorder point of ${point}.`,
    };
  }

  const manualQuantity =
    input.reorderQuantity !== null &&
    input.reorderQuantity !== undefined &&
    Number.isFinite(input.reorderQuantity) &&
    input.reorderQuantity > 0
      ? input.reorderQuantity
      : null;

  // Order up to the reorder point plus a coverage horizon, so the next order is
  // a planned cycle away rather than immediate.
  const target = round(point + demandPerDay * coverageDays);
  const computedQuantity = Math.max(0, round(target - projectedOnHand));

  let suggested = manualQuantity ?? computedQuantity;
  const moq = input.minimumOrderQuantity ?? 0;
  if (moq > 0 && suggested > 0 && suggested < moq) suggested = moq;
  suggested = Math.ceil(round(suggested));

  const parts: string[] = [];
  parts.push(
    onOrder > 0
      ? `${projectedOnHand} projected (${available} on hand + ${onOrder} on order) is at or below the reorder point of ${point}`
      : `${available} available is at or below the reorder point of ${point}`,
  );
  if (manualLevel !== null) parts.push("reorder level set manually");
  else parts.push(`${demandPerDay}/day over a ${leadTimeDays}-day lead time plus ${safetyDays} days of buffer`);
  if (manualQuantity !== null) parts.push("order quantity set manually");
  if (moq > 0 && suggested === moq && (manualQuantity ?? computedQuantity) < moq) {
    parts.push(`raised to the ${moq} minimum order quantity`);
  }

  return {
    available, projectedOnHand, dailyDemand: demandPerDay, leadTimeDays,
    reorderPoint: point, reorderPointIsManual: manualLevel !== null,
    safetyStock, daysOfCover: cover, shouldOrder: suggested > 0,
    suggestedQuantity: suggested, urgency,
    rationale: `${parts.join("; ")}.`,
  };
}

/** Most pressing first, then the largest order. */
export function compareByUrgency(
  a: { urgency: Urgency; suggestedQuantity: number },
  b: { urgency: Urgency; suggestedQuantity: number },
): number {
  const rank: Record<Urgency, number> = {
    stockout: 0, urgent: 1, soon: 2, ok: 3, no_demand: 4,
  };
  if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
  return b.suggestedQuantity - a.suggestedQuantity;
}
