// appRouter.recommendations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// Recommendations
export const recommendationsRouter = router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
        type: z.enum(['reorder', 'production', 'pricing', 'allocation', 'other']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecommendations(input);
      }),
    approve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.approveRecommendation(input.id, ctx.user!.id);
        return { success: true };
      }),
    reject: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.rejectRecommendation(input.id, ctx.user!.id, input.reason);
        return { success: true };
      }),
  });
