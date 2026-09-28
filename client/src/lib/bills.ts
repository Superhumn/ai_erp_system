/**
 * Pure helpers for the vendor bills (accounts payable) UI. No React, no tRPC,
 * so the money / form-payload rules are unit-testable on their own. The server
 * mirrors `billOutstanding` in server/billsLogic.ts.
 */

export const BILL_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "disputed",
] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const BILL_PAYMENT_METHODS = ["cash", "check", "bank_transfer", "credit_card", "ach", "wire", "other"] as const;
export type BillPaymentMethod = (typeof BILL_PAYMENT_METHODS)[number];

/** Statuses finance can still act on (approve / pay / cancel / edit). */
export function billIsOpen(status: string | null | undefined): boolean {
  return status !== "paid" && status !== "cancelled";
}

/** Approve is only meaningful before the bill has been approved. */
export function billCanApprove(status: string | null | undefined): boolean {
  return status === "draft" || status === "pending_approval";
}

export function billStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Amount still owed on a bill (total - paid); never negative. */
export function billOutstanding(row: {
  totalAmount?: string | number | null;
  amountPaid?: string | number | null;
}): number {
  return round2(Math.max(0, toAmount(row.totalAmount) - toAmount(row.amountPaid)));
}

/** "" / whitespace → undefined so optional fields are omitted from the payload. */
export function blankToUndefined(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const s = value.trim();
  return s ? s : undefined;
}

export type LineItemDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
};

export type BillLineItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export function lineItemTotal(item: Pick<LineItemDraft, "quantity" | "unitPrice">): number {
  return round2(toAmount(item.quantity) * toAmount(item.unitPrice));
}

/** Drafts with a description become line items; blank rows are dropped. */
export function buildLineItems(drafts: readonly LineItemDraft[]): BillLineItemInput[] {
  return drafts
    .filter((d) => d.description.trim())
    .map((d) => ({
      description: d.description.trim(),
      quantity: toAmount(d.quantity),
      unitPrice: toAmount(d.unitPrice),
      totalPrice: lineItemTotal(d),
    }));
}

export type BillFormState = {
  vendorId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  totalAmount: string;
  subtotal: string;
  taxAmount: string;
  shippingAmount: string;
  currency: string;
  paymentTerms: string;
  notes: string;
  lineItems: LineItemDraft[];
};

/** What bills.create / bills.update accept from this form (money as decimal strings, dates as Date). */
export type BillFormPayload = {
  vendorId: number;
  billDate: Date;
  totalAmount: string;
  billNumber?: string;
  dueDate?: Date;
  subtotal?: string;
  taxAmount?: string;
  shippingAmount?: string;
  currency?: string;
  paymentTerms?: string;
  notes?: string;
  lineItems?: BillLineItemInput[];
};

/** Normalises a money input: "" → undefined, otherwise a 2dp decimal string. Returns null when unparseable. */
export function moneyString(value: string): string | undefined | null {
  const s = value.trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

/**
 * Converts the form state to the mutation input, or returns an error string.
 * `parseDate` is injected so the module stays free of DOM/date-input concerns
 * (the page passes `parseDateInput` from lib/dateInput).
 */
export function buildBillPayload(
  form: BillFormState,
  parseDate: (value: string) => Date | undefined,
): { payload: BillFormPayload } | { error: string } {
  const vendorId = Number(form.vendorId);
  if (!form.vendorId || !Number.isInteger(vendorId) || vendorId <= 0) return { error: "Choose a vendor" };
  const billDate = parseDate(form.billDate);
  if (!billDate) return { error: "Bill date is required" };
  const dueDate = form.dueDate.trim() ? parseDate(form.dueDate) : undefined;
  if (form.dueDate.trim() && !dueDate) return { error: "Due date is not a valid date" };

  const lineItems = buildLineItems(form.lineItems);
  const lineSum = round2(lineItems.reduce((sum, li) => sum + li.totalPrice, 0));

  let totalAmount = moneyString(form.totalAmount);
  if (totalAmount === null) return { error: "Total amount must be a number" };
  if (totalAmount === undefined) {
    if (lineItems.length === 0) return { error: "Total amount is required" };
    totalAmount = lineSum.toFixed(2);
  }
  if (toAmount(totalAmount) <= 0) return { error: "Total amount must be greater than zero" };

  const subtotal = moneyString(form.subtotal);
  const taxAmount = moneyString(form.taxAmount);
  const shippingAmount = moneyString(form.shippingAmount);
  if (subtotal === null || taxAmount === null || shippingAmount === null) {
    return { error: "Subtotal, tax and shipping must be numbers" };
  }

  const currency = blankToUndefined(form.currency)?.toUpperCase();
  if (currency && currency.length !== 3) return { error: "Currency must be a 3-letter code" };

  const payload: BillFormPayload = {
    vendorId,
    billDate,
    totalAmount,
  };
  const billNumber = blankToUndefined(form.billNumber);
  if (billNumber) payload.billNumber = billNumber;
  if (dueDate) payload.dueDate = dueDate;
  if (subtotal !== undefined) payload.subtotal = subtotal;
  if (taxAmount !== undefined) payload.taxAmount = taxAmount;
  if (shippingAmount !== undefined) payload.shippingAmount = shippingAmount;
  if (currency) payload.currency = currency;
  const paymentTerms = blankToUndefined(form.paymentTerms);
  if (paymentTerms) payload.paymentTerms = paymentTerms;
  const notes = blankToUndefined(form.notes);
  if (notes) payload.notes = notes;
  if (lineItems.length > 0) payload.lineItems = lineItems;
  return { payload };
}
