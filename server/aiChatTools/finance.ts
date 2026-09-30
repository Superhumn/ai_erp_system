/**
 * manage_finance — AI Assistant chat tool for Finance (bills, bank, reports).
 *
 * Reads: any internal role. Writes (create_bill, approve_bill): admin / exec /
 * finance, mirroring financeProcedure. Bills are only ever created in draft;
 * marking paid stays in the Finance UI (bills.markPaid). Nothing here moves
 * money or sends email.
 */
import * as db from "../db";
import { billOutstanding, billDaysOverdue } from "../billsLogic";
import { parseReportRange, inReportRange } from "../financialReportRange";
import { summarizeReconciliation } from "../bankReconciliation";
import {
  type ChatToolModule,
  type ChatToolParams,
  type AIAgentContext,
  FINANCE_ROLES,
  ChatToolError,
  defineTool,
  requireInternal,
  requireRole,
  companyIdOf,
  companyIdsOf,
  inCompany,
  filterByCompany,
  notFound,
  requireNumber,
  optionalNumber,
  optionalString,
  optionalDate,
  toNumber,
  daysFromNow,
  makeNumber,
  unknownAction,
} from "./types";

export const FINANCE_ACTIONS = [
  "list_bills",
  "create_bill",
  "approve_bill",
  "list_bank_transactions",
  "reconciliation_summary",
  "financial_summary",
] as const;

const BILL_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "partially_paid", "paid", "overdue", "cancelled", "disputed"] as const;
type BillStatus = (typeof BILL_STATUSES)[number];

export const financeTool = defineTool(
  "manage_finance",
  "Finance module: list or draft vendor bills, approve a drafted bill, summarise bank transactions and reconciliation status, or produce a financial summary (revenue, expenses, AR/AP, balances) for a period. Never pays bills or moves money.",
  FINANCE_ACTIONS,
  {
    billId: { type: "number", description: "Bill ID (approve_bill)" },
    vendorId: { type: "number", description: "Vendor ID (create_bill, list_bills filter)" },
    vendorName: { type: "string", description: "Vendor name when the ID is unknown (create_bill)" },
    amount: { type: "number", description: "Bill total (create_bill)" },
    dueDate: { type: "string", description: "ISO date the bill is due (create_bill)" },
    description: { type: "string", description: "What the bill is for (create_bill)" },
    status: { type: "string", enum: [...BILL_STATUSES], description: "Bill status filter (list_bills)" },
    dueWithinDays: { type: "number", description: "Only bills due within N days (list_bills)" },
    startDate: { type: "string", description: "ISO start of the period (list_bank_transactions, financial_summary)" },
    endDate: { type: "string", description: "ISO end of the period (list_bank_transactions, financial_summary)" },
    limit: { type: "number", description: "Max rows to return (default 25)" },
  },
);

function compactBill(b: Awaited<ReturnType<typeof db.getBills>>[number], asOf: Date) {
  return {
    id: b.id,
    billNumber: b.billNumber,
    vendorId: b.vendorId,
    vendorName: b.vendorName ?? null,
    status: b.status,
    totalAmount: toNumber(b.totalAmount),
    amountPaid: toNumber(b.amountPaid),
    outstanding: billOutstanding(b),
    billDate: b.billDate,
    dueDate: b.dueDate,
    daysOverdue: billDaysOverdue(b, asOf),
    poNumber: b.poNumber ?? null,
  };
}

async function listBills(params: ChatToolParams, ctx: AIAgentContext) {
  const now = new Date();
  const dueWithinDays = optionalNumber(params.dueWithinDays);
  const status = optionalString(params.status) as BillStatus | undefined;
  if (status && !BILL_STATUSES.includes(status)) throw new ChatToolError(`Unknown bill status: ${status}`);
  const rows = await db.getBills({
    companyIds: companyIdsOf(ctx),
    status,
    vendorId: optionalNumber(params.vendorId),
    dueBefore: dueWithinDays != null ? daysFromNow(dueWithinDays, now) : undefined,
    limit: optionalNumber(params.limit) ?? 25,
  });
  const bills = rows.map((b) => compactBill(b, now));
  return {
    bills,
    total: bills.length,
    totalOutstanding: bills.reduce((s, b) => s + b.outstanding, 0),
  };
}

async function resolveVendor(params: ChatToolParams, ctx: AIAgentContext) {
  const vendorId = optionalNumber(params.vendorId);
  const vendorName = optionalString(params.vendorName);
  if (vendorId != null) {
    const v = await db.getVendorById(vendorId);
    if (!v || !inCompany(ctx, v.companyId)) return notFound("Vendor");
    return v;
  }
  if (vendorName) {
    const v = await db.getVendorByName(vendorName, companyIdOf(ctx));
    if (!v || !inCompany(ctx, v.companyId)) return notFound(`Vendor "${vendorName}"`);
    return v;
  }
  throw new ChatToolError("vendorId or vendorName is required");
}

async function createBill(params: ChatToolParams, ctx: AIAgentContext) {
  requireRole(ctx, FINANCE_ROLES, "create bill");
  const amount = requireNumber(params.amount, "amount");
  if (amount <= 0) throw new ChatToolError("amount must be greater than zero");
  const vendor = await resolveVendor(params, ctx);
  const dueDate = optionalDate(params.dueDate, "dueDate");
  const description = optionalString(params.description);
  const billNumber = makeNumber("BILL");
  const companyId = companyIdOf(ctx);

  // Same insert shape as bills.create, pinned to draft: approval and payment
  // are separate finance-only steps, never reachable from a create.
  const { id } = await db.createBill({
    companyId,
    billNumber,
    vendorId: vendor.id,
    sourceType: "ai_draft",
    billDate: new Date(),
    dueDate,
    subtotal: amount.toFixed(2),
    totalAmount: amount.toFixed(2),
    status: "draft",
    notes: description,
    createdBy: ctx.userId,
  });
  await db.createAuditLog({
    companyId,
    userId: ctx.userId,
    action: "create",
    entityType: "bill",
    entityId: id,
    entityName: billNumber,
    newValues: { vendorId: vendor.id, totalAmount: amount, via: "ai_chat" },
  });
  return { created: true, billId: id, billNumber, vendorName: vendor.name, totalAmount: amount, status: "draft", dueDate: dueDate ?? null };
}

async function approveBill(params: ChatToolParams, ctx: AIAgentContext) {
  requireRole(ctx, FINANCE_ROLES, "approve bill");
  const billId = requireNumber(params.billId, "billId");
  const bill = await db.getBillById(billId);
  if (!bill || !inCompany(ctx, bill.companyId)) return notFound("Bill");
  if (bill.status !== "draft" && bill.status !== "pending_approval") {
    throw new ChatToolError(`Bill ${bill.billNumber} is ${bill.status}; only draft or pending_approval bills can be approved`);
  }
  // Mirrors bills.approve: status flips to approved, nothing is paid.
  await db.updateBill(billId, { status: "approved", approvedBy: ctx.userId, approvedAt: new Date() });
  await db.createAuditLog({
    companyId: bill.companyId ?? companyIdOf(ctx),
    userId: ctx.userId,
    action: "approve",
    entityType: "bill",
    entityId: billId,
    entityName: bill.billNumber,
    oldValues: { status: bill.status },
    newValues: { status: "approved", via: "ai_chat" },
  });
  return { approved: true, billId, billNumber: bill.billNumber, status: "approved", outstanding: billOutstanding(bill) };
}

async function listBankTransactions(params: ChatToolParams, ctx: AIAgentContext) {
  // Filter in MySQL, not in memory: the helper takes the company predicate.
  const rows = filterByCompany(ctx, await db.getBankTransactions({
    startDate: optionalString(params.startDate),
    endDate: optionalString(params.endDate),
    status: optionalString(params.status),
    companyId: ctx.companyId,
  }));
  const limit = optionalNumber(params.limit) ?? 25;
  let inflow = 0;
  let outflow = 0;
  for (const t of rows) {
    const amt = toNumber(t.amount);
    if (amt >= 0) inflow += amt; else outflow += -amt;
  }
  return {
    count: rows.length,
    inflow,
    outflow,
    net: inflow - outflow,
    byCategorization: rows.reduce<Record<string, number>>((acc, t) => {
      const k = t.categorizationStatus ?? "unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    transactions: rows.slice(0, limit).map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: toNumber(t.amount),
      status: t.status,
      categorizationStatus: t.categorizationStatus,
      reconciliationStatus: t.reconciliationStatus,
    })),
  };
}

async function reconciliationSummary(ctx: AIAgentContext) {
  return summarizeReconciliation(await db.getBankReconciliationSummary({ companyIds: companyIdsOf(ctx) }));
}

async function financialSummary(params: ChatToolParams, ctx: AIAgentContext) {
  const range = parseReportRange(optionalString(params.startDate), optionalString(params.endDate));
  const companyId = companyIdOf(ctx);
  const [invoicesAll, billsAll, accounts] = await Promise.all([
    db.getInvoices(undefined, { companyId }),
    db.getBills({ companyIds: companyIdsOf(ctx) }),
    db.getAccounts(companyId),
  ]);

  // Same period rules as financialReports.generate: invoices by issue date,
  // bills by bill date, cancelled bills are not expenses.
  const invoices = invoicesAll.filter((i) => inReportRange(range, i.issueDate ?? i.createdAt));
  const bills = billsAll.filter((b) => inReportRange(range, b.billDate ?? b.createdAt));
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const liveBills = bills.filter((b) => b.status !== "cancelled");
  const totalRevenue = paidInvoices.reduce((s, i) => s + toNumber(i.totalAmount), 0);
  const totalExpenses = liveBills.reduce((s, b) => s + toNumber(b.totalAmount), 0);

  const openInvoices = invoicesAll.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const openBills = billsAll.filter((b) => b.status !== "paid" && b.status !== "cancelled");
  const sumBalance = (type: string) => accounts.filter((a) => a.type === type).reduce((s, a) => s + toNumber(a.balance), 0);

  return {
    period: { start: range.start ?? null, end: range.end ?? null, asOf: range.asOf },
    profitAndLoss: {
      revenue: totalRevenue,
      expenses: totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      paidInvoices: paidInvoices.length,
      bills: liveBills.length,
    },
    receivables: {
      openInvoices: openInvoices.length,
      // Same rule as dataRoomLiveFinancials: a partly paid invoice only owes the remainder.
      outstanding: openInvoices.reduce((s, i) => s + Math.max(0, toNumber(i.totalAmount) - toNumber(i.paidAmount)), 0),
    },
    payables: {
      openBills: openBills.length,
      outstanding: openBills.reduce((s, b) => s + billOutstanding(b), 0),
      overdue: openBills.filter((b) => billDaysOverdue(b, range.asOf) > 0).length,
    },
    balances: {
      assets: sumBalance("asset"),
      liabilities: sumBalance("liability"),
      equity: sumBalance("equity"),
    },
  };
}

export async function executeFinance(name: string, params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  if (name !== "manage_finance") throw new ChatToolError(`Unknown tool: ${name}`);
  requireInternal(ctx, "use finance tools");
  // Every read here mirrors a financeProcedure route (bills.list, banking.*,
  // financialReports.generate), so the chat holds the same line.
  requireRole(ctx, FINANCE_ROLES, `finance: ${String(params.action ?? "")}`);
  switch (params.action) {
    case "list_bills": return listBills(params, ctx);
    case "create_bill": return createBill(params, ctx);
    case "approve_bill": return approveBill(params, ctx);
    case "list_bank_transactions": return listBankTransactions(params, ctx);
    case "reconciliation_summary": return reconciliationSummary(ctx);
    case "financial_summary": return financialSummary(params, ctx);
    default: return unknownAction("manage_finance", params.action);
  }
}

export const financeModule: ChatToolModule = {
  name: "finance",
  tools: [financeTool],
  execute: executeFinance,
};
