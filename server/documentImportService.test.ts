import { describe, it, expect } from "vitest";
import {
  isNonMaterialLineItem,
  looksLikeFreightInvoice,
  reclassifyFreightDocument,
  type DocumentParseResult,
  type ImportedVendorInvoice,
  type ImportedPurchaseOrder,
} from "./documentImportService";

describe("isNonMaterialLineItem", () => {
  // The only real materials in the catalog — these must always be importable.
  const realMaterials = [
    "Shiitake Mushroom Shredded",
    "Shiitake Mushroom Chopped",
    "Hemp Protein",
    "Coconut Oil",
    "Formula 1",
    "Formula 2",
    "Formula 3",
    "Formula 4",
  ];

  it.each(realMaterials)("treats genuine material %s as a material", (description) => {
    expect(isNonMaterialLineItem({ description, unit: "kg" })).toBe(false);
  });

  // Bogus entries that previously leaked into the materials list.
  const nonMaterials = [
    "Agent Usage Apr 22 - Apr 27, 2026",
    "Build Minutes Apr 1 - Apr 18, 2026",
    "Disk (per GB / min) Mar 27 - Apr 27, 2026",
    "DUBAI PORT CHINA AND RETURN TO QINGDAO FREIGHT",
    "Hobby plan Apr 27 - May 27, 2026",
    "Max plan - 20x May 3 - Jun 3, 2026",
    "Memory (per MB / min) Mar 27 - Apr 27, 2026",
    "Network (per MB) Mar 27 - Apr 27, 2026",
    "OCEAN FREIGHT FROM QINGDAO TO JEBEL ALI",
    "One-time credit purchase",
    "Pro Apr 1 - Apr 30, 2026",
    "Fuel Surcharge",
    "Customs Brokerage Fee",
    "Import Duties",
    "VAT",
  ];

  it.each(nonMaterials)("skips non-material line %s", (description) => {
    expect(isNonMaterialLineItem({ description })).toBe(true);
  });

  it("skips empty / missing descriptions", () => {
    expect(isNonMaterialLineItem({ description: "" })).toBe(true);
    expect(isNonMaterialLineItem({ description: "   " })).toBe(true);
    expect(isNonMaterialLineItem({})).toBe(true);
  });

  it("skips metering units even with a neutral description", () => {
    expect(isNonMaterialLineItem({ description: "Compute", unit: "min" })).toBe(true);
    expect(isNonMaterialLineItem({ description: "Whatever", unit: "GB" })).toBe(true);
  });

  it("does not skip physical goods sold by weight/each", () => {
    expect(isNonMaterialLineItem({ description: "Organic Cocoa Powder", unit: "kg" })).toBe(false);
    expect(isNonMaterialLineItem({ description: "Glass Jar 16oz", unit: "EA" })).toBe(false);
  });
});

describe("looksLikeFreightInvoice", () => {
  it("flags a carrier/forwarder vendor name", () => {
    expect(looksLikeFreightInvoice("Qingdao Ocean Freight Forwarding Co", [])).toBe(true);
    expect(looksLikeFreightInvoice("Global Logistics Ltd", [{ description: "Anything" }])).toBe(true);
  });

  it("flags when freight charges dominate the line items", () => {
    expect(
      looksLikeFreightInvoice("Some Vendor", [
        { description: "OCEAN FREIGHT FROM QINGDAO TO JEBEL ALI" },
        { description: "Terminal Handling Charge" },
        { description: "Documentation fee" },
      ]),
    ).toBe(true);
  });

  it("does not flag an ordinary goods invoice with a single shipping line", () => {
    expect(
      looksLikeFreightInvoice("Mushroom Supplier Inc", [
        { description: "Shiitake Mushroom Shredded" },
        { description: "Hemp Protein" },
        { description: "Coconut Oil" },
        { description: "Shipping" },
      ]),
    ).toBe(false);
  });
});

describe("reclassifyFreightDocument", () => {
  const freightInvoice: ImportedVendorInvoice = {
    invoiceNumber: "FF-2026-001",
    vendorName: "Qingdao Freight Forwarders",
    vendorEmail: "ar@qdff.com",
    invoiceDate: "2026-05-01",
    lineItems: [
      { description: "OCEAN FREIGHT FROM QINGDAO TO JEBEL ALI", quantity: 1, unitPrice: 2400, totalPrice: 2400 },
      { description: "Terminal Handling Charge", quantity: 1, unitPrice: 300, totalPrice: 300 },
    ],
    subtotal: 2700,
    totalAmount: 2700,
    currency: "USD",
    relatedPoNumber: "PO-123",
    confidence: 0.9,
  };

  it("reclassifies a mislabelled vendor invoice to freight_invoice", () => {
    const input: DocumentParseResult = { success: true, documentType: "vendor_invoice", vendorInvoice: freightInvoice };
    const out = reclassifyFreightDocument(input);
    expect(out.documentType).toBe("freight_invoice");
    expect(out.vendorInvoice).toBeUndefined();
    expect(out.freightInvoice?.carrierName).toBe("Qingdao Freight Forwarders");
    expect(out.freightInvoice?.invoiceNumber).toBe("FF-2026-001");
    expect(out.freightInvoice?.freightCharges).toBe(2700);
    expect(out.freightInvoice?.relatedPoNumber).toBe("PO-123");
  });

  it("reclassifies a mislabelled purchase order to freight_invoice", () => {
    const po: ImportedPurchaseOrder = {
      poNumber: "INV-OCEAN-9",
      vendorName: "Maersk Line",
      orderDate: "2026-05-02",
      status: "received",
      lineItems: [{ description: "Sea freight Shanghai → LA", quantity: 1, unitPrice: 5000, totalPrice: 5000 }],
      subtotal: 5000,
      totalAmount: 5000,
      confidence: 0.8,
    };
    const out = reclassifyFreightDocument({ success: true, documentType: "purchase_order", purchaseOrder: po });
    expect(out.documentType).toBe("freight_invoice");
    expect(out.purchaseOrder).toBeUndefined();
    expect(out.freightInvoice?.carrierName).toBe("Maersk Line");
  });

  it("leaves an ordinary goods invoice untouched", () => {
    const goods: ImportedVendorInvoice = {
      invoiceNumber: "INV-555",
      vendorName: "Mushroom Supplier Inc",
      invoiceDate: "2026-05-01",
      lineItems: [
        { description: "Shiitake Mushroom Shredded", quantity: 100, unitPrice: 5, totalPrice: 500 },
        { description: "Hemp Protein", quantity: 50, unitPrice: 8, totalPrice: 400 },
      ],
      subtotal: 900,
      totalAmount: 900,
      confidence: 0.9,
    };
    const out = reclassifyFreightDocument({ success: true, documentType: "vendor_invoice", vendorInvoice: goods });
    expect(out.documentType).toBe("vendor_invoice");
    expect(out.freightInvoice).toBeUndefined();
    expect(out.vendorInvoice).toBe(goods);
  });

  it("leaves failed / already-freight results unchanged", () => {
    const failed: DocumentParseResult = { success: false, documentType: "unknown", error: "boom" };
    expect(reclassifyFreightDocument(failed)).toBe(failed);
    const already: DocumentParseResult = {
      success: true,
      documentType: "freight_invoice",
      freightInvoice: { invoiceNumber: "F1", carrierName: "C", invoiceDate: "2026-01-01", freightCharges: 10, totalAmount: 10, confidence: 1 },
    };
    expect(reclassifyFreightDocument(already)).toBe(already);
  });
});
