import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getOrchestrator, startOrchestrator, stopOrchestrator } from "./supplyChainOrchestrator";
import { getWorkflowEngine } from "./autonomousWorkflowEngine";
import { autoImportParsedDocuments } from "./emailDocumentAutoImport";
import { getDb } from "./db";
import {
  supplyChainWorkflows,
  workflowRuns,
  workflowSteps,
  workflowApprovalQueue,
  autonomousDecisions,
  supplyChainEvents,
  workflowMetrics,
  approvalThresholds,
  exceptionRules,
  exceptionLog,
  supplierPerformance,
  workflowNotifications,
} from "../drizzle/schema";
import { eq, and, desc, asc, sql, gte, lte, or } from "drizzle-orm";

// ============================================
// AUTONOMOUS WORKFLOW MANAGEMENT ROUTER
// ============================================

// Role-based access for workflow management
const opsOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "ops", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Operations access required" });
  }
  return next({ ctx });
});

const adminOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const autonomousWorkflowRouter = router({
  // ============================================
  // ORCHESTRATOR CONTROL
  // ============================================
  orchestrator: router({
    // Get orchestrator status
    status: opsOrAdminProcedure.query(async () => {
      const orchestrator = getOrchestrator();
      return orchestrator.getSystemStatus();
    }),

    // Start the orchestrator
    start: adminOnlyProcedure.mutation(async () => {
      await startOrchestrator();
      return { success: true, message: "Orchestrator started" };
    }),

    // Stop the orchestrator
    stop: adminOnlyProcedure.mutation(async () => {
      await stopOrchestrator();
      return { success: true, message: "Orchestrator stopped" };
    }),

    // Configure default workflows
    setupDefaults: adminOnlyProcedure.mutation(async () => {
      const orchestrator = getOrchestrator();
      await orchestrator.configureDefaultWorkflows();
      return { success: true, message: "Default workflows configured" };
    }),
  }),

  // ============================================
  // WORKFLOW DEFINITIONS
  // ============================================
  workflows: router({
    // List all workflows
    list: opsOrAdminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      return db.select().from(supplyChainWorkflows).orderBy(asc(supplyChainWorkflows.name));
    }),

    // Get workflow by ID
    get: opsOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [workflow] = await db
          .select()
          .from(supplyChainWorkflows)
          .where(eq(supplyChainWorkflows.id, input.id));

        if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });
        return workflow;
      }),

    // Create new workflow
    create: adminOnlyProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        workflowType: z.string(),
        triggerType: z.enum(["scheduled", "event", "threshold", "manual", "continuous"]),
        cronSchedule: z.string().optional(),
        triggerEvents: z.string().optional(),
        thresholdConfig: z.string().optional(),
        executionConfig: z.string().optional(),
        requiresApproval: z.boolean().default(false),
        autoApproveThreshold: z.string().optional(),
        approvalRoles: z.string().optional(),
        escalationMinutes: z.number().optional(),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [workflow] = await db
          .insert(supplyChainWorkflows)
          .values({
            ...input,
            createdBy: ctx.user.id,
          } as any)
          .$returningId();

        return { success: true, id: workflow.id };
      }),

    // Update workflow
    update: adminOnlyProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        triggerType: z.enum(["scheduled", "event", "threshold", "manual", "continuous"]).optional(),
        cronSchedule: z.string().optional(),
        triggerEvents: z.string().optional(),
        thresholdConfig: z.string().optional(),
        executionConfig: z.string().optional(),
        requiresApproval: z.boolean().optional(),
        autoApproveThreshold: z.string().optional(),
        approvalRoles: z.string().optional(),
        escalationMinutes: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, ...updates } = input;
        await db
          .update(supplyChainWorkflows)
          .set(updates)
          .where(eq(supplyChainWorkflows.id, id));

        return { success: true };
      }),

    // Toggle workflow active status
    toggle: adminOnlyProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [workflow] = await db
          .select()
          .from(supplyChainWorkflows)
          .where(eq(supplyChainWorkflows.id, input.id));

        if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

        await db
          .update(supplyChainWorkflows)
          .set({ isActive: !workflow.isActive })
          .where(eq(supplyChainWorkflows.id, input.id));

        return { success: true, isActive: !workflow.isActive };
      }),

    // Manually trigger a workflow
    trigger: opsOrAdminProcedure
      .input(z.object({
        id: z.number(),
        inputData: z.record(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const orchestrator = getOrchestrator();
        const result = await orchestrator.triggerWorkflow(input.id, input.inputData || {}, ctx.user.id);
        return result;
      }),
  }),

  // ============================================
  // CONVENIENCE TRIGGERS
  // ============================================
  invoiceMatching: router({
    // Trigger invoice matching workflow by name (no need to know the workflow ID)
    trigger: opsOrAdminProcedure
      .input(z.object({
        invoiceIds: z.array(z.number()).optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Find the invoice matching workflow
        const [workflow] = await db
          .select()
          .from(supplyChainWorkflows)
          .where(eq(supplyChainWorkflows.workflowType, "invoice_matching"));

        if (!workflow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invoice matching workflow not configured. Run orchestrator initialization first." });
        }

        const orchestrator = getOrchestrator();
        const result = await orchestrator.triggerWorkflow(workflow.id, input || {}, ctx.user.id);
        return result;
      }),
  }),

  // ============================================
  // EMAIL DOCUMENT AUTO-IMPORT
  // ============================================
  emailAutoImport: router({
    // Trigger auto-import of high-confidence parsed email documents
    trigger: opsOrAdminProcedure
      .mutation(async () => {
        const result = await autoImportParsedDocuments();
        return result;
      }),
  }),

  // ============================================
  // WORKFLOW RUNS
  // ============================================
  runs: router({
    // List recent runs
    list: opsOrAdminProcedure
      .input(z.object({
        workflowId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let query = db
          .select({
            run: workflowRuns,
            workflow: supplyChainWorkflows,
          })
          .from(workflowRuns)
          .innerJoin(supplyChainWorkflows, eq(workflowRuns.workflowId, supplyChainWorkflows.id));

        if (input.workflowId) {
          query = query.where(eq(workflowRuns.workflowId, input.workflowId)) as any;
        }

        if (input.status) {
          query = query.where(eq(workflowRuns.status, input.status as any)) as any;
        }

        return query
          .orderBy(desc(workflowRuns.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      }),

    // Get run details with steps
    get: opsOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [run] = await db
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.id, input.id));

        if (!run) throw new TRPCError({ code: "NOT_FOUND" });

        const steps = await db
          .select()
          .from(workflowSteps)
          .where(eq(workflowSteps.runId, input.id))
          .orderBy(asc(workflowSteps.stepNumber));

        const decisions = await db
          .select()
          .from(autonomousDecisions)
          .where(eq(autonomousDecisions.runId, input.id));

        return { run, steps, decisions };
      }),

    // Get run statistics
    stats: opsOrAdminProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let conditions: any[] = [];

        if (input.startDate) {
          conditions.push(gte(workflowRuns.createdAt, new Date(input.startDate)));
        }
        if (input.endDate) {
          conditions.push(lte(workflowRuns.createdAt, new Date(input.endDate)));
        }

        const [stats] = await db
          .select({
            total: sql<number>`COUNT(*)`,
            completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
            failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
            pending: sql<number>`SUM(CASE WHEN status = 'awaiting_approval' THEN 1 ELSE 0 END)`,
            avgDuration: sql<number>`AVG(durationMs)`,
            totalValue: sql<number>`SUM(CAST(totalValue AS DECIMAL))`,
          })
          .from(workflowRuns)
          .where(conditions.length > 0 ? and(...conditions) : undefined);

        return stats;
      }),
  }),

  // ============================================
  // APPROVALS
  // ============================================
  approvals: router({
    // Get pending approvals for current user
    pending: protectedProcedure.query(async ({ ctx }) => {
      const orchestrator = getOrchestrator();
      return orchestrator.getPendingApprovals(ctx.user.id, ctx.user.role);
    }),

    // Get all pending approvals (admin view)
    all: opsOrAdminProcedure
      .input(z.object({
        status: z.enum(["pending", "escalated", "approved", "rejected"]).optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let query = db.select().from(workflowApprovalQueue);

        if (input.status) {
          query = query.where(eq(workflowApprovalQueue.status, input.status)) as any;
        }

        return query
          .orderBy(desc(workflowApprovalQueue.escalationLevel), asc(workflowApprovalQueue.requestedAt))
          .limit(input.limit);
      }),

    // Get approval details
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [approval] = await db
          .select()
          .from(workflowApprovalQueue)
          .where(eq(workflowApprovalQueue.id, input.id));

        if (!approval) throw new TRPCError({ code: "NOT_FOUND" });
        return approval;
      }),

    // Approve an item
    approve: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const orchestrator = getOrchestrator();
        const result = await orchestrator.processApprovalDecision(
          input.id,
          true,
          ctx.user.id,
          input.notes
        );
        return result;
      }),

    // Reject an item
    reject: protectedProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const orchestrator = getOrchestrator();
        const result = await orchestrator.processApprovalDecision(
          input.id,
          false,
          ctx.user.id,
          input.reason
        );
        return result;
      }),

    // Bulk approve
    bulkApprove: opsOrAdminProcedure
      .input(z.object({
        ids: z.array(z.number()),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const orchestrator = getOrchestrator();
        const results = await Promise.all(
          input.ids.map(id => orchestrator.processApprovalDecision(id, true, ctx.user.id, input.notes))
        );
        return {
          success: results.every(r => r.success),
          processed: results.length,
        };
      }),
  }),

  // ============================================
  // EXCEPTIONS
  // ============================================
  exceptions: router({
    // List open exceptions
    list: opsOrAdminProcedure
      .input(z.object({
        status: z.enum(["open", "in_progress", "resolved", "escalated", "ignored"]).optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let conditions: any[] = [];

        if (input.status) {
          conditions.push(eq(exceptionLog.status, input.status));
        }
        if (input.severity) {
          conditions.push(eq(exceptionLog.severity, input.severity));
        }

        return db
          .select()
          .from(exceptionLog)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(exceptionLog.severity), asc(exceptionLog.detectedAt))
          .limit(input.limit);
      }),

    // Get exception details
    get: opsOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [exception] = await db
          .select()
          .from(exceptionLog)
          .where(eq(exceptionLog.id, input.id));

        if (!exception) throw new TRPCError({ code: "NOT_FOUND" });
        return exception;
      }),

    // Resolve exception
    resolve: opsOrAdminProcedure
      .input(z.object({
        id: z.number(),
        action: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(exceptionLog)
          .set({
            status: "resolved",
            resolutionType: "human_resolved",
            resolutionAction: input.action,
            resolutionNotes: input.notes,
            resolvedBy: ctx.user.id,
            resolvedAt: new Date(),
          })
          .where(eq(exceptionLog.id, input.id));

        return { success: true };
      }),

    // Escalate exception
    escalate: opsOrAdminProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(exceptionLog)
          .set({
            status: "escalated",
            escalatedAt: new Date(),
          })
          .where(eq(exceptionLog.id, input.id));

        return { success: true };
      }),
  }),

  // ============================================
  // EVENTS
  // ============================================
  events: router({
    // List recent events
    list: opsOrAdminProcedure
      .input(z.object({
        eventType: z.string().optional(),
        severity: z.enum(["info", "warning", "error", "critical"]).optional(),
        processed: z.boolean().optional(),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let conditions: any[] = [];

        if (input.eventType) {
          conditions.push(eq(supplyChainEvents.eventType, input.eventType as any));
        }
        if (input.severity) {
          conditions.push(eq(supplyChainEvents.severity, input.severity));
        }
        if (input.processed !== undefined) {
          conditions.push(eq(supplyChainEvents.isProcessed, input.processed));
        }

        return db
          .select()
          .from(supplyChainEvents)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(supplyChainEvents.createdAt))
          .limit(input.limit);
      }),

    // Manually emit an event
    emit: opsOrAdminProcedure
      .input(z.object({
        eventType: z.string(),
        severity: z.enum(["info", "warning", "error", "critical"]).default("info"),
        sourceSystem: z.string(),
        sourceEntityType: z.string().optional(),
        sourceEntityId: z.number().optional(),
        eventData: z.record(z.any()).optional(),
        summary: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const engine = await getWorkflowEngine();
        const eventId = await engine.emitEvent(
          input.eventType,
          input.severity,
          input.sourceSystem,
          input.sourceEntityType || "",
          input.sourceEntityId || 0,
          input.eventData || {}
        );
        return { success: true, eventId };
      }),
  }),

  // ============================================
  // METRICS & ANALYTICS
  // ============================================
  metrics: router({
    // Get workflow metrics
    byWorkflow: opsOrAdminProcedure
      .input(z.object({
        workflowId: z.number(),
        days: z.number().default(30),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);

        return db
          .select()
          .from(workflowMetrics)
          .where(
            and(
              eq(workflowMetrics.workflowId, input.workflowId),
              gte(workflowMetrics.metricDate, startDate)
            )
          )
          .orderBy(asc(workflowMetrics.metricDate));
      }),

    // Get overall system metrics
    overview: opsOrAdminProcedure
      .input(z.object({ days: z.number().default(7) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);

        const [summary] = await db
          .select({
            totalRuns: sql<number>`SUM(totalRuns)`,
            successfulRuns: sql<number>`SUM(successfulRuns)`,
            failedRuns: sql<number>`SUM(failedRuns)`,
            itemsProcessed: sql<number>`SUM(itemsProcessed)`,
            totalValue: sql<number>`SUM(CAST(totalValueProcessed AS DECIMAL))`,
            aiDecisions: sql<number>`SUM(aiDecisionCount)`,
            aiOverrides: sql<number>`SUM(aiOverrideCount)`,
            tokensUsed: sql<number>`SUM(totalTokensUsed)`,
            timeSaved: sql<number>`SUM(estimatedTimeSavedMinutes)`,
            costSavings: sql<number>`SUM(CAST(estimatedCostSavings AS DECIMAL))`,
          })
          .from(workflowMetrics)
          .where(gte(workflowMetrics.metricDate, startDate));

        return summary;
      }),

    // Get supplier performance
    supplierPerformance: opsOrAdminProcedure
      .input(z.object({
        vendorId: z.number().optional(),
        months: z.number().default(6),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let query = db.select().from(supplierPerformance);

        if (input.vendorId) {
          query = query.where(eq(supplierPerformance.vendorId, input.vendorId)) as any;
        }

        return query.orderBy(desc(supplierPerformance.metricMonth)).limit(input.months);
      }),
  }),

  // ============================================
  // CONFIGURATION
  // ============================================
  config: router({
    // Get approval thresholds
    thresholds: adminOnlyProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db.select().from(approvalThresholds).where(eq(approvalThresholds.isActive, true));
    }),

    // Update approval threshold
    updateThreshold: adminOnlyProcedure
      .input(z.object({
        id: z.number(),
        autoApproveMaxAmount: z.string().optional(),
        level1MaxAmount: z.string().optional(),
        level2MaxAmount: z.string().optional(),
        level3MaxAmount: z.string().optional(),
        level1Roles: z.string().optional(),
        level2Roles: z.string().optional(),
        level3Roles: z.string().optional(),
        execRoles: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, ...updates } = input;
        await db
          .update(approvalThresholds)
          .set(updates)
          .where(eq(approvalThresholds.id, id));

        return { success: true };
      }),

    // Get exception rules
    exceptionRules: adminOnlyProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db.select().from(exceptionRules).where(eq(exceptionRules.isActive, true));
    }),

    // Create exception rule
    createExceptionRule: adminOnlyProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        exceptionType: z.string(),
        matchConditions: z.string().optional(),
        varianceThresholdPercent: z.string().optional(),
        resolutionStrategy: z.string(),
        autoResolutionAction: z.string().optional(),
        notifyRoles: z.string().optional(),
        resolveWithinMinutes: z.number().optional(),
        escalateAfterMinutes: z.number().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [rule] = await db
          .insert(exceptionRules)
          .values({
            ...input,
            createdBy: ctx.user.id,
            isActive: true,
          } as any)
          .$returningId();

        return { success: true, id: rule.id };
      }),
  }),

  // ============================================
  // NOTIFICATIONS
  // ============================================
  notifications: router({
    // Get user's notifications
    list: protectedProcedure
      .input(z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().default(50),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let conditions: any[] = [
          or(
            sql`JSON_CONTAINS(${workflowNotifications.targetUserIds}, CAST(${ctx.user.id} AS JSON))`,
            sql`JSON_CONTAINS(${workflowNotifications.targetRoles}, JSON_QUOTE(${ctx.user.role}))`
          ),
        ];

        if (input.unreadOnly) {
          conditions.push(eq(workflowNotifications.isRead, false));
        }

        return db
          .select()
          .from(workflowNotifications)
          .where(and(...conditions))
          .orderBy(desc(workflowNotifications.createdAt))
          .limit(input.limit);
      }),

    // Mark notification as read
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(workflowNotifications)
          .set({
            isRead: true,
            readBy: ctx.user.id,
            readAt: new Date(),
          })
          .where(eq(workflowNotifications.id, input.id));

        return { success: true };
      }),

    // Mark all as read
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(workflowNotifications)
        .set({
          isRead: true,
          readBy: ctx.user.id,
          readAt: new Date(),
        })
        .where(
          and(
            eq(workflowNotifications.isRead, false),
            or(
              sql`JSON_CONTAINS(${workflowNotifications.targetUserIds}, CAST(${ctx.user.id} AS JSON))`,
              sql`JSON_CONTAINS(${workflowNotifications.targetRoles}, JSON_QUOTE(${ctx.user.role}))`
            )
          )
        );

      return { success: true };
    }),
  }),

  // ============================================
  // AI DECISIONS AUDIT
  // ============================================
  decisions: router({
    // List AI decisions
    list: opsOrAdminProcedure
      .input(z.object({
        runId: z.number().optional(),
        decisionType: z.string().optional(),
        overriddenOnly: z.boolean().default(false),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        let conditions: any[] = [];

        if (input.runId) {
          conditions.push(eq(autonomousDecisions.runId, input.runId));
        }
        if (input.decisionType) {
          conditions.push(eq(autonomousDecisions.decisionType, input.decisionType as any));
        }
        if (input.overriddenOnly) {
          conditions.push(eq(autonomousDecisions.wasOverridden, true));
        }

        return db
          .select()
          .from(autonomousDecisions)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(autonomousDecisions.createdAt))
          .limit(input.limit);
      }),

    // Provide feedback on a decision
    feedback: opsOrAdminProcedure
      .input(z.object({
        id: z.number(),
        score: z.number().min(-2).max(2), // -2: Very bad, -1: Bad, 0: Neutral, 1: Good, 2: Very good
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(autonomousDecisions)
          .set({
            feedbackScore: input.score,
            feedbackNotes: input.notes,
          })
          .where(eq(autonomousDecisions.id, input.id));

        return { success: true };
      }),

    // Override a decision
    override: opsOrAdminProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().min(1),
        newDecision: z.record(z.any()),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(autonomousDecisions)
          .set({
            wasOverridden: true,
            overriddenBy: ctx.user.id,
            overrideReason: input.reason,
            chosenOption: JSON.stringify(input.newDecision),
          })
          .where(eq(autonomousDecisions.id, input.id));

        return { success: true };
      }),
  }),
});

export type AutonomousWorkflowRouter = typeof autonomousWorkflowRouter;
