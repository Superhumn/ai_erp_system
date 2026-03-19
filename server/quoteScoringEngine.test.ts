import { describe, it, expect } from "vitest";
import { scoreQuotes, DEFAULT_WEIGHTS } from "./_core/quoteScoringEngine";
import { normalizeQuote, type CanonicalQuote } from "./_core/quoteNormalizer";

function makeCanonicalQuote(overrides: Partial<CanonicalQuote> & { quoteId: number; vendorId: string }): CanonicalQuote {
  return {
    rfqId: "RFQ-TEST-001",
    lineItems: [{ sku: "TEST", spec: null, qty: 1000, uom: "kg", originalQty: 1000, originalUom: "kg" }],
    currency: "USD",
    originalCurrency: "USD",
    unitPrice: 2.10,
    originalUnitPrice: 2.10,
    uom: "kg",
    priceBasis: "FOB",
    incoterm: "FOB",
    port: "LAX",
    leadTimeDays: 21,
    minOrderQty: null,
    validUntil: "2026-12-31",
    surcharges: [],
    freightIncluded: false,
    paymentTerms: "Net 30",
    qualityDocs: ["COA"],
    notes: null,
    attachments: [],
    normalization: {
      timestamp: new Date().toISOString(),
      fxRate: null,
      fxSource: null,
      unitConversionFactor: null,
      unitConversionFrom: null,
      unitConversionTo: null,
      incotermMapped: false,
      warnings: [],
    },
    confidence: 0.95,
    extractionGaps: [],
    ...overrides,
  };
}

describe("quoteScoringEngine", () => {
  describe("scoreQuotes", () => {
    it("ranks cheapest quote first with default weights", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 3.00, leadTimeDays: 14 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.00, leadTimeDays: 21 }),
        makeCanonicalQuote({ quoteId: 3, vendorId: "V3", unitPrice: 2.50, leadTimeDays: 7 }),
      ];

      const result = scoreQuotes(quotes);

      expect(result.bestQuoteId).toBe(2); // cheapest
      expect(result.quotes[0].quoteId).toBe(2);
      expect(result.quotes[0].rank).toBe(1);
    });

    it("respects hard constraints", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 1.00, leadTimeDays: 60 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.00, leadTimeDays: 14 }),
      ];

      const result = scoreQuotes(quotes, {
        constraints: { maxLeadTimeDays: 30 },
      });

      // Quote 1 is cheaper but fails lead time constraint
      expect(result.bestQuoteId).toBe(2);
      expect(result.quotes.find(q => q.quoteId === 1)!.passedConstraints).toBe(false);
      expect(result.quotes.find(q => q.quoteId === 2)!.passedConstraints).toBe(true);
    });

    it("respects budget constraints", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 5.00 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.00 }),
      ];

      const result = scoreQuotes(quotes, {
        constraints: { maxBudgetPerUnit: 3.00 },
      });

      expect(result.quotes.find(q => q.quoteId === 1)!.passedConstraints).toBe(false);
      expect(result.quotes.find(q => q.quoteId === 2)!.passedConstraints).toBe(true);
    });

    it("uses reliability data in scoring", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 2.10 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.10 }), // same price
      ];

      const result = scoreQuotes(quotes, {
        reliabilityData: [
          { vendorId: "V1", onTimePercent: 95, complaintRate: 2, isIncumbent: true, totalOrders: 50 },
          { vendorId: "V2", onTimePercent: 60, complaintRate: 20, isIncumbent: false, totalOrders: 3 },
        ],
      });

      // V1 should rank higher due to reliability
      expect(result.quotes[0].vendorId).toBe("V1");
    });

    it("flags missing fields", () => {
      const quotes = [
        makeCanonicalQuote({
          quoteId: 1, vendorId: "V1",
          extractionGaps: ["missing_paymentTerms", "missing_validUntil"],
          confidence: 0.5,
        }),
      ];

      const result = scoreQuotes(quotes);
      const scored = result.quotes[0];
      expect(scored.flags.some(f => f.type === "missing_field" && f.field === "paymentTerms")).toBe(true);
      expect(scored.flags.some(f => f.type === "low_confidence")).toBe(true);
    });

    it("detects price anomalies", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 2.00 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.10 }),
        makeCanonicalQuote({ quoteId: 3, vendorId: "V3", unitPrice: 10.00 }), // outlier
      ];

      const result = scoreQuotes(quotes);
      const outlier = result.quotes.find(q => q.quoteId === 3)!;
      expect(outlier.flags.some(f => f.type === "price_anomaly")).toBe(true);
    });

    it("determines auto-approval eligibility", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 2.00 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 3.00 }),
      ];

      // Total = 2.00 * 1000 = $2000, under $50k default threshold
      const result = scoreQuotes(quotes, {
        autoApprovalRules: { maxAmount: 50000, minConfidence: 0.9, minVarianceToNextBest: 0.03 },
      });

      expect(result.autoApprovalEligible).toBe(true);
    });

    it("blocks auto-approval for high amounts", () => {
      const quotes = [
        makeCanonicalQuote({
          quoteId: 1, vendorId: "V1", unitPrice: 100,
          lineItems: [{ sku: "TEST", spec: null, qty: 1000, uom: "kg", originalQty: 1000, originalUom: "kg" }],
        }),
      ];

      const result = scoreQuotes(quotes, {
        autoApprovalRules: { maxAmount: 50000 },
      });

      // $100 * 1000 = $100k > $50k
      expect(result.autoApprovalEligible).toBe(false);
      expect(result.humanReviewReasons.some(r => r.includes("auto-approve limit"))).toBe(true);
    });

    it("blocks auto-approval for new vendors", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 1.00 }),
      ];

      const result = scoreQuotes(quotes, {
        reliabilityData: [
          { vendorId: "V1", onTimePercent: 100, complaintRate: 0, isIncumbent: false, totalOrders: 1 },
        ],
        autoApprovalRules: { blockNewVendors: true },
      });

      expect(result.autoApprovalEligible).toBe(false);
      expect(result.humanReviewReasons.some(r => r.includes("new vendor"))).toBe(true);
    });

    it("handles empty quotes array", () => {
      const result = scoreQuotes([]);
      expect(result.bestQuoteId).toBeNull();
      expect(result.quotes).toHaveLength(0);
      expect(result.autoApprovalEligible).toBe(false);
    });

    it("handles single quote", () => {
      const quotes = [makeCanonicalQuote({ quoteId: 1, vendorId: "V1" })];
      const result = scoreQuotes(quotes);
      expect(result.bestQuoteId).toBe(1);
      expect(result.quotes[0].rank).toBe(1);
      expect(result.quotes[0].totalScore).toBeGreaterThan(0);
    });

    it("applies custom weights", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 3.00, leadTimeDays: 7 }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.00, leadTimeDays: 30 }),
      ];

      // Heavy weight on lead time
      const result = scoreQuotes(quotes, {
        weights: { netPrice: 0.1, leadTime: 0.6, reliability: 0.1, paymentTerms: 0.1, quality: 0.05, logisticsCost: 0.05 },
      });

      // V1 has better lead time despite higher price
      expect(result.quotes[0].quoteId).toBe(1);
    });

    it("includes surcharges in net price calculation", () => {
      const quotes = [
        makeCanonicalQuote({
          quoteId: 1, vendorId: "V1", unitPrice: 1.50,
          surcharges: [{ type: "fuel", amount: 0.50, per: "kg", currency: "USD" }],
        }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.10, surcharges: [] }),
      ];

      const result = scoreQuotes(quotes);
      // V1 net = 1.50 + 0.50 = 2.00, V2 net = 2.10
      // V1 should still be cheapest
      expect(result.quotes[0].quoteId).toBe(1);
      expect(result.quotes[0].netPricePerUnit).toBe(2.0);
    });

    it("checks required certifications", () => {
      const quotes = [
        makeCanonicalQuote({ quoteId: 1, vendorId: "V1", unitPrice: 1.00, qualityDocs: ["COA"] }),
        makeCanonicalQuote({ quoteId: 2, vendorId: "V2", unitPrice: 2.00, qualityDocs: ["COA", "ISO22000", "HACCP"] }),
      ];

      const result = scoreQuotes(quotes, {
        constraints: { requiredCertifications: ["COA", "ISO22000"] },
      });

      // V1 missing ISO22000
      expect(result.quotes.find(q => q.quoteId === 1)!.passedConstraints).toBe(false);
      expect(result.quotes.find(q => q.quoteId === 2)!.passedConstraints).toBe(true);
      expect(result.bestQuoteId).toBe(2);
    });
  });

  describe("integration with normalizeQuote", () => {
    it("normalizes then scores end-to-end", () => {
      const raw1 = normalizeQuote({
        rfqId: "RFQ-001", vendorId: "V1", quoteId: 1,
        currency: "USD", unitPrice: 2.10, quantity: 5000, uom: "kg",
        incoterm: "FOB", leadTimeDays: 21, validUntil: "2026-12-31",
        paymentTerms: "Net 30", surcharges: [{ type: "fuel", amount: 0.05, per: "kg" }],
      });

      const raw2 = normalizeQuote({
        rfqId: "RFQ-001", vendorId: "V2", quoteId: 2,
        currency: "USD", unitPrice: 2.50, quantity: 5000, uom: "kg",
        incoterm: "CIF", leadTimeDays: 14, validUntil: "2026-12-31",
        paymentTerms: "Net 45",
      });

      const result = scoreQuotes([raw1, raw2]);

      expect(result.quotes).toHaveLength(2);
      expect(result.bestQuoteId).not.toBeNull();
      expect(result.recommendation).toBeTruthy();
    });
  });
});
