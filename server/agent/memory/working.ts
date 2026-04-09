import { getDb } from "../../db";
import {
  orders,
  invoices,
  purchaseOrders,
  workOrders,
} from "../../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import type { AgentContext } from "../types";

/**
 * Builds a lightweight working context snapshot from the DB
 * to inject into each agent run so it reasons on real data.
 */
export async function buildWorkingContext(userId: string, companyId?: number): Promise<AgentContext> {
  const db = await getDb();

  let activeDealCount = 0;
  let openInvoiceCount = 0;
  let pendingPOCount = 0;
  let openWorkOrders = 0;

  try {
    const [dealResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(eq(orders.status, "pending"));
    activeDealCount = dealResult?.count ?? 0;
  } catch {
    // Table may not have data yet
  }

  try {
    const [invoiceResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(invoices)
      .where(eq(invoices.status, "sent"));
    openInvoiceCount = invoiceResult?.count ?? 0;
  } catch {
    // Table may not have data yet
  }

  try {
    const [poResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, "draft"));
    pendingPOCount = poResult?.count ?? 0;
  } catch {
    // Table may not have data yet
  }

  try {
    const [woResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(workOrders)
      .where(eq(workOrders.status, "in_progress"));
    openWorkOrders = woResult?.count ?? 0;
  } catch {
    // Table may not have data yet
  }

  return {
    userId,
    companyId,
    activeDealCount,
    openInvoiceCount,
    pendingPOCount,
    openWorkOrders,
    timestamp: new Date().toISOString(),
  };
}
