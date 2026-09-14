// appRouter.financeAi — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { detectFinancialAnomalies, forecastRevenue, predictCashFlow, classifyTransactions } from "../financeAiService";
import { financeProcedure } from "./_shared";

// ============================================
// AI-POWERED FINANCE ANALYTICS
// ============================================
export const financeAiRouter = router({
    detectAnomalies: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        lookbackDays: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return detectFinancialAnomalies(input || {});
      }),

    forecastRevenue: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        forecastMonths: z.number().optional(),
        historyMonths: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return forecastRevenue(input || {});
      }),

    predictCashFlow: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        weeksAhead: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return predictCashFlow(input || {});
      }),

    classifyTransactions: financeProcedure
      .input(z.object({
        transactionIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        return classifyTransactions(input);
      }),
  });
