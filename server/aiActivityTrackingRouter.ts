import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  logAiActivity,
  getActivityFeed,
  getAggregatedActivityFeed,
  getActivityStats,
  requestUndo,
  getUndoHistory,
  getActivityDetail,
} from "./aiActivityTrackingService";

// Only admin, ops, exec can access AI activity tracking
const activityProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "ops", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "AI activity tracking requires admin, ops, or exec role" });
  }
  return next({ ctx });
});

// Only admin can perform undo operations
const undoProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Undo operations require admin or exec role" });
  }
  return next({ ctx });
});

export const aiActivityTrackingRouter = router({
  // ============================================
  // ACTIVITY FEED
  // ============================================

  /** Get the unified AI activity feed with filtering */
  feed: activityProcedure
    .input(z.object({
      source: z.enum(["agent", "autonomous_workflow", "ai_assistant", "ai_agent_task"]).optional(),
      actionType: z.enum(["create", "update", "delete", "send_email", "approve", "reject", "transfer", "allocate", "forecast", "analyze", "decision"]).optional(),
      entityType: z.string().optional(),
      undoStatus: z.enum(["available", "undone", "expired", "not_undoable"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getActivityFeed({
        ...input,
        startDate: input?.startDate ? new Date(input.startDate) : undefined,
        endDate: input?.endDate ? new Date(input.endDate) : undefined,
      });
    }),

  /** Get aggregated feed from all tracking sources (agent_runs, autonomous_decisions, audit_logs) */
  aggregated: activityProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getAggregatedActivityFeed({
        limit: input?.limit,
        offset: input?.offset,
      });
    }),

  /** Get activity statistics for dashboard */
  stats: activityProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getActivityStats(input?.days ?? 7);
    }),

  /** Get detailed view of a specific activity including source run and undo info */
  detail: activityProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const detail = await getActivityDetail(input.id);
      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
      }
      return detail;
    }),

  // ============================================
  // LOG NEW ACTIVITY
  // ============================================

  /** Log a new AI activity (used by other services) */
  log: activityProcedure
    .input(z.object({
      source: z.enum(["agent", "autonomous_workflow", "ai_assistant", "ai_agent_task"]),
      sourceRunId: z.number().optional(),
      sourceStepId: z.number().optional(),
      actionType: z.enum(["create", "update", "delete", "send_email", "approve", "reject", "transfer", "allocate", "forecast", "analyze", "decision"]),
      entityType: z.string(),
      entityId: z.number().optional(),
      entityName: z.string().optional(),
      description: z.string(),
      oldValues: z.any().optional(),
      newValues: z.any().optional(),
      aiReasoning: z.string().optional(),
      confidence: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await logAiActivity({
        ...input,
        userId: ctx.user.id,
        companyId: ctx.user.companyId,
      });
      return { id };
    }),

  // ============================================
  // UNDO OPERATIONS
  // ============================================

  /** Request an undo for a specific AI activity */
  undo: undoProcedure
    .input(z.object({
      activityLogId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await requestUndo({
        activityLogId: input.activityLogId,
        requestedBy: ctx.user.id,
        notes: input.notes,
      });

      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Undo failed" });
      }

      return result;
    }),

  /** Get undo operation history */
  undoHistory: activityProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getUndoHistory({
        limit: input?.limit,
        offset: input?.offset,
        status: input?.status,
      });
    }),
});
