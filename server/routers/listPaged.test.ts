/**
 * Paged list endpoints (orders, customers, invoices, transactions) and the cap on the
 * legacy `list` endpoints. The db layer is mocked; these tests pin what the routers
 * pass down: the caller's entity scope, clamped paging input, and the list cap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor } from "../flows/_harness";

vi.mock("../db", () => {
  const page = vi.fn(async () => ({ rows: [], total: 0 }));
  const list = vi.fn(async () => []);
  return {
    getDb: vi.fn().mockResolvedValue({}),
    createAuditLog: vi.fn(),
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
    getCompanyById: vi.fn(async () => undefined),
    getCompanyIdsInRegion: vi.fn(async () => []),
    getOrdersPaged: page,
    getCustomersPaged: page,
    getInvoicesPaged: page,
    getTransactionsPaged: page,
    getOrders: list,
    getCustomers: list,
    getInvoices: list,
    getTransactions: list,
    getPurchaseOrders: list,
  };
});

import * as db from "../db";
import { appRouter } from "./index";
import { LEGACY_LIST_CAP, MAX_PAGE_LIMIT } from "../listPaging";

const entity1 = { mode: "entity", companyIds: [1] };
const sales = appRouter.createCaller(ctxFor("sales", { id: 1, companyId: 1, regionScope: "entity" }));
const finance = appRouter.createCaller(ctxFor("finance", { id: 2, companyId: 1, regionScope: "entity" }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 3, companyId: 1, regionScope: "entity" }));
const vendor = appRouter.createCaller(ctxFor("vendor", { id: 4, companyId: 1, regionScope: "entity" }));

beforeEach(() => vi.clearAllMocks());

describe("listPaged endpoints", () => {
  it("pass the caller's scope and the page/filter input straight through", async () => {
    await sales.orders.listPaged({ limit: 50, offset: 100, search: "SO-1", status: "pending", customerId: 7 });
    expect(db.getOrdersPaged).toHaveBeenCalledWith(entity1, { limit: 50, offset: 100, search: "SO-1", status: "pending", customerId: 7 });

    await sales.customers.listPaged({ source: "shopify" });
    expect(db.getCustomersPaged).toHaveBeenCalledWith(entity1, { source: "shopify" });

    await finance.invoices.listPaged({ status: "overdue" });
    expect(db.getInvoicesPaged).toHaveBeenCalledWith(entity1, { status: "overdue" });

    await finance.transactions.listPaged({ cogsOnly: true, type: "expense" });
    expect(db.getTransactionsPaged).toHaveBeenCalledWith(entity1, { cogsOnly: true, type: "expense" });
  });

  it("reject a page larger than MAX_PAGE_LIMIT or a negative offset", async () => {
    await expect(sales.orders.listPaged({ limit: MAX_PAGE_LIMIT + 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(finance.invoices.listPaged({ offset: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.getOrdersPaged).not.toHaveBeenCalled();
    expect(db.getInvoicesPaged).not.toHaveBeenCalled();
  });

  it("keep the role gates of the list they page", async () => {
    await expect(vendor.orders.listPaged()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sales.invoices.listPaged()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sales.transactions.listPaged()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("legacy list endpoints", () => {
  it("return at most LEGACY_LIST_CAP rows", async () => {
    await sales.orders.list();
    expect(db.getOrders).toHaveBeenCalledWith(entity1, expect.objectContaining({ limit: LEGACY_LIST_CAP }));
    await sales.customers.list();
    expect(db.getCustomers).toHaveBeenCalledWith(entity1, { limit: LEGACY_LIST_CAP });
    await finance.invoices.list();
    expect(db.getInvoices).toHaveBeenCalledWith(entity1, expect.objectContaining({ limit: LEGACY_LIST_CAP }));
    await finance.transactions.list();
    expect(db.getTransactions).toHaveBeenCalledWith(entity1, expect.objectContaining({ limit: LEGACY_LIST_CAP }));
    await ops.purchaseOrders.list();
    expect(db.getPurchaseOrders).toHaveBeenCalledWith(expect.objectContaining({ limit: LEGACY_LIST_CAP }));
  });
});
