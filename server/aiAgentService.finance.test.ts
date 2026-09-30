import { describe, it, expect, vi, beforeEach } from "vitest";
import { orders, customers, workOrders, shipments } from "../drizzle/schema";

vi.mock("./db", () => {
  const names = [
    "getDb", "createWorkOrder", "createFreightRfq", "createAuditLog",
    "getCustomerById", "getOrderById", "getOrderItems", "getOrders", "updateOrder",
    "getInvoices", "getInvoiceById", "getInvoiceWithItems", "createInvoice", "createInvoiceItem", "updateInvoice",
    "createPayment", "createTransaction", "createTransactionLine", "getAccountByCode", "getAccountByName",
    "getFreightQuoteById", "getFreightRfqById", "getFreightQuotes", "updateFreightQuote", "updateFreightRfq", "createFreightBooking",
  ];
  const m: Record<string, any> = {};
  for (const n of names) m[n] = vi.fn();
  return m;
});
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), invokeLLMStream: vi.fn() }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(), formatEmailHtml: vi.fn() }));
vi.mock("./routers/middleware", () => ({ getValidGoogleToken: vi.fn() }));
vi.mock("./invoicePosting", () => ({ postInvoiceJournalEntry: vi.fn().mockResolvedValue({ transactionId: 900 }) }));
vi.mock("./routers/_shared", () => ({ generateNumber: (prefix: string) => `${prefix}-TEST` }));

import * as db from "./db";
import { postInvoiceJournalEntry } from "./invoicePosting";
import { executeTool, registerChatTools, listChatToolNames, assertRole, type AIAgentContext } from "./aiAgentService";

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

const finance: AIAgentContext = { userId: 1, userName: "Fin", userRole: "finance", companyId: 7 };
const ops: AIAgentContext = { userId: 2, userName: "Olive", userRole: "ops", companyId: 7 };
const user: AIAgentContext = { userId: 3, userName: "Uma", userRole: "user", companyId: 7 };
const scope = { mode: "entity", companyIds: [7] };

const acme = { id: 3, companyId: 7, name: "Acme", paymentTerms: 15 };
const order5 = { id: 5, companyId: 7, orderNumber: "ORD-5", customerId: 3, status: "confirmed", invoiceId: null, subtotal: "100.00", taxAmount: "8.00", discountAmount: "0.00", totalAmount: "108.00", currency: "USD" };
const inv77 = { id: 77, companyId: 7, invoiceNumber: "INV-77", status: "draft", customerId: 3, totalAmount: "108.00", paidAmount: "0.00", currency: "USD" };

describe("manage_invoice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getDb).mockResolvedValue(createFakeDb());
    vi.mocked(db.createInvoice).mockResolvedValue({ id: 77 });
    vi.mocked(db.createInvoiceItem).mockResolvedValue({ id: 1 });
    vi.mocked(db.createPayment).mockResolvedValue({ id: 88 });
    vi.mocked(db.createTransaction).mockResolvedValue({ id: 901 } as any);
    vi.mocked(db.getAccountByCode).mockResolvedValue({ id: 10 } as any);
    vi.mocked(db.getOrders).mockResolvedValue([]);
    vi.mocked(postInvoiceJournalEntry).mockResolvedValue({ transactionId: 900 });
  });

  it("create from an order copies lines/totals, links the order and posts the journal entry", async () => {
    vi.mocked(db.getOrderById).mockResolvedValue(order5 as any);
    vi.mocked(db.getOrderItems).mockResolvedValue([{ productId: 11, name: "Widget", quantity: "2.0000", unitPrice: "50.00", totalAmount: "100.00" }] as any);
    vi.mocked(db.getCustomerById).mockResolvedValue(acme as any);

    const result = await executeTool("manage_invoice", { action: "create", orderId: 5 }, finance);

    expect(db.getOrderById).toHaveBeenCalledWith(5, scope);
    expect(db.createInvoice).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, invoiceNumber: "INV-TEST", customerId: 3, status: "draft", subtotal: "100.00", taxAmount: "8.00", totalAmount: "108.00", createdBy: 1,
    }));
    expect(db.createInvoiceItem).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 77, productId: 11, description: "Widget", quantity: "2", unitPrice: "50.00", totalAmount: "100.00" }));
    expect(db.updateOrder).toHaveBeenCalledWith(5, { invoiceId: 77 });
    expect(postInvoiceJournalEntry).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 77, invoiceNumber: "INV-TEST", companyId: 7, totalAmount: "108.00", userId: 1 }));
    expect(result).toMatchObject({ created: true, invoiceId: 77, invoiceNumber: "INV-TEST", totalAmount: "108.00", journalTransactionId: 900 });
    // due date = issue + customer's 15-day terms
    const due = new Date(result.dueDate).getTime() - Date.now();
    expect(due).toBeGreaterThan(14 * 86400000);
    expect(due).toBeLessThanOrEqual(15 * 86400000);
  });

  it("create from explicit lines needs a customer and computes totals", async () => {
    vi.mocked(db.getCustomerById).mockResolvedValue(acme as any);
    const result = await executeTool("manage_invoice", {
      action: "create",
      data: { customerId: 3, items: [{ description: "Consulting", quantity: 3, unitPrice: 200 }], taxAmount: 30, dueDate: "2026-12-01" },
    }, finance);
    expect(db.createInvoice).toHaveBeenCalledWith(expect.objectContaining({ customerId: 3, subtotal: "600.00", taxAmount: "30.00", totalAmount: "630.00", companyId: 7 }));
    expect(result.dueDate.startsWith("2026-12-01")).toBe(true);

    vi.mocked(db.getCustomerById).mockResolvedValue(undefined);
    await expect(executeTool("manage_invoice", { action: "create", data: { customerId: 99, items: [{ description: "x", quantity: 1, unitPrice: 1 }] } }, finance))
      .rejects.toThrow("Customer not found");
  });

  it("create refuses a non-finance role (ops) and a plain user", async () => {
    await expect(executeTool("manage_invoice", { action: "create", orderId: 5 }, ops)).rejects.toThrow(/requires a finance, admin, or executive role/);
    await expect(executeTool("manage_invoice", { action: "record_payment", invoiceId: 77, data: { amount: 1 } }, user)).rejects.toThrow(/Not authorized/);
    expect(db.createInvoice).not.toHaveBeenCalled();
    expect(db.createPayment).not.toHaveBeenCalled();
  });

  it("create refuses an already-invoiced order", async () => {
    vi.mocked(db.getOrderById).mockResolvedValue({ ...order5, invoiceId: 12 } as any);
    await expect(executeTool("manage_invoice", { action: "create", orderId: 5 }, finance)).rejects.toThrow(/already has invoice #12/);
  });

  it("send marks a draft invoice sent/approved and is a no-op otherwise", async () => {
    vi.mocked(db.getInvoiceById).mockResolvedValue(inv77 as any);
    const result = await executeTool("manage_invoice", { action: "send", invoiceId: 77 }, finance);
    expect(db.updateInvoice).toHaveBeenCalledWith(77, expect.objectContaining({ status: "sent", approvedBy: 1 }));
    expect(result).toMatchObject({ sent: true, status: "sent" });

    vi.mocked(db.updateInvoice).mockClear();
    vi.mocked(db.getInvoiceById).mockResolvedValue({ ...inv77, status: "paid" } as any);
    const again = await executeTool("manage_invoice", { action: "send", invoiceId: 77 }, finance);
    expect(again.sent).toBe(false);
    expect(db.updateInvoice).not.toHaveBeenCalled();
  });

  it("send: an invoice from another entity is not found", async () => {
    vi.mocked(db.getInvoiceById).mockResolvedValue({ ...inv77, companyId: 8 } as any);
    await expect(executeTool("manage_invoice", { action: "send", invoiceId: 77 }, finance)).rejects.toThrow("Invoice not found");
  });

  it("record_payment: full payment → paid, order delivered, Cash/AR journal lines", async () => {
    vi.mocked(db.getInvoiceById).mockResolvedValue({ ...inv77, status: "sent" } as any);
    vi.mocked(db.getOrders).mockResolvedValue([{ id: 5, invoiceId: 77, status: "shipped" }] as any);

    const result = await executeTool("manage_invoice", { action: "record_payment", invoiceId: 77, data: { amount: 108, method: "wire", date: "2026-09-20", reference: "W123" } }, finance);

    expect(db.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, type: "received", status: "completed", amount: "108.00", paymentMethod: "wire", invoiceId: 77, customerId: 3, referenceNumber: "W123", createdBy: 1,
    }));
    expect(vi.mocked(db.createPayment).mock.calls[0][0].paymentDate.toISOString().startsWith("2026-09-20")).toBe(true);
    expect(db.updateInvoice).toHaveBeenCalledWith(77, { paidAmount: "108.00", status: "paid" });
    expect(db.getOrders).toHaveBeenCalledWith(scope);
    expect(db.updateOrder).toHaveBeenCalledWith(5, { status: "delivered" });
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, type: "payment", referenceId: 88, totalAmount: "108.00", status: "posted" }));
    expect(db.createTransactionLine).toHaveBeenCalledTimes(2);
    expect(db.createTransactionLine).toHaveBeenCalledWith(expect.objectContaining({ debit: "108.00", credit: "0" }));
    expect(db.createTransactionLine).toHaveBeenCalledWith(expect.objectContaining({ debit: "0", credit: "108.00" }));
    expect(result).toMatchObject({ recorded: true, newStatus: "paid", totalPaid: "108.00", balance: "0.00", orderMarkedDelivered: 5, journalTransactionId: 901 });
  });

  it("record_payment: partial payment → partial, no order cascade", async () => {
    vi.mocked(db.getInvoiceById).mockResolvedValue({ ...inv77, status: "sent", paidAmount: "8.00" } as any);
    const result = await executeTool("manage_invoice", { action: "record_payment", invoiceId: 77, data: { amount: 50 } }, finance);
    expect(db.updateInvoice).toHaveBeenCalledWith(77, { paidAmount: "58.00", status: "partial" });
    expect(db.updateOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ newStatus: "partial", balance: "50.00", method: "bank_transfer" });
    await expect(executeTool("manage_invoice", { action: "record_payment", invoiceId: 77, data: { amount: -1 } }, finance)).rejects.toThrow(/positive number/);
  });
});

describe("manage_freight book_shipment", () => {
  const quote9 = { id: 9, rfqId: 4, carrierId: 2, status: "received", totalCost: "1500.00", currency: "USD", quoteNumber: "Q-9" };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getDb).mockResolvedValue(createFakeDb());
    vi.mocked(db.getFreightQuoteById).mockResolvedValue(quote9 as any);
    vi.mocked(db.getFreightRfqById).mockResolvedValue({ id: 4, companyId: 7, rfqNumber: "RFQ-4" } as any);
    vi.mocked(db.getFreightQuotes).mockResolvedValue([quote9, { id: 10, rfqId: 4, status: "received" }, { id: 11, rfqId: 4, status: "rejected" }] as any);
    vi.mocked(db.createFreightBooking).mockResolvedValue({ id: 30, bookingNumber: "BK-2026-00001" });
  });

  it("accepts the quote, rejects siblings, creates the booking and awards the RFQ (same as freight.quotes.accept)", async () => {
    const result = await executeTool("manage_freight", { action: "book_shipment", quoteId: 9 }, ops);
    expect(db.updateFreightQuote).toHaveBeenCalledWith(9, { status: "accepted" });
    expect(db.updateFreightQuote).toHaveBeenCalledWith(10, { status: "rejected" });
    expect(db.updateFreightQuote).not.toHaveBeenCalledWith(11, expect.anything());
    expect(db.createFreightBooking).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, quoteId: 9, rfqId: 4, carrierId: 2, status: "pending", agreedCost: "1500.00", currency: "USD" }));
    expect(db.updateFreightRfq).toHaveBeenCalledWith(4, { status: "awarded" });
    expect(result).toMatchObject({ booked: true, bookingNumber: "BK-2026-00001", rfqNumber: "RFQ-4" });
  });

  it("refuses a non-mutation role and an RFQ from another entity", async () => {
    await expect(executeTool("manage_freight", { action: "book_shipment", quoteId: 9 }, user)).rejects.toThrow(/Not authorized/);
    vi.mocked(db.getFreightRfqById).mockResolvedValue({ id: 4, companyId: 8, rfqNumber: "RFQ-4" } as any);
    await expect(executeTool("manage_freight", { action: "book_shipment", quoteId: 9 }, ops)).rejects.toThrow("Freight RFQ not found");
    expect(db.createFreightBooking).not.toHaveBeenCalled();
  });

  it("refuses an already-accepted quote", async () => {
    vi.mocked(db.getFreightQuoteById).mockResolvedValue({ ...quote9, status: "accepted" } as any);
    await expect(executeTool("manage_freight", { action: "book_shipment", quoteId: 9 }, ops)).rejects.toThrow(/already accepted/);
  });
});

describe("generate_report new types", () => {
  it("customer_analysis, production_status and order_fulfillment produce their summaries", async () => {
    vi.resetAllMocks();
    const fake = createFakeDb((table) => {
      if (table === orders) return [{ status: "shipped", customerId: 3, count: 2, value: "300.00", revenue: "300.00", orderCount: 2 }, { status: "pending", customerId: 4, count: 1, value: "50.00", revenue: "50.00", orderCount: 1 }];
      if (table === customers) return [{ id: 3, name: "Acme" }, { id: 4, name: "Beta" }];
      if (table === workOrders) return [{ status: "in_progress", count: 2, quantity: "10", completedQuantity: "4", id: 1, workOrderNumber: "WO-1" }];
      if (table === shipments) return [{ status: "in_transit", count: 2 }];
      return [];
    });
    vi.mocked(db.getDb).mockResolvedValue(fake);

    const ca = await executeTool("generate_report", { reportType: "customer_analysis" }, ops);
    expect(ca.reportType).toBe("customer_analysis");
    expect(ca.topCustomers[0]).toMatchObject({ customerName: "Acme", revenue: "300.00" });
    expect(ca.totalRevenue).toBe("350.00");

    const ps = await executeTool("generate_report", { reportType: "production_status" }, ops);
    expect(ps).toMatchObject({ reportType: "production_status", inProgress: 2, totalWorkOrders: 2 });

    const of = await executeTool("generate_report", { reportType: "order_fulfillment" }, ops);
    expect(of).toMatchObject({ reportType: "order_fulfillment", totalOrders: 3, fulfilledOrders: 2, openOrders: 1, fulfillmentRate: "66.7%" });
    expect(of.outboundShipments).toEqual({ in_transit: 2 });

    await expect(executeTool("generate_report", { reportType: "nope" }, ops)).rejects.toThrow(/Unknown report type/);
  });
});

describe("registerChatTools extension hook", () => {
  it("routes registered tool names to the executor and rejects duplicates", async () => {
    const executor = vi.fn().mockResolvedValue({ pong: true });
    registerChatTools([{ type: "function", function: { name: "ping_test_tool", description: "ping", parameters: { type: "object", properties: {} } } }], executor);
    expect(listChatToolNames()).toContain("ping_test_tool");
    await expect(executeTool("ping_test_tool", { a: 1 }, ops)).resolves.toEqual({ pong: true });
    expect(executor).toHaveBeenCalledWith("ping_test_tool", { a: 1 }, ops);
    expect(() => registerChatTools([{ type: "function", function: { name: "ping_test_tool" } }], executor)).toThrow(/already registered/);
    expect(() => registerChatTools([{ type: "function", function: { name: "manage_order" } }], executor)).toThrow(/already registered/);
    await expect(executeTool("definitely_unknown", {}, ops)).rejects.toThrow("Unknown tool: definitely_unknown");
  });

  it("assertRole is usable by registered tools", () => {
    expect(() => assertRole(user, ["admin", "ops"], "do thing")).toThrow(/Not authorized: "do thing" requires one of these roles: admin, ops/);
    expect(() => assertRole(ops, ["admin", "ops"], "do thing")).not.toThrow();
  });
});
