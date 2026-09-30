import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getBills: vi.fn(),
  getBillById: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
  getVendorById: vi.fn(),
  getVendorByName: vi.fn(),
  getBankTransactions: vi.fn(),
  getBankReconciliationSummary: vi.fn(),
  getInvoices: vi.fn(),
  getAccounts: vi.fn(),
  createAuditLog: vi.fn(),
}));

import * as db from "../db";
import { executeFinance, financeTool, financeModule } from "./finance";
import type { AIAgentContext } from "../aiAgentService";

const m = vi.mocked(db);
const ctx = (userRole: string, companyId: number | undefined = 1): AIAgentContext => ({ userId: 10, userName: "Jade", userRole, companyId });
const run = (params: Record<string, unknown>, c: AIAgentContext) => executeFinance("manage_finance", params, c);

const bill = (patch: Record<string, unknown> = {}) => ({
  id: 5, companyId: 1, billNumber: "BILL-2609-0001", vendorId: 3, vendorName: "Acme", poNumber: null,
  status: "draft", totalAmount: "120.00", amountPaid: "0", billDate: new Date("2026-09-01"), dueDate: new Date("2026-10-01"),
  createdAt: new Date("2026-09-01"), ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getBills.mockResolvedValue([] as never);
  m.createAuditLog.mockResolvedValue(undefined as never);
});

describe("manage_finance tool definition", () => {
  it("exposes one tool with an action enum", () => {
    expect(financeModule.tools).toEqual([financeTool]);
    expect(financeTool.function.name).toBe("manage_finance");
    const props = financeTool.function.parameters?.properties as Record<string, { enum?: string[] }>;
    expect(props.action.enum).toContain("create_bill");
    expect(props.action.enum).toContain("financial_summary");
  });
});

describe("list_bills", () => {
  it("filters by the caller's company and summarises outstanding", async () => {
    m.getBills.mockResolvedValue([bill(), bill({ id: 6, amountPaid: "20.00", status: "approved" })] as never);
    const res = await run({ action: "list_bills", status: "draft", dueWithinDays: 7 }, ctx("finance")) as { bills: unknown[]; totalOutstanding: number };
    const args = m.getBills.mock.calls[0][0]!;
    expect(args.companyIds).toEqual([1]);
    expect(args.status).toBe("draft");
    expect(args.dueBefore).toBeInstanceOf(Date);
    expect(res.bills).toHaveLength(2);
    expect(res.totalOutstanding).toBe(220);
  });

  it("leaves companyIds undefined for a global caller", async () => {
    await run({ action: "list_bills" }, { userId: 10, userName: "Jade", userRole: "admin" });
    expect(m.getBills.mock.calls[0][0]!.companyIds).toBeUndefined();
  });

  it("refuses external roles even for reads", async () => {
    await expect(run({ action: "list_bills" }, ctx("vendor"))).rejects.toThrow(/Not authorized/);
    expect(m.getBills).not.toHaveBeenCalled();
  });
});

describe("create_bill", () => {
  it("creates a draft bill stamped with companyId and createdBy", async () => {
    m.getVendorByName.mockResolvedValue({ id: 3, name: "Acme", companyId: 1 } as never);
    m.createBill.mockResolvedValue({ id: 42 } as never);
    const res = await run({ action: "create_bill", vendorName: "Acme", amount: 99.5, dueDate: "2026-10-15", description: "Labels" }, ctx("finance")) as { billId: number; status: string };
    expect(res).toMatchObject({ created: true, billId: 42, status: "draft", vendorName: "Acme" });
    expect(m.getVendorByName).toHaveBeenCalledWith("Acme", 1);
    const data = m.createBill.mock.calls[0][0];
    expect(data).toMatchObject({ companyId: 1, vendorId: 3, status: "draft", sourceType: "ai_draft", totalAmount: "99.50", createdBy: 10, notes: "Labels" });
    expect(data.dueDate).toEqual(new Date("2026-10-15"));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, action: "create", entityType: "bill", entityId: 42, companyId: 1 }));
  });

  it("refuses ops (finance writes are admin/exec/finance)", async () => {
    await expect(run({ action: "create_bill", vendorId: 3, amount: 10 }, ctx("ops"))).rejects.toThrow(/requires one of these roles/);
    expect(m.createBill).not.toHaveBeenCalled();
  });

  it("treats a vendor outside the company as not found", async () => {
    m.getVendorById.mockResolvedValue({ id: 3, name: "Other", companyId: 2 } as never);
    await expect(run({ action: "create_bill", vendorId: 3, amount: 10 }, ctx("admin"))).rejects.toThrow(/Vendor not found/);
  });
});

describe("approve_bill", () => {
  it("flips a draft to approved with the approver stamped", async () => {
    m.getBillById.mockResolvedValue(bill() as never);
    m.updateBill.mockResolvedValue(bill({ status: "approved" }) as never);
    const res = await run({ action: "approve_bill", billId: 5 }, ctx("exec")) as { approved: boolean };
    expect(res.approved).toBe(true);
    expect(m.updateBill).toHaveBeenCalledWith(5, expect.objectContaining({ status: "approved", approvedBy: 10 }));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "approve", entityId: 5 }));
  });

  it("never approves an already paid bill", async () => {
    m.getBillById.mockResolvedValue(bill({ status: "paid" }) as never);
    await expect(run({ action: "approve_bill", billId: 5 }, ctx("finance"))).rejects.toThrow(/only draft or pending_approval/);
    expect(m.updateBill).not.toHaveBeenCalled();
  });

  it("refuses a bill from another company", async () => {
    m.getBillById.mockResolvedValue(bill({ companyId: 2 }) as never);
    await expect(run({ action: "approve_bill", billId: 5 }, ctx("finance"))).rejects.toThrow(/Bill not found/);
  });

  it("refuses sales", async () => {
    await expect(run({ action: "approve_bill", billId: 5 }, ctx("sales"))).rejects.toThrow(/Not authorized/);
  });
});

describe("list_bank_transactions", () => {
  it("summarises inflow/outflow for the caller's company only", async () => {
    m.getBankTransactions.mockResolvedValue([
      { id: 1, companyId: 1, amount: "100.00", date: new Date(), description: "Stripe payout", status: "posted", categorizationStatus: "confirmed", reconciliationStatus: "reconciled" },
      { id: 2, companyId: 1, amount: "-40.00", date: new Date(), description: "AWS", status: "posted", categorizationStatus: "uncategorized", reconciliationStatus: "unreconciled" },
      { id: 3, companyId: 2, amount: "999.00", date: new Date(), description: "other co", status: "posted", categorizationStatus: "confirmed", reconciliationStatus: "reconciled" },
    ] as never);
    const res = await run({ action: "list_bank_transactions", startDate: "2026-09-01" }, ctx("finance")) as { count: number; inflow: number; outflow: number; net: number };
    expect(m.getBankTransactions).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-09-01", companyId: 1 }));
    expect(res).toMatchObject({ count: 2, inflow: 100, outflow: 40, net: 60 });
  });

  it("is finance-only, like the banking routes", async () => {
    for (const role of ["user", "ops", "sales"]) {
      await expect(run({ action: "list_bank_transactions" }, ctx(role))).rejects.toThrow(/Not authorized/);
      await expect(run({ action: "list_bills" }, ctx(role))).rejects.toThrow(/Not authorized/);
      await expect(run({ action: "financial_summary" }, ctx(role))).rejects.toThrow(/Not authorized/);
      await expect(run({ action: "reconciliation_summary" }, ctx(role))).rejects.toThrow(/Not authorized/);
    }
  });
});

describe("reconciliation_summary", () => {
  it("passes companyIds through to the summary helper", async () => {
    m.getBankReconciliationSummary.mockResolvedValue([{ status: "unreconciled", count: 2, total: "50.00" }] as never);
    const res = await run({ action: "reconciliation_summary" }, ctx("finance")) as { unreconciled: { count: number } };
    expect(m.getBankReconciliationSummary).toHaveBeenCalledWith({ companyIds: [1] });
    expect(res.unreconciled.count).toBe(2);
  });
});

describe("financial_summary", () => {
  it("computes P&L, AR/AP and balances for the period", async () => {
    m.getInvoices.mockResolvedValue([
      { id: 1, status: "paid", totalAmount: "500.00", issueDate: new Date("2026-09-10") },
      { id: 2, status: "sent", totalAmount: "200.00", issueDate: new Date("2026-09-12") },
      { id: 3, status: "paid", totalAmount: "999.00", issueDate: new Date("2025-01-01") },
    ] as never);
    m.getBills.mockResolvedValue([
      bill({ id: 1, status: "approved", totalAmount: "100.00", billDate: new Date("2026-09-05") }),
      bill({ id: 2, status: "cancelled", totalAmount: "50.00", billDate: new Date("2026-09-06") }),
    ] as never);
    m.getAccounts.mockResolvedValue([{ type: "asset", balance: "1000" }, { type: "liability", balance: "300" }] as never);
    const res = await run({ action: "financial_summary", startDate: "2026-09-01", endDate: "2026-09-30" }, ctx("finance")) as {
      profitAndLoss: { revenue: number; expenses: number; netIncome: number }; receivables: { outstanding: number }; payables: { outstanding: number }; balances: { assets: number };
    };
    expect(m.getInvoices).toHaveBeenCalledWith(undefined, { companyId: 1 });
    expect(m.getAccounts).toHaveBeenCalledWith(1);
    expect(res.profitAndLoss).toEqual({ revenue: 500, expenses: 100, netIncome: 400, paidInvoices: 1, bills: 1 });
    expect(res.receivables.outstanding).toBe(200);
    expect(res.payables.outstanding).toBe(100);
    expect(res.balances.assets).toBe(1000);
  });
});

it("rejects unknown actions", async () => {
  await expect(run({ action: "pay_bill" }, ctx("admin"))).rejects.toThrow(/Unknown manage_finance action/);
});
