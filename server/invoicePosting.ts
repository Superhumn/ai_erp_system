// Double-entry posting for a newly created customer invoice: Debit Accounts Receivable
// (1200), Credit Revenue (4000). Shared by invoices.create and recurringInvoices.generateNow
// so every invoice, however it was raised, lands in the ledger the same way.
import * as db from "./db";

export interface InvoicePostingInput {
  invoiceId: number;
  invoiceNumber: string;
  companyId: number | null | undefined;
  totalAmount: string;
  userId: number;
  /** Posting date; defaults to now. */
  date?: Date;
}

/**
 * Post the AR/Revenue journal entry for an invoice. The invoice row is already saved, so a
 * ledger failure is logged and swallowed (returns null) rather than failing the request.
 */
export async function postInvoiceJournalEntry(input: InvoicePostingInput): Promise<{ transactionId: number } | null> {
  const companyId = input.companyId ?? undefined;
  const date = input.date ?? new Date();
  try {
    const txn = await db.createTransaction({
      companyId,
      transactionNumber: `JE-INV-${input.invoiceNumber}`,
      type: "invoice",
      referenceType: "invoice",
      referenceId: input.invoiceId,
      date,
      description: `Journal entry for Invoice ${input.invoiceNumber}`,
      totalAmount: input.totalAmount,
      status: "posted",
      createdBy: input.userId,
      postedBy: input.userId,
      postedAt: date,
    });

    const arAccount = (await db.getAccountByCode("1200", companyId))
      || (await db.getAccountByName("Accounts Receivable", companyId));
    const revenueAccount = (await db.getAccountByCode("4000", companyId))
      || (await db.getAccountByName("Revenue", companyId));

    if (arAccount) {
      await db.createTransactionLine({
        transactionId: txn.id,
        accountId: arAccount.id,
        debit: input.totalAmount,
        credit: "0",
        description: `AR - Invoice ${input.invoiceNumber}`,
      });
    }
    if (revenueAccount) {
      await db.createTransactionLine({
        transactionId: txn.id,
        accountId: revenueAccount.id,
        debit: "0",
        credit: input.totalAmount,
        description: `Revenue - Invoice ${input.invoiceNumber}`,
      });
    }
    return { transactionId: txn.id };
  } catch (e) {
    console.warn("[Journal Entry] Failed to auto-create for invoice:", e);
    return null;
  }
}
