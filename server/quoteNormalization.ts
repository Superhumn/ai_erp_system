/**
 * Vendor Quote Normalization
 *
 * Puts every quote on an RFQ onto one comparable basis before anything ranks
 * them. This is deliberately deterministic arithmetic — no LLM — so a buyer can
 * defend an award decision line by line:
 *
 *   landed total = goods (at billable qty)
 *                + charges the vendor quoted (shipping, handling, tax, other,
 *                  insurance, duty)
 *                + allowances for the cost buckets the vendor's Incoterm does
 *                  NOT cover but the RFQ's target Incoterm requires
 *                + tooling / NRE amortized over the agreed program volume
 *                → converted into the RFQ's base currency at a dated FX rate
 *
 * `landedUnitCost` divides that total by the quantity the RFQ actually needs,
 * so a vendor whose MOQ forces an over-buy carries that penalty in its unit cost.
 *
 * Anything we cannot price honestly becomes a warning and — where it would make
 * the comparison meaningless, such as a missing FX rate — marks the quote
 * `comparable: false` so it is excluded from ranking instead of being silently
 * compared as if the numbers were in the same currency.
 *
 * The AI bid-leveling pass (`vendorQuotes.quotes.levelBids`) consumes these
 * numbers rather than inventing its own; it narrates scope deviations on top.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/connection";
import { vendorQuotes, vendorRfqs, vendors } from "../drizzle/schema";
import {
  DEFAULT_BASE_CURRENCY,
  currencyOr,
  getFxRateTable,
  type FxRate,
} from "./currencyService";

// ─── Incoterms ─────────────────────────────────────────────────────────

export const INCOTERM_CODES = [
  "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP",
] as const;
export type IncotermCode = (typeof INCOTERM_CODES)[number];

/** Cost buckets an Incoterm allocates between seller and buyer. */
export interface IncotermCoverage {
  /** Export licences/formalities and getting goods to the origin carrier. */
  originHandling: boolean;
  /** Main international carriage to the destination country. */
  mainCarriage: boolean;
  /** Cargo insurance for the main carriage. */
  insurance: boolean;
  /** Import clearance, duties and import taxes. */
  importClearance: boolean;
  /** Inland delivery to the named destination place. */
  destinationDelivery: boolean;
}

const NO_COVERAGE: IncotermCoverage = {
  originHandling: false,
  mainCarriage: false,
  insurance: false,
  importClearance: false,
  destinationDelivery: false,
};

/** Incoterms 2020 seller obligations, reduced to the buckets we price. */
export const INCOTERM_COVERAGE: Record<IncotermCode, IncotermCoverage> = {
  EXW: { ...NO_COVERAGE },
  FCA: { ...NO_COVERAGE, originHandling: true },
  FAS: { ...NO_COVERAGE, originHandling: true },
  FOB: { ...NO_COVERAGE, originHandling: true },
  CFR: { ...NO_COVERAGE, originHandling: true, mainCarriage: true },
  CPT: { ...NO_COVERAGE, originHandling: true, mainCarriage: true },
  CIF: { ...NO_COVERAGE, originHandling: true, mainCarriage: true, insurance: true },
  CIP: { ...NO_COVERAGE, originHandling: true, mainCarriage: true, insurance: true },
  DAP: { originHandling: true, mainCarriage: true, insurance: false, importClearance: false, destinationDelivery: true },
  DPU: { originHandling: true, mainCarriage: true, insurance: false, importClearance: false, destinationDelivery: true },
  DDP: { originHandling: true, mainCarriage: true, insurance: true, importClearance: true, destinationDelivery: true },
};

/** The basis quotes are leveled to when an RFQ does not name one: delivered, duty paid. */
export const DEFAULT_TARGET_INCOTERM: IncotermCode = "DDP";

const INCOTERM_LABELS: Record<keyof IncotermCoverage, string> = {
  originHandling: "origin handling & export clearance",
  mainCarriage: "main carriage freight",
  insurance: "cargo insurance",
  importClearance: "import duty & clearance",
  destinationDelivery: "delivery to destination",
};

/** Parse "FOB Ningbo", "ddp", "CIF/Long Beach" into a code plus named place. */
export function parseIncoterm(raw: string | null | undefined): {
  code: IncotermCode | null;
  namedPlace: string | null;
} {
  if (!raw) return { code: null, namedPlace: null };
  const cleaned = String(raw).trim().toUpperCase().replace(/[/,]/g, " ");
  const match = cleaned.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/);
  if (!match) return { code: null, namedPlace: null };
  const code = match[1] as IncotermCode;
  const rest = cleaned.slice(match.index! + code.length).trim();
  return { code, namedPlace: rest ? toTitleCase(rest) : null };
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Buckets the target basis requires that the quoted basis leaves with the buyer. */
export function incotermGaps(
  quoted: IncotermCode,
  target: IncotermCode,
): (keyof IncotermCoverage)[] {
  const q = INCOTERM_COVERAGE[quoted];
  const t = INCOTERM_COVERAGE[target];
  return (Object.keys(t) as (keyof IncotermCoverage)[]).filter(k => t[k] && !q[k]);
}

// ─── Types ─────────────────────────────────────────────────────────────

export type NormalizationWarningCode =
  | "fx_rate_unavailable"
  | "missing_unit_price"
  | "missing_quantity"
  | "quantity_basis_mismatch"
  | "moq_above_requirement"
  | "incoterm_missing"
  | "incoterm_unparsed"
  | "incoterm_gap_unpriced"
  | "tooling_amortized_over_order_only"
  | "refundable_tooling_excluded"
  | "quote_expired";

export interface NormalizationWarning {
  code: NormalizationWarningCode;
  message: string;
  /** true when the warning means the landed cost understates the real cost. */
  understatesCost?: boolean;
}

export interface BreakdownLine {
  key: string;
  label: string;
  /** Amount in the quote's own currency. */
  amount: number;
  /** Where the number came from, for audit. */
  source: "quoted" | "computed" | "allowance";
}

export interface NormalizedQuote {
  quoteId: number;
  vendorId: number;
  vendorName?: string;
  /** false when the quote cannot be put on the common basis (excluded from ranking). */
  comparable: boolean;
  quoteCurrency: string;
  baseCurrency: string;
  fx: FxRate | null;
  requiredQuantity: number;
  billableQuantity: number;
  moqShortfallUnits: number;
  unitPrice: number | null;
  toolingPerUnit: number;
  /** Sum of `breakdown`, in the quote's currency. */
  subtotalQuoteCurrency: number;
  /** Landed total for the RFQ quantity, in the RFQ's base currency. */
  landedTotalCost: number | null;
  /** Landed cost per unit the RFQ actually needs, in base currency. */
  landedUnitCost: number | null;
  incoterms: {
    quoted: IncotermCode | null;
    target: IncotermCode;
    namedPlace: string | null;
    gaps: (keyof IncotermCoverage)[];
    unpricedGaps: (keyof IncotermCoverage)[];
  };
  breakdown: BreakdownLine[];
  warnings: NormalizationWarning[];
  leadTimeDays: number | null;
  rank: number | null;
}

/** The RFQ-side comparison basis. */
export interface NormalizationBasis {
  requiredQuantity: number;
  baseCurrency: string;
  targetIncoterm: IncotermCode;
  freightAllowancePerUnit: number | null;
  freightAllowancePct: number | null;
  dutyRatePct: number | null;
  insuranceRatePct: number | null;
  amortizeToolingOverUnits: number | null;
  /** Charges quoted for a different quantity are flagged beyond this drift. */
  quantityDriftTolerance?: number;
}

/** The quote-side inputs, already coerced to numbers. */
export interface NormalizationQuoteInput {
  id: number;
  vendorId: number;
  vendorName?: string;
  currency: string;
  unitPrice: number | null;
  quantity: number | null;
  totalPrice: number | null;
  shippingCost: number | null;
  handlingFee: number | null;
  taxAmount: number | null;
  otherCharges: number | null;
  insuranceCost: number | null;
  customsDutyAmount: number | null;
  minimumOrderQty: number | null;
  toolingCost: number | null;
  toolingAmortizationUnits: number | null;
  toolingIsRefundable: boolean;
  incoterms: string | null;
  leadTimeDays: number | null;
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
 * Put one quote on the common basis. Pure: the FX rate is passed in so this can
 * be unit-tested and so every caller converts with the same dated rate.
 */
export function computeNormalizedQuote(
  quote: NormalizationQuoteInput,
  basis: NormalizationBasis,
  fx: FxRate | null,
  now: Date = new Date(),
): NormalizedQuote {
  const warnings: NormalizationWarning[] = [];
  const breakdown: BreakdownLine[] = [];
  const quoteCurrency = currencyOr(quote.currency, basis.baseCurrency);

  // ── Quantity basis: MOQ can force us to buy more than we need ──
  const requiredQuantity = basis.requiredQuantity > 0 ? basis.requiredQuantity : 0;
  if (requiredQuantity <= 0) {
    warnings.push({
      code: "missing_quantity",
      message: "RFQ has no usable quantity, so per-unit costs cannot be derived.",
    });
  }
  const moq = quote.minimumOrderQty ?? 0;
  const billableQuantity = Math.max(requiredQuantity, moq > 0 ? moq : 0);
  const moqShortfallUnits = Math.max(0, billableQuantity - requiredQuantity);
  if (moqShortfallUnits > 0) {
    warnings.push({
      code: "moq_above_requirement",
      message:
        `Minimum order quantity ${moq} exceeds the required ${requiredQuantity}; ` +
        `${round(moqShortfallUnits, 4)} surplus units are priced into the landed cost.`,
    });
  }

  // ── Goods value ──
  let unitPrice = quote.unitPrice;
  if (unitPrice === null) {
    // Fall back to the quoted total spread over the quantity it covered.
    const basisQty = quote.quantity ?? requiredQuantity;
    if (quote.totalPrice !== null && basisQty > 0) {
      unitPrice = quote.totalPrice / basisQty;
      warnings.push({
        code: "missing_unit_price",
        message: `No unit price quoted; derived ${round(unitPrice, 6)} ${quoteCurrency} from the quoted total over ${basisQty} units.`,
      });
    } else {
      warnings.push({
        code: "missing_unit_price",
        message: "No unit price or usable total price on this quote.",
        understatesCost: true,
      });
    }
  }

  const goodsValue = unitPrice !== null ? unitPrice * billableQuantity : 0;
  breakdown.push({
    key: "goods",
    label: `Goods (${round(billableQuantity, 4)} units${moqShortfallUnits > 0 ? ", incl. MOQ surplus" : ""})`,
    amount: goodsValue,
    source: unitPrice !== null && quote.unitPrice !== null ? "quoted" : "computed",
  });

  // Ancillary charges are treated as per-shipment amounts, not scaled with
  // quantity. Flag when the vendor priced a materially different quantity so
  // the buyer knows the adders were taken as quoted.
  const tolerance = basis.quantityDriftTolerance ?? 0.05;
  if (
    quote.quantity !== null &&
    quote.quantity > 0 &&
    billableQuantity > 0 &&
    Math.abs(quote.quantity - billableQuantity) / billableQuantity > tolerance
  ) {
    warnings.push({
      code: "quantity_basis_mismatch",
      message:
        `Vendor quoted ${quote.quantity} units against a billable basis of ${round(billableQuantity, 4)}. ` +
        `Goods were re-priced at the billable quantity; shipping, handling, tax and other charges were taken as quoted.`,
    });
  }

  const quotedCharges: Array<[string, string, number | null]> = [
    ["shipping", "Shipping (quoted)", quote.shippingCost],
    ["handling", "Handling (quoted)", quote.handlingFee],
    ["insurance", "Insurance (quoted)", quote.insuranceCost],
    ["duty", "Customs duty (quoted)", quote.customsDutyAmount],
    ["tax", "Tax (quoted)", quote.taxAmount],
    ["other", "Other charges (quoted)", quote.otherCharges],
  ];
  for (const [key, label, amount] of quotedCharges) {
    if (amount !== null && amount !== 0) {
      breakdown.push({ key, label, amount, source: "quoted" });
    }
  }
  const quotedShipping = quote.shippingCost ?? 0;
  const quotedInsurance = quote.insuranceCost ?? 0;
  const quotedDuty = quote.customsDutyAmount ?? 0;

  // ── Incoterm gap allowances ──
  const parsed = parseIncoterm(quote.incoterms);
  const quotedIncoterm = parsed.code;
  if (!quote.incoterms) {
    warnings.push({
      code: "incoterm_missing",
      message: `Quote states no Incoterm; assumed ${basis.targetIncoterm} (the RFQ basis), so no delivery allowance was added.`,
      understatesCost: true,
    });
  } else if (!quotedIncoterm) {
    warnings.push({
      code: "incoterm_unparsed",
      message: `Could not read "${quote.incoterms}" as an Incoterm; assumed ${basis.targetIncoterm}, so no delivery allowance was added.`,
      understatesCost: true,
    });
  }

  const effectiveIncoterm = quotedIncoterm ?? basis.targetIncoterm;
  const gaps = incotermGaps(effectiveIncoterm, basis.targetIncoterm);
  const unpricedGaps: (keyof IncotermCoverage)[] = [];

  // Logistics buckets are filled by one door-to-door freight allowance: buyers
  // configure a single rate rather than a rate per leg.
  const logisticsGaps = gaps.filter(
    g => g === "originHandling" || g === "mainCarriage" || g === "destinationDelivery",
  );
  let freightAllowance = 0;
  if (logisticsGaps.length > 0) {
    if (quotedShipping > 0) {
      // The vendor already priced freight explicitly; that line stands in for
      // the gap rather than double-charging an allowance on top of it.
      breakdown.push({
        key: "freight_gap_covered",
        label: `Freight gap under ${effectiveIncoterm} covered by the quoted shipping line`,
        amount: 0,
        source: "computed",
      });
    } else if (basis.freightAllowancePerUnit !== null) {
      freightAllowance = basis.freightAllowancePerUnit * billableQuantity;
    } else if (basis.freightAllowancePct !== null) {
      freightAllowance = (basis.freightAllowancePct / 100) * goodsValue;
    } else {
      unpricedGaps.push(...logisticsGaps);
    }
    if (freightAllowance > 0) {
      breakdown.push({
        key: "freight_allowance",
        label: `Freight allowance (${logisticsGaps.map(g => INCOTERM_LABELS[g]).join(", ")} not covered by ${effectiveIncoterm})`,
        amount: freightAllowance,
        source: "allowance",
      });
    }
  }

  const freightBasis = quotedShipping + freightAllowance;

  // Insurance gap: rated on goods + freight, the usual CIF basis.
  let insuranceAllowance = 0;
  if (gaps.includes("insurance") && quotedInsurance === 0) {
    if (basis.insuranceRatePct !== null) {
      insuranceAllowance = (basis.insuranceRatePct / 100) * (goodsValue + freightBasis);
      breakdown.push({
        key: "insurance_allowance",
        label: `Cargo insurance allowance (${basis.insuranceRatePct}% of goods + freight, not covered by ${effectiveIncoterm})`,
        amount: insuranceAllowance,
        source: "allowance",
      });
    } else {
      unpricedGaps.push("insurance");
    }
  }

  // Duty gap: rated on goods + freight + insurance.
  let dutyAllowance = 0;
  if (gaps.includes("importClearance") && quotedDuty === 0) {
    if (basis.dutyRatePct !== null) {
      dutyAllowance =
        (basis.dutyRatePct / 100) * (goodsValue + freightBasis + quotedInsurance + insuranceAllowance);
      breakdown.push({
        key: "duty_allowance",
        label: `Import duty allowance (${basis.dutyRatePct}% of CIF value, not covered by ${effectiveIncoterm})`,
        amount: dutyAllowance,
        source: "allowance",
      });
    } else {
      unpricedGaps.push("importClearance");
    }
  }

  if (unpricedGaps.length > 0) {
    warnings.push({
      code: "incoterm_gap_unpriced",
      message:
        `${effectiveIncoterm} leaves ${unpricedGaps.map(g => INCOTERM_LABELS[g]).join(", ")} with the buyer, ` +
        `but the RFQ configures no allowance rate for it. The landed cost below excludes that spend.`,
      understatesCost: true,
    });
  }

  // ── Tooling / NRE amortization ──
  let toolingPerUnit = 0;
  let toolingCharge = 0;
  const toolingCost = quote.toolingCost ?? 0;
  if (toolingCost > 0) {
    if (quote.toolingIsRefundable) {
      warnings.push({
        code: "refundable_tooling_excluded",
        message: `Tooling of ${toolingCost} ${quoteCurrency} is marked refundable and is excluded from landed cost (it remains a cash-flow commitment).`,
      });
      breakdown.push({
        key: "tooling_refundable",
        label: `Refundable tooling / NRE (excluded from landed cost)`,
        amount: 0,
        source: "computed",
      });
    } else {
      const explicitUnits = quote.toolingAmortizationUnits ?? basis.amortizeToolingOverUnits;
      const amortUnits = explicitUnits && explicitUnits > 0 ? explicitUnits : billableQuantity;
      if (!explicitUnits || explicitUnits <= 0) {
        warnings.push({
          code: "tooling_amortized_over_order_only",
          message:
            `No program volume set for tooling amortization; ${toolingCost} ${quoteCurrency} was amortized over this order's ` +
            `${round(billableQuantity, 4)} units alone, which overstates unit cost if the tooling serves future orders.`,
        });
      }
      if (amortUnits > 0) {
        toolingPerUnit = toolingCost / amortUnits;
        toolingCharge = toolingPerUnit * billableQuantity;
        breakdown.push({
          key: "tooling",
          label: `Tooling / NRE amortized (${toolingCost} over ${round(amortUnits, 4)} units)`,
          amount: toolingCharge,
          source: "computed",
        });
      }
    }
  }

  // ── Validity ──
  if (quote.validUntil && quote.validUntil.getTime() < now.getTime()) {
    warnings.push({
      code: "quote_expired",
      message: `Quote validity lapsed on ${quote.validUntil.toISOString().slice(0, 10)}; pricing may no longer hold.`,
    });
  }

  const subtotalQuoteCurrency = breakdown.reduce((sum, line) => sum + line.amount, 0);

  // ── FX ──
  let landedTotalCost: number | null = null;
  let landedUnitCost: number | null = null;
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

  if (landedTotalCost !== null && requiredQuantity > 0) {
    landedUnitCost = landedTotalCost / requiredQuantity;
  }
  if (unitPrice === null) comparable = false;

  return {
    quoteId: quote.id,
    vendorId: quote.vendorId,
    vendorName: quote.vendorName,
    comparable,
    quoteCurrency,
    baseCurrency: basis.baseCurrency,
    fx,
    requiredQuantity,
    billableQuantity,
    moqShortfallUnits,
    unitPrice,
    toolingPerUnit,
    subtotalQuoteCurrency: round(subtotalQuoteCurrency, 6),
    landedTotalCost: landedTotalCost === null ? null : round(landedTotalCost, 2),
    landedUnitCost: landedUnitCost === null ? null : round(landedUnitCost, 6),
    incoterms: {
      quoted: quotedIncoterm,
      target: basis.targetIncoterm,
      namedPlace: parsed.namedPlace,
      gaps,
      unpricedGaps,
    },
    breakdown: breakdown.map(l => ({ ...l, amount: round(l.amount, 6) })),
    warnings,
    leadTimeDays: quote.leadTimeDays,
    rank: null,
  };
}

/** Rank comparable quotes by landed total cost, cheapest first. Mutates and returns. */
export function rankNormalizedQuotes(results: NormalizedQuote[]): NormalizedQuote[] {
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

/** Read the comparison basis off an RFQ row, applying defaults. */
export function basisFromRfq(rfq: {
  quantity: unknown;
  baseCurrency?: unknown;
  targetIncoterms?: unknown;
  incoterms?: unknown;
  freightAllowancePerUnit?: unknown;
  freightAllowancePct?: unknown;
  dutyRatePct?: unknown;
  insuranceRatePct?: unknown;
  amortizeToolingOverUnits?: unknown;
}): NormalizationBasis {
  const target =
    parseIncoterm(rfq.targetIncoterms as string).code ??
    parseIncoterm(rfq.incoterms as string).code ??
    DEFAULT_TARGET_INCOTERM;
  return {
    requiredQuantity: num(rfq.quantity) ?? 0,
    baseCurrency: currencyOr(rfq.baseCurrency as string, DEFAULT_BASE_CURRENCY),
    targetIncoterm: target,
    freightAllowancePerUnit: num(rfq.freightAllowancePerUnit),
    freightAllowancePct: num(rfq.freightAllowancePct),
    dutyRatePct: num(rfq.dutyRatePct),
    insuranceRatePct: num(rfq.insuranceRatePct),
    amortizeToolingOverUnits: num(rfq.amortizeToolingOverUnits),
  };
}

/** Map a stored quote row (+ its vendor) into normalization inputs. */
export function quoteInputFromRow(
  row: Record<string, any>,
  vendor?: { name?: string | null; defaultCurrency?: string | null; defaultIncoterms?: string | null },
): NormalizationQuoteInput {
  return {
    id: row.id,
    vendorId: row.vendorId,
    vendorName: vendor?.name ?? undefined,
    currency: currencyOr(row.currency ?? vendor?.defaultCurrency, DEFAULT_BASE_CURRENCY),
    unitPrice: num(row.unitPrice),
    quantity: num(row.quantity),
    totalPrice: num(row.totalPrice),
    shippingCost: num(row.shippingCost),
    handlingFee: num(row.handlingFee),
    taxAmount: num(row.taxAmount),
    otherCharges: num(row.otherCharges),
    insuranceCost: num(row.insuranceCost),
    customsDutyAmount: num(row.customsDutyAmount),
    minimumOrderQty: num(row.minimumOrderQty),
    toolingCost: num(row.toolingCost),
    toolingAmortizationUnits: num(row.toolingAmortizationUnits),
    toolingIsRefundable: !!row.toolingIsRefundable,
    incoterms: row.incoterms ?? vendor?.defaultIncoterms ?? null,
    leadTimeDays: num(row.leadTimeDays),
    validUntil: row.validUntil ? new Date(row.validUntil) : null,
  };
}

export interface NormalizeRfqResult {
  rfqId: number;
  basis: NormalizationBasis;
  results: NormalizedQuote[];
  comparableCount: number;
  excludedCount: number;
  bestQuoteId: number | null;
}

/**
 * Normalize and rank every received quote on an RFQ, persisting the computed
 * landed costs back onto the quote rows.
 *
 * `statuses` defaults to the quotes a buyer would actually be comparing.
 */
export async function normalizeQuotesForRfq(
  rfqId: number,
  options: { statuses?: string[]; persist?: boolean; now?: Date } = {},
): Promise<NormalizeRfqResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const statuses = options.statuses ?? ["received", "under_review", "accepted"];
  const now = options.now ?? new Date();
  const persist = options.persist !== false;

  const rfqRows = await db.select().from(vendorRfqs).where(eq(vendorRfqs.id, rfqId)).limit(1);
  const rfq = rfqRows[0];
  if (!rfq) throw new Error(`RFQ ${rfqId} not found`);

  const basis = basisFromRfq(rfq as any);

  const quoteRows = await db
    .select()
    .from(vendorQuotes)
    .where(and(eq(vendorQuotes.rfqId, rfqId), inArray(vendorQuotes.status, statuses as any)));

  if (quoteRows.length === 0) {
    return { rfqId, basis, results: [], comparableCount: 0, excludedCount: 0, bestQuoteId: null };
  }

  // Batch-load vendors so defaults (currency / Incoterm) and names resolve without an N+1.
  const vendorIds = Array.from(new Set(quoteRows.map(q => q.vendorId).filter(Boolean)));
  const vendorRows = vendorIds.length
    ? await db.select().from(vendors).where(inArray(vendors.id, vendorIds))
    : [];
  const vendorById = new Map(vendorRows.map(v => [v.id, v]));

  const inputs = quoteRows.map(row => quoteInputFromRow(row, vendorById.get(row.vendorId) as any));

  // One FX lookup per distinct currency, dated to "now" for the whole run so
  // every quote in the comparison uses the same rate snapshot.
  const fxTable = await getFxRateTable(inputs.map(i => i.currency), basis.baseCurrency, now);

  const results = inputs.map(input =>
    computeNormalizedQuote(input, basis, fxTable.get(input.currency) ?? null, now),
  );
  rankNormalizedQuotes(results);

  if (persist) {
    await Promise.all(
      results.map(r =>
        db
          .update(vendorQuotes)
          .set({
            normalizedCurrency: r.baseCurrency,
            fxRate: r.fx ? r.fx.rate.toString() : null,
            fxRateAsOf: r.fx ? r.fx.asOf : null,
            fxRateSource: r.fx ? `${r.fx.source}:${r.fx.provider}`.slice(0, 64) : null,
            landedUnitCost: r.landedUnitCost !== null ? r.landedUnitCost.toString() : null,
            landedTotalCost: r.landedTotalCost !== null ? r.landedTotalCost.toString() : null,
            billableQuantity: r.billableQuantity.toString(),
            moqShortfallUnits: r.moqShortfallUnits.toString(),
            toolingPerUnit: r.toolingPerUnit.toString(),
            normalizationBreakdown: JSON.stringify(r.breakdown),
            normalizationWarnings: JSON.stringify(r.warnings),
            normalizedRank: r.rank,
            normalizedAt: now,
          })
          .where(eq(vendorQuotes.id, r.quoteId)),
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
