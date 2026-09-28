/**
 * Vendor bill (accounts payable) operations shared by appRouter.bills and the
 * autonomous payment-processing workflow. Keeping the "pay a bill" path in one
 * place means a workflow auto-payment and a finance user clicking "Mark paid"
 * leave identical `payments` + `bills` rows behind.
 */
import * as db from "./db";
import type { InsertBill, InsertPayment } from "../drizzle/schema";
import { billOutstanding, BILL_AMOUNT_EPSILON } from "./billsLogic";
import type { ImportedVendorInvoice } from "./documentImportService";

export type PaymentMethod = NonNullable<InsertPayment["paymentMethod"]>;

export interface PayBillOptions {
  /** Defaults to the outstanding balance. */
  amount?: number;
  paymentDate?: Date;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  accountId?: number;
  notes?: string;
  createdBy?: number;
  paymentNumber: string;
}

export class BillPaymentError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST") {
    super(message);
  }
}

/**
 * Record a payment against a bill: inserts a `payments` row (type "made") and
 * advances the bill to partially_paid / paid. Throws BillPaymentError with a
 * tRPC-shaped code the router maps 1:1.
 */
export async function payBill(billId: number, options: PayBillOptions) {
  const bill = await db.getBillById(billId);
  if (!bill) throw new BillPaymentError("Bill not found", "NOT_FOUND");
  if (bill.status === "paid" || bill.status === "cancelled") {
    throw new BillPaymentError(`Bill ${bill.billNumber} is already ${bill.status}`, "FORBIDDEN");
  }

  const outstanding = billOutstanding(bill);
  const amount = options.amount ?? outstanding;
  if (!(amount > 0)) throw new BillPaymentError("Payment amount must be positive", "BAD_REQUEST");
  if (amount > outstanding + BILL_AMOUNT_EPSILON) {
    throw new BillPaymentError(`Payment of ${amount.toFixed(2)} exceeds the outstanding balance of ${outstanding.toFixed(2)}`, "BAD_REQUEST");
  }

  const payment = await db.createPayment({
    companyId: bill.companyId,
    paymentNumber: options.paymentNumber,
    type: "made",
    vendorId: bill.vendorId,
    purchaseOrderId: bill.purchaseOrderId,
    accountId: options.accountId,
    amount: amount.toFixed(2),
    currency: bill.currency || "USD",
    paymentMethod: options.paymentMethod ?? "bank_transfer",
    paymentDate: options.paymentDate ?? new Date(),
    referenceNumber: options.referenceNumber,
    status: "completed",
    notes: options.notes ?? `Payment for bill ${bill.billNumber}`,
    createdBy: options.createdBy,
  });

  const updated = await db.recordBillPayment(billId, { amount, paymentId: payment.id });
  return { bill: updated, paymentId: payment.id, amount };
}

/** Line items in the shape `bills.lineItems` stores. */
export function toBillLineItems(items: ReadonlyArray<{
  description?: string | null;
  sku?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
}> | null | undefined) {
  if (!items?.length) return undefined;
  return items.map((item) => ({
    description: item.description || "Line item",
    sku: item.sku || undefined,
    quantity: Number(item.quantity ?? 1) || 0,
    unit: item.unit || undefined,
    unitPrice: Number(item.unitPrice ?? 0) || 0,
    totalPrice: Number(item.totalPrice ?? 0) || 0,
  }));
}

/** Build the bill row for a parsed vendor invoice (document import / AI draft). */
export function billFromParsedInvoice(
  invoice: ImportedVendorInvoice,
  extra: Pick<InsertBill, "vendorId" | "sourceType"> & Partial<InsertBill>,
): InsertBill {
  const billDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date();
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : undefined;
  return {
    billNumber: invoice.invoiceNumber,
    billDate: Number.isFinite(billDate.getTime()) ? billDate : new Date(),
    dueDate: dueDate && Number.isFinite(dueDate.getTime()) ? dueDate : undefined,
    subtotal: (invoice.subtotal ?? invoice.totalAmount ?? 0).toString(),
    taxAmount: (invoice.taxAmount ?? 0).toString(),
    shippingAmount: (invoice.shippingAmount ?? 0).toString(),
    totalAmount: (invoice.totalAmount ?? 0).toString(),
    currency: invoice.currency || "USD",
    status: "draft",
    paymentTerms: invoice.paymentTerms,
    notes: invoice.notes,
    lineItems: toBillLineItems(invoice.lineItems),
    ...extra,
  };
}
