import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  collectExecutiveKPIs,
  generateStrategicAnalysis,
  generateExecutiveBriefing,
  askExecutiveQuestion,
  departmentDeepDive,
} from "./executiveReasoningService";

// Only exec/admin can access executive reasoning
const execProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Executive access required" });
  }
  return next({ ctx });
});

export const executiveReasoningRouter = router({
  /**
   * Get raw cross-functional KPI snapshot.
   */
  getKPIs: execProcedure
    .query(async ({ ctx }) => {
      return collectExecutiveKPIs(ctx.user.companyId ?? undefined);
    }),

  /**
   * Full COO strategic analysis with risks, bottlenecks, and opportunities.
   */
  strategicAnalysis: execProcedure
    .input(
      z.object({
        focusArea: z.string().optional(),
      }).optional(),
    )
    .mutation(async ({ input, ctx }) => {
      return generateStrategicAnalysis(ctx.user.companyId ?? undefined, input?.focusArea);
    }),

  /**
   * Executive briefing with narrative summary for leadership.
   */
  executiveBriefing: execProcedure
    .input(
      z.object({
        focusArea: z.string().optional(),
      }).optional(),
    )
    .mutation(async ({ input, ctx }) => {
      return generateExecutiveBriefing(ctx.user.companyId ?? undefined, input?.focusArea);
    }),

  /**
   * Ask a strategic question and get a data-driven answer.
   */
  askQuestion: execProcedure
    .input(
      z.object({
        question: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return askExecutiveQuestion(input.question, ctx.user.companyId ?? undefined);
    }),

  /**
   * Deep-dive into a specific department.
   */
  departmentDeepDive: execProcedure
    .input(
      z.object({
        department: z.enum(["finance", "operations", "supply_chain", "sales", "workforce"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return departmentDeepDive(input.department, ctx.user.companyId ?? undefined);
    }),
});
