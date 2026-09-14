// appRouter.bills — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { opsProcedure } from "./_shared";

// ============================================
// FINANCE - BILLS
// ============================================
export const billsRouter = router({
    list: protectedProcedure.query(() => [] as any[]),
    createFromText: opsProcedure
      .input(z.object({ text: z.string() }))
      .mutation(async () => {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: "Vendor bill ingestion is not yet supported. Use Purchase Orders for vendor liabilities, or import bills via QuickBooks sync.",
        });
      }),
  });
