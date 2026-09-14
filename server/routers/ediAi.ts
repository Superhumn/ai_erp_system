// appRouter.ediAi — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { protectedProcedure, router } from "../_core/trpc";
import { detectEdiAnomalies, predictEdiErrors } from "../ediAiService";

// ============================================
// AI-POWERED EDI ANALYTICS
// ============================================
export const ediAiRouter = router({
    detectAnomalies: protectedProcedure
      .mutation(async () => {
        return detectEdiAnomalies();
      }),

    predictErrors: protectedProcedure
      .mutation(async () => {
        return predictEdiErrors();
      }),
  });
