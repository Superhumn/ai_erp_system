// appRouter.projectsAi — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { estimateEffort, optimizeResourceAllocation, predictProjectRisks, optimizeSchedule } from "../projectsAiService";

// ============================================
// AI-POWERED PROJECT ANALYTICS
// ============================================
export const projectsAiRouter = router({
    estimateEffort: protectedProcedure
      .input(z.object({
        projectId: z.number(),
      }))
      .mutation(async ({ input }) => {
        return estimateEffort(input);
      }),

    optimizeResourceAllocation: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return optimizeResourceAllocation(input || {});
      }),

    predictRisks: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        projectId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return predictProjectRisks(input || {});
      }),

    optimizeSchedule: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return optimizeSchedule(input || {});
      }),
  });
