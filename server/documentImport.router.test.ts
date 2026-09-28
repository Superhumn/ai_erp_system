import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Regression coverage for appRouter.documentImport: role gating on the write
// procedures, tolerance of the model's nulls / numeric strings in the payload
// the client sends back, the import-history row, honest Drive batch results,
// and inline parsing when object storage is not configured.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createDocumentImportLog: vi.fn().mockResolvedValue(undefined),
  getDocumentImportLogs: vi.fn().mockResolvedValue([]),
  getGoogleOAuthToken: vi.fn().mockResolvedValue({ accessToken: "tok", expiresAt: null, refreshToken: null }),
  upsertGoogleOAuthToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

vi.mock("./documentImportService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./documentImportService")>()),
  parseUploadedDocument: vi.fn(),
  importPurchaseOrder: vi.fn(),
  importFreightInvoice: vi.fn(),
  importVendorInvoice: vi.fn(),
  importCustomsDocument: vi.fn(),
}));

import * as db from "./db";
import { storagePut } from "./storage";
import * as service from "./documentImportService";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
type Mock = ReturnType<typeof vi.fn>;

function ctxFor(user: Partial<AuthenticatedUser> = {}): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "ops",
      companyId: 7,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const okResult = (documentType: string) => ({
  success: true,
  documentType,
  createdRecords: [{ type: "purchase_order", id: 1, name: "PO-1" }],
  updatedRecords: [],
  warnings: [] as string[],
});

const poPayload = {
  poNumber: "PO-1",
  vendorName: "Acme",
  vendorEmail: null,
  orderDate: "2026-05-01",
  deliveryDate: null,
  subtotal: "1,000.00",
  totalAmount: 1000,
  notes: null,
  lineItems: [{ description: "Coconut Oil", sku: null, quantity: "4", unit: null, unitPrice: 250, totalPrice: "1000" }],
};

describe("documentImport router — imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(service.importPurchaseOrder).mockResolvedValue(okResult("purchase_order") as any);
    vi.mocked(service.importFreightInvoice).mockResolvedValue(okResult("freight_invoice") as any);
    vi.mocked(service.importVendorInvoice).mockResolvedValue(okResult("vendor_invoice") as any);
    vi.mocked(service.importCustomsDocument).mockResolvedValue(okResult("customs_document") as any);
  });

  it("requires an operations role to write vendor/PO data (matches vendors.create / purchaseOrders.create)", async () => {
    const caller = appRouter.createCaller(ctxFor({ role: "user" }));
    await expect(caller.documentImport.importPO({ poData: poPayload as any })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.documentImport.importVendorInvoice({
      invoiceData: { invoiceNumber: "I-1", vendorName: "A", invoiceDate: "2026-01-01", lineItems: [], subtotal: 1, totalAmount: 1 },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.importPurchaseOrder).not.toHaveBeenCalled();
  });

  it("accepts the model's nulls and numeric strings, and hands the service clean data plus the caller's entity and flags", async () => {
    const caller = appRouter.createCaller(ctxFor({ companyId: 7 }));
    const result = await caller.documentImport.importPO({
      poData: poPayload as any,
      markAsReceived: true,
      updateInventory: false,
      createMissingVendor: true,
      fileName: "po-1.pdf",
    });
    expect(result.success).toBe(true);

    const [poData, userId, markAsReceived, createMissingVendor, options] = (service.importPurchaseOrder as Mock).mock.calls[0];
    expect(userId).toBe(2);
    expect(markAsReceived).toBe(true);
    expect(createMissingVendor).toBe(true);
    expect(options).toEqual({ updateInventory: false, companyId: 7 });
    expect(poData).toMatchObject({ poNumber: "PO-1", subtotal: 1000, totalAmount: 1000 });
    expect(poData).not.toHaveProperty("vendorEmail");
    expect(poData.lineItems[0]).toEqual({ description: "Coconut Oil", quantity: 4, unitPrice: 250, totalPrice: 1000 });
  });

  it("records every import in the history the page reads (db.createDocumentImportLog)", async () => {
    const caller = appRouter.createCaller(ctxFor());
    await caller.documentImport.importPO({ poData: poPayload as any, fileName: "po-1.pdf" });
    expect(db.createDocumentImportLog).toHaveBeenCalledWith(expect.objectContaining({
      filename: "po-1.pdf",
      documentType: "purchase_order",
      status: "success",
      importedBy: 2,
      createdRecords: JSON.stringify(okResult("purchase_order").createdRecords),
    }));

    vi.mocked(service.importFreightInvoice).mockResolvedValue({ ...okResult("freight_invoice"), success: false, error: "boom" } as any);
    await caller.documentImport.importFreightInvoice({
      invoiceData: { invoiceNumber: "F-1", carrierName: "Ship", invoiceDate: "2026-01-01", freightCharges: "1", totalAmount: "1", fuelSurcharge: null } as any,
      linkToPO: false,
    });
    expect(db.createDocumentImportLog).toHaveBeenLastCalledWith(expect.objectContaining({
      filename: "Freight invoice F-1", status: "failed", error: "boom",
    }));
    const [, , , , , freightOptions] = (service.importFreightInvoice as Mock).mock.calls[0];
    expect(freightOptions).toEqual({ linkToPO: false, companyId: 7 });
  });

  it("passes updateInventory and companyId through to the vendor invoice importer", async () => {
    const caller = appRouter.createCaller(ctxFor({ companyId: 7 }));
    await caller.documentImport.importVendorInvoice({
      invoiceData: { invoiceNumber: "I-1", vendorName: "A", invoiceDate: "2026-01-01", lineItems: [], subtotal: 1, totalAmount: 1 },
      markAsReceived: true,
      updateInventory: false,
      createMissingVendor: true,
    });
    const [invoiceData, userId, markAsReceived, createMissingVendor, options] = (service.importVendorInvoice as Mock).mock.calls[0];
    expect(invoiceData).toMatchObject({ invoiceNumber: "I-1", vendorName: "A" });
    expect(userId).toBe(2);
    expect(markAsReceived).toBe(true);
    expect(createMissingVendor).toBe(true);
    expect(options).toEqual({ updateInventory: false, companyId: 7 });

    (service.importVendorInvoice as Mock).mockClear();
    await caller.documentImport.importVendorInvoice({
      invoiceData: { invoiceNumber: "I-2", vendorName: "A", invoiceDate: "2026-01-01", lineItems: [], subtotal: 1, totalAmount: 1 },
    });
    expect((service.importVendorInvoice as Mock).mock.calls[0][4]).toEqual({ updateInventory: true, companyId: 7 });
  });

  it("passes linkToPO and companyId through to the customs importer", async () => {
    const caller = appRouter.createCaller(ctxFor({ companyId: 3 }));
    await caller.documentImport.importCustomsDocument({
      documentData: {
        documentNumber: "BOL-1", documentType: "bill_of_lading", entryDate: "2026-01-01", shipperName: "S",
        consigneeName: "C", countryOfOrigin: "CN", lineItems: [], totalDeclaredValue: "100", totalCharges: 100,
        brokerName: null, portOfEntry: null,
      } as any,
      linkToPO: false,
    });
    const [documentData, userId, createMissingVendor, options] = (service.importCustomsDocument as Mock).mock.calls[0];
    expect(userId).toBe(2);
    expect(createMissingVendor).toBe(false);
    expect(options).toEqual({ linkToPO: false, companyId: 3 });
    expect(documentData).not.toHaveProperty("brokerName");
    expect(documentData.totalDeclaredValue).toBe(100);
  });
});

describe("documentImport router — parse & Drive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(service.parseUploadedDocument).mockResolvedValue({ success: true, documentType: "purchase_order", purchaseOrder: {} as any });
  });

  it("parses inline (data: URL) when object storage is not configured, instead of failing the upload", async () => {
    vi.mocked(storagePut).mockRejectedValue(new Error("R2 is not configured"));
    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.documentImport.parse({
      fileData: Buffer.from("a,b\n1,2").toString("base64"),
      fileName: "po.csv",
      mimeType: "text/csv",
    });
    expect(result.success).toBe(true);
    expect(result.fileUrl).toBeNull();
    const [url, fileName, , mimeType] = (service.parseUploadedDocument as Mock).mock.calls[0];
    expect(url).toMatch(/^data:text\/csv;base64,/);
    expect(fileName).toBe("po.csv");
    expect(mimeType).toBe("text/csv");
  });

  it("uses the stored URL when storage works", async () => {
    vi.mocked(storagePut).mockResolvedValue({ key: "k", url: "https://storage.example/k" });
    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.documentImport.parse({ fileData: Buffer.from("x").toString("base64"), fileName: "po.pdf", mimeType: "application/pdf" });
    expect(result.fileUrl).toBe("https://storage.example/k");
    expect((service.parseUploadedDocument as Mock).mock.calls[0][0]).toBe("https://storage.example/k");
  });

  it("rejects an empty upload", async () => {
    const caller = appRouter.createCaller(ctxFor());
    await expect(caller.documentImport.parse({ fileData: "", fileName: "empty.pdf" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reports a Drive file whose parse failed as a failure, not a success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new TextEncoder().encode("a,b").buffer,
    })));
    vi.mocked(storagePut).mockResolvedValue({ key: "k", url: "https://storage.example/k" });
    vi.mocked(service.parseUploadedDocument)
      .mockResolvedValueOnce({ success: false, documentType: "unknown", error: "AI response was not valid JSON" })
      .mockResolvedValueOnce({ success: true, documentType: "unknown" })
      .mockResolvedValueOnce({ success: true, documentType: "purchase_order", purchaseOrder: { poNumber: "PO-9" } as any });

    const caller = appRouter.createCaller(ctxFor());
    const { results } = await caller.documentImport.batchParseFromDrive({
      files: [
        { fileId: "1", fileName: "bad.pdf", mimeType: "application/pdf" },
        { fileId: "2", fileName: "unknown.pdf", mimeType: "application/pdf" },
        { fileId: "3", fileName: "good.pdf", mimeType: "application/pdf" },
      ],
    });
    expect(results.map((r) => r.success)).toEqual([false, false, true]);
    expect(results[0].error).toBe("AI response was not valid JSON");
    expect(results[1].error).toMatch(/document type/);
    expect(results[2].data).toMatchObject({ documentType: "purchase_order", fileUrl: "https://storage.example/k" });
  });

  it("refuses a Drive file over the attachment size limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(30 * 1024 * 1024) },
      arrayBuffer: async () => new ArrayBuffer(0),
    })));
    const caller = appRouter.createCaller(ctxFor());
    const { results } = await caller.documentImport.batchParseFromDrive({
      files: [{ fileId: "1", fileName: "huge.pdf", mimeType: "application/pdf" }],
    });
    expect(results[0].success).toBe(false);
    expect(results[0].error).toMatch(/limit/);
    expect(storagePut).not.toHaveBeenCalled();
  });
});
