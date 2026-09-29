import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Regression coverage for four data-correctness bugs in the routers:
//  - purchaseOrders.sendToSupplier emailed a portal token it never persisted
//  - rdTaxCredit.updateExpense treated a stored 0% as "missing" (recomputed at 100% / 65%)
//  - workOrders.startProduction deducted the full requirement from every warehouse
//  - shopify.stores.create dropped apiKey / apiSecret / isActive (wrong column names)
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  // purchaseOrders.sendToSupplier
  getPurchaseOrderWithItems: vi.fn(),
  getVendorById: vi.fn(),
  createSupplierPortalSession: vi.fn(async (data: any) => ({ id: 1, ...data })),
  updatePurchaseOrder: vi.fn().mockResolvedValue(undefined),
  // rdTaxCredit.updateExpense
  getRdExpenseById: vi.fn(),
  updateRdExpense: vi.fn().mockResolvedValue(undefined),
  // workOrders.startProduction
  getWorkOrderById: vi.fn(),
  updateWorkOrder: vi.fn().mockResolvedValue(undefined),
  createWorkOrderMaterial: vi.fn().mockResolvedValue({ id: 2 }),
  getWorkOrderMaterials: vi.fn(),
  getRawMaterialInventory: vi.fn(),
  upsertRawMaterialInventory: vi.fn().mockResolvedValue(undefined),
  updateWorkOrderMaterial: vi.fn().mockResolvedValue(undefined),
  // shopify.stores.create
  createShopifyStore: vi.fn().mockResolvedValue({ id: 5 }),
}));

vi.mock("./_core/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  isEmailConfigured: vi.fn().mockReturnValue(false),
  formatEmailHtml: vi.fn((s: string) => s),
}));

import * as db from "./db";
import { purchaseOrdersRouter } from "./routers/purchaseOrders";
import { rdTaxCreditRouter } from "./routers/rdTaxCredit";
import { workOrdersRouter } from "./routers/workOrders";
import { shopifyRouter } from "./routers/shopify";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(user: Partial<AuthenticatedUser> = {}): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "admin",
      companyId: 1,
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

describe("purchaseOrders.sendToSupplier persists the portal session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the emailed token in supplierPortalSessions so getSession can resolve it", async () => {
    (db.getPurchaseOrderWithItems as any).mockResolvedValue({ id: 11, vendorId: 7, poNumber: "PO-1", status: "draft", items: [] });
    (db.getVendorById as any).mockResolvedValue({ id: 7, name: "Acme", email: "acme@example.com" });

    const caller = purchaseOrdersRouter.createCaller(ctxFor({ role: "ops" }));
    const result = await caller.sendToSupplier({ poId: 11 });

    expect(db.createSupplierPortalSession).toHaveBeenCalledTimes(1);
    const session = (db.createSupplierPortalSession as any).mock.calls[0][0];
    expect(session).toMatchObject({ token: result.portalToken, purchaseOrderId: 11, vendorId: 7, vendorEmail: "acme@example.com" });
    expect(session.token).toHaveLength(32);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("allows a re-send of a PO that is already 'sent', but refuses confirmed / received / cancelled ones without opening a session", async () => {
    (db.getVendorById as any).mockResolvedValue({ id: 7, name: "Acme", email: "acme@example.com" });
    const caller = purchaseOrdersRouter.createCaller(ctxFor({ role: "ops" }));

    (db.getPurchaseOrderWithItems as any).mockResolvedValue({ id: 12, vendorId: 7, poNumber: "PO-2", status: "sent", items: [] });
    await expect(caller.sendToSupplier({ poId: 12 })).resolves.toMatchObject({ success: true });
    expect(db.createSupplierPortalSession).toHaveBeenCalledTimes(1);

    for (const status of ["confirmed", "partial", "received", "cancelled"]) {
      vi.clearAllMocks();
      (db.getPurchaseOrderWithItems as any).mockResolvedValue({ id: 13, vendorId: 7, poNumber: "PO-3", status, items: [] });
      await expect(caller.sendToSupplier({ poId: 13 })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED", message: `Purchase order PO-3 is ${status} and cannot be sent to the supplier.`,
      });
      expect(db.createSupplierPortalSession).not.toHaveBeenCalled();
      expect(db.updatePurchaseOrder).not.toHaveBeenCalled();
    }
  });
});

describe("rdTaxCredit.updateExpense keeps a stored 0% allocation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not recompute at 100% when rdPercentage is stored as 0", async () => {
    (db.getRdExpenseById as any).mockResolvedValue({
      id: 3, category: "wages", grossAmount: "1000.00", rdPercentage: "0.00", contractResearchRate: null,
    });
    const caller = rdTaxCreditRouter.createCaller(ctxFor({ role: "finance" }));
    await caller.updateExpense({ id: 3, description: "renamed" });

    expect(db.updateRdExpense).toHaveBeenCalledWith(3, expect.objectContaining({ qualifiedAmount: "0.00" }));
  });

  it("does not recompute at 65% when contractResearchRate is stored as 0", async () => {
    (db.getRdExpenseById as any).mockResolvedValue({
      id: 4, category: "contract_research", grossAmount: "1000.00", rdPercentage: "100.00", contractResearchRate: "0.00",
    });
    const caller = rdTaxCreditRouter.createCaller(ctxFor({ role: "finance" }));
    await caller.updateExpense({ id: 4, description: "renamed" });

    expect(db.updateRdExpense).toHaveBeenCalledWith(4, expect.objectContaining({ qualifiedAmount: "0.00" }));
  });

  it("still falls back to the defaults when the stored values are null", async () => {
    (db.getRdExpenseById as any).mockResolvedValue({
      id: 5, category: "contract_research", grossAmount: "1000.00", rdPercentage: null, contractResearchRate: null,
    });
    const caller = rdTaxCreditRouter.createCaller(ctxFor({ role: "finance" }));
    await caller.updateExpense({ id: 5, description: "renamed" });

    expect(db.updateRdExpense).toHaveBeenCalledWith(5, expect.objectContaining({ qualifiedAmount: "650.00" }));
  });
});

describe("workOrders.startProduction reserves only the outstanding balance per warehouse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decrements the remaining requirement across warehouses and stops once covered", async () => {
    (db.getWorkOrderById as any).mockResolvedValue({ id: 99, warehouseId: 1, status: "scheduled" });
    (db.getWorkOrderMaterials as any).mockResolvedValue([
      { id: 1, rawMaterialId: 50, name: "Flour", unit: "kg", requiredQuantity: "10", consumedQuantity: "0" },
    ]);
    (db.getRawMaterialInventory as any).mockResolvedValue([
      { rawMaterialId: 50, warehouseId: 1, quantity: "6", availableQuantity: "6" },
      { rawMaterialId: 50, warehouseId: 2, quantity: "6", availableQuantity: "6" },
      { rawMaterialId: 50, warehouseId: 3, quantity: "6", availableQuantity: "6" },
    ]);

    const caller = workOrdersRouter.createCaller(ctxFor());
    await caller.startProduction({ id: 99 });

    const calls = (db.upsertRawMaterialInventory as any).mock.calls;
    // Warehouse 1 covers 6 of 10, warehouse 2 covers the remaining 4, warehouse 3 is untouched.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([50, 1, { availableQuantity: "0.0000" }]);
    expect(calls[1]).toEqual([50, 2, { availableQuantity: "2.0000" }]);
    // The split is persisted: the line keeps warehouse 1's 6, a second line holds warehouse 2's 4.
    expect(db.updateWorkOrderMaterial).toHaveBeenCalledWith(1, { status: "reserved", warehouseId: 1, reservedQuantity: "6.0000", requiredQuantity: "6.0000" });
    expect(db.createWorkOrderMaterial).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 99, rawMaterialId: 50, name: "Flour", unit: "kg", warehouseId: 2, requiredQuantity: "4.0000", reservedQuantity: "4.0000", consumedQuantity: "0.0000", status: "reserved",
    }));
    expect(db.updateWorkOrder).toHaveBeenCalledWith(99, expect.objectContaining({ status: "in_progress" }));
  });

  it("refuses to start when stock cannot cover a material: PRECONDITION_FAILED naming the shortfall, nothing reserved, status untouched", async () => {
    (db.getWorkOrderById as any).mockResolvedValue({ id: 99, warehouseId: 1, status: "scheduled" });
    (db.getWorkOrderMaterials as any).mockResolvedValue([
      { id: 1, rawMaterialId: 50, name: "Flour", unit: "kg", requiredQuantity: "10", consumedQuantity: "0" },
      { id: 2, rawMaterialId: 51, name: "Sugar", unit: "kg", requiredQuantity: "3", consumedQuantity: "1" },
    ]);
    (db.getRawMaterialInventory as any).mockImplementation(async ({ rawMaterialId }: { rawMaterialId: number }) =>
      rawMaterialId === 50
        ? [{ rawMaterialId: 50, warehouseId: 1, quantity: "6", availableQuantity: "6" }]
        : [{ rawMaterialId: 51, warehouseId: 1, quantity: "5", availableQuantity: "5" }]);

    const caller = workOrdersRouter.createCaller(ctxFor());
    await expect(caller.startProduction({ id: 99 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Insufficient raw material stock to start production — Flour: short 4.0000 kg (required 10.0000, available 6.0000)",
    });
    // Previously the work order was flipped to in_progress and the failure only logged.
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
    expect(db.upsertRawMaterialInventory).not.toHaveBeenCalled();
    expect(db.updateWorkOrderMaterial).not.toHaveBeenCalled();
    expect(db.createWorkOrderMaterial).not.toHaveBeenCalled();
  });
});

describe("shopify.stores.create maps input names onto the real columns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes apiKey/apiSecret/isActive as clientId/clientSecret/isEnabled", async () => {
    const caller = shopifyRouter.createCaller(ctxFor());
    await caller.stores.create({
      storeName: "Main", storeDomain: "main.myshopify.com", apiKey: "key", apiSecret: "secret", accessToken: "tok", isActive: false,
    });

    expect(db.createShopifyStore).toHaveBeenCalledTimes(1);
    const row = (db.createShopifyStore as any).mock.calls[0][0];
    expect(row).toEqual({
      storeName: "Main", storeDomain: "main.myshopify.com", clientId: "key", clientSecret: "secret", accessToken: "tok", isEnabled: false,
    });
    expect(row).not.toHaveProperty("apiKey");
    expect(row).not.toHaveProperty("isActive");
  });
});
