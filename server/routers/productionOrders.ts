// appRouter.productionOrders — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { opsProcedure } from "./_shared";

// Production Orders
export const productionOrdersRouter = router({
    list: protectedProcedure.query(() => [] as any[]),
    createFromText: opsProcedure
      .input(z.object({ text: z.string() }))
      .mutation(async () => {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: "Production Orders are not a separate entity in this system. Use Work Orders (workOrders.createFromText) for production scheduling.",
        });
      }),
  });
