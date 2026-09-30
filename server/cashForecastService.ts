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
import { htmlToPdfBase64 } from "./_core/messageExport";
import { sendToChannel, type ChannelTarget, type OutboundMessage } from "./cashNotifyService";
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
  billsToEventsWithBehaviour,
  buildCashForecast,
  computePayBehaviour,
  computeVendorBehaviour,
  convertEventsToUsd,
  deriveAlerts,
  gradeSnapshot,
  isoDate,
  ledgerToMovements,
  pipelineToEvents,
  projectEventsToEvents,
  rollupMonths,
  splitByEntity,
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
  type EntityForecast,
  type ForecastAlert,
  type ForecastMonth,
  type ManualAdjustment,
  type ScenarioKnobs,
} from "./cashForecastLogic";

export type CashSource = "mercury" | "manual" | "none";

export interface InventoryLock {
  totalValue: number;
  items: { productId: number; productName: string; sku: string | null; quantity: number; totalValue: number }[];
}

export interface CashForecastResult extends CashForecast {
  cashSource: CashSource;
  bankAccounts: { name: string; balance: number }[];
  nonUsdItems: number;
  notes: string[];
  behaviourCustomers: number;
  behaviourVendors: number;
  /** Weighted pipeline is shown separately and only added to the totals when `includePipeline` is set. */
  pipelineWeightedTotal: number;
  months: ForecastMonth[];
  byEntity: EntityForecast[];
  inventory: InventoryLock;
  alerts: ForecastAlert[];
}

export interface ForecastOptions {
  scope: Scope;
  asOf?: Date;
  weeks?: number;
  startingCashOverride?: number | null;
  adjustments?: ManualAdjustment[];
  knobs?: ScenarioKnobs;
  /** Add probability-weighted CRM deals as inflows. Off by default. */
  includePipeline?: boolean;
  /** Also add planned project cash events. On by default. */
  includeProjects?: boolean;
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
    return { accounts, configured: res.configured ?? true };
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
  // Sources are generated through the 12-month window so the monthly view is
  // as full as the weekly one; buildCashForecast drops what lies past its horizon.
  const longHorizonEnd = addDays(weekStart, Math.max(weeks, 53) * 7);
  const scopeIds = params.scope.companyIds === "all" ? undefined : params.scope.companyIds;
  const visible = (companyId: number | null | undefined) => scopeAllows(params.scope, companyId);

  const includeProjects = params.includeProjects ?? true;
  const [invoices, bills, pos, recurring, payroll, expenses, history, billHistory, deals, projects, inventoryRows, companies] = await Promise.all([
    db.getInvoices(params.scope, { statuses: OPEN_INVOICE_STATUS_LIST }),
    db.getBills({ companyIds: scopeIds, statuses: PO_SUPPRESSING_BILL_STATUS_LIST }),
    db.getOpenPurchaseOrdersForForecast(params.scope, OPEN_PO_STATUS_LIST),
    db.getRecurringInvoices({ isActive: true }),
    db.getEmployeePayments({ status: "pending" }),
    db.getRecurringExpenses(params.scope, { isActive: true }),
    db.getInvoicePaymentHistory(params.scope, addDays(asOf, -365)),
    db.getBillPaymentHistory(params.scope, addDays(asOf, -365)),
    params.includePipeline ? db.getOpenCrmDealsForForecast(params.scope, longHorizonEnd) : Promise.resolve([]),
    includeProjects ? db.getOpenPmCashEvents(params.scope) : Promise.resolve([]),
    db.getInventoryValuationForScope(params.scope),
    db.getCompanies(),
  ]);

  const openBillStatuses = new Set<string>(OPEN_BILL_STATUS_LIST);
  const openBills = bills.filter((b) => openBillStatuses.has(b.status));
  const billedPoIds = new Set<number>(
    bills.map((b) => b.purchaseOrderId).filter((id): id is number => typeof id === "number"),
  );

  const behaviour = computePayBehaviour(history);
  const vendorBehaviour = computeVendorBehaviour(billHistory);
  const customerIdByRef = new Map<string, number>();
  for (const inv of invoices) if (inv.customerId != null) customerIdByRef.set(`invoice:${inv.id}`, inv.customerId);
  for (const r of recurring) if (r.customerId != null) customerIdByRef.set(`recurring:${r.id}`, r.customerId);

  let events: CashEvent[] = [
    ...receivablesToEventsWithBehaviour(invoices as any, behaviour),
    ...recurringToEvents(recurring.filter((r) => visible(r.companyId)) as any, longHorizonEnd, weekStart),
    ...billsToEventsWithBehaviour(openBills as any, vendorBehaviour, asOf),
    ...purchaseOrdersToEvents(pos as any, billedPoIds),
    ...payrollToEvents(payroll.filter((p) => visible(p.companyId)) as any),
    ...recurringExpensesToEvents(expenses as any, longHorizonEnd, weekStart),
    ...projectEventsToEvents(projects as any),
    ...pipelineToEvents(deals as any),
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
  // Upside figure in USD, after conversion, limited to the 13-week window the totals cover.
  const pipelineWeightedTotal = round2(
    events.filter((e) => e.category === "pipeline_weighted" && e.date.getTime() < horizonEnd.getTime()).reduce((s, e) => s + e.amount, 0),
  );

  let startingCash = 0;
  let cashSource: CashSource = "none";
  let bankAccounts: { name: string; balance: number }[] = [];
  const startingCashByCompany = new Map<number | null, number>();

  if (typeof params.startingCashOverride === "number" && Number.isFinite(params.startingCashOverride)) {
    startingCash = params.startingCashOverride;
    cashSource = "manual";
  } else {
    const bank = await loadBankCashForScope(params.scope);
    bankAccounts = bank.accounts.map((a) => ({ name: a.name, balance: a.balance }));
    // Per-entity starting cash from the account mapping (unmapped accounts stay with "Unassigned").
    const map = await db.getBankAccountEntityMap();
    const byAccount = new Map(map.map((m) => [m.externalAccountId, m.companyId]));
    for (const a of bank.accounts) {
      const cid = byAccount.get(a.id) ?? null;
      startingCashByCompany.set(cid, (startingCashByCompany.get(cid) ?? 0) + a.balance);
    }
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
  if (vendorBehaviour.size > 0) notes.push(`${vendorBehaviour.size} vendor(s) forecast on when we actually pay them; autopay bills stay on due date.`);
  if (params.includePipeline && pipelineWeightedTotal > 0) notes.push(`$${pipelineWeightedTotal.toLocaleString("en-US")} of probability-weighted pipeline is included. Treat it as upside, not a receivable.`);

  // 12-month view from the dated events themselves.
  const months = rollupMonths({ asOf, startingCash, events, months: 12 });

  // Per-entity split (global scope only shows more than one row).
  const names = new Map<number | null, string>(companies.map((c) => [c.id, c.name] as [number | null, string]));
  names.set(null, "Unassigned");
  if (cashSource === "manual") {
    // A single-entity scope owns the override; only global / multi-entity overrides stay unassigned.
    const sole = scopeIds && scopeIds.length === 1 ? scopeIds[0] : null;
    startingCashByCompany.set(sole, startingCash);
  }
  const byEntity = splitByEntity({ asOf, events, weeks, startingCashByCompany, names });

  // Inventory at cost: money already spent, sitting on a shelf.
  const inventory = summarizeInventory(inventoryRows);
  if (inventory.totalValue > 0) notes.push(`$${Math.round(inventory.totalValue).toLocaleString("en-US")} is tied up in inventory at cost (${inventory.items.length} SKU(s)).`);

  return {
    ...forecast,
    cashSource,
    bankAccounts,
    nonUsdItems: fx.unconverted,
    notes,
    behaviourCustomers: behaviour.size,
    behaviourVendors: vendorBehaviour.size,
    pipelineWeightedTotal,
    months,
    byEntity,
    inventory,
    alerts: deriveAlerts(forecast),
  };
}

function summarizeInventory(rows: { productId: number; productName: string | null; sku: string | null; quantity: string | number | null; totalValue: string | number | null }[]): InventoryLock {
  const byProduct = new Map<number, InventoryLock["items"][number]>();
  for (const r of rows) {
    const cur = byProduct.get(r.productId) ?? { productId: r.productId, productName: r.productName ?? `Product ${r.productId}`, sku: r.sku ?? null, quantity: 0, totalValue: 0 };
    cur.quantity = round2(cur.quantity + toAmount(r.quantity));
    cur.totalValue = round2(cur.totalValue + toAmount(r.totalValue));
    byProduct.set(r.productId, cur);
  }
  const items = [...byProduct.values()].sort((a, b) => b.totalValue - a.totalValue);
  return { totalValue: round2(items.reduce((s, i) => s + i.totalValue, 0)), items };
}

// ── Snapshots & accuracy ────────────────────────────────────────

export async function snapshotForecast(scope: Scope, source: "scheduled" | "manual", createdBy?: number) {
  const forecast = await getCashForecast({ scope });
  const ids = scopeCompanyIds(scope);
  const weekStart = startOfWeek(new Date(forecast.asOf));
  // Keep Model vs Actual and the investor views on the same numbers.
  await syncForecastToFinancialModel(forecast, ids && ids.length === 1 ? ids[0] : null);
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
  const [movements, ledgerRows] = await Promise.all([
    db.getBankCashByWeek(earliest, today, bank.accountIds),
    db.getCompletedPaymentsByDateRange(scope, earliest, today),
  ]);
  const ledger = ledgerToMovements(ledgerRows);
  const graded = snapshots.map((s) => {
    const rows = gradeSnapshot(s.weeks, movements, today);
    const ledgerWeeks = gradeSnapshot(s.weeks, ledger, today);
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
      ledgerWeeks,
      ledgerSummary: summarizeAccuracy(ledgerWeeks),
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
    const channels = (await db.getCashNotificationChannels(s.scopeKey)).filter((c) => c.isActive && c.sendAlerts);
    const msg: OutboundMessage = { title: `Low cash warning: ${fmtUsd(forecast.lowestCash)} in week ${forecast.lowestWeek}`, text, data: { lowestCash: forecast.lowestCash, lowestWeek: forecast.lowestWeek, threshold, endingCash: forecast.endingCash } };
    for (const c of channels) {
      const r = await sendToChannel({ type: c.type, target: c.target }, msg);
      await db.markCashNotificationChannelResult(c.id, r.ok, r.error);
      if (r.ok) anySent = true;
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


// ── Financial model sync ────────────────────────────────────────

export async function syncForecastToFinancialModel(forecast: CashForecastResult, companyId: number | null) {
  const rows = forecast.months.map((m) => {
    const [y, mo] = m.key.split("-").map(Number);
    return { companyId, year: y, month: mo, closingCash: m.closingCash, totalIn: m.totalIn, totalOut: m.totalOut };
  });
  return db.upsertCashForecastFinancialModelRows(rows);
}

// ── Monday digest ───────────────────────────────────────────────

export function composeDigest(f: CashForecastResult, scopeLabel = "Superhumn"): OutboundMessage {
  const low = f.weeks[f.lowestWeek - 1];
  const nextWeek = f.weeks[0];
  const topOut = [...(low?.events ?? [])].filter((e) => e.direction === "out").sort((a, b) => b.amount - a.amount).slice(0, 3);
  const topIn = [...(nextWeek?.events ?? [])].filter((e) => e.direction === "in").sort((a, b) => b.amount - a.amount).slice(0, 3);
  const lines = [
    `Cash now: ${fmtUsd(f.startingCash)} (${f.cashSource === "mercury" ? "Mercury" : f.cashSource})`,
    `Low point: ${fmtUsd(f.lowestCash)} in week ${f.lowestWeek} (${low?.start ?? "?"})`,
    `Week 13 ending cash: ${fmtUsd(f.endingCash)}`,
    f.firstNegativeWeek ? `⚠️ Cash goes negative in week ${f.firstNegativeWeek}` : "",
    "",
    `This week: +${fmtUsd(nextWeek?.totalIn ?? 0)} in, −${fmtUsd(nextWeek?.totalOut ?? 0)} out`,
    ...topIn.map((e) => `- In: ${e.label} ${fmtUsd(e.amount)}${e.overdue ? " (past due)" : ""}`),
    "",
    `Biggest risks in the low week (${low?.start ?? "?"}):`,
    ...topOut.map((e) => `- ${e.label}: ${fmtUsd(e.amount)}`),
    f.overdueIn > 0 ? `Past-due receivables: ${fmtUsd(f.overdueIn)}` : "",
    f.inventory.totalValue > 0 ? `Cash in inventory: ${fmtUsd(f.inventory.totalValue)}` : "",
    f.byEntity.length > 1 ? "" : "",
    ...(f.byEntity.length > 1 ? ["By entity:", ...f.byEntity.map((e) => `- ${e.name}: ${fmtUsd(e.startingCash)} → low ${fmtUsd(e.lowestCash)} → end ${fmtUsd(e.endingCash)}`)] : []),
  ].filter((l) => l !== undefined);
  // collapse double blanks
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    title: `${scopeLabel} cash digest, week of ${nextWeek?.start ?? isoDate(new Date(f.asOf))}`,
    text,
    data: { startingCash: f.startingCash, lowestCash: f.lowestCash, lowestWeek: f.lowestWeek, endingCash: f.endingCash, firstNegativeWeek: f.firstNegativeWeek, overdueIn: f.overdueIn, inventoryValue: f.inventory.totalValue, byEntity: f.byEntity },
  };
}

function scopeFromKey(scopeKey: string): Scope {
  return scopeKey === "global"
    ? { mode: "global", companyIds: "all" }
    : { mode: "entity", companyIds: scopeKey.replace("entities:", "").split(",").map(Number).filter(Number.isFinite) };
}

/** Send the digest to every active channel that wants it, grouped by scope so each entity gets its own numbers. */
/**
 * Send the digest to every active channel that wants it, grouped by scope so
 * each entity gets its own numbers. Each channel is claimed once per week
 * (conditional UPDATE on lastSentAt) so replicas and restart re-ticks never
 * double-send; `force` (the "send now" button) bypasses the weekly claim.
 */
export async function runCashDigest(opts: { force?: boolean; now?: Date } = {}): Promise<{ scopes: number; sent: number; failed: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const weekStart = startOfWeek(now);
  const channels = (await db.getAllActiveCashNotificationChannels()).filter((c) => c.sendDigest);
  const byScope = new Map<string, typeof channels>();
  for (const c of channels) byScope.set(c.scopeKey, [...(byScope.get(c.scopeKey) ?? []), c]);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const [scopeKey, list] of byScope) {
    // Claim before the (slow) forecast so a losing replica does no work at all.
    const claimed: { channel: (typeof list)[number]; prev: Date | null }[] = [];
    for (const c of list) {
      const claim = await db.claimCashNotificationDigest(c.id, weekStart, now, opts.force === true);
      if (claim.claimed) claimed.push({ channel: c, prev: claim.previousLastSentAt });
      else skipped++;
    }
    if (claimed.length === 0) continue;
    let msg: OutboundMessage;
    try {
      msg = composeDigest(await getCashForecast({ scope: scopeFromKey(scopeKey), asOf: now }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      for (const { channel, prev } of claimed) await db.releaseCashNotificationDigest(channel.id, prev, reason);
      failed += claimed.length;
      continue;
    }
    for (const { channel, prev } of claimed) {
      const r = await sendToChannel({ type: channel.type, target: channel.target }, msg);
      if (r.ok) sent++;
      else {
        await db.releaseCashNotificationDigest(channel.id, prev, r.error ?? "send failed");
        failed++;
      }
    }
  }
  return { scopes: byScope.size, sent, failed, skipped };
}

export async function sendTestToChannel(channel: ChannelTarget, scope: Scope): Promise<{ ok: boolean; error?: string }> {
  const forecast = await getCashForecast({ scope });
  const msg = composeDigest(forecast);
  return sendToChannel(channel, { ...msg, title: `[Test] ${msg.title}` });
}

// ── Board pack PDF ──────────────────────────────────────────────

function svgLineChart(points: { label: string; value: number }[], width = 720, height = 220): string {
  if (points.length === 0) return "";
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const vals = points.map((p) => p.value);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * w;
  const y = (v: number) => pad.t + h - ((v - min) / span) * h;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const zero = y(0);
  const ticks = [max, (max + min) / 2, min];
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif;font-size:10px">
  ${ticks.map((t) => `<text x="${pad.l - 6}" y="${y(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle" fill="#666">${fmtUsd(t)}</text><line x1="${pad.l}" x2="${width - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#eee"/>`).join("")}
  <line x1="${pad.l}" x2="${width - pad.r}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke="#c33" stroke-dasharray="4 3"/>
  <path d="${path}" fill="none" stroke="#1f5fbf" stroke-width="2"/>
  ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5" fill="#1f5fbf"/>`).join("")}
  ${points.map((p, i) => (i % Math.ceil(points.length / 13) === 0 ? `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="#666">${p.label}</text>` : "")).join("")}
</svg>`;
}

export function forecastToBoardPackHtml(f: CashForecastResult, opts: { companyName?: string; preparedBy?: string } = {}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const low = f.weeks[f.lowestWeek - 1];
  const chart = svgLineChart(f.weeks.map((w) => ({ label: w.start.slice(5), value: w.closingCash })));
  const monthRows = f.months.map((m) => `<tr><td>${m.label}</td><td class="n">${fmtUsd(m.openingCash)}</td><td class="n">${fmtUsd(m.totalIn)}</td><td class="n">${fmtUsd(m.totalOut)}</td><td class="n ${m.closingCash < 0 ? "neg" : ""}">${fmtUsd(m.closingCash)}</td></tr>`).join("");
  const weekRows = f.weeks.map((w) => `<tr><td>W${w.index} · ${w.start}</td><td class="n">${fmtUsd(w.openingCash)}</td><td class="n">${fmtUsd(w.totalIn)}</td><td class="n">${fmtUsd(w.totalOut)}</td><td class="n ${w.closingCash < 0 ? "neg" : ""}">${fmtUsd(w.closingCash)}</td></tr>`).join("");
  const entityRows = f.byEntity.length > 1 ? `<h2>By entity</h2><table><thead><tr><th>Entity</th><th class="n">Start</th><th class="n">In</th><th class="n">Out</th><th class="n">Low</th><th class="n">End</th></tr></thead><tbody>${f.byEntity.map((e) => `<tr><td>${esc(e.name)}</td><td class="n">${fmtUsd(e.startingCash)}</td><td class="n">${fmtUsd(e.totalIn)}</td><td class="n">${fmtUsd(e.totalOut)}</td><td class="n ${e.lowestCash < 0 ? "neg" : ""}">${fmtUsd(e.lowestCash)}</td><td class="n">${fmtUsd(e.endingCash)}</td></tr>`).join("")}</tbody></table>` : "";
  const risks = (low?.events ?? []).filter((e) => e.direction === "out").sort((a, b) => b.amount - a.amount).slice(0, 8);
  const alerts = f.alerts.map((a) => `<li><strong>${a.type}</strong> (${a.severity}): ${esc(a.description)} <em>${esc(a.suggestedAction)}</em></li>`).join("");
  const inv = f.inventory.items.slice(0, 10).map((i) => `<tr><td>${esc(i.productName)}${i.sku ? ` <span class="muted">${esc(i.sku)}</span>` : ""}</td><td class="n">${i.quantity.toLocaleString("en-US")}</td><td class="n">${fmtUsd(i.totalValue)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cash forecast</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:10pt;color:#111;margin:0}
  h1{font-size:18pt;margin:0 0 2px} h2{font-size:12pt;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
  .sub{color:#666;margin-bottom:12px}
  .tiles{display:flex;gap:10px;margin:10px 0}
  .tile{flex:1;border:1px solid #ddd;border-radius:6px;padding:8px}
  .tile .l{font-size:8pt;color:#666} .tile .v{font-size:14pt;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:9pt} th,td{padding:3px 6px;border-bottom:1px solid #eee;text-align:left} th{background:#f6f6f6}
  .n{text-align:right;font-variant-numeric:tabular-nums} .neg{color:#b00020;font-weight:600} .muted{color:#888;font-size:8pt}
  ul{margin:4px 0 0 16px;padding:0} li{margin-bottom:3px}
  .pb{page-break-before:always}
</style></head><body>
<h1>${esc(opts.companyName ?? "Superhumn")} · 13-week cash forecast</h1>
<div class="sub">As of ${f.asOf} · starting cash from ${f.cashSource === "mercury" ? "bank (Mercury)" : f.cashSource}${opts.preparedBy ? ` · prepared by ${esc(opts.preparedBy)}` : ""}</div>
<div class="tiles">
  <div class="tile"><div class="l">Cash now</div><div class="v">${fmtUsd(f.startingCash)}</div></div>
  <div class="tile"><div class="l">Money in (13 wks)</div><div class="v">${fmtUsd(f.totalIn)}</div></div>
  <div class="tile"><div class="l">Money out (13 wks)</div><div class="v">${fmtUsd(f.totalOut)}</div></div>
  <div class="tile"><div class="l">Low point (W${f.lowestWeek})</div><div class="v ${f.lowestCash < 0 ? "neg" : ""}">${fmtUsd(f.lowestCash)}</div></div>
  <div class="tile"><div class="l">Week 13</div><div class="v ${f.endingCash < 0 ? "neg" : ""}">${fmtUsd(f.endingCash)}</div></div>
</div>
${chart}
${alerts ? `<h2>What to watch</h2><ul>${alerts}</ul>` : ""}
<h2>Biggest outflows in the low week (${low?.start ?? ""})</h2>
<table><thead><tr><th>Date</th><th>Item</th><th class="n">Amount</th></tr></thead><tbody>${risks.map((e) => `<tr><td>${e.date}</td><td>${esc(e.label)}</td><td class="n">${fmtUsd(e.amount)}</td></tr>`).join("")}</tbody></table>
${entityRows}
<h2>12-month view</h2>
<table><thead><tr><th>Month</th><th class="n">Opening</th><th class="n">In</th><th class="n">Out</th><th class="n">Closing</th></tr></thead><tbody>${monthRows}</tbody></table>
${f.inventory.totalValue > 0 ? `<h2>Cash tied up in inventory: ${fmtUsd(f.inventory.totalValue)}</h2><table><thead><tr><th>Product</th><th class="n">Qty</th><th class="n">At cost</th></tr></thead><tbody>${inv}</tbody></table>` : ""}
<h2 class="pb">Week by week</h2>
<table><thead><tr><th>Week</th><th class="n">Opening</th><th class="n">In</th><th class="n">Out</th><th class="n">Closing</th></tr></thead><tbody>${weekRows}</tbody></table>
${f.notes.length ? `<h2>Notes</h2><ul>${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
</body></html>`;
}

export async function forecastToPdf(f: CashForecastResult, opts: { companyName?: string; preparedBy?: string } = {}) {
  const html = forecastToBoardPackHtml(f, opts);
  const data = await htmlToPdfBase64(html);
  return { data, filename: `cash-forecast-${f.asOf}.pdf`, mimeType: "application/pdf", encoding: "base64" as const };
}
