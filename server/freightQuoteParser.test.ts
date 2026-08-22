import { describe, it, expect } from "vitest";
import {
  coerceFreightExtraction,
  parseFreightExtractionJson,
  mergeFreightExtractions,
  findFreightRfqNumber,
  quoteValuesFromExtraction,
  type FreightQuoteExtraction,
} from "./freightQuoteParser";

function extraction(overrides: Partial<FreightQuoteExtraction> = {}): FreightQuoteExtraction {
  return {
    isQuote: true,
    confidence: 80,
    responseType: "quote",
    rfqNumber: null,
    quoteNumber: null,
    carrierName: null,
    freightCost: null,
    fuelSurcharge: null,
    originCharges: null,
    destinationCharges: null,
    customsFees: null,
    insuranceCost: null,
    otherCharges: null,
    totalCost: null,
    currency: null,
    serviceScope: null,
    rateBasis: null,
    chargeableWeightKg: null,
    transitDays: null,
    shippingMode: null,
    routeDescription: null,
    validUntilDate: null,
    notes: null,
    ...overrides,
  };
}

describe("coerceFreightExtraction", () => {
  it("strips currency symbols and separators from amounts", () => {
    const r = coerceFreightExtraction({ freightCost: "$3,450.50", totalCost: "USD 4 200" });
    expect(r.freightCost).toBe(3450.5);
    expect(r.totalCost).toBe(4200);
  });

  it("normalizes the currency code and rejects nonsense", () => {
    expect(coerceFreightExtraction({ currency: "eur" }).currency).toBe("EUR");
    expect(coerceFreightExtraction({ currency: "dollars" }).currency).toBeNull();
  });

  it("maps carrier scope wording onto the canonical scope", () => {
    expect(coerceFreightExtraction({ serviceScope: "CY/CY" }).serviceScope).toBe("port_to_port");
    expect(coerceFreightExtraction({ serviceScope: "Door to Door" }).serviceScope).toBe("door_to_door");
  });

  it("drops an unrecognised scope rather than guessing", () => {
    expect(coerceFreightExtraction({ serviceScope: "all-in" }).serviceScope).toBeNull();
  });

  it("accepts a rate basis only from the known set", () => {
    expect(coerceFreightExtraction({ rateBasis: "per kg" }).rateBasis).toBe("per_kg");
    expect(coerceFreightExtraction({ rateBasis: "Per-Container" }).rateBasis).toBe("per_container");
    expect(coerceFreightExtraction({ rateBasis: "per pallet" }).rateBasis).toBeNull();
  });

  it("falls back to 'other' for an unknown response type", () => {
    expect(coerceFreightExtraction({ responseType: "maybe" }).responseType).toBe("other");
    expect(coerceFreightExtraction({ responseType: "decline" }).responseType).toBe("decline");
  });

  it("treats the string 'null' as absent", () => {
    expect(coerceFreightExtraction({ quoteNumber: "null" }).quoteNumber).toBeNull();
  });
});

describe("parseFreightExtractionJson", () => {
  it("parses a fenced JSON block", () => {
    const r = parseFreightExtractionJson('```json\n{"isQuote":true,"totalCost":1500}\n```');
    expect(r.isQuote).toBe(true);
    expect(r.totalCost).toBe(1500);
  });

  it("recovers JSON embedded in prose", () => {
    const r = parseFreightExtractionJson('Here is the quote:\n{"isQuote":true,"freightCost":900}\nHope that helps.');
    expect(r.freightCost).toBe(900);
  });

  it("returns an empty extraction for unparseable output rather than throwing", () => {
    const r = parseFreightExtractionJson("the carrier did not attach rates");
    expect(r.isQuote).toBe(false);
    expect(r.totalCost).toBeNull();
  });
});

describe("mergeFreightExtractions", () => {
  it("lets the attachment win field-by-field over the body", () => {
    const body = extraction({ freightCost: 3000, transitDays: 30, confidence: 40 });
    const sheet = extraction({ freightCost: 3250, currency: "EUR", confidence: 90 });
    const merged = mergeFreightExtractions(body, sheet);
    expect(merged.freightCost).toBe(3250);
    expect(merged.currency).toBe("EUR");
    // Body-only values survive where the sheet had nothing.
    expect(merged.transitDays).toBe(30);
    expect(merged.confidence).toBe(90);
  });

  it("keeps a quote verdict from either source", () => {
    const body = extraction({ isQuote: false, responseType: "other" });
    const sheet = extraction({ isQuote: true, responseType: "quote", totalCost: 5000 });
    const merged = mergeFreightExtractions(body, sheet);
    expect(merged.isQuote).toBe(true);
    expect(merged.responseType).toBe("quote");
  });

  it("concatenates notes so nothing a parser flagged is dropped", () => {
    const merged = mergeFreightExtractions(
      extraction({ notes: "THC excluded" }),
      extraction({ notes: "read the LCL row" }),
    );
    expect(merged.notes).toBe("THC excluded | read the LCL row");
  });

  it("returns the single extraction unchanged", () => {
    const only = extraction({ freightCost: 100 });
    expect(mergeFreightExtractions(only)).toEqual(only);
  });
});

describe("findFreightRfqNumber", () => {
  it("finds a reference in the subject", () => {
    expect(findFreightRfqNumber("Re: FRFQ-20260812-AB12 rates")).toBe("FRFQ-20260812-AB12");
  });

  it("scans later texts when the first has no reference", () => {
    expect(findFreightRfqNumber("Re: your enquiry", "against RFQ-4471")).toBe("RFQ-4471");
  });

  it("returns null when nothing matches", () => {
    expect(findFreightRfqNumber("rates attached", null)).toBeNull();
  });
});

describe("quoteValuesFromExtraction", () => {
  it("maps an extraction onto the freightQuotes insert shape", () => {
    const values = quoteValuesFromExtraction(
      extraction({
        freightCost: 3000,
        fuelSurcharge: 420,
        currency: "EUR",
        serviceScope: "port_to_port",
        rateBasis: "per_kg",
        chargeableWeightKg: 5010,
        transitDays: 28,
        validUntilDate: "2026-09-30",
      }),
      { rfqId: 7, carrierId: 3, rawEmailContent: "body text" },
    );
    expect(values.rfqId).toBe(7);
    expect(values.carrierId).toBe(3);
    expect(values.freightCost).toBe("3000");
    expect(values.fuelSurcharge).toBe("420");
    expect(values.currency).toBe("EUR");
    expect(values.serviceScope).toBe("port_to_port");
    expect(values.chargeableWeightKg).toBe("5010");
    expect(values.validUntil?.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(values.status).toBe("received");
    expect(values.receivedVia).toBe("email");
  });

  it("defaults currency to USD when the carrier did not state one", () => {
    const values = quoteValuesFromExtraction(extraction({ totalCost: 100 }), {
      rfqId: 1,
      carrierId: 1,
    });
    expect(values.currency).toBe("USD");
  });

  it("drops an unparseable validity date rather than storing an invalid one", () => {
    const values = quoteValuesFromExtraction(extraction({ validUntilDate: "end of month" }), {
      rfqId: 1,
      carrierId: 1,
    });
    expect(values.validUntil).toBeUndefined();
  });

  it("truncates raw email content to the column budget", () => {
    const values = quoteValuesFromExtraction(extraction({ totalCost: 1 }), {
      rfqId: 1,
      carrierId: 1,
      rawEmailContent: "x".repeat(9000),
    });
    expect(values.rawEmailContent?.length).toBe(5000);
  });
});
