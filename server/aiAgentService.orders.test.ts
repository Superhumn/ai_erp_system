import { describe, it, expect, vi, beforeEach } from "vitest";
import { vendors, products, customers, orderItems } from "../drizzle/schema";

vi.mock("./db", () => {
  const names = [
    "getDb", "createWorkOrder", "createFreightRfq", "createAuditLog",
    "createCustomer", "updateCustomer", "getCustomerById",
    "getOrderById", "getOrderItems", "createOrder", "createOrderItem", "updateOrder", "fulfillOrder",
    "getInvoiceById", "updateInvoice",
  ];
  const m: Record<string, any> = {};
  for (const n of names) m[n] = vi.fn();
  return m;
});
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), invokeLLMStream: vi.fn() }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(), formatEmailHtml: vi.fn() }));
vi.mock("./routers/middleware", () => ({ getValidGoogleToken: vi.fn() }));
vi.mock("./invoicePosting", () => ({ postInvoiceJournalEntry: vi.fn() }));
vi.mock("./routers/_shared", () => ({ generateNumber: (prefix: string) => `${prefix}-TEST` }));

import * as db from "./db";
import { executeTool, type AIAgentContext } from "./aiAgentService";

type Call = { op: "select" | "update" | "insert"; table: any; where?: any; set?: any; values?: any };
function createFakeDb(rowsFor: (table: any) => any[] = () => []) {
  const calls: Call[] = [];
  let nextId = 100;
  const api: any = {
    calls,
    select() {
      const call: Call = { op: "select", table: undefined };
      const chain: any = {};
      for (const m of ["limit", "orderBy", "groupBy", "offset", "innerJoin", "leftJoin", "for"]) chain[m] = () => chain;
      chain.from = (t: any) => { call.table = t; calls.push(call); return chain; };
      chain.where = (w: any) => { call.where = w; return chain; };
      chain.then = (res: any, rej: any) => Promise.resolve(rowsFor(call.table)).then(res, rej);
      return chain;
    },
    update(table: any) {
      const call: Call = { op: "update", table };
      calls.push(call);
      return { set: (set: any) => { call.set = set; return { where: (w: any) => { call.where = w; return Promise.resolve(); } }; } };
    },
    insert(table: any) {
      return {
        values: (values: any) => {
          const id = nextId++;
          calls.push({ op: "insert", table, values });
          return { $returningId: async () => [{ id }], then: (res: any, rej: any) => Promise.resolve([{ insertId: id }]).then(res, rej) };
        },
      };
    },
    transaction: (fn: any) => fn(api),
  };
  return api;
}

const ops: AIAgentContext = { userId: 1, userName: "Olive", userRole: "ops", companyId: 7 };
const admin: AIAgentContext = { userId: 2, userName: "Ada", userRole: "admin", companyId: 7 };
const sales: AIAgentContext = { userId: 3, userName: "Sam", userRole: "sales", companyId: 7 };
const scope = { mode: "entity", companyIds: [7] };

const widget = { id: 11, companyId: 7, name: "Widget", sku: "W-1", unitPrice: "12.50" };
const acme = { id: 3, companyId: 7, name: "Acme", status: "active", paymentTerms: 30, address: "1 Main St" };
const order5 = { id: 5, companyId: 7, orderNumber: "ORD-5", status: "confirmed", invoiceId: 9, notes: null };

describe("manage_order", () => {
  let fake: any;
  beforeEach(() => {
    vi.resetAllMocks();
    fake = createFakeDb((table) => (table === products ? [widget] : table === customers ? [acme] : []));
    vi.mocked(db.getDb).mockResolvedValue(fake);
    vi.mocked(db.createOrder).mockResolvedValue({ id: 500 });
    vi.mocked(db.createOrderItem).mockResolvedValue({ id: 1 });
    vi.mocked(db.getCustomerById).mockResolvedValue(acme as any);
    vi.mocked(db.getOrderById).mockResolvedValue(order5 as any);
  });

  it("create: resolves products, defaults unit price, stamps companyId and numbers like the UI", async () => {
    const result = await executeTool("manage_order", {
      action: "create",
      data: { customerId: 3, items: [{ productId: 11, quantity: 2 }, { productName: "Widget", quantity: 1, unitPrice: 10 }], taxAmount: 1 },
    }, ops);

    expect(db.getCustomerById).toHaveBeenCalledWith(3, scope);
    expect(db.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, orderNumber: "ORD-TEST", customerId: 3, status: "pending", subtotal: "35.00", taxAmount: "1.00", totalAmount: "36.00", createdBy: 1,
    }));
    expect(db.createOrderItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ orderId: 500, productId: 11, name: "Widget", quantity: "2", unitPrice: "12.50", totalAmount: "25.00" }));
    expect(db.createOrderItem).toHaveBeenNthCalledWith(2, expect.objectContaining({ orderId: 500, productId: 11, unitPrice: "10.00", totalAmount: "10.00" }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "order", entityId: 500 }));
    expect(result).toMatchObject({ created: true, orderId: 500, orderNumber: "ORD-TEST", totalAmount: "36.00" });
  });

  it("create: refuses a non-mutation role before touching the db", async () => {
    await expect(executeTool("manage_order", { action: "create", data: { customerId: 3, items: [{ productId: 11, quantity: 1 }] } }, sales))
      .rejects.toThrow(/Not authorized/);
    expect(db.createOrder).not.toHaveBeenCalled();
  });

  it("create: a customer outside the entity reads as not found", async () => {
    vi.mocked(db.getCustomerById).mockResolvedValue(undefined);
    await expect(executeTool("manage_order", { action: "create", data: { customerId: 99, items: [{ productId: 11, quantity: 1 }] } }, ops))
      .rejects.toThrow("Customer not found");
  });

  it("update: applies the patch and cascades a delivered order to its draft invoice", async () => {
    vi.mocked(db.getInvoiceById).mockResolvedValue({ id: 9, status: "draft" } as any);
    const result = await executeTool("manage_order", { action: "update", orderId: 5, data: { status: "delivered", notes: "left at dock" } }, ops);
    expect(db.getOrderById).toHaveBeenCalledWith(5, scope);
    expect(db.updateOrder).toHaveBeenCalledWith(5, { status: "delivered", notes: "left at dock" });
    expect(db.updateInvoice).toHaveBeenCalledWith(9, { status: "sent" });
    expect(result).toMatchObject({ updated: true, invoiceMarkedSent: true });
  });

  it("update: refuses status=shipped (fulfill owns that) and unknown statuses", async () => {
    await expect(executeTool("manage_order", { action: "update", orderId: 5, data: { status: "shipped" } }, ops)).rejects.toThrow(/fulfill/);
    await expect(executeTool("manage_order", { action: "update", orderId: 5, data: { status: "bogus" } }, ops)).rejects.toThrow(/Invalid order status/);
    expect(db.updateOrder).not.toHaveBeenCalled();
  });

  it("cancel: sets cancelled and appends the reason", async () => {
    const result = await executeTool("manage_order", { action: "cancel", orderId: 5, data: { reason: "customer request" } }, ops);
    expect(db.updateOrder).toHaveBeenCalledWith(5, { status: "cancelled", notes: "Cancelled: customer request" });
    expect(result).toMatchObject({ cancelled: true, orderNumber: "ORD-5" });
  });

  it("fulfill: delegates to the shared fulfillOrder helper", async () => {
    vi.mocked(db.fulfillOrder).mockResolvedValue({
      orderId: 5, orderNumber: "ORD-5", status: "shipped", shipmentId: 8, shipmentNumber: "SHP-1", allocations: [{ inventoryId: 1, warehouseId: 1, productId: 11, quantity: 2 }], invoiceMarkedSent: true, performedBy: 1,
    } as any);
    const result = await executeTool("manage_order", { action: "fulfill", orderId: 5 }, ops);
    expect(db.fulfillOrder).toHaveBeenCalledWith(5, { performedBy: 1 });
    expect(result).toMatchObject({ fulfilled: true, shipmentNumber: "SHP-1", status: "shipped" });
    expect(result.message).toMatch(/SHP-1/);
  });

  it("fulfill: an order outside the entity is not found and nothing runs", async () => {
    vi.mocked(db.getOrderById).mockResolvedValue(undefined);
    await expect(executeTool("manage_order", { action: "fulfill", orderId: 5 }, ops)).rejects.toThrow("Order not found");
    expect(db.fulfillOrder).not.toHaveBeenCalled();
  });

  it("archive: admin only; cancels rather than deleting", async () => {
    await expect(executeTool("manage_order", { action: "archive", orderId: 5 }, ops)).rejects.toThrow(/requires an admin role/);
    await expect(executeTool("manage_order", { action: "delete", orderId: 5 }, ops)).rejects.toThrow(/requires an admin role/);
    expect(db.updateOrder).not.toHaveBeenCalled();

    const result = await executeTool("manage_order", { action: "archive", orderId: 5 }, admin);
    expect(db.updateOrder).toHaveBeenCalledWith(5, { status: "cancelled" });
    expect(result.archived).toBe(true);
    expect(result.message).toMatch(/Archived order ORD-5/);
    expect(result.message).toMatch(/nothing was permanently deleted/);
    expect(fake.calls.some((c: Call) => c.op === "select" && c.table === orderItems)).toBe(true);
  });
});

describe("manage_customer writes", () => {
  let fake: any;
  beforeEach(() => {
    vi.resetAllMocks();
    fake = createFakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake);
    vi.mocked(db.createCustomer).mockResolvedValue({ id: 42 });
    vi.mocked(db.getCustomerById).mockResolvedValue(acme as any);
  });

  it("create stamps companyId and only writes known fields", async () => {
    const result = await executeTool("manage_customer", { action: "create", data: { name: "Beta", email: "b@x.io", creditLimit: 500, bogus: "no" } }, ops);
    expect(db.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: "Beta", email: "b@x.io", creditLimit: "500", companyId: 7, status: "active", type: "business" }));
    expect(vi.mocked(db.createCustomer).mock.calls[0][0]).not.toHaveProperty("bogus");
    expect(result).toMatchObject({ created: true, customerId: 42 });
  });

  it("create refuses a non-mutation role", async () => {
    await expect(executeTool("manage_customer", { action: "create", data: { name: "Beta" } }, sales)).rejects.toThrow(/Not authorized/);
    expect(db.createCustomer).not.toHaveBeenCalled();
  });

  it("update checks scope then patches", async () => {
    await executeTool("manage_customer", { action: "update", customerId: 3, data: { phone: "555", status: "prospect" } }, ops);
    expect(db.getCustomerById).toHaveBeenCalledWith(3, scope);
    expect(db.updateCustomer).toHaveBeenCalledWith(3, { phone: "555", status: "prospect" });
  });

  it("archive is admin-only and sets inactive instead of deleting", async () => {
    await expect(executeTool("manage_customer", { action: "archive", customerId: 3 }, ops)).rejects.toThrow(/requires an admin role/);
    const result = await executeTool("manage_customer", { action: "delete", customerId: 3 }, admin);
    expect(db.updateCustomer).toHaveBeenCalledWith(3, { status: "inactive" });
    expect(result.message).toMatch(/Archived customer "Acme"/);
  });
});

describe("manage_vendor archive", () => {
  it("admin archives by status=inactive; ops is refused", async () => {
    vi.resetAllMocks();
    const fake = createFakeDb((table) => (table === vendors ? [{ id: 4, companyId: 7, name: "Pacific", status: "active" }] : []));
    vi.mocked(db.getDb).mockResolvedValue(fake);

    await expect(executeTool("manage_vendor", { action: "archive", vendorId: 4 }, ops)).rejects.toThrow(/requires an admin role/);
    const result = await executeTool("manage_vendor", { action: "archive", vendorId: 4 }, admin);
    const upd = fake.calls.find((c: Call) => c.op === "update" && c.table === vendors);
    expect(upd?.set).toEqual({ status: "inactive" });
    expect(result.message).toMatch(/Archived vendor "Pacific"/);
  });
});
