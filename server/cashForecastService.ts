/**
 * Rolling 13-week cash forecast — loads open AR, AP, POs, recurring billing and
 * pending payroll for the caller's visible entities, then hands them to the pure
 * builder in cashForecastLogic.ts. Starting cash is the live Mercury balance
 * for global-scope callers, otherwise a manual figure the caller supplies.
 */
import * as db from "./db";
import type { Scope } from "./_core/scope";
import { scopeAllows } from "./_core/scope";
import {
  DEFAULT_FORECAST_WEEKS,
  OPEN_BILL_STATUS_LIST,
  OPEN_INVOICE_STATUS_LIST,
  OPEN_PO_STATUS_LIST,
  PO_SUPPRESSING_BILL_STATUS_LIST,
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
  const scopeIds = params.scope.companyIds === "all" ? undefined : params.scope.companyIds;
  const visible = (companyId: number | null | undefined) => scopeAllows(params.scope, companyId);

  // Status and entity filters run in SQL where the helper supports them, so the
  // forecast reads open items only rather than every row ever written.
  const [invoices, bills, pos, recurring, payroll] = await Promise.all([
    db.getInvoices(params.scope, { statuses: OPEN_INVOICE_STATUS_LIST }),
    db.getBills({ companyIds: scopeIds, statuses: PO_SUPPRESSING_BILL_STATUS_LIST }),
    db.getOpenPurchaseOrdersForForecast(params.scope, OPEN_PO_STATUS_LIST),
    db.getRecurringInvoices({ isActive: true }),
    db.getEmployeePayments({ status: "pending" }),
  ]);

  const openBillStatuses = new Set<string>(OPEN_BILL_STATUS_LIST);
  const openBills = bills.filter((b) => openBillStatuses.has(b.status));
  // Every bill fetched is either open (forecast as a bill) or paid (cash already
  // left), so any PO it links to must not be forecast again.
  const billedPoIds = new Set<number>(
    bills.map((b) => b.purchaseOrderId).filter((id): id is number => typeof id === "number"),
  );

  const events: CashEvent[] = [
    ...receivablesToEvents(invoices as any),
    ...recurringToEvents(recurring.filter((r) => visible(r.companyId)) as any, horizonEnd),
    ...billsToEvents(openBills as any),
    ...purchaseOrdersToEvents(pos as any, billedPoIds),
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
  } else if (params.scope.companyIds !== "all") {
    // Mercury holds one organization-wide token with no entity mapping, so an
    // entity-scoped caller only sees their own rows and supplies cash by hand.
    notes.push("Bank balance is only shown for global-scope users. Enter starting cash manually.");
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
