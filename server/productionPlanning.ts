/**
 * Pure production-planning math.
 *
 * Everything in here is deliberately free of DB access so it can be unit tested
 * directly (see productionPlanning.test.ts). The tRPC layer in server/routers.ts
 * does the reads/writes and delegates the arithmetic here so the forecast-driven
 * and manual planning flows stay consistent.
 */

export const GRAMS_PER_LB = 453.59237;
export const GRAMS_PER_KG = 1000;
export const GRAMS_PER_OZ = 28.349523125;

export const PLAN_UNITS = ["EA", "CASE", "BATCH", "G", "KG", "LB", "OZ"] as const;
export type PlanUnit = (typeof PLAN_UNITS)[number];

export type PlanUnitDimension = "count" | "weight" | "batch";

/** Extra facts needed to move between count, weight and batch units. */
export interface UnitContext {
  /** Finished units in one case. Required to convert CASE ↔ anything else. */
  unitsPerCase?: number | null;
  /** Net weight in grams of one finished unit. Required to convert EA/CASE ↔ weight. */
  unitWeightGrams?: number | null;
  /** Finished grams produced by one batch (a recipe's base batch, or a BOM batch measured by weight). */
  batchGrams?: number | null;
  /** Finished units produced by one batch (a BOM batch measured in EA). */
  batchUnits?: number | null;
}

/** Thrown when a conversion needs a fact the caller didn't supply (e.g. case size). */
export class PlanUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanUnitError";
  }
}

const UNIT_ALIASES: Record<string, PlanUnit> = {
  ea: "EA",
  each: "EA",
  unit: "EA",
  units: "EA",
  pc: "EA",
  pcs: "EA",
  package: "EA",
  packages: "EA",
  pkg: "EA",
  case: "CASE",
  cases: "CASE",
  cs: "CASE",
  batch: "BATCH",
  batches: "BATCH",
  g: "G",
  gram: "G",
  grams: "G",
  kg: "KG",
  kgs: "KG",
  kilogram: "KG",
  kilograms: "KG",
  lb: "LB",
  lbs: "LB",
  pound: "LB",
  pounds: "LB",
  oz: "OZ",
  ounce: "OZ",
  ounces: "OZ",
};

/** Map a free-form unit string (BOM batchUnit, recipe unit, user input) onto a PlanUnit. */
export function normalizePlanUnit(raw: string | null | undefined): PlanUnit | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? null;
}

export function planUnitDimension(unit: PlanUnit): PlanUnitDimension {
  switch (unit) {
    case "EA":
    case "CASE":
      return "count";
    case "BATCH":
      return "batch";
    default:
      return "weight";
  }
}

function positive(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Grams in one unit of `unit`, or null when the context can't express it in weight. */
function gramsPerUnit(unit: PlanUnit, ctx: UnitContext): number | null {
  switch (unit) {
    case "G":
      return 1;
    case "KG":
      return GRAMS_PER_KG;
    case "LB":
      return GRAMS_PER_LB;
    case "OZ":
      return GRAMS_PER_OZ;
    case "EA":
      return positive(ctx.unitWeightGrams);
    case "CASE": {
      const perCase = positive(ctx.unitsPerCase);
      const unitWeight = positive(ctx.unitWeightGrams);
      return perCase && unitWeight ? perCase * unitWeight : null;
    }
    case "BATCH": {
      const batchGrams = positive(ctx.batchGrams);
      if (batchGrams) return batchGrams;
      const batchUnits = positive(ctx.batchUnits);
      const unitWeight = positive(ctx.unitWeightGrams);
      return batchUnits && unitWeight ? batchUnits * unitWeight : null;
    }
  }
}

/** Finished units (EA) in one unit of `unit`, or null when the context can't express it as a count. */
function unitsPerUnit(unit: PlanUnit, ctx: UnitContext): number | null {
  switch (unit) {
    case "EA":
      return 1;
    case "CASE":
      return positive(ctx.unitsPerCase);
    case "BATCH": {
      const batchUnits = positive(ctx.batchUnits);
      if (batchUnits) return batchUnits;
      const batchGrams = positive(ctx.batchGrams);
      const unitWeight = positive(ctx.unitWeightGrams);
      return batchGrams && unitWeight ? batchGrams / unitWeight : null;
    }
    default: {
      const grams = gramsPerUnit(unit, ctx);
      const unitWeight = positive(ctx.unitWeightGrams);
      return grams && unitWeight ? grams / unitWeight : null;
    }
  }
}

function missingFactFor(from: PlanUnit, to: PlanUnit, ctx: UnitContext): string {
  const needsCaseSize =
    (from === "CASE" || to === "CASE") && !positive(ctx.unitsPerCase);
  if (needsCaseSize) return "units per case";
  const crossesCountAndWeight =
    planUnitDimension(from) !== planUnitDimension(to) &&
    (planUnitDimension(from) !== "batch" && planUnitDimension(to) !== "batch");
  if (crossesCountAndWeight && !positive(ctx.unitWeightGrams)) return "unit weight in grams";
  if ((from === "BATCH" || to === "BATCH") && !positive(ctx.batchGrams) && !positive(ctx.batchUnits)) {
    return "batch size";
  }
  return "unit weight in grams";
}

/**
 * Convert a quantity between plan units.
 * Throws PlanUnitError (with a message naming the missing input) when the
 * conversion needs a fact the caller didn't supply.
 */
export function convertPlanQuantity(
  quantity: number,
  from: PlanUnit,
  to: PlanUnit,
  ctx: UnitContext = {},
): number {
  if (from === to) return quantity;

  const fromUnits = unitsPerUnit(from, ctx);
  const toUnits = unitsPerUnit(to, ctx);
  const fromGrams = gramsPerUnit(from, ctx);
  const toGrams = gramsPerUnit(to, ctx);

  // Convert along the axis of the target unit so the result isn't rounded
  // through the other axis (CASE → EA stays whole, EA → G stays exact).
  if (planUnitDimension(to) === "weight") {
    if (fromGrams && toGrams) return (quantity * fromGrams) / toGrams;
    if (fromUnits && toUnits) return (quantity * fromUnits) / toUnits;
  } else {
    if (fromUnits && toUnits) return (quantity * fromUnits) / toUnits;
    if (fromGrams && toGrams) return (quantity * fromGrams) / toGrams;
  }

  throw new PlanUnitError(
    `Can't convert ${from} to ${to} — missing ${missingFactFor(from, to, ctx)}.`,
  );
}

/** Convenience wrapper used by the recipe path, which always plans in grams. */
export function toGrams(quantity: number, unit: PlanUnit, ctx: UnitContext = {}): number {
  return convertPlanQuantity(quantity, unit, "G", ctx);
}

export interface PlanTargetInput {
  /** What the user asked to produce, in their chosen unit. */
  quantity: number;
  /** Extra cushion on top of the target, in percent (ReciPal's "safety margin"). */
  safetyMarginPercent?: number;
  /** Finished goods already on hand, expressed in the same unit as `quantity`. */
  currentInventory?: number;
  /** When true, on-hand finished goods reduce what has to be produced. */
  netOffInventory?: boolean;
}

export interface PlanTargets {
  targetQuantity: number;
  safetyStock: number;
  plannedQuantity: number;
}

/** target + safety margin − on-hand finished goods (never negative). */
export function computePlanTargets(input: PlanTargetInput): PlanTargets {
  const targetQuantity = Math.max(0, input.quantity || 0);
  const marginPct = Math.max(0, input.safetyMarginPercent ?? 0);
  const safetyStock = targetQuantity * (marginPct / 100);
  const onHand = input.netOffInventory ? Math.max(0, input.currentInventory || 0) : 0;
  const plannedQuantity = Math.max(0, targetQuantity + safetyStock - onHand);
  return { targetQuantity, safetyStock, plannedQuantity };
}

/**
 * How many BOM batches the planned quantity represents.
 *
 * BOM component quantities are stated per `batchSize` of `batchUnit` — a recipe
 * synced to a BOM records e.g. 1000 g — so component quantities must be scaled
 * by this multiplier, not by the planned quantity directly.
 */
export function bomBatchMultiplier(input: {
  plannedQuantity: number;
  planUnit: PlanUnit;
  batchSize: number;
  batchUnit: PlanUnit;
  ctx?: UnitContext;
}): number {
  const batchSize = positive(input.batchSize);
  if (!batchSize) return input.plannedQuantity;
  if (input.planUnit === "BATCH") return input.plannedQuantity;
  const inBatchUnit = convertPlanQuantity(
    input.plannedQuantity,
    input.planUnit,
    input.batchUnit,
    input.ctx ?? {},
  );
  return inBatchUnit / batchSize;
}

/** Component quantity for a whole run: per-batch quantity × batches × wastage uplift. */
export function componentRequiredQuantity(input: {
  componentQuantity: number;
  wastagePercent?: number | null;
  batchMultiplier: number;
}): number {
  const qty = input.componentQuantity || 0;
  const wastage = Math.max(0, input.wastagePercent ?? 0) / 100;
  return qty * input.batchMultiplier * (1 + wastage);
}

/**
 * Gross requirement scaled up for expected yield loss: to end up with
 * `quantity` of finished output at 90% yield you have to start 1/0.9 as much.
 */
export function applyYieldLoss(quantity: number, expectedYieldPct: number | null | undefined): number {
  const yieldPct = positive(expectedYieldPct);
  if (!yieldPct || yieldPct >= 1) return quantity;
  return quantity / yieldPct;
}

export interface MaterialShortageInput {
  requiredQuantity: number;
  /** Raw material already in stock. */
  onHand?: number;
  /** Ordered but not yet received. */
  onOrder?: number;
  /** Extra percent added to what we actually buy. */
  orderBufferPercent?: number;
}

export interface MaterialShortage {
  shortageQuantity: number;
  suggestedOrderQuantity: number;
}

/** Net requirement against stock + open POs, then add the purchase buffer. */
export function computeMaterialShortage(input: MaterialShortageInput): MaterialShortage {
  const required = Math.max(0, input.requiredQuantity || 0);
  const onHand = Math.max(0, input.onHand || 0);
  const onOrder = Math.max(0, input.onOrder || 0);
  const shortageQuantity = Math.max(0, required - onHand - onOrder);
  const buffer = Math.max(0, input.orderBufferPercent ?? 0) / 100;
  return {
    shortageQuantity,
    suggestedOrderQuantity: shortageQuantity > 0 ? shortageQuantity * (1 + buffer) : 0,
  };
}

/** Latest date an order can be placed and still arrive by `requiredByDate`. */
export function latestOrderDate(requiredByDate: Date, leadTimeDays: number): Date {
  return new Date(requiredByDate.getTime() - Math.max(0, leadTimeDays) * 24 * 60 * 60 * 1000);
}

/** True when the lead time no longer fits between `from` and `requiredByDate`. */
export function isOrderUrgent(from: Date, requiredByDate: Date, leadTimeDays: number): boolean {
  const daysAvailable = (requiredByDate.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, leadTimeDays) > daysAvailable;
}
