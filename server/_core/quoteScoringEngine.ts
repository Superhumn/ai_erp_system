/**
 * Quote Scoring Engine
 * Transparent, weighted scoring system for vendor quote comparison.
 *
 * Default score = w1*net_price + w2*lead_time + w3*reliability + w4*terms + w5*quality + w6*logistics
 *
 * Hard constraints filter first (approved vendor, budget, certs, delivery window).
 * Tie-breakers: shorter lead time → better terms → incumbent → smaller MOQ.
 */

import type { CanonicalQuote } from "./quoteNormalizer";

// ============================================
// SCORING CONFIGURATION
// ============================================

export interface ScoringWeights {
  netPrice: number;       // w1 - lower is better
  leadTime: number;       // w2 - shorter is better
  reliability: number;    // w3 - higher on-time % is better
  paymentTerms: number;   // w4 - longer net days is better
  quality: number;        // w5 - more certifications is better
  logisticsCost: number;  // w6 - lower surcharges is better
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  netPrice: 0.35,
  leadTime: 0.20,
  reliability: 0.15,
  paymentTerms: 0.10,
  quality: 0.10,
  logisticsCost: 0.10,
};

export interface HardConstraints {
  maxBudgetPerUnit?: number;
  maxBudgetTotal?: number;
  maxLeadTimeDays?: number;
  requiredCertifications?: string[];
  approvedVendorIds?: string[];
  deliveryWindowEnd?: string; // ISO date
}

export interface VendorReliabilityData {
  vendorId: string;
  onTimePercent: number;       // 0-100
  complaintRate: number;       // 0-100 (lower is better)
  isIncumbent: boolean;
  totalOrders: number;
}

export interface AutoApprovalRules {
  maxAmount: number;           // e.g., 50000
  minConfidence: number;       // e.g., 0.9
  minVarianceToNextBest: number; // e.g., 0.03 (3%)
  requireAllDocsPresent: boolean;
  blockNewVendors: boolean;
}

export const DEFAULT_AUTO_APPROVAL: AutoApprovalRules = {
  maxAmount: 50000,
  minConfidence: 0.9,
  minVarianceToNextBest: 0.03,
  requireAllDocsPresent: true,
  blockNewVendors: true,
};

// ============================================
// SCORING RESULT TYPES
// ============================================

export interface QuoteScore {
  quoteId: number;
  vendorId: string;
  totalScore: number;             // 0-100
  componentScores: ComponentScores;
  rank: number;
  passedConstraints: boolean;
  constraintFailures: string[];
  flags: QuoteFlag[];
  netPricePerUnit: number;        // all-in price after surcharges, FX, unit normalization
}

export interface ComponentScores {
  netPrice: number;     // 0-100
  leadTime: number;     // 0-100
  reliability: number;  // 0-100
  paymentTerms: number; // 0-100
  quality: number;      // 0-100
  logisticsCost: number; // 0-100
}

export interface QuoteFlag {
  type: "missing_field" | "ambiguous" | "price_anomaly" | "expired" | "new_vendor" | "tight_delivery" | "low_confidence";
  field?: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface ScoringResult {
  rfqId: string;
  scoredAt: string;
  weights: ScoringWeights;
  quotes: QuoteScore[];
  bestQuoteId: number | null;
  recommendation: string;
  autoApprovalEligible: boolean;
  autoApprovalReason: string;
  requiresHumanReview: boolean;
  humanReviewReasons: string[];
}

// ============================================
// SCORING FUNCTIONS
// ============================================

function parsePaymentTermsDays(terms: string | null): number {
  if (!terms) return 0;
  const match = terms.match(/net\s*(\d+)/i);
  if (match) return parseInt(match[1], 10);
  if (/prepaid|advance|cia|cbd/i.test(terms)) return -1;
  if (/cod/i.test(terms)) return 0;
  return 15; // default assumption
}

function calculateNetPrice(quote: CanonicalQuote): number {
  let net = quote.unitPrice;
  // Add per-unit surcharges
  for (const s of quote.surcharges) {
    if (s.per === quote.uom || s.per === "kg" || s.per === "lb") {
      net += s.amount;
    }
  }
  // Add per-order surcharges spread across quantity
  const qty = quote.lineItems[0]?.qty || 1;
  for (const s of quote.surcharges) {
    if (s.per === "order" && qty > 0) {
      net += s.amount / qty;
    }
  }
  return net;
}

function scoreLinear(value: number, best: number, worst: number): number {
  if (best === worst) return 100;
  const raw = ((worst - value) / (worst - best)) * 100;
  return Math.max(0, Math.min(100, raw));
}

function flagMissingFields(quote: CanonicalQuote): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  for (const gap of quote.extractionGaps) {
    if (gap.startsWith("missing_")) {
      const field = gap.replace("missing_", "");
      flags.push({
        type: "missing_field",
        field,
        message: `Required field "${field}" is missing from this quote`,
        severity: "warning",
      });
    }
  }

  if (quote.confidence < 0.7) {
    flags.push({
      type: "low_confidence",
      message: `Low extraction confidence: ${(quote.confidence * 100).toFixed(0)}%`,
      severity: "critical",
    });
  }

  if (quote.incoterm === "UNKNOWN") {
    flags.push({
      type: "ambiguous",
      field: "incoterm",
      message: "Incoterm could not be determined",
      severity: "warning",
    });
  }

  // Check expiry
  if (quote.validUntil) {
    const expiry = new Date(quote.validUntil);
    if (expiry < new Date()) {
      flags.push({
        type: "expired",
        field: "validUntil",
        message: `Quote expired on ${quote.validUntil}`,
        severity: "critical",
      });
    }
  }

  return flags;
}

function checkConstraints(quote: CanonicalQuote, netPrice: number, constraints: HardConstraints): string[] {
  const failures: string[] = [];

  if (constraints.maxBudgetPerUnit !== undefined && netPrice > constraints.maxBudgetPerUnit) {
    failures.push(`Unit price $${netPrice.toFixed(2)} exceeds budget $${constraints.maxBudgetPerUnit.toFixed(2)}`);
  }

  if (constraints.maxBudgetTotal !== undefined) {
    const totalQty = quote.lineItems[0]?.qty || 0;
    const total = netPrice * totalQty;
    if (total > constraints.maxBudgetTotal) {
      failures.push(`Total $${total.toFixed(2)} exceeds budget $${constraints.maxBudgetTotal.toFixed(2)}`);
    }
  }

  if (constraints.maxLeadTimeDays !== undefined && quote.leadTimeDays > constraints.maxLeadTimeDays) {
    failures.push(`Lead time ${quote.leadTimeDays}d exceeds max ${constraints.maxLeadTimeDays}d`);
  }

  if (constraints.requiredCertifications?.length) {
    const hasDocs = new Set(quote.qualityDocs.map(d => d.toUpperCase()));
    for (const cert of constraints.requiredCertifications) {
      if (!hasDocs.has(cert.toUpperCase())) {
        failures.push(`Missing required certification: ${cert}`);
      }
    }
  }

  if (constraints.approvedVendorIds?.length && !constraints.approvedVendorIds.includes(quote.vendorId)) {
    failures.push(`Vendor ${quote.vendorId} not in approved vendor list`);
  }

  if (constraints.deliveryWindowEnd) {
    const windowEnd = new Date(constraints.deliveryWindowEnd);
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + quote.leadTimeDays);
    if (estimatedDelivery > windowEnd) {
      failures.push(`Estimated delivery exceeds window (${constraints.deliveryWindowEnd})`);
    }
  }

  return failures;
}

// ============================================
// MAIN SCORING FUNCTION
// ============================================

export function scoreQuotes(
  quotes: CanonicalQuote[],
  options: {
    weights?: Partial<ScoringWeights>;
    constraints?: HardConstraints;
    reliabilityData?: VendorReliabilityData[];
    autoApprovalRules?: Partial<AutoApprovalRules>;
  } = {}
): ScoringResult {
  const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const constraints = options.constraints || {};
  const reliabilityMap = new Map(
    (options.reliabilityData || []).map(r => [r.vendorId, r])
  );
  const autoRules = { ...DEFAULT_AUTO_APPROVAL, ...options.autoApprovalRules };

  if (quotes.length === 0) {
    return {
      rfqId: "",
      scoredAt: new Date().toISOString(),
      weights,
      quotes: [],
      bestQuoteId: null,
      recommendation: "No quotes to evaluate",
      autoApprovalEligible: false,
      autoApprovalReason: "No quotes",
      requiresHumanReview: false,
      humanReviewReasons: [],
    };
  }

  const rfqId = quotes[0].rfqId;

  // Calculate net prices for all quotes
  const netPrices = quotes.map(q => calculateNetPrice(q));
  const leadTimes = quotes.map(q => q.leadTimeDays);
  const paymentDays = quotes.map(q => parsePaymentTermsDays(q.paymentTerms));
  const qualityCounts = quotes.map(q => q.qualityDocs.length);
  const logisticsCosts = quotes.map(q =>
    q.surcharges.filter(s => ["shipping", "freight", "handling"].includes(s.type))
      .reduce((sum, s) => sum + s.amount, 0)
  );

  // Determine best/worst for each dimension
  const priceRange = { best: Math.min(...netPrices), worst: Math.max(...netPrices) };
  const leadRange = { best: Math.min(...leadTimes), worst: Math.max(...leadTimes) };
  const paymentRange = { best: Math.max(...paymentDays), worst: Math.min(...paymentDays) };
  const qualityRange = { best: Math.max(...qualityCounts), worst: Math.min(...qualityCounts) };
  const logisticsRange = { best: Math.min(...logisticsCosts), worst: Math.max(...logisticsCosts) };

  // Score each quote
  const scored: QuoteScore[] = quotes.map((quote, i) => {
    const reliability = reliabilityMap.get(quote.vendorId);
    const reliabilityScore = reliability
      ? (reliability.onTimePercent - reliability.complaintRate)
      : 50; // neutral default

    const componentScores: ComponentScores = {
      netPrice: scoreLinear(netPrices[i], priceRange.best, priceRange.worst),
      leadTime: scoreLinear(leadTimes[i], leadRange.best, leadRange.worst),
      reliability: Math.max(0, Math.min(100, reliabilityScore)),
      paymentTerms: paymentDays[i] >= 0
        ? scoreLinear(-paymentDays[i], -paymentRange.best, -paymentRange.worst) // invert: longer is better
        : 0, // prepaid gets 0
      quality: qualityRange.best === qualityRange.worst
        ? 100
        : scoreLinear(-qualityCounts[i], -qualityRange.best, -qualityRange.worst),
      logisticsCost: scoreLinear(logisticsCosts[i], logisticsRange.best, logisticsRange.worst),
    };

    const totalScore =
      weights.netPrice * componentScores.netPrice +
      weights.leadTime * componentScores.leadTime +
      weights.reliability * componentScores.reliability +
      weights.paymentTerms * componentScores.paymentTerms +
      weights.quality * componentScores.quality +
      weights.logisticsCost * componentScores.logisticsCost;

    const constraintFailures = checkConstraints(quote, netPrices[i], constraints);
    const flags = flagMissingFields(quote);

    // Add price anomaly detection
    if (netPrices.length >= 3) {
      const median = [...netPrices].sort((a, b) => a - b)[Math.floor(netPrices.length / 2)];
      const deviation = Math.abs(netPrices[i] - median) / median;
      if (deviation > 0.5) {
        flags.push({
          type: "price_anomaly",
          field: "unitPrice",
          message: `Price deviates ${(deviation * 100).toFixed(0)}% from median ($${median.toFixed(2)})`,
          severity: deviation > 1 ? "critical" : "warning",
        });
      }
    }

    // Flag new vendors
    if (reliability && !reliability.isIncumbent && (reliability.totalOrders || 0) < 3) {
      flags.push({
        type: "new_vendor",
        message: `New vendor with only ${reliability.totalOrders} previous orders`,
        severity: "info",
      });
    }

    return {
      quoteId: quote.quoteId,
      vendorId: quote.vendorId,
      totalScore: Math.round(totalScore * 100) / 100,
      componentScores,
      rank: 0, // assigned after sorting
      passedConstraints: constraintFailures.length === 0,
      constraintFailures,
      flags,
      netPricePerUnit: Math.round(netPrices[i] * 10000) / 10000,
    };
  });

  // Sort: constraint-passing first, then by score descending
  scored.sort((a, b) => {
    // Constraint-passing quotes come first
    if (a.passedConstraints !== b.passedConstraints) {
      return a.passedConstraints ? -1 : 1;
    }
    // Higher score is better
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;

    // Tie-breakers
    const qA = quotes.find(q => q.quoteId === a.quoteId)!;
    const qB = quotes.find(q => q.quoteId === b.quoteId)!;

    // 1. Shorter lead time
    if (qA.leadTimeDays !== qB.leadTimeDays) return qA.leadTimeDays - qB.leadTimeDays;
    // 2. Better payment terms
    const termsA = parsePaymentTermsDays(qA.paymentTerms);
    const termsB = parsePaymentTermsDays(qB.paymentTerms);
    if (termsA !== termsB) return termsB - termsA;
    // 3. Incumbent preference
    const relA = reliabilityMap.get(a.vendorId);
    const relB = reliabilityMap.get(b.vendorId);
    if (relA?.isIncumbent && !relB?.isIncumbent) return -1;
    if (!relA?.isIncumbent && relB?.isIncumbent) return 1;
    // 4. Smaller MOQ
    if ((qA.minOrderQty || 0) !== (qB.minOrderQty || 0)) {
      return (qA.minOrderQty || 0) - (qB.minOrderQty || 0);
    }
    return 0;
  });

  // Assign ranks
  scored.forEach((s, i) => { s.rank = i + 1; });

  const bestQuote = scored.find(s => s.passedConstraints) || scored[0];
  const secondBest = scored.find(s => s.passedConstraints && s.quoteId !== bestQuote.quoteId);

  // Auto-approval check
  const humanReviewReasons: string[] = [];
  let autoApprovalEligible = true;
  let autoApprovalReason = "";

  const bestCanonical = quotes.find(q => q.quoteId === bestQuote.quoteId)!;
  const totalAmount = bestQuote.netPricePerUnit * (bestCanonical.lineItems[0]?.qty || 0);

  if (totalAmount > autoRules.maxAmount) {
    autoApprovalEligible = false;
    autoApprovalReason = `Total $${totalAmount.toFixed(2)} exceeds auto-approve limit $${autoRules.maxAmount}`;
    humanReviewReasons.push(autoApprovalReason);
  }

  if (bestCanonical.confidence < autoRules.minConfidence) {
    autoApprovalEligible = false;
    humanReviewReasons.push(`Confidence ${(bestCanonical.confidence * 100).toFixed(0)}% below threshold ${(autoRules.minConfidence * 100).toFixed(0)}%`);
  }

  if (secondBest && autoRules.minVarianceToNextBest > 0) {
    const variance = (secondBest.netPricePerUnit - bestQuote.netPricePerUnit) / secondBest.netPricePerUnit;
    if (variance < autoRules.minVarianceToNextBest) {
      autoApprovalEligible = false;
      humanReviewReasons.push(`Price variance to next best is only ${(variance * 100).toFixed(1)}%, below ${(autoRules.minVarianceToNextBest * 100).toFixed(0)}% threshold`);
    }
  }

  if (autoRules.requireAllDocsPresent && bestQuote.flags.some(f => f.type === "missing_field")) {
    autoApprovalEligible = false;
    humanReviewReasons.push("Missing required fields in best quote");
  }

  if (autoRules.blockNewVendors && bestQuote.flags.some(f => f.type === "new_vendor")) {
    autoApprovalEligible = false;
    humanReviewReasons.push("Best quote is from a new vendor");
  }

  if (bestQuote.flags.some(f => f.severity === "critical")) {
    autoApprovalEligible = false;
    humanReviewReasons.push("Critical flags present on best quote");
  }

  if (!bestQuote.passedConstraints) {
    autoApprovalEligible = false;
    humanReviewReasons.push("Best quote failed hard constraints");
  }

  if (autoApprovalEligible) {
    autoApprovalReason = `Auto-approved: $${totalAmount.toFixed(2)} under limit, confidence ${(bestCanonical.confidence * 100).toFixed(0)}%, sufficient price variance`;
  }

  // Build recommendation
  const recommendation = bestQuote.passedConstraints
    ? `Recommend quote #${bestQuote.quoteId} from vendor ${bestQuote.vendorId} at $${bestQuote.netPricePerUnit.toFixed(4)}/${bestCanonical.uom} (score: ${bestQuote.totalScore.toFixed(1)}/100). ${
        secondBest
          ? `Next best: #${secondBest.quoteId} at $${secondBest.netPricePerUnit.toFixed(4)}/${bestCanonical.uom} (score: ${secondBest.totalScore.toFixed(1)}/100).`
          : "No competing quotes passed constraints."
      }`
    : `No quotes passed all hard constraints. Best available: #${bestQuote.quoteId} (${bestQuote.constraintFailures.join("; ")}).`;

  return {
    rfqId,
    scoredAt: new Date().toISOString(),
    weights,
    quotes: scored,
    bestQuoteId: bestQuote.passedConstraints ? bestQuote.quoteId : null,
    recommendation,
    autoApprovalEligible,
    autoApprovalReason: autoApprovalEligible ? autoApprovalReason : humanReviewReasons.join("; "),
    requiresHumanReview: humanReviewReasons.length > 0,
    humanReviewReasons,
  };
}
