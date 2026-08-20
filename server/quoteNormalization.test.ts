import { describe, it, expect } from "vitest";
import {
  basisFromRfq,
  computeNormalizedQuote,
  incotermGaps,
  parseIncoterm,
  rankNormalizedQuotes,
  type NormalizationBasis,
  type NormalizationQuoteInput,
  type NormalizedQuote,
} from "./quoteNormalization";
import type { FxRate } from "./currencyService";

const BASIS: NormalizationBasis = {
  requiredQuantity: 1000,
  baseCurrency: "USD",
  targetIncoterm: "DDP",
  freightAllowancePerUnit: null,
  freightAllowancePct: null,
  dutyRatePct: null,
  insuranceRatePct: null,
  amortizeToolingOverUnits: null,
};

function quote(overrides: Partial<NormalizationQuoteInput> = {}): NormalizationQuoteInput {
  return {
    id: 1,
    vendorId: 10,
    currency: "USD",
    unitPrice: 2,
    quantity: 1000,
    totalPrice: 2000,
    shippingCost: null,
    handlingFee: null,
    taxAmount: null,
    otherCharges: null,
    insuranceCost: null,
    customsDutyAmount: null,
    minimumOrderQty: null,
    toolingCost: null,
    toolingAmortizationUnits: null,
    toolingIsRefundable: false,
    incoterms: "DDP",
    leadTimeDays: 30,
    validUntil: null,
    ...overrides,
  };
}

const usdToEur = (rate: number): FxRate => ({
  from: "EUR",
  to: "USD",
  rate,
  asOf: new Date("2026-08-01T00:00:00Z"),
  source: "direct",
  provider: "manual",
});

describe("parseIncoterm", () => {
  it("reads a bare code", () => {
    expect(parseIncoterm("FOB")).toEqual({ code: "FOB", namedPlace: null });
  });

  it("splits the named place off the code", () => {
    expect(parseIncoterm("FOB Ningbo")).toEqual({ code: "FOB", namedPlace: "Ningbo" });
    expect(parseIncoterm("cif/long beach")).toEqual({ code: "CIF", namedPlace: "Long Beach" });
  });

  it("returns null for unusable input", () => {
    expect(parseIncoterm("ex works-ish")).toEqual({ code: null, namedPlace: null });
    expect(parseIncoterm(null)).toEqual({ code: null, namedPlace: null });
  });
});

describe("incotermGaps", () => {
  it("reports every bucket an EXW quote leaves with the buyer under DDP", () => {
    expect(incotermGaps("EXW", "DDP")).toEqual([
      "originHandling",
      "mainCarriage",
      "insurance",
      "importClearance",
      "destinationDelivery",
    ]);
  });

  it("reports only the unshipped legs for FOB under DDP", () => {
    expect(incotermGaps("FOB", "DDP")).toEqual([
      "mainCarriage",
      "insurance",
      "importClearance",
      "destinationDelivery",
    ]);
  });

  it("reports duty only for DAP under DDP", () => {
    expect(incotermGaps("DAP", "DDP")).toEqual(["insurance", "importClearance"]);
  });

  it("reports nothing when the quote already meets the target", () => {
    expect(incotermGaps("DDP", "DDP")).toEqual([]);
    expect(incotermGaps("DDP", "FOB")).toEqual([]);
  });
});

describe("computeNormalizedQuote — goods and MOQ", () => {
  it("prices goods at the required quantity when there is no MOQ", () => {
    const r = computeNormalizedQuote(quote(), BASIS, null);
    expect(r.comparable).toBe(true);
    expect(r.billableQuantity).toBe(1000);
    expect(r.moqShortfallUnits).toBe(0);
    expect(r.landedTotalCost).toBe(2000);
    expect(r.landedUnitCost).toBe(2);
  });

  it("charges the MOQ and pushes the surplus into the unit cost", () => {
    const r = computeNormalizedQuote(quote({ minimumOrderQty: 2500 }), BASIS, null);
    expect(r.billableQuantity).toBe(2500);
    expect(r.moqShortfallUnits).toBe(1500);
    expect(r.landedTotalCost).toBe(5000);
    // Cost per unit we actually needed, not per unit purchased.
    expect(r.landedUnitCost).toBe(5);
    expect(r.warnings.map(w => w.code)).toContain("moq_above_requirement");
  });

  it("ignores an MOQ below the requirement", () => {
    const r = computeNormalizedQuote(quote({ minimumOrderQty: 100 }), BASIS, null);
    expect(r.billableQuantity).toBe(1000);
    expect(r.moqShortfallUnits).toBe(0);
  });

  it("derives a unit price from the quoted total when none is given", () => {
    const r = computeNormalizedQuote(
      quote({ unitPrice: null, totalPrice: 3000, quantity: 1000 }),
      BASIS,
      null,
    );
    expect(r.unitPrice).toBe(3);
    expect(r.landedTotalCost).toBe(3000);
    expect(r.warnings.map(w => w.code)).toContain("missing_unit_price");
  });

  it("is not comparable when there is no usable price at all", () => {
    const r = computeNormalizedQuote(quote({ unitPrice: null, totalPrice: null }), BASIS, null);
    expect(r.comparable).toBe(false);
  });

  it("flags a quote priced against a materially different quantity", () => {
    const r = computeNormalizedQuote(quote({ quantity: 500 }), BASIS, null);
    expect(r.warnings.map(w => w.code)).toContain("quantity_basis_mismatch");
  });
});

describe("computeNormalizedQuote — Incoterm gap allowances", () => {
  const withAllowances: NormalizationBasis = {
    ...BASIS,
    freightAllowancePerUnit: 0.5,
    dutyRatePct: 10,
    insuranceRatePct: 1,
  };

  it("adds freight, insurance and duty for an EXW quote leveled to DDP", () => {
    const r = computeNormalizedQuote(quote({ incoterms: "EXW" }), withAllowances, null);
    // goods 2000 + freight 500 + insurance 1% of 2500 = 25 + duty 10% of 2525 = 252.5
    expect(r.landedTotalCost).toBe(2777.5);
    expect(r.incoterms.gaps).toContain("mainCarriage");
    expect(r.incoterms.unpricedGaps).toEqual([]);
  });

  it("adds only duty and insurance for a DAP quote", () => {
    const r = computeNormalizedQuote(quote({ incoterms: "DAP" }), withAllowances, null);
    // goods 2000 + insurance 20 + duty 10% of 2020 = 202
    expect(r.landedTotalCost).toBe(2222);
    expect(r.breakdown.find(b => b.key === "freight_allowance")).toBeUndefined();
  });

  it("adds nothing when the quote already meets the target basis", () => {
    const r = computeNormalizedQuote(quote({ incoterms: "DDP" }), withAllowances, null);
    expect(r.landedTotalCost).toBe(2000);
  });

  it("does not double-charge freight when the vendor priced shipping explicitly", () => {
    const r = computeNormalizedQuote(
      quote({ incoterms: "EXW", shippingCost: 400 }),
      withAllowances,
      null,
    );
    // goods 2000 + quoted shipping 400 + insurance 24 + duty 242.4 — no allowance on top
    expect(r.landedTotalCost).toBe(2666.4);
    expect(r.breakdown.find(b => b.key === "freight_allowance")).toBeUndefined();
  });

  it("prefers the vendor's own duty figure over the allowance rate", () => {
    const r = computeNormalizedQuote(
      quote({ incoterms: "DAP", customsDutyAmount: 100 }),
      withAllowances,
      null,
    );
    expect(r.breakdown.find(b => b.key === "duty_allowance")).toBeUndefined();
    expect(r.breakdown.find(b => b.key === "duty")?.amount).toBe(100);
  });

  it("warns loudly rather than silently under-pricing an unfunded gap", () => {
    const r = computeNormalizedQuote(quote({ incoterms: "EXW" }), BASIS, null);
    const warning = r.warnings.find(w => w.code === "incoterm_gap_unpriced");
    expect(warning?.understatesCost).toBe(true);
    expect(r.incoterms.unpricedGaps.length).toBeGreaterThan(0);
    // Still comparable — the number is just known to be a floor.
    expect(r.landedTotalCost).toBe(2000);
  });

  it("treats a missing Incoterm as the target basis and says so", () => {
    const r = computeNormalizedQuote(quote({ incoterms: null }), withAllowances, null);
    expect(r.warnings.map(w => w.code)).toContain("incoterm_missing");
    expect(r.landedTotalCost).toBe(2000);
  });
});

describe("computeNormalizedQuote — tooling amortization", () => {
  it("amortizes tooling over the program volume, not the order", () => {
    const r = computeNormalizedQuote(
      quote({ toolingCost: 10000, toolingAmortizationUnits: 50000 }),
      BASIS,
      null,
    );
    expect(r.toolingPerUnit).toBeCloseTo(0.2, 6);
    // goods 2000 + tooling 0.2 * 1000 = 200
    expect(r.landedTotalCost).toBe(2200);
  });

  it("falls back to the RFQ program volume when the quote omits one", () => {
    const r = computeNormalizedQuote(
      quote({ toolingCost: 10000 }),
      { ...BASIS, amortizeToolingOverUnits: 20000 },
      null,
    );
    expect(r.toolingPerUnit).toBeCloseTo(0.5, 6);
    expect(r.landedTotalCost).toBe(2500);
  });

  it("charges tooling to this order alone when no volume is known, and warns", () => {
    const r = computeNormalizedQuote(quote({ toolingCost: 10000 }), BASIS, null);
    expect(r.landedTotalCost).toBe(12000);
    expect(r.warnings.map(w => w.code)).toContain("tooling_amortized_over_order_only");
  });

  it("excludes refundable tooling from landed cost but flags it", () => {
    const r = computeNormalizedQuote(
      quote({ toolingCost: 10000, toolingIsRefundable: true }),
      BASIS,
      null,
    );
    expect(r.landedTotalCost).toBe(2000);
    expect(r.warnings.map(w => w.code)).toContain("refundable_tooling_excluded");
  });
});

describe("computeNormalizedQuote — currency", () => {
  it("converts a foreign-currency quote at the supplied rate", () => {
    const r = computeNormalizedQuote(quote({ currency: "EUR" }), BASIS, usdToEur(1.1));
    expect(r.landedTotalCost).toBe(2200);
    expect(r.fx?.rate).toBe(1.1);
    expect(r.comparable).toBe(true);
  });

  it("refuses to compare a foreign quote with no rate on file", () => {
    const r = computeNormalizedQuote(quote({ currency: "EUR" }), BASIS, null);
    expect(r.comparable).toBe(false);
    expect(r.landedTotalCost).toBeNull();
    expect(r.warnings.map(w => w.code)).toContain("fx_rate_unavailable");
  });

  it("needs no rate when the quote is already in the base currency", () => {
    const r = computeNormalizedQuote(quote({ currency: "USD" }), BASIS, null);
    expect(r.comparable).toBe(true);
    expect(r.landedTotalCost).toBe(2000);
  });
});

describe("computeNormalizedQuote — validity", () => {
  it("flags a lapsed quote", () => {
    const r = computeNormalizedQuote(
      quote({ validUntil: new Date("2026-01-01") }),
      BASIS,
      null,
      new Date("2026-08-20"),
    );
    expect(r.warnings.map(w => w.code)).toContain("quote_expired");
  });
});

describe("rankNormalizedQuotes", () => {
  it("ranks by landed cost and leaves incomparable quotes unranked", () => {
    const cheapButExw = computeNormalizedQuote(
      quote({ id: 1, unitPrice: 1.5, incoterms: "EXW" }),
      { ...BASIS, freightAllowancePerUnit: 1, dutyRatePct: 10 },
      null,
    );
    const pricierButDdp = computeNormalizedQuote(
      quote({ id: 2, unitPrice: 2.2, incoterms: "DDP" }),
      { ...BASIS, freightAllowancePerUnit: 1, dutyRatePct: 10 },
      null,
    );
    const noRate = computeNormalizedQuote(
      quote({ id: 3, unitPrice: 1, currency: "EUR" }),
      BASIS,
      null,
    );

    const ranked = rankNormalizedQuotes([cheapButExw, pricierButDdp, noRate]);
    const byId = new Map(ranked.map(r => [r.quoteId, r]));

    // EXW at 1.5 lands at 1500 + 1000 freight + 250 duty = 2750; DDP at 2.2 = 2200.
    expect(byId.get(2)!.rank).toBe(1);
    expect(byId.get(1)!.rank).toBe(2);
    // The headline price ordering is the opposite of the landed ordering.
    expect(byId.get(2)!.unitPrice).toBeGreaterThan(byId.get(1)!.unitPrice as number);
    expect(byId.get(3)!.rank).toBeNull();
  });

  it("handles a set with nothing comparable", () => {
    const only = computeNormalizedQuote(quote({ currency: "EUR" }), BASIS, null);
    const ranked = rankNormalizedQuotes([only]);
    expect(ranked[0].rank).toBeNull();
  });
});

describe("basisFromRfq", () => {
  it("defaults to USD / DDP when the RFQ says nothing", () => {
    const basis = basisFromRfq({ quantity: "500" });
    expect(basis).toMatchObject({
      requiredQuantity: 500,
      baseCurrency: "USD",
      targetIncoterm: "DDP",
    });
  });

  it("prefers the explicit target Incoterm over the RFQ's requested one", () => {
    const basis = basisFromRfq({ quantity: "10", incoterms: "FOB", targetIncoterms: "DAP" });
    expect(basis.targetIncoterm).toBe("DAP");
  });

  it("falls back to the requested Incoterm when no target is set", () => {
    const basis = basisFromRfq({ quantity: "10", incoterms: "FOB" });
    expect(basis.targetIncoterm).toBe("FOB");
  });

  it("reads the allowance rates as numbers", () => {
    const basis = basisFromRfq({
      quantity: "100",
      baseCurrency: "eur",
      freightAllowancePct: "3.5",
      dutyRatePct: "12",
      insuranceRatePct: "0.5",
      amortizeToolingOverUnits: "25000",
    });
    expect(basis.baseCurrency).toBe("EUR");
    expect(basis.freightAllowancePct).toBe(3.5);
    expect(basis.dutyRatePct).toBe(12);
    expect(basis.insuranceRatePct).toBe(0.5);
    expect(basis.amortizeToolingOverUnits).toBe(25000);
  });
});

describe("worked example: the cheapest headline price is not the cheapest bid", () => {
  it("levels three vendors onto one basis", () => {
    const basis: NormalizationBasis = {
      requiredQuantity: 10000,
      baseCurrency: "USD",
      targetIncoterm: "DDP",
      freightAllowancePerUnit: 0.15,
      freightAllowancePct: null,
      dutyRatePct: 6,
      insuranceRatePct: 0.5,
      amortizeToolingOverUnits: 100000,
    };

    // Cheapest sticker price, but EXW, in EUR, with an MOQ over-buy and tooling.
    const vendorA = computeNormalizedQuote(
      quote({
        id: 1,
        currency: "EUR",
        unitPrice: 1.0,
        quantity: 10000,
        totalPrice: null,
        incoterms: "EXW",
        minimumOrderQty: 12000,
        toolingCost: 8000,
      }),
      basis,
      usdToEur(1.08),
    );

    // Middle sticker price, delivered duty paid, no surprises.
    const vendorB = computeNormalizedQuote(
      quote({ id: 2, currency: "USD", unitPrice: 1.35, quantity: 10000, totalPrice: null, incoterms: "DDP" }),
      basis,
      null,
    );

    // Highest sticker price, FOB, freight and duty on us.
    const vendorC = computeNormalizedQuote(
      quote({ id: 3, currency: "USD", unitPrice: 1.4, quantity: 10000, totalPrice: null, incoterms: "FOB" }),
      basis,
      null,
    );

    const ranked = rankNormalizedQuotes([vendorA, vendorB, vendorC]);
    const byId = new Map<number, NormalizedQuote>(ranked.map(r => [r.quoteId, r]));

    // Vendor A: goods 12000 EUR + freight 1800 + insurance 69 + duty 832.14
    //           + tooling 0.08 * 12000 = 960  => 15661.14 EUR * 1.08 = 16914.03 USD
    expect(byId.get(1)!.landedTotalCost).toBeCloseTo(16914.03, 2);
    // Vendor B: 13500 USD flat.
    expect(byId.get(2)!.landedTotalCost).toBeCloseTo(13500, 2);
    // Vendor C: goods 14000 + freight 1500 + insurance 77.5 + duty 934.65 = 16512.15
    expect(byId.get(3)!.landedTotalCost).toBeCloseTo(16512.15, 2);

    // The cheapest per-unit quote is the most expensive bid once leveled.
    expect(byId.get(2)!.rank).toBe(1);
    expect(byId.get(3)!.rank).toBe(2);
    expect(byId.get(1)!.rank).toBe(3);
  });
});
