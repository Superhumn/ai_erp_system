/** Summary and per-page lookups that replaced full-table loads: role gates, scope and input limits. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor } from "../flows/_harness";

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn(),
  getUserEntityAccessCompanyIds: vi.fn(async () => []),
  getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
  getCompanyById: vi.fn(async () => undefined),
  getCompanyIdsInRegion: vi.fn(async () => []),
  getOrderSummary: vi.fn(async () => ({ count: 3, totalValue: 30, pending: 1 })),
  getHomeInvoiceSummary: vi.fn(async () => ({ revenueThisMonth: 0, outstandingAR: 0, unpaidInvoices: 0 })),
  getHomePurchaseOrderSummary: vi.fn(async () => ({ receivedThisMonth: 0, outstandingAP: 0, openPOCount: 0, openPOValue: 0 })),
  getInvoiceBillingByIds: vi.fn(async () => []),
  getLatestShipmentsForOrders: vi.fn(async () => []),
  getPurchaseOrdersPaged: vi.fn(async () => ({ rows: [], total: 0 })),
}));

import * as db from "../db";
import { appRouter } from "./index";

const scope = { mode: "entity", companyIds: [1] };
const finance = appRouter.createCaller(ctxFor("finance", { id: 2, companyId: 1, regionScope: "entity" }));
const sales = appRouter.createCaller(ctxFor("sales", { id: 1, companyId: 1, regionScope: "entity" }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 3, companyId: 1, regionScope: "entity" }));
const month = { monthStartMs: 0, monthEndMs: 10 };

beforeEach(() => vi.clearAllMocks());

describe("orders.summary", () => {
  it("counts under the caller's scope, optionally for one customer", async () => {
    expect(await sales.orders.summary({ customerId: 5 })).toEqual({ count: 3, totalValue: 30, pending: 1 });
    expect(db.getOrderSummary).toHaveBeenCalledWith(scope, { customerId: 5 });
  });
});

describe("invoices.billingByIds", () => {
  it("is finance-only and scoped", async () => {
    await finance.invoices.billingByIds({ invoiceIds: [1, 2] });
    expect(db.getInvoiceBillingByIds).toHaveBeenCalledWith(scope, [1, 2]);
    await expect(sales.invoices.billingByIds({ invoiceIds: [1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("caps the id list", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => i);
    await expect(finance.invoices.billingByIds({ invoiceIds: ids })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("shipments.latestForOrders", () => {
  it("is ops-gated and entity-scoped", async () => {
    await ops.shipments.latestForOrders({ orderIds: [4] });
    expect(db.getLatestShipmentsForOrders).toHaveBeenCalledWith(scope, [4]);
    await expect(sales.shipments.latestForOrders({ orderIds: [4] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("home summaries", () => {
  it("reject an empty or reversed month window", async () => {
    await expect(finance.invoices.homeSummary({ monthStartMs: 10, monthEndMs: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(ops.purchaseOrders.homeSummary({ monthStartMs: 10, monthEndMs: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("pass the scope and window through", async () => {
    await finance.invoices.homeSummary(month);
    expect(db.getHomeInvoiceSummary).toHaveBeenCalledWith(scope, 0, 10);
    await ops.purchaseOrders.homeSummary(month);
    expect(db.getHomePurchaseOrderSummary).toHaveBeenCalledWith(scope, 0, 10);
  });
});

describe("purchaseOrders.listPaged statusIn", () => {
  it("passes the receiving queue statuses through", async () => {
    await ops.purchaseOrders.listPaged({ statusIn: ["sent", "confirmed", "partial"], limit: 50 });
    expect(db.getPurchaseOrdersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ statusIn: ["sent", "confirmed", "partial"] }), scope,
    );
  });

  it("rejects unknown statuses", async () => {
    await expect(ops.purchaseOrders.listPaged({ statusIn: ["bogus" as any] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
