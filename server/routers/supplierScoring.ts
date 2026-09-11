// appRouter.supplierScoring — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { scoreSuppliers } from "../supplierScoringService";

// ============================================
// AI-POWERED SUPPLIER SCORING
// ============================================
export const supplierScoringRouter = router({
    scoreSuppliers: protectedProcedure
      .input(z.object({
        vendorIds: z.array(z.number()).optional(),
        companyId: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        return scoreSuppliers(input || {});
      }),
  });
