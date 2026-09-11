// appRouter.dashboard — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { internalProcedure } from "./_shared";

// ============================================
// DASHBOARD & METRICS
// ============================================
export const dashboardRouter = router({
    metrics: internalProcedure.query(() => db.getDashboardMetrics()),
    search: internalProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input }) => db.globalSearch(input.query)),
  });
