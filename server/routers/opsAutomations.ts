// appRouter.opsAutomations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { testRunRule } from "../opsAutomationEngine";
import * as db from "../db";
import { internalProcedure } from "./_shared";

export const opsAutomationsRouter = router({
    list: internalProcedure.input(z.object({ module: z.string().optional() }).optional()).query(({ input }) => db.listAutomationRules(input?.module)),
    get: internalProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getAutomationRuleById(input.id)),
    create: internalProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        module: z.string(),
        triggerType: z.enum(["record_created", "record_updated", "field_changed", "form_submitted", "scheduled"]),
        triggerConfig: z.any().optional(),
        conditions: z.any().optional(),
        actionType: z.enum(["send_email", "create_notification", "webhook"]),
        actionConfig: z.any().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createAutomationRule({
          ...input,
          triggerConfig: input.triggerConfig ?? {},
          conditions: input.conditions ?? [],
          actionConfig: input.actionConfig ?? {},
          createdBy: ctx.user.id,
        });
        return { id: result.id };
      }),
    update: internalProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        triggerType: z.enum(["record_created", "record_updated", "field_changed", "form_submitted", "scheduled"]).optional(),
        triggerConfig: z.any().optional(),
        conditions: z.any().optional(),
        actionType: z.enum(["send_email", "create_notification", "webhook"]).optional(),
        actionConfig: z.any().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...rest } = input; await db.updateAutomationRule(id, rest as any); return { success: true }; }),
    delete: internalProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { await db.deleteAutomationRule(input.id); return { success: true }; }),
    runs: internalProcedure.input(z.object({ ruleId: z.number() })).query(({ input }) => db.listAutomationRuns(input.ruleId)),
    testRun: internalProcedure
      .input(z.object({ ruleId: z.number(), sampleRecord: z.record(z.string(), z.any()) }))
      .mutation(async ({ input, ctx }) => {
        const detail = await testRunRule(input.ruleId, input.sampleRecord, ctx.user.id);
        return { detail };
      }),
  });
