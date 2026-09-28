import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

// The importers all `import * as db`, so mocking "./db" covers every write.
vi.mock("./db", () => ({
  getVendorByName: vi.fn(),
  getVendorById: vi.fn(async (id: number) => ({ id, name: "Vendor" })),
  createVendor: vi.fn(async () => ({ id: 10 })),
  findPurchaseOrderByNumber: vi.fn(async () => null),
  findPurchaseOrderByNumberExact: vi.fn(async () => null),
  createPurchaseOrderIfAbsent: vi.fn(async () => ({ created: true as const, id: 20, existing: null })),
  createPurchaseOrderItem: vi.fn(async () => ({ id: 21 })),
  updatePurchaseOrder: vi.fn(async () => undefined),
  getRawMaterials: vi.fn(async () => []),
  getRawMaterialsByIds: vi.fn(async () => []),
  createRawMaterial: vi.fn(async () => ({ id: 30 })),
  updateRawMaterial: vi.fn(async () => undefined),
  createFreightBooking: vi.fn(async () => ({ id: 40, bookingNumber: "BK-2026-00001" })),
  receivePurchaseOrderIntoInventory: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import {
  importPurchaseOrder,
  importFreightInvoice,
  importCustomsDocument,
  matchLineItemsToMaterials,
  parseUploadedDocument,
  type ImportedPurchaseOrder,
  type ImportedFreightInvoice,
  type ImportedCustomsDocument,
} from "./documentImportService";

type Mock = ReturnType<typeof vi.fn>;
const firstArg = (fn: unknown) => (fn as Mock).mock.calls[0][0];

const basePO: ImportedPurchaseOrder = {
  poNumber: "PO-100",
  vendorName: "Acme Supplies",
  orderDate: "2026-05-01",
  status: "confirmed",
  subtotal: 100,
  totalAmount: 100,
  confidence: 0.9,
  lineItems: [{ description: "Coconut Oil", quantity: 4, unit: "kg", unitPrice: 25, totalPrice: 100 }],
};

describe("importPurchaseOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getVendorByName).mockResolvedValue({ id: 7, name: "Acme Supplies" } as any);
    vi.mocked(db.getRawMaterials).mockResolvedValue([{ id: 3, name: "Coconut Oil", sku: "RM-CO" }] as any);
    vi.mocked(db.getRawMaterialsByIds).mockResolvedValue([{ id: 3, name: "Coconut Oil", quantityReceived: "1" }] as any);
  });

  it("rejects an unreadable order date before creating anything", async () => {
    vi.mocked(db.getVendorByName).mockResolvedValue(null);
    const result = await importPurchaseOrder({ ...basePO, orderDate: "N/A" }, 5, true, true);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a valid date/);
    expect(db.createVendor).not.toHaveBeenCalled();
    expect(db.createRawMaterial).not.toHaveBeenCalled();
    expect(db.createPurchaseOrderIfAbsent).not.toHaveBeenCalled();
  });

  it("rejects a blank vendor name instead of LIKE-matching every vendor", async () => {
    const result = await importPurchaseOrder({ ...basePO, vendorName: "  " }, 5, true, true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vendor name/i);
    expect(db.getVendorByName).not.toHaveBeenCalled();
  });

  it("stores a real Date, the importer's companyId and a normalized currency on the PO", async () => {
    const result = await importPurchaseOrder({ ...basePO, currency: "US Dollars" }, 5, false, false, { companyId: 7 });
    expect(result.success).toBe(true);
    const po = firstArg(db.createPurchaseOrderIfAbsent);
    expect(po.orderDate).toBeInstanceOf(Date);
    expect(po).toMatchObject({ companyId: 7, currency: "USD", status: "confirmed", createdBy: 5 });
  });

  it("puts companyId on vendors and materials it creates", async () => {
    vi.mocked(db.getVendorByName).mockResolvedValue(null);
    vi.mocked(db.getRawMaterials).mockResolvedValue([]);
    await importPurchaseOrder(basePO, 5, false, true, { companyId: 7 });
    expect(firstArg(db.createVendor)).toMatchObject({ name: "Acme Supplies", companyId: 7 });
    expect(firstArg(db.createRawMaterial)).toMatchObject({ name: "Coconut Oil", companyId: 7 });
  });

  it("honours updateInventory=false: the PO is received but no material quantities change", async () => {
    const result = await importPurchaseOrder(basePO, 5, true, false, { updateInventory: false });
    expect(result.success).toBe(true);
    expect(firstArg(db.createPurchaseOrderIfAbsent)).toMatchObject({ status: "received" });
    expect(db.updateRawMaterial).not.toHaveBeenCalled();
    expect(result.warnings.some((w) => /Inventory was not updated/.test(w))).toBe(true);
  });

  it("updates inventory by default when marking as received", async () => {
    const result = await importPurchaseOrder(basePO, 5, true, false);
    expect(result.success).toBe(true);
    expect(db.updateRawMaterial).toHaveBeenCalledWith(3, expect.objectContaining({ quantityReceived: "5" }));
  });

  it("warns (rather than storing an Invalid Date) for an unreadable delivery date", async () => {
    const result = await importPurchaseOrder({ ...basePO, deliveryDate: "TBD" }, 5, false, false);
    expect(result.success).toBe(true);
    expect(firstArg(db.createPurchaseOrderIfAbsent).expectedDate).toBeUndefined();
    expect(result.warnings.some((w) => /Delivery date/.test(w))).toBe(true);
  });
});

describe("matchLineItemsToMaterials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getRawMaterials).mockResolvedValue([
      { id: 3, name: "Coconut Oil", sku: "RM-CO" },
      { id: 4, name: "Hemp Protein", sku: "RM-HP" },
    ] as any);
  });

  it("does not match a blank description to the first material", async () => {
    const matched = await matchLineItemsToMaterials([
      { description: "", quantity: 1, unitPrice: 1, totalPrice: 1 },
      { description: "  ", quantity: 1, unitPrice: 1, totalPrice: 1 },
    ]);
    expect(matched.map((m) => m.rawMaterialId)).toEqual([undefined, undefined]);
  });

  it("still matches by description substring and by SKU", async () => {
    const matched = await matchLineItemsToMaterials([
      { description: "Organic Hemp Protein 20kg", quantity: 1, unitPrice: 1, totalPrice: 1 },
      { description: "Unknown", sku: "rm-co", quantity: 1, unitPrice: 1, totalPrice: 1 },
    ]);
    expect(matched.map((m) => m.rawMaterialId)).toEqual([4, 3]);
  });
});

const baseFreight: ImportedFreightInvoice = {
  invoiceNumber: "FR-1",
  carrierName: "Speedy Freight",
  invoiceDate: "2026-05-02",
  shipmentDate: "2026-04-28",
  freightCharges: 400,
  totalAmount: 450,
  currency: "usd",
  relatedPoNumber: "PO-100",
  trackingNumber: "TRK-1",
  confidence: 0.9,
};

describe("importFreightInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getVendorByName).mockResolvedValue({ id: 9, name: "Speedy Freight" } as any);
    vi.mocked(db.findPurchaseOrderByNumber).mockResolvedValue({ id: 42, poNumber: "PO-100" } as any);
  });

  it("writes a valid freightBookings row: Date columns, an enum status and a cost column", async () => {
    const result = await importFreightInvoice(baseFreight, 5, false, false, undefined, { companyId: 7 });
    expect(result.success).toBe(true);
    expect(result.createdRecords).toContainEqual({ type: "freight_history", id: 40, name: "FR-1" });

    const row = firstArg(db.createFreightBooking);
    expect(row.bookingDate).toBeInstanceOf(Date);
    expect(row.pickupDate).toBeInstanceOf(Date);
    expect(row).toMatchObject({ companyId: 7, carrierId: 9, status: "delivered", actualCost: "450", currency: "USD", trackingNumber: "TRK-1", rfqId: 0, quoteId: 0 });
    expect(JSON.parse(row.notes)).toMatchObject({ invoiceNumber: "FR-1", relatedPoId: 42, importedInvoice: true });
    // These are not freightBookings columns and were silently dropped before.
    expect(row).not.toHaveProperty("totalCost");
    expect(row).not.toHaveProperty("createdBy");
  });

  it("rejects an unreadable invoice date before creating the carrier", async () => {
    vi.mocked(db.getVendorByName).mockResolvedValue(null);
    const result = await importFreightInvoice({ ...baseFreight, invoiceDate: "unknown" }, 5, true);
    expect(result.success).toBe(false);
    expect(db.createVendor).not.toHaveBeenCalled();
    expect(db.createFreightBooking).not.toHaveBeenCalled();
  });

  it("honours linkToPO=false: no PO lookup, no freight cost written to the PO", async () => {
    const result = await importFreightInvoice(baseFreight, 5, false, false, undefined, { linkToPO: false });
    expect(result.success).toBe(true);
    expect(db.findPurchaseOrderByNumber).not.toHaveBeenCalled();
    expect(db.updatePurchaseOrder).not.toHaveBeenCalled();
  });

  it("links and updates the PO by default", async () => {
    await importFreightInvoice(baseFreight, 5);
    expect(db.updatePurchaseOrder).toHaveBeenCalledWith(42, { freightCost: "450" });
  });
});

const baseCustoms: ImportedCustomsDocument = {
  documentNumber: "BOL-1",
  documentType: "bill_of_lading",
  entryDate: "2026-05-03",
  shipperName: "Qingdao Exports",
  shipperCountry: "CN",
  consigneeName: "Us",
  countryOfOrigin: "CN",
  containerNumber: "CONT-1",
  brokerName: "Broker Co",
  relatedPoNumber: "PO-100",
  lineItems: [
    { description: "Shiitake Mushroom Shredded", hsCode: "0712.39", quantity: 0, declaredValue: 500 },
  ],
  totalDeclaredValue: 500,
  totalDuties: 25,
  totalCharges: 525,
  currency: "CNY",
  confidence: 0.9,
};

describe("importCustomsDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getVendorByName).mockResolvedValue(null);
    vi.mocked(db.getRawMaterials).mockResolvedValue([]);
    vi.mocked(db.findPurchaseOrderByNumber).mockResolvedValue({ id: 42, poNumber: "PO-100", notes: "Rush order" } as any);
  });

  it("writes a valid freight row, reports the broker it created and never inserts an Infinity unit cost", async () => {
    vi.mocked(db.createVendor).mockResolvedValueOnce({ id: 11 }).mockResolvedValueOnce({ id: 12 });
    const result = await importCustomsDocument(baseCustoms, 5, true, { companyId: 7 });

    expect(result.success).toBe(true);
    expect(result.createdRecords).toContainEqual({ type: "vendor", id: 11, name: "Qingdao Exports" });
    expect(result.createdRecords).toContainEqual({ type: "vendor", id: 12, name: "Broker Co" });
    expect(result.createdRecords).toContainEqual({ type: "customs_document", id: 40, name: "BOL-1" });

    const row = firstArg(db.createFreightBooking);
    expect(row.bookingDate).toBeInstanceOf(Date);
    expect(row).toMatchObject({ companyId: 7, carrierId: 11, status: "arrived", actualCost: "525", currency: "CNY", containerNumber: "CONT-1" });

    // quantity 0 → unit cost left unset rather than "Infinity"
    expect(firstArg(db.createRawMaterial)).toMatchObject({ name: "Shiitake Mushroom Shredded", sku: "HS-0712.39", companyId: 7 });
    expect(firstArg(db.createRawMaterial).unitCost).toBeUndefined();
  });

  it("appends the customs note to the PO instead of overwriting the PO's notes", async () => {
    await importCustomsDocument(baseCustoms, 5, true);
    const [, patch] = (db.updatePurchaseOrder as Mock).mock.calls[0];
    expect(patch.notes).toMatch(/^Rush order\n/);
    expect(patch.notes).toContain("Customs Doc: BOL-1");
  });

  it("honours linkToPO=false", async () => {
    await importCustomsDocument(baseCustoms, 5, true, { linkToPO: false });
    expect(db.findPurchaseOrderByNumber).not.toHaveBeenCalled();
    expect(db.updatePurchaseOrder).not.toHaveBeenCalled();
  });

  it("rejects an unreadable entry date before any write", async () => {
    const result = await importCustomsDocument({ ...baseCustoms, entryDate: "" }, 5, true);
    expect(result.success).toBe(false);
    expect(db.createVendor).not.toHaveBeenCalled();
  });
});

describe("parseUploadedDocument", () => {
  const csvUrl = `data:text/csv;base64,${Buffer.from("a,b").toString("base64")}`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "a,b",
    })));
  });

  it("recovers JSON the model wrapped in prose and a code fence", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { content: 'Here is the result:\n```json\n{"documentType":"purchase_order","confidence":0.7,"purchaseOrder":{"poNumber":"PO-1","vendorName":"Acme","orderDate":"2026-05-01","totalAmount":"1,000","lineItems":[],"vendorEmail":null}}\n```' } }],
    } as any);
    const result = await parseUploadedDocument(csvUrl, "po.csv", undefined, "text/csv");
    expect(result.success).toBe(true);
    expect(result.documentType).toBe("purchase_order");
    expect(result.purchaseOrder).toMatchObject({ poNumber: "PO-1", totalAmount: 1000, subtotal: 1000, confidence: 0.7 });
    expect(result.rawText).not.toMatch(/base64/);
  });

  it("returns a clear failure (not a throw) when the model does not return JSON", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: "I cannot read this document." } }] } as any);
    const result = await parseUploadedDocument(csvUrl, "po.csv");
    expect(result).toMatchObject({ success: false, documentType: "unknown" });
    expect(result.error).toMatch(/not valid JSON/);
  });

  it("reads an Excel upload as cell text instead of raw zip bytes", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item", "Qty"], ["Widget A", 3]]), "Sheet1");
    const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(bytes.byteLength) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => bytes.toString("latin1"),
    })));
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: '{"documentType":"unknown","confidence":0}' } }] } as any);

    const xlsxUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${bytes.toString("base64")}`;
    await parseUploadedDocument(xlsxUrl, "order.xlsx", undefined, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    const call = vi.mocked(invokeLLM).mock.calls[0][0] as any;
    const userText = call.messages[1].content[0].text as string;
    expect(userText).toContain("Widget A,3");
    expect(userText).not.toContain("PK\u0003\u0004");
  });
});
