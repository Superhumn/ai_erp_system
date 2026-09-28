import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// appRouter.bills — vendor bills (accounts payable). The db layer is mocked at
// module level; billsService.payBill runs for real on top of the mock so the
// markPaid tests cover the shared payment path the workflow uses too.
const billRow = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  companyId: 1,
  billNumber: "BILL-2609-0001",
  vendorId: 4,
  purchaseOrderId: null,
  sourceType: "manual",
  sourceRef: null,
  billDate: new Date("2026-09-01"),
  dueDate: new Date("2026-10-01"),
  subtotal: "100.00",
  taxAmount: "0.00",
  shippingAmount: "0.00",
  totalAmount: "100.00",
  amountPaid: "0.00",
  currency: "USD",
  status: "approved",
  matchStatus: "unmatched",
  approvedBy: null,
  approvedAt: null,
  paidAt: null,
  paymentTerms: null,
  notes: null,
  attachmentUrl: null,
  lineItems: null,
  createdBy: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  vendorName: "Acme Mills",
  poNumber: null,
  ...overrides,
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getUserEntityAccessCompanyIds: vi.fn().mockResolvedValue([]),
  getCompanyById: vi.fn().mockResolvedValue(null),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
  getEntityAndDescendantCompanyIds: vi.fn().mockResolvedValue([]),
  getBills: vi.fn().mockResolvedValue([]),
  getBillById: vi.fn(),
  createBill: vi.fn().mockResolvedValue({ id: 10 }),
  updateBill: vi.fn(),
  findBillByNumber: vi.fn().mockResolvedValue(null),
  recordBillPayment: vi.fn(),
  getBillsAgingSummary: vi.fn().mockResolvedValue({ current: 0 }),
  getVendorById: vi.fn().mockResolvedValue({ id: 4, name: "Acme Mills", companyId: 1 }),
  getVendorByName: vi.fn().mockResolvedValue(null),
  findVendorByEmailOrName: vi.fn().mockResolvedValue(null),
  createVendor: vi.fn().mockResolvedValue({ id: 5 }),
  findPurchaseOrderByNumber: vi.fn().mockResolvedValue(null),
  createPayment: vi.fn().mockResolvedValue({ id: 77 }),
}));

vi.mock("./documentImportService", () => ({
  parseUploadedDocument: vi.fn(),
}));

import * as db from "./db";
import { parseUploadedDocument } from "./documentImportService";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(user: Partial<AuthenticatedUser> = {}): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "finance",
      companyId: 1,
      regionScope: "entity",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("bills router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getBillById).mockResolvedValue(billRow() as any);
    vi.mocked(db.updateBill).mockImplementation(async (id, data) => billRow({ id, ...data }) as any);
    vi.mocked(db.recordBillPayment).mockImplementation(async (_id, p) => billRow({ amountPaid: p.amount.toFixed(2), status: "paid" }) as any);
    vi.mocked(db.createPayment).mockResolvedValue({ id: 77 });
    vi.mocked(db.findBillByNumber).mockResolvedValue(null);
  });

  describe("list", () => {
    it("scopes an entity user to their own company and forwards the filters", async () => {
      const caller = appRouter.createCaller(ctxFor({ companyId: 3, regionScope: "entity" }));
      const dueBefore = new Date("2026-10-15");
      await caller.bills.list({ status: "approved", vendorId: 4, dueBefore, limit: 50 });
      expect(db.getBills).toHaveBeenCalledWith({ companyIds: [3], status: "approved", vendorId: 4, dueBefore, dueAfter: undefined, limit: 50 });
    });

    it("lets a global user see every entity", async () => {
      const caller = appRouter.createCaller(ctxFor({ regionScope: "global" }));
      await caller.bills.list();
      expect(db.getBills).toHaveBeenCalledWith(expect.objectContaining({ companyIds: undefined }));
    });

    it("rejects roles outside finance", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "sales" }));
      await expect(caller.bills.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("get", () => {
    it("returns the bill with vendor name, PO number and outstanding balance", async () => {
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ amountPaid: "25.00", poNumber: "PO-1" }) as any);
      const caller = appRouter.createCaller(ctxFor());
      const bill = await caller.bills.get({ id: 10 });
      expect(bill).toMatchObject({ vendorName: "Acme Mills", poNumber: "PO-1", outstanding: 75 });
    });

    it("hides a bill from another entity as NOT_FOUND", async () => {
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ companyId: 9 }) as any);
      const caller = appRouter.createCaller(ctxFor({ companyId: 1, regionScope: "entity" }));
      await expect(caller.bills.get({ id: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("create", () => {
    it("defaults companyId to the caller's entity, generates a BILL number and starts as a manual draft", async () => {
      const caller = appRouter.createCaller(ctxFor({ companyId: 7 }));
      await caller.bills.create({ vendorId: 4, billDate: new Date("2026-09-01"), totalAmount: "100.00" });
      const row = vi.mocked(db.createBill).mock.calls[0][0];
      expect(row.companyId).toBe(7);
      expect(row.billNumber).toMatch(/^BILL-\d{4}-\d{4}$/);
      expect(row).toMatchObject({ vendorId: 4, status: "draft", sourceType: "manual", createdBy: 2 });
      expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "bill", entityId: 10 }));
    });

    it("keeps a caller-supplied bill number and lets ops create bills", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "ops" }));
      await caller.bills.create({ vendorId: 4, billNumber: "INV-555", billDate: "2026-09-01" as any, totalAmount: "10.00", status: "pending_approval" });
      expect(vi.mocked(db.createBill).mock.calls[0][0]).toMatchObject({ billNumber: "INV-555", status: "pending_approval" });
    });

    it("rejects an unknown vendor and roles that cannot create", async () => {
      vi.mocked(db.getVendorById).mockResolvedValueOnce(null as any);
      const finance = appRouter.createCaller(ctxFor());
      await expect(finance.bills.create({ vendorId: 99, billDate: new Date(), totalAmount: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });

      const sales = appRouter.createCaller(ctxFor({ role: "sales" }));
      await expect(sales.bills.create({ vendorId: 4, billDate: new Date(), totalAmount: "1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.createBill).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("never accepts amountPaid or companyId as client input", async () => {
      const caller = appRouter.createCaller(ctxFor());
      await caller.bills.update({ id: 10, notes: "checked", amountPaid: "999", companyId: 5 } as any);
      const [, data] = vi.mocked(db.updateBill).mock.calls[0];
      expect(data).not.toHaveProperty("amountPaid");
      expect(data).not.toHaveProperty("companyId");
      expect(data).toMatchObject({ notes: "checked" });
    });
  });

  describe("approve", () => {
    it("stamps approvedBy / approvedAt on an open bill", async () => {
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ status: "pending_approval" }) as any);
      const caller = appRouter.createCaller(ctxFor({ id: 8 }));
      await caller.bills.approve({ id: 10 });
      expect(db.updateBill).toHaveBeenCalledWith(10, expect.objectContaining({ status: "approved", approvedBy: 8, approvedAt: expect.any(Date) }));
    });

    it.each(["paid", "cancelled"])("is FORBIDDEN on a %s bill", async (status) => {
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ status }) as any);
      const caller = appRouter.createCaller(ctxFor());
      await expect(caller.bills.approve({ id: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.updateBill).not.toHaveBeenCalled();
    });
  });

  describe("markPaid", () => {
    it("creates a completed 'made' payment to the vendor for the outstanding balance and settles the bill", async () => {
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ purchaseOrderId: 33, amountPaid: "20.00" }) as any);
      const caller = appRouter.createCaller(ctxFor({ id: 8 }));
      const result = await caller.bills.markPaid({ id: 10, paymentMethod: "ach", referenceNumber: "CHK-9" });

      expect(db.createPayment).toHaveBeenCalledTimes(1);
      const payment = vi.mocked(db.createPayment).mock.calls[0][0];
      expect(payment).toMatchObject({
        type: "made",
        vendorId: 4,
        purchaseOrderId: 33,
        companyId: 1,
        amount: "80.00",
        paymentMethod: "ach",
        referenceNumber: "CHK-9",
        status: "completed",
        createdBy: 8,
      });
      expect(payment.paymentNumber).toMatch(/^PAY-/);
      expect(payment).not.toHaveProperty("invoiceId");
      expect(db.recordBillPayment).toHaveBeenCalledWith(10, { amount: 80, paymentId: 77 });
      expect(result?.status).toBe("paid");
    });

    it("accepts a partial amount but rejects more than is outstanding", async () => {
      const caller = appRouter.createCaller(ctxFor());
      await caller.bills.markPaid({ id: 10, amount: 30 });
      expect(db.recordBillPayment).toHaveBeenCalledWith(10, { amount: 30, paymentId: 77 });

      vi.mocked(db.createPayment).mockClear();
      await expect(caller.bills.markPaid({ id: 10, amount: 150 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.createPayment).not.toHaveBeenCalled();
    });

    it("refuses to pay a paid or cancelled bill and hides out-of-scope bills", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ status: "paid" }) as any);
      await expect(caller.bills.markPaid({ id: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });

      vi.mocked(db.getBillById).mockResolvedValue(billRow({ companyId: 2 }) as any);
      await expect(caller.bills.markPaid({ id: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.createPayment).not.toHaveBeenCalled();
    });

    it("is finance-only (ops can create but not pay)", async () => {
      const caller = appRouter.createCaller(ctxFor({ role: "ops" }));
      await expect(caller.bills.markPaid({ id: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("cancel", () => {
    it("sets cancelled and records the reason", async () => {
      vi.mocked(db.getBillById).mockResolvedValue(billRow({ notes: "orig" }) as any);
      const caller = appRouter.createCaller(ctxFor());
      await caller.bills.cancel({ id: 10, reason: "duplicate" });
      expect(db.updateBill).toHaveBeenCalledWith(10, { status: "cancelled", notes: "orig\nCancelled: duplicate" });
    });
  });

  describe("aging", () => {
    it("uses the single-entity summary for an entity user and buckets visible rows for global", async () => {
      await appRouter.createCaller(ctxFor({ companyId: 3 })).bills.aging();
      expect(db.getBillsAgingSummary).toHaveBeenCalledWith(3);

      vi.mocked(db.getBills).mockResolvedValueOnce([
        { status: "approved", totalAmount: "50", amountPaid: "0", dueDate: new Date(Date.now() + 86400000), billDate: null },
      ] as any);
      const summary = await appRouter.createCaller(ctxFor({ regionScope: "global" })).bills.aging();
      expect(summary).toMatchObject({ current: 50, totalOutstanding: 50 });
    });
  });

  describe("createFromText", () => {
    const parsed = {
      success: true,
      documentType: "vendor_invoice",
      vendorInvoice: {
        invoiceNumber: "ACME-77",
        vendorName: "Acme Mills",
        invoiceDate: "2026-09-10",
        dueDate: "2026-10-10",
        lineItems: [{ description: "Flour", quantity: 2, unitPrice: 25, totalPrice: 50 }],
        subtotal: 50,
        taxAmount: 5,
        totalAmount: 55,
        relatedPoNumber: "PO-9",
        confidence: 88,
      },
    };

    it("hands the text to the document parser as a data: URL and drafts an ai_draft bill for the matched vendor", async () => {
      vi.mocked(parseUploadedDocument).mockResolvedValue(parsed as any);
      vi.mocked(db.getVendorByName).mockResolvedValueOnce({ id: 4, name: "Acme Mills", companyId: 1 } as any);
      vi.mocked(db.findPurchaseOrderByNumber).mockResolvedValueOnce({ id: 33 } as any);

      const caller = appRouter.createCaller(ctxFor({ role: "ops" }));
      const result = await caller.bills.createFromText({ text: "Invoice ACME-77 from Acme Mills, total $55 due 2026-10-10" });

      const [url, filename] = vi.mocked(parseUploadedDocument).mock.calls[0];
      expect(url).toMatch(/^data:text\/plain;base64,/);
      expect(filename).toBe("bill-from-text.txt");
      expect(db.findBillByNumber).toHaveBeenCalledWith("ACME-77", 4);
      expect(vi.mocked(db.createBill).mock.calls[0][0]).toMatchObject({
        billNumber: "ACME-77",
        vendorId: 4,
        purchaseOrderId: 33,
        sourceType: "ai_draft",
        status: "draft",
        totalAmount: "55",
        taxAmount: "5",
        dueDate: new Date("2026-10-10"),
        lineItems: [{ description: "Flour", quantity: 2, unitPrice: 25, totalPrice: 50 }],
        createdBy: 2,
      });
      expect(result).toMatchObject({ createdVendor: false, confidence: 88 });
      expect(db.createVendor).not.toHaveBeenCalled();
    });

    it("refuses when the parser did not find a vendor invoice, and when the vendor is unknown", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.mocked(parseUploadedDocument).mockResolvedValue({ success: true, documentType: "unknown" } as any);
      await expect(caller.bills.createFromText({ text: "hello there, nothing here" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

      vi.mocked(parseUploadedDocument).mockResolvedValue(parsed as any);
      await expect(caller.bills.createFromText({ text: "Invoice ACME-77 from Acme Mills" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.createBill).not.toHaveBeenCalled();
    });

    it("creates the vendor only when asked to", async () => {
      vi.mocked(parseUploadedDocument).mockResolvedValue(parsed as any);
      const caller = appRouter.createCaller(ctxFor());
      const result = await caller.bills.createFromText({ text: "Invoice ACME-77 from Acme Mills", createMissingVendor: true });
      expect(db.createVendor).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme Mills", type: "supplier" }));
      expect(result.createdVendor).toBe(true);
    });
  });
});
