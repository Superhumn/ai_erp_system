/**
 * Flow test — document import.
 *
 * Walks the real documentImport + bills routers (appRouter.createCaller) with
 * the LLM and object storage mocked and the db replaced by a stateful in-memory
 * store, so vendor creation, PO/bill creation, material matching, inventory
 * updates, duplicate detection and the import history all run for real.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { execSync } from "child_process";
import { ctxFor } from "./_harness";

type Row = { id: number } & Record<string, any>;

const store = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  return {
    vendors: table<Row>(),
    purchaseOrders: table<Row>(),
    purchaseOrderItems: table<Row>(),
    rawMaterials: table<Row>(),
    freightBookings: table<Row>(),
    bills: table<Row>(),
    payments: table<Row>(),
    auditLogs: table<Row>(),
  };
});

vi.mock("../db", async () => {
  const { nextStatusAfterPayment } = await import("../billsLogic");
  const parseJsonArray = <T,>(v: unknown): T[] => {
    if (Array.isArray(v)) return v as T[];
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  };
  const withJoins = (b: Row) => ({
    ...b,
    vendorName: store.vendors.get(b.vendorId)?.name ?? null,
    poNumber: b.purchaseOrderId ? store.purchaseOrders.get(b.purchaseOrderId)?.poNumber ?? null : null,
  });
  const getBillById = async (id: number) => { const b = store.bills.get(id); return b ? withJoins(b) : null; };
  return {
    getDb: vi.fn(async () => ({})),
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    createAuditLog: vi.fn(async (data: Row) => { store.auditLogs.insert(data); }),

    // ---- vendors (db.ts VENDOR MANAGEMENT) ----
    getVendorByName: vi.fn(async (name: string, companyId?: number) => {
      const trimmed = (name ?? "").trim().toLowerCase();
      if (!trimmed) return null;
      const scoped = store.vendors.filter((v) => companyId == null || v.companyId === companyId);
      const lookups = [
        (n: string) => n === trimmed,
        (n: string) => n.startsWith(trimmed),
        (n: string) => n.includes(trimmed),
      ];
      for (const match of lookups) {
        const hit = scoped.find((v) => match(String(v.name).toLowerCase()));
        if (hit) return hit;
      }
      return null;
    }),
    createVendor: vi.fn(async (data: Row) => ({ id: store.vendors.insert(data).id })),
    getVendorById: vi.fn(async (id: number) => store.vendors.get(id)),

    // ---- purchase orders ----
    findPurchaseOrderByNumberExact: vi.fn(async (poNumber: string, vendorId?: number) =>
      store.purchaseOrders.filter((p) => p.poNumber === poNumber && (vendorId == null || p.vendorId === vendorId))
        .sort((a, b) => a.id - b.id)[0] || null),
    findPurchaseOrderByNumber: vi.fn(async (poNumber: string) =>
      store.purchaseOrders.find((p) => p.poNumber === poNumber || String(p.poNumber).includes(poNumber)) || null),
    createPurchaseOrderIfAbsent: vi.fn(async (data: Row) => {
      const existing = store.purchaseOrders.find((p) => p.poNumber === data.poNumber && p.vendorId === data.vendorId);
      if (existing) return { created: false as const, id: existing.id, existing: { id: existing.id, poNumber: existing.poNumber, status: existing.status } };
      const row = store.purchaseOrders.insert({ freightCost: null, ...data });
      return { created: true as const, id: row.id, existing: null };
    }),
    createPurchaseOrderItem: vi.fn(async (data: Row) => ({ id: store.purchaseOrderItems.insert(data).id })),
    updatePurchaseOrder: vi.fn(async (id: number, data: Row) => { store.purchaseOrders.update(id, data); }),

    // ---- raw materials ----
    getRawMaterials: vi.fn(async (filters?: { status?: string; category?: string; searchTerm?: string; limit?: number }) => {
      let rows = store.rawMaterials.all();
      if (filters?.status) rows = rows.filter((r) => r.status === filters.status);
      if (filters?.category) rows = rows.filter((r) => r.category === filters.category);
      if (filters?.searchTerm) rows = rows.filter((r) => String(r.name).includes(filters.searchTerm!));
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return filters?.limit ? rows.slice(0, filters.limit) : rows;
    }),
    createRawMaterial: vi.fn(async (data: Row) => ({ id: store.rawMaterials.insert({ status: "active", quantityReceived: "0.0000", ...data }).id })),
    getRawMaterialsByIds: vi.fn(async (ids: number[]) => store.rawMaterials.filter((r) => ids.includes(r.id))),
    updateRawMaterial: vi.fn(async (id: number, data: Row) => { store.rawMaterials.update(id, data); }),

    // ---- freight ----
    createFreightBooking: vi.fn(async (data: Row) => {
      const bookingNumber = `BK-${new Date().getFullYear()}-${String(store.freightBookings.all().length + 1).padStart(5, "0")}`;
      const row = store.freightBookings.insert({ ...data, bookingNumber });
      return { id: row.id, bookingNumber };
    }),

    // ---- bills / payments ----
    findBillByNumber: vi.fn(async (billNumber: string, vendorId: number) =>
      store.bills.find((b) => b.billNumber === billNumber && b.vendorId === vendorId) || null),
    createBill: vi.fn(async (data: Row) => ({ id: store.bills.insert({ amountPaid: "0.00", ...data }).id })),
    getBillById: vi.fn(getBillById),
    getBills: vi.fn(async (filters?: Row) => {
      let rows = store.bills.all();
      if (filters?.companyIds) rows = rows.filter((b) => filters.companyIds.includes(b.companyId));
      if (filters?.status) rows = rows.filter((b) => b.status === filters.status);
      if (filters?.vendorId) rows = rows.filter((b) => b.vendorId === filters.vendorId);
      return rows.map(withJoins);
    }),
    updateBill: vi.fn(async (id: number, data: Row) => { store.bills.update(id, data); return getBillById(id); }),
    createPayment: vi.fn(async (data: Row) => ({ id: store.payments.insert(data).id })),
    recordBillPayment: vi.fn(async (billId: number, payment: { amount: number; paymentId?: number }) => {
      const bill = store.bills.get(billId);
      if (!bill) throw new Error("Bill not found");
      const next = nextStatusAfterPayment(bill as { totalAmount: string; amountPaid: string }, payment.amount);
      store.bills.update(billId, {
        amountPaid: next.amountPaid.toFixed(2),
        status: next.status,
        paidAt: next.status === "paid" ? new Date() : bill.paidAt,
      });
      return getBillById(billId);
    }),

    // ---- import history (audit_logs rows, entityType document_import_<type>) ----
    createDocumentImportLog: vi.fn(async (data: Row) => {
      store.auditLogs.insert({
        companyId: data.companyId ?? null,
        userId: data.importedBy,
        action: "create",
        entityType: `document_import_${data.documentType}`,
        entityId: 0,
        entityName: data.filename,
        newValues: {
          filename: data.filename,
          status: data.status,
          createdRecords: parseJsonArray(data.createdRecords),
          updatedRecords: parseJsonArray(data.updatedRecords),
          warnings: parseJsonArray<string>(data.warnings),
          error: data.error,
          importedAt: data.importedAt,
        },
      });
    }),
    getDocumentImportLogs: vi.fn(async (limit = 50) =>
      store.auditLogs.filter((l) => String(l.entityType).startsWith("document_import_"))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((log) => ({
          id: log.id,
          fileName: log.newValues.filename,
          documentType: String(log.entityType).replace("document_import_", ""),
          status: log.newValues.status,
          recordsCreated: log.newValues.createdRecords.length,
          recordsUpdated: log.newValues.updatedRecords.length,
          warnings: log.newValues.warnings,
          error: log.newValues.error,
          createdAt: log.createdAt,
          importData: log.newValues,
        }))),
  };
});

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../storage", () => ({
  storagePut: vi.fn(async () => { throw new Error("R2 is not configured"); }),
  storageGet: vi.fn(),
  storageDelete: vi.fn(),
}));

import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { assertPdfRasterizerAvailable, resetPdfRasterizerCheck } from "../documentImportService";
import { appRouter } from "../routers";

const llmReply = (payload: unknown) =>
  vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(payload) } }] } as any);
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

const ops = appRouter.createCaller(ctxFor("ops", { id: 5, companyId: 1 }));
const finance = appRouter.createCaller(ctxFor("finance", { id: 6, companyId: 1 }));
const plainUser = appRouter.createCaller(ctxFor("user", { id: 9, companyId: 1 }));

const PO_CSV = "PO Number,Vendor,Item,Qty,Unit Price\nPO-1,Acme Foods,Coconut Oil,40,25.00\nPO-1,Acme Foods,Cane Sugar,100,1.50\n";

const parsedPo = {
  documentType: "purchase_order",
  confidence: 92,
  purchaseOrder: {
    poNumber: "PO-1",
    vendorName: "Acme Foods",
    vendorEmail: "orders@acme.test",
    orderDate: "2026-05-01",
    deliveryDate: null,
    status: "received",
    lineItems: [
      { description: "Coconut Oil", sku: "CO-1", quantity: "40", unit: "kg", unitPrice: "25.00", totalPrice: "1,000.00" },
      { description: "Cane Sugar", sku: null, quantity: 100, unit: "kg", unitPrice: 1.5, totalPrice: 150 },
    ],
    subtotal: "1,150.00",
    taxAmount: null,
    totalAmount: "1,150.00",
    currency: "usd",
    notes: null,
  },
};

describe("document import flow", () => {
  let parsedResult: Awaited<ReturnType<typeof ops.documentImport.parse>>;
  let acmeId: number;
  let poId: number;
  let billId: number;

  it("1. ops uploads a CSV purchase order; storage is unavailable so it is parsed inline from a data: URL and the numbers are normalized", async () => {
    llmReply(parsedPo);
    parsedResult = await ops.documentImport.parse({ fileData: b64(PO_CSV), fileName: "po-1.csv", mimeType: "text/csv" });

    expect(parsedResult.success).toBe(true);
    expect(parsedResult.documentType).toBe("purchase_order");
    expect(parsedResult.fileUrl).toBeNull(); // nothing durable was stored
    expect(parsedResult.rawText).toBe("Document parsed from: po-1.csv"); // never echoes the data: URL
    const po = parsedResult.purchaseOrder!;
    expect(po.confidence).toBe(92);
    expect(po.subtotal).toBe(1150);
    expect(po.totalAmount).toBe(1150);
    expect(po.lineItems).toEqual([
      { description: "Coconut Oil", sku: "CO-1", quantity: 40, unit: "kg", unitPrice: 25, totalPrice: 1000 },
      { description: "Cane Sugar", quantity: 100, unit: "kg", unitPrice: 1.5, totalPrice: 150 },
    ]);
    expect(po).not.toHaveProperty("deliveryDate"); // nulls are dropped

    // The model saw the CSV text, in a text-only message with the strict JSON schema.
    const call = vi.mocked(invokeLLM).mock.calls[0][0];
    const userMsg = call.messages[1].content as Array<{ type: string; text?: string }>;
    expect(userMsg[0].type).toBe("text");
    expect(userMsg[0].text).toContain("DOCUMENT CONTENT:\n" + PO_CSV);
    expect(call.response_format?.type).toBe("json_schema");
  });

  it("2a. importing it as a PO (create missing vendor, received, update inventory) creates the vendor, PO, items and materials, and receives stock", async () => {
    await expect(plainUser.documentImport.importPO({ poData: parsedResult.purchaseOrder as any, createMissingVendor: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await ops.documentImport.importPO({
      poData: parsedResult.purchaseOrder as any,
      markAsReceived: true,
      updateInventory: true,
      createMissingVendor: true,
      fileName: "po-1.csv",
    });
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.createdRecords.map((r) => r.type)).toEqual(["vendor", "raw_material", "raw_material", "purchase_order"]);

    const vendor = store.vendors.all()[0];
    acmeId = vendor.id;
    expect(vendor).toMatchObject({ name: "Acme Foods", email: "orders@acme.test", type: "supplier", status: "active", companyId: 1 });

    const po = store.purchaseOrders.all()[0];
    poId = po.id;
    expect(po).toMatchObject({
      poNumber: "PO-1", vendorId: acmeId, companyId: 1, status: "received",
      subtotal: "1150", totalAmount: "1150", currency: "USD", createdBy: 5,
    });
    expect(po.orderDate).toEqual(new Date("2026-05-01"));

    const items = store.purchaseOrderItems.filter((i) => i.purchaseOrderId === poId);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.productId === null)).toBe(true); // raw-material lines carry no product FK
    expect(items[0]).toMatchObject({ description: "Coconut Oil", quantity: "40", unitPrice: "25", totalAmount: "1000" });

    const materials = store.rawMaterials.all();
    expect(materials.map((m) => m.name)).toEqual(["Coconut Oil", "Cane Sugar"]);
    expect(materials[0]).toMatchObject({ sku: "CO-1", unit: "kg", unitCost: "25", preferredVendorId: acmeId, companyId: 1 });
    expect(materials[1].sku).toMatch(/^RM-\d+$/);
    // Stock was received onto both materials.
    expect(materials[0]).toMatchObject({ quantityReceived: "40", lastReceivedQty: "40", receivingStatus: "received" });
    expect(materials[1]).toMatchObject({ quantityReceived: "100", lastReceivedQty: "100" });
    expect(result.updatedRecords).toEqual([
      { type: "raw_material", id: materials[0].id, name: "Coconut Oil", changes: "Received: +40 (total received: 40)" },
      { type: "raw_material", id: materials[1].id, name: "Cane Sugar", changes: "Received: +100 (total received: 100)" },
    ]);
  });

  it("2b. the import shows up in the history and a second import of the same PO number is skipped as a duplicate", async () => {
    const history = await ops.documentImport.getHistory({ limit: 10 });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fileName: "po-1.csv", documentType: "purchase_order", status: "success", recordsCreated: 4, recordsUpdated: 2, warnings: [] });

    const again = await ops.documentImport.importPO({
      poData: parsedResult.purchaseOrder as any, markAsReceived: true, createMissingVendor: true, fileName: "po-1.csv",
    });
    expect(again.success).toBe(true);
    expect(again.createdRecords).toEqual([]);
    expect(again.warnings).toEqual([`PO PO-1 was already imported (#${poId}) — skipped to avoid a duplicate.`]);
    expect(store.purchaseOrders.all()).toHaveLength(1);
    expect(store.rawMaterials.all()).toHaveLength(2); // no stray materials either
    expect(store.rawMaterials.get(1)!.quantityReceived).toBe("40"); // and no double receipt

    const history2 = await ops.documentImport.getHistory({ limit: 10 });
    expect(history2).toHaveLength(2);
    expect(history2[0]).toMatchObject({ status: "partial", recordsCreated: 0 }); // newest first, warnings → partial
  });

  it("2c. with updateInventory=false a received PO is recorded but stock is left alone; existing materials are matched, not recreated", async () => {
    const result = await ops.documentImport.importPO({
      poData: {
        ...parsedPo.purchaseOrder, poNumber: "PO-2", deliveryDate: "2026-06-01",
        lineItems: [{ description: "Coconut Oil", sku: null, quantity: 10, unit: "kg", unitPrice: 25, totalPrice: 250 }],
        subtotal: 250, totalAmount: 250,
      } as any,
      markAsReceived: true,
      updateInventory: false,
      createMissingVendor: false, // Acme already exists
    });
    expect(result.success).toBe(true);
    expect(result.createdRecords).toEqual([{ type: "purchase_order", id: 2, name: "PO-2" }]);
    expect(result.updatedRecords).toEqual([]);
    expect(result.warnings).toEqual(["Inventory was not updated (Update inventory is off)."]);
    expect(store.rawMaterials.all()).toHaveLength(2);
    expect(store.rawMaterials.get(1)!.quantityReceived).toBe("40");
    expect(store.purchaseOrders.get(2)).toMatchObject({ poNumber: "PO-2", vendorId: acmeId, status: "received" });
    expect(store.purchaseOrders.get(2)!.expectedDate).toEqual(new Date("2026-06-01"));
    expect(vi.mocked(db.updateRawMaterial)).toHaveBeenCalledTimes(2); // only the two receipts from step 2a
  });

  it("3. a vendor invoice import creates a PO stand-in plus a draft bill; finance sees it, approves it and marks it paid", async () => {
    llmReply({
      documentType: "vendor_invoice",
      confidence: 0.9,
      vendorInvoice: {
        invoiceNumber: "INV-77", vendorName: "acme foods", invoiceDate: "2026-05-10", dueDate: "2026-06-09",
        lineItems: [{ description: "Cane Sugar", quantity: 20, unit: "kg", unitPrice: 1.5, totalPrice: 30 }],
        subtotal: 30, taxAmount: 2.4, shippingAmount: 5, totalAmount: 37.4, currency: "USD", paymentTerms: "Net 30", notes: null,
      },
    });
    const parsed = await ops.documentImport.parse({ fileData: b64("Invoice INV-77 ..."), fileName: "inv-77.txt", mimeType: "text/plain" });
    expect(parsed.documentType).toBe("vendor_invoice");
    expect(parsed.vendorInvoice).toMatchObject({ invoiceNumber: "INV-77", totalAmount: 37.4, confidence: 0.9 });

    const result = await ops.documentImport.importVendorInvoice({
      invoiceData: parsed.vendorInvoice as any, markAsReceived: false, createMissingVendor: false, fileName: "inv-77.txt",
    });
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.createdRecords).toEqual([
      { type: "purchase_order", id: 3, name: "INV-77" },
      { type: "bill", id: 1, name: "INV-77" },
    ]);
    // Vendor resolved case-insensitively to the existing Acme, not recreated.
    expect(store.vendors.all()).toHaveLength(1);
    expect(store.purchaseOrders.get(3)).toMatchObject({ poNumber: "INV-INV-77", vendorId: acmeId, status: "confirmed", totalAmount: "37.4" });
    expect(store.purchaseOrders.get(3)!.notes).toContain("Imported from vendor invoice INV-77. Payment terms: Net 30.");

    const bill = store.bills.get(1)!;
    billId = bill.id;
    expect(bill).toMatchObject({
      companyId: 1, billNumber: "INV-77", vendorId: acmeId, purchaseOrderId: 3, sourceType: "document_import",
      subtotal: "30", taxAmount: "2.4", shippingAmount: "5", totalAmount: "37.4", currency: "USD", status: "draft",
      paymentTerms: "Net 30", createdBy: 5,
    });
    expect(bill.billDate).toEqual(new Date("2026-05-10"));
    expect(bill.dueDate).toEqual(new Date("2026-06-09"));
    expect(bill.lineItems).toEqual([{ description: "Cane Sugar", quantity: 20, unit: "kg", unitPrice: 1.5, totalPrice: 30 }]);

    // Finance sees the bill with its vendor and the PO it hangs off.
    await expect(ops.bills.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const listed = await finance.bills.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: billId, billNumber: "INV-77", vendorName: "Acme Foods", poNumber: "INV-INV-77", status: "draft" });

    const approved = await finance.bills.approve({ id: billId });
    expect(approved).toMatchObject({ status: "approved", approvedBy: 6 });

    const paid = await finance.bills.markPaid({ id: billId, paymentMethod: "ach", referenceNumber: "ACH-1" });
    expect(paid).toMatchObject({ status: "paid", amountPaid: "37.40" });
    expect(store.payments.all()).toHaveLength(1);
    expect(store.payments.get(1)).toMatchObject({
      type: "made", vendorId: acmeId, purchaseOrderId: 3, amount: "37.40", currency: "USD", paymentMethod: "ach",
      referenceNumber: "ACH-1", status: "completed", createdBy: 6, companyId: 1,
    });
    await expect(finance.bills.approve({ id: billId })).rejects.toMatchObject({ code: "FORBIDDEN" }); // already paid

    // Re-importing the same invoice neither duplicates the PO nor the bill.
    const again = await ops.documentImport.importVendorInvoice({ invoiceData: parsed.vendorInvoice as any, createMissingVendor: false });
    expect(again.createdRecords).toEqual([]);
    expect(again.warnings[0]).toMatch(/Invoice INV-77 was already imported as PO INV-INV-77/);
    expect(store.bills.all()).toHaveLength(1);
  });

  it("4a. a freight invoice becomes a freight booking for a new carrier vendor and, linked to PO-1, records the freight cost on it", async () => {
    llmReply({
      documentType: "freight_invoice",
      confidence: 0.8,
      freightInvoice: {
        invoiceNumber: "FI-9", carrierName: "FastFreight Logistics", carrierEmail: "billing@ff.test", invoiceDate: "2026-05-12",
        shipmentDate: "2026-05-08", deliveryDate: "2026-05-11", origin: "Bangkok", destination: "Los Angeles",
        trackingNumber: "FF123", weight: "500 kg", freightCharges: "1,200", fuelSurcharge: 180, accessorialCharges: null,
        totalAmount: 1380, currency: "USD", relatedPoNumber: "PO-1", notes: "Liftgate",
      },
    });
    const parsed = await ops.documentImport.parse({ fileData: b64("freight bill"), fileName: "fi-9.txt", mimeType: "text/plain" });
    expect(parsed.documentType).toBe("freight_invoice");
    expect(parsed.freightInvoice).toMatchObject({ freightCharges: 1200, totalAmount: 1380 });

    const result = await ops.documentImport.importFreightInvoice({
      invoiceData: parsed.freightInvoice as any, linkToPO: true, createMissingVendor: true, fileName: "fi-9.txt",
    });
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.createdRecords).toEqual([
      { type: "vendor", id: 2, name: "FastFreight Logistics" },
      { type: "freight_history", id: 1, name: "FI-9" },
    ]);
    expect(store.vendors.get(2)).toMatchObject({ name: "FastFreight Logistics", type: "service", email: "billing@ff.test", companyId: 1 });

    expect(vi.mocked(db.createFreightBooking)).toHaveBeenCalledTimes(1);
    const booking = store.freightBookings.get(1)!;
    expect(booking).toMatchObject({
      companyId: 1, rfqId: 0, quoteId: 0, carrierId: 2, status: "delivered", actualCost: "1380", currency: "USD",
      trackingNumber: "FF123", bookingNumber: `BK-${new Date().getFullYear()}-00001`,
    });
    expect(booking.bookingDate).toEqual(new Date("2026-05-12"));
    expect(booking.pickupDate).toEqual(new Date("2026-05-08"));
    expect(booking.deliveryDate).toEqual(new Date("2026-05-11"));
    expect(JSON.parse(booking.notes)).toMatchObject({
      invoiceNumber: "FI-9", origin: "Bangkok", destination: "Los Angeles", freightCharges: "1200", fuelSurcharge: "180",
      relatedPoId: poId, notes: "Liftgate", importedInvoice: true, createdBy: 5,
    });
    // linkToPO honoured: PO-1 now carries the freight cost.
    expect(store.purchaseOrders.get(poId)!.freightCost).toBe("1380");
    expect(result.updatedRecords).toEqual([{ type: "purchase_order", id: poId, name: "PO-1", changes: "Freight cost added: $1380" }]);
  });

  it("4b. a customs document becomes an 'arrived' freight record with the shipper as carrier; linkToPO=false leaves the PO untouched, linkToPO=true appends the customs note", async () => {
    llmReply({
      documentType: "customs_document",
      confidence: 0.77,
      customsDocument: {
        documentNumber: "BOL-5", documentType: "bill_of_lading", entryDate: "2026-05-13", shipperName: "Acme Foods",
        shipperCountry: "Thailand", consigneeName: "Our Co", consigneeCountry: "USA", countryOfOrigin: "Thailand",
        portOfEntry: "Los Angeles", portOfExit: "Bangkok", vesselName: "Pacific Voyager", voyageNumber: "V-1", containerNumber: "MSKU1",
        lineItems: [{ description: "Cocoa Butter Blocks", hsCode: "1804.00.00", quantity: 200, unit: "kg", declaredValue: "3,000", dutyRate: 5, dutyAmount: 150, countryOfOrigin: null }],
        totalDeclaredValue: "3,000", totalDuties: 150, totalTaxes: 30, totalCharges: 180, currency: "USD", brokerName: null,
        relatedPoNumber: "PO-1", notes: null,
      },
    });
    const parsed = await ops.documentImport.parse({ fileData: b64("bill of lading"), fileName: "bol-5.txt", mimeType: "text/plain" });
    expect(parsed.documentType).toBe("customs_document");
    expect(parsed.customsDocument).toMatchObject({ totalDeclaredValue: 3000, totalCharges: 180 });
    expect(parsed.customsDocument!.lineItems[0]).toMatchObject({ declaredValue: 3000, quantity: 200 });

    const notesBefore = store.purchaseOrders.get(poId)!.notes;
    const unlinked = await ops.documentImport.importCustomsDocument({ documentData: parsed.customsDocument as any, linkToPO: false });
    expect(unlinked.success).toBe(true);
    expect(unlinked.warnings).toEqual([]); // the PO was never looked up, so no "not found" warning either
    expect(unlinked.updatedRecords).toEqual([]);
    expect(unlinked.createdRecords).toEqual([
      { type: "customs_document", id: 2, name: "BOL-5" },
      { type: "raw_material", id: 3, name: "Cocoa Butter Blocks" },
    ]);
    expect(store.purchaseOrders.get(poId)!.notes).toBe(notesBefore);

    const customs = store.freightBookings.get(2)!;
    expect(customs).toMatchObject({
      companyId: 1, carrierId: acmeId, status: "arrived", actualCost: "180", currency: "USD",
      trackingNumber: "MSKU1", containerNumber: "MSKU1", vesselName: "Pacific Voyager", voyageNumber: "V-1",
    });
    expect(customs.arrivalDate).toEqual(new Date("2026-05-13"));
    expect(JSON.parse(customs.notes)).toMatchObject({
      invoiceNumber: "BOL-5", documentType: "bill_of_lading", origin: "Bangkok", destination: "Los Angeles",
      freightCharges: "3000", fuelSurcharge: "150", accessorialCharges: "30", importedCustomsDocument: true,
    });
    expect(JSON.parse(customs.notes)).not.toHaveProperty("relatedPoId");
    expect(JSON.parse(customs.notes).notes).toBe("BILL OF LADING | Shipper: Acme Foods (Thailand) | Consignee: Our Co | Country of Origin: Thailand | Vessel: Pacific Voyager | Voyage: V-1");
    expect(store.rawMaterials.get(3)).toMatchObject({ name: "Cocoa Butter Blocks", sku: "HS-1804.00.00", unit: "kg", unitCost: "15.0000", preferredVendorId: acmeId, companyId: 1 });

    const linked = await ops.documentImport.importCustomsDocument({ documentData: parsed.customsDocument as any, linkToPO: true });
    // The material already carries its HS- SKU, so only the PO is touched this time.
    expect(linked.updatedRecords).toEqual([
      { type: "purchase_order", id: poId, name: "PO-1", changes: "Customs document linked: BOL-5" },
    ]);
    expect(store.purchaseOrders.get(poId)!.notes).toBe("Customs Doc: BOL-5 | Duties: USD 150 | Taxes: USD 30");
    expect(store.rawMaterials.all()).toHaveLength(3); // the HS-coded material was matched, not recreated

    const history = await ops.documentImport.getHistory({ limit: 50 });
    expect(history.map((h) => h.documentType)).toEqual([
      "customs_document", "customs_document", "freight_invoice", "vendor_invoice", "vendor_invoice", "purchase_order", "purchase_order", "purchase_order",
    ]);
  });
});

// A one-page PDF with no text stream: pdfjs extracts nothing, which is what
// sends the parser down the scanned-PDF (rasterize + vision) path.
const BLANK_PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;

function rasterizerInstalled(): boolean {
  try { execSync("gm version", { stdio: "ignore" }); execSync("gs --version", { stdio: "ignore" }); return true; } catch { return false; }
}

describe("5. scanned PDF", () => {
  beforeAll(() => { vi.mocked(invokeLLM).mockReset(); });

  describe.skipIf(!rasterizerInstalled())("with GraphicsMagick + Ghostscript installed", () => {
    it("rasterizes the page and sends the model an image (no strict JSON schema)", async () => {
      resetPdfRasterizerCheck();
      llmReply({ documentType: "purchase_order", confidence: 0.6, purchaseOrder: { poNumber: "PO-S", vendorName: "Scan Co", orderDate: "2026-01-01", lineItems: [], totalAmount: 1 } });
      const result = await ops.documentImport.parse({ fileData: b64(BLANK_PDF), fileName: "scan.pdf", mimeType: "application/pdf" });
      expect(result.success).toBe(true);
      expect(result.purchaseOrder?.poNumber).toBe("PO-S");
      const call = vi.mocked(invokeLLM).mock.calls[0][0];
      const content = call.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
      expect(content[0].type).toBe("text");
      expect(content[1].type).toBe("image_url");
      expect(content[1].image_url!.url).toMatch(/^data:image\/png;base64,/);
      expect(call).not.toHaveProperty("response_format");
    });
  });

  it("without gm on PATH the parse fails with the clear GraphicsMagick/Ghostscript message instead of a spawn error", async () => {
    vi.mocked(invokeLLM).mockClear();
    const path = process.env.PATH;
    process.env.PATH = "";
    resetPdfRasterizerCheck();
    try {
      expect(() => assertPdfRasterizerAvailable()).toThrow(/Scanned-PDF OCR needs GraphicsMagick and Ghostscript on the server/);
      const result = await ops.documentImport.parse({ fileData: b64(BLANK_PDF), fileName: "scan.pdf", mimeType: "application/pdf" });
      expect(result.success).toBe(false);
      expect(result.documentType).toBe("unknown");
      expect(result.error).toMatch(/^Failed to process PDF: Failed to process scanned PDF: Scanned-PDF OCR needs GraphicsMagick and Ghostscript/);
      expect(invokeLLM).not.toHaveBeenCalled();
    } finally {
      process.env.PATH = path;
      resetPdfRasterizerCheck();
    }
  });
});

