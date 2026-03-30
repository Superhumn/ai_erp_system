import { getDb } from "../../db";
import {
  orders,
  invoices,
  purchaseOrders,
  workOrders,
  inventory,
  shipments,
  customers,
  vendors,
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
      .where(eq(purchaseOrders.status, "pending"));
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

  // Executive context: inventory health + customer/vendor counts
  let lowStockItems = 0;
  let activeShipments = 0;
  let totalCustomers = 0;
  let totalVendors = 0;

  try {
    const [invResult] = await db
      .select({ count: sql<number>`SUM(CASE WHEN CAST(${inventory.quantity} AS SIGNED) <= CAST(${inventory.reorderPoint} AS SIGNED) AND CAST(${inventory.quantity} AS SIGNED) > 0 THEN 1 ELSE 0 END)` })
      .from(inventory);
    lowStockItems = Number(invResult?.count ?? 0);
  } catch {
    // Table may not have data yet
  }

  try {
    const [shipResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(shipments)
      .where(eq(shipments.status, "in_transit"));
    activeShipments = shipResult?.count ?? 0;
  } catch {
    // Table may not have data yet
  }

  try {
    const [custResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers);
    totalCustomers = custResult?.count ?? 0;
  } catch {}

  try {
    const [vendResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(vendors);
    totalVendors = vendResult?.count ?? 0;
  } catch {}

  return {
    userId,
    companyId,
    activeDealCount,
    openInvoiceCount,
    pendingPOCount,
    openWorkOrders,
    lowStockItems,
    activeShipments,
    totalCustomers,
    totalVendors,
    timestamp: new Date().toISOString(),
  };
}
