import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the data layer ──────────────────────────────────────────────────────
// importEmailAttachmentToErp and the per-type importers all `import * as db`,
// so mocking "./db" covers every database touchpoint. Returns are permissive
// shapes that let the real importer logic run to completion without a database.
vi.mock("./db", () => ({
  // Touched directly by importEmailAttachmentToErp
  getEmailAttachmentById: vi.fn(async () => ({ id: 1, emailId: 5, filename: "doc.csv", mimeType: "text/csv", metadata: {} })),
  createParsedDocument: vi.fn(async () => ({ id: 100 })),
  createParsedDocumentLineItem: vi.fn(async () => ({ id: 101 })),
  updateEmailAttachment: vi.fn(async () => {}),
  // Touched by the importers
  getVendorByName: vi.fn(async () => null),
  createVendor: vi.fn(async () => ({ id: 10 })),
  getVendorById: vi.fn(async () => ({ id: 10, name: "Acme Supplies", email: "ap@acme.test" })),
  createPurchaseOrder: vi.fn(async () => ({ id: 20 })),
  createPurchaseOrderItem: vi.fn(async () => ({ id: 21 })),
  updatePurchaseOrder: vi.fn(async () => {}),
  findPurchaseOrderByNumber: vi.fn(async () => null),
  getRawMaterials: vi.fn(async () => []),
  getRawMaterialById: vi.fn(async () => null),
  createRawMaterial: vi.fn(async () => ({ id: 30 })),
  updateRawMaterial: vi.fn(async () => {}),
  createFreightHistory: vi.fn(async () => ({ id: 40 })),
  // Touched by importWhatsappDocumentToErp for shipment linkage
  findShipmentByTracking: vi.fn(async () => null),
}));

// ── Mock the LLM so parseUploadedDocument returns deterministic structured data
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { importEmailAttachmentToErp, importWhatsappDocumentToErp, isParseableDocumentMime } from "./documentImportService";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// parseUploadedDocument fetch()es the (CSV) source; the text is irrelevant
// because invokeLLM is mocked, so return a trivial body.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "csv,content" })));

/** Make invokeLLM return a document of the given parsed shape. */
function mockParse(documentType: string, payload: Record<string, unknown>) {
  (invokeLLM as any).mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify({ documentType, confidence: 0.9, ...payload }) } }],
  });
}

const baseOpts = {
  emailId: 5,
  attachmentId: 1,
  content: `data:text/csv;base64,${Buffer.from("csv,content").toString("base64")}`,
  filename: "doc.csv",
  mimeType: "text/csv",
  userId: 1,
};

const PO = {
  poNumber: "PO-1001", vendorName: "Acme Supplies", vendorEmail: "sales@acme.test",
  orderDate: "2026-01-10", status: "received", subtotal: 1000, totalAmount: 1000,
  currency: "USD", lineItems: [{ description: "Widget", quantity: 10, unit: "ea", unitPrice: 100, totalPrice: 1000 }],
};
const VENDOR_INVOICE = {
  invoiceNumber: "INV-2002", vendorName: "Acme Supplies", vendorEmail: "ap@acme.test",
  invoiceDate: "2026-01-12", dueDate: "2026-02-12", subtotal: 500, totalAmount: 500,
  currency: "USD", lineItems: [{ description: "Service", quantity: 1, unit: "ea", unitPrice: 500, totalPrice: 500 }],
};
const FREIGHT_INVOICE = {
  invoiceNumber: "FR-3003", carrierName: "Speedy Freight", carrierEmail: "billing@speedy.test",
  invoiceDate: "2026-01-15", freightCharges: 200, totalAmount: 200, currency: "USD", trackingNumber: "TRK-9",
};
const CUSTOMS = {
  documentNumber: "BOL-4004", documentType: "bill_of_lading", entryDate: "2026-01-18",
  shipperName: "Overseas Co", consigneeName: "Our Company", countryOfOrigin: "Thailand",
  totalDeclaredValue: 5000, totalCharges: 300, currency: "USD",
  lineItems: [{ description: "Oil", quantity: 100, unit: "kg", declaredValue: 5000 }],
};

describe("importEmailAttachmentToErp — document-type routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.getEmailAttachmentById as any).mockResolvedValue({ id: 1, emailId: 5, filename: "doc.csv", mimeType: "text/csv", metadata: {} });
  });

  it("routes a purchase order to a purchase_order parsed document", async () => {
    mockParse("purchase_order", { purchaseOrder: PO });
    const result = await importEmailAttachmentToErp(baseOpts);

    expect(result.documentType).toBe("purchase_order");
    expect(db.createPurchaseOrder).toHaveBeenCalled();
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "purchase_order", emailId: 5, attachmentId: 1, documentNumber: "PO-1001" })
    );
    // Attachment is flipped to processed.
    expect(db.updateEmailAttachment).toHaveBeenCalledWith(1, expect.objectContaining({ isProcessed: true }));
  });

  it("routes a vendor invoice to an invoice parsed document", async () => {
    mockParse("vendor_invoice", { vendorInvoice: VENDOR_INVOICE });
    const result = await importEmailAttachmentToErp(baseOpts);

    expect(result.documentType).toBe("vendor_invoice");
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "invoice", documentNumber: "INV-2002", totalAmount: "500" })
    );
    // Line items are persisted.
    expect(db.createParsedDocumentLineItem).toHaveBeenCalledTimes(VENDOR_INVOICE.lineItems.length);
  });

  it("routes a freight invoice to an invoice parsed document", async () => {
    mockParse("freight_invoice", { freightInvoice: FREIGHT_INVOICE });
    const result = await importEmailAttachmentToErp(baseOpts);

    expect(result.documentType).toBe("freight_invoice");
    expect(db.createFreightHistory).toHaveBeenCalled();
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "invoice", documentNumber: "FR-3003", carrierName: "Speedy Freight", trackingNumber: "TRK-9" })
    );
  });

  it("routes a customs document to a customs_document parsed document", async () => {
    mockParse("customs_document", { customsDocument: CUSTOMS });
    const result = await importEmailAttachmentToErp(baseOpts);

    expect(result.documentType).toBe("customs_document");
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "customs_document", documentNumber: "BOL-4004" })
    );
  });

  it("marks the attachment processed and creates no parsed document when parsing fails", async () => {
    // Invalid JSON => parseUploadedDocument returns success:false.
    (invokeLLM as any).mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] });
    const result = await importEmailAttachmentToErp(baseOpts);

    expect(result.success).toBe(false);
    expect(db.createParsedDocument).not.toHaveBeenCalled();
    expect(db.updateEmailAttachment).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ isProcessed: true, metadata: expect.objectContaining({ parseError: expect.any(String) }) })
    );
  });

  it("falls back to an 'other' parsed document for an unrecognized type", async () => {
    // documentType present but no matching sub-object => unrecognized branch.
    mockParse("unknown", {});
    const result = await importEmailAttachmentToErp(baseOpts);

    expect(result.success).toBe(false);
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "other" })
    );
  });
});

const whatsappOpts = {
  whatsappMessageId: 42,
  content: `data:text/csv;base64,${Buffer.from("csv,content").toString("base64")}`,
  filename: "doc.csv",
  mimeType: "text/csv",
  fromNumber: "+15551234567",
};

describe("importWhatsappDocumentToErp — WhatsApp intake parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.findShipmentByTracking as any).mockResolvedValue(null);
  });

  it("routes a vendor invoice through the same importers as the email path", async () => {
    mockParse("vendor_invoice", { vendorInvoice: VENDOR_INVOICE });
    const result = await importWhatsappDocumentToErp(whatsappOpts);

    expect(result.documentType).toBe("vendor_invoice");
    // Persists a parsedDocument NOT linked to any email/attachment, tagged as WhatsApp-sourced.
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: "invoice",
        documentNumber: "INV-2002",
        emailId: null,
        attachmentId: null,
        notes: expect.stringContaining("WhatsApp"),
      })
    );
    expect(db.createParsedDocumentLineItem).toHaveBeenCalledTimes(VENDOR_INVOICE.lineItems.length);
    // No email-attachment side effects on the WhatsApp path.
    expect(db.updateEmailAttachment).not.toHaveBeenCalled();
  });

  it("routes a purchase order and creates the PO record", async () => {
    mockParse("purchase_order", { purchaseOrder: PO });
    const result = await importWhatsappDocumentToErp(whatsappOpts);

    expect(result.documentType).toBe("purchase_order");
    expect(db.createPurchaseOrder).toHaveBeenCalled();
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "purchase_order", documentNumber: "PO-1001" })
    );
  });

  it("links a freight document to an existing shipment by tracking number", async () => {
    (db.findShipmentByTracking as any).mockResolvedValue({ id: 77 });
    mockParse("freight_invoice", { freightInvoice: FREIGHT_INVOICE });
    const result = await importWhatsappDocumentToErp(whatsappOpts);

    expect(result.documentType).toBe("freight_invoice");
    expect(db.findShipmentByTracking).toHaveBeenCalledWith("TRK-9");
    expect(db.createParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ trackingNumber: "TRK-9", shipmentId: 77 })
    );
  });

  it("returns a failure without persisting when parsing fails", async () => {
    (invokeLLM as any).mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] });
    const result = await importWhatsappDocumentToErp(whatsappOpts);

    expect(result.success).toBe(false);
    expect(db.createParsedDocument).not.toHaveBeenCalled();
  });
});

describe("isParseableDocumentMime", () => {
  it("accepts documents/images the parser can read", () => {
    for (const m of ["application/pdf", "image/jpeg", "image/png", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]) {
      expect(isParseableDocumentMime(m)).toBe(true);
    }
  });
  it("rejects media that can never be a business document", () => {
    for (const m of ["audio/ogg", "video/mp4", "text/vcard", undefined]) {
      expect(isParseableDocumentMime(m)).toBe(false);
    }
  });
});
