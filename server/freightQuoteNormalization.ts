/**
 * Freight Quote Normalization
 *
 * Puts carrier quotes on one comparable basis before they are ranked. This is
 * the freight counterpart to `server/quoteNormalization.ts`, and it is
 * deterministic for the same reason: an award decision has to be defensible
 * from stored numbers, not from a model's recollection of them.
 *
 *   landed total = freight + surcharges the carrier quoted
 *                + allowances for legs the carrier's service scope excludes
 *                + insurance on declared value where the carrier does not carry it
 *                → converted to the RFQ's base currency at a dated FX rate
 *
 * Two freight-specific axes have no vendor-quote analogue:
 *
 *   Chargeable weight — carriers bill on max(actual, volumetric). A carrier
 *   quoting per-kg against actual weight on a light, bulky shipment is quoting
 *   a number that will not survive first tender. `costPerChargeableKg` divides
 *   by the weight that will actually be billed.
 *
 *   Service scope — port-to-port against door-to-door is the freight version of
 *   EXW against DDP. Missing legs are priced from RFQ allowances, or flagged as
 *   understating cost when no allowance is configured.
 *
 * As on the vendor side, two refusals are deliberate: a quote whose currency has
 * no rate on file is marked not-comparable and excluded from ranking rather than
 * compared as though it were already in base currency; and an unfunded scope gap
 * is reported rather than guessed at.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/connection";
import { freightQuotes, freightRfqs, freightCarriers } from "../drizzle/schema";
import { currencyOr, getFxRateTable, type FxRate } from "./currencyService";

// ─── Service scope ─────────────────────────────────────────────────────

export const SERVICE_SCOPES = [
  "port_to_port",
  "door_to_port",
  "port_to_door",
  "door_to_door",
] as const;
export type ServiceScope = (typeof SERVICE_SCOPES)[number];

/** Which legs of the move a given service scope includes. */
export interface ScopeCoverage {
  originHaulage: boolean;
  mainCarriage: boolean;
  destinationHaulage: boolean;
}

export const SCOPE_COVERAGE: Record<ServiceScope, ScopeCoverage> = {
  port_to_port: { originHaulage: false, mainCarriage: true, destinationHaulage: false },
  door_to_port: { originHaulage: true, mainCarriage: true, destinationHaulage: false },
  port_to_door: { originHaulage: false, mainCarriage: true, destinationHaulage: true },
  door_to_door: { originHaulage: true, mainCarriage: true, destinationHaulage: true },
};

export const DEFAULT_TARGET_SCOPE: ServiceScope = "door_to_door";

const SCOPE_LABELS: Record<keyof ScopeCoverage, string> = {
  originHaulage: "Origin haulage / export pickup",
  mainCarriage: "Main carriage",
  destinationHaulage: "Destination haulage / final delivery",
};

/**
 * Accept the many ways a carrier writes a scope: "Port to Port", "P2P",
 * "CY/CY", "door-to-door", "DTD". Returns null when unrecognised — the caller
 * warns rather than assuming the most favourable reading.
 */
export function parseServiceScope(raw: string | null | undefined): ServiceScope | null {
  if (!raw) return null;
  const t = String(raw).toLowerCase().replace(/[\s_\-/]+/g, "");

  if (/^(d2d|dtd|doortodoor)$/.test(t)) return "door_to_door";
  if (/^(p2p|ptp|porttoport|cycy|cfscfs)$/.test(t)) return "port_to_port";
  if (/^(d2p|dtp|doortoport|cycfs)$/.test(t)) return "door_to_port";
  if (/^(p2d|ptd|porttodoor|cfscy)$/.test(t)) return "port_to_door";

  // Fall back to substring matching for free-text like "door to door service".
  const hasDoorOrigin = /^door/.test(t);
  const hasDoorDest = /door$/.test(t);
  if (hasDoorOrigin && hasDoorDest) return "door_to_door";
  if (hasDoorOrigin) return "door_to_port";
  if (hasDoorDest) return "port_to_door";
  if (t.includes("porttoport")) return "port_to_port";
  return null;
}

/** Legs the target scope requires that the quoted scope does not include. */
export function scopeGaps(
  quoted: ServiceScope | null,
  target: ServiceScope,
): (keyof ScopeCoverage)[] {
  const targetCoverage = SCOPE_COVERAGE[target];
  // An unparsed scope is treated as covering only main carriage: the
  // conservative reading, so gaps surface instead of being silently assumed away.
  const quotedCoverage = quoted
    ? SCOPE_COVERAGE[quoted]
    : { originHaulage: false, mainCarriage: true, destinationHaulage: false };

  return (Object.keys(targetCoverage) as (keyof ScopeCoverage)[]).filter(
    leg => targetCoverage[leg] && !quotedCoverage[leg],
  );
}

// ─── Chargeable weight ─────────────────────────────────────────────────

/**
 * Kilograms billed per cubic metre, by mode. These are the standard industry
 * divisors: IATA air is 6000 cm³/kg (167 kg/CBM), LCL sea bills on W/M where a
 * revenue ton is 1 CBM or 1000 kg, express couriers use 5000 cm³/kg (200 kg/CBM),
 * and European road groupage conventionally bills 333 kg/CBM.
 *
 * FCL and rail are priced per container/wagon rather than by weight, so no
 * divisor applies — `null` suppresses the volumetric comparison entirely.
 */
export const MODE_DIM_FACTORS: Record<string, number | null> = {
  air: 167,
  express: 200,
  ocean_lcl: 1000,
  ocean_fcl: null,
  ground: 333,
  rail: null,
  any: null,
};

export function dimFactorForMode(mode: string | null | undefined): number | null {
  if (!mode) return null;
  const key = String(mode).toLowerCase().trim();
  return key in MODE_DIM_FACTORS ? MODE_DIM_FACTORS[key] : null;
}

export interface ChargeableWeight {
  actualKg: number | null;
  volumetricKg: number | null;
  /** The weight that will actually be billed: the greater of the two. */
  chargeableKg: number | null;
  /** Which measure governs, for display. */
  governedBy: "actual" | "volumetric" | "unknown";
  dimFactor: number | null;
}

/**
 * Chargeable weight is max(actual, volumetric). When no divisor applies (FCL,
 * rail) or volume is unknown, actual weight stands alone.
 */
export function computeChargeableWeight(
  weightKg: number | null,
  volumeCbm: number | null,
  dimFactor: number | null,
): ChargeableWeight {
  const volumetricKg =
    dimFactor !== null && dimFactor > 0 && volumeCbm !== null && volumeCbm > 0
      ? volumeCbm * dimFactor
      : null;

  if (weightKg === null && volumetricKg === null) {
    return { actualKg: weightKg, volumetricKg, chargeableKg: null, governedBy: "unknown", dimFactor };
  }
  if (volumetricKg === null) {
    return { actualKg: weightKg, volumetricKg, chargeableKg: weightKg, governedBy: "actual", dimFactor };
  }
  if (weightKg === null) {
    return {
      actualKg: weightKg,
      volumetricKg,
      chargeableKg: volumetricKg,
      governedBy: "volumetric",
      dimFactor,
    };
  }
  return {
    actualKg: weightKg,
    volumetricKg,
    chargeableKg: Math.max(weightKg, volumetricKg),
    governedBy: volumetricKg > weightKg ? "volumetric" : "actual",
    dimFactor,
  };
}

// ─── Types ─────────────────────────────────────────────────────────────

export type FreightWarningCode =
  | "fx_rate_unavailable"
  | "missing_freight_cost"
  | "scope_missing"
  | "scope_unparsed"
  | "scope_gap_unpriced"
  | "total_disagrees_with_components"
  | "volumetric_governs"
  | "chargeable_weight_unknown"
  | "carrier_chargeable_weight_differs"
  | "insurance_not_carried"
  | "quote_expired"
  | "transit_exceeds_requirement";

export interface FreightWarning {
  code: FreightWarningCode;
  message: string;
  /** true when the warning means the landed cost understates the real cost. */
  understatesCost?: boolean;
}

export interface FreightBreakdownLine {
  key: string;
  label: string;
  /** Amount in the quote's own currency. */
  amount: number;
  source: "quoted" | "computed" | "allowance";
}

export interface NormalizedFreightQuote {
  quoteId: number;
  carrierId: number;
  carrierName?: string;
  /** false when the quote cannot be put on the common basis (excluded from ranking). */
  comparable: boolean;
  quoteCurrency: string;
  baseCurrency: string;
  fx: FxRate | null;
  chargeableWeight: ChargeableWeight;
  /** Sum of `breakdown`, in the quote's currency. */
  subtotalQuoteCurrency: number;
  /** All-in shipment cost in the RFQ's base currency. */
  landedTotalCost: number | null;
  /** Landed cost per chargeable kg, in base currency. */
  costPerChargeableKg: number | null;
  scope: {
    quoted: ServiceScope | null;
    target: ServiceScope;
    gaps: (keyof ScopeCoverage)[];
    unpricedGaps: (keyof ScopeCoverage)[];
  };
  breakdown: FreightBreakdownLine[];
  warnings: FreightWarning[];
  transitDays: number | null;
  rank: number | null;
}

/** The RFQ-side comparison basis. */
export interface FreightNormalizationBasis {
  baseCurrency: string;
  targetScope: ServiceScope;
  weightKg: number | null;
  volumeCbm: number | null;
  declaredValue: number | null;
  dimFactor: number | null;
  originHaulageAllowance: number | null;
  destinationHaulageAllowance: number | null;
  customsClearanceAllowance: number | null;
  insuranceRatePct: number | null;
  insuranceRequired: boolean;
  customsClearanceRequired: boolean;
  requiredTransitDays: number | null;
  /** A quoted total this far from the sum of its components is flagged. */
  totalTolerancePct?: number;
}

/** The quote-side inputs, already coerced to numbers. */
export interface FreightNormalizationQuoteInput {
  id: number;
  carrierId: number;
  carrierName?: string;
  currency: string;
  freightCost: number | null;
  fuelSurcharge: number | null;
  originCharges: number | null;
  destinationCharges: number | null;
  customsFees: number | null;
  insuranceCost: number | null;
  otherCharges: number | null;
  totalCost: number | null;
  serviceScope: string | null;
  chargeableWeightKg: number | null;
  transitDays: number | null;
  validUntil: Date | null;
}

// ─── Core computation (pure) ───────────────────────────────────────────

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Put one carrier quote on the common basis. Pure: the FX rate is passed in so
 * this can be unit-tested and so every caller converts with the same dated rate.
 */
export function computeNormalizedFreightQuote(
  quote: FreightNormalizationQuoteInput,
  basis: FreightNormalizationBasis,
  fx: FxRate | null,
  now: Date = new Date(),
): NormalizedFreightQuote {
  const warnings: FreightWarning[] = [];
  const breakdown: FreightBreakdownLine[] = [];
  const quoteCurrency = currencyOr(quote.currency, basis.baseCurrency);

  // ── Chargeable weight ──
  const chargeableWeight = computeChargeableWeight(basis.weightKg, basis.volumeCbm, basis.dimFactor);
  if (chargeableWeight.chargeableKg === null) {
    warnings.push({
      code: "chargeable_weight_unknown",
      message:
        "RFQ has no usable weight or volume, so cost per chargeable kg cannot be derived. " +
        "Landed totals are still comparable.",
    });
  } else if (chargeableWeight.governedBy === "volumetric") {
    warnings.push({
      code: "volumetric_governs",
      message:
        `Volumetric weight ${round(chargeableWeight.volumetricKg as number, 1)} kg ` +
        `(${basis.volumeCbm} CBM at ${chargeableWeight.dimFactor} kg/CBM) exceeds actual ` +
        `${basis.weightKg} kg, so billing is on volume. Per-kg rates quoted against actual ` +
        `weight will re-rate upward at tender.`,
    });
  }

  // A carrier stating a chargeable weight materially below the computed one has
  // either used a different divisor or measured differently. Worth surfacing:
  // it is the most common source of a quote that grows after booking.
  if (
    quote.chargeableWeightKg !== null &&
    chargeableWeight.chargeableKg !== null &&
    chargeableWeight.chargeableKg > 0
  ) {
    const drift =
      Math.abs(quote.chargeableWeightKg - chargeableWeight.chargeableKg) /
      chargeableWeight.chargeableKg;
    if (drift > 0.02) {
      warnings.push({
        code: "carrier_chargeable_weight_differs",
        message:
          `Carrier states ${quote.chargeableWeightKg} chargeable kg against a computed ` +
          `${round(chargeableWeight.chargeableKg, 1)} kg. Confirm the divisor before awarding.`,
        understatesCost: quote.chargeableWeightKg < chargeableWeight.chargeableKg,
      });
    }
  }

  // ── Quoted charges ──
  if (quote.freightCost === null && quote.totalCost === null) {
    warnings.push({
      code: "missing_freight_cost",
      message: "No freight cost or total on this quote.",
      understatesCost: true,
    });
  }

  const quotedCharges: Array<[string, string, number | null]> = [
    ["freight", "Base freight (quoted)", quote.freightCost],
    ["fuel", "Fuel surcharge (quoted)", quote.fuelSurcharge],
    ["origin", "Origin charges (quoted)", quote.originCharges],
    ["destination", "Destination charges (quoted)", quote.destinationCharges],
    ["customs", "Customs / clearance (quoted)", quote.customsFees],
    ["insurance", "Insurance (quoted)", quote.insuranceCost],
    ["other", "Other charges (quoted)", quote.otherCharges],
  ];
  const componentSum = quotedCharges.reduce((sum, [, , amount]) => sum + (amount ?? 0), 0);
  const hasComponents = quotedCharges.some(([, , amount]) => amount !== null);

  if (hasComponents) {
    for (const [key, label, amount] of quotedCharges) {
      if (amount !== null && amount !== 0) {
        breakdown.push({ key, label, amount, source: "quoted" });
      }
    }
    // A headline total above the sum of named components means undisclosed
    // adders. Take the higher figure — the carrier will invoice it — and say so.
    const tolerance = basis.totalTolerancePct ?? 0.01;
    if (
      quote.totalCost !== null &&
      componentSum > 0 &&
      Math.abs(quote.totalCost - componentSum) / componentSum > tolerance
    ) {
      const gap = quote.totalCost - componentSum;
      warnings.push({
        code: "total_disagrees_with_components",
        message:
          `Quoted total ${round(quote.totalCost, 2)} ${quoteCurrency} differs from the sum of ` +
          `named charges ${round(componentSum, 2)}. ` +
          (gap > 0
            ? `The ${round(gap, 2)} difference is carried as an unitemised adder.`
            : `The named charges exceed the quoted total; the itemised figures were used.`),
      });
      if (gap > 0) {
        breakdown.push({
          key: "unitemised",
          label: "Unitemised difference vs quoted total",
          amount: gap,
          source: "computed",
        });
      }
    }
  } else if (quote.totalCost !== null) {
    breakdown.push({
      key: "total",
      label: "Quoted total (not itemised)",
      amount: quote.totalCost,
      source: "quoted",
    });
  }

  // ── Service scope gap allowances ──
  const quotedScope = parseServiceScope(quote.serviceScope);
  if (!quote.serviceScope) {
    warnings.push({
      code: "scope_missing",
      message:
        "No service scope stated. Treated as port-to-port for comparison; " +
        "confirm whether haulage is included.",
    });
  } else if (!quotedScope) {
    warnings.push({
      code: "scope_unparsed",
      message: `Service scope "${quote.serviceScope}" was not recognised. Treated as port-to-port.`,
    });
  }

  const gaps = scopeGaps(quotedScope, basis.targetScope);
  const unpricedGaps: (keyof ScopeCoverage)[] = [];

  const allowanceForLeg: Record<keyof ScopeCoverage, number | null> = {
    originHaulage: basis.originHaulageAllowance,
    // Main carriage has no allowance: a quote that excludes it is not a freight
    // quote, and inventing a number for the largest cost line would be absurd.
    mainCarriage: null,
    destinationHaulage: basis.destinationHaulageAllowance,
  };

  for (const leg of gaps) {
    const allowance = allowanceForLeg[leg];
    // Charges the carrier itemised for a leg mean it is covered in practice
    // even when the scope label says otherwise — do not double-count.
    const alreadyCharged =
      (leg === "originHaulage" && (quote.originCharges ?? 0) > 0) ||
      (leg === "destinationHaulage" && (quote.destinationCharges ?? 0) > 0);
    if (alreadyCharged) continue;

    if (allowance !== null && allowance > 0) {
      breakdown.push({
        key: `allowance_${leg}`,
        label: `${SCOPE_LABELS[leg]} (allowance — not in carrier scope)`,
        amount: allowance,
        source: "allowance",
      });
    } else {
      unpricedGaps.push(leg);
    }
  }

  if (unpricedGaps.length > 0) {
    warnings.push({
      code: "scope_gap_unpriced",
      message:
        `Not covered by the carrier's scope and no allowance configured: ` +
        `${unpricedGaps.map(g => SCOPE_LABELS[g]).join(", ")}. ` +
        `The landed cost understates what this move will actually cost.`,
      understatesCost: true,
    });
  }

  // Customs clearance is a required service on this RFQ but is not part of any
  // scope label — it is charged or it is not.
  if (basis.customsClearanceRequired && (quote.customsFees ?? 0) === 0) {
    if (basis.customsClearanceAllowance !== null && basis.customsClearanceAllowance > 0) {
      breakdown.push({
        key: "allowance_customs",
        label: "Customs clearance (allowance — not quoted)",
        amount: basis.customsClearanceAllowance,
        source: "allowance",
      });
    } else {
      warnings.push({
        code: "scope_gap_unpriced",
        message:
          "Customs clearance is required on this RFQ but is not in the quote and no " +
          "allowance is configured. The landed cost understates the real cost.",
        understatesCost: true,
      });
    }
  }

  // ── Insurance ──
  if (basis.insuranceRequired && (quote.insuranceCost ?? 0) === 0) {
    const rate = basis.insuranceRatePct;
    if (rate !== null && rate > 0 && basis.declaredValue !== null && basis.declaredValue > 0) {
      const premium = basis.declaredValue * (rate / 100);
      breakdown.push({
        key: "allowance_insurance",
        label: `Cargo insurance (allowance — ${rate}% of declared value)`,
        amount: premium,
        source: "allowance",
      });
    } else {
      warnings.push({
        code: "insurance_not_carried",
        message:
          "Insurance is required on this RFQ but is not in the quote, and no rate or " +
          "declared value is configured to estimate it.",
        understatesCost: true,
      });
    }
  }

  // ── Transit and validity ──
  if (
    basis.requiredTransitDays !== null &&
    quote.transitDays !== null &&
    quote.transitDays > basis.requiredTransitDays
  ) {
    warnings.push({
      code: "transit_exceeds_requirement",
      message:
        `Transit of ${quote.transitDays} days misses the ${basis.requiredTransitDays}-day ` +
        `requirement. Cost is still ranked; the schedule miss is not priced.`,
    });
  }

  if (quote.validUntil && quote.validUntil.getTime() < now.getTime()) {
    warnings.push({
      code: "quote_expired",
      message: `Quote validity lapsed on ${quote.validUntil.toISOString().slice(0, 10)}; rates may no longer hold.`,
    });
  }

  const subtotalQuoteCurrency = breakdown.reduce((sum, line) => sum + line.amount, 0);

  // ── FX ──
  let landedTotalCost: number | null = null;
  let costPerChargeableKg: number | null = null;
  let comparable = true;

  if (quoteCurrency === basis.baseCurrency) {
    landedTotalCost = subtotalQuoteCurrency;
  } else if (fx) {
    landedTotalCost = subtotalQuoteCurrency * fx.rate;
  } else {
    comparable = false;
    warnings.push({
      code: "fx_rate_unavailable",
      message:
        `No ${quoteCurrency}->${basis.baseCurrency} rate is on file, so this quote cannot be compared. ` +
        `Add a rate under Currency Rates and re-run normalization.`,
    });
  }

  if (
    landedTotalCost !== null &&
    chargeableWeight.chargeableKg !== null &&
    chargeableWeight.chargeableKg > 0
  ) {
    costPerChargeableKg = landedTotalCost / chargeableWeight.chargeableKg;
  }

  if (breakdown.length === 0) comparable = false;

  return {
    quoteId: quote.id,
    carrierId: quote.carrierId,
    carrierName: quote.carrierName,
    comparable,
    quoteCurrency,
    baseCurrency: basis.baseCurrency,
    fx,
    chargeableWeight: {
      ...chargeableWeight,
      volumetricKg:
        chargeableWeight.volumetricKg === null ? null : round(chargeableWeight.volumetricKg, 3),
      chargeableKg:
        chargeableWeight.chargeableKg === null ? null : round(chargeableWeight.chargeableKg, 3),
    },
    subtotalQuoteCurrency: round(subtotalQuoteCurrency, 6),
    landedTotalCost: landedTotalCost === null ? null : round(landedTotalCost, 2),
    costPerChargeableKg:
      costPerChargeableKg === null ? null : round(costPerChargeableKg, 6),
    scope: {
      quoted: quotedScope,
      target: basis.targetScope,
      gaps,
      unpricedGaps,
    },
    breakdown: breakdown.map(l => ({ ...l, amount: round(l.amount, 6) })),
    warnings,
    transitDays: quote.transitDays,
    rank: null,
  };
}

/** Rank comparable quotes by landed total cost, cheapest first. Mutates and returns. */
export function rankNormalizedFreightQuotes(
  results: NormalizedFreightQuote[],
): NormalizedFreightQuote[] {
  const comparable = results
    .filter(r => r.comparable && r.landedTotalCost !== null)
    .sort((a, b) => (a.landedTotalCost as number) - (b.landedTotalCost as number));
  comparable.forEach((r, i) => {
    r.rank = i + 1;
  });
  for (const r of results) if (!comparable.includes(r)) r.rank = null;
  return results;
}

// ─── Persistence wrapper ───────────────────────────────────────────────

/** Read the comparison basis off a freight RFQ row, applying defaults. */
export function basisFromFreightRfq(rfq: {
  baseCurrency?: unknown;
  currency?: unknown;
  targetServiceScope?: unknown;
  totalWeight?: unknown;
  totalVolume?: unknown;
  declaredValue?: unknown;
  preferredMode?: unknown;
  dimFactorKgPerCbm?: unknown;
  originHaulageAllowance?: unknown;
  destinationHaulageAllowance?: unknown;
  customsClearanceAllowance?: unknown;
  insuranceRatePct?: unknown;
  insuranceRequired?: unknown;
  customsClearanceRequired?: unknown;
  requiredPickupDate?: unknown;
  requiredDeliveryDate?: unknown;
}): FreightNormalizationBasis {
  const targetScope =
    parseServiceScope(rfq.targetServiceScope as string) ?? DEFAULT_TARGET_SCOPE;

  // An explicit divisor on the RFQ wins; otherwise fall back to the mode's
  // industry standard. FCL and rail resolve to null, which disables the
  // volumetric comparison rather than inventing one.
  const explicitDimFactor = num(rfq.dimFactorKgPerCbm);
  const dimFactor =
    explicitDimFactor !== null && explicitDimFactor > 0
      ? explicitDimFactor
      : dimFactorForMode(rfq.preferredMode as string);

  // Transit requirement is only meaningful when both ends of the window are known.
  const pickup = rfq.requiredPickupDate ? new Date(rfq.requiredPickupDate as string) : null;
  const delivery = rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate as string) : null;
  const requiredTransitDays =
    pickup && delivery && !isNaN(pickup.getTime()) && !isNaN(delivery.getTime())
      ? Math.max(0, Math.round((delivery.getTime() - pickup.getTime()) / 86_400_000))
      : null;

  return {
    baseCurrency: currencyOr(
      (rfq.baseCurrency as string) || (rfq.currency as string),
      "USD",
    ),
    targetScope,
    weightKg: num(rfq.totalWeight),
    volumeCbm: num(rfq.totalVolume),
    declaredValue: num(rfq.declaredValue),
    dimFactor,
    originHaulageAllowance: num(rfq.originHaulageAllowance),
    destinationHaulageAllowance: num(rfq.destinationHaulageAllowance),
    customsClearanceAllowance: num(rfq.customsClearanceAllowance),
    insuranceRatePct: num(rfq.insuranceRatePct),
    insuranceRequired: rfq.insuranceRequired === true || rfq.insuranceRequired === 1,
    customsClearanceRequired:
      rfq.customsClearanceRequired === true || rfq.customsClearanceRequired === 1,
    requiredTransitDays,
  };
}

/** Coerce a freightQuotes row into normalizer input. */
export function freightQuoteInputFromRow(
  row: Record<string, unknown>,
  carrier?: { name?: string | null },
): FreightNormalizationQuoteInput {
  return {
    id: row.id as number,
    carrierId: row.carrierId as number,
    carrierName: carrier?.name ?? undefined,
    currency: currencyOr(row.currency as string, "USD"),
    freightCost: num(row.freightCost),
    fuelSurcharge: num(row.fuelSurcharge),
    originCharges: num(row.originCharges),
    destinationCharges: num(row.destinationCharges),
    customsFees: num(row.customsFees),
    insuranceCost: num(row.insuranceCost),
    otherCharges: num(row.otherCharges),
    totalCost: num(row.totalCost),
    serviceScope: (row.serviceScope as string) ?? null,
    chargeableWeightKg: num(row.chargeableWeightKg),
    transitDays: num(row.transitDays),
    validUntil: row.validUntil ? new Date(row.validUntil as string) : null,
  };
}

export interface NormalizeFreightRfqResult {
  rfqId: number;
  basis: FreightNormalizationBasis;
  results: NormalizedFreightQuote[];
  comparableCount: number;
  excludedCount: number;
  bestQuoteId: number | null;
}

/**
 * Normalize and rank every received quote on a freight RFQ, persisting the
 * computed landed costs back onto the quote rows.
 */
export async function normalizeFreightQuotesForRfq(
  rfqId: number,
  options: { statuses?: string[]; persist?: boolean; now?: Date } = {},
): Promise<NormalizeFreightRfqResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const statuses = options.statuses ?? ["received", "under_review", "accepted"];
  const now = options.now ?? new Date();
  const persist = options.persist !== false;

  const rfqRows = await db.select().from(freightRfqs).where(eq(freightRfqs.id, rfqId)).limit(1);
  const rfq = rfqRows[0];
  if (!rfq) throw new Error(`Freight RFQ ${rfqId} not found`);

  const basis = basisFromFreightRfq(rfq as any);

  const quoteRows = await db
    .select()
    .from(freightQuotes)
    .where(and(eq(freightQuotes.rfqId, rfqId), inArray(freightQuotes.status, statuses as any)));

  if (quoteRows.length === 0) {
    return { rfqId, basis, results: [], comparableCount: 0, excludedCount: 0, bestQuoteId: null };
  }

  // Batch-load carriers for names, avoiding an N+1 per quote.
  const carrierIds = Array.from(new Set(quoteRows.map(q => q.carrierId).filter(Boolean)));
  const carrierRows = carrierIds.length
    ? await db.select().from(freightCarriers).where(inArray(freightCarriers.id, carrierIds))
    : [];
  const carrierById = new Map(carrierRows.map(c => [c.id, c]));

  const inputs = quoteRows.map(row =>
    freightQuoteInputFromRow(row as any, carrierById.get(row.carrierId) as any),
  );

  // One FX lookup per distinct currency, dated to "now" for the whole run so
  // every quote in the comparison uses the same rate snapshot.
  const fxTable = await getFxRateTable(inputs.map(i => i.currency), basis.baseCurrency, now);

  const results = inputs.map(input =>
    computeNormalizedFreightQuote(input, basis, fxTable.get(input.currency) ?? null, now),
  );
  rankNormalizedFreightQuotes(results);

  if (persist) {
    await Promise.all(
      results.map(r =>
        db
          .update(freightQuotes)
          .set({
            normalizedCurrency: r.baseCurrency,
            fxRate: r.fx ? r.fx.rate.toString() : null,
            fxRateAsOf: r.fx ? r.fx.asOf : null,
            fxRateSource: r.fx ? `${r.fx.source}:${r.fx.provider}`.slice(0, 64) : null,
            landedTotalCost: r.landedTotalCost !== null ? r.landedTotalCost.toString() : null,
            costPerChargeableKg:
              r.costPerChargeableKg !== null ? r.costPerChargeableKg.toString() : null,
            computedChargeableWeightKg:
              r.chargeableWeight.chargeableKg !== null
                ? r.chargeableWeight.chargeableKg.toString()
                : null,
            normalizationBreakdown: JSON.stringify(r.breakdown),
            normalizationWarnings: JSON.stringify(r.warnings),
            normalizedRank: r.rank,
            normalizedAt: now,
          })
          .where(eq(freightQuotes.id, r.quoteId)),
      ),
    );
  }

  const comparable = results.filter(r => r.comparable && r.landedTotalCost !== null);
  return {
    rfqId,
    basis,
    results,
    comparableCount: comparable.length,
    excludedCount: results.length - comparable.length,
    bestQuoteId: comparable.find(r => r.rank === 1)?.quoteId ?? null,
  };
}
