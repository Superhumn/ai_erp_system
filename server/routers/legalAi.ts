// appRouter.legalAi — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { analyzeContract, extractClauses, predictDisputes, checkCompliance } from "../legalAiService";
import { legalProcedure } from "./_shared";

// ============================================
// AI-POWERED LEGAL ANALYTICS
// ============================================
export const legalAiRouter = router({
    analyzeContract: legalProcedure
      .input(z.object({
        contractId: z.number(),
      }))
      .mutation(async ({ input }) => {
        return analyzeContract(input);
      }),

    extractClauses: legalProcedure
      .input(z.object({
        contractId: z.number(),
        text: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return extractClauses(input);
      }),

    predictDisputes: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return predictDisputes(input || {});
      }),

    checkCompliance: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return checkCompliance(input || {});
      }),
  });
