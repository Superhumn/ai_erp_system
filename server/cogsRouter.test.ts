import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Regression coverage for appRouter.cogs. Before this test the router called
// five db helpers with mismatched signatures (positional args into an object
// param, warehouseId into a companyId slot, productId into a lotId slot), so
// every procedure either threw or silently filtered on the wrong column.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getCogsRecords: vi.fn().mockResolvedValue([
    { id: 7, productId: 3, orderId: 11, quantitySold: "2.0000", unitCogs: "5.0000", totalCogs: "10.00", periodDate: new Date("2026-01-02") },
  ]),
  getCogsProfitabilityByProduct: vi.fn().mockResolvedValue([]),
  getInventoryValuation: vi.fn().mockResolvedValue([]),
  getPurchaseOrderItems: vi.fn().mockResolvedValue([
    { productId: 3, quantity: "100.0000" },
    { productId: 4, quantity: "300.0000" },
    { productId: null, quantity: "50.0000" },
  ]),
}));

vi.mock("./inventoryCostingService", () => ({
  addCostLayer: vi.fn().mockResolvedValue({ id: 42 }),
  allocateOverheadToLayers: vi.fn().mockResolvedValue(1),
  recordCogs: vi.fn().mockResolvedValue({ cogsRecordId: 9, totalCogs: 10, unitCogs: 5, grossMargin: 4 }),
}));

import * as db from "./db";
import * as costing from "./inventoryCostingService";
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
      role: "ops",
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

describe("cogs router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("valuation forwards warehouseId as a warehouse filter, not a companyId", async () => {
    const caller = appRouter.createCaller(ctxFor());
    await caller.cogs.valuation({ warehouseId: 3 });
    expect(db.getInventoryValuation).toHaveBeenCalledWith({ warehouseId: 3 });
  });

  it("profitability passes the date range through and aggregates per product", async () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-31");
    const caller = appRouter.createCaller(ctxFor());
    await caller.cogs.profitability({ startDate: start, endDate: end });
    expect(db.getCogsProfitabilityByProduct).toHaveBeenCalledWith({ productId: undefined, startDate: start, endDate: end });
  });

  it("getTransactions maps cogsRecords onto the columns the Costing page reads", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const rows = await caller.cogs.getTransactions({ limit: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ salesOrderId: 11, quantity: "2.0000", unitCost: "5.0000", totalCost: "10.00" });
  });

  it("updateCostBasis records a cost layer for the received quantity", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.cogs.updateCostBasis({ productId: 3, warehouseId: 1, receivedQuantity: 10, unitCost: 2.5 });
    expect(costing.addCostLayer).toHaveBeenCalledWith(expect.objectContaining({ productId: 3, warehouseId: 1, quantity: 10, unitCost: 2.5 }));
    expect(result).toEqual({ success: true, layerId: 42 });
  });

  it("recordSale runs the costing service with per-unit revenue", async () => {
    const caller = appRouter.createCaller(ctxFor());
    await caller.cogs.recordSale({ salesOrderId: 11, salesOrderLineId: 1, productId: 3, warehouseId: 1, quantitySold: 4, revenueAmount: 40 });
    expect(costing.recordCogs).toHaveBeenCalledWith(expect.objectContaining({ productId: 3, orderId: 11, quantitySold: 4, unitRevenue: 10, calculatedBy: 2 }));
  });

  it("allocateFreight raises existing layer costs in proportion to PO quantity without adding stock", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.cogs.allocateFreight({ purchaseOrderId: 5, totalFreightCost: 300, totalCustomsDuties: 100 });
    // 400 landed cost over 400 units with a product → product 3 gets 100, product 4 gets 300.
    expect(costing.allocateOverheadToLayers).toHaveBeenCalledTimes(2);
    expect(costing.allocateOverheadToLayers).toHaveBeenCalledWith({ productId: 3, totalAmount: 100 });
    expect(costing.allocateOverheadToLayers).toHaveBeenCalledWith({ productId: 4, totalAmount: 300 });
    expect(costing.addCostLayer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, totalLandedCost: 400, productsAllocated: 2 });
  });

  it("rejects callers without operations access", async () => {
    const caller = appRouter.createCaller(ctxFor({ role: "vendor" }));
    await expect(caller.cogs.valuation({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
