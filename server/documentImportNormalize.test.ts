import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  normalizeParsedDocument,
  parseDocumentDate,
  normalizeCurrency,
  spreadsheetBufferToText,
} from "./documentImportService";

// The model's JSON is only loosely shaped (response_format is a hint), so the
// parse step must hand the importers nulls-free, finite-number data.
describe("normalizeParsedDocument", () => {
  it("drops nulls, coerces numeric strings and computes a missing line total", () => {
    const result = normalizeParsedDocument({
      documentType: "purchase_order",
      confidence: 0.8,
      purchaseOrder: {
        poNumber: "PO-1",
        vendorName: "Acme",
        vendorEmail: null,
        orderDate: "2026-05-01",
        deliveryDate: null,
        subtotal: "1,200.50",
        totalAmount: "$1,300.00",
        notes: null,
        lineItems: [
          { description: "Coconut Oil", sku: null, quantity: "10", unit: null, unitPrice: "12.5", totalPrice: null },
        ],
      },
      vendorInvoice: null,
      freightInvoice: null,
      customsDocument: null,
    });

    expect(result.success).toBe(true);
    expect(result.documentType).toBe("purchase_order");
    const po = result.purchaseOrder!;
    expect(po.subtotal).toBe(1200.5);
    expect(po.totalAmount).toBe(1300);
    expect("vendorEmail" in po).toBe(false);
    expect("deliveryDate" in po).toBe(false);
    expect(po.lineItems).toEqual([
      { description: "Coconut Oil", quantity: 10, unitPrice: 12.5, totalPrice: 125 },
    ]);
    expect(po.confidence).toBe(0.8);
    expect(result.vendorInvoice).toBeUndefined();
  });

  it("never yields NaN: unreadable numbers become 0 and subtotal falls back to the total", () => {
    const result = normalizeParsedDocument({
      documentType: "vendor_invoice",
      vendorInvoice: {
        invoiceNumber: "INV-9",
        vendorName: "Acme",
        invoiceDate: "2026-05-01",
        subtotal: "N/A",
        totalAmount: 99,
        lineItems: [{ description: "Thing", quantity: "abc", unitPrice: Number.NaN, totalPrice: "7" }],
      },
    });
    const inv = result.vendorInvoice!;
    expect(inv.subtotal).toBe(99);
    expect(inv.lineItems[0]).toMatchObject({ quantity: 0, unitPrice: 0, totalPrice: 7 });
    expect(Object.values(inv.lineItems[0]).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });

  it("maps an unexpected document type to unknown and tolerates a missing lineItems array", () => {
    const result = normalizeParsedDocument({
      documentType: "receipt",
      purchaseOrder: { poNumber: "PO-2", vendorName: "Acme", orderDate: "2026-01-01", totalAmount: 5 },
    });
    expect(result.documentType).toBe("unknown");
    expect(result.purchaseOrder!.lineItems).toEqual([]);
  });

  it("fails cleanly on a non-object payload", () => {
    expect(normalizeParsedDocument("nope")).toMatchObject({ success: false, documentType: "unknown" });
    expect(normalizeParsedDocument([1, 2])).toMatchObject({ success: false });
    expect(normalizeParsedDocument(null)).toMatchObject({ success: false });
  });

  it("defaults freight charges to the total and customs charges to the declared value", () => {
    const result = normalizeParsedDocument({
      documentType: "freight_invoice",
      confidence: 0.6,
      freightInvoice: { invoiceNumber: "F-1", carrierName: "Ship Co", invoiceDate: "2026-02-02", totalAmount: "450" },
      customsDocument: {
        documentNumber: "BOL-1", documentType: "bill_of_lading", entryDate: "2026-02-03", shipperName: "S",
        consigneeName: "C", countryOfOrigin: "CN", totalDeclaredValue: "1000",
        lineItems: [{ description: "Goods", quantity: null, declaredValue: "1,000" }],
      },
    });
    expect(result.freightInvoice).toMatchObject({ totalAmount: 450, freightCharges: 450, confidence: 0.6 });
    expect(result.customsDocument).toMatchObject({ totalDeclaredValue: 1000, totalCharges: 1000 });
    expect(result.customsDocument!.lineItems[0]).toMatchObject({ quantity: 0, declaredValue: 1000 });
  });
});

describe("parseDocumentDate", () => {
  it("returns a Date for readable values and undefined otherwise", () => {
    expect(parseDocumentDate("2026-05-01")!.getUTCFullYear()).toBe(2026);
    expect(parseDocumentDate("May 1, 2026")).toBeInstanceOf(Date);
    expect(parseDocumentDate("N/A")).toBeUndefined();
    expect(parseDocumentDate("")).toBeUndefined();
    expect(parseDocumentDate(undefined)).toBeUndefined();
    expect(parseDocumentDate(new Date("invalid"))).toBeUndefined();
  });
});

describe("normalizeCurrency", () => {
  it("keeps three-letter codes (upper-cased) and falls back otherwise", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("AED")).toBe("AED");
    expect(normalizeCurrency("US Dollars")).toBe("USD");
    expect(normalizeCurrency(undefined)).toBe("USD");
    expect(normalizeCurrency("$")).toBe("USD");
  });
});

describe("spreadsheetBufferToText", () => {
  it("renders every sheet of an xlsx workbook as CSV text", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Item", "Qty", "Price"], ["Widget A", 3, 9.5]]),
      "Order",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Note"], ["Deliver by Friday"]]), "Notes");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const text = spreadsheetBufferToText(buffer);
    expect(text).toContain("SHEET: Order");
    expect(text).toContain("Item,Qty,Price");
    expect(text).toContain("Widget A,3,9.5");
    expect(text).toContain("SHEET: Notes");
    expect(text).toContain("Deliver by Friday");
  });
});
