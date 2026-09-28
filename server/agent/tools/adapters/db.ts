import { getDb } from "../../../db";
import { and, eq } from "drizzle-orm";
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
  supplierPerformance: schema.supplierPerformance,
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
  if (!db) throw new Error("Database connection unavailable");
  const { table: tableName, filters, limit: requestedLimit } = input;
  // Company scope injected by the agent loop (from the run's context), not by the model.
  const scopeCompanyId =
    typeof input.scopeCompanyId === "number" && Number.isFinite(input.scopeCompanyId)
      ? input.scopeCompanyId
      : undefined;

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
    // Collect every condition and apply them in ONE .where(and(...)) call —
    // Drizzle's .where() replaces (not appends to) the previous condition, so
    // chaining it per-filter would silently keep only the last filter.
    const conditions: any[] = [];
    const companyCol = (tableRef as any).companyId;

    if (scopeCompanyId !== undefined && companyCol) {
      conditions.push(eq(companyCol, scopeCompanyId));
    }

    // Apply simple equality filters
    if (filters && typeof filters === "object") {
      for (const [column, value] of Object.entries(filters)) {
        // The run's company scope wins over a model-supplied companyId filter.
        if (column === "companyId" && scopeCompanyId !== undefined && companyCol) continue;
        const col = (tableRef as any)[column];
        if (col) {
          conditions.push(eq(col, value));
        }
      }
    }

    let query: any = db.select().from(tableRef);
    if (conditions.length === 1) {
      query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }

    const rows = await query.limit(limit);
    return { success: true, data: rows, rowCount: rows.length };
  } catch (err) {
    return {
      success: false,
      error: `Query failed: ${(err as Error).message}`,
    };
  }
}
