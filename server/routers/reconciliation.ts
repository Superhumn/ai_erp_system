// appRouter.reconciliation — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// INVENTORY RECONCILIATION
// ============================================
export const reconciliationRouter = router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        channel: z.enum(['shopify', 'amazon', 'all']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getReconciliationRuns(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const run = await db.getReconciliationRunById(input.id);
        if (!run) return null;
        const lines = await db.getReconciliationLines(input.id);
        return { ...run, lines };
      }),
    run: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'all']),
        storeId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.runInventoryReconciliation(input.channel, input.storeId, ctx.user?.id);
      }),
  });
