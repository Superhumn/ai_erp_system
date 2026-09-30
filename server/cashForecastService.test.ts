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
  getBillPaymentHistory: vi.fn(async () => []),
  getOpenCrmDealsForForecast: vi.fn(async () => []),
  getOpenPmCashEvents: vi.fn(async () => []),
  getInventoryValuationForScope: vi.fn(async () => []),
  getCompanies: vi.fn(async () => [{ id: 1, name: "Superhumn US" }, { id: 2, name: "Superhumn India" }]),
  getCompletedPaymentsByDateRange: vi.fn(async () => []),
  getCashNotificationChannels: vi.fn(async () => []),
  getAllActiveCashNotificationChannels: vi.fn(async () => []),
  markCashNotificationChannelResult: vi.fn(),
  upsertCashForecastFinancialModelRows: vi.fn(async () => ({ written: 0 })),
  claimCashNotificationDigest: vi.fn(async () => ({ claimed: true, previousLastSentAt: null })),
  releaseCashNotificationDigest: vi.fn(),
}));
vi.mock("./cashNotifyService", () => ({ sendToChannel: vi.fn(async () => ({ ok: true })), validateChannelTarget: vi.fn(() => null) }));
vi.mock("./_core/messageExport", () => ({ htmlToPdfBase64: vi.fn(async () => "UERG") }));
vi.mock("./mercuryService", () => ({ getMercuryAccounts: vi.fn() }));
vi.mock("./fxService", () => ({ getFxRate: vi.fn(async (from: string) => (from === "ZAR" ? 0.05 : null)) }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })), isEmailConfigured: vi.fn(() => true) }));

import * as db from "./db";
import * as mercury from "./mercuryService";
import * as email from "./_core/email";
import * as notify from "./cashNotifyService";
import { composeDigest, forecastToBoardPackHtml, forecastToPdf, forecastToXlsx, getCashForecast, getCollectionsQueue, runCashDigest, runCashForecastAlerts, scopeKeyFor, snapshotForecast } from "./cashForecastService";
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
  vi.mocked(db.getBillPaymentHistory).mockResolvedValue([] as any);
  vi.mocked(db.getOpenCrmDealsForForecast).mockResolvedValue([] as any);
  vi.mocked(db.getOpenPmCashEvents).mockResolvedValue([] as any);
  vi.mocked(db.getInventoryValuationForScope).mockResolvedValue([] as any);
  vi.mocked(db.getCashNotificationChannels).mockResolvedValue([] as any);
  vi.mocked(db.claimCashNotificationDigest).mockResolvedValue({ claimed: true, previousLastSentAt: null });
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

  it("adds pipeline only when asked, projects by default, and reports inventory + entities", async () => {
    vi.mocked(db.getOpenCrmDealsForForecast).mockResolvedValue([
      { id: 1, companyId: 1, name: "DOE", amount: "10000", currency: "USD", probability: 50, expectedCloseDate: d("2026-10-05"), stage: "proposal", customerId: null, organization: "NYC DOE" },
    ] as any);
    vi.mocked(db.getOpenPmCashEvents).mockResolvedValue([
      { id: 1, companyId: 2, name: "Mumbai line", status: "in_progress", cashEventAmount: "3000", cashEventType: "capex", cashEventDate: d("2026-10-20") },
    ] as any);
    vi.mocked(db.getInventoryValuationForScope).mockResolvedValue([
      { productId: 1, productName: "Chickpea crumble", sku: "CC-1", warehouseId: 1, warehouseName: "PA", quantity: "100", totalValue: "2500", layerCount: 1 },
      { productId: 1, productName: "Chickpea crumble", sku: "CC-1", warehouseId: 2, warehouseName: "NJ", quantity: "50", totalValue: "1250", layerCount: 1 },
    ] as any);
    const base = await getCashForecast({ scope: globalScope, asOf });
    expect(base.totalOut).toBe(3500); // 400 bill + 100 PO + 3000 capex
    expect(base.pipelineWeightedTotal).toBe(0);
    expect(base.inventory).toMatchObject({ totalValue: 3750, items: [{ productId: 1, quantity: 150, totalValue: 3750 }] });
    expect(base.months.length).toBeGreaterThanOrEqual(12);
    expect(base.byEntity.map((e) => e.name)).toEqual(["Superhumn US", "Superhumn India", "Unassigned"]);
    expect(base.byEntity.find((e) => e.name === "Superhumn India")?.totalOut).toBe(3000);
    const withPipe = await getCashForecast({ scope: globalScope, asOf, includePipeline: true });
    expect(withPipe.pipelineWeightedTotal).toBe(5000);
    expect(withPipe.totalIn).toBe(6000);
    expect(db.getOpenCrmDealsForForecast).toHaveBeenCalledWith(globalScope, expect.any(Date));
    const noProjects = await getCashForecast({ scope: globalScope, asOf, includeProjects: false });
    expect(noProjects.totalOut).toBe(500);
  });

  it("applies vendor behaviour and autopay to open bills", async () => {
    vi.mocked(db.getBillPaymentHistory).mockResolvedValue([
      { vendorId: 5, dueDate: d("2026-01-10"), paidAt: d("2026-01-24") },
      { vendorId: 5, dueDate: d("2026-02-10"), paidAt: d("2026-02-24") },
      { vendorId: 5, dueDate: d("2026-03-10"), paidAt: d("2026-03-24") },
    ] as any);
    vi.mocked(db.getBills).mockResolvedValue([
      { id: 1, companyId: 1, vendorId: 5, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-08"), totalAmount: "400", amountPaid: "0", vendorName: "V" },
      { id: 2, companyId: 1, vendorId: 5, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-08"), totalAmount: "100", amountPaid: "0", vendorName: "V", vendorAutopay: true },
    ] as any);
    vi.mocked(db.getOpenPurchaseOrdersForForecast).mockResolvedValue([] as any);
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.behaviourVendors).toBe(1);
    const w2 = f.weeks.find((w) => w.start === "2026-10-05")!; // due week: only the autopay 100
    const w4 = f.weeks.find((w) => w.start === "2026-10-19")!; // +14d: the 400
    expect(w2.outflows.vendor_bills).toBe(100);
    expect(w4.outflows.vendor_bills).toBe(400);
  });

  it("digest goes to every active channel that wants it, keyed by scope", async () => {
    vi.mocked(db.getAllActiveCashNotificationChannels).mockResolvedValue([
      { id: 1, scopeKey: "global", type: "slack", target: "https://hooks.slack.com/services/x", sendDigest: true, sendAlerts: true, isActive: true },
      { id: 2, scopeKey: "global", type: "whatsapp", target: "+14155551234", sendDigest: false, sendAlerts: true, isActive: true },
      { id: 3, scopeKey: "entities:1", type: "email", target: "a@b.co", sendDigest: true, sendAlerts: false, isActive: true },
    ] as any);
    const r = await runCashDigest({ now: asOf });
    expect(r).toEqual({ scopes: 2, sent: 2, failed: 0, skipped: 0 });
    const calls = vi.mocked(notify.sendToChannel).mock.calls;
    expect(calls.map((c) => c[0].type)).toEqual(["slack", "email"]);
    expect(calls[0][1].title).toMatch(/cash digest, week of 2026-09-28/);
    expect(calls[0][1].text).toMatch(/Cash now: \$5,000/);
    expect(calls[0][1].text).toMatch(/Low point/);
  });

  it("digest is claimed once per channel per week; losers skip, failures release", async () => {
    vi.mocked(db.getAllActiveCashNotificationChannels).mockResolvedValue([
      { id: 1, scopeKey: "global", type: "slack", target: "https://hooks.slack.com/services/x", sendDigest: true, sendAlerts: true, isActive: true },
      { id: 2, scopeKey: "global", type: "email", target: "a@b.co", sendDigest: true, sendAlerts: true, isActive: true },
    ] as any);
    vi.mocked(db.claimCashNotificationDigest).mockResolvedValueOnce({ claimed: false, previousLastSentAt: asOf }).mockResolvedValueOnce({ claimed: true, previousLastSentAt: null });
    vi.mocked(notify.sendToChannel).mockResolvedValueOnce({ ok: false, error: "boom" });
    const r = await runCashDigest({ now: asOf });
    expect(r).toEqual({ scopes: 1, sent: 0, failed: 1, skipped: 1 });
    expect(notify.sendToChannel).toHaveBeenCalledTimes(1);
    expect(db.releaseCashNotificationDigest).toHaveBeenCalledWith(2, null, "boom");
    expect(vi.mocked(db.claimCashNotificationDigest).mock.calls[0].slice(1)).toEqual([d("2026-09-28"), asOf, false]);
  });

  it("send-now forces the claim", async () => {
    vi.mocked(db.getAllActiveCashNotificationChannels).mockResolvedValue([
      { id: 1, scopeKey: "global", type: "slack", target: "https://hooks.slack.com/services/x", sendDigest: true, sendAlerts: true, isActive: true },
    ] as any);
    await runCashDigest({ now: asOf, force: true });
    expect(vi.mocked(db.claimCashNotificationDigest).mock.calls[0][3]).toBe(true);
  });

  it("weighted pipeline upside is reported after FX conversion", async () => {
    vi.mocked(db.getOpenCrmDealsForForecast).mockResolvedValue([
      { id: 1, companyId: 1, name: "ZA school", amount: "10000", currency: "ZAR", probability: 100, expectedCloseDate: d("2026-10-05"), stage: "proposal", customerId: null, organization: "WCED" },
    ] as any);
    const f = await getCashForecast({ scope: globalScope, asOf, includePipeline: true });
    expect(f.pipelineWeightedTotal).toBe(500); // 10,000 ZAR × 0.05
    expect(f.totalIn).toBe(1500);
  });

  it("manual override on a single-entity scope is attributed to that entity", async () => {
    const f = await getCashForecast({ scope: entityScope, asOf, startingCashOverride: 900 });
    expect(f.byEntity.map((e) => [e.name, e.startingCash])).toEqual([["Superhumn US", 900]]);
  });

  it("recurring schedules run through the 12-month window", async () => {
    vi.mocked(db.getRecurringExpenses).mockResolvedValue([
      { id: 1, companyId: 1, name: "Rent", category: "rent", frequency: "monthly", dayOfMonth: 1, nextDate: d("2026-10-01"), amount: "1000", currency: "USD", isActive: true },
    ] as any);
    const f = await getCashForecast({ scope: globalScope, asOf });
    expect(f.months.find((m) => m.key === "2027-06")?.totalOut).toBe(1000);
    expect(f.totalOut).toBe(3500); // 13-week totals still stop at the horizon: Oct, Nov, Dec rent + 400 + 100
  });

  it("alerts also fan out to channels flagged for alerts", async () => {
    vi.mocked(db.getAllActiveCashForecastAlertSettings).mockResolvedValue([
      { id: 1, scopeKey: "global", thresholdAmount: "10000", recipients: [], isActive: true, lastAlertedAt: null, lastAlertLowestCash: null },
    ] as any);
    vi.mocked(db.getCashNotificationChannels).mockResolvedValue([
      { id: 9, scopeKey: "global", type: "google_chat", target: "https://chat.googleapis.com/v1/spaces/x", sendDigest: false, sendAlerts: true, isActive: true },
    ] as any);
    const r = await runCashForecastAlerts(asOf);
    expect(r.sent).toBe(1);
    expect(vi.mocked(notify.sendToChannel).mock.calls[0][0].type).toBe("google_chat");
    expect(db.markCashNotificationChannelResult).toHaveBeenCalledWith(9, true, undefined);
  });

  it("snapshot pushes the monthly view into financial_model", async () => {
    vi.mocked(db.insertCashForecastSnapshotIfAbsent).mockResolvedValue({ id: 5, created: true, existingAsOf: null });
    await snapshotForecast(globalScope, "scheduled");
    const rows = vi.mocked(db.upsertCashForecastFinancialModelRows).mock.calls[0][0];
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows[0]).toMatchObject({ companyId: null, year: 2026, month: 9 });
  });

  it("board pack HTML and PDF carry the headline numbers", async () => {
    const f = await getCashForecast({ scope: globalScope, asOf });
    const html = forecastToBoardPackHtml(f, { companyName: "Superhumn" });
    expect(html).toContain("13-week cash forecast");
    expect(html).toContain("$5,000");
    expect(html).toContain("12-month view");
    const pdf = await forecastToPdf(f);
    expect(pdf).toMatchObject({ filename: "cash-forecast-2026-09-30.pdf", mimeType: "application/pdf", data: "UERG" });
    const digest = composeDigest(f);
    expect(digest.text).toContain("Week 13 ending cash");
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
