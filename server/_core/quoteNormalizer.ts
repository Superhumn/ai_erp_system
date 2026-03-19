/**
 * Quote Normalizer
 * Converts vendor quotes into a canonical JSON format with:
 * - Unit normalization (kg/lb/ton/oz/g)
 * - Currency normalization (via ECB rates)
 * - Incoterms parsing and validation
 * - Field completeness checking
 */

// ============================================
// CANONICAL QUOTE SCHEMA
// ============================================

export interface CanonicalLineItem {
  sku: string;
  spec: string | null;
  qty: number;
  uom: NormalizedUOM;
  originalQty: number;
  originalUom: string;
}

export interface CanonicalSurcharge {
  type: string;
  amount: number;
  per: string;
  currency: string;
}

export interface CanonicalQuote {
  rfqId: string;
  vendorId: string;
  quoteId: number;
  lineItems: CanonicalLineItem[];
  currency: string;
  originalCurrency: string;
  unitPrice: number;
  originalUnitPrice: number;
  uom: NormalizedUOM;
  priceBasis: string;
  incoterm: NormalizedIncoterm;
  port: string | null;
  leadTimeDays: number;
  minOrderQty: number | null;
  validUntil: string | null;
  surcharges: CanonicalSurcharge[];
  freightIncluded: boolean;
  paymentTerms: string | null;
  qualityDocs: string[];
  notes: string | null;
  attachments: string[];
  // Normalization metadata
  normalization: NormalizationRecord;
  // Completeness
  confidence: number;
  extractionGaps: string[];
}

export interface NormalizationRecord {
  timestamp: string;
  fxRate: number | null;
  fxSource: string | null;
  unitConversionFactor: number | null;
  unitConversionFrom: string | null;
  unitConversionTo: string | null;
  incotermMapped: boolean;
  warnings: string[];
}

// ============================================
// UNIT NORMALIZATION
// ============================================

export type NormalizedUOM = "kg" | "lb" | "ton" | "mt" | "oz" | "g" | "each" | "case" | "pallet" | "liter" | "gal";

const UOM_ALIASES: Record<string, NormalizedUOM> = {
  // Kilograms
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  // Pounds
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  // Tons
  ton: "ton", tons: "ton", "short ton": "ton", "short tons": "ton",
  // Metric tons
  mt: "mt", "metric ton": "mt", "metric tons": "mt", tonne: "mt", tonnes: "mt",
  // Ounces
  oz: "oz", ounce: "oz", ounces: "oz",
  // Grams
  g: "g", gram: "g", grams: "g", gr: "g",
  // Each/unit
  each: "each", ea: "each", unit: "each", units: "each", pc: "each", pcs: "each", piece: "each", pieces: "each",
  // Case
  case: "case", cases: "case", cs: "case",
  // Pallet
  pallet: "pallet", pallets: "pallet", plt: "pallet",
  // Liquid
  liter: "liter", liters: "liter", litre: "liter", litres: "liter", l: "liter",
  gal: "gal", gallon: "gal", gallons: "gal",
};

// Conversion factors to KG (weight units only)
const TO_KG: Record<string, number> = {
  kg: 1,
  lb: 0.453592,
  ton: 907.185,     // short ton
  mt: 1000,         // metric ton
  oz: 0.0283495,
  g: 0.001,
};

// Conversion factors to LITER (liquid units only)
const TO_LITER: Record<string, number> = {
  liter: 1,
  gal: 3.78541,
};

export function normalizeUOM(raw: string): NormalizedUOM {
  const key = raw.trim().toLowerCase();
  return UOM_ALIASES[key] || "each";
}

export function convertQuantity(qty: number, fromUom: NormalizedUOM, toUom: NormalizedUOM): { value: number; factor: number } | null {
  // Same unit, no conversion
  if (fromUom === toUom) return { value: qty, factor: 1 };

  // Weight conversions
  if (TO_KG[fromUom] !== undefined && TO_KG[toUom] !== undefined) {
    const factor = TO_KG[fromUom] / TO_KG[toUom];
    return { value: qty * factor, factor };
  }

  // Liquid conversions
  if (TO_LITER[fromUom] !== undefined && TO_LITER[toUom] !== undefined) {
    const factor = TO_LITER[fromUom] / TO_LITER[toUom];
    return { value: qty * factor, factor };
  }

  // Cannot convert between incompatible unit types
  return null;
}

/**
 * Convert a unit price from one UOM to another.
 * If converting from lb to kg: price per lb * (lb_per_kg) = price per kg
 */
export function convertUnitPrice(price: number, fromUom: NormalizedUOM, toUom: NormalizedUOM): number | null {
  if (fromUom === toUom) return price;

  // For price conversion, we invert the quantity factor:
  // price_per_toUom = price_per_fromUom / (toUom_per_fromUom)
  const conversion = convertQuantity(1, fromUom, toUom);
  if (!conversion) return null;

  // 1 fromUom = conversion.value toUom, so price per toUom = price / conversion.value
  return price / conversion.value;
}

// ============================================
// CURRENCY NORMALIZATION
// ============================================

// Approximate FX rates (in production, fetch from ECB/fixer.io daily)
const DEFAULT_FX_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  AUD: 0.65,
  CNY: 0.14,
  JPY: 0.0067,
  MXN: 0.058,
  BRL: 0.20,
  INR: 0.012,
  KRW: 0.00075,
  THB: 0.029,
  VND: 0.000041,
};

let cachedFxRates: Record<string, number> = { ...DEFAULT_FX_RATES };
let fxRateTimestamp: string | null = null;
let fxRateSource: string = "default";

export function setFxRates(rates: Record<string, number>, source: string = "manual"): void {
  cachedFxRates = { ...rates };
  fxRateTimestamp = new Date().toISOString();
  fxRateSource = source;
}

export function getFxRate(from: string, to: string): { rate: number; source: string } | null {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (fromUpper === toUpper) return { rate: 1, source: fxRateSource };

  const fromRate = cachedFxRates[fromUpper];
  const toRate = cachedFxRates[toUpper];

  if (fromRate === undefined || toRate === undefined) return null;

  // Convert via USD as base
  return { rate: fromRate / toRate, source: fxRateSource };
}

export function convertCurrency(amount: number, from: string, to: string): { value: number; rate: number; source: string } | null {
  const fx = getFxRate(from, to);
  if (!fx) return null;
  return { value: amount * fx.rate, rate: fx.rate, source: fx.source };
}

// ============================================
// INCOTERMS NORMALIZATION
// ============================================

export type NormalizedIncoterm = "EXW" | "FCA" | "FAS" | "FOB" | "CFR" | "CIF" | "CPT" | "CIP" | "DAP" | "DPU" | "DDP" | "UNKNOWN";

const INCOTERM_ALIASES: Record<string, NormalizedIncoterm> = {
  exw: "EXW", "ex works": "EXW", "ex-works": "EXW",
  fca: "FCA", "free carrier": "FCA",
  fas: "FAS", "free alongside ship": "FAS",
  fob: "FOB", "free on board": "FOB",
  cfr: "CFR", "cost and freight": "CFR", "c&f": "CFR", "cnf": "CFR",
  cif: "CIF", "cost insurance freight": "CIF", "cost insurance and freight": "CIF",
  cpt: "CPT", "carriage paid to": "CPT",
  cip: "CIP", "carriage and insurance paid": "CIP",
  dap: "DAP", "delivered at place": "DAP",
  dpu: "DPU", "delivered at place unloaded": "DPU",
  ddp: "DDP", "delivered duty paid": "DDP",
};

// Freight inclusion by Incoterm (seller bears freight cost)
const FREIGHT_INCLUDED_INCOTERMS: Set<NormalizedIncoterm> = new Set(["CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]);

export function normalizeIncoterm(raw: string | null | undefined): NormalizedIncoterm {
  if (!raw) return "UNKNOWN";
  const key = raw.trim().toLowerCase();
  return INCOTERM_ALIASES[key] || "UNKNOWN";
}

export function isFreightIncluded(incoterm: NormalizedIncoterm): boolean {
  return FREIGHT_INCLUDED_INCOTERMS.has(incoterm);
}

// ============================================
// FIELD COMPLETENESS & VALIDATION
// ============================================

const REQUIRED_FIELDS = [
  "currency", "unitPrice", "uom", "incoterm",
  "leadTimeDays", "validUntil", "paymentTerms",
] as const;

const NUMERIC_RANGES: Record<string, [number, number]> = {
  unitPrice: [0.01, 1_000_000],
  leadTimeDays: [1, 365],
  minOrderQty: [1, 10_000_000],
};

const VALID_UOMS: Set<string> = new Set(["kg", "lb", "ton", "mt", "oz", "g", "each", "case", "pallet", "liter", "gal"]);
const VALID_INCOTERMS: Set<string> = new Set(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]);

export interface ValidationResult {
  valid: boolean;
  gaps: string[];
  warnings: string[];
  confidence: number;
}

export function validateQuoteFields(data: Record<string, any>): ValidationResult {
  const gaps: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === null || data[field] === undefined || data[field] === "") {
      gaps.push(`missing_${field}`);
    }
  }

  // Validate numeric ranges
  for (const [field, [min, max]] of Object.entries(NUMERIC_RANGES)) {
    const val = data[field];
    if (val !== null && val !== undefined) {
      const num = typeof val === "string" ? parseFloat(val) : val;
      if (isNaN(num)) {
        gaps.push(`invalid_${field}_not_numeric`);
      } else if (num < min || num > max) {
        warnings.push(`${field}_out_of_range (${num}, expected ${min}-${max})`);
      }
    }
  }

  // Validate UOM
  if (data.uom && !VALID_UOMS.has(normalizeUOM(data.uom))) {
    warnings.push(`unknown_uom: ${data.uom}`);
  }

  // Validate Incoterm
  if (data.incoterm) {
    const normalized = normalizeIncoterm(data.incoterm);
    if (normalized === "UNKNOWN") {
      warnings.push(`unknown_incoterm: ${data.incoterm}`);
    }
  }

  // Validate date fields
  if (data.validUntil) {
    const date = new Date(data.validUntil);
    if (isNaN(date.getTime())) {
      warnings.push("invalid_validUntil_date");
    } else if (date < new Date()) {
      warnings.push("quote_expired");
    }
  }

  // Confidence = ratio of non-missing required fields
  const totalRequired = REQUIRED_FIELDS.length;
  const missingCount = gaps.filter(g => g.startsWith("missing_")).length;
  const confidence = Math.round(((totalRequired - missingCount) / totalRequired) * 100) / 100;

  return {
    valid: gaps.length === 0,
    gaps,
    warnings,
    confidence,
  };
}

// ============================================
// MAIN NORMALIZER
// ============================================

export interface RawQuoteInput {
  rfqId?: string;
  vendorId?: string;
  quoteId?: number;
  currency?: string;
  unitPrice?: number | string;
  quantity?: number | string;
  uom?: string;
  priceBasis?: string;
  incoterm?: string;
  port?: string;
  leadTimeDays?: number | string;
  minOrderQty?: number | string;
  validUntil?: string;
  surcharges?: Array<{ type: string; amount: number | string; per?: string; currency?: string }>;
  freightIncluded?: boolean;
  paymentTerms?: string;
  qualityDocs?: string[];
  notes?: string;
  attachments?: string[];
  sku?: string;
  spec?: string;
  // Fields from existing schema
  shippingCost?: number | string;
  handlingFee?: number | string;
  taxAmount?: number | string;
  otherCharges?: number | string;
  totalPrice?: number | string;
  totalWithCharges?: number | string;
  estimatedDeliveryDate?: string;
}

export interface NormalizeOptions {
  targetCurrency?: string;   // default: "USD"
  targetUom?: NormalizedUOM; // default: "kg" for weight items
  skipCurrencyConversion?: boolean;
  skipUnitConversion?: boolean;
}

export function normalizeQuote(raw: RawQuoteInput, options: NormalizeOptions = {}): CanonicalQuote {
  const targetCurrency = options.targetCurrency || "USD";
  const warnings: string[] = [];

  // Parse numeric fields
  const unitPrice = typeof raw.unitPrice === "string" ? parseFloat(raw.unitPrice) : (raw.unitPrice || 0);
  const quantity = typeof raw.quantity === "string" ? parseFloat(raw.quantity) : (raw.quantity || 0);
  const leadTimeDays = typeof raw.leadTimeDays === "string" ? parseInt(raw.leadTimeDays, 10) : (raw.leadTimeDays || 0);
  const minOrderQty = raw.minOrderQty ? (typeof raw.minOrderQty === "string" ? parseFloat(raw.minOrderQty) : raw.minOrderQty) : null;

  // Normalize UOM
  const originalUom = raw.uom || "each";
  const normalizedUom = normalizeUOM(originalUom);
  const targetUom = options.targetUom || normalizedUom;

  // Normalize Incoterm
  const incoterm = normalizeIncoterm(raw.incoterm);
  const incotermMapped = incoterm !== "UNKNOWN" && raw.incoterm !== incoterm;

  // Determine freight inclusion from Incoterm if not explicitly set
  const freightIncluded = raw.freightIncluded !== undefined
    ? raw.freightIncluded
    : isFreightIncluded(incoterm);

  // Currency conversion
  let normalizedPrice = unitPrice;
  let fxRate: number | null = null;
  let fxSource: string | null = null;
  const originalCurrency = (raw.currency || "USD").toUpperCase();

  if (!options.skipCurrencyConversion && originalCurrency !== targetCurrency) {
    const conversion = convertCurrency(unitPrice, originalCurrency, targetCurrency);
    if (conversion) {
      normalizedPrice = Math.round(conversion.value * 10000) / 10000; // 4 decimal places
      fxRate = conversion.rate;
      fxSource = conversion.source;
    } else {
      warnings.push(`currency_conversion_failed: ${originalCurrency} → ${targetCurrency}`);
    }
  }

  // Unit conversion for price
  let unitConversionFactor: number | null = null;
  let unitConversionFrom: string | null = null;
  let unitConversionTo: string | null = null;

  if (!options.skipUnitConversion && normalizedUom !== targetUom) {
    const converted = convertUnitPrice(normalizedPrice, normalizedUom, targetUom);
    if (converted !== null) {
      unitConversionFrom = normalizedUom;
      unitConversionTo = targetUom;
      const qtyConversion = convertQuantity(1, normalizedUom, targetUom);
      unitConversionFactor = qtyConversion?.factor || null;
      normalizedPrice = Math.round(converted * 10000) / 10000;
    } else {
      warnings.push(`unit_conversion_failed: ${normalizedUom} → ${targetUom}`);
    }
  }

  // Build surcharges from both explicit surcharges and schema fields
  const surcharges: CanonicalSurcharge[] = [];
  if (raw.surcharges) {
    for (const s of raw.surcharges) {
      surcharges.push({
        type: s.type,
        amount: typeof s.amount === "string" ? parseFloat(s.amount) : s.amount,
        per: s.per || targetUom,
        currency: (s.currency || originalCurrency).toUpperCase(),
      });
    }
  }
  // Map schema-level charges to surcharges
  const shippingCost = typeof raw.shippingCost === "string" ? parseFloat(raw.shippingCost) : (raw.shippingCost || 0);
  const handlingFee = typeof raw.handlingFee === "string" ? parseFloat(raw.handlingFee) : (raw.handlingFee || 0);
  const otherCharges = typeof raw.otherCharges === "string" ? parseFloat(raw.otherCharges) : (raw.otherCharges || 0);

  if (shippingCost > 0) surcharges.push({ type: "shipping", amount: shippingCost, per: "order", currency: originalCurrency });
  if (handlingFee > 0) surcharges.push({ type: "handling", amount: handlingFee, per: "order", currency: originalCurrency });
  if (otherCharges > 0) surcharges.push({ type: "other", amount: otherCharges, per: "order", currency: originalCurrency });

  // Build line items
  const lineItems: CanonicalLineItem[] = [{
    sku: raw.sku || "",
    spec: raw.spec || null,
    qty: targetUom !== normalizedUom
      ? (convertQuantity(quantity, normalizedUom, targetUom)?.value || quantity)
      : quantity,
    uom: targetUom,
    originalQty: quantity,
    originalUom,
  }];

  // Validate completeness
  const validation = validateQuoteFields({
    currency: raw.currency,
    unitPrice,
    uom: raw.uom,
    incoterm: raw.incoterm,
    leadTimeDays: raw.leadTimeDays,
    validUntil: raw.validUntil,
    paymentTerms: raw.paymentTerms,
    minOrderQty: raw.minOrderQty,
  });

  return {
    rfqId: raw.rfqId || "",
    vendorId: raw.vendorId || "",
    quoteId: raw.quoteId || 0,
    lineItems,
    currency: targetCurrency,
    originalCurrency,
    unitPrice: normalizedPrice,
    originalUnitPrice: unitPrice,
    uom: targetUom,
    priceBasis: raw.priceBasis || incoterm,
    incoterm,
    port: raw.port || null,
    leadTimeDays,
    minOrderQty,
    validUntil: raw.validUntil || null,
    surcharges,
    freightIncluded,
    paymentTerms: raw.paymentTerms || null,
    qualityDocs: raw.qualityDocs || [],
    notes: raw.notes || null,
    attachments: raw.attachments || [],
    normalization: {
      timestamp: new Date().toISOString(),
      fxRate,
      fxSource,
      unitConversionFactor,
      unitConversionFrom,
      unitConversionTo,
      incotermMapped,
      warnings,
    },
    confidence: validation.confidence,
    extractionGaps: [...validation.gaps, ...validation.warnings],
  };
}

/**
 * Generate a clarification email body for missing/ambiguous fields.
 * Used by the auto-reply system when a quote is incomplete.
 */
export function generateClarificationRequest(gaps: string[], rfqNumber: string, vendorName: string): string {
  const fieldLabels: Record<string, string> = {
    missing_currency: "the currency of the quoted price",
    missing_unitPrice: "the unit price",
    missing_uom: "the unit of measure (kg, lb, etc.)",
    missing_incoterm: "the applicable Incoterm (e.g., FOB, CIF, EXW)",
    missing_leadTimeDays: "the lead time in days",
    missing_validUntil: "the quote validity/expiration date",
    missing_paymentTerms: "your payment terms (e.g., Net 30)",
  };

  const missingDescriptions = gaps
    .filter(g => g.startsWith("missing_"))
    .map(g => fieldLabels[g] || g.replace("missing_", "").replace(/_/g, " "))
    .filter(Boolean);

  if (missingDescriptions.length === 0) return "";

  return `Dear ${vendorName},

Thank you for your quote on ${rfqNumber}. To complete our evaluation, we need the following information:

${missingDescriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}

Could you please reply with these details at your earliest convenience?

Best regards,
Procurement Team`;
}
