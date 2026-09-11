// appRouter.hrAi — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { predictAttrition, benchmarkCompensation, analyzePerformance, planWorkforce } from "../hrAiService";

// ============================================
// AI-POWERED HR ANALYTICS
// ============================================
export const hrAiRouter = router({
    predictAttrition: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        departmentId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return predictAttrition(input || {});
      }),

    benchmarkCompensation: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        departmentId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return benchmarkCompensation(input || {});
      }),

    analyzePerformance: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        departmentId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return analyzePerformance(input || {});
      }),

    planWorkforce: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        planningHorizonMonths: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return planWorkforce(input || {});
      }),
  });
