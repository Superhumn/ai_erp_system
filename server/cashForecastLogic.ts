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
    const overdue = e.date.getTime() < firstWeek.getTime();
    const idx = overdue ? 0 : Math.floor((e.date.getTime() - firstWeek.getTime()) / (7 * DAY_MS));
    const w = weeks[idx];
    const bucket = e.direction === "in" ? w.inflows : w.outflows;
    bucket[e.category] = (bucket[e.category] ?? 0) + e.amount;
    if (overdue) {
      if (e.direction === "in") overdueIn += e.amount;
      else overdueOut += e.amount;
    }
    w.events.push({
      date: isoDate(overdue ? firstWeek : e.date),
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

const OPEN_INVOICE_STATUSES = new Set(["sent", "partial", "overdue"]);
const OPEN_BILL_STATUSES = new Set(["pending_approval", "approved", "scheduled", "partially_paid", "overdue"]);
const OPEN_PO_STATUSES = new Set(["sent", "confirmed", "partial"]);

export interface InvoiceLike {
  id: number;
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
    });
  }
  return out;
}

export interface BillLike {
  id: number;
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
    });
  }
  return out;
}

export interface PurchaseOrderLike {
  id: number;
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
    });
  }
  return out;
}

export interface RecurringInvoiceLike {
  id: number;
  templateName?: string | null;
  frequency: string;
  nextGenerationDate: Date | string | null;
  endDate?: Date | string | null;
  totalAmount: string | number | null;
  daysUntilDue?: number | null;
  isActive: boolean;
  currency?: string | null;
  customer?: { name?: string | null } | null;
}

export function nextOccurrence(d: Date, frequency: string): Date | null {
  const n = new Date(d.getTime());
  switch (frequency) {
    case "weekly":
      return addDays(d, 7);
    case "biweekly":
      return addDays(d, 14);
    case "monthly":
      n.setUTCMonth(n.getUTCMonth() + 1);
      return n;
    case "quarterly":
      n.setUTCMonth(n.getUTCMonth() + 3);
      return n;
    case "annually":
      n.setUTCFullYear(n.getUTCFullYear() + 1);
      return n;
    default:
      return null;
  }
}

/** Active recurring invoice templates → each future invoice's receipt (generation date + days until due). */
export function recurringToEvents(rows: RecurringInvoiceLike[], horizonEnd: Date): CashEvent[] {
  const out: CashEvent[] = [];
  for (const r of rows) {
    if (!r.isActive) continue;
    const amount = toAmount(r.totalAmount);
    if (amount <= 0) continue;
    const end = toDate(r.endDate);
    const terms = r.daysUntilDue ?? DEFAULT_TERMS_DAYS;
    let gen = toDate(r.nextGenerationDate);
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
      });
      gen = nextOccurrence(gen, r.frequency);
    }
  }
  return out;
}

export interface EmployeePaymentLike {
  id: number;
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
