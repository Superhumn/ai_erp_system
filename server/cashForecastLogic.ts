/**
 * Rolling 13-week cash forecast — pure logic, no DB access.
 *
 * Every future cash movement becomes a dated CashEvent. Events are bucketed
 * into Monday-start weeks; each week carries opening cash, inflows and
 * outflows by category, and closing cash. Past-due items land in week 1
 * (flagged overdue) because that is the earliest they can realistically move.
 * Items dated beyond the horizon are dropped.
 *
 * cashForecastService.ts loads rows and calls the *ToEvents converters here.
 */

export const DEFAULT_FORECAST_WEEKS = 13;
const DAY_MS = 86_400_000;
const DEFAULT_TERMS_DAYS = 30;

export const CASH_CATEGORIES = [
  "customer_receipts",
  "recurring_billing",
  "vendor_bills",
  "purchase_orders",
  "payroll",
  "recurring_expenses",
  "project_events",
  "pipeline_weighted",
  "adjustment_in",
  "adjustment_out",
] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CashCategory, string> = {
  customer_receipts: "Customer invoices",
  recurring_billing: "Recurring billing",
  vendor_bills: "Vendor bills",
  purchase_orders: "Open purchase orders",
  payroll: "Payroll",
  recurring_expenses: "Recurring expenses",
  project_events: "Project cash events",
  pipeline_weighted: "Weighted pipeline (not committed)",
  adjustment_in: "Manual inflows",
  adjustment_out: "Manual outflows",
};

export type CashDirection = "in" | "out";

export interface CashEvent {
  date: Date;
  amount: number; // always positive; direction carries the sign
  direction: CashDirection;
  category: CashCategory;
  label: string;
  ref?: string;
  currency?: string;
  companyId?: number | null;
}

export interface ForecastEventRow {
  date: string; // ISO date (yyyy-mm-dd) the cash is expected
  amount: number;
  direction: CashDirection;
  category: CashCategory;
  label: string;
  ref?: string;
  overdue: boolean;
}

export interface ForecastWeek {
  index: number; // 1-based
  start: string; // Monday, yyyy-mm-dd
  end: string; // Sunday, yyyy-mm-dd
  openingCash: number;
  inflows: Partial<Record<CashCategory, number>>;
  outflows: Partial<Record<CashCategory, number>>;
  totalIn: number;
  totalOut: number;
  net: number;
  closingCash: number;
  events: ForecastEventRow[];
}

export interface CashForecast {
  asOf: string;
  startingCash: number;
  weeks: ForecastWeek[];
  totalIn: number;
  totalOut: number;
  endingCash: number;
  lowestCash: number;
  lowestWeek: number; // 1-based
  firstNegativeWeek: number | null;
  overdueIn: number;
  overdueOut: number;
}

// ── helpers ─────────────────────────────────────────────────────

export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Midnight UTC of the calendar day of `d`. */
export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Midnight UTC of the Monday on or before `d`. */
export function startOfWeek(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(day, -back);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── builder ─────────────────────────────────────────────────────

export function buildCashForecast(params: {
  asOf: Date;
  startingCash: number;
  events: CashEvent[];
  weeks?: number;
}): CashForecast {
  const weekCount = params.weeks ?? DEFAULT_FORECAST_WEEKS;
  const firstWeek = startOfWeek(params.asOf);
  const horizonEnd = addDays(firstWeek, weekCount * 7); // exclusive
  const today = startOfDay(params.asOf);

  const weeks: ForecastWeek[] = [];
  for (let i = 0; i < weekCount; i++) {
    const start = addDays(firstWeek, i * 7);
    weeks.push({
      index: i + 1,
      start: isoDate(start),
      end: isoDate(addDays(start, 6)),
      openingCash: 0,
      inflows: {},
      outflows: {},
      totalIn: 0,
      totalOut: 0,
      net: 0,
      closingCash: 0,
      events: [],
    });
  }

  let overdueIn = 0;
  let overdueOut = 0;

  for (const e of params.events) {
    if (!(e.amount > 0)) continue;
    if (e.date.getTime() >= horizonEnd.getTime()) continue;
    // Overdue is judged against the as-of calendar date; anything before the
    // first week's Monday is clamped into week 1 whether or not it is overdue.
    const overdue = e.date.getTime() < today.getTime();
    const idx = e.date.getTime() < firstWeek.getTime() ? 0 : Math.floor((e.date.getTime() - firstWeek.getTime()) / (7 * DAY_MS));
    const w = weeks[idx];
    const bucket = e.direction === "in" ? w.inflows : w.outflows;
    bucket[e.category] = (bucket[e.category] ?? 0) + e.amount;
    if (overdue) {
      if (e.direction === "in") overdueIn += e.amount;
      else overdueOut += e.amount;
    }
    w.events.push({
      date: isoDate(e.date),
      amount: round2(e.amount),
      direction: e.direction,
      category: e.category,
      label: e.label,
      ref: e.ref,
      overdue,
    });
  }

  let cash = params.startingCash;
  let lowestCash = Number.POSITIVE_INFINITY;
  let lowestWeek = 1;
  let firstNegativeWeek: number | null = null;
  let totalIn = 0;
  let totalOut = 0;

  for (const w of weeks) {
    for (const k of Object.keys(w.inflows) as CashCategory[]) w.inflows[k] = round2(w.inflows[k]!);
    for (const k of Object.keys(w.outflows) as CashCategory[]) w.outflows[k] = round2(w.outflows[k]!);
    w.totalIn = round2(Object.values(w.inflows).reduce((s, v) => s + (v ?? 0), 0));
    w.totalOut = round2(Object.values(w.outflows).reduce((s, v) => s + (v ?? 0), 0));
    w.net = round2(w.totalIn - w.totalOut);
    w.openingCash = round2(cash);
    cash = cash + w.net;
    w.closingCash = round2(cash);
    w.events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
    totalIn += w.totalIn;
    totalOut += w.totalOut;
    if (w.closingCash < lowestCash) {
      lowestCash = w.closingCash;
      lowestWeek = w.index;
    }
    if (firstNegativeWeek === null && w.closingCash < 0) firstNegativeWeek = w.index;
  }

  return {
    asOf: isoDate(params.asOf),
    startingCash: round2(params.startingCash),
    weeks,
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    endingCash: round2(cash),
    lowestCash: weeks.length ? lowestCash : round2(params.startingCash),
    lowestWeek,
    firstNegativeWeek,
    overdueIn: round2(overdueIn),
    overdueOut: round2(overdueOut),
  };
}

// ── row → event converters ──────────────────────────────────────

export const OPEN_INVOICE_STATUS_LIST = ["sent", "partial", "overdue"] as const;
export const OPEN_BILL_STATUS_LIST = ["pending_approval", "approved", "scheduled", "partially_paid", "overdue"] as const;
export const OPEN_PO_STATUS_LIST = ["sent", "confirmed", "partial"] as const;
/**
 * Bill states that mean a PO's spend is already represented elsewhere: open
 * bills are forecast as bills, paid ones have left the bank. A draft, disputed
 * or cancelled bill does not settle the PO, so the PO is still forecast.
 */
export const PO_SUPPRESSING_BILL_STATUS_LIST = [...OPEN_BILL_STATUS_LIST, "paid"] as const;
const OPEN_INVOICE_STATUSES = new Set<string>(OPEN_INVOICE_STATUS_LIST);
const OPEN_BILL_STATUSES = new Set<string>(OPEN_BILL_STATUS_LIST);
const OPEN_PO_STATUSES = new Set<string>(OPEN_PO_STATUS_LIST);

export interface InvoiceLike {
  id: number;
  companyId?: number | null;
  invoiceNumber?: string | null;
  type?: string | null;
  status: string;
  issueDate: Date | string | null;
  dueDate: Date | string | null;
  totalAmount: string | number | null;
  paidAmount?: string | number | null;
  currency?: string | null;
  customer?: { name?: string | null } | null;
}

/** Open customer invoices → expected receipts on the due date (issue date + 30 if no due date). */
export function receivablesToEvents(rows: InvoiceLike[]): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if ((r.type ?? "invoice") !== "invoice") continue;
    if (!OPEN_INVOICE_STATUSES.has(r.status)) continue;
    const outstanding = toAmount(r.totalAmount) - toAmount(r.paidAmount);
    if (outstanding <= 0.005) continue;
    const due = toDate(r.dueDate) ?? (toDate(r.issueDate) ? addDays(toDate(r.issueDate)!, DEFAULT_TERMS_DAYS) : null);
    if (!due) continue;
    out.push({
      date: due,
      amount: outstanding,
      direction: "in",
      category: "customer_receipts",
      label: `${r.customer?.name ?? "Customer"} · ${r.invoiceNumber ?? `INV ${r.id}`}`,
      ref: `invoice:${r.id}`,
      currency: r.currency ?? "USD",
      companyId: r.companyId ?? null,
    });
  }
  return out;
}

export interface BillLike {
  id: number;
  companyId?: number | null;
  vendorId?: number | null;
  autopay?: boolean | null;
  vendorAutopay?: boolean | null;
  billNumber?: string | null;
  status: string;
  billDate: Date | string | null;
  dueDate: Date | string | null;
  totalAmount: string | number | null;
  amountPaid?: string | number | null;
  currency?: string | null;
  vendorName?: string | null;
  purchaseOrderId?: number | null;
}

/** Open vendor bills → payments on the due date. Draft, disputed, paid and cancelled bills are left out. */
export function billsToEvents(rows: BillLike[]): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if (!OPEN_BILL_STATUSES.has(r.status)) continue;
    const outstanding = toAmount(r.totalAmount) - toAmount(r.amountPaid);
    if (outstanding <= 0.005) continue;
    const due = toDate(r.dueDate) ?? (toDate(r.billDate) ? addDays(toDate(r.billDate)!, DEFAULT_TERMS_DAYS) : null);
    if (!due) continue;
    out.push({
      date: due,
      amount: outstanding,
      direction: "out",
      category: "vendor_bills",
      label: `${r.vendorName ?? "Vendor"} · ${r.billNumber ?? `Bill ${r.id}`}`,
      ref: `bill:${r.id}`,
      currency: r.currency ?? "USD",
      companyId: r.companyId ?? null,
    });
  }
  return out;
}

export interface PurchaseOrderLike {
  id: number;
  companyId?: number | null;
  poNumber?: string | null;
  status: string;
  orderDate: Date | string | null;
  expectedDate?: Date | string | null;
  totalAmount: string | number | null;
  currency?: string | null;
  vendor?: { name?: string | null; paymentTerms?: number | null } | null;
}

/**
 * Committed POs with no bill yet → payment at expected delivery + vendor terms.
 * POs already billed are skipped so the same spend is never counted twice.
 */
export function purchaseOrdersToEvents(rows: PurchaseOrderLike[], billedPoIds: Set<number>): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if (!OPEN_PO_STATUSES.has(r.status)) continue;
    if (billedPoIds.has(r.id)) continue;
    const amount = toAmount(r.totalAmount);
    if (amount <= 0) continue;
    const base = toDate(r.expectedDate) ?? toDate(r.orderDate);
    if (!base) continue;
    const terms = r.vendor?.paymentTerms ?? DEFAULT_TERMS_DAYS;
    out.push({
      date: addDays(base, terms),
      amount,
      direction: "out",
      category: "purchase_orders",
      label: `${r.vendor?.name ?? "Vendor"} · ${r.poNumber ?? `PO ${r.id}`}`,
      ref: `po:${r.id}`,
      currency: r.currency ?? "USD",
      companyId: r.companyId ?? null,
    });
  }
  return out;
}

export interface RecurringInvoiceLike {
  id: number;
  companyId?: number | null;
  templateName?: string | null;
  frequency: string;
  dayOfMonth?: number | null;
  nextGenerationDate: Date | string | null;
  endDate?: Date | string | null;
  totalAmount: string | number | null;
  daysUntilDue?: number | null;
  isActive: boolean;
  currency?: string | null;
  customer?: { name?: string | null } | null;
}

/**
 * Same day-of-month `months` later, clamped to the target month's last day
 * (Jan 31 + 1 month = Feb 28/29, not Mar 3). `anchorDay` is the template's
 * scheduled day so a clamped date springs back to it in longer months.
 */
export function addMonthsClamped(d: Date, months: number, anchorDay?: number | null): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}

export function nextOccurrence(d: Date, frequency: string, anchorDay?: number | null): Date | null {
  switch (frequency) {
    case "weekly":
      return addDays(d, 7);
    case "biweekly":
      return addDays(d, 14);
    case "monthly":
      return addMonthsClamped(d, 1, anchorDay);
    case "quarterly":
      return addMonthsClamped(d, 3, anchorDay);
    case "annually":
      return addMonthsClamped(d, 12, anchorDay);
    default:
      return null;
  }
}

/** Move a schedule forward past every occurrence before `from`, so a stale anchor never replays history. */
export function rollForward(date: Date | null, from: Date | undefined, frequency: string, anchorDay?: number | null): Date | null {
  if (!date || !from) return date;
  let d: Date | null = date;
  let guard = 0;
  while (d && d.getTime() < from.getTime() && guard++ < 600) d = nextOccurrence(d, frequency, anchorDay);
  return d;
}

/** Active recurring invoice templates → each future invoice's receipt (generation date + days until due). */
export function recurringToEvents(rows: RecurringInvoiceLike[], horizonEnd: Date, from?: Date): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if (!r.isActive) continue;
    const amount = toAmount(r.totalAmount);
    if (amount <= 0) continue;
    const end = toDate(r.endDate);
    const terms = r.daysUntilDue ?? DEFAULT_TERMS_DAYS;
    let gen = rollForward(toDate(r.nextGenerationDate), from, r.frequency, r.dayOfMonth);
    let guard = 0;
    while (gen && guard++ < 60) {
      if (end && gen.getTime() > end.getTime()) break;
      const cashDate = addDays(gen, terms);
      if (cashDate.getTime() >= horizonEnd.getTime()) break;
      out.push({
        date: cashDate,
        amount,
        direction: "in",
        category: "recurring_billing",
        label: `${r.customer?.name ?? "Customer"} · ${r.templateName ?? `Recurring ${r.id}`}`,
        ref: `recurring:${r.id}:${isoDate(gen)}`,
        currency: r.currency ?? "USD",
        companyId: r.companyId ?? null,
      });
      gen = nextOccurrence(gen, r.frequency, r.dayOfMonth);
    }
  }
  return out;
}

export interface EmployeePaymentLike {
  id: number;
  companyId?: number | null;
  paymentNumber?: string | null;
  status: string;
  type?: string | null;
  paymentDate: Date | string | null;
  amount: string | number | null;
  currency?: string | null;
}

/** Pending (scheduled, not yet processed) payroll payments. */
export function payrollToEvents(rows: EmployeePaymentLike[]): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if (r.status !== "pending") continue;
    const amount = toAmount(r.amount);
    const date = toDate(r.paymentDate);
    if (amount <= 0 || !date) continue;
    out.push({
      date,
      amount,
      direction: "out",
      category: "payroll",
      label: `Payroll · ${r.paymentNumber ?? `Payment ${r.id}`}`,
      ref: `payroll:${r.id}`,
      currency: r.currency ?? "USD",
      companyId: r.companyId ?? null,
    });
  }
  return out;
}

export interface ManualAdjustment {
  label: string;
  amount: number;
  direction: CashDirection;
  date: string; // yyyy-mm-dd
}

/** What-if items entered on the page (legal reserves, expected funding, one-off costs). */
export function adjustmentsToEvents(rows: ManualAdjustment[]): CashEvent[] {
  const out: CashEvent[] = [];
  rows.forEach((r, i) => {
    const date = toDate(r.date);
    if (!date || !(r.amount > 0)) return;
    out.push({
      date,
      amount: r.amount,
      direction: r.direction,
      category: r.direction === "in" ? "adjustment_in" : "adjustment_out",
      label: r.label || "Manual item",
      ref: `adjustment:${i}`,
    });
  });
  return out;
}

/** Items not in USD are summed as-is; surface them so nobody reads the total as pure USD. */
export function nonUsdCount(events: CashEvent[]): number {
  return events.filter((e) => e.currency && e.currency.toUpperCase() !== "USD").length;
}

// ── v2: recurring expenses ──────────────────────────────────────

export interface RecurringExpenseLike {
  id: number;
  companyId?: number | null;
  name: string;
  category?: string | null;
  frequency: string;
  dayOfMonth?: number | null;
  nextDate: Date | string | null;
  endDate?: Date | string | null;
  amount: string | number | null;
  currency?: string | null;
  isActive: boolean;
}

/** Fixed costs on a schedule → one outflow per occurrence until the horizon. */
export function recurringExpensesToEvents(rows: RecurringExpenseLike[], horizonEnd: Date, from?: Date): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if (!r.isActive) continue;
    const amount = toAmount(r.amount);
    if (amount <= 0) continue;
    const end = toDate(r.endDate);
    let next = rollForward(toDate(r.nextDate), from, r.frequency, r.dayOfMonth);
    let guard = 0;
    while (next && guard++ < 60) {
      if (end && next.getTime() > end.getTime()) break;
      if (next.getTime() >= horizonEnd.getTime()) break;
      out.push({
        date: next,
        amount,
        direction: "out",
        category: "recurring_expenses",
        label: `${r.name}${r.category && r.category !== "other" ? ` · ${r.category}` : ""}`,
        ref: `recurring_expense:${r.id}:${isoDate(next)}`,
        currency: r.currency ?? "USD",
        companyId: r.companyId ?? null,
      });
      next = nextOccurrence(next, r.frequency, r.dayOfMonth);
    }
  }
  return out;
}

// ── v2: payment behaviour ───────────────────────────────────────

export interface PaymentHistoryRow {
  invoiceId?: number | null;
  customerId: number | null;
  issueDate: Date | string | null;
  paymentDate: Date | string | null;
}

export interface CustomerPayBehaviour {
  samples: number;
  /** Median days from invoice issue to cash received. */
  medianDaysToPay: number;
}

export const MIN_PAY_SAMPLES = 3;

/** Median days-to-pay per customer. Only customers with enough history are returned. */
export function computePayBehaviour(rows: PaymentHistoryRow[], minSamples = MIN_PAY_SAMPLES): Map<number, CustomerPayBehaviour> {
  // One sample per invoice: a partially paid invoice settles on its last payment.
  const byInvoice = new Map<string, PaymentHistoryRow>();
  rows.forEach((r, i) => {
    const key = r.invoiceId != null ? `i:${r.invoiceId}` : `row:${i}`;
    const prev = byInvoice.get(key);
    const paid = toDate(r.paymentDate);
    const prevPaid = prev ? toDate(prev.paymentDate) : null;
    if (!prev || (paid && (!prevPaid || paid.getTime() > prevPaid.getTime()))) byInvoice.set(key, r);
  });
  const byCustomer = new Map<number, number[]>();
  for (const r of byInvoice.values()) {
    if (r.customerId == null) continue;
    const issued = toDate(r.issueDate);
    const paid = toDate(r.paymentDate);
    if (!issued || !paid) continue;
    const days = Math.round((paid.getTime() - issued.getTime()) / DAY_MS);
    if (days < 0 || days > 365) continue;
    const list = byCustomer.get(r.customerId) ?? [];
    list.push(days);
    byCustomer.set(r.customerId, list);
  }
  const out = new Map<number, CustomerPayBehaviour>();
  for (const [customerId, days] of byCustomer) {
    if (days.length < minSamples) continue;
    const sorted = [...days].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    out.set(customerId, { samples: days.length, medianDaysToPay: median });
  }
  return out;
}

export interface InvoiceWithCustomerId extends InvoiceLike {
  customerId?: number | null;
}

/**
 * Like receivablesToEvents, but a customer with real payment history is
 * expected on issue date + their median days-to-pay, never earlier than the
 * due date already passed.
 */
export function receivablesToEventsWithBehaviour(rows: InvoiceWithCustomerId[], behaviour: Map<number, CustomerPayBehaviour>): CashEvent[] {
  const base = receivablesToEvents(rows);
  const byRef = new Map<string, InvoiceWithCustomerId>(rows.map((r) => [`invoice:${r.id}`, r]));
  return base.map((e) => {
    const inv = e.ref ? byRef.get(e.ref) : undefined;
    const b = inv?.customerId != null ? behaviour.get(inv.customerId) : undefined;
    const issued = inv ? toDate(inv.issueDate) : null;
    if (!b || !issued) return e;
    const behavioural = addDays(issued, b.medianDaysToPay);
    // Never pull a receipt earlier than the contractual due date.
    const date = behavioural.getTime() > e.date.getTime() ? behavioural : e.date;
    return { ...e, date, label: `${e.label} · pays ~${b.medianDaysToPay}d` };
  });
}

// ── v2: scenarios ───────────────────────────────────────────────

export interface ScenarioKnobs {
  arSlipDays?: number;
  arHaircutPct?: number;
  apSlipDays?: number;
  excludeCustomerIds?: number[];
}

const AR_CATEGORIES = new Set<CashCategory>(["customer_receipts", "recurring_billing"]);
const AP_CATEGORIES = new Set<CashCategory>(["vendor_bills", "purchase_orders", "recurring_expenses"]);

/** Apply what-if knobs to a base event list. `customerIdByRef` maps invoice refs to customer ids for exclusions. */
export function applyScenario(events: CashEvent[], knobs: ScenarioKnobs, customerIdByRef: Map<string, number> = new Map()): CashEvent[] {
  const slipAr = knobs.arSlipDays ?? 0;
  const slipAp = knobs.apSlipDays ?? 0;
  const haircut = Math.min(100, Math.max(0, knobs.arHaircutPct ?? 0));
  const excluded = new Set(knobs.excludeCustomerIds ?? []);
  const out: CashEvent[] = [];
  for (const e of events) {
    if (AR_CATEGORIES.has(e.category)) {
      const cid = e.ref ? customerIdByRef.get(e.ref) : undefined;
      if (cid != null && excluded.has(cid)) continue;
      const amount = haircut > 0 ? e.amount * (1 - haircut / 100) : e.amount;
      out.push({ ...e, amount, date: slipAr ? addDays(e.date, slipAr) : e.date });
    } else if (AP_CATEGORIES.has(e.category)) {
      out.push({ ...e, date: slipAp ? addDays(e.date, slipAp) : e.date });
    } else {
      out.push(e);
    }
  }
  return out;
}

// ── v2: FX ──────────────────────────────────────────────────────

/** Convert non-USD events using `rates` (currency → USD multiplier). Events with no rate stay at face value and are counted. */
export function convertEventsToUsd(events: CashEvent[], rates: Map<string, number>): { events: CashEvent[]; unconverted: number } {
  let unconverted = 0;
  const out = events.map((e) => {
    const ccy = (e.currency ?? "USD").toUpperCase();
    if (ccy === "USD") return e;
    const rate = rates.get(ccy);
    if (!rate) {
      unconverted++;
      return e;
    }
    return { ...e, amount: round2(e.amount * rate), currency: "USD", label: `${e.label} (${ccy})` };
  });
  return { events: out, unconverted };
}

// ── v2: accuracy ────────────────────────────────────────────────

export interface SnapshotWeek {
  start: string;
  end: string;
  totalIn: number;
  totalOut: number;
  closingCash: number;
}

export interface BankMovement {
  date: Date | string;
  amount: string | number;
  type: "debit" | "credit" | string;
}

export interface WeekAccuracy {
  start: string;
  forecastIn: number;
  actualIn: number;
  forecastOut: number;
  actualOut: number;
  inError: number; // actual - forecast
  outError: number;
  netError: number;
}

/** Grade a snapshot's weeks against bank movements that have already happened (weeks fully in the past only). */
export function gradeSnapshot(weeks: SnapshotWeek[], movements: BankMovement[], today: Date): WeekAccuracy[] {
  const inByWeek = new Map<string, number>();
  const outByWeek = new Map<string, number>();
  for (const m of movements) {
    const d = toDate(m.date);
    if (!d) continue;
    const key = isoDate(startOfWeek(d));
    const amt = Math.abs(toAmount(m.amount));
    if (m.type === "credit") inByWeek.set(key, (inByWeek.get(key) ?? 0) + amt);
    else outByWeek.set(key, (outByWeek.get(key) ?? 0) + amt);
  }
  const cutoff = startOfWeek(today).getTime();
  const out: WeekAccuracy[] = [];
  for (const w of weeks) {
    const start = toDate(w.start);
    if (!start || start.getTime() >= cutoff) continue; // week not finished yet
    const actualIn = round2(inByWeek.get(w.start) ?? 0);
    const actualOut = round2(outByWeek.get(w.start) ?? 0);
    out.push({
      start: w.start,
      forecastIn: round2(w.totalIn),
      actualIn,
      forecastOut: round2(w.totalOut),
      actualOut,
      inError: round2(actualIn - w.totalIn),
      outError: round2(actualOut - w.totalOut),
      netError: round2(actualIn - actualOut - (w.totalIn - w.totalOut)),
    });
  }
  return out;
}

/**
 * Mean absolute percentage error across graded weeks, per side, with the
 * actual as denominator. A week with no actual movement but a forecast counts
 * as a 100% miss; a week with neither is skipped. 0 = perfect. null when
 * nothing to grade.
 */
export function summarizeAccuracy(rows: WeekAccuracy[]): { weeks: number; inMape: number | null; outMape: number | null } {
  if (rows.length === 0) return { weeks: 0, inMape: null, outMape: null };
  const mape = (pairs: [number, number][]) => {
    const valid = pairs.filter(([f, a]) => f > 0 || a > 0);
    if (!valid.length) return null;
    const total = valid.reduce((s, [f, a]) => s + (a > 0 ? Math.abs(a - f) / a : 1), 0);
    return round2((total / valid.length) * 100);
  };
  return {
    weeks: rows.length,
    inMape: mape(rows.map((r) => [r.forecastIn, r.actualIn])),
    outMape: mape(rows.map((r) => [r.forecastOut, r.actualOut])),
  };
}


// ── v3: vendor payment behaviour + autopay ─────────────────────

export interface BillHistoryRow {
  vendorId: number | null;
  dueDate: Date | string | null;
  paidAt: Date | string | null;
}

export interface VendorPayBehaviour {
  samples: number;
  /** Median days paid after (positive) or before (negative) the due date. */
  medianDaysLate: number;
}

/** How late each vendor really gets paid, from bills we have settled. */
export function computeVendorBehaviour(rows: BillHistoryRow[], minSamples = MIN_PAY_SAMPLES): Map<number, VendorPayBehaviour> {
  const byVendor = new Map<number, number[]>();
  for (const r of rows) {
    if (r.vendorId == null) continue;
    const due = toDate(r.dueDate);
    const paid = toDate(r.paidAt);
    if (!due || !paid) continue;
    const days = Math.round((paid.getTime() - due.getTime()) / DAY_MS);
    if (days < -60 || days > 180) continue;
    const list = byVendor.get(r.vendorId) ?? [];
    list.push(days);
    byVendor.set(r.vendorId, list);
  }
  const out = new Map<number, VendorPayBehaviour>();
  for (const [vendorId, days] of byVendor) {
    if (days.length < minSamples) continue;
    const sorted = [...days].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    out.set(vendorId, { samples: days.length, medianDaysLate: median });
  }
  return out;
}

/**
 * Like billsToEvents, but: an autopay bill (bill or vendor flag) lands on its
 * due date exactly; any other bill from a vendor with history moves by that
 * vendor's median days late. Bills already past due keep their date.
 */
export function billsToEventsWithBehaviour(rows: BillLike[], behaviour: Map<number, VendorPayBehaviour>, today: Date): CashEvent[] {
  const base = billsToEvents(rows);
  const byRef = new Map<string, BillLike>(rows.map((r) => [`bill:${r.id}`, r]));
  return base.map((e) => {
    const bill = e.ref ? byRef.get(e.ref) : undefined;
    if (!bill) return e;
    if (bill.autopay || bill.vendorAutopay) return { ...e, label: `${e.label} · autopay` };
    const b = bill.vendorId != null ? behaviour.get(bill.vendorId) : undefined;
    if (!b || b.medianDaysLate === 0) return e;
    if (e.date.getTime() < startOfDay(today).getTime()) return e;
    return { ...e, date: addDays(e.date, b.medianDaysLate), label: `${e.label} · paid ~${b.medianDaysLate > 0 ? "+" : ""}${b.medianDaysLate}d` };
  });
}

// ── v3: weighted pipeline ──────────────────────────────────────

export interface DealLike {
  id: number;
  companyId?: number | null;
  name: string;
  amount: string | number | null;
  currency?: string | null;
  probability: number | null;
  expectedCloseDate: Date | string | null;
  stage?: string | null;
  organization?: string | null;
}

/**
 * Open deals × probability, expected at close date + payment terms. Shown as
 * its own category so nobody mistakes hope for a receivable.
 */
export function pipelineToEvents(rows: DealLike[], termsDays = DEFAULT_TERMS_DAYS, minProbability = 10): CashEvent[] {
  const out: CashEvent[] = [];
  for (const d of rows) {
    const amount = toAmount(d.amount);
    const p = Math.min(100, Math.max(0, d.probability ?? 0));
    if (amount <= 0 || p < minProbability) continue;
    const close = toDate(d.expectedCloseDate);
    if (!close) continue;
    out.push({
      date: addDays(close, termsDays),
      amount: round2((amount * p) / 100),
      direction: "in",
      category: "pipeline_weighted",
      label: `${d.organization ?? "Prospect"} · ${d.name} (${p}%)`,
      ref: `deal:${d.id}`,
      currency: d.currency ?? "USD",
      companyId: d.companyId ?? null,
    });
  }
  return out;
}

// ── v3: project cash events ────────────────────────────────────

export interface ProjectCashEventLike {
  id: number;
  companyId?: number | null;
  name: string;
  status: string;
  cashEventAmount: string | number | null;
  cashEventType: string | null;
  cashEventDate: Date | string | null;
}

/** Planned project money: revenue/funding in, capex/opex out, only for projects still ahead of us. */
export function projectEventsToEvents(rows: ProjectCashEventLike[]): CashEvent[] {
  const out: CashEvent[] = [];
  for (const p of rows) {
    if (p.status === "complete" || p.status === "cancelled") continue;
    const amount = Math.abs(toAmount(p.cashEventAmount));
    const date = toDate(p.cashEventDate);
    if (amount <= 0 || !date) continue;
    const direction: CashDirection = p.cashEventType === "capex" || p.cashEventType === "opex" ? "out" : "in";
    out.push({
      date,
      amount,
      direction,
      category: "project_events",
      label: `${p.name} · ${p.cashEventType ?? "event"}`,
      ref: `project:${p.id}`,
      companyId: p.companyId ?? null,
    });
  }
  return out;
}

// ── v3: monthly roll-up ────────────────────────────────────────

export interface ForecastMonth {
  key: string; // yyyy-mm
  label: string; // "Oct 2026"
  openingCash: number;
  totalIn: number;
  totalOut: number;
  net: number;
  closingCash: number;
  inflows: Partial<Record<CashCategory, number>>;
  outflows: Partial<Record<CashCategory, number>>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Calendar-month view built from the dated events themselves (never from
 * Monday-bucketed weeks, which would push a 1st-of-month item into the prior
 * month). Anything already past due lands in the as-of month. Runs a fresh
 * balance from `startingCash` so it matches the weekly view's opening.
 */
export function rollupMonths(params: { asOf: Date; startingCash: number; events: CashEvent[]; months?: number }): ForecastMonth[] {
  const count = params.months ?? 12;
  const first = new Date(Date.UTC(params.asOf.getUTCFullYear(), params.asOf.getUTCMonth(), 1));
  const out: ForecastMonth[] = [];
  const byKey = new Map<string, ForecastMonth>();
  for (let i = 0; i < count; i++) {
    const y: number = first.getUTCFullYear();
    const m0: number = first.getUTCMonth() + i;
    const dt = new Date(Date.UTC(y, m0, 1));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    const row: ForecastMonth = { key, label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`, openingCash: 0, totalIn: 0, totalOut: 0, net: 0, closingCash: 0, inflows: {}, outflows: {} };
    out.push(row);
    byKey.set(key, row);
  }
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + count, 1));
  const firstKey = out[0]?.key;
  for (const e of params.events) {
    if (!(e.amount > 0) || e.date.getTime() >= end.getTime()) continue;
    const key = e.date.getTime() < first.getTime() ? firstKey : `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = key ? byKey.get(key) : undefined;
    if (!row) continue;
    const bucket = e.direction === "in" ? row.inflows : row.outflows;
    bucket[e.category] = round2((bucket[e.category] ?? 0) + e.amount);
  }
  let cash = params.startingCash;
  for (const row of out) {
    row.totalIn = round2(Object.values(row.inflows).reduce((s, v) => s + (v ?? 0), 0));
    row.totalOut = round2(Object.values(row.outflows).reduce((s, v) => s + (v ?? 0), 0));
    row.net = round2(row.totalIn - row.totalOut);
    row.openingCash = round2(cash);
    cash += row.net;
    row.closingCash = round2(cash);
  }
  return out;
}

// ── v3: per-entity split ───────────────────────────────────────

export interface EntityForecast {
  companyId: number | null;
  name: string;
  startingCash: number;
  totalIn: number;
  totalOut: number;
  endingCash: number;
  lowestCash: number;
  lowestWeek: number;
  firstNegativeWeek: number | null;
}

/** Run the same weekly engine once per entity so a consolidated view can still show who is short. */
export function splitByEntity(
  params: { asOf: Date; events: CashEvent[]; weeks?: number; startingCashByCompany: Map<number | null, number>; names: Map<number | null, string> },
): EntityForecast[] {
  const groups = new Map<number | null, CashEvent[]>();
  for (const e of params.events) {
    const k = e.companyId ?? null;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const k of params.startingCashByCompany.keys()) if (!groups.has(k)) groups.set(k, []);
  const out: EntityForecast[] = [];
  for (const [companyId, events] of groups) {
    const f = buildCashForecast({ asOf: params.asOf, startingCash: params.startingCashByCompany.get(companyId) ?? 0, events, weeks: params.weeks });
    out.push({
      companyId,
      name: params.names.get(companyId) ?? (companyId == null ? "Unassigned" : `Entity ${companyId}`),
      startingCash: f.startingCash,
      totalIn: f.totalIn,
      totalOut: f.totalOut,
      endingCash: f.endingCash,
      lowestCash: f.lowestCash,
      lowestWeek: f.lowestWeek,
      firstNegativeWeek: f.firstNegativeWeek,
    });
  }
  return out.sort((a, b) => (a.companyId ?? 1e9) - (b.companyId ?? 1e9));
}

// ── v3: ledger grading ─────────────────────────────────────────

export interface LedgerPayment {
  type: "received" | "made" | string;
  amount: string | number;
  paymentDate: Date | string;
}

/** Same as bank grading, but from the ERP's own payments table (what we recorded, not what the bank saw). */
export function ledgerToMovements(rows: LedgerPayment[]): BankMovement[] {
  return rows.map((r) => ({ date: r.paymentDate, amount: r.amount, type: r.type === "received" ? "credit" : "debit" }));
}

// ── v3: deterministic alerts (replaces the LLM guess in financeAiService) ──

export interface ForecastAlert {
  type: "shortfall" | "surplus" | "timing";
  description: string;
  severity: "low" | "medium" | "high";
  suggestedAction: string;
}

export function deriveAlerts(f: CashForecast, threshold = 0): ForecastAlert[] {
  const alerts: ForecastAlert[] = [];
  if (f.firstNegativeWeek) {
    const w = f.weeks[f.firstNegativeWeek - 1];
    alerts.push({
      type: "shortfall",
      description: `Cash goes below zero in week ${f.firstNegativeWeek} (${w.start}), reaching ${f.lowestCash.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} in week ${f.lowestWeek}.`,
      severity: "high",
      suggestedAction: "Pull forward collections on the largest overdue invoices, delay non-autopay vendor payments, or line up a bridge.",
    });
  } else if (f.lowestCash < threshold) {
    alerts.push({
      type: "shortfall",
      description: `Lowest projected cash is ${f.lowestCash.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} in week ${f.lowestWeek}, under the ${threshold.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} floor.`,
      severity: "medium",
      suggestedAction: "Review the low week's outflows and move what can move.",
    });
  }
  if (f.overdueIn > 0) {
    alerts.push({
      type: "timing",
      description: `${f.overdueIn.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} of customer money is already past due and assumed to land in week 1.`,
      severity: f.overdueIn > f.totalIn * 0.25 ? "high" : "medium",
      suggestedAction: "Work the collections queue; every week of slip moves the low point.",
    });
  }
  if (f.endingCash > f.startingCash * 1.5 && f.endingCash > 0) {
    alerts.push({
      type: "surplus",
      description: `Cash grows from ${f.startingCash.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} to ${f.endingCash.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} over the horizon.`,
      severity: "low",
      suggestedAction: "Consider paying early for discounts or moving excess to a yield account.",
    });
  }
  return alerts;
}
