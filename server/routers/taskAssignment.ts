import { z } from "zod";
import { router, protectedProcedure, createAuditLog } from "./middleware";
import { assignProjectTaskToAgent, reassignProjectTaskToHuman, createProjectTaskFromSource } from "../taskAgentBridge";

const agentTaskTypeEnum = z.enum([
  "generate_po", "send_rfq", "send_quote_request", "send_email",
  "update_inventory", "create_shipment", "generate_invoice",
  "reconcile_payment", "reorder_materials", "vendor_followup",
  "create_work_order", "query", "reply_email", "approve_po",
  "approve_invoice", "create_vendor", "create_material", "create_product",
  "create_bom", "create_customer", "ingredient_rfq", "invoice_price_review",
]);

/**
 * Task assignment router. Lightfield-style task lifecycle that bridges
 * human-owned project_tasks with AI-owned aiAgentTasks so a single task can
 * move between human + AI execution while keeping one row in Projects.
 *
 * Exported as a plain sub-router so it can be composed into baseRouter (not
 * merged via mergeRouters — merging has a visible type-inference truncation
 * at this codebase's scale).
 */
export const taskAssignmentSubRouter = router({
    toAgent: protectedProcedure
      .input(z.object({
        projectTaskId: z.number(),
        agentTaskType: agentTaskTypeEnum,
        taskData: z.any().optional(),
        reasoning: z.string().optional(),
        confidence: z.number().min(0).max(100).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        requiresApproval: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await assignProjectTaskToAgent({
          projectTaskId: input.projectTaskId,
          agentTaskType: input.agentTaskType,
          taskData: (input.taskData ?? {}) as Record<string, unknown>,
          reasoning: input.reasoning,
          confidence: input.confidence,
          priority: input.priority,
          requiresApproval: input.requiresApproval,
          actorUserId: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, 'update', 'projectTask', input.projectTaskId, `assigned to AI agent (${input.agentTaskType})`);
        return result;
      }),
    toHuman: protectedProcedure
      .input(z.object({
        projectTaskId: z.number(),
        assigneeId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await reassignProjectTaskToHuman(input.projectTaskId, input.assigneeId ?? null, ctx.user.id);
        await createAuditLog(ctx.user.id, 'update', 'projectTask', input.projectTaskId, 'reassigned to human');
        return { success: true };
      }),
    fromSource: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        accountId: z.number().optional(),
        opportunityId: z.number().optional(),
        sourceType: z.enum(['email', 'meeting', 'ai_generated', 'crm_deal']),
        sourceRefType: z.string().optional(),
        sourceRefId: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        dueDate: z.date().optional(),
        assigneeId: z.number().optional(),
        aiReasoning: z.string().optional(),
        aiConfidence: z.number().min(0).max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await createProjectTaskFromSource({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'projectTask', result.id, `${input.name} (from ${input.sourceType})`);
        return result;
      }),
});
