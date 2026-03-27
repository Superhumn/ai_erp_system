import { eq, and, desc, sql, gte, lte, inArray, count } from "drizzle-orm";
import { getDb } from "./db";
import {
  aiActivityLog, InsertAiActivityLog,
  aiUndoOperations, InsertAiUndoOperation,
  agentRuns, agentRunSteps,
  auditLogs,
  autonomousDecisions,
  workflowRuns, workflowSteps,
} from "../drizzle/schema";

// ============================================
// ACTIVITY LOGGING
// ============================================

export async function logAiActivity(data: InsertAiActivityLog): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Set undo deadline to 24 hours from now for undoable actions
  const undoableActions = ["create", "update", "delete", "transfer", "allocate", "approve", "reject"];
  const isUndoable = undoableActions.includes(data.actionType);

  const [result] = await db.insert(aiActivityLog).values({
    ...data,
    undoStatus: isUndoable ? "available" : "not_undoable",
    undoDeadline: isUndoable ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
  }).$returningId();

  return result.id;
}

// ============================================
// UNIFIED ACTIVITY FEED
// ============================================

export interface ActivityFilters {
  source?: string;
  actionType?: string;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  undoStatus?: string;
  limit?: number;
  offset?: number;
}

export async function getActivityFeed(filters: ActivityFilters = {}) {
  const db = await getDb();
  if (!db) return { activities: [], total: 0 };

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const conditions = [];
  if (filters.source) conditions.push(eq(aiActivityLog.source, filters.source as any));
  if (filters.actionType) conditions.push(eq(aiActivityLog.actionType, filters.actionType as any));
  if (filters.entityType) conditions.push(eq(aiActivityLog.entityType, filters.entityType));
  if (filters.startDate) conditions.push(gte(aiActivityLog.createdAt, filters.startDate));
  if (filters.endDate) conditions.push(lte(aiActivityLog.createdAt, filters.endDate));
  if (filters.undoStatus) conditions.push(eq(aiActivityLog.undoStatus, filters.undoStatus as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [activities, [totalResult]] = await Promise.all([
    db.select()
      .from(aiActivityLog)
      .where(where)
      .orderBy(desc(aiActivityLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() })
      .from(aiActivityLog)
      .where(where),
  ]);

  return {
    activities,
    total: totalResult?.count ?? 0,
  };
}

// ============================================
// AGGREGATED ACTIVITY FEED (from existing tables)
// ============================================

export async function getAggregatedActivityFeed(params: {
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { activities: [], agentRuns: [], decisions: [], auditEntries: [] };

  const limit = params.limit ?? 30;
  const offset = params.offset ?? 0;

  // Fetch from all tracking sources in parallel
  const [activityLogs, recentAgentRuns, recentDecisions, recentAuditLogs] = await Promise.all([
    db.select()
      .from(aiActivityLog)
      .orderBy(desc(aiActivityLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({
      id: agentRuns.id,
      goal: agentRuns.goal,
      status: agentRuns.status,
      iterations: agentRuns.iterations,
      summary: agentRuns.summary,
      totalDurationMs: agentRuns.totalDurationMs,
      toolCallCount: agentRuns.toolCallCount,
      totalTokensUsed: agentRuns.totalTokensUsed,
      startedAt: agentRuns.startedAt,
      completedAt: agentRuns.completedAt,
      userId: agentRuns.userId,
    })
      .from(agentRuns)
      .orderBy(desc(agentRuns.createdAt))
      .limit(limit)
      .offset(offset),
    db.select()
      .from(autonomousDecisions)
      .orderBy(desc(autonomousDecisions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    activities: activityLogs,
    agentRuns: recentAgentRuns,
    decisions: recentDecisions,
    auditEntries: recentAuditLogs,
  };
}

// ============================================
// ACTIVITY STATS
// ============================================

export async function getActivityStats(days: number = 7) {
  const db = await getDb();
  if (!db) return null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    [activityCount],
    [agentRunCount],
    [decisionCount],
    [undoCount],
    undoableActivities,
  ] = await Promise.all([
    db.select({ count: count() }).from(aiActivityLog).where(gte(aiActivityLog.createdAt, since)),
    db.select({ count: count() }).from(agentRuns).where(gte(agentRuns.createdAt, since)),
    db.select({ count: count() }).from(autonomousDecisions).where(gte(autonomousDecisions.createdAt, since)),
    db.select({ count: count() }).from(aiUndoOperations).where(gte(aiUndoOperations.createdAt, since)),
    db.select({ count: count() }).from(aiActivityLog).where(
      and(gte(aiActivityLog.createdAt, since), eq(aiActivityLog.undoStatus, "available"))
    ),
  ]);

  return {
    totalActivities: activityCount?.count ?? 0,
    totalAgentRuns: agentRunCount?.count ?? 0,
    totalDecisions: decisionCount?.count ?? 0,
    totalUndos: undoCount?.count ?? 0,
    undoableCount: undoableActivities?.[0]?.count ?? 0,
    periodDays: days,
  };
}

// ============================================
// UNDO OPERATIONS
// ============================================

const ENTITY_TABLE_MAP: Record<string, string> = {
  product: "products",
  customer: "customers",
  vendor: "vendors",
  invoice: "invoices",
  purchaseOrder: "purchase_orders",
  salesOrder: "sales_orders",
  inventory: "inventory",
  shipment: "shipments",
  workOrder: "work_orders",
  contract: "contracts",
  employee: "employees",
};

export async function requestUndo(params: {
  activityLogId: number;
  requestedBy: number;
  notes?: string;
}): Promise<{ success: boolean; undoId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Fetch the activity to undo
  const [activity] = await db.select()
    .from(aiActivityLog)
    .where(eq(aiActivityLog.id, params.activityLogId));

  if (!activity) {
    return { success: false, error: "Activity not found" };
  }

  if (activity.undoStatus !== "available") {
    return { success: false, error: `Cannot undo: status is '${activity.undoStatus}'` };
  }

  if (activity.undoDeadline && new Date(activity.undoDeadline) < new Date()) {
    await db.update(aiActivityLog)
      .set({ undoStatus: "expired" })
      .where(eq(aiActivityLog.id, params.activityLogId));
    return { success: false, error: "Undo deadline has passed" };
  }

  // Determine undo type
  let undoType: InsertAiUndoOperation["undoType"];
  switch (activity.actionType) {
    case "create": undoType = "delete_created"; break;
    case "update": undoType = "revert_update"; break;
    case "delete": undoType = "restore_deleted"; break;
    case "transfer": undoType = "reverse_transfer"; break;
    case "send_email": undoType = "cancel_email"; break;
    case "approve":
    case "reject": undoType = "reject_approval"; break;
    default: undoType = "revert_update";
  }

  // Create the undo operation
  const [undoResult] = await db.insert(aiUndoOperations).values({
    companyId: activity.companyId,
    activityLogId: params.activityLogId,
    requestedBy: params.requestedBy,
    undoType,
    entityType: activity.entityType,
    entityId: activity.entityId,
    revertData: activity.oldValues,
    status: "in_progress",
    notes: params.notes,
  }).$returningId();

  // Execute the undo
  try {
    await executeUndo(db, activity, undoType);

    // Mark undo as completed
    await db.update(aiUndoOperations)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(aiUndoOperations.id, undoResult.id));

    // Mark activity as undone
    await db.update(aiActivityLog)
      .set({ undoStatus: "undone", undoOperationId: undoResult.id })
      .where(eq(aiActivityLog.id, params.activityLogId));

    return { success: true, undoId: undoResult.id };
  } catch (error: any) {
    // Mark undo as failed
    await db.update(aiUndoOperations)
      .set({ status: "failed", errorMessage: error.message })
      .where(eq(aiUndoOperations.id, undoResult.id));

    return { success: false, error: error.message };
  }
}

async function executeUndo(db: any, activity: any, undoType: string) {
  const tableName = ENTITY_TABLE_MAP[activity.entityType];

  switch (undoType) {
    case "revert_update": {
      if (!activity.oldValues || !activity.entityId) {
        throw new Error("Missing old values or entity ID for revert");
      }
      if (!tableName) {
        throw new Error(`Unknown entity type: ${activity.entityType}`);
      }
      // Use raw SQL for dynamic table updates
      const oldVals = typeof activity.oldValues === "string"
        ? JSON.parse(activity.oldValues)
        : activity.oldValues;

      const setClauses = Object.entries(oldVals)
        .map(([key]) => `\`${key}\` = ?`)
        .join(", ");
      const values = Object.values(oldVals);

      await db.execute(
        sql.raw(`UPDATE \`${tableName}\` SET ${setClauses} WHERE id = ?`),
        [...values, activity.entityId]
      );
      break;
    }

    case "delete_created": {
      if (!activity.entityId || !tableName) {
        throw new Error("Missing entity ID or unknown entity type for delete");
      }
      // Soft-delete by setting status to cancelled/deleted if possible, otherwise hard delete
      try {
        await db.execute(
          sql.raw(`UPDATE \`${tableName}\` SET status = 'cancelled' WHERE id = ?`),
          [activity.entityId]
        );
      } catch {
        // If no status column, try isActive
        try {
          await db.execute(
            sql.raw(`UPDATE \`${tableName}\` SET isActive = 0 WHERE id = ?`),
            [activity.entityId]
          );
        } catch {
          // Last resort: hard delete
          await db.execute(
            sql.raw(`DELETE FROM \`${tableName}\` WHERE id = ?`),
            [activity.entityId]
          );
        }
      }
      break;
    }

    case "restore_deleted": {
      if (!activity.oldValues || !tableName) {
        throw new Error("Missing old values for restore");
      }
      const restoreVals = typeof activity.oldValues === "string"
        ? JSON.parse(activity.oldValues)
        : activity.oldValues;

      const columns = Object.keys(restoreVals).map(k => `\`${k}\``).join(", ");
      const placeholders = Object.keys(restoreVals).map(() => "?").join(", ");
      const vals = Object.values(restoreVals);

      await db.execute(
        sql.raw(`INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`),
        vals
      );
      break;
    }

    case "reverse_transfer":
    case "cancel_email":
    case "reject_approval": {
      // These are logged but require manual review — mark as completed with note
      // The undo operation record serves as documentation
      break;
    }

    default:
      throw new Error(`Unsupported undo type: ${undoType}`);
  }
}

// ============================================
// UNDO HISTORY
// ============================================

export async function getUndoHistory(params: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return { operations: [], total: 0 };

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const conditions = [];
  if (params.status) conditions.push(eq(aiUndoOperations.status, params.status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [operations, [totalResult]] = await Promise.all([
    db.select()
      .from(aiUndoOperations)
      .where(where)
      .orderBy(desc(aiUndoOperations.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() })
      .from(aiUndoOperations)
      .where(where),
  ]);

  return {
    operations,
    total: totalResult?.count ?? 0,
  };
}

export async function getActivityDetail(activityId: number) {
  const db = await getDb();
  if (!db) return null;

  const [activity] = await db.select()
    .from(aiActivityLog)
    .where(eq(aiActivityLog.id, activityId));

  if (!activity) return null;

  // If it has a source run, fetch the run details
  let sourceRunDetail = null;
  if (activity.sourceRunId) {
    if (activity.source === "agent") {
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, activity.sourceRunId));
      if (run) {
        const steps = await db.select().from(agentRunSteps).where(eq(agentRunSteps.runId, run.id));
        sourceRunDetail = { run, steps };
      }
    } else if (activity.source === "autonomous_workflow") {
      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, activity.sourceRunId));
      if (run) {
        const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, run.id));
        sourceRunDetail = { run, steps };
      }
    }
  }

  // Fetch any undo operations
  let undoOp = null;
  if (activity.undoOperationId) {
    const [op] = await db.select().from(aiUndoOperations).where(eq(aiUndoOperations.id, activity.undoOperationId));
    undoOp = op;
  }

  return {
    activity,
    sourceRunDetail,
    undoOperation: undoOp,
  };
}
