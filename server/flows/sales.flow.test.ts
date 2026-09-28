/**
 * Sales process flow: customer → order → lifecycle → invoice → payment →
 * recurring invoice, plus entity scoping and role gating.
 *
 * Drives the live tRPC routers (appRouter.createCaller) against a stateful
 * in-memory db built from server/flows/_harness. The mocked helpers follow the
 * real server/db.ts contracts: create* return `{ id }`, get*ById return the row
 * or undefined (scoped lookups return undefined outside scope), list helpers
 * filter on scope company ids and return [] for an empty scope.
 */
import { describe, expect, it, vi } from "vitest";
import { ctxFor } from "./_harness";

type Row = Record<string, any> & { id: number };

const store = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  const { scopeAllows, scopeCompanyIds } = await import("../_core/scope");
  const s = {
    customers: table<Row>(),
    orders: table<Row>(),
    orderItems: table<Row>(),
    invoices: table<Row>(),
    invoiceItems: table<Row>(),
    payments: table<Row>(),
    transactions: table<Row>(),
    transactionLines: table<Row>(),
    accounts: table<Row>([
      { code: "1000", name: "Cash", companyId: 1 },
      { code: "1200", name: "Accounts Receivable", companyId: 1 },
      { code: "4000", name: "Revenue", companyId: 1 },
    ]),
    recurringInvoices: table<Row>(),
    recurringInvoiceItems: table<Row>(),
    recurringInvoiceHistory: table<Row>(),
    auditLogs: table<Row>(),
    scopeAllows,
    scopeCompanyIds,
    /** Mirror the SQL `WHERE companyId IN (scope)` clause; no scope = unrestricted. */
    inScope(scope: any, rows: Row[]): Row[] {
      const ids = scope ? scopeCompanyIds(scope) : null;
      if (!ids) return rows;
      if (ids.length === 0) return [];
      return rows.filter((r) => ids.includes(r.companyId));
    },
    customerJoin(c?: Row) {
      return c ? { id: c.id, name: c.name, email: c.email ?? null } : null;
    },
  };
  return s;
});

vi.mock("../db", () => {
  const byNewest = (rows: Row[]) => rows.slice().sort((a, b) => b.id - a.id);
  return {
    getDb: vi.fn().mockResolvedValue({}),
    // ── audit ──
    createAuditLog: vi.fn(async (data: Row) => {
      store.auditLogs.insert(data);
    }),
    // ── scope resolution: everyone falls back to their single home entity ──
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),
    getCompanyById: vi.fn(async () => undefined),
    getCompanyIdsInRegion: vi.fn(async () => []),
    // ── customers ──
    getCustomers: vi.fn(async (scope?: any) => byNewest(store.inScope(scope, store.customers.all()))),
    getCustomerById: vi.fn(async (id: number, scope?: any) => {
      const c = store.customers.get(id);
      if (!c) return undefined;
      if (scope && !store.scopeAllows(scope, c.companyId)) return undefined;
      return c;
    }),
    createCustomer: vi.fn(async (data: Row) => {
      const row = store.customers.insert({ type: "business", status: "active", paymentTerms: 30, ...data });
      return { id: row.id };
    }),
    updateCustomer: vi.fn(async (id: number, data: Row) => {
      store.customers.update(id, data);
    }),
    // ── orders ──
    getOrders: vi.fn(async (scope?: any, filters?: { status?: string; customerId?: number }) => {
      let rows = store.inScope(scope, store.orders.all());
      if (filters?.status) rows = rows.filter((o) => o.status === filters.status);
      if (filters?.customerId) rows = rows.filter((o) => o.customerId === filters.customerId);
      return byNewest(rows);
    }),
    getOrderById: vi.fn(async (id: number, scope?: any) => {
      const o = store.orders.get(id);
      if (!o) return undefined;
      if (scope && !store.scopeAllows(scope, o.companyId)) return undefined;
      return o;
    }),
    getOrderWithItems: vi.fn(async (id: number, scope?: any) => {
      const o = store.orders.get(id);
      if (!o) return undefined;
      if (scope && !store.scopeAllows(scope, o.companyId)) return undefined;
      return { ...o, items: store.orderItems.filter((i) => i.orderId === id) };
    }),
    createOrder: vi.fn(async (data: Row) => {
      const row = store.orders.insert({
        type: "sales", status: "pending", taxAmount: "0", shippingAmount: "0", discountAmount: "0", currency: "USD", ...data,
      });
      return { id: row.id };
    }),
    updateOrder: vi.fn(async (id: number, data: Row) => {
      store.orders.update(id, data);
    }),
    createOrderItem: vi.fn(async (data: Row) => ({ id: store.orderItems.insert(data).id })),
    getOrderItems: vi.fn(async (orderId: number) => store.orderItems.filter((i) => i.orderId === orderId)),
    deleteOrderItems: vi.fn(async (orderId: number) => {
      for (const i of store.orderItems.filter((r) => r.orderId === orderId)) store.orderItems.remove(i.id);
    }),
    deleteOrder: vi.fn(async (id: number) => {
      store.orders.remove(id);
    }),
    // ── invoices ──
    getInvoices: vi.fn(async (scope?: any, filters?: { status?: string; customerId?: number }) => {
      let rows = store.inScope(scope, store.invoices.all());
      if (filters?.status) rows = rows.filter((i) => i.status === filters.status);
      if (filters?.customerId) rows = rows.filter((i) => i.customerId === filters.customerId);
      return byNewest(rows).map((i) => ({ ...i, customer: store.customerJoin(store.customers.get(i.customerId)) }));
    }),
    getInvoiceById: vi.fn(async (id: number) => store.invoices.get(id)),
    getInvoiceWithItems: vi.fn(async (id: number) => {
      const i = store.invoices.get(id);
      if (!i) return undefined;
      return {
        ...i,
        customer: store.customerJoin(store.customers.get(i.customerId)),
        items: store.invoiceItems.filter((r) => r.invoiceId === id),
      };
    }),
    createInvoice: vi.fn(async (data: Row) => {
      const row = store.invoices.insert({
        type: "invoice", status: "draft", taxAmount: "0", discountAmount: "0", paidAmount: "0", currency: "USD", ...data,
      });
      return { id: row.id };
    }),
    createInvoiceItem: vi.fn(async (data: Row) => ({ id: store.invoiceItems.insert(data).id })),
    updateInvoice: vi.fn(async (id: number, data: Row) => {
      store.invoices.update(id, data);
    }),
    // ── payments ──
    getPayments: vi.fn(async (scope?: any, filters?: { type?: string; status?: string }) => {
      let rows = store.inScope(scope, store.payments.all());
      if (filters?.type) rows = rows.filter((p) => p.type === filters.type);
      if (filters?.status) rows = rows.filter((p) => p.status === filters.status);
      return byNewest(rows);
    }),
    getPaymentById: vi.fn(async (id: number) => store.payments.get(id)),
    createPayment: vi.fn(async (data: Row) => ({ id: store.payments.insert({ status: "pending", currency: "USD", ...data }).id })),
    updatePayment: vi.fn(async (id: number, data: Row) => {
      store.payments.update(id, data);
    }),
    // ── journal ──
    createTransaction: vi.fn(async (data: Row) => ({ id: store.transactions.insert(data).id })),
    createTransactionLine: vi.fn(async (data: Row) => ({ id: store.transactionLines.insert(data).id })),
    getAccountByCode: vi.fn(async (code: string, companyId?: number) =>
      store.accounts.find((a) => a.code === code && (!companyId || a.companyId === companyId))),
    getAccountByName: vi.fn(async (name: string, companyId?: number) =>
      store.accounts.find((a) => String(a.name).includes(name) && (!companyId || a.companyId === companyId))),
    // ── recurring invoices ──
    getRecurringInvoices: vi.fn(async (filters?: { customerId?: number; isActive?: boolean }) => {
      let rows = store.recurringInvoices.all();
      if (filters?.customerId) rows = rows.filter((r) => r.customerId === filters.customerId);
      if (filters?.isActive !== undefined) rows = rows.filter((r) => r.isActive === filters.isActive);
      return rows.map((r) => ({ ...r, customer: store.customerJoin(store.customers.get(r.customerId)) }));
    }),
    getRecurringInvoiceById: vi.fn(async (id: number) => store.recurringInvoices.get(id)),
    getRecurringInvoiceWithItems: vi.fn(async (id: number) => {
      const r = store.recurringInvoices.get(id);
      if (!r) return undefined;
      return { ...r, items: store.recurringInvoiceItems.filter((i) => i.recurringInvoiceId === id) };
    }),
    createRecurringInvoice: vi.fn(async (data: Row) => ({
      id: store.recurringInvoices.insert({
        currency: "USD", subtotal: "0", taxAmount: "0", discountAmount: "0", totalAmount: "0",
        autoSend: false, daysUntilDue: 30, isActive: true, generationCount: 0, ...data,
      }).id,
    })),
    updateRecurringInvoice: vi.fn(async (id: number, data: Row) => {
      store.recurringInvoices.update(id, data);
    }),
    createRecurringInvoiceItem: vi.fn(async (data: Row) => ({ id: store.recurringInvoiceItems.insert(data).id })),
    createRecurringInvoiceHistory: vi.fn(async (data: Row) => ({
      id: store.recurringInvoiceHistory.insert({ status: "generated", generatedAt: new Date(), ...data }).id,
    })),
    getRecurringInvoiceHistory: vi.fn(async (recurringInvoiceId: number) =>
      store.recurringInvoiceHistory.filter((h) => h.recurringInvoiceId === recurringInvoiceId)),
  };
});

import * as db from "../db";
import { appRouter } from "../routers";

// Entity 1 staff. Both are entity-scoped so companyId defaulting and list
// filtering are exercised for real (a "global" user would see everything).
const sales = appRouter.createCaller(ctxFor("sales", { id: 1, companyId: 1, regionScope: "entity" }));
const finance = appRouter.createCaller(ctxFor("finance", { id: 2, companyId: 1, regionScope: "entity" }));
// Entity 2 staff (outsiders to entity 1's data).
const otherSales = appRouter.createCaller(ctxFor("sales", { id: 3, companyId: 2, regionScope: "entity" }));
const otherFinance = appRouter.createCaller(ctxFor("finance", { id: 4, companyId: 2, regionScope: "entity" }));
// External portal account.
const vendor = appRouter.createCaller(ctxFor("vendor", { id: 5, companyId: 1, regionScope: "entity" }));

const auditCalls = () => (db.createAuditLog as any).mock.calls.map((c: any[]) => c[0]);

// Shared narrative state, filled in step by step.
const state = {
  customerId: 0,
  orderId: 0,
  orderNumber: "",
  invoiceId: 0,
  invoiceNumber: "",
  recurringId: 0,
  generatedInvoiceId: 0,
};

describe("Sales flow: customer → order → invoice → payment → recurring", () => {
  // ─────────────────────────────────────────────────────────────────────────
  it("1. sales creates a customer and reads it back", async () => {
    const created = await sales.customers.create({
      name: "Acme Foods",
      email: "ap@acme.example",
      type: "business",
      paymentTerms: 30,
    });
    expect(created).toEqual({ id: 1 });
    state.customerId = created.id;

    const fetched = await sales.customers.get({ id: 1 });
    expect(fetched).toMatchObject({
      id: 1,
      name: "Acme Foods",
      email: "ap@acme.example",
      type: "business",
      status: "active",
      paymentTerms: 30,
      companyId: 1, // defaulted from the caller's home entity
    });

    const list = await sales.customers.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(1);

    expect(auditCalls()).toContainEqual(
      expect.objectContaining({ userId: 1, action: "create", entityType: "customer", entityId: 1, entityName: "Acme Foods" }),
    );
  });

  it("1b. sales cannot file a customer under an entity outside their scope", async () => {
    await expect(sales.customers.create({ name: "Wrong Entity Co", companyId: 2 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.customers.all()).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("2. sales creates an order with two line items for that customer", async () => {
    const created = await sales.orders.create({
      customerId: state.customerId,
      orderDate: new Date("2026-09-01"),
      subtotal: "225.00",
      taxAmount: "18.00",
      totalAmount: "243.00",
      notes: "First wholesale order",
      items: [
        { sku: "GRN-001", name: "Granola 12oz", quantity: "10", unitPrice: "12.50", totalAmount: "125.00" },
        { sku: "GRN-002", name: "Granola 32oz", quantity: "4", unitPrice: "25.00", totalAmount: "100.00" },
      ],
    });
    expect(created).toEqual({ id: 1 });
    state.orderId = created.id;

    const order = await sales.orders.get({ id: 1 });
    expect(order).toBeDefined();
    expect(order!.orderNumber).toMatch(/^ORD-\d{4}-\d{4}$/);
    state.orderNumber = order!.orderNumber;
    expect(order).toMatchObject({
      id: 1,
      companyId: 1, // defaulted from the caller's home entity
      customerId: 1,
      type: "sales",
      status: "pending",
      subtotal: "225.00",
      taxAmount: "18.00",
      totalAmount: "243.00",
      currency: "USD",
      createdBy: 1,
      notes: "First wholesale order",
    });
    expect(order!.items).toHaveLength(2);
    expect(order!.items[0]).toMatchObject({ id: 1, orderId: 1, sku: "GRN-001", name: "Granola 12oz", quantity: "10", unitPrice: "12.50", totalAmount: "125.00" });
    expect(order!.items[1]).toMatchObject({ id: 2, orderId: 1, sku: "GRN-002", quantity: "4", totalAmount: "100.00" });
    // Line totals reconcile with the header subtotal.
    const lineSum = order!.items.reduce((s: number, i: any) => s + Number(i.totalAmount), 0);
    expect(lineSum.toFixed(2)).toBe(order!.subtotal);

    expect(await sales.orderItems.list({ orderId: 1 })).toHaveLength(2);

    expect(await sales.orders.list()).toHaveLength(1);
    expect(await sales.orders.list({ status: "pending" })).toHaveLength(1);
    expect(await sales.orders.list({ status: "shipped" })).toHaveLength(0);
    expect(await sales.orders.list({ customerId: 1 })).toHaveLength(1);
    expect(await sales.orders.list({ customerId: 999 })).toHaveLength(0);

    expect(auditCalls()).toContainEqual(
      expect.objectContaining({ userId: 1, action: "create", entityType: "order", entityId: 1, entityName: state.orderNumber }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("3a. order moves pending → confirmed → processing", async () => {
    expect(await sales.orders.update({ id: state.orderId, status: "confirmed" })).toEqual({ success: true });
    expect((await sales.orders.get({ id: state.orderId }))!.status).toBe("confirmed");

    expect(await sales.orders.update({ id: state.orderId, status: "processing", notes: "Picking" })).toEqual({ success: true });
    expect(await sales.orders.get({ id: state.orderId })).toMatchObject({ status: "processing", notes: "Picking" });

    expect(auditCalls().filter((a: any) => a.entityType === "order" && a.action === "update")).toHaveLength(2);
  });

  it("3b. an invalid order status is rejected by input validation", async () => {
    await expect(sales.orders.update({ id: state.orderId, status: "lost-in-the-mail" as any }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await sales.orders.get({ id: state.orderId }))!.status).toBe("processing");
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("4a. finance raises a draft invoice for the order and the journal entry is posted", async () => {
    const created = await finance.invoices.create({
      customerId: state.customerId,
      issueDate: new Date("2026-09-02"),
      dueDate: new Date("2026-10-02"),
      subtotal: "225.00",
      taxAmount: "18.00",
      totalAmount: "243.00",
      notes: `For order ${state.orderNumber}`,
      items: [
        { description: "Granola 12oz", quantity: "10", unitPrice: "12.50", taxRate: "8", taxAmount: "10.00", totalAmount: "135.00" },
        { description: "Granola 32oz", quantity: "4", unitPrice: "25.00", taxRate: "8", taxAmount: "8.00", totalAmount: "108.00" },
      ],
    });
    expect(created).toEqual({ id: 1 });
    state.invoiceId = created.id;

    const invoice = await finance.invoices.get({ id: 1 });
    expect(invoice).toBeDefined();
    expect(invoice!.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
    state.invoiceNumber = invoice!.invoiceNumber;
    expect(invoice).toMatchObject({
      id: 1,
      companyId: 1, // defaulted from the caller's home entity
      customerId: 1,
      type: "invoice",
      status: "draft",
      subtotal: "225.00",
      taxAmount: "18.00",
      totalAmount: "243.00",
      paidAmount: "0",
      currency: "USD",
      createdBy: 2,
      customer: { id: 1, name: "Acme Foods", email: "ap@acme.example" },
    });
    expect(invoice!.items).toHaveLength(2);
    expect(invoice!.items[0]).toMatchObject({ invoiceId: 1, description: "Granola 12oz", quantity: "10", totalAmount: "135.00" });

    // Double-entry side effect: one posted journal entry, AR debit / Revenue credit, under entity 1.
    expect(db.createTransaction).toHaveBeenCalledTimes(1);
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 1,
      transactionNumber: `JE-INV-${state.invoiceNumber}`,
      type: "invoice",
      referenceType: "invoice",
      referenceId: 1,
      totalAmount: "243.00",
      status: "posted",
      createdBy: 2,
      postedBy: 2,
    }));
    expect(db.getAccountByCode).toHaveBeenCalledWith("1200", 1);
    expect(db.getAccountByCode).toHaveBeenCalledWith("4000", 1);
    const lines = store.transactionLines.filter((l) => l.transactionId === 1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountId: 2, debit: "243.00", credit: "0" }); // 1200 Accounts Receivable
    expect(lines[1]).toMatchObject({ accountId: 3, debit: "0", credit: "243.00" }); // 4000 Revenue

    const list = await finance.invoices.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 1, status: "draft", customer: { name: "Acme Foods" } });
    expect(await finance.invoices.list({ status: "paid" })).toHaveLength(0);

    expect(auditCalls()).toContainEqual(
      expect.objectContaining({ userId: 2, action: "create", entityType: "invoice", entityId: 1, entityName: state.invoiceNumber }),
    );
  });

  it("4b. a sales user is not allowed to raise invoices (finance-only)", async () => {
    await expect(sales.invoices.create({
      customerId: state.customerId, issueDate: new Date(), subtotal: "1.00", totalAmount: "1.00",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.invoices.all()).toHaveLength(1);
  });

  it("4c. shipping the order flips its linked draft invoice to 'sent' (cascade)", async () => {
    // No Sales procedure links an order to its invoice (orders.invoiceId is only
    // set by the copacker portal), so the link is written straight into the store.
    store.orders.update(state.orderId, { invoiceId: state.invoiceId });

    expect(await sales.orders.update({ id: state.orderId, status: "shipped" })).toEqual({ success: true });
    expect((await sales.orders.get({ id: state.orderId }))!.status).toBe("shipped");
    expect(db.updateInvoice).toHaveBeenCalledWith(state.invoiceId, { status: "sent" });
    expect((await finance.invoices.get({ id: state.invoiceId }))!.status).toBe("sent");
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("5a. a partial customer payment leaves the invoice 'partial'", async () => {
    const created = await finance.payments.create({
      type: "received",
      invoiceId: state.invoiceId,
      customerId: state.customerId,
      amount: "100.00",
      paymentMethod: "bank_transfer",
      paymentDate: new Date("2026-09-10"),
      referenceNumber: "ACH-1001",
    });
    expect(created).toEqual({ id: 1 });

    const payment = await finance.payments.get({ id: 1 });
    expect(payment!.paymentNumber).toMatch(/^PAY-\d{4}-\d{4}$/);
    expect(payment).toMatchObject({
      id: 1,
      companyId: 1, // defaulted from the caller's home entity
      type: "received",
      invoiceId: 1,
      customerId: 1,
      amount: "100.00",
      paymentMethod: "bank_transfer",
      referenceNumber: "ACH-1001",
      createdBy: 2,
    });

    const invoice = await finance.invoices.get({ id: state.invoiceId });
    expect(invoice!.status).toBe("partial");
    expect(Number(invoice!.paidAmount)).toBe(100);
    // Order is untouched until the invoice is fully paid.
    expect((await sales.orders.get({ id: state.orderId }))!.status).toBe("shipped");

    expect(auditCalls()).toContainEqual(
      expect.objectContaining({ userId: 2, action: "create", entityType: "payment", entityId: 1, entityName: payment!.paymentNumber }),
    );
  });

  it("5b. paying the balance marks the invoice 'paid' and cascades the order to 'delivered'", async () => {
    const created = await finance.payments.create({
      type: "received",
      invoiceId: state.invoiceId,
      customerId: state.customerId,
      amount: "143.00",
      paymentMethod: "check",
      paymentDate: new Date("2026-09-20"),
    });
    expect(created).toEqual({ id: 2 });

    const invoice = await finance.invoices.get({ id: state.invoiceId });
    expect(invoice!.status).toBe("paid");
    expect(Number(invoice!.paidAmount)).toBe(243);

    expect(db.updateOrder).toHaveBeenCalledWith(state.orderId, { status: "delivered" });
    expect((await sales.orders.get({ id: state.orderId }))!.status).toBe("delivered");

    const received = await finance.payments.list({ type: "received" });
    expect(received.map((p) => p.id)).toEqual([2, 1]);
    expect(await finance.payments.list({ type: "made" })).toHaveLength(0);
  });

  it("3c. order completes its lifecycle at 'delivered' and lists under that status", async () => {
    expect(await sales.orders.update({ id: state.orderId, status: "delivered" })).toEqual({ success: true });
    expect((await sales.orders.get({ id: state.orderId }))!.status).toBe("delivered");
    expect(await sales.orders.list({ status: "delivered" })).toHaveLength(1);
    expect(await sales.orders.list({ status: "pending" })).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("6a. finance sets up a monthly recurring invoice template with computed totals", async () => {
    const created = await finance.recurringInvoices.create({
      customerId: state.customerId,
      templateName: "Acme monthly subscription",
      frequency: "monthly",
      dayOfMonth: 1,
      startDate: new Date("2026-10-01"),
      daysUntilDue: 15,
      items: [
        { description: "Shelf-space subscription", quantity: "2", unitPrice: "25.00", taxRate: "8" },
      ],
    });
    expect(created).toEqual({ id: 1 });
    state.recurringId = created.id;

    const template = await finance.recurringInvoices.getById({ id: 1 });
    expect(template).toMatchObject({
      id: 1,
      companyId: 1, // must carry the entity so generated invoices land in the creator's list
      customerId: 1,
      templateName: "Acme monthly subscription",
      frequency: "monthly",
      dayOfMonth: 1,
      subtotal: "50",
      taxAmount: "4",
      totalAmount: "54",
      daysUntilDue: 15,
      isActive: true,
      generationCount: 0,
      createdBy: 2,
    });
    expect(template!.nextGenerationDate).toEqual(new Date("2026-10-01"));
    expect(template!.items).toHaveLength(1);
    expect(template!.items[0]).toMatchObject({ recurringInvoiceId: 1, quantity: "2", unitPrice: "25.00", taxAmount: "4", totalAmount: "54" });

    const list = await finance.recurringInvoices.list({ isActive: true });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 1, customer: { name: "Acme Foods" } });
  });

  it("6b. running the template now produces a draft invoice and advances the schedule", async () => {
    const before = Date.now();
    const result = await finance.recurringInvoices.generateNow({ id: state.recurringId });
    expect(result.invoiceId).toBe(2);
    expect(result.invoiceNumber).toMatch(/^INV-\d+$/);
    state.generatedInvoiceId = result.invoiceId;

    const invoice = await finance.invoices.get({ id: 2 });
    expect(invoice).toMatchObject({
      id: 2,
      companyId: 1,
      customerId: 1,
      invoiceNumber: result.invoiceNumber,
      status: "draft",
      subtotal: "50",
      taxAmount: "4",
      totalAmount: "54",
      createdBy: 2,
      customer: { id: 1, name: "Acme Foods" },
    });
    expect(invoice!.items).toHaveLength(1);
    expect(invoice!.items[0]).toMatchObject({ invoiceId: 2, description: "Shelf-space subscription", totalAmount: "54" });
    // Due date = issue date + daysUntilDue (15).
    const dueInDays = Math.round((invoice!.dueDate!.getTime() - invoice!.issueDate.getTime()) / 86_400_000);
    expect(dueInDays).toBe(15);

    const template = await finance.recurringInvoices.getById({ id: state.recurringId });
    expect(template!.generationCount).toBe(1);
    expect(template!.lastGeneratedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(template!.nextGenerationDate.getTime()).toBeGreaterThan(before);

    const history = await finance.recurringInvoices.history({ id: state.recurringId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ recurringInvoiceId: 1, generatedInvoiceId: 2, status: "generated" });

    // The generated invoice is visible to the (entity-scoped) finance team that owns the template.
    const ids = (await finance.invoices.list()).map((i) => i.id);
    expect(ids).toEqual([2, 1]);
  });

  it("6c. the generated invoice is approved: draft → sent", async () => {
    expect(await finance.invoices.approve({ id: state.generatedInvoiceId })).toEqual({ success: true });
    const invoice = await finance.invoices.get({ id: state.generatedInvoiceId });
    expect(invoice!.status).toBe("sent");
    expect(store.invoices.get(state.generatedInvoiceId)).toMatchObject({ approvedBy: 2 });
    expect(auditCalls()).toContainEqual(
      expect.objectContaining({ userId: 2, action: "approve", entityType: "invoice", entityId: state.generatedInvoiceId }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("7. staff of another entity cannot see or touch entity 1's customer, order, invoices or payments", async () => {
    // Customer
    expect(await otherSales.customers.list()).toEqual([]);
    expect(await otherSales.customers.get({ id: state.customerId })).toBeUndefined();
    await expect(otherSales.customers.update({ id: state.customerId, name: "Hijacked" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(otherSales.customers.delete({ id: state.customerId }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.customers.get(state.customerId)!.name).toBe("Acme Foods");

    // Order
    expect(await otherSales.orders.list()).toEqual([]);
    expect(await otherSales.orders.get({ id: state.orderId })).toBeUndefined();
    await expect(otherSales.orders.update({ id: state.orderId, status: "cancelled" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(otherSales.orders.delete({ id: state.orderId }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await otherSales.orders.bulkDelete({ ids: [state.orderId] })).toEqual({ success: true, deleted: 0 });
    expect(store.orders.get(state.orderId)!.status).toBe("delivered");

    // Cannot create rows under entity 1 either.
    await expect(otherSales.orders.create({
      customerId: state.customerId, companyId: 1, orderDate: new Date(), subtotal: "1.00", totalAmount: "1.00",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherFinance.payments.create({
      companyId: 1, type: "received", amount: "1.00", paymentDate: new Date(),
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Finance lists are scoped too.
    expect(await otherFinance.invoices.list()).toEqual([]);
    expect(await otherFinance.payments.list()).toEqual([]);

    // A scoped user with no home entity at all is refused outright rather than shown nothing.
    const noEntity = appRouter.createCaller(ctxFor("sales", { id: 6, companyId: null as any, regionScope: "entity" }));
    await expect(noEntity.orders.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("8. an external vendor account is forbidden from creating sales orders", async () => {
    await expect(vendor.orders.create({
      customerId: state.customerId, orderDate: new Date(), subtotal: "1.00", totalAmount: "1.00",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.orders.all()).toHaveLength(1);
    expect(db.createOrder).toHaveBeenCalledTimes(1);
  });
});
