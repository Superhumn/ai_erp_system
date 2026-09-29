/**
 * Rolling 13-week cash forecast — loads open AR, AP, POs, recurring billing and
 * pending payroll for the caller's visible entities, then hands them to the pure
 * builder in cashForecastLogic.ts. Starting cash is the live Mercury balance
 * unless the caller supplies an override.
 */
import * as db from "./db";
import type { Scope } from "./_core/scope";
import { scopeAllows } from "./_core/scope";
import {
  DEFAULT_FORECAST_WEEKS,
  addDays,
  adjustmentsToEvents,
  billsToEvents,
  buildCashForecast,
  nonUsdCount,
  payrollToEvents,
  purchaseOrdersToEvents,
  receivablesToEvents,
  recurringToEvents,
  round2,
  startOfWeek,
  type CashEvent,
  type CashForecast,
  type ManualAdjustment,
} from "./cashForecastLogic";

export type CashSource = "mercury" | "manual" | "none";

export interface CashForecastResult extends CashForecast {
  cashSource: CashSource;
  bankAccounts: { name: string; balance: number }[];
  nonUsdItems: number;
  notes: string[];
}

async function loadBankCash(): Promise<{ total: number; accounts: { name: string; balance: number }[]; configured: boolean; error?: string }> {
  try {
    const { getMercuryAccounts } = await import("./mercuryService");
    const res = await getMercuryAccounts();
    const accounts = (res.accounts ?? []).map((a: any) => ({
      name: String(a.nickname ?? a.name ?? a.accountNumber ?? "Account"),
      balance: Number(a.currentBalance ?? a.availableBalance ?? 0) || 0,
    }));
    return { total: accounts.reduce((s, a) => s + a.balance, 0), accounts, configured: res.configured };
  } catch (err) {
    return { total: 0, accounts: [], configured: true, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getCashForecast(params: {
  scope: Scope;
  asOf?: Date;
  weeks?: number;
  startingCashOverride?: number | null;
  adjustments?: ManualAdjustment[];
}): Promise<CashForecastResult> {
  const asOf = params.asOf ?? new Date();
  const weeks = params.weeks ?? DEFAULT_FORECAST_WEEKS;
  const horizonEnd = addDays(startOfWeek(asOf), weeks * 7);
  const visible = (companyId: number | null | undefined) => scopeAllows(params.scope, companyId);

  const [invoices, bills, pos, recurring, payroll] = await Promise.all([
    db.getInvoices(params.scope),
    db.getBills(),
    db.getPurchaseOrders(),
    db.getRecurringInvoices({ isActive: true }),
    db.getEmployeePayments({ status: "pending" }),
  ]);

  const scopedBills = bills.filter((b) => visible(b.companyId));
  const billedPoIds = new Set<number>(
    scopedBills.map((b) => b.purchaseOrderId).filter((id): id is number => typeof id === "number"),
  );

  const events: CashEvent[] = [
    ...receivablesToEvents(invoices as any),
    ...recurringToEvents(recurring.filter((r) => visible(r.companyId)) as any, horizonEnd),
    ...billsToEvents(scopedBills as any),
    ...purchaseOrdersToEvents(pos.filter((p) => visible(p.companyId)) as any, billedPoIds),
    ...payrollToEvents(payroll.filter((p) => visible(p.companyId)) as any),
    ...adjustmentsToEvents(params.adjustments ?? []),
  ];

  const notes: string[] = [];
  let startingCash = 0;
  let cashSource: CashSource = "none";
  let bankAccounts: { name: string; balance: number }[] = [];

  if (typeof params.startingCashOverride === "number" && Number.isFinite(params.startingCashOverride)) {
    startingCash = params.startingCashOverride;
    cashSource = "manual";
  } else {
    const bank = await loadBankCash();
    bankAccounts = bank.accounts;
    if (bank.error) notes.push(`Bank balance unavailable (${bank.error}). Enter starting cash manually.`);
    else if (!bank.configured) notes.push("Mercury is not connected. Enter starting cash manually.");
    else {
      startingCash = bank.total;
      cashSource = "mercury";
    }
  }

  const forecast = buildCashForecast({ asOf, startingCash, events, weeks });
  const nonUsdItems = nonUsdCount(events);
  if (nonUsdItems > 0) notes.push(`${nonUsdItems} item(s) are in a non-USD currency and are added at face value.`);
  if (forecast.overdueIn > 0) notes.push(`$${round2(forecast.overdueIn).toLocaleString("en-US")} of past-due customer money is placed in week 1.`);
  if (forecast.overdueOut > 0) notes.push(`$${round2(forecast.overdueOut).toLocaleString("en-US")} of past-due bills is placed in week 1.`);

  return { ...forecast, cashSource, bankAccounts, nonUsdItems, notes };
}
