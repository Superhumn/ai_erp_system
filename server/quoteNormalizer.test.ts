import { describe, it, expect } from "vitest";
import {
  normalizeUOM,
  convertQuantity,
  convertUnitPrice,
  normalizeIncoterm,
  isFreightIncluded,
  validateQuoteFields,
  normalizeQuote,
  generateClarificationRequest,
  convertCurrency,
} from "./_core/quoteNormalizer";

describe("quoteNormalizer", () => {
  describe("normalizeUOM", () => {
    it("normalizes common weight units", () => {
      expect(normalizeUOM("kg")).toBe("kg");
      expect(normalizeUOM("KGS")).toBe("kg");
      expect(normalizeUOM("kilograms")).toBe("kg");
      expect(normalizeUOM("lbs")).toBe("lb");
      expect(normalizeUOM("pound")).toBe("lb");
      expect(normalizeUOM("tonnes")).toBe("mt");
    });

    it("normalizes count units", () => {
      expect(normalizeUOM("each")).toBe("each");
      expect(normalizeUOM("pcs")).toBe("each");
      expect(normalizeUOM("pieces")).toBe("each");
      expect(normalizeUOM("case")).toBe("case");
    });

    it("defaults to each for unknown units", () => {
      expect(normalizeUOM("widgets")).toBe("each");
    });
  });

  describe("convertQuantity", () => {
    it("converts kg to lb", () => {
      const result = convertQuantity(1, "kg", "lb");
      expect(result).not.toBeNull();
      expect(result!.value).toBeCloseTo(2.20462, 3);
    });

    it("converts lb to kg", () => {
      const result = convertQuantity(1, "lb", "kg");
      expect(result).not.toBeNull();
      expect(result!.value).toBeCloseTo(0.453592, 3);
    });

    it("converts metric ton to kg", () => {
      const result = convertQuantity(1, "mt", "kg");
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1000);
    });

    it("returns null for incompatible units", () => {
      expect(convertQuantity(1, "kg", "each")).toBeNull();
      expect(convertQuantity(1, "liter", "kg")).toBeNull();
    });

    it("returns identity for same unit", () => {
      const result = convertQuantity(5, "kg", "kg");
      expect(result!.value).toBe(5);
      expect(result!.factor).toBe(1);
    });
  });

  describe("convertUnitPrice", () => {
    it("converts price per lb to price per kg", () => {
      // $1/lb should be ~$2.20/kg
      const result = convertUnitPrice(1.0, "lb", "kg");
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(2.20462, 2);
    });

    it("converts price per kg to price per lb", () => {
      // $2.20/kg should be ~$1.00/lb
      const result = convertUnitPrice(2.20462, "kg", "lb");
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(1.0, 2);
    });
  });

  describe("normalizeIncoterm", () => {
    it("normalizes standard abbreviations", () => {
      expect(normalizeIncoterm("FOB")).toBe("FOB");
      expect(normalizeIncoterm("fob")).toBe("FOB");
      expect(normalizeIncoterm("CIF")).toBe("CIF");
      expect(normalizeIncoterm("EXW")).toBe("EXW");
      expect(normalizeIncoterm("DDP")).toBe("DDP");
    });

    it("normalizes full names", () => {
      expect(normalizeIncoterm("Free on Board")).toBe("FOB");
      expect(normalizeIncoterm("cost and freight")).toBe("CFR");
      expect(normalizeIncoterm("ex works")).toBe("EXW");
    });

    it("normalizes aliases", () => {
      expect(normalizeIncoterm("C&F")).toBe("CFR");
      expect(normalizeIncoterm("CNF")).toBe("CFR");
    });

    it("returns UNKNOWN for unrecognized terms", () => {
      expect(normalizeIncoterm("ASAP")).toBe("UNKNOWN");
      expect(normalizeIncoterm(null)).toBe("UNKNOWN");
      expect(normalizeIncoterm("")).toBe("UNKNOWN");
    });
  });

  describe("isFreightIncluded", () => {
    it("returns true for CIF/CFR/DAP/DDP", () => {
      expect(isFreightIncluded("CIF")).toBe(true);
      expect(isFreightIncluded("CFR")).toBe(true);
      expect(isFreightIncluded("DAP")).toBe(true);
      expect(isFreightIncluded("DDP")).toBe(true);
    });

    it("returns false for FOB/EXW/FCA", () => {
      expect(isFreightIncluded("FOB")).toBe(false);
      expect(isFreightIncluded("EXW")).toBe(false);
      expect(isFreightIncluded("FCA")).toBe(false);
    });
  });

  describe("validateQuoteFields", () => {
    it("identifies missing required fields", () => {
      const result = validateQuoteFields({});
      expect(result.valid).toBe(false);
      expect(result.gaps).toContain("missing_currency");
      expect(result.gaps).toContain("missing_unitPrice");
      expect(result.confidence).toBe(0);
    });

    it("validates a complete quote", () => {
      const result = validateQuoteFields({
        currency: "USD",
        unitPrice: 2.10,
        uom: "kg",
        incoterm: "FOB",
        leadTimeDays: 21,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        paymentTerms: "Net 30",
      });
      expect(result.valid).toBe(true);
      expect(result.gaps).toHaveLength(0);
      expect(result.confidence).toBe(1);
    });

    it("warns on out-of-range values", () => {
      const result = validateQuoteFields({
        currency: "USD", unitPrice: 0.001, uom: "kg", incoterm: "FOB",
        leadTimeDays: 500, validUntil: "2030-01-01", paymentTerms: "Net 30",
      });
      expect(result.warnings.some(w => w.includes("unitPrice_out_of_range"))).toBe(true);
      expect(result.warnings.some(w => w.includes("leadTimeDays_out_of_range"))).toBe(true);
    });
  });

  describe("normalizeQuote", () => {
    it("normalizes a full quote with currency conversion", () => {
      const result = normalizeQuote({
        rfqId: "RFQ-2025-00017",
        vendorId: "VEND-001",
        quoteId: 1,
        currency: "EUR",
        unitPrice: 2.00,
        quantity: 5000,
        uom: "kg",
        incoterm: "FOB",
        leadTimeDays: 21,
        validUntil: "2025-09-30",
        paymentTerms: "Net 30",
        surcharges: [{ type: "fuel", amount: 0.05, per: "kg" }],
      }, { targetCurrency: "USD" });

      expect(result.currency).toBe("USD");
      expect(result.originalCurrency).toBe("EUR");
      expect(result.unitPrice).not.toBe(2.00); // should be converted
      expect(result.incoterm).toBe("FOB");
      expect(result.freightIncluded).toBe(false);
      expect(result.normalization.fxRate).not.toBeNull();
      expect(result.lineItems[0].uom).toBe("kg");
    });

    it("skips currency conversion when same currency", () => {
      const result = normalizeQuote({
        currency: "USD", unitPrice: 5.00, uom: "lb",
      }, { targetCurrency: "USD" });

      expect(result.unitPrice).toBe(5.00);
      expect(result.normalization.fxRate).toBeNull();
    });

    it("maps shipping/handling to surcharges", () => {
      const result = normalizeQuote({
        currency: "USD", unitPrice: 10, uom: "kg",
        shippingCost: 500, handlingFee: 100,
      });

      expect(result.surcharges).toHaveLength(2);
      expect(result.surcharges[0].type).toBe("shipping");
      expect(result.surcharges[1].type).toBe("handling");
    });

    it("detects freight inclusion from Incoterm", () => {
      const cif = normalizeQuote({ currency: "USD", unitPrice: 10, uom: "kg", incoterm: "CIF" });
      expect(cif.freightIncluded).toBe(true);

      const exw = normalizeQuote({ currency: "USD", unitPrice: 10, uom: "kg", incoterm: "EXW" });
      expect(exw.freightIncluded).toBe(false);
    });
  });

  describe("convertCurrency", () => {
    it("converts EUR to USD", () => {
      const result = convertCurrency(100, "EUR", "USD");
      expect(result).not.toBeNull();
      expect(result!.value).toBeGreaterThan(100); // EUR > USD
    });

    it("returns null for unknown currency", () => {
      expect(convertCurrency(100, "XYZ", "USD")).toBeNull();
    });

    it("returns same amount for same currency", () => {
      const result = convertCurrency(100, "USD", "USD");
      expect(result!.value).toBe(100);
      expect(result!.rate).toBe(1);
    });
  });

  describe("generateClarificationRequest", () => {
    it("generates email for missing fields", () => {
      const body = generateClarificationRequest(
        ["missing_currency", "missing_incoterm"],
        "RFQ-2025-00017",
        "Acme Corp"
      );
      expect(body).toContain("Acme Corp");
      expect(body).toContain("RFQ-2025-00017");
      expect(body).toContain("currency");
      expect(body).toContain("Incoterm");
    });

    it("returns empty string when no missing fields", () => {
      expect(generateClarificationRequest(["price_anomaly"], "RFQ-1", "Vendor")).toBe("");
    });
  });
});
