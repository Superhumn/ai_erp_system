import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getVendorByName: vi.fn(),
  createVendor: vi.fn(),
  getVendorById: vi.fn(),
  findPurchaseOrderByNumberExact: vi.fn(),
  findPurchaseOrderByNumber: vi.fn(),
  getRawMaterials: vi.fn().mockResolvedValue([]),
  createRawMaterial: vi.fn(),
  createPurchaseOrderIfAbsent: vi.fn(),
  createPurchaseOrderItem: vi.fn().mockResolvedValue({ id: 1 }),
  getRawMaterialsByIds: vi.fn().mockResolvedValue([]),
  updateRawMaterial: vi.fn(),
  findBillByNumber: vi.fn(),
  createBill: vi.fn(),
}));

import * as db from "./db";
import {
  importVendorInvoice,
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

describe("importVendorInvoice", () => {
  const invoice: ImportedVendorInvoice = {
    invoiceNumber: "ACME-500",
    vendorName: "Acme Mills",
    invoiceDate: "2026-09-01",
    dueDate: "2026-10-01",
    lineItems: [{ description: "Fuel Surcharge", quantity: 1, unitPrice: 25, totalPrice: 25 }],
    subtotal: 25,
    taxAmount: 2.5,
    totalAmount: 27.5,
    currency: "USD",
    paymentTerms: "Net 30",
    confidence: 90,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getVendorByName).mockResolvedValue({ id: 4, name: "Acme Mills", companyId: 3 } as any);
    vi.mocked(db.findPurchaseOrderByNumberExact).mockResolvedValue(null as any);
    vi.mocked(db.createPurchaseOrderIfAbsent).mockResolvedValue({ id: 88, created: true } as any);
    vi.mocked(db.findBillByNumber).mockResolvedValue(null as any);
    vi.mocked(db.createBill).mockResolvedValue({ id: 12 } as any);
  });

  it("records the payable as a bill linked to the PO it creates", async () => {
    const result = await importVendorInvoice(invoice, 7);

    expect(result.success).toBe(true);
    expect(db.findBillByNumber).toHaveBeenCalledWith("ACME-500", 4);
    expect(db.createBill).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.createBill).mock.calls[0][0]).toMatchObject({
      companyId: 3,
      billNumber: "ACME-500",
      vendorId: 4,
      purchaseOrderId: 88,
      sourceType: "document_import",
      status: "draft",
      billDate: new Date("2026-09-01"),
      dueDate: new Date("2026-10-01"),
      subtotal: "25",
      taxAmount: "2.5",
      totalAmount: "27.5",
      paymentTerms: "Net 30",
      lineItems: [{ description: "Fuel Surcharge", quantity: 1, unitPrice: 25, totalPrice: 25 }],
      createdBy: 7,
    });
    expect(result.createdRecords).toEqual(expect.arrayContaining([
      { type: "purchase_order", id: 88, name: "ACME-500" },
      { type: "bill", id: 12, name: "ACME-500" },
    ]));
  });

  it("backfills the bill for an invoice whose PO was imported before bills existed, and never duplicates one", async () => {
    vi.mocked(db.findPurchaseOrderByNumberExact).mockResolvedValue({ id: 70, poNumber: "INV-ACME-500" } as any);

    const first = await importVendorInvoice(invoice, 7);
    expect(first.success).toBe(true);
    expect(db.createPurchaseOrderIfAbsent).not.toHaveBeenCalled();
    expect(vi.mocked(db.createBill).mock.calls[0][0]).toMatchObject({ purchaseOrderId: 70, billNumber: "ACME-500" });
    expect(first.createdRecords).toEqual([{ type: "bill", id: 12, name: "ACME-500" }]);

    vi.mocked(db.createBill).mockClear();
    vi.mocked(db.findBillByNumber).mockResolvedValue({ id: 12 } as any);
    const second = await importVendorInvoice(invoice, 7);
    expect(second.success).toBe(true);
    expect(db.createBill).not.toHaveBeenCalled();
    expect(second.createdRecords).toEqual([]);
  });

  it("keeps the PO import successful and reports a warning when the bill insert fails", async () => {
    vi.mocked(db.createBill).mockRejectedValue(new Error("bills table missing"));
    const result = await importVendorInvoice(invoice, 7);
    expect(result.success).toBe(true);
    expect(result.createdRecords).toEqual([{ type: "purchase_order", id: 88, name: "ACME-500" }]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Bill ACME-500 could not be recorded: bills table missing")]));
  });

  // --- validation before any write ---

  it("rejects a blank vendor name before the LIKE lookup", async () => {
    const result = await importVendorInvoice({ ...invoice, vendorName: "   " }, 7, false, true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vendor name/i);
    expect(db.getVendorByName).not.toHaveBeenCalled();
    expect(db.createVendor).not.toHaveBeenCalled();
  });

  it("trims the vendor name it looks up and creates", async () => {
    vi.mocked(db.getVendorByName).mockResolvedValue(null as any);
    vi.mocked(db.createVendor).mockResolvedValue({ id: 5 } as any);
    vi.mocked(db.getVendorById).mockResolvedValue({ id: 5, name: "Acme Mills", companyId: null } as any);
    await importVendorInvoice({ ...invoice, vendorName: "  Acme Mills " }, 7, false, true);
    expect(db.getVendorByName).toHaveBeenCalledWith("Acme Mills");
    expect(vi.mocked(db.createVendor).mock.calls[0][0]).toMatchObject({ name: "Acme Mills" });
  });

  it("rejects an unreadable invoice date before creating anything", async () => {
    vi.mocked(db.getVendorByName).mockResolvedValue(null as any);
    const result = await importVendorInvoice({ ...invoice, invoiceDate: "N/A" }, 7, true, true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invoice date "N\/A" is not a valid date/);
    expect(db.getVendorByName).not.toHaveBeenCalled();
    expect(db.createVendor).not.toHaveBeenCalled();
    expect(db.createRawMaterial).not.toHaveBeenCalled();
    expect(db.createPurchaseOrderIfAbsent).not.toHaveBeenCalled();
    expect(db.createBill).not.toHaveBeenCalled();
  });

  it("rejects an unreadable due date before creating anything (a missing due date is fine)", async () => {
    const bad = await importVendorInvoice({ ...invoice, dueDate: "next month-ish" }, 7);
    expect(bad.success).toBe(false);
    expect(bad.error).toMatch(/Due date "next month-ish" is not a valid date/);
    expect(db.createPurchaseOrderIfAbsent).not.toHaveBeenCalled();

    const ok = await importVendorInvoice({ ...invoice, dueDate: undefined }, 7);
    expect(ok.success).toBe(true);
    expect(vi.mocked(db.createPurchaseOrderIfAbsent).mock.calls[0][0]).toMatchObject({ expectedDate: undefined });
  });

  it("stores real Dates on the PO and the bill", async () => {
    await importVendorInvoice(invoice, 7);
    const po = vi.mocked(db.createPurchaseOrderIfAbsent).mock.calls[0][0];
    expect(po.orderDate).toEqual(new Date("2026-09-01"));
    expect(po.expectedDate).toEqual(new Date("2026-10-01"));
    const bill = vi.mocked(db.createBill).mock.calls[0][0];
    expect(bill.billDate).toEqual(new Date("2026-09-01"));
    expect(bill.dueDate).toEqual(new Date("2026-10-01"));
  });

  // --- options: companyId + updateInventory ---

  const materialInvoice: ImportedVendorInvoice = {
    ...invoice,
    lineItems: [{ description: "Coconut Oil", quantity: 4, unit: "kg", unitPrice: 10, totalPrice: 40 }],
  };

  it("stamps options.companyId on the vendor, raw materials, PO and bill it creates", async () => {
    vi.mocked(db.getVendorByName).mockResolvedValue(null as any);
    vi.mocked(db.createVendor).mockResolvedValue({ id: 5 } as any);
    // A vendor created by this import may come back without its companyId; the bill still gets one.
    vi.mocked(db.getVendorById).mockResolvedValue({ id: 5, name: "Acme Mills", companyId: null } as any);
    vi.mocked(db.createRawMaterial).mockResolvedValue({ id: 55 } as any);

    const result = await importVendorInvoice(materialInvoice, 7, false, true, { companyId: 9 });
    expect(result.success).toBe(true);
    expect(vi.mocked(db.createVendor).mock.calls[0][0]).toMatchObject({ name: "Acme Mills", companyId: 9 });
    expect(vi.mocked(db.createRawMaterial).mock.calls[0][0]).toMatchObject({ name: "Coconut Oil", companyId: 9 });
    expect(vi.mocked(db.createPurchaseOrderIfAbsent).mock.calls[0][0]).toMatchObject({ poNumber: "INV-ACME-500", companyId: 9 });
    expect(vi.mocked(db.createBill).mock.calls[0][0]).toMatchObject({ billNumber: "ACME-500", vendorId: 5, companyId: 9 });
  });

  it("keeps the vendor's own companyId on the bill when it has one", async () => {
    await importVendorInvoice(invoice, 7, false, false, { companyId: 9 });
    expect(vi.mocked(db.createBill).mock.calls[0][0]).toMatchObject({ companyId: 3 });
  });

  it("honours updateInventory=false: the PO is received but no material quantities change", async () => {
    vi.mocked(db.createRawMaterial).mockResolvedValue({ id: 55 } as any);
    vi.mocked(db.getRawMaterialsByIds).mockResolvedValue([{ id: 55, name: "Coconut Oil", quantityReceived: "1" }] as any);

    const result = await importVendorInvoice(materialInvoice, 7, true, false, { updateInventory: false });
    expect(result.success).toBe(true);
    expect(vi.mocked(db.createPurchaseOrderIfAbsent).mock.calls[0][0]).toMatchObject({ status: "received" });
    expect(db.updateRawMaterial).not.toHaveBeenCalled();
    expect(result.updatedRecords).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Inventory was not updated/)]));
  });

  it("updates inventory by default when marking as received (options omitted)", async () => {
    vi.mocked(db.createRawMaterial).mockResolvedValue({ id: 55 } as any);
    vi.mocked(db.getRawMaterialsByIds).mockResolvedValue([{ id: 55, name: "Coconut Oil", quantityReceived: "1" }] as any);

    const result = await importVendorInvoice(materialInvoice, 7, true, false);
    expect(result.success).toBe(true);
    expect(db.updateRawMaterial).toHaveBeenCalledWith(55, expect.objectContaining({ quantityReceived: "5", receivingStatus: "received" }));
    expect(result.updatedRecords).toEqual([expect.objectContaining({ type: "raw_material", id: 55 })]);
  });
});
