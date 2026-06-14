import { getDb } from "../../../db";
import {
  invoices,
  invoiceItems,
  payments,
  orders,
} from "../../../../drizzle/schema";
import { eq, desc, sql, lt } from "drizzle-orm";
import type { ToolAdapterInput, ToolAdapterResult } from "../../types";

/**
 * Finance adapter — wraps existing invoice/payment DB operations
 * as an agent-callable tool.
 */
export async function runFinanceWorkflow(input: ToolAdapterInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  const { action, payload } = input;

  switch (action) {
    case "get_open_invoices": {
      const result = await db
        .select()
        .from(invoices)
        .where(eq(invoices.status, "sent"))
        .orderBy(desc(invoices.createdAt))
        .limit(50);

      return { success: true, data: { invoices: result, count: result.length } };
    }

    case "get_invoice_details": {
      const invoiceId = (payload as any)?.invoiceId;
      if (!invoiceId) {
        return { success: false, error: "invoiceId is required" };
      }

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId));

      if (!invoice) {
        return { success: false, error: `Invoice ${invoiceId} not found` };
      }

      const items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoiceId));

      return { success: true, data: { invoice, items } };
    }

    case "get_payment_status": {
      const invoiceId = (payload as any)?.invoiceId;
      if (!invoiceId) {
        return { success: false, error: "invoiceId is required" };
      }

      const invoicePayments = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, invoiceId))
        .orderBy(desc(payments.paymentDate));

      return { success: true, data: { payments: invoicePayments, count: invoicePayments.length } };
    }

    case "get_revenue_summary": {
      const summary = await db
        .select({
          status: invoices.status,
          count: sql<number>`COUNT(*)`,
          totalAmount: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS DECIMAL)), 0)`,
        })
        .from(invoices)
        .groupBy(invoices.status);

      return { success: true, data: { revenue: summary } };
    }

    case "get_overdue_invoices": {
      const now = new Date();
      const overdue = await db
        .select()
        .from(invoices)
        .where(eq(invoices.status, "sent"))
        .orderBy(desc(invoices.createdAt))
        .limit(50);

      // Filter to those past due date client-side since dueDate column format may vary
      const overdueFiltered = overdue.filter(
        (inv: any) => inv.dueDate && new Date(inv.dueDate) < now
      );

      return { success: true, data: { invoices: overdueFiltered, count: overdueFiltered.length } };
    }

    default:
      return { success: false, error: `Unknown finance action: ${action}` };
  }
}
