/**
 * Rolling 13-week cash forecast — loads open AR, AP, POs, recurring billing,
 * recurring expenses and pending payroll for the caller's visible entities,
 * then hands them to the pure builder in cashForecastLogic.ts.
 *
 * Starting cash: Mercury accounts mapped to the caller's entities (all
 * accounts for global scope), or a manual figure. Non-USD items convert at the
 * latest fx_rates row. Customer receipts use each customer's median days-to-pay
 * when there is enough history. Scenario knobs (AR slip / haircut, AP slip,
 * excluded customers, manual items) apply last.
 */
import * as XLSX from "xlsx";
import * as db from "./db";
import type { Scope } from "./_core/scope";
import { scopeAllows, scopeCompanyIds } from "./_core/scope";
import { getFxRate } from "./fxService";
import { sendEmail, isEmailConfigured } from "./_core/email";
import {
  CATEGORY_LABELS,
  DEFAULT_FORECAST_WEEKS,
  OPEN_BILL_STATUS_LIST,
  OPEN_INVOICE_STATUS_LIST,
  OPEN_PO_STATUS_LIST,
  PO_SUPPRESSING_BILL_STATUS_LIST,
  addDays,
  adjustmentsToEvents,
  applyScenario,
  billsToEvents,
  buildCashForecast,
  computePayBehaviour,
  convertEventsToUsd,
  gradeSnapshot,
  isoDate,
  payrollToEvents,
  purchaseOrdersToEvents,
  receivablesToEventsWithBehaviour,
  recurringExpensesToEvents,
  recurringToEvents,
  round2,
  startOfWeek,
  summarizeAccuracy,
  toAmount,
  type CashCategory,
  type CashEvent,
  type CashForecast,
  type ManualAdjustment,
  type ScenarioKnobs,
} from "./cashForecastLogic";

export type CashSource = "mercury" | "manual" | "none";

export interface CashForecastResult extends CashForecast {
  cashSource: CashSource;
  bankAccounts: { name: string; balance: number }[];
  nonUsdItems: number;
  notes: string[];
  behaviourCustomers: number;
}

export interface ForecastOptions {
  scope: Scope;
  asOf?: Date;
  weeks?: number;
  startingCashOverride?: number | null;
  adjustments?: ManualAdjustment[];
  knobs?: ScenarioKnobs;
}

/** Stable key for snapshots and alert settings: "global" or the sorted entity list. */
export function scopeKeyFor(scope: Scope): string {
  const ids = scopeCompanyIds(scope);
  return ids === null ? "global" : `entities:${[...ids].sort((a, b) => a - b).join(",")}`;
}

interface BankAccount {
  id: string;
  name: string;
  balance: number;
}

async function loadMercuryAccounts(): Promise<{ accounts: BankAccount[]; configured: boolean; error?: string }> {
  try {
    const { getMercuryAccounts } = await import("./mercuryService");
    const res = await getMercuryAccounts();
    const accounts = (res.accounts ?? []).map((a: any) => ({
      id: String(a.id ?? a.accountNumber ?? a.name ?? ""),
      name: String(a.nickname ?? a.name ?? a.accountNumber ?? "Account"),
      balance: Number(a.currentBalance ?? a.availableBalance ?? 0) || 0,
    }));
    return { accounts, configured: res.configured };
  } catch (err) {
    return { accounts: [], configured: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bank accounts the scope may see. Global scope sees every account; an
 * entity scope sees only accounts mapped to its entities, and is told when
 * accounts are still unmapped.
 */
export async function loadBankCashForScope(scope: Scope): Promise<{
  total: number;
  accounts: BankAccount[];
  accountIds: string[] | null;
  configured: boolean;
  error?: string;
  unmapped: number;
}> {
  const ids = scopeCompanyIds(scope);
  // Entity scope: the visible account list comes from the mapping table, so it
  // stays closed even when the bank API is down (null would mean "all").
  const mineIds = ids === null ? null : [...new Set((await db.getBankAccountEntityMap()).filter((m) => ids.includes(m.companyId)).map((m) => m.externalAccountId))];
  const bank = await loadMercuryAccounts();
  if (bank.error || !bank.configured) return { total: 0, accounts: [], accountIds: mineIds, configured: bank.configured, error: bank.error, unmapped: 0 };
  if (mineIds === null) {
    return { total: bank.accounts.reduce((s, a) => s + a.balance, 0), accounts: bank.accounts, accountIds: null, configured: true, unmapped: 0 };
  }
  const mine = new Set(mineIds);
  const mapped = new Set((await db.getBankAccountEntityMap()).map((m) => m.externalAccountId));
  const accounts = bank.accounts.filter((a) => mine.has(a.id));
  const unmapped = bank.accounts.filter((a) => !mapped.has(a.id)).length;
  return { total: accounts.reduce((s, a) => s + a.balance, 0), accounts, accountIds: mineIds, configured: true, unmapped };
}

async function fxRatesFor(events: CashEvent[], asOf: Date): Promise<Map<string, number>> {
  const ccys = new Set(events.map((e) => (e.currency ?? "USD").toUpperCase()).filter((c) => c !== "USD"));
  const rates = new Map<string, number>();
  await Promise.all(
    [...ccys].map(async (ccy) => {
      const r = await getFxRate(ccy, "USD", asOf);
      if (r) rates.set(ccy, r);
    }),
  );
  return rates;
}

export async function getCashForecast(params: ForecastOptions): Promise<CashForecastResult> {
  const asOf = params.asOf ?? new Date();
  const weeks = params.weeks ?? DEFAULT_FORECAST_WEEKS;
  const weekStart = startOfWeek(asOf);
  const horizonEnd = addDays(weekStart, weeks * 7);
  const scopeIds = params.scope.companyIds === "all" ? undefined : params.scope.companyIds;
  const visible = (companyId: number | null | undefined) => scopeAllows(params.scope, companyId);

  const [invoices, bills, pos, recurring, payroll, expenses, history] = await Promise.all([
    db.getInvoices(params.scope, { statuses: OPEN_INVOICE_STATUS_LIST }),
    db.getBills({ companyIds: scopeIds, statuses: PO_SUPPRESSING_BILL_STATUS_LIST }),
    db.getOpenPurchaseOrdersForForecast(params.scope, OPEN_PO_STATUS_LIST),
    db.getRecurringInvoices({ isActive: true }),
    db.getEmployeePayments({ status: "pending" }),
    db.getRecurringExpenses(params.scope, { isActive: true }),
    db.getInvoicePaymentHistory(params.scope, addDays(asOf, -365)),
  ]);

  const openBillStatuses = new Set<string>(OPEN_BILL_STATUS_LIST);
  const openBills = bills.filter((b) => openBillStatuses.has(b.status));
  const billedPoIds = new Set<number>(
    bills.map((b) => b.purchaseOrderId).filter((id): id is number => typeof id === "number"),
  );

  const behaviour = computePayBehaviour(history);
  const customerIdByRef = new Map<string, number>();
  for (const inv of invoices) if (inv.customerId != null) customerIdByRef.set(`invoice:${inv.id}`, inv.customerId);
  for (const r of recurring) if (r.customerId != null) customerIdByRef.set(`recurring:${r.id}`, r.customerId);

  let events: CashEvent[] = [
    ...receivablesToEventsWithBehaviour(invoices as any, behaviour),
    ...recurringToEvents(recurring.filter((r) => visible(r.companyId)) as any, horizonEnd, weekStart),
    ...billsToEvents(openBills as any),
    ...purchaseOrdersToEvents(pos as any, billedPoIds),
    ...payrollToEvents(payroll.filter((p) => visible(p.companyId)) as any),
    ...recurringExpensesToEvents(expenses as any, horizonEnd, weekStart),
  ];

  // Recurring refs carry a date suffix; map them to the template's customer.
  const refLookup = new Map<string, number>();
  for (const e of events) {
    if (!e.ref) continue;
    const base = e.ref.startsWith("recurring:") ? e.ref.split(":").slice(0, 2).join(":") : e.ref;
    const cid = customerIdByRef.get(base);
    if (cid != null) refLookup.set(e.ref, cid);
  }

  const notes: string[] = [];
  const rates = await fxRatesFor(events, asOf);
  const fx = convertEventsToUsd(events, rates);
  events = fx.events;
  if (fx.unconverted > 0) notes.push(`${fx.unconverted} item(s) have no USD rate in fx_rates and are added at face value.`);

  if (params.knobs) events = applyScenario(events, params.knobs, refLookup);
  events.push(...adjustmentsToEvents(params.adjustments ?? []));

  let startingCash = 0;
  let cashSource: CashSource = "none";
  let bankAccounts: { name: string; balance: number }[] = [];

  if (typeof params.startingCashOverride === "number" && Number.isFinite(params.startingCashOverride)) {
    startingCash = params.startingCashOverride;
    cashSource = "manual";
  } else {
    const bank = await loadBankCashForScope(params.scope);
    bankAccounts = bank.accounts.map((a) => ({ name: a.name, balance: a.balance }));
    if (bank.error) notes.push(`Bank balance unavailable (${bank.error}). Enter starting cash manually.`);
    else if (!bank.configured) notes.push("Mercury is not connected. Enter starting cash manually.");
    else if (bank.accountIds && bank.accountIds.length === 0) notes.push("No bank account is mapped to your entity yet. Ask an admin to map one, or enter starting cash manually.");
    else {
      startingCash = bank.total;
      cashSource = "mercury";
      if (bank.unmapped > 0 && params.scope.companyIds !== "all") notes.push(`${bank.unmapped} bank account(s) are not mapped to any entity.`);
    }
  }

  const forecast = buildCashForecast({ asOf, startingCash, events, weeks });
  if (forecast.overdueIn > 0) notes.push(`$${round2(forecast.overdueIn).toLocaleString("en-US")} of past-due customer money is placed in week 1.`);
  if (forecast.overdueOut > 0) notes.push(`$${round2(forecast.overdueOut).toLocaleString("en-US")} of past-due bills is placed in week 1.`);
  if (behaviour.size > 0) notes.push(`${behaviour.size} customer(s) forecast on their real payment timing instead of due date.`);

  return { ...forecast, cashSource, bankAccounts, nonUsdItems: fx.unconverted, notes, behaviourCustomers: behaviour.size };
}

// ── Snapshots & accuracy ────────────────────────────────────────

export async function snapshotForecast(scope: Scope, source: "scheduled" | "manual", createdBy?: number) {
  const forecast = await getCashForecast({ scope });
  const ids = scopeCompanyIds(scope);
  const weekStart = startOfWeek(new Date(forecast.asOf));
  return db.insertCashForecastSnapshotIfAbsent({
    companyId: ids && ids.length === 1 ? ids[0] : null,
    scopeKey: scopeKeyFor(scope),
    asOf: new Date(forecast.asOf),
    weekStart,
    startingCash: String(forecast.startingCash),
    weeks: forecast.weeks.map((w) => ({ start: w.start, end: w.end, totalIn: w.totalIn, totalOut: w.totalOut, closingCash: w.closingCash })),
    totalIn: String(forecast.totalIn),
    totalOut: String(forecast.totalOut),
    endingCash: String(forecast.endingCash),
    lowestCash: String(forecast.lowestCash),
    source,
    createdBy: createdBy ?? null,
  });
}

export async function getForecastAccuracy(scope: Scope, today = new Date()) {
  const snapshots = await db.getCashForecastSnapshots(scopeKeyFor(scope), 26);
  if (snapshots.length === 0) return { snapshots: [], latest: null };
  const bank = await loadBankCashForScope(scope);
  const earliest = snapshots.reduce((m, s) => (s.weekStart < m ? s.weekStart : m), snapshots[0].weekStart);
  const movements = await db.getBankCashByWeek(earliest, today, bank.accountIds);
  const graded = snapshots.map((s) => {
    const rows = gradeSnapshot(s.weeks, movements, today);
    return {
      id: s.id,
      asOf: isoDate(s.asOf),
      weekStart: isoDate(s.weekStart),
      source: s.source,
      startingCash: toAmount(s.startingCash),
      endingCash: toAmount(s.endingCash),
      lowestCash: toAmount(s.lowestCash),
      weeks: rows,
      summary: summarizeAccuracy(rows),
    };
  });
  return { snapshots: graded, latest: graded[0] };
}

// ── Alerts ──────────────────────────────────────────────────────

function fmtUsd(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Evaluate every active alert setting. Emails when the 13-week low point is
 * under the floor, at most once per week per setting (re-alerts sooner only
 * if the low point worsened by 10%+).
 */
export async function runCashForecastAlerts(now = new Date()): Promise<{ checked: number; sent: number; skipped: number }> {
  const settings = await db.getAllActiveCashForecastAlertSettings();
  let sent = 0;
  let skipped = 0;
  for (const s of settings) {
    const scope: Scope = s.scopeKey === "global"
      ? { mode: "global", companyIds: "all" }
      : { mode: "entity", companyIds: s.scopeKey.replace("entities:", "").split(",").map(Number).filter(Number.isFinite) };
    const forecast = await getCashForecast({ scope });
    const threshold = toAmount(s.thresholdAmount);
    if (forecast.lowestCash >= threshold) {
      skipped++;
      continue;
    }
    const prevAt = s.lastAlertedAt ? new Date(s.lastAlertedAt) : null;
    const lastLow = s.lastAlertLowestCash != null ? toAmount(s.lastAlertLowestCash) : null;
    const withinWeek = prevAt ? now.getTime() - prevAt.getTime() < 7 * 86_400_000 : false;
    const worsened = lastLow == null || forecast.lowestCash < lastLow - Math.abs(lastLow) * 0.1;
    if (withinWeek && !worsened) {
      skipped++;
      continue;
    }
    if (!isEmailConfigured()) {
      console.warn("[CashAlert] Email not configured; alert not sent for", s.scopeKey);
      skipped++;
      continue;
    }
    // Claim before sending so a concurrent run (scheduler + runNow, or two replicas) can't double-send.
    const claimed = await db.claimCashForecastAlert(s.id, prevAt, now, String(forecast.lowestCash));
    if (!claimed) {
      skipped++;
      continue;
    }
    const lowWeek = forecast.weeks[forecast.lowestWeek - 1];
    const lines = [
      `Projected cash drops to ${fmtUsd(forecast.lowestCash)} in the week of ${lowWeek?.start ?? "?"} (week ${forecast.lowestWeek} of ${forecast.weeks.length}).`,
      `Floor: ${fmtUsd(threshold)}. Starting cash: ${fmtUsd(forecast.startingCash)} (${forecast.cashSource}).`,
      `13-week money in: ${fmtUsd(forecast.totalIn)}. Money out: ${fmtUsd(forecast.totalOut)}. Ending cash: ${fmtUsd(forecast.endingCash)}.`,
      forecast.firstNegativeWeek ? `Cash goes negative in week ${forecast.firstNegativeWeek}.` : "",
      "",
      "Biggest outflows in the low week:",
      ...(lowWeek?.events
        .filter((e) => e.direction === "out")
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((e) => `  - ${e.date} ${e.label}: ${fmtUsd(e.amount)}`) ?? []),
    ].filter((l) => l !== undefined);
    const text = lines.join("\n");
    const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px">${text.replace(/</g, "&lt;")}</pre>`;
    let anySent = false;
    for (const to of s.recipients) {
      const res = await sendEmail({ to, subject: `Low cash warning: ${fmtUsd(forecast.lowestCash)} in week ${forecast.lowestWeek}`, text, html });
      if (res.success) anySent = true;
    }
    if (anySent) sent++;
    else {
      await db.releaseCashForecastAlert(s.id, prevAt, s.lastAlertLowestCash ?? null);
      skipped++;
    }
  }
  return { checked: settings.length, sent, skipped };
}

// ── Export ──────────────────────────────────────────────────────

export function forecastToXlsx(forecast: CashForecastResult): { data: string; filename: string; mimeType: string; encoding: "base64" } {
  const wb = XLSX.utils.book_new();
  const categoriesIn: CashCategory[] = ["customer_receipts", "recurring_billing", "adjustment_in"];
  const categoriesOut: CashCategory[] = ["vendor_bills", "purchase_orders", "payroll", "recurring_expenses", "adjustment_out"];
  const header = ["Line", ...forecast.weeks.map((w) => `W${w.index} ${w.start}`)];
  const rows: (string | number)[][] = [header];
  rows.push(["Opening cash", ...forecast.weeks.map((w) => w.openingCash)]);
  rows.push(["MONEY IN"]);
  for (const c of categoriesIn) rows.push([`  ${CATEGORY_LABELS[c]}`, ...forecast.weeks.map((w) => w.inflows[c] ?? 0)]);
  rows.push(["Total in", ...forecast.weeks.map((w) => w.totalIn)]);
  rows.push(["MONEY OUT"]);
  for (const c of categoriesOut) rows.push([`  ${CATEGORY_LABELS[c]}`, ...forecast.weeks.map((w) => w.outflows[c] ?? 0)]);
  rows.push(["Total out", ...forecast.weeks.map((w) => w.totalOut)]);
  rows.push(["Net change", ...forecast.weeks.map((w) => w.net)]);
  rows.push(["Closing cash", ...forecast.weeks.map((w) => w.closingCash)]);
  const grid = XLSX.utils.aoa_to_sheet(rows);
  grid["!cols"] = [{ wch: 26 }, ...forecast.weeks.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, grid, "13-week forecast");

  const detail: (string | number)[][] = [["Week", "Date", "Direction", "Category", "Item", "Amount", "Past due"]];
  for (const w of forecast.weeks) {
    for (const e of w.events) detail.push([`W${w.index}`, e.date, e.direction === "in" ? "In" : "Out", CATEGORY_LABELS[e.category], e.label, e.amount, e.overdue ? "yes" : ""]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  ws2["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 9 }, { wch: 22 }, { wch: 44 }, { wch: 14 }, { wch: 9 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Items");

  const summary = [
    ["As of", forecast.asOf],
    ["Starting cash", forecast.startingCash],
    ["Cash source", forecast.cashSource],
    ["Total in", forecast.totalIn],
    ["Total out", forecast.totalOut],
    ["Ending cash", forecast.endingCash],
    ["Lowest cash", forecast.lowestCash],
    ["Lowest week", forecast.lowestWeek],
    ["First negative week", forecast.firstNegativeWeek ?? ""],
    ...forecast.notes.map((n) => ["Note", n]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(summary);
  ws3["!cols"] = [{ wch: 20 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Summary");

  const data = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  return { data, filename: `cash-forecast-${forecast.asOf}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", encoding: "base64" };
}

// ── Collections ─────────────────────────────────────────────────

export interface CollectionsRow {
  invoiceId: number;
  invoiceNumber: string;
  customerId: number | null;
  customerName: string;
  customerEmail: string | null;
  dueDate: string | null;
  daysOverdue: number;
  outstanding: number;
  currency: string;
}

/** Overdue customer invoices, largest outstanding first. */
export async function getCollectionsQueue(scope: Scope, today = new Date()): Promise<CollectionsRow[]> {
  const invoices = await db.getInvoices(scope, { statuses: OPEN_INVOICE_STATUS_LIST });
  const t = today.getTime();
  const rows: CollectionsRow[] = [];
  for (const inv of invoices) {
    if ((inv.type ?? "invoice") !== "invoice") continue;
    const outstanding = round2(toAmount(inv.totalAmount) - toAmount(inv.paidAmount));
    if (outstanding <= 0.005 || !inv.dueDate) continue;
    const due = new Date(inv.dueDate).getTime();
    if (due >= t) continue;
    rows.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId ?? null,
      customerName: inv.customer?.name ?? "Customer",
      customerEmail: inv.customer?.email ?? null,
      dueDate: isoDate(new Date(inv.dueDate)),
      daysOverdue: Math.floor((t - due) / 86_400_000),
      outstanding,
      currency: inv.currency ?? "USD",
    });
  }
  return rows.sort((a, b) => b.outstanding - a.outstanding);
}

export async function sendCollectionReminder(scope: Scope, invoiceId: number, opts?: { fromName?: string; replyTo?: string }): Promise<{ success: boolean; error?: string }> {
  const inv = await db.getInvoiceById(invoiceId);
  if (!inv || !scopeAllows(scope, inv.companyId)) return { success: false, error: "Invoice not found" };
  // Same rules as the queue: only an open, overdue invoice with money still owed gets a reminder.
  const openStatuses = new Set<string>(OPEN_INVOICE_STATUS_LIST);
  if ((inv.type ?? "invoice") !== "invoice" || !openStatuses.has(inv.status)) return { success: false, error: "Invoice is not open" };
  const outstanding = round2(toAmount(inv.totalAmount) - toAmount(inv.paidAmount));
  if (outstanding <= 0.005) return { success: false, error: "Nothing outstanding on this invoice" };
  if (!inv.dueDate || new Date(inv.dueDate).getTime() >= Date.now()) return { success: false, error: "Invoice is not overdue yet" };
  if (!inv.customerId) return { success: false, error: "Invoice has no customer" };
  const customer = await db.getCustomerById(inv.customerId);
  if (!customer?.email) return { success: false, error: "Customer has no email" };
  const due = inv.dueDate ? isoDate(new Date(inv.dueDate)) : "on receipt";
  const amount = `${inv.currency ?? "USD"} ${outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const text = [
    `Hi ${customer.name},`,
    "",
    `Invoice ${inv.invoiceNumber} for ${amount} was due ${due} and is still open.`,
    "Could you let us know when payment is scheduled? If it has already been sent, please reply with the remittance details so we can match it.",
    "",
    "Thank you,",
    opts?.fromName ?? "Superhumn Finance",
  ].join("\n");
  const html = text
    .split("\n")
    .map((l) => (l === "" ? "<br/>" : `<p style="margin:0 0 4px">${l.replace(/</g, "&lt;")}</p>`))
    .join("");
  if (!isEmailConfigured()) return { success: false, error: "Email is not configured (SENDGRID_API_KEY)" };
  const res = await sendEmail({ to: customer.email, subject: `Payment reminder: invoice ${inv.invoiceNumber}`, text, html, replyTo: opts?.replyTo });
  return res.success ? { success: true } : { success: false, error: res.error ?? "Send failed" };
}
