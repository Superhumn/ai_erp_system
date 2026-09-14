// appRouter.orderItems — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// SALES - ORDER ITEMS
// ============================================
export const orderItemsRouter = router({
    list: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(({ input }) => db.getOrderItems(input.orderId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(() => null as any),
  });
