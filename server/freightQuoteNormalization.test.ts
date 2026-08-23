import { describe, it, expect } from "vitest";
import {
  basisFromFreightRfq,
  computeChargeableWeight,
  computeNormalizedFreightQuote,
  dimFactorForMode,
  parseServiceScope,
  rankNormalizedFreightQuotes,
  scopeGaps,
  DEFAULT_TARGET_SCOPE,
  type FreightNormalizationBasis,
  type FreightNormalizationQuoteInput,
  type NormalizedFreightQuote,
} from "./freightQuoteNormalization";
import type { FxRate } from "./currencyService";

const BASIS: FreightNormalizationBasis = {
  baseCurrency: "USD",
  targetScope: "door_to_door",
  weightKg: 2000,
  volumeCbm: 10,
  declaredValue: 50_000,
  dimFactor: 167,
  originHaulageAllowance: null,
  destinationHaulageAllowance: null,
  customsClearanceAllowance: null,
  insuranceRatePct: null,
  insuranceRequired: false,
  customsClearanceRequired: false,
  requiredTransitDays: null,
};

function quote(
  overrides: Partial<FreightNormalizationQuoteInput> = {},
): FreightNormalizationQuoteInput {
  return {
    id: 1,
    carrierId: 10,
    currency: "USD",
    freightCost: 3000,
    fuelSurcharge: null,
    originCharges: null,
    destinationCharges: null,
    customsFees: null,
    insuranceCost: null,
    otherCharges: null,
    totalCost: null,
    serviceScope: "door_to_door",
    chargeableWeightKg: null,
    transitDays: 30,
    validUntil: null,
    ...overrides,
  };
}

const usdToEur: FxRate = {
  from: "EUR",
  to: "USD",
  rate: 1.1,
  asOf: new Date("2026-08-01T00:00:00Z"),
  source: "direct",
  provider: "manual",
};

function warningCodes(r: NormalizedFreightQuote): string[] {
  return r.warnings.map(w => w.code);
}

describe("parseServiceScope", () => {
  it.each([
    ["port to port", "port_to_port"],
    ["P2P", "port_to_port"],
    ["CY/CY", "port_to_port"],
    ["door-to-door", "door_to_door"],
    ["DTD", "door_to_door"],
    ["Door to Port", "door_to_port"],
    ["port_to_door", "port_to_door"],
    ["CFS/CY", "port_to_door"],
  ])("parses %s", (input, expected) => {
    expect(parseServiceScope(input)).toBe(expected);
  });

  it("returns null for unrecognised text rather than guessing", () => {
    expect(parseServiceScope("all-in service")).toBeNull();
    expect(parseServiceScope("")).toBeNull();
    expect(parseServiceScope(null)).toBeNull();
  });
});

describe("scopeGaps", () => {
  it("reports no gap when the carrier covers the target scope", () => {
    expect(scopeGaps("door_to_door", "door_to_door")).toEqual([]);
  });

  it("reports both haulage legs for a port-to-port quote against door-to-door", () => {
    expect(scopeGaps("port_to_port", "door_to_door")).toEqual([
      "originHaulage",
      "destinationHaulage",
    ]);
  });

  it("treats an unknown scope conservatively as port-to-port", () => {
    expect(scopeGaps(null, "door_to_door")).toEqual(["originHaulage", "destinationHaulage"]);
  });

  it("reports only the missing leg for a partial scope", () => {
    expect(scopeGaps("door_to_port", "door_to_door")).toEqual(["destinationHaulage"]);
    expect(scopeGaps("port_to_door", "door_to_door")).toEqual(["originHaulage"]);
  });
});

describe("computeChargeableWeight", () => {
  it("bills on actual weight when it exceeds volumetric", () => {
    // 2 CBM at 167 kg/CBM = 334 kg volumetric, against 2000 kg actual.
    const cw = computeChargeableWeight(2000, 2, 167);
    expect(cw.chargeableKg).toBe(2000);
    expect(cw.governedBy).toBe("actual");
  });

  it("bills on volumetric weight for light, bulky cargo", () => {
    // 30 CBM at 167 kg/CBM = 5010 kg volumetric, against 500 kg actual.
    const cw = computeChargeableWeight(500, 30, 167);
    expect(cw.volumetricKg).toBeCloseTo(5010, 6);
    expect(cw.chargeableKg).toBeCloseTo(5010, 6);
    expect(cw.governedBy).toBe("volumetric");
  });

  it("falls back to actual weight when no divisor applies (FCL, rail)", () => {
    const cw = computeChargeableWeight(18_000, 60, null);
    expect(cw.chargeableKg).toBe(18_000);
    expect(cw.governedBy).toBe("actual");
    expect(cw.volumetricKg).toBeNull();
  });

  it("reports unknown when neither weight nor volume is usable", () => {
    const cw = computeChargeableWeight(null, null, 167);
    expect(cw.chargeableKg).toBeNull();
    expect(cw.governedBy).toBe("unknown");
  });
});

describe("dimFactorForMode", () => {
  it("uses the IATA divisor for air and W/M for LCL sea", () => {
    expect(dimFactorForMode("air")).toBe(167);
    expect(dimFactorForMode("ocean_lcl")).toBe(1000);
  });

  it("returns null for per-container modes so no volumetric compare is made", () => {
    expect(dimFactorForMode("ocean_fcl")).toBeNull();
    expect(dimFactorForMode("rail")).toBeNull();
  });

  it("returns null for an unknown mode", () => {
    expect(dimFactorForMode("teleport")).toBeNull();
    expect(dimFactorForMode(null)).toBeNull();
  });
});

describe("computeNormalizedFreightQuote", () => {
  it("sums quoted components into the landed total", () => {
    const r = computeNormalizedFreightQuote(
      quote({
        freightCost: 3000,
        fuelSurcharge: 400,
        originCharges: 250,
        destinationCharges: 300,
        customsFees: 150,
      }),
      BASIS,
      null,
    );
    expect(r.landedTotalCost).toBe(4100);
    expect(r.comparable).toBe(true);
  });

  it("prices an unpriced scope gap as a warning, not a guess", () => {
    const r = computeNormalizedFreightQuote(
      quote({ serviceScope: "port_to_port", freightCost: 3000 }),
      BASIS,
      null,
    );
    expect(r.landedTotalCost).toBe(3000);
    expect(r.scope.unpricedGaps).toEqual(["originHaulage", "destinationHaulage"]);
    expect(warningCodes(r)).toContain("scope_gap_unpriced");
    expect(r.warnings.find(w => w.code === "scope_gap_unpriced")?.understatesCost).toBe(true);
  });

  it("fills a scope gap from the configured allowance", () => {
    const r = computeNormalizedFreightQuote(
      quote({ serviceScope: "port_to_port", freightCost: 3000 }),
      { ...BASIS, originHaulageAllowance: 400, destinationHaulageAllowance: 600 },
      null,
    );
    expect(r.landedTotalCost).toBe(4000);
    expect(r.scope.unpricedGaps).toEqual([]);
    expect(warningCodes(r)).not.toContain("scope_gap_unpriced");
    expect(r.breakdown.filter(b => b.source === "allowance")).toHaveLength(2);
  });

  it("does not double-count a leg the carrier itemised despite its scope label", () => {
    // Scope says port-to-port but origin charges are quoted: the leg is covered.
    const r = computeNormalizedFreightQuote(
      quote({ serviceScope: "port_to_port", freightCost: 3000, originCharges: 350 }),
      { ...BASIS, originHaulageAllowance: 400, destinationHaulageAllowance: 600 },
      null,
    );
    expect(r.landedTotalCost).toBe(3950); // 3000 + 350 quoted + 600 destination allowance
    expect(r.breakdown.some(b => b.key === "allowance_originHaulage")).toBe(false);
  });

  it("carries an unitemised difference when the total exceeds named charges", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 3000, fuelSurcharge: 400, totalCost: 4200 }),
      BASIS,
      null,
    );
    expect(warningCodes(r)).toContain("total_disagrees_with_components");
    expect(r.landedTotalCost).toBe(4200);
    expect(r.breakdown.find(b => b.key === "unitemised")?.amount).toBe(800);
  });

  it("keeps the itemised figures when they exceed the quoted total", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 3000, fuelSurcharge: 900, totalCost: 3200 }),
      BASIS,
      null,
    );
    expect(warningCodes(r)).toContain("total_disagrees_with_components");
    expect(r.landedTotalCost).toBe(3900);
  });

  it("uses the quoted total when nothing is itemised", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: null, totalCost: 5000 }),
      BASIS,
      null,
    );
    expect(r.landedTotalCost).toBe(5000);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].key).toBe("total");
  });

  it("derives cost per chargeable kg on the volumetric weight when it governs", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 5010 }),
      { ...BASIS, weightKg: 500, volumeCbm: 30, dimFactor: 167 },
      null,
    );
    expect(r.chargeableWeight.chargeableKg).toBeCloseTo(5010, 3);
    expect(r.costPerChargeableKg).toBeCloseTo(1, 6);
    expect(warningCodes(r)).toContain("volumetric_governs");
  });

  it("flags a carrier chargeable weight materially below the computed one", () => {
    const r = computeNormalizedFreightQuote(
      quote({ chargeableWeightKg: 500 }),
      { ...BASIS, weightKg: 500, volumeCbm: 30, dimFactor: 167 },
      null,
    );
    const w = r.warnings.find(x => x.code === "carrier_chargeable_weight_differs");
    expect(w?.understatesCost).toBe(true);
  });

  it("accepts a carrier chargeable weight within tolerance without flagging", () => {
    const r = computeNormalizedFreightQuote(
      quote({ chargeableWeightKg: 2010 }),
      BASIS,
      null,
    );
    expect(warningCodes(r)).not.toContain("carrier_chargeable_weight_differs");
  });

  it("adds an insurance allowance when cover is required but not quoted", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 3000 }),
      { ...BASIS, insuranceRequired: true, insuranceRatePct: 0.2, declaredValue: 50_000 },
      null,
    );
    // 0.2% of 50,000 = 100
    expect(r.landedTotalCost).toBe(3100);
    expect(r.breakdown.some(b => b.key === "allowance_insurance")).toBe(true);
  });

  it("warns rather than guessing when insurance is required but unpriceable", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 3000 }),
      { ...BASIS, insuranceRequired: true, insuranceRatePct: null },
      null,
    );
    expect(r.landedTotalCost).toBe(3000);
    const w = r.warnings.find(x => x.code === "insurance_not_carried");
    expect(w?.understatesCost).toBe(true);
  });

  it("adds a customs allowance when clearance is required but not quoted", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 3000 }),
      { ...BASIS, customsClearanceRequired: true, customsClearanceAllowance: 250 },
      null,
    );
    expect(r.landedTotalCost).toBe(3250);
  });

  it("does not add a customs allowance when the carrier already charges for it", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: 3000, customsFees: 180 }),
      { ...BASIS, customsClearanceRequired: true, customsClearanceAllowance: 250 },
      null,
    );
    expect(r.landedTotalCost).toBe(3180);
  });

  it("converts a foreign-currency quote at the supplied dated rate", () => {
    const r = computeNormalizedFreightQuote(
      quote({ currency: "EUR", freightCost: 3000 }),
      BASIS,
      usdToEur,
    );
    expect(r.landedTotalCost).toBe(3300);
    expect(r.comparable).toBe(true);
    expect(r.fx?.rate).toBe(1.1);
    // Breakdown stays in the quote's own currency; only the total is converted.
    expect(r.breakdown.find(b => b.key === "freight")?.amount).toBe(3000);
  });

  it("refuses to compare a foreign-currency quote with no rate on file", () => {
    const r = computeNormalizedFreightQuote(
      quote({ currency: "EUR", freightCost: 3000 }),
      BASIS,
      null,
    );
    expect(r.comparable).toBe(false);
    expect(r.landedTotalCost).toBeNull();
    expect(warningCodes(r)).toContain("fx_rate_unavailable");
  });

  it("flags an expired quote", () => {
    const r = computeNormalizedFreightQuote(
      quote({ validUntil: new Date("2026-01-01T00:00:00Z") }),
      BASIS,
      null,
      new Date("2026-08-21T00:00:00Z"),
    );
    expect(warningCodes(r)).toContain("quote_expired");
  });

  it("flags transit that misses the requirement without pricing the miss", () => {
    const r = computeNormalizedFreightQuote(
      quote({ transitDays: 45, freightCost: 3000 }),
      { ...BASIS, requiredTransitDays: 30 },
      null,
    );
    expect(warningCodes(r)).toContain("transit_exceeds_requirement");
    expect(r.landedTotalCost).toBe(3000);
  });

  it("marks a quote with no pricing at all as not comparable", () => {
    const r = computeNormalizedFreightQuote(
      quote({ freightCost: null, totalCost: null }),
      BASIS,
      null,
    );
    expect(r.comparable).toBe(false);
    expect(warningCodes(r)).toContain("missing_freight_cost");
  });
});

describe("rankNormalizedFreightQuotes", () => {
  it("ranks comparable quotes cheapest first and excludes the rest", () => {
    const results = [
      computeNormalizedFreightQuote(quote({ id: 1, freightCost: 4000 }), BASIS, null),
      computeNormalizedFreightQuote(quote({ id: 2, freightCost: 3000 }), BASIS, null),
      computeNormalizedFreightQuote(
        quote({ id: 3, currency: "EUR", freightCost: 100 }),
        BASIS,
        null,
      ),
    ];
    rankNormalizedFreightQuotes(results);
    expect(results.find(r => r.quoteId === 2)?.rank).toBe(1);
    expect(results.find(r => r.quoteId === 1)?.rank).toBe(2);
    // Cheapest on paper, but no FX rate — excluded rather than ranked first.
    expect(results.find(r => r.quoteId === 3)?.rank).toBeNull();
  });
});

describe("basisFromFreightRfq", () => {
  it("defaults to door-to-door in USD", () => {
    const basis = basisFromFreightRfq({});
    expect(basis.targetScope).toBe(DEFAULT_TARGET_SCOPE);
    expect(basis.baseCurrency).toBe("USD");
  });

  it("prefers an explicit divisor over the mode default", () => {
    expect(basisFromFreightRfq({ preferredMode: "air", dimFactorKgPerCbm: "200" }).dimFactor).toBe(200);
    expect(basisFromFreightRfq({ preferredMode: "air" }).dimFactor).toBe(167);
  });

  it("derives the transit requirement from the pickup and delivery window", () => {
    const basis = basisFromFreightRfq({
      requiredPickupDate: "2026-08-01T00:00:00Z",
      requiredDeliveryDate: "2026-08-31T00:00:00Z",
    });
    expect(basis.requiredTransitDays).toBe(30);
  });

  it("leaves the transit requirement unset when only one end is known", () => {
    expect(
      basisFromFreightRfq({ requiredDeliveryDate: "2026-08-31T00:00:00Z" }).requiredTransitDays,
    ).toBeNull();
  });

  it("falls back to the RFQ currency when no base currency is set", () => {
    expect(basisFromFreightRfq({ currency: "GBP" }).baseCurrency).toBe("GBP");
  });
});

describe("worked example: the cheapest rate is not the cheapest move", () => {
  // 500 kg / 30 CBM of light freight, air, leveled to door-to-door in USD.
  // Carrier A quotes a low port-to-port rate in EUR; Carrier B quotes door-to-door
  // in USD at a higher headline number.
  const basis: FreightNormalizationBasis = {
    ...BASIS,
    weightKg: 500,
    volumeCbm: 30,
    dimFactor: 167,
    originHaulageAllowance: 450,
    destinationHaulageAllowance: 700,
    customsClearanceRequired: true,
    customsClearanceAllowance: 250,
  };

  it("ranks the door-to-door quote ahead of the cheaper port-to-port one", () => {
    const a = computeNormalizedFreightQuote(
      quote({ id: 1, carrierId: 1, currency: "EUR", freightCost: 4200, serviceScope: "port_to_port" }),
      basis,
      usdToEur,
    );
    const b = computeNormalizedFreightQuote(
      quote({
        id: 2,
        carrierId: 2,
        currency: "USD",
        freightCost: 5200,
        customsFees: 200,
        serviceScope: "door_to_door",
      }),
      basis,
      null,
    );

    // A: (4200 + 450 + 700 + 250) EUR = 5600 EUR -> 6160 USD
    expect(a.landedTotalCost).toBe(6160);
    // B: 5200 + 200 quoted customs = 5400 USD, nothing to add
    expect(b.landedTotalCost).toBe(5400);

    rankNormalizedFreightQuotes([a, b]);
    expect(b.rank).toBe(1);
    expect(a.rank).toBe(2);

    // Both bill on volumetric weight: 30 CBM x 167 = 5010 kg.
    expect(b.costPerChargeableKg).toBeCloseTo(5400 / 5010, 6);
  });
});
