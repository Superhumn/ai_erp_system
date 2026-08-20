import { describe, it, expect } from "vitest";
import {
  coerceExtraction,
  findRfqNumber,
  mergeExtractions,
  parseExtractionJson,
  type VendorQuoteExtraction,
} from "./vendorQuoteParser";

describe("parseExtractionJson", () => {
  it("parses a clean JSON object", () => {
    const r = parseExtractionJson('{"isQuote":true,"confidence":90,"responseType":"quote","unitPrice":2.5}');
    expect(r.isQuote).toBe(true);
    expect(r.unitPrice).toBe(2.5);
  });

  it("strips a fenced code block", () => {
    const r = parseExtractionJson('```json\n{"isQuote":true,"confidence":80,"responseType":"quote"}\n```');
    expect(r.isQuote).toBe(true);
    expect(r.confidence).toBe(80);
  });

  it("digs the object out of surrounding prose", () => {
    const r = parseExtractionJson('Here is the data:\n{"isQuote":true,"confidence":70,"responseType":"quote"}\nHope that helps.');
    expect(r.isQuote).toBe(true);
  });

  it("returns an empty extraction rather than throwing on junk", () => {
    const r = parseExtractionJson("the vendor did not attach pricing");
    expect(r.isQuote).toBe(false);
    expect(r.unitPrice).toBeNull();
  });

  it("handles a null response", () => {
    expect(parseExtractionJson(null).isQuote).toBe(false);
  });
});

describe("coerceExtraction", () => {
  it("strips currency symbols and separators a model left behind", () => {
    const r = coerceExtraction({ unitPrice: "$1,234.56", totalPrice: "€ 2 000" });
    expect(r.unitPrice).toBe(1234.56);
    expect(r.totalPrice).toBe(2000);
  });

  it("normalizes the currency code and rejects a non-code", () => {
    expect(coerceExtraction({ currency: "eur" }).currency).toBe("EUR");
    expect(coerceExtraction({ currency: "euros" }).currency).toBeNull();
    expect(coerceExtraction({ currency: "$" }).currency).toBeNull();
  });

  it("uppercases the Incoterm", () => {
    expect(coerceExtraction({ incoterms: "fob" }).incoterms).toBe("FOB");
  });

  it("maps the string 'null' to a real null", () => {
    expect(coerceExtraction({ quoteNumber: "null" }).quoteNumber).toBeNull();
  });

  it("keeps a false refundable flag distinct from an unstated one", () => {
    expect(coerceExtraction({ toolingIsRefundable: false }).toolingIsRefundable).toBe(false);
    expect(coerceExtraction({}).toolingIsRefundable).toBeNull();
  });

  it("falls back to 'other' for an unknown response type", () => {
    expect(coerceExtraction({ responseType: "banana" }).responseType).toBe("other");
    expect(coerceExtraction({ responseType: "decline" }).responseType).toBe("decline");
  });

  it("does not turn unparseable numbers into zero", () => {
    expect(coerceExtraction({ unitPrice: "on request" }).unitPrice).toBeNull();
    expect(coerceExtraction({ leadTimeDays: "" }).leadTimeDays).toBeNull();
  });
});

describe("findRfqNumber", () => {
  it("finds a reference in a subject line", () => {
    expect(findRfqNumber("Re: RFQ-20260112-AB12 — quotation attached")).toBe("RFQ-20260112-AB12");
  });

  it("finds the ingredient RFQ form", () => {
    expect(findRfqNumber("Quote for RFQ-ING-M4T2X9")).toBe("RFQ-ING-M4T2X9");
  });

  it("falls through the arguments in order", () => {
    expect(findRfqNumber(null, "no ref here", "body mentions RFQ-20260201-ZZ99")).toBe("RFQ-20260201-ZZ99");
  });

  it("returns null when there is no reference", () => {
    expect(findRfqNumber("Pricing for mushrooms", "Dear buyer, ...")).toBeNull();
  });
});

describe("mergeExtractions", () => {
  const body: VendorQuoteExtraction = coerceExtraction({
    isQuote: true,
    confidence: 60,
    responseType: "quote",
    unitPrice: 2,
    minimumOrderQty: 500,
    leadTimeDays: 45,
  });

  it("lets the attached quote document win on conflicts", () => {
    const attachment = coerceExtraction({
      isQuote: true,
      confidence: 95,
      responseType: "quote",
      unitPrice: 2.15,
      currency: "EUR",
    });
    const merged = mergeExtractions(body, attachment);
    expect(merged.unitPrice).toBe(2.15);
    expect(merged.currency).toBe("EUR");
    expect(merged.confidence).toBe(95);
  });

  it("keeps body-only fields the attachment omitted", () => {
    const attachment = coerceExtraction({ isQuote: true, confidence: 95, responseType: "quote", unitPrice: 2.15 });
    const merged = mergeExtractions(body, attachment);
    expect(merged.minimumOrderQty).toBe(500);
    expect(merged.leadTimeDays).toBe(45);
  });

  it("treats a quote in either half as a quote", () => {
    const nonQuoteBody = coerceExtraction({ isQuote: false, confidence: 10, responseType: "other" });
    const attachment = coerceExtraction({ isQuote: true, confidence: 90, responseType: "quote", unitPrice: 3 });
    expect(mergeExtractions(nonQuoteBody, attachment).isQuote).toBe(true);
  });

  it("does not let an empty attachment blank out the body's numbers", () => {
    const empty = coerceExtraction({ isQuote: false, confidence: 0, responseType: "other" });
    const merged = mergeExtractions(body, empty);
    expect(merged.unitPrice).toBe(2);
    expect(merged.isQuote).toBe(true);
  });
});
