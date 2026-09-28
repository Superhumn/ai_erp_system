import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Ownership / entity-scope regressions:
//  - orders.update/delete/bulkDelete must not touch rows outside the caller's scope
//  - orders/payments/transactions.create default companyId to the caller's home entity
//  - vendorPortal: a vendor-role user with no linkedVendorId must see/change nothing
//  - timeTracking: non-admins may only read/modify their own entries and invoices
//  - users.updateProfile: email changes are unique, unverified, and mirrored to local auth
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  // scope resolution: user 2 → entity 2 only; user 9 → global
  getUserEntityAccessCompanyIds: vi.fn(async (userId: number) => (userId === 2 ? [2] : [])),
  getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
  getCompanyById: vi.fn().mockResolvedValue(undefined),
  getCompanyIdsInRegion: vi.fn().mockResolvedValue([]),
  // orders
  getOrderById: vi.fn(),
  updateOrder: vi.fn().mockResolvedValue(undefined),
  deleteOrder: vi.fn().mockResolvedValue(undefined),
  deleteOrderItems: vi.fn().mockResolvedValue(undefined),
  createOrder: vi.fn().mockResolvedValue({ id: 30 }),
  createOrderItem: vi.fn().mockResolvedValue(undefined),
  // payments / transactions
  createPayment: vi.fn().mockResolvedValue({ id: 40 }),
  createTransaction: vi.fn().mockResolvedValue({ id: 41 }),
  // vendorPortal
  getPurchaseOrders: vi.fn().mockResolvedValue([{ id: 1, vendorId: 7 }, { id: 2, vendorId: 8 }]),
  getPurchaseOrderById: vi.fn(async (id: number) => ({ 1: { id: 1, vendorId: 7 }, 2: { id: 2, vendorId: 8 } } as any)[id]),
  getShipments: vi.fn().mockResolvedValue([{ id: 100, purchaseOrderId: 1 }, { id: 200, purchaseOrderId: 2 }]),
  getShipmentById: vi.fn(async (id: number) => ({ 100: { id: 100, purchaseOrderId: 1 }, 200: { id: 200, purchaseOrderId: 2 } } as any)[id]),
  getCustomsClearances: vi.fn().mockResolvedValue([{ id: 1000, shipmentId: 100 }, { id: 2000, shipmentId: 200 }]),
  getCustomsClearanceById: vi.fn(async (id: number) => ({ 1000: { id: 1000, shipmentId: 100 }, 2000: { id: 2000, shipmentId: 200 } } as any)[id]),
  getCustomsDocuments: vi.fn().mockResolvedValue([]),
  updatePurchaseOrder: vi.fn().mockResolvedValue(undefined),
  createDocument: vi.fn().mockResolvedValue({ id: 77 }),
  // timeTracking
  getTimeEntries: vi.fn().mockResolvedValue([]),
  getTimeEntryById: vi.fn(),
  updateTimeEntry: vi.fn().mockResolvedValue(undefined),
  deleteTimeEntry: vi.fn().mockResolvedValue(undefined),
  getTimeInvoices: vi.fn().mockResolvedValue([]),
  getTimeInvoiceById: vi.fn(),
  // users
  getUserByEmail: vi.fn(),
  getLocalAuthCredentialByEmail: vi.fn(),
  getLocalAuthCredentialByOpenId: vi.fn(),
  updateLocalAuthCredential: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn().mockResolvedValue(undefined),
  setUserEmailUnverified: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://files.example/x", key: "x" }),
}));

import * as db from "./db";
import { ordersRouter } from "./routers/orders";
import { paymentsRouter } from "./routers/payments";
import { transactionsRouter } from "./routers/transactions";
import { vendorPortalRouter } from "./routers/vendorPortal";
import { timeTrackingRouter } from "./routers/timeTracking";
import { usersRouter } from "./routers/users";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(user: Partial<AuthenticatedUser> = {}): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "user",
      companyId: 2,
      regionScope: "entity",
      linkedVendorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("orders mutations respect entity scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("update: NOT_FOUND when the order is outside the caller's scope", async () => {
    (db.getOrderById as any).mockResolvedValue(undefined);
    const caller = ordersRouter.createCaller(ctxFor({ id: 2 }));
    await expect(caller.update({ id: 5, status: "confirmed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.updateOrder).not.toHaveBeenCalled();
    // The scoped read was asked for — not a bare by-id lookup.
    expect((db.getOrderById as any).mock.calls[0][1]).toMatchObject({ companyIds: [2] });
  });

  it("delete: NOT_FOUND when the order is outside the caller's scope", async () => {
    (db.getOrderById as any).mockResolvedValue(undefined);
    const caller = ordersRouter.createCaller(ctxFor({ id: 2 }));
    await expect(caller.delete({ id: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.deleteOrder).not.toHaveBeenCalled();
  });

  it("bulkDelete: skips ids the caller cannot see", async () => {
    (db.getOrderById as any).mockImplementation(async (id: number) => (id === 1 ? { id: 1, companyId: 2 } : undefined));
    const caller = ordersRouter.createCaller(ctxFor({ id: 2 }));
    const result = await caller.bulkDelete({ ids: [1, 2, 3] });
    expect(result.deleted).toBe(1);
    expect(db.deleteOrder).toHaveBeenCalledTimes(1);
    expect(db.deleteOrder).toHaveBeenCalledWith(1);
  });

  it("create: defaults companyId to the caller's home entity", async () => {
    const caller = ordersRouter.createCaller(ctxFor({ id: 2, companyId: 2 }));
    await caller.create({ orderDate: new Date(), subtotal: "1", totalAmount: "1" });
    expect(db.createOrder).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2 }));
  });
});

describe("payments / transactions create default and guard companyId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("payments.create defaults companyId to the caller's home entity", async () => {
    const caller = paymentsRouter.createCaller(ctxFor({ role: "finance", companyId: 2 }));
    await caller.create({ type: "received", amount: "10", paymentDate: new Date() });
    expect(db.createPayment).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2 }));
  });

  it("payments.create rejects an entity outside the caller's scope", async () => {
    const caller = paymentsRouter.createCaller(ctxFor({ role: "finance", id: 2 }));
    await expect(caller.create({ companyId: 3, type: "received", amount: "10", paymentDate: new Date() }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createPayment).not.toHaveBeenCalled();
  });

  it("transactions.create defaults companyId and rejects out-of-scope entities", async () => {
    const caller = transactionsRouter.createCaller(ctxFor({ role: "finance", id: 2, companyId: 2 }));
    await caller.create({ type: "journal", date: new Date(), totalAmount: "5" });
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2 }));

    await expect(caller.create({ companyId: 3, type: "journal", date: new Date(), totalAmount: "5" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("vendorPortal: vendor-role users are fenced to their linked vendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an unlinked vendor sees no POs, shipments or clearances", async () => {
    const caller = vendorPortalRouter.createCaller(ctxFor({ role: "vendor", linkedVendorId: null }));
    expect(await caller.getPurchaseOrders()).toEqual([]);
    expect(await caller.getShipments()).toEqual([]);
    expect(await caller.getCustomsClearances()).toEqual([]);
  });

  it("an unlinked vendor cannot update a PO or upload documents", async () => {
    const caller = vendorPortalRouter.createCaller(ctxFor({ role: "vendor", linkedVendorId: null }));
    await expect(caller.updatePOStatus({ poId: 1, status: "confirmed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.uploadCustomsDocument({ clearanceId: 1000, documentType: "invoice", name: "a.pdf", fileData: "AA==", mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updatePurchaseOrder).not.toHaveBeenCalled();
    expect(db.createDocument).not.toHaveBeenCalled();
  });

  it("a linked vendor only sees its own rows", async () => {
    const caller = vendorPortalRouter.createCaller(ctxFor({ role: "vendor", linkedVendorId: 7 }));
    expect((await caller.getPurchaseOrders()).map(p => p.id)).toEqual([1]);
    expect((await caller.getShipments()).map(s => s.id)).toEqual([100]);
    expect((await caller.getCustomsClearances()).map(c => c.id)).toEqual([1000]);
  });

  it("uploadDocument verifies shipment ownership through the PO", async () => {
    const caller = vendorPortalRouter.createCaller(ctxFor({ role: "vendor", linkedVendorId: 7 }));
    const base = { documentType: "invoice" as const, name: "a.pdf", fileData: "AA==", mimeType: "application/pdf" };
    await expect(caller.uploadDocument({ relatedEntityType: "shipment", relatedEntityId: 200, ...base }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.uploadDocument({ relatedEntityType: "shipment", relatedEntityId: 100, ...base })).resolves.toMatchObject({ id: 77 });
  });

  it("uploadCustomsDocument verifies clearance ownership through shipment and PO", async () => {
    const caller = vendorPortalRouter.createCaller(ctxFor({ role: "vendor", linkedVendorId: 7 }));
    const base = { documentType: "commercial_invoice", name: "a.pdf", fileData: "AA==", mimeType: "application/pdf" };
    await expect(caller.uploadCustomsDocument({ clearanceId: 2000, ...base })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.uploadCustomsDocument({ clearanceId: 1000, ...base })).resolves.toMatchObject({ id: 77 });
    expect(db.createDocument).toHaveBeenCalledWith(expect.objectContaining({ referenceType: "customs_clearance", referenceId: 1000 }));
  });
});

describe("timeTracking: rows are owner-or-admin only", () => {
  beforeEach(() => vi.clearAllMocks());

  it("entries.list ignores a client-supplied userId for non-admins", async () => {
    const caller = timeTrackingRouter.createCaller(ctxFor({ id: 2, role: "user" }));
    await caller.entries.list({ userId: 99 });
    expect(db.getTimeEntries).toHaveBeenCalledWith(expect.objectContaining({ userId: 2 }));
  });

  it("entries.list honours userId for admins", async () => {
    const caller = timeTrackingRouter.createCaller(ctxFor({ id: 2, role: "admin" }));
    await caller.entries.list({ userId: 99 });
    expect(db.getTimeEntries).toHaveBeenCalledWith(expect.objectContaining({ userId: 99 }));
  });

  it("entries.update/delete/submit reject another user's entry", async () => {
    (db.getTimeEntryById as any).mockResolvedValue({ id: 5, userId: 99 });
    const caller = timeTrackingRouter.createCaller(ctxFor({ id: 2, role: "user" }));
    await expect(caller.entries.update({ id: 5, hours: "2" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.entries.delete({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.entries.submit({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateTimeEntry).not.toHaveBeenCalled();
    expect(db.deleteTimeEntry).not.toHaveBeenCalled();
  });

  it("entries.update allows the owner", async () => {
    (db.getTimeEntryById as any).mockResolvedValue({ id: 5, userId: 2 });
    const caller = timeTrackingRouter.createCaller(ctxFor({ id: 2, role: "user" }));
    await expect(caller.entries.update({ id: 5, hours: "2" })).resolves.toEqual({ success: true });
    expect(db.updateTimeEntry).toHaveBeenCalledTimes(1);
  });

  it("invoices.get and submitInvoice reject another user's invoice", async () => {
    (db.getTimeInvoiceById as any).mockResolvedValue({ id: 8, userId: 99, periodStart: new Date(), periodEnd: new Date() });
    const caller = timeTrackingRouter.createCaller(ctxFor({ id: 2, role: "user" }));
    await expect(caller.invoices.get({ id: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.submitInvoice({ invoiceId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("users.updateProfile email changes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an email already used by another user", async () => {
    (db.getUserByEmail as any).mockResolvedValue({ id: 50, email: "taken@example.com" });
    const caller = usersRouter.createCaller(ctxFor({ id: 2 }));
    await expect(caller.updateProfile({ email: "taken@example.com" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateUser).not.toHaveBeenCalled();
    expect(db.setUserEmailUnverified).not.toHaveBeenCalled();
  });

  it("rejects an email already used by another local-auth credential", async () => {
    (db.getUserByEmail as any).mockResolvedValue(undefined);
    (db.getLocalAuthCredentialByEmail as any).mockResolvedValue({ openId: "someone-else", email: "taken@example.com" });
    const caller = usersRouter.createCaller(ctxFor({ id: 2, openId: "u" }));
    await expect(caller.updateProfile({ email: "taken@example.com" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.setUserEmailUnverified).not.toHaveBeenCalled();
  });

  it("marks the new email unverified and mirrors it to the local-auth credential", async () => {
    (db.getUserByEmail as any).mockResolvedValue(undefined);
    (db.getLocalAuthCredentialByEmail as any).mockResolvedValue(undefined);
    (db.getLocalAuthCredentialByOpenId as any).mockResolvedValue({ openId: "u", email: "u@example.com" });
    const caller = usersRouter.createCaller(ctxFor({ id: 2, openId: "u", email: "u@example.com" }));
    await caller.updateProfile({ name: "New", email: "new@example.com" });

    expect(db.updateUser).toHaveBeenCalledWith(2, { name: "New" });
    expect(db.setUserEmailUnverified).toHaveBeenCalledWith(2, "new@example.com");
    expect(db.updateLocalAuthCredential).toHaveBeenCalledWith("u", { email: "new@example.com" });
  });

  it("leaves verification untouched when the email is unchanged", async () => {
    const caller = usersRouter.createCaller(ctxFor({ id: 2, email: "u@example.com" }));
    await caller.updateProfile({ email: "u@example.com", phone: "123" });
    expect(db.updateUser).toHaveBeenCalledWith(2, { phone: "123" });
    expect(db.setUserEmailUnverified).not.toHaveBeenCalled();
    expect(db.getUserByEmail).not.toHaveBeenCalled();
  });
});
