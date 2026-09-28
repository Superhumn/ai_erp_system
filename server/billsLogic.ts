/**
 * Pure helpers for vendor bills (accounts payable). No DB access so the
 * aging buckets, due-date and PO-match rules can be unit tested directly;
 * db.ts, the bills router and the AP workflow processors consume them.
 */

export const OPEN_BILL_STATUSES = ["pending_approval", "approved", "scheduled", "partially_paid", "overdue"] as const;

/** Statuses a bill can still be matched / approved / paid from. */
export const PAYABLE_BILL_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "partially_paid", "overdue"] as const;

export const BILL_AMOUNT_EPSILON = 0.005;

export interface AgeableBill {
  status: string;
  totalAmount: string | number | null | undefined;
  amountPaid: string | number | null | undefined;
  dueDate: Date | string | null | undefined;
  billDate: Date | string | null | undefined;
}

export interface BillsAgingSummary {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  totalOutstanding: number;
  billCount: number;
  overdueCount: number;
}

export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Amount still owed on a bill; never negative. */
export function billOutstanding(bill: { totalAmount: string | number | null | undefined; amountPaid: string | number | null | undefined }): number {
  return round2(Math.max(0, toAmount(bill.totalAmount) - toAmount(bill.amountPaid)));
}

/** Whole days a bill is past due as of `asOf`; 0 or negative means not yet due. */
export function billDaysOverdue(bill: Pick<AgeableBill, "dueDate" | "billDate">, asOf: Date): number {
  const due = bill.dueDate ?? bill.billDate;
  if (!due) return 0;
  const dueTime = new Date(due).getTime();
  if (!Number.isFinite(dueTime)) return 0;
  return Math.floor((asOf.getTime() - dueTime) / 86400000);
}

/**
 * Bucket the outstanding balance of open bills by days past due. Paid and
 * cancelled bills are skipped; a bill with no due date ages from its bill date.
 */
export function bucketBillsAging(bills: readonly AgeableBill[], asOf: Date = new Date()): BillsAgingSummary {
  const summary: BillsAgingSummary = {
    current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0,
    totalOutstanding: 0, billCount: 0, overdueCount: 0,
  };
  for (const bill of bills) {
    if (bill.status === "paid" || bill.status === "cancelled") continue;
    const outstanding = billOutstanding(bill);
    if (outstanding <= 0) continue;
    const days = billDaysOverdue(bill, asOf);
    if (days <= 0) summary.current += outstanding;
    else if (days <= 30) summary.days1to30 += outstanding;
    else if (days <= 60) summary.days31to60 += outstanding;
    else if (days <= 90) summary.days61to90 += outstanding;
    else summary.days90plus += outstanding;
    if (days > 0) summary.overdueCount += 1;
    summary.totalOutstanding += outstanding;
    summary.billCount += 1;
  }
  summary.current = round2(summary.current);
  summary.days1to30 = round2(summary.days1to30);
  summary.days31to60 = round2(summary.days31to60);
  summary.days61to90 = round2(summary.days61to90);
  summary.days90plus = round2(summary.days90plus);
  summary.totalOutstanding = round2(summary.totalOutstanding);
  return summary;
}

/**
 * Whether a bill falls inside the payment run window: due on or before
 * `asOf + lookaheadDays`. A bill with no due date is treated as due now.
 */
export function isBillDueForPayment(bill: { dueDate: Date | string | null | undefined }, asOf: Date, lookaheadDays = 0): boolean {
  if (!bill.dueDate) return true;
  const due = new Date(bill.dueDate).getTime();
  if (!Number.isFinite(due)) return true;
  const cutoff = asOf.getTime() + Math.max(0, lookaheadDays) * 86400000;
  return due <= cutoff;
}

export interface BillPoComparison {
  billAmount: number;
  poAmount: number;
  variance: number;
  variancePercent: number;
  matched: boolean;
}

/** Compare a bill total to its PO total; matched when within `tolerancePercent`. */
export function compareBillToPo(
  billTotal: string | number | null | undefined,
  poTotal: string | number | null | undefined,
  tolerancePercent = 2,
): BillPoComparison {
  const billAmount = toAmount(billTotal);
  const poAmount = toAmount(poTotal);
  const variance = round2(Math.abs(billAmount - poAmount));
  const variancePercent = poAmount > 0 ? round2((variance / poAmount) * 100) : (variance > 0 ? 100 : 0);
  return { billAmount, poAmount, variance, variancePercent, matched: variancePercent <= tolerancePercent };
}

/**
 * Pick the PO that best explains a bill when it carries no purchaseOrderId:
 * the same vendor, an open/received PO, and the closest total inside the
 * tolerance. Returns null when nothing is close enough.
 */
export function pickClosestPurchaseOrder<T extends { id: number; totalAmount: string | number | null; status: string }>(
  billTotal: string | number | null | undefined,
  candidates: readonly T[],
  tolerancePercent = 2,
): T | null {
  let best: { po: T; variance: number } | null = null;
  for (const po of candidates) {
    if (po.status === "cancelled" || po.status === "draft") continue;
    const cmp = compareBillToPo(billTotal, po.totalAmount, tolerancePercent);
    if (!cmp.matched) continue;
    if (!best || cmp.variance < best.variance) best = { po, variance: cmp.variance };
  }
  return best ? best.po : null;
}

/** Status the bill moves to after a payment of `amount` is recorded. */
export function nextStatusAfterPayment(
  bill: { totalAmount: string | number | null | undefined; amountPaid: string | number | null | undefined },
  amount: number,
): { amountPaid: number; status: "paid" | "partially_paid" } {
  const amountPaid = round2(toAmount(bill.amountPaid) + amount);
  const total = toAmount(bill.totalAmount);
  return { amountPaid, status: amountPaid + BILL_AMOUNT_EPSILON >= total ? "paid" : "partially_paid" };
}
