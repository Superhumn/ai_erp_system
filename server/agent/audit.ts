import { getDb } from "../db";
import { agentAuditTrail } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { logAgent } from "./logger";

/**
 * Map of table name strings to Drizzle table references for snapshot lookups.
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
  purchaseOrders: schema.purchaseOrders,
  purchaseOrderItems: schema.purchaseOrderItems,
  workOrders: schema.workOrders,
  shipments: schema.shipments,
  crmContacts: schema.crmContacts,
  crmInteractions: schema.crmInteractions,
  sentEmails: schema.sentEmails,
  agentCallLogs: schema.agentCallLogs,
};

/**
 * Captures a snapshot of a row before a mutation for undo support.
 * Returns the snapshot data or null if row not found.
 */
export async function captureBeforeSnapshot(
  tableName: string,
  rowId: number,
): Promise<Record<string, unknown> | null> {
  const tableRef = TABLE_MAP[tableName];
  if (!tableRef || !rowId) return null;

  try {
    const db = await getDb();
    const [row] = await db.select().from(tableRef).where(eq(tableRef.id, rowId));
    return row ? (row as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Records an audit trail entry for an agent mutation.
 */
export async function recordAuditEntry(params: {
  agentRunId: number;
  stepId?: number;
  operationType: "insert" | "update" | "delete" | "email_sent" | "call_made";
  tableName: string;
  rowId?: number;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  description: string;
}): Promise<number> {
  const db = await getDb();
  const [result] = await db.insert(agentAuditTrail).values({
    agentRunId: params.agentRunId,
    stepId: params.stepId,
    operationType: params.operationType,
    tableName: params.tableName,
    rowId: params.rowId,
    beforeSnapshot: params.beforeSnapshot ? JSON.stringify(params.beforeSnapshot) : null,
    afterSnapshot: params.afterSnapshot ? JSON.stringify(params.afterSnapshot) : null,
    description: params.description.slice(0, 500),
  }).$returningId();

  logAgent({
    level: "info",
    runId: params.agentRunId,
    message: `Audit: ${params.operationType} on ${params.tableName}${params.rowId ? ` #${params.rowId}` : ""} — ${params.description}`,
  });

  return result.id;
}

/**
 * Reverts a single audit trail entry by restoring the before-snapshot.
 * Only works for update/insert operations on tables we can write to.
 */
export async function revertAuditEntry(
  auditId: number,
  revertedBy?: number,
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();

  const [entry] = await db
    .select()
    .from(agentAuditTrail)
    .where(eq(agentAuditTrail.id, auditId));

  if (!entry) return { success: false, error: "Audit entry not found" };
  if (entry.isReverted) return { success: false, error: "Already reverted" };

  const tableRef = TABLE_MAP[entry.tableName];
  if (!tableRef) {
    return { success: false, error: `Cannot revert: table "${entry.tableName}" not in revertible set` };
  }

  try {
    switch (entry.operationType) {
      case "update": {
        // Restore the before-snapshot
        if (!entry.beforeSnapshot || !entry.rowId) {
          return { success: false, error: "No before-snapshot or rowId available for revert" };
        }
        const before = JSON.parse(entry.beforeSnapshot);
        // Remove auto-managed fields
        delete before.id;
        delete before.createdAt;
        delete before.updatedAt;

        await db
          .update(tableRef)
          .set(before)
          .where(eq(tableRef.id, entry.rowId));

        break;
      }

      case "insert": {
        // Delete the inserted row
        if (!entry.rowId) {
          return { success: false, error: "No rowId available for revert" };
        }
        await db.delete(tableRef).where(eq(tableRef.id, entry.rowId));
        break;
      }

      case "delete": {
        // Re-insert the before-snapshot
        if (!entry.beforeSnapshot) {
          return { success: false, error: "No before-snapshot available for revert" };
        }
        const data = JSON.parse(entry.beforeSnapshot);
        delete data.id; // Let auto-increment assign new ID
        await db.insert(tableRef).values(data);
        break;
      }

      case "email_sent":
      case "call_made": {
        // Mark the related record's status to indicate it was reverted/cancelled
        // We can't un-send an email or un-make a call, but we can flag it
        if (entry.rowId) {
          if (entry.tableName === "sentEmails") {
            await db.update(schema.sentEmails)
              .set({ status: "failed" })
              .where(eq(schema.sentEmails.id, entry.rowId));
          } else if (entry.tableName === "agentCallLogs") {
            await db.update(schema.agentCallLogs)
              .set({ status: "failed" })
              .where(eq(schema.agentCallLogs.id, entry.rowId));
          }
        }
        break;
      }

      default:
        return { success: false, error: `Unsupported revert for operation type: ${entry.operationType}` };
    }

    // Mark as reverted
    await db
      .update(agentAuditTrail)
      .set({
        isReverted: true,
        revertedAt: new Date(),
        revertedBy: revertedBy ?? null,
      })
      .where(eq(agentAuditTrail.id, auditId));

    logAgent({
      level: "info",
      runId: entry.agentRunId,
      message: `Reverted audit #${auditId}: ${entry.operationType} on ${entry.tableName}${entry.rowId ? ` #${entry.rowId}` : ""}`,
    });

    return { success: true };
  } catch (err) {
    const errorMsg = (err as Error).message;

    // Record the revert failure
    await db
      .update(agentAuditTrail)
      .set({ revertError: errorMsg })
      .where(eq(agentAuditTrail.id, auditId));

    return { success: false, error: `Revert failed: ${errorMsg}` };
  }
}

/**
 * Reverts all mutations from an entire agent run, in reverse order.
 */
export async function revertAgentRun(
  agentRunId: number,
  revertedBy?: number,
): Promise<{ reverted: number; failed: number; errors: string[] }> {
  const db = await getDb();

  // Get all unrevertied entries for this run, newest first
  const entries = await db
    .select()
    .from(agentAuditTrail)
    .where(eq(agentAuditTrail.agentRunId, agentRunId))
    .orderBy(sql`${agentAuditTrail.id} DESC`);

  let reverted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry.isReverted) {
      reverted++; // already done
      continue;
    }

    const result = await revertAuditEntry(entry.id, revertedBy);
    if (result.success) {
      reverted++;
    } else {
      failed++;
      errors.push(`Audit #${entry.id}: ${result.error}`);
    }
  }

  logAgent({
    level: "info",
    runId: agentRunId,
    message: `Run revert complete: ${reverted} reverted, ${failed} failed`,
  });

  return { reverted, failed, errors };
}

/**
 * Gets the full audit trail for an agent run.
 */
export async function getAuditTrail(agentRunId: number) {
  const db = await getDb();
  return db
    .select()
    .from(agentAuditTrail)
    .where(eq(agentAuditTrail.agentRunId, agentRunId))
    .orderBy(sql`${agentAuditTrail.id} ASC`);
}
