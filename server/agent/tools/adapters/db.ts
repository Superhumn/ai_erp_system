import { getDb } from "../../../db";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../../../drizzle/schema";
import type { ToolAdapterInput, ToolAdapterResult } from "../../types";

/**
 * Map of table name strings to Drizzle table references.
 * Only expose tables that are safe for the agent to read.
 */
const TABLE_MAP: Record<string, any> = {
  orders: schema.orders,
  orderItems: schema.orderItems,
  invoices: schema.invoices,
  invoiceItems: schema.invoiceItems,
  payments: schema.payments,
  products: schema.products,
  customers: schema.customers,
  vendors: schema.vendors,
  inventory: schema.inventory,
  warehouses: schema.warehouses,
  purchaseOrders: schema.purchaseOrders,
  purchaseOrderItems: schema.purchaseOrderItems,
  workOrders: schema.workOrders,
  shipments: schema.shipments,
  employees: schema.employees,
  rawMaterials: schema.rawMaterials,
  rawMaterialInventory: schema.rawMaterialInventory,
  billOfMaterials: schema.billOfMaterials,
  demandForecasts: schema.demandForecasts,
  productionPlans: schema.productionPlans,
  freightCarriers: schema.freightCarriers,
  freightRfqs: schema.freightRfqs,
  // supplierPerformance: table removed from schema
  accounts: schema.accounts,
  transactions: schema.transactions,
  companies: schema.companies,
};

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Generic database query adapter — allows the agent to read from
 * any whitelisted ERP table with optional filters.
 */
export async function queryDatabase(input: ToolAdapterInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  const { table: tableName, filters, limit: requestedLimit } = input;

  if (!tableName) {
    return { success: false, error: "table name is required" };
  }

  const tableRef = TABLE_MAP[tableName];
  if (!tableRef) {
    const available = Object.keys(TABLE_MAP).join(", ");
    return {
      success: false,
      error: `Unknown table: "${tableName}". Available tables: ${available}`,
    };
  }

  const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);

  try {
    let query = db.select().from(tableRef);

    // Apply simple equality filters
    if (filters && typeof filters === "object") {
      for (const [column, value] of Object.entries(filters)) {
        const col = (tableRef as any)[column];
        if (col) {
          query = query.where(eq(col, value)) as any;
        }
      }
    }

    const rows = await (query as any).limit(limit);
    return { success: true, data: rows, rowCount: rows.length };
  } catch (err) {
    return {
      success: false,
      error: `Query failed: ${(err as Error).message}`,
    };
  }
}
