/**
 * Finance process flow: chart of accounts → vendor bill (AP) → PO match →
 * approval → payment → ledger → bank feed → bank reconciliation → reports → R&D credit → KPI goals
 * → role gating. Walks the real tRPC routers and the real AP workflow
 * processors on top of a stateful in-memory db mock (see _harness.ts).
 *
 * The `it` blocks are sequential and share state on purpose: each step builds
 * on the rows the previous step left behind, exactly as a finance team's
 * month does.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { WorkflowEngine, WorkflowContext } from "../autonomousWorkflowEngine";

// ---------------------------------------------------------------------------
// In-memory database. Built inside vi.hoisted so the hoisted vi.mock factory
// below can close over it.
// ---------------------------------------------------------------------------
const state = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  type Row = { id: number; [k: string]: any };
  return {
    vendors: table<Row>([{ id: 4, name: "Acme Mills", companyId: 1, email: "ap@acme.test", type: "supplier", status: "active" }]),
    purchaseOrders: table<Row>([
      { id: 100, companyId: 1, poNumber: "PO-100", vendorId: 4, totalAmount: "1190.00", status: "received" },
    ]),
    bills: table<Row>(),
    payments: table<Row>(),
    accounts: table<Row>(),
    transactions: table<Row>(),
    bankTransactions: table<Row>(),
    rdStudies: table<Row>(),
    rdProjects: table<Row>(),
    rdExpenses: table<Row>(),
    kpiGoals: table<Row>(),
  };
});

type Row = { id: number; [k: string]: any };

/** Pull `column = value` pairs out of a drizzle SQL condition (eq / and(eq, eq)). */
function conditionPairs(cond: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let lastColumn: string | null = null;
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.queryChunks)) {
      for (const chunk of node.queryChunks) walk(chunk);
      return;
    }
    // Column nodes carry `name` + `table`; bound values are `Param`s (the only chunk with an
    // `encoder`). StringChunks (" = ", " and ") also have a `.value` and must be skipped.
    if (typeof node.name === "string" && node.table) { lastColumn = node.name; return; }
    if ("encoder" in node && lastColumn) { out[lastColumn] = node.value; lastColumn = null; }
  };
  walk(cond);
  return out;
}

/** The slice of a drizzle handle appRouter.kpiGoals uses (select/insert/update/selectDistinct on kpi_goals). */
function fakeDrizzle(kpi: ReturnType<typeof state.kpiGoals.all> extends Row[] ? typeof state.kpiGoals : never) {
  const filtered = (cond?: any) => {
    const pairs = cond ? conditionPairs(cond) : {};
    return kpi.filter((r) => Object.entries(pairs).every(([k, v]) => r[k] === v));
  };
  return {
    select: () => ({
      from: () => {
        const q: any = Promise.resolve(filtered());
        q.where = (cond: any) => Promise.resolve(filtered(cond));
        return q;
      },
    }),
    selectDistinct: () => ({ from: async () => [...new Set(kpi.all().map((r) => r.category))].map((category) => ({ category })) }),
    insert: () => ({ values: async (v: Row) => [{ insertId: kpi.insert(v).id }] }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (cond: any) => {
          const { id } = conditionPairs(cond);
          kpi.update(id as number, patch);
        },
      }),
    }),
  };
}

vi.mock("../db", async () => {
  const { bucketBillsAging, nextStatusAfterPayment } = await import("../billsLogic");
  const { scopeCompanyIds } = await import("../_core/scope");
  const s = state;

  const withVendor = (b: Row) => ({
    ...b,
    vendorName: s.vendors.get(b.vendorId)?.name ?? null,
    poNumber: b.purchaseOrderId ? s.purchaseOrders.get(b.purchaseOrderId)?.poNumber ?? null : null,
  });
  const getBillById = async (id: number) => {
    const b = s.bills.get(id);
    return b ? withVendor(b) : null;
  };
  const getBills = async (f: Record<string, any> = {}) => {
    if (f.companyIds && f.companyIds.length === 0) return [];
    return s.bills
      .filter((b) =>
        (!f.companyIds || f.companyIds.includes(b.companyId)) &&
        (!f.companyId || b.companyId === f.companyId) &&
        (!f.vendorId || b.vendorId === f.vendorId) &&
        (!f.status || b.status === f.status) &&
        (!f.statuses?.length || f.statuses.includes(b.status)) &&
        (!f.matchStatus || b.matchStatus === f.matchStatus) &&
        (!f.dueBefore || (b.dueDate && b.dueDate <= f.dueBefore)) &&
        (!f.dueAfter || (b.dueDate && b.dueDate >= f.dueAfter)) &&
        (!f.purchaseOrderId || b.purchaseOrderId === f.purchaseOrderId))
      .slice(0, f.limit || undefined)
      .map(withVendor);
  };
  const scoped = (t: typeof s.transactions) => async (scope?: any, f: Record<string, any> = {}) => {
    const ids = scope ? scopeCompanyIds(scope) : null;
    if (ids && ids.length === 0) return [];
    return t.filter((r) =>
      (!ids || ids.includes(r.companyId)) &&
      (!f.companyId || r.companyId === f.companyId) &&
      (!f.type || r.type === f.type) &&
      (!f.status || r.status === f.status));
  };

  return {
    getDb: vi.fn(async () => fakeDrizzle(s.kpiGoals)),
    createAuditLog: vi.fn(async () => undefined),
    // entity scope lookups (no user_entity_access rows → home-company fallback)
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    getCompanyById: vi.fn(async () => null),
    getCompanyIdsInRegion: vi.fn(async () => []),
    getEntityAndDescendantCompanyIds: vi.fn(async () => []),
    // masters
    getVendorById: vi.fn(async (id: number) => s.vendors.get(id)),
    getVendors: vi.fn(async () => s.vendors.all()),
    getVendorByName: vi.fn(async () => null),
    findVendorByEmailOrName: vi.fn(async () => null),
    createVendor: vi.fn(),
    getCustomers: vi.fn(async () => []),
    getInvoices: vi.fn(async () => []),
    getOrders: vi.fn(async () => []),
    getInventory: vi.fn(async () => []),
    getPurchaseOrderById: vi.fn(async (id: number) => s.purchaseOrders.get(id)),
    getPurchaseOrders: vi.fn(async (f: Record<string, any> = {}) =>
      s.purchaseOrders.filter((p) => (!f.vendorId || p.vendorId === f.vendorId) && (!f.status || p.status === f.status)).map((p) => ({ ...p, vendor: s.vendors.get(p.vendorId) ?? null }))),
    findPurchaseOrderByNumber: vi.fn(async () => null),
    // chart of accounts
    getAccounts: vi.fn(async (companyId?: number) =>
      s.accounts.filter((a) => !companyId || a.companyId === companyId).sort((a, b) => String(a.code).localeCompare(String(b.code)))),
    getAccountById: vi.fn(async (id: number) => s.accounts.get(id)),
    createAccount: vi.fn(async (data: Row) => ({ id: s.accounts.insert({ balance: "0", currency: "USD", isActive: true, ...data }).id })),
    updateAccount: vi.fn(async (id: number, data: Row) => { s.accounts.update(id, data); }),
    // bills
    getBills: vi.fn(getBills),
    getBillById: vi.fn(getBillById),
    createBill: vi.fn(async (data: Row) => ({ id: s.bills.insert({ amountPaid: "0.00", matchStatus: "unmatched", currency: "USD", notes: null, paidAt: null, approvedBy: null, approvedAt: null, ...data }).id })),
    updateBill: vi.fn(async (id: number, data: Row) => { s.bills.update(id, data); return getBillById(id); }),
    findBillByNumber: vi.fn(async () => null),
    recordBillPayment: vi.fn(async (billId: number, payment: { amount: number; paymentId?: number }) => {
      const bill = s.bills.get(billId);
      if (!bill) throw new Error("Bill not found");
      if (!(payment.amount > 0)) throw new Error("Payment amount must be positive");
      const next = nextStatusAfterPayment(bill, payment.amount);
      const noteLine = `Payment${payment.paymentId ? ` #${payment.paymentId}` : ""} of ${payment.amount.toFixed(2)} recorded ${new Date().toISOString().slice(0, 10)}`;
      s.bills.update(billId, {
        amountPaid: next.amountPaid.toFixed(2),
        status: next.status,
        paidAt: next.status === "paid" ? new Date() : bill.paidAt,
        notes: bill.notes ? `${bill.notes}\n${noteLine}` : noteLine,
      });
      return getBillById(billId);
    }),
    getBillsAgingSummary: vi.fn(async (companyId?: number, asOf: Date = new Date()) => bucketBillsAging(await getBills({ companyId }), asOf)),
    // payments / ledger
    createPayment: vi.fn(async (data: Row) => ({ id: s.payments.insert({ status: "pending", currency: "USD", ...data }).id })),
    getPayments: vi.fn(scoped(s.payments)),
    getPaymentById: vi.fn(async (id: number) => s.payments.get(id)),
    createTransaction: vi.fn(async (data: Row) => ({ id: s.transactions.insert({ status: "draft", currency: "USD", ...data }).id })),
    getTransactions: vi.fn(scoped(s.transactions)),
    // bank feed
    getBankTransactions: vi.fn(async (f: Record<string, any> = {}) =>
      s.bankTransactions.filter((t) =>
        (!f.categorizationStatus || t.categorizationStatus === f.categorizationStatus) &&
        (!f.status || t.status === f.status) &&
        (!f.accountId || t.accountId === f.accountId))),
    getBankTransactionByExternalId: vi.fn(async (externalId: string) => s.bankTransactions.find((t) => t.externalId === externalId)),
    createBankTransaction: vi.fn(async (data: Row) => ({ id: s.bankTransactions.insert({ categorizationStatus: "uncategorized", source: "mercury", reconciliationStatus: "unreconciled", matchedPaymentId: null, reconciledAt: null, reconciledBy: null, notes: null, ...data }).id })),
    updateBankTransaction: vi.fn(async (id: number, data: Row) => { s.bankTransactions.update(id, data); }),
    // bank-to-payment reconciliation (mirrors the db.ts helpers, incl. the unique matchedPaymentId index)
    getBankTransactionById: vi.fn(async (id: number) => s.bankTransactions.get(id)),
    getUnreconciledBankTransactions: vi.fn(async (f: Record<string, any> = {}) => {
      if (f.companyIds && f.companyIds.length === 0) return [];
      return s.bankTransactions
        .filter((t) =>
          ["unreconciled", "suggested", undefined, null].includes(t.reconciliationStatus) &&
          (!f.companyIds || f.companyIds.includes(t.companyId)) &&
          (!f.bankTransactionId || t.id === f.bankTransactionId))
        .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id)
        .slice(0, f.limit ?? 500);
    }),
    getPaymentMatchCandidates: vi.fn(async (p: { amount: number; direction: string; from: Date; to: Date; companyIds?: number[]; excludeBankTransactionId?: number }) => {
      if (p.companyIds && p.companyIds.length === 0) return [];
      const taken = new Set(s.bankTransactions.filter((t) => t.matchedPaymentId != null && t.id !== p.excludeBankTransactionId).map((t) => t.matchedPaymentId));
      return s.payments
        .filter((x) =>
          x.type === p.direction && x.amount === Math.abs(p.amount).toFixed(2) &&
          x.paymentDate >= p.from && x.paymentDate <= p.to &&
          ["pending", "completed"].includes(x.status) &&
          (!p.companyIds || p.companyIds.includes(x.companyId)) &&
          !taken.has(x.id))
        .map((x) => ({ ...x, vendorName: s.vendors.get(x.vendorId)?.name ?? null, customerName: null }));
    }),
    getBankTransactionsMatchedToPayment: vi.fn(async (paymentId: number) => s.bankTransactions.filter((t) => t.matchedPaymentId === paymentId)),
    setBankTransactionReconciliation: vi.fn(async (id: number, d: { matchedPaymentId: number | null; status: string; userId: number | null; notes?: string | null }) => {
      const matchedPaymentId = d.status === "reconciled" ? d.matchedPaymentId : null;
      if (matchedPaymentId != null && s.bankTransactions.find((t) => t.id !== id && t.matchedPaymentId === matchedPaymentId)) {
        throw Object.assign(new Error("Duplicate entry for key 'uq_bank_transactions_matched_payment'"), { code: "ER_DUP_ENTRY", errno: 1062 });
      }
      const closed = d.status === "reconciled" || d.status === "excluded";
      s.bankTransactions.update(id, {
        matchedPaymentId, reconciliationStatus: d.status,
        reconciledAt: closed ? new Date() : null, reconciledBy: closed ? d.userId : null,
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      });
    }),
    getBankReconciliationSummary: vi.fn(async (f: { companyIds?: number[] } = {}) => {
      const groups = new Map<string, { status: string; type: string; count: number; total: string }>();
      for (const t of s.bankTransactions.filter((t) => !f.companyIds || f.companyIds.includes(t.companyId))) {
        const key = `${t.reconciliationStatus}|${t.type}`;
        const g = groups.get(key) ?? { status: t.reconciliationStatus, type: t.type, count: 0, total: "0" };
        g.count += 1;
        g.total = (Number(g.total) + Number(t.amount)).toFixed(2);
        groups.set(key, g);
      }
      return [...groups.values()];
    }),
    // R&D tax credit
    createRdTaxCreditStudy: vi.fn(async (data: Row) => { const row = s.rdStudies.insert({ status: "draft", ...data }); return { id: row.id, ...data }; }),
    createRdProject: vi.fn(async (data: Row) => { const row = s.rdProjects.insert(data); return { id: row.id, ...data }; }),
    getRdProjectById: vi.fn(async (id: number) => s.rdProjects.get(id) ?? null),
    createRdExpense: vi.fn(async (data: Row) => { const row = s.rdExpenses.insert({ rdPercentage: "100", contractResearchRate: "65", ...data }); return { id: row.id, ...data }; }),
    getRdExpenseById: vi.fn(async (id: number) => s.rdExpenses.get(id)),
    updateRdExpense: vi.fn(async (id: number, data: Row) => { s.rdExpenses.update(id, data); return { id }; }),
    getRdExpensesByStudy: vi.fn(async (studyId: number) => s.rdExpenses.filter((e) => e.studyId === studyId)),
    getRdExpensesByProject: vi.fn(async (projectId: number) => s.rdExpenses.filter((e) => e.projectId === projectId)),
  };
});

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../documentImportService", () => ({ parseUploadedDocument: vi.fn() }));
vi.mock("../mercuryService", () => ({
  isMercuryConfigured: vi.fn(() => false),
  getMercuryAccounts: vi.fn(async () => ({ accounts: [], configured: false })),
  getMercuryTransactions: vi.fn(async () => ({ transactions: [], configured: false })),
  getMercuryTransactionDetail: vi.fn(),
}));

import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import * as mercury from "../mercuryService";
import { appRouter } from "../routers";
import { workflowProcessors } from "../workflowProcessors";
import { ctxFor } from "./_harness";

// ---------------------------------------------------------------------------
// Actors and helpers
// ---------------------------------------------------------------------------
// Finance and ops sit inside entity 1 (regionScope "entity"); admin is global.
const admin = appRouter.createCaller(ctxFor("admin", { id: 1 }));
const finance = appRouter.createCaller(ctxFor("finance", { id: 2, regionScope: "entity" }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 3, regionScope: "entity" }));
const sales = appRouter.createCaller(ctxFor("sales", { id: 4, regionScope: "entity" }));

const DAY = 86400000;
const today = new Date(); today.setHours(0, 0, 0, 0);
const tenDaysAgo = new Date(today.getTime() - 10 * DAY);

function fakeEngine() {
  const engine = {
    recordStep: vi.fn(async (_ctx: unknown, _n: number, _name: string, _type: string, fn: () => Promise<any>) => fn()),
    getDb: vi.fn(() => { throw new Error("AP processors must not touch the drizzle handle"); }),
    handleException: vi.fn(),
    requestApproval: vi.fn(async () => ({ approvalId: 900, autoApproved: false })),
  };
  return engine as unknown as WorkflowEngine & typeof engine;
}
function wfContext(config: Record<string, any> = {}): WorkflowContext {
  return { workflowId: 1, runId: 10, config, inputData: {}, stepResults: new Map(), decisions: [], exceptions: [] };
}
const auditCalls = () => vi.mocked(db.createAuditLog).mock.calls.map((c) => c[0]);

// Ids handed from one step to the next.
const ids = { apAccount: 0, cashAccount: 0, billA: 0, paymentA: 0, billB: 0, billC: 0, billD: 0, txn: 0, bankLine: 0, dupLine: 0, study: 0, project: 0, expense0: 0, expense100: 0, kpi: 0 };

describe("finance flow", () => {
  beforeAll(() => vi.mocked(db.createAuditLog).mockClear());

  // -------------------------------------------------------------------------
  it("1. admin sets up the chart of accounts and reads it back in code order", async () => {
    const created = await Promise.all([
      admin.accounts.create({ code: "2000", name: "Accounts Payable", type: "liability", companyId: 1, subtype: "current_liability" }),
      admin.accounts.create({ code: "1100", name: "Accounts Receivable", type: "asset", companyId: 1 }),
      admin.accounts.create({ code: "1000", name: "Operating Cash", type: "asset", companyId: 1, subtype: "bank" }),
      admin.accounts.create({ code: "5000", name: "Raw Materials Expense", type: "expense", companyId: 1 }),
      admin.accounts.create({ code: "4000", name: "Product Revenue", type: "revenue", companyId: 1 }),
    ]);
    expect(created.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    ids.apAccount = created[0].id;
    ids.cashAccount = created[2].id;

    const list = await finance.accounts.list({ companyId: 1 });
    expect(list.map((a) => [a.code, a.name, a.type, a.balance])).toEqual([
      ["1000", "Operating Cash", "asset", "0"],
      ["1100", "Accounts Receivable", "asset", "0"],
      ["2000", "Accounts Payable", "liability", "0"],
      ["4000", "Product Revenue", "revenue", "0"],
      ["5000", "Raw Materials Expense", "expense", "0"],
    ]);
    expect(await finance.accounts.get({ id: ids.cashAccount })).toMatchObject({ code: "1000", isActive: true, currency: "USD" });
    expect(auditCalls().filter((a) => a.entityType === "account" && a.action === "create")).toHaveLength(5);
  });

  // -------------------------------------------------------------------------
  it("2a. ops keys in a vendor bill with line items; finance sees it in the list and the aging", async () => {
    const bill = await ops.bills.create({
      vendorId: 4,
      billNumber: "ACME-1001",
      purchaseOrderId: 100,
      billDate: new Date(today.getTime() - 40 * DAY),
      dueDate: tenDaysAgo,
      subtotal: "1200.00",
      totalAmount: "1200.00",
      paymentTerms: "Net 30",
      lineItems: [
        { description: "Organic flour 25kg", sku: "FLR-25", quantity: 100, unit: "bag", unitPrice: 10, totalPrice: 1000 },
        { description: "Sea salt 5kg", sku: "SLT-5", quantity: 20, unit: "bag", unitPrice: 10, totalPrice: 200 },
      ],
    });
    expect(bill).toMatchObject({
      billNumber: "ACME-1001", companyId: 1, vendorId: 4, vendorName: "Acme Mills", poNumber: "PO-100",
      status: "draft", matchStatus: "unmatched", sourceType: "manual", totalAmount: "1200.00", amountPaid: "0.00", createdBy: 3,
    });
    expect(bill!.lineItems).toHaveLength(2);
    ids.billA = bill!.id;

    const list = await finance.bills.list();
    expect(db.getBills).toHaveBeenLastCalledWith(expect.objectContaining({ companyIds: [1] }));
    expect(list.map((b) => b.billNumber)).toEqual(["ACME-1001"]);

    const detail = await finance.bills.get({ id: ids.billA });
    expect(detail.outstanding).toBe(1200);

    // Entity-scoped finance user → single-entity aging summary for company 1; 10 days overdue lands in 1-30.
    const aging = await finance.bills.aging();
    expect(db.getBillsAgingSummary).toHaveBeenCalledWith(1);
    expect(aging).toMatchObject({ current: 0, days1to30: 1200, days31to60: 0, totalOutstanding: 1200, billCount: 1, overdueCount: 1 });

    expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 3, action: "create", entityType: "bill", entityId: ids.billA, entityName: "ACME-1001", newValues: { vendorId: 4, totalAmount: "1200.00" } }));
  });

  it("2b. the invoice-matching workflow matches the bill to PO-100 within tolerance and queues it for approval", async () => {
    const engine = fakeEngine();
    const result = await workflowProcessors.invoiceMatching.execute(engine, wfContext({ matchTolerancePercent: 2 }));

    expect(engine.getDb).not.toHaveBeenCalled();
    expect(engine.handleException).not.toHaveBeenCalled();
    // 1200 vs PO 1190 → $10 variance = 0.84%, inside the 2% tolerance.
    expect(result).toMatchObject({ success: true, status: "completed", itemsProcessed: 1, itemsSucceeded: 1, itemsFailed: 0, totalValue: 1200 });
    expect(result.outputData.matched).toEqual([{ billId: ids.billA, poId: 100, billAmount: 1200, poAmount: 1190, variance: 10, previousStatus: "draft" }]);

    const bill = await finance.bills.get({ id: ids.billA });
    expect(bill).toMatchObject({ matchStatus: "matched", purchaseOrderId: 100, status: "pending_approval" });
  });

  it("2c. the AP aging report lists the unpaid bill before payment, aged as of the report's end date", async () => {
    // The client sends the year to date; aging is as of endDate (today) → 10 days past due.
    const report = await finance.financialReports.generate({ reportType: "accounts_payable", startDate: "2026-01-01", endDate: today.toISOString() });
    expect(report.title).toBe("Accounts Payable Aging");
    expect(report.rows[0]).toEqual({ label: "Acme Mills — Bill #ACME-1001", amount: 1200, type: "item", count: 10 });
    expect(report.rows.find((r) => r.label === "1-30 days")?.amount).toBe(1200);
    expect(report.rows.find((r) => r.label === "Total Outstanding")?.amount).toBe(1200);
    expect(report.summary).toBe("1 open bills totalling $1,200 (1 past due)");

    // As of a month later the same bill is 40 days past due and sits in the 31-60 bucket.
    const later = await finance.financialReports.generate({ reportType: "accounts_payable", endDate: new Date(today.getTime() + 30 * DAY).toISOString() });
    expect(later.rows[0]).toEqual({ label: "Acme Mills — Bill #ACME-1001", amount: 1200, type: "item", count: 40 });
    expect(later.rows.find((r) => r.label === "1-30 days")?.amount).toBe(0);
    expect(later.rows.find((r) => r.label === "31-60 days")?.amount).toBe(1200);

    // As of a date before the bill was raised, there is nothing to age.
    const earlier = await finance.financialReports.generate({ reportType: "accounts_payable", endDate: new Date(today.getTime() - 60 * DAY).toISOString() });
    expect(earlier.rows.filter((r) => r.type === "item")).toEqual([]);
    expect(earlier.summary).toBe("0 open bills totalling $0 (0 past due)");
  });

  it("2d. finance approves, then pays the bill: a 'made' payment is recorded, the bill is paid and aging drops to zero", async () => {
    const approved = await finance.bills.approve({ id: ids.billA });
    expect(approved).toMatchObject({ status: "approved", approvedBy: 2, approvedAt: expect.any(Date) });
    expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 2, action: "approve", entityType: "bill", entityId: ids.billA, oldValues: { status: "pending_approval" }, newValues: { status: "approved" } }));

    const paid = await finance.bills.markPaid({ id: ids.billA, paymentMethod: "ach", referenceNumber: "ACH-777", accountId: ids.cashAccount });
    expect(paid).toMatchObject({ status: "paid", amountPaid: "1200.00", paidAt: expect.any(Date) });
    expect(paid!.notes).toMatch(/^Payment #1 of 1200\.00 recorded \d{4}-\d{2}-\d{2}$/);

    const payments = await finance.payments.list({ type: "made" });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      type: "made", companyId: 1, vendorId: 4, purchaseOrderId: 100, accountId: ids.cashAccount,
      amount: "1200.00", currency: "USD", paymentMethod: "ach", referenceNumber: "ACH-777", status: "completed", createdBy: 2,
    });
    expect(payments[0].paymentNumber).toMatch(/^PAY-\d{4}-\d{4}$/);
    expect(payments[0]).not.toHaveProperty("invoiceId");
    ids.paymentA = payments[0].id;

    expect(await finance.bills.aging()).toMatchObject({ totalOutstanding: 0, billCount: 0, overdueCount: 0, days1to30: 0 });
    expect((await finance.bills.get({ id: ids.billA })).outstanding).toBe(0);
    expect(auditCalls()).toContainEqual(expect.objectContaining({ action: "update", entityType: "bill", entityId: ids.billA, newValues: { paymentId: ids.paymentA, amount: 1200, status: "paid" } }));
  });

  it("2e. a paid bill can be neither cancelled, re-approved nor paid again, and leaves the AP report", async () => {
    await expect(finance.bills.cancel({ id: ids.billA, reason: "oops" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Cannot cancel a bill that is already paid" });
    await expect(finance.bills.approve({ id: ids.billA })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finance.bills.markPaid({ id: ids.billA })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Bill ACME-1001 is already paid" });
    expect(await finance.bills.get({ id: ids.billA })).toMatchObject({ status: "paid" });

    const report = await finance.financialReports.generate({ reportType: "accounts_payable" });
    expect(report.rows.filter((r) => r.type === "item")).toEqual([]);
    expect(report.rows.find((r) => r.label === "Total Outstanding")?.amount).toBe(0);
    expect(report.summary).toBe("0 open bills totalling $0 (0 past due)");
  });

  // -------------------------------------------------------------------------
  it("3. the payment-processing workflow auto-pays an approved bill under the threshold and asks approval above it", async () => {
    const b = await ops.bills.create({ vendorId: 4, billNumber: "ACME-1002", billDate: today, dueDate: today, totalAmount: "450.00" });
    const c = await ops.bills.create({ vendorId: 4, billNumber: "ACME-1003", billDate: today, dueDate: today, totalAmount: "4500.00" });
    ids.billB = b!.id; ids.billC = c!.id;
    await finance.bills.approve({ id: ids.billB });
    await finance.bills.approve({ id: ids.billC });

    const engine = fakeEngine();
    const result = await workflowProcessors.paymentProcessing.execute(engine, wfContext({ autoPayThreshold: 1000, paymentMethod: "ach" }));

    expect(engine.getDb).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "awaiting_approval", itemsProcessed: 2, itemsSucceeded: 1, itemsFailed: 0, totalValue: 4950, pendingApprovals: 1 });

    // Bill B ($450): paid automatically through the same payBill path finance used in step 2.
    expect(result.outputData.processed).toEqual([{ billId: ids.billB, amount: 450, paymentId: 2 }]);
    expect(await finance.bills.get({ id: ids.billB })).toMatchObject({ status: "paid", amountPaid: "450.00" });
    const autoPayment = (await finance.payments.list({ type: "made" })).find((p) => p.id === 2);
    expect(autoPayment).toMatchObject({ vendorId: 4, amount: "450.00", paymentMethod: "ach", status: "completed", notes: "Automated payment for bill ACME-1002 (workflow run 10)" });
    expect(autoPayment!.paymentNumber).toMatch(/^PAY-[0-9A-Z]+-\d+$/);

    // Bill C ($4500): a workflow approval is requested and the bill parks as pending_approval, unpaid.
    expect(engine.requestApproval).toHaveBeenCalledTimes(1);
    expect(engine.requestApproval.mock.calls[0].slice(1)).toEqual([
      "payment", "Payment for Bill ACME-1003", "Pay $4500.00 to Acme Mills", 4500, "bill", ids.billC, "Bill approved for payment", 90,
    ]);
    expect(result.outputData.pendingApproval).toEqual([{ billId: ids.billC, amount: 4500, approvalId: 900 }]);
    expect(await finance.bills.get({ id: ids.billC })).toMatchObject({ status: "pending_approval", amountPaid: "0.00", outstanding: 4500 });
    expect(await finance.payments.list({ type: "made" })).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  it("4. the ledger: a journal entry lands under the caller's entity, the list is scoped, and other entities are FORBIDDEN", async () => {
    // transactions.create has no debit/credit lines (single header row per entry).
    const created = await finance.transactions.create({ type: "journal", date: today, description: "Accrue Acme freight", totalAmount: "125.50" });
    ids.txn = created.id;
    const stored = vi.mocked(db.createTransaction).mock.calls[0][0];
    expect(stored).toMatchObject({ companyId: 1, type: "journal", totalAmount: "125.50", description: "Accrue Acme freight", createdBy: 2 });
    expect(stored.transactionNumber).toMatch(/^TXN-\d{4}-\d{4}$/);

    await expect(finance.transactions.create({ companyId: 2, type: "journal", date: today, totalAmount: "1.00" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Cannot create a transaction under an entity outside your access." });

    // A global admin books one for entity 2; the entity-scoped finance user never sees it.
    await admin.transactions.create({ companyId: 2, type: "adjustment", date: today, totalAmount: "999.00" });
    const mine = await finance.transactions.list();
    // The screen list is capped at LEGACY_LIST_CAP rows (10,000).
    expect(db.getTransactions).toHaveBeenLastCalledWith({ mode: "entity", companyIds: [1] }, { type: undefined, status: undefined, limit: 10_000 });
    expect(mine.map((t) => [t.id, t.companyId, t.type, t.totalAmount, t.status])).toEqual([[ids.txn, 1, "journal", "125.50", "draft"]]);
    expect(await finance.transactions.list({ type: "adjustment" })).toEqual([]);
    expect(await admin.transactions.list()).toHaveLength(2);
    expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 2, action: "create", entityType: "transaction", entityId: ids.txn }));
  });

  // -------------------------------------------------------------------------
  it("5a. banking degrades cleanly while Mercury is not connected", async () => {
    expect(await finance.banking.accounts()).toEqual({ accounts: [], configured: false });
    await expect(finance.banking.syncTransactions()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await finance.banking.transactions()).toEqual([]);
  });

  it("5b. once connected, the bank feed imports the ACH that paid the bill (deduped on re-sync), AI categorises it to the vendor and finance confirms it", async () => {
    vi.mocked(mercury.isMercuryConfigured).mockReturnValue(true);
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: true, accounts: [{ id: "acct_ops", name: "Operating", currentBalance: 50000 }] });
    vi.mocked(mercury.getMercuryTransactions).mockResolvedValue({
      configured: true,
      transactions: [{ id: "txn_ach777", amount: -1200, postedDate: today.toISOString(), status: "sent", bankDescription: "ACH ACME MILLS ACH-777", counterpartyName: "Acme Mills" }],
    });

    expect(await finance.banking.accounts()).toMatchObject({ configured: true, accounts: [{ id: "acct_ops", name: "Operating" }] });
    expect(await finance.banking.syncTransactions()).toEqual({ totalImported: 1, totalSkipped: 0, accounts: 1 });
    expect(await finance.banking.syncTransactions()).toEqual({ totalImported: 0, totalSkipped: 1, accounts: 1 });

    const lines = await finance.banking.transactions();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ externalId: "txn_ach777", accountId: "acct_ops", accountName: "Operating", amount: "1200", type: "debit", counterpartyName: "Acme Mills", status: "sent", source: "mercury", categorizationStatus: "uncategorized" });
    ids.bankLine = lines[0].id;

    // The bank debit equals the payment recorded in step 2d.
    const payment = await finance.payments.get({ id: ids.paymentA });
    expect(Number(lines[0].amount)).toBe(Number(payment!.amount));

    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { content: '```json\n[{"index":1,"category":"COGS - Raw Materials","accountCode":"5000","matchedVendor":"Acme","matchedCustomer":null,"confidence":92}]\n```' } }],
    } as any);
    expect(await finance.banking.autoCategorize()).toEqual({ categorized: 1, total: 1 });
    expect(await finance.banking.transactions({ categorizationStatus: "ai_suggested" })).toEqual([
      expect.objectContaining({ id: ids.bankLine, category: "COGS - Raw Materials", accountCode: "5000", aiConfidence: 92, matchedVendorId: 4, matchedCustomerId: null, matchedInvoiceId: null }),
    ]);

    expect(await finance.banking.confirmOne({ id: ids.bankLine })).toEqual({ success: true });
    expect(await finance.banking.transactions({ categorizationStatus: "confirmed" })).toHaveLength(1);
    expect(await finance.banking.transactions({ categorizationStatus: "uncategorized" })).toEqual([]);
    expect(await finance.banking.autoCategorize()).toEqual({ categorized: 0, total: 0 });
  });

  it("5c. reconciliation: the ACH line is matched to the step-2 payment, unmatched, auto-matched back; a duplicate debit cannot take the same payment", async () => {
    const recon = finance.banking.reconciliation;
    const empty = { count: 0, inflow: 0, outflow: 0, total: 0 };
    const open = { count: 1, inflow: 0, outflow: 1200, total: 1200 };

    // The synced line landed under the syncing user's entity, so the entity-scoped finance user sees it.
    expect(state.bankTransactions.get(ids.bankLine)).toMatchObject({ companyId: 1, reconciliationStatus: "unreconciled", matchedPaymentId: null });
    expect(await recon.summary()).toMatchObject({ unreconciled: open, reconciled: empty, all: open });

    // One suggestion: payment A ($1,200 made to Acme Mills, ref ACH-777). Payment B ($450) is a different amount.
    const suggested = await recon.suggest();
    expect(suggested).toHaveLength(1);
    expect(suggested[0]).toMatchObject({ id: ids.bankLine, signedAmount: -1200 });
    expect(suggested[0].suggestions).toHaveLength(1);
    expect(suggested[0].suggestions[0]).toMatchObject({ paymentId: ids.paymentA, confidence: 100 });
    expect(suggested[0].suggestions[0].reasons).toEqual(expect.arrayContaining([
      "Amount matches exactly ($1,200.00)",
      "Reference ACH-777 found in bank description",
      "Vendor name matches (Acme Mills)",
    ]));

    // A payment of the wrong amount is refused before anything is written.
    await expect(recon.match({ bankTransactionId: ids.bankLine, paymentId: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Amount differs: bank $1,200.00 vs payment $450.00" });

    const matched = await recon.match({ bankTransactionId: ids.bankLine, paymentId: ids.paymentA });
    expect(matched).toMatchObject({ id: ids.bankLine, reconciliationStatus: "reconciled", matchedPaymentId: ids.paymentA, reconciledBy: 2, reconciledAt: expect.any(Date) });
    expect(auditCalls()).toContainEqual(expect.objectContaining({
      userId: 2, action: "update", entityType: "bank_transaction", entityId: ids.bankLine,
      newValues: { reconciliationStatus: "reconciled", matchedPaymentId: ids.paymentA },
    }));
    expect(await recon.summary()).toMatchObject({ unreconciled: empty, reconciled: open });
    expect(await recon.suggest()).toEqual([]);

    // Unmatch frees the line and the payment again.
    expect(await recon.unmatch({ bankTransactionId: ids.bankLine })).toMatchObject({ reconciliationStatus: "unreconciled", matchedPaymentId: null, reconciledBy: null });
    expect(await recon.summary()).toMatchObject({ unreconciled: open, reconciled: empty });

    // Auto-match takes it back: exactly one suggestion, confidence 100 ≥ 90.
    expect(await recon.autoMatch()).toEqual({
      scanned: 1, reconciled: 1, needsReview: 0, noCandidates: 0, minConfidence: 90,
      matches: [{ bankTransactionId: ids.bankLine, paymentId: ids.paymentA, confidence: 100 }],
    });
    expect(state.bankTransactions.get(ids.bankLine)).toMatchObject({ reconciliationStatus: "reconciled", matchedPaymentId: ids.paymentA });

    // Mercury then posts a second, identical $1,200 debit (a duplicate the bank later reverses).
    vi.mocked(mercury.getMercuryTransactions).mockResolvedValue({
      configured: true,
      transactions: [
        { id: "txn_ach777", amount: -1200, postedDate: today.toISOString(), status: "sent", bankDescription: "ACH ACME MILLS ACH-777", counterpartyName: "Acme Mills" },
        { id: "txn_ach777_dup", amount: -1200, postedDate: today.toISOString(), status: "sent", bankDescription: "ACH ACME MILLS ACH-777", counterpartyName: "Acme Mills" },
      ],
    });
    expect(await finance.banking.syncTransactions()).toEqual({ totalImported: 1, totalSkipped: 1, accounts: 1 });
    ids.dupLine = state.bankTransactions.find((t) => t.externalId === "txn_ach777_dup")!.id;

    // Payment A is taken, so the duplicate gets no suggestion, and matching it by hand is a CONFLICT.
    const dup = await recon.suggest({ bankTransactionId: ids.dupLine });
    expect(dup.map((l) => [l.id, l.suggestions.length])).toEqual([[ids.dupLine, 0]]);
    await expect(recon.match({ bankTransactionId: ids.dupLine, paymentId: ids.paymentA }))
      .rejects.toMatchObject({ code: "CONFLICT", message: `Payment ${state.payments.get(ids.paymentA)!.paymentNumber} is already matched to bank line #${ids.bankLine}` });
    expect(state.bankTransactions.get(ids.dupLine)).toMatchObject({ reconciliationStatus: "unreconciled", matchedPaymentId: null });

    // Auto-match leaves it alone (no candidate), and finance excludes it with a reason.
    expect(await recon.autoMatch()).toMatchObject({ scanned: 1, reconciled: 0, noCandidates: 1 });
    expect(await recon.exclude({ bankTransactionId: ids.dupLine, reason: "Duplicate debit, reversed by bank" }))
      .toMatchObject({ reconciliationStatus: "excluded", matchedPaymentId: null, notes: "Excluded from reconciliation: Duplicate debit, reversed by bank" });
    expect(await recon.summary()).toMatchObject({
      unreconciled: empty,
      reconciled: open,
      excluded: open,
      all: { count: 2, inflow: 0, outflow: 2400, total: 2400 },
    });

    // Reconciliation is finance-only, and another entity's finance user sees none of it.
    await expect(ops.banking.reconciliation.summary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sales.banking.reconciliation.match({ bankTransactionId: ids.dupLine, paymentId: ids.paymentA })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const otherEntityFinance = appRouter.createCaller(ctxFor("finance", { id: 9, companyId: 2, regionScope: "entity" }));
    expect((await otherEntityFinance.banking.reconciliation.summary()).all.count).toBe(0);
    await expect(otherEntityFinance.banking.reconciliation.unmatch({ bankTransactionId: ids.bankLine })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.bankTransactions.get(ids.bankLine)).toMatchObject({ reconciliationStatus: "reconciled", matchedPaymentId: ids.paymentA });
  });

  // -------------------------------------------------------------------------
  it("6. P&L and balance sheet reflect the bills and accounts above (a cancelled draft is excluded)", async () => {
    const d = await ops.bills.create({ vendorId: 4, billNumber: "ACME-DUP", billDate: today, totalAmount: "99.00" });
    ids.billD = d!.id;
    const cancelled = await finance.bills.cancel({ id: ids.billD, reason: "duplicate of ACME-1002" });
    expect(cancelled).toMatchObject({ status: "cancelled", notes: "Cancelled: duplicate of ACME-1002" });

    const pl = await finance.financialReports.generate({ reportType: "profit_loss", startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(pl.title).toBe("Profit & Loss Statement");
    expect(pl.rows.filter((r) => r.type === "item").map((r) => [r.label.trim(), r.amount])).toEqual([
      ["Bill #ACME-1001 (Acme Mills)", 1200],
      ["Bill #ACME-1002 (Acme Mills)", 450],
      ["Bill #ACME-1003 (Acme Mills)", 4500],
    ]);
    expect(pl.rows.find((r) => r.label === "Total Revenue")?.amount).toBe(0);
    expect(pl.rows.find((r) => r.label === "Total Expenses")?.amount).toBe(6150);
    expect(pl.rows.find((r) => r.label === "Net Income")).toMatchObject({ amount: -6150, type: "grand_total" });

    const bs = await finance.financialReports.generate({ reportType: "balance_sheet" });
    expect(bs.rows.filter((r) => r.type === "item").map((r) => r.label.trim())).toEqual(["Operating Cash", "Accounts Receivable", "Accounts Payable"]);
    // accounts.create takes no opening balance and nothing posts to the GL, so every balance is the schema default 0.
    expect(bs.rows.find((r) => r.label === "Total Assets")?.amount).toBe(0);
    expect(bs.rows.find((r) => r.label === "Total Liabilities")?.amount).toBe(0);

    const ap = await finance.financialReports.generate({ reportType: "accounts_payable" });
    expect(ap.rows.filter((r) => r.type === "item")).toEqual([{ label: "Acme Mills — Bill #ACME-1003", amount: 4500, type: "item", count: 0 }]);
    expect(ap.rows.find((r) => r.label === "Current")?.amount).toBe(4500);
    expect(ap.summary).toBe("1 open bills totalling $4,500 (0 past due)");
  });

  it("6b. period reports only count rows dated inside startDate..endDate", async () => {
    // ACME-1001 was billed 40 days ago; a 30-day window keeps only the two bills dated today.
    const window = { startDate: new Date(today.getTime() - 30 * DAY).toISOString(), endDate: today.toISOString() };
    const pl = await finance.financialReports.generate({ reportType: "profit_loss", ...window });
    expect(pl.rows.filter((r) => r.type === "item").map((r) => [r.label.trim(), r.amount])).toEqual([
      ["Bill #ACME-1002 (Acme Mills)", 450],
      ["Bill #ACME-1003 (Acme Mills)", 4500],
    ]);
    expect(pl.rows.find((r) => r.label === "Total Expenses")?.amount).toBe(4950);
    expect(pl.rows.find((r) => r.label === "Net Income")?.amount).toBe(-4950);

    const byVendor = await finance.financialReports.generate({ reportType: "expense_by_vendor", ...window });
    expect(byVendor.rows).toEqual([{ label: "Acme Mills", amount: 4950, type: "item", pct: "100.0%" }]);
    expect(byVendor.summary).toBe("1 vendors, total spend $4,950");

    const tax = await finance.financialReports.generate({ reportType: "tax_summary", ...window });
    expect(tax.rows.find((r) => r.label === "Deductible Expenses")?.amount).toBe(4950);

    // Last year: nothing was billed, so every period figure is zero.
    const lastYear = { startDate: "2025-01-01", endDate: "2025-12-31" };
    const empty = await finance.financialReports.generate({ reportType: "profit_loss", ...lastYear });
    expect(empty.rows.filter((r) => r.type === "item")).toEqual([]);
    expect(empty.rows.find((r) => r.label === "Total Expenses")?.amount).toBe(0);
    expect((await finance.financialReports.generate({ reportType: "expense_by_vendor", ...lastYear })).rows).toEqual([]);
    expect((await finance.financialReports.generate({ reportType: "monthly_summary", ...lastYear })).rows.find((r) => r.label === "Total Expenses")?.amount).toBe(0);

    // No range at all is still "everything".
    expect((await finance.financialReports.generate({ reportType: "profit_loss" })).rows.find((r) => r.label === "Total Expenses")?.amount).toBe(6150);
  });

  // -------------------------------------------------------------------------
  it("7. R&D tax credit: a 0% wage line stays at $0 qualified after a notes-only edit (#420)", async () => {
    const study = await finance.rdTaxCredit.createStudy({ companyId: 1, taxYear: 2026, studyName: "FY26 R&D", calculationMethod: "asc" });
    ids.study = study.id;
    const project = await finance.rdTaxCredit.createProject({ studyId: ids.study, projectName: "Shelf-stable formulation", qualifies: true });
    ids.project = project.id;
    await expect(finance.rdTaxCredit.createExpense({ projectId: 999, studyId: ids.study, category: "wages", grossAmount: "1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const zero = await finance.rdTaxCredit.createExpense({ projectId: ids.project, studyId: ids.study, category: "wages", employeeName: "Admin assistant", grossAmount: "60000.00", rdPercentage: "0" });
    const full = await finance.rdTaxCredit.createExpense({ projectId: ids.project, studyId: ids.study, category: "wages", employeeName: "Food scientist", grossAmount: "120000.00", rdPercentage: "100" });
    ids.expense0 = zero.id; ids.expense100 = full.id;
    expect(zero).toMatchObject({ qualifiedAmount: "0.00", rdPercentage: "0" });
    expect(full).toMatchObject({ qualifiedAmount: "120000.00" });

    await expect(finance.rdTaxCredit.updateExpense({ id: ids.expense0, notes: "Reviewed with payroll" })).resolves.toEqual({ success: true });
    expect(db.updateRdExpense).toHaveBeenLastCalledWith(ids.expense0, { notes: "Reviewed with payroll", qualifiedAmount: "0.00" });

    const rows = await finance.rdTaxCredit.listExpenses({ studyId: ids.study });
    expect(rows.map((e) => [e.id, e.rdPercentage, e.grossAmount, e.qualifiedAmount, e.notes ?? null])).toEqual([
      [ids.expense0, "0", "60000.00", "0.00", "Reviewed with payroll"],
      [ids.expense100, "100", "120000.00", "120000.00", null],
    ]);
    await expect(finance.rdTaxCredit.updateExpense({ id: 404, notes: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // -------------------------------------------------------------------------
  it("8. KPI goals: create a target, record an actual and read progress back", async () => {
    const created = await finance.kpiGoals.create({ companyId: 1, category: "Cash", metricName: "AP paid on time", year: 2026, targetValue: "100.00", unit: "%" });
    expect(created).toEqual({ id: 1, success: true });
    ids.kpi = created.id;
    await finance.kpiGoals.create({ companyId: 1, category: "P&L", metricName: "Gross margin", year: 2025, targetValue: "40.00", unit: "%" });

    expect(await finance.kpiGoals.updateActual({ id: ids.kpi, actualValue: "66.67", status: "at_risk", notes: "2 of 3 bills paid on time" })).toEqual({ success: true });

    const goals = await finance.kpiGoals.list({ year: 2026 });
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ id: ids.kpi, category: "Cash", metricName: "AP paid on time", targetValue: "100.00", actualValue: "66.67", status: "at_risk" });
    // No dedicated progress procedure: the dashboards derive it as actual / target.
    expect(Number(goals[0].actualValue) / Number(goals[0].targetValue)).toBeCloseTo(0.6667, 4);
    expect(await finance.kpiGoals.list({ category: "P&L" })).toHaveLength(1);
    expect((await finance.kpiGoals.list()).length).toBe(2);
    expect((await finance.kpiGoals.categories()).sort()).toEqual(["Cash", "P&L"]);
    expect(auditCalls()).toContainEqual(expect.objectContaining({ action: "update", entityType: "kpi_goal", entityId: ids.kpi, newValues: { actualValue: "66.67" } }));
  });

  // -------------------------------------------------------------------------
  it("9. role gating: sales cannot pay or read bills; ops can create but not approve, pay or cancel", async () => {
    const before = vi.mocked(db.createPayment).mock.calls.length;
    await expect(sales.bills.markPaid({ id: ids.billC })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Finance access required" });
    await expect(sales.bills.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sales.bills.create({ vendorId: 4, billDate: today, totalAmount: "1.00" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Finance or operations access required" });
    await expect(sales.accounts.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

    // A bill cannot be born approved or paid: the create payload only accepts draft / pending_approval,
    // so the finance-only approve gate cannot be sidestepped by anyone who may key in bills.
    const billsBefore = state.bills.all().length;
    for (const status of ["approved", "paid", "scheduled", "partially_paid"] as const) {
      await expect(ops.bills.create({ vendorId: 4, billDate: today, totalAmount: "1.00", status: status as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(finance.bills.create({ vendorId: 4, billDate: today, totalAmount: "1.00", status: status as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(state.bills.all()).toHaveLength(billsBefore);
    const pending = await ops.bills.create({ vendorId: 4, billNumber: "ACME-1004", billDate: today, totalAmount: "1.00", status: "pending_approval" });
    expect(pending).toMatchObject({ status: "pending_approval", approvedBy: null });

    await expect(ops.bills.approve({ id: ids.billC })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Finance access required" });
    await expect(ops.bills.markPaid({ id: ids.billC })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ops.bills.cancel({ id: ids.billC })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ops.bills.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ops.transactions.create({ type: "journal", date: today, totalAmount: "1.00" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(vi.mocked(db.createPayment).mock.calls.length).toBe(before);
    expect(await finance.bills.get({ id: ids.billC })).toMatchObject({ status: "pending_approval", amountPaid: "0.00" });

    // A finance user from another entity cannot even see entity 1's bill.
    const otherEntityFinance = appRouter.createCaller(ctxFor("finance", { id: 9, companyId: 2, regionScope: "entity" }));
    await expect(otherEntityFinance.bills.get({ id: ids.billC })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await otherEntityFinance.bills.list()).toEqual([]);
  });
});
