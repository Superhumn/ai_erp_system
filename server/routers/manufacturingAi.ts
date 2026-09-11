// appRouter.manufacturingAi — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { predictYield, forecastQuality, optimizeProduction, predictMaintenance } from "../manufacturingAiService";
import { opsProcedure } from "./_shared";

// ============================================
// AI-POWERED MANUFACTURING ANALYTICS
// ============================================
export const manufacturingAiRouter = router({
    predictYield: opsProcedure
      .input(z.object({
        workOrderIds: z.array(z.number()).optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return predictYield(input || {});
      }),

    forecastQuality: opsProcedure
      .input(z.object({
        productIds: z.array(z.number()).optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return forecastQuality(input || {});
      }),

    optimizeProduction: opsProcedure
      .mutation(async () => {
        return optimizeProduction();
      }),

    predictMaintenance: opsProcedure
      .mutation(async () => {
        return predictMaintenance();
      }),
  });
