import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { triggerAgent } from "./trigger";
import { getAgentRunWithSteps } from "./persistence";
import { getAuditTrail, revertAuditEntry, revertAgentRun } from "./audit";
import { getDb } from "../db";
import { agentRuns, agentRunSteps, agentAuditTrail } from "../../drizzle/schema";
import { desc, eq, sql } from "drizzle-orm";

// Only admin/ops/exec can trigger agent runs
const agentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "ops", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agent access requires admin, ops, or exec role" });
  }
  return next({ ctx });
});

export const agentRouter = router({
  /**
   * Trigger a new agent run with a natural language goal.
   */
  trigger: agentProcedure
    .input(
      z.object({
        goal: z.string().min(1).max(2000),
        maxIterations: z.number().int().min(1).max(50).optional(),
        context: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await triggerAgent({
        goal: input.goal,
        userId: String(ctx.user.id),
        companyId: ctx.user.companyId ?? undefined,
        maxIterations: input.maxIterations,
        context: input.context,
      });

      return {
        runId: result.runId,
        status: result.status,
        iterations: result.iterations,
        summary: result.summary,
        toolCallCount: result.toolCallCount,
        totalDurationMs: result.totalDurationMs,
        error: result.error,
      };
    }),

  /**
   * Get details of a specific agent run including all steps.
   */
  getRun: agentProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const result = await getAgentRunWithSteps(input.runId);
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent run not found" });
      }
      return result;
    }),

  /**
   * List recent agent runs with pagination.
   */
  listRuns: agentProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const runs = await db
        .select({
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
        })
        .from(agentRuns)
        .orderBy(desc(agentRuns.createdAt))
        .limit(limit)
        .offset(offset);

      return runs;
    }),

  /**
   * Get the full audit trail for an agent run — every mutation with before/after snapshots.
   */
  getAuditTrail: agentProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const trail = await getAuditTrail(input.runId);
      return trail.map((entry) => ({
        ...entry,
        beforeSnapshot: entry.beforeSnapshot ? JSON.parse(entry.beforeSnapshot) : null,
        afterSnapshot: entry.afterSnapshot ? JSON.parse(entry.afterSnapshot) : null,
      }));
    }),

  /**
   * Undo a single agent action by reverting the audit trail entry.
   */
  undoAction: agentProcedure
    .input(z.object({ auditId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await revertAuditEntry(input.auditId, ctx.user.id);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Undo failed" });
      }
      return { success: true, auditId: input.auditId };
    }),

  /**
   * Undo all mutations from an entire agent run, in reverse order.
   */
  undoRun: agentProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await revertAgentRun(input.runId, ctx.user.id);
      return result;
    }),

  /**
   * Unified activity feed — recent agent actions across all runs.
   * Combines audit trail entries with run metadata for a timeline view.
   */
  activityFeed: agentProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        runId: z.number().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      let query = db
        .select({
          id: agentAuditTrail.id,
          agentRunId: agentAuditTrail.agentRunId,
          operationType: agentAuditTrail.operationType,
          tableName: agentAuditTrail.tableName,
          rowId: agentAuditTrail.rowId,
          description: agentAuditTrail.description,
          isReverted: agentAuditTrail.isReverted,
          revertedAt: agentAuditTrail.revertedAt,
          createdAt: agentAuditTrail.createdAt,
          // Join run info
          runGoal: agentRuns.goal,
          runStatus: agentRuns.status,
        })
        .from(agentAuditTrail)
        .innerJoin(agentRuns, eq(agentAuditTrail.agentRunId, agentRuns.id))
        .orderBy(desc(agentAuditTrail.createdAt))
        .limit(limit)
        .offset(offset);

      if (input?.runId) {
        query = query.where(eq(agentAuditTrail.agentRunId, input.runId)) as any;
      }

      const entries = await query;

      return entries;
    }),
});
