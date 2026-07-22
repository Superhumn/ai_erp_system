import { getDb } from "../../../db";
import {
  orders,
  orderItems,
  customers,
  products,
} from "../../../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { ToolAdapterInput, ToolAdapterResult } from "../../types";

/**
 * Sales pipeline adapter — wraps existing order/sales DB operations
 * as an agent-callable tool.
 */
export async function runSalesPipelineWorkflow(input: ToolAdapterInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  const { action, payload } = input;

  switch (action) {
    case "get_pipeline_summary": {
      const statusCounts = await db
        .select({
          status: orders.status,
          count: sql<number>`COUNT(*)`,
          totalValue: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL)), 0)`,
        })
        .from(orders)
        .groupBy(orders.status);

      return { success: true, data: { pipeline: statusCounts } };
    }

    case "get_orders_by_status": {
      const status = (payload as any)?.status ?? "pending";
      const result = await db
        .select()
        .from(orders)
        .where(eq(orders.status, status))
        .orderBy(desc(orders.createdAt))
        .limit(50);

      return { success: true, data: { orders: result, count: result.length } };
    }

    case "update_order_status": {
      const { orderId, newStatus } = (payload ?? {}) as any;
      if (!orderId || !newStatus) {
        return { success: false, error: "orderId and newStatus are required" };
      }

      await db
        .update(orders)
        .set({ status: newStatus })
        .where(eq(orders.id, orderId));

      return { success: true, data: { orderId, newStatus, updated: true } };
    }

    case "get_customer_orders": {
      const customerId = (payload as any)?.customerId;
      if (!customerId) {
        return { success: false, error: "customerId is required" };
      }

      const result = await db
        .select()
        .from(orders)
        .where(eq(orders.customerId, customerId))
        .orderBy(desc(orders.createdAt))
        .limit(50);

      return { success: true, data: { orders: result, count: result.length } };
    }

    default:
      return { success: false, error: `Unknown sales action: ${action}` };
  }
}
