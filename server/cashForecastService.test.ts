import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getInvoices: vi.fn(),
  getBills: vi.fn(),
  getOpenPurchaseOrdersForForecast: vi.fn(),
  getRecurringInvoices: vi.fn(),
  getEmployeePayments: vi.fn(),
  getRecurringExpenses: vi.fn(),
  getInvoicePaymentHistory: vi.fn(),
  getBankAccountEntityMap: vi.fn(),
  insertCashForecastSnapshotIfAbsent: vi.fn(),
  getCashForecastSnapshots: vi.fn(),
  getBankCashByWeek: vi.fn(),
  getAllActiveCashForecastAlertSettings: vi.fn(),
  claimCashForecastAlert: vi.fn(async () => true),
  releaseCashForecastAlert: vi.fn(),
  getInvoiceById: vi.fn(),
  getCustomerById: vi.fn(),
}));
vi.mock("./mercuryService", () => ({ getMercuryAccounts: vi.fn() }));
vi.mock("./fxService", () => ({ getFxRate: vi.fn(async (from: string) => (from === "ZAR" ? 0.05 : null)) }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })), isEmailConfigured: vi.fn(() => true) }));

import * as db from "./db";
import * as mercury from "./mercuryService";
import * as email from "./_core/email";
import { forecastToXlsx, getCashForecast, getCollectionsQueue, runCashForecastAlerts, scopeKeyFor, snapshotForecast } from "./cashForecastService";
import type { Scope } from "./_core/scope";

const asOf = new Date("2026-09-30T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const entityScope: Scope = { mode: "entity", companyIds: [1] };
const globalScope: Scope = { mode: "global", companyIds: "all" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getInvoices).mockResolvedValue([
    { id: 1, companyId: 1, invoiceNumber: "INV-1", type: "invoice", status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000", paidAmount: "0", customer: { name: "A" } },
  ] as any);
  vi.mocked(db.getBills).mockResolvedValue([
    { id: 1, companyId: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-08"), totalAmount: "400", amountPaid: "0", purchaseOrderId: 7, vendorName: "V" },
    { id: 3, companyId: 1, status: "paid", billDate: d("2026-09-01"), dueDate: d("2026-09-20"), totalAmount: "250", amountPaid: "250", purchaseOrderId: 8, vendorName: "V" },
  ] as any);
  vi.mocked(db.getOpenPurchaseOrdersForForecast).mockResolvedValue([
    { id: 7, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), totalAmount: "400", vendor: { paymentTerms: 30 } },
    { id: 8, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), totalAmount: "250", vendor: { paymentTerms: 30 } },
    { id: 9, companyId: 1, status: "confirmed", orderDate: d("2026-09-01"), expectedDate: d("2026-10-01"), totalAmount: "100", vendor: { paymentTerms: 10 } },
  ] as any);
  vi.mocked(db.getRecurringInvoices).mockResolvedValue([] as any);
  vi.mocked(db.getEmployeePayments).mockResolvedValue([] as any);
  vi.mocked(db.getRecurringExpenses).mockResolvedValue([] as any);
  vi.mocked(db.getInvoicePaymentHistory).mockResolvedValue([] as any);
  vi.mocked(db.getBankAccountEntityMap).mockResolvedValue([] as any);
  vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: true, accounts: [{ id: "acc-1", name: "Ops", currentBalance: 5000 }] });
});

describe("getCashForecast", () => {
  it("uses the Mercury balance for global scope and skips POs that are billed or paid", async () => {
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.cashSource).toBe("mercury");
    expect(f.startingCash).toBe(5000);
    expect(f.totalIn).toBe(1000);
    expect(f.totalOut).toBe(500); // open bill 400 + unbilled PO 100; PO 7 (billed) and PO 8 (paid) skipped
    expect(f.endingCash).toBe(5500);
  });

  it("reads open rows only, scoped in SQL", async () => {
    await getCashForecast({ scope: entityScope, asOf });
    expect(db.getInvoices).toHaveBeenCalledWith(entityScope, { statuses: ["sent", "partial", "overdue"] });
    expect(db.getBills).toHaveBeenCalledWith({ companyIds: [1], statuses: ["pending_approval", "approved", "scheduled", "partially_paid", "overdue", "paid"] });
    expect(db.getOpenPurchaseOrdersForForecast).toHaveBeenCalledWith(entityScope, ["sent", "confirmed", "partial"]);
  });

  it("entity-scoped caller only sees bank accounts mapped to their entity", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: true, accounts: [
      { id: "acc-1", name: "US Ops", currentBalance: 5000 },
      { id: "acc-2", name: "India", currentBalance: 700 },
      { id: "acc-3", name: "Unmapped", currentBalance: 99 },
    ] });
    vi.mocked(db.getBankAccountEntityMap).mockResolvedValue([
      { id: 1, provider: "mercury", externalAccountId: "acc-1", accountName: "US Ops", companyId: 1 },
      { id: 2, provider: "mercury", externalAccountId: "acc-2", accountName: "India", companyId: 2 },
    ] as any);
    const f = await getCashForecast({ scope: entityScope, asOf });
    expect(f.cashSource).toBe("mercury");
    expect(f.startingCash).toBe(5000);
    expect(f.bankAccounts.map((a) => a.name)).toEqual(["US Ops"]);
    expect(f.notes.join(" ")).toMatch(/1 bank account\(s\) are not mapped/);
  });

  it("entity-scoped caller with no mapped account gets no balance and a note", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf });
    expect(f.cashSource).toBe("none");
    expect(f.notes.join(" ")).toMatch(/No bank account is mapped/);
  });

  it("adds recurring expenses, converts FX, and applies scenario knobs", async () => {
    vi.mocked(db.getRecurringExpenses).mockResolvedValue([
      { id: 1, companyId: 1, name: "Rent", category: "rent", frequency: "monthly", dayOfMonth: 15, nextDate: d("2026-10-15"), amount: "1000", currency: "ZAR", isActive: true },
    ] as any);
    const base = await getCashForecast({ scope: globalScope, asOf });
    // Rent: Oct 15, Nov 15, Dec 15 at 0.05 → 50 each = 150; plus bill 400 + PO 100
    expect(base.totalOut).toBe(650);
    expect(base.nonUsdItems).toBe(0);
    const bear = await getCashForecast({ scope: globalScope, asOf, knobs: { arHaircutPct: 50, arSlipDays: 7 } });
    expect(bear.totalIn).toBe(500);
    expect(bear.weeks.find((w) => w.inflows.customer_receipts)?.start).toBe("2026-10-05");
    const excl = await getCashForecast({ scope: globalScope, asOf, knobs: { excludeCustomerIds: [1] } });
    expect(excl.totalIn).toBe(1000); // invoice has no customerId in the mock → not excluded
  });

  it("uses customer payment behaviour when history exists", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { id: 1, companyId: 1, customerId: 7, invoiceNumber: "INV-1", type: "invoice", status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000", paidAmount: "0", customer: { name: "Slow" } },
    ] as any);
    vi.mocked(db.getInvoicePaymentHistory).mockResolvedValue([
      { customerId: 7, issueDate: d("2026-01-01"), paymentDate: d("2026-03-02") },
      { customerId: 7, issueDate: d("2026-02-01"), paymentDate: d("2026-04-02") },
      { customerId: 7, issueDate: d("2026-03-01"), paymentDate: d("2026-04-30") },
    ] as any);
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.behaviourCustomers).toBe(1);
    expect(f.weeks.find((w) => w.inflows.customer_receipts)?.start).toBe("2026-10-26"); // Sep 1 + 60 = Oct 31
  });

  it("snapshots and keys by scope", async () => {
    vi.mocked(db.insertCashForecastSnapshotIfAbsent).mockResolvedValue({ id: 5, created: true, existingAsOf: null });
    await snapshotForecast(entityScope, "manual", 3);
    const arg = vi.mocked(db.insertCashForecastSnapshotIfAbsent).mock.calls[0][0];
    expect(arg.scopeKey).toBe("entities:1");
    expect(arg.companyId).toBe(1);
    expect(arg.weeks).toHaveLength(13);
    expect(scopeKeyFor(globalScope)).toBe("global");
  });

  it("alerts once when lowest cash is under the floor", async () => {
    vi.mocked(db.getAllActiveCashForecastAlertSettings).mockResolvedValue([
      { id: 1, scopeKey: "global", thresholdAmount: "10000", recipients: ["jade@superhumn.co"], isActive: true, lastAlertedAt: null, lastAlertLowestCash: null },
    ] as any);
    const r = await runCashForecastAlerts(asOf);
    expect(r).toEqual({ checked: 1, sent: 1, skipped: 0 });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(db.claimCashForecastAlert).toHaveBeenCalledWith(1, null, asOf, "5500");
    expect(db.releaseCashForecastAlert).not.toHaveBeenCalled();
  });

  it("does not send when another process already claimed the alert", async () => {
    vi.mocked(db.getAllActiveCashForecastAlertSettings).mockResolvedValue([
      { id: 1, scopeKey: "global", thresholdAmount: "10000", recipients: ["a@b.co"], isActive: true, lastAlertedAt: null, lastAlertLowestCash: null },
    ] as any);
    vi.mocked(db.claimCashForecastAlert).mockResolvedValueOnce(false);
    const r = await runCashForecastAlerts(asOf);
    expect(r.sent).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim when every send fails", async () => {
    vi.mocked(db.getAllActiveCashForecastAlertSettings).mockResolvedValue([
      { id: 1, scopeKey: "global", thresholdAmount: "10000", recipients: ["a@b.co"], isActive: true, lastAlertedAt: null, lastAlertLowestCash: null },
    ] as any);
    vi.mocked(email.sendEmail).mockResolvedValueOnce({ success: false, error: "boom" } as any);
    const r = await runCashForecastAlerts(asOf);
    expect(r.sent).toBe(0);
    expect(db.releaseCashForecastAlert).toHaveBeenCalledWith(1, null, null);
  });

  it("lists the largest outflows first in the alert email", async () => {
    vi.mocked(db.getBills).mockResolvedValue([
      { id: 1, companyId: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "10", amountPaid: "0", vendorName: "Small" },
      { id: 2, companyId: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "9000", amountPaid: "0", vendorName: "Big" },
      { id: 3, companyId: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "500", amountPaid: "0", vendorName: "Mid" },
    ] as any);
    vi.mocked(db.getOpenPurchaseOrdersForForecast).mockResolvedValue([] as any);
    vi.mocked(db.getAllActiveCashForecastAlertSettings).mockResolvedValue([
      { id: 1, scopeKey: "global", thresholdAmount: "10000", recipients: ["a@b.co"], isActive: true, lastAlertedAt: null, lastAlertLowestCash: null },
    ] as any);
    await runCashForecastAlerts(asOf);
    const text = vi.mocked(email.sendEmail).mock.calls[0][0].text ?? "";
    const order = ["Big", "Mid", "Small"].map((n) => text.indexOf(n));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("entity scope fails closed on bank accounts when Mercury is down", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockRejectedValue(new Error("Mercury API error: 503"));
    vi.mocked(db.getCashForecastSnapshots).mockResolvedValue([
      { id: 1, scopeKey: "entities:1", asOf: asOf, weekStart: d("2026-09-28"), weeks: [], startingCash: "0", endingCash: "0", lowestCash: "0", source: "manual" },
    ] as any);
    vi.mocked(db.getBankCashByWeek).mockResolvedValue([] as any);
    const { getForecastAccuracy } = await import("./cashForecastService");
    await getForecastAccuracy(entityScope, asOf);
    expect(db.getBankCashByWeek).toHaveBeenCalledWith(expect.anything(), asOf, []);
  });

  it("does not re-alert within a week unless it worsened", async () => {
    vi.mocked(db.getAllActiveCashForecastAlertSettings).mockResolvedValue([
      { id: 1, scopeKey: "global", thresholdAmount: "10000", recipients: ["a@b.co"], isActive: true, lastAlertedAt: new Date(asOf.getTime() - 86400000), lastAlertLowestCash: "5100" },
    ] as any);
    const r = await runCashForecastAlerts(asOf);
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it("exports an xlsx with three sheets", async () => {
    const f = await getCashForecast({ scope: globalScope, asOf });
    const x = forecastToXlsx(f);
    expect(x.filename).toBe("cash-forecast-2026-09-30.xlsx");
    expect(x.data.length).toBeGreaterThan(1000);
  });

  it("reminder refuses invoices that are not open, not overdue, or fully paid", async () => {
    const { sendCollectionReminder } = await import("./cashForecastService");
    vi.mocked(db.getInvoiceById).mockResolvedValue({ id: 1, companyId: 1, type: "invoice", status: "paid", totalAmount: "100", paidAmount: "100", dueDate: d("2026-01-01"), customerId: 1 } as any);
    expect((await sendCollectionReminder(globalScope, 1)).error).toMatch(/not open/);
    vi.mocked(db.getInvoiceById).mockResolvedValue({ id: 1, companyId: 1, type: "invoice", status: "sent", totalAmount: "100", paidAmount: "100", dueDate: d("2026-01-01"), customerId: 1 } as any);
    expect((await sendCollectionReminder(globalScope, 1)).error).toMatch(/Nothing outstanding/);
    vi.mocked(db.getInvoiceById).mockResolvedValue({ id: 1, companyId: 1, type: "invoice", status: "sent", totalAmount: "100", paidAmount: "0", dueDate: new Date(Date.now() + 86400000), customerId: 1 } as any);
    expect((await sendCollectionReminder(globalScope, 1)).error).toMatch(/not overdue/);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("collections queue lists overdue invoices largest first", async () => {
    vi.mocked(db.getInvoices).mockResolvedValue([
      { id: 1, companyId: 1, invoiceNumber: "A", type: "invoice", status: "overdue", issueDate: d("2026-08-01"), dueDate: d("2026-09-01"), totalAmount: "100", paidAmount: "0", customer: { name: "X", email: "x@x.co" } },
      { id: 2, companyId: 1, invoiceNumber: "B", type: "invoice", status: "sent", issueDate: d("2026-08-01"), dueDate: d("2026-09-10"), totalAmount: "900", paidAmount: "100", customer: { name: "Y" } },
      { id: 3, companyId: 1, invoiceNumber: "C", type: "invoice", status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-10"), totalAmount: "5000", paidAmount: "0", customer: { name: "Z" } },
    ] as any);
    const q = await getCollectionsQueue(globalScope, asOf);
    expect(q.map((r) => r.invoiceNumber)).toEqual(["B", "A"]);
    expect(q[0]).toMatchObject({ outstanding: 800, daysOverdue: 20, customerEmail: null });
  });

  it("prefers a manual starting cash override", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf, startingCashOverride: 100 });
    expect(f.cashSource).toBe("manual");
    expect(f.startingCash).toBe(100);
    expect(mercury.getMercuryAccounts).not.toHaveBeenCalled();
  });

  it("notes when Mercury is not connected", async () => {
    vi.mocked(mercury.getMercuryAccounts).mockResolvedValue({ configured: false, accounts: [] });
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.cashSource).toBe("none");
    expect(f.notes.join(" ")).toMatch(/not connected/);
  });
});
