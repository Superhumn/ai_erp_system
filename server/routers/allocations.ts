// appRouter.allocations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { definedFields } from "../_core/definedFields";

// ============================================
// INVENTORY ALLOCATIONS
// ============================================
export const allocationsRouter = router({
    list: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'wholesale', 'retail']).optional(),
        productId: z.number().optional(),
        storeId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryAllocations(input);
      }),
    create: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'wholesale', 'retail']),
        productId: z.number(),
        warehouseId: z.number(),
        storeId: z.number().optional(),
        allocatedQuantity: z.string(),
        reservedQuantity: z.string().default('0'),
      }))
      .mutation(async ({ input }) => {
        return db.createInventoryAllocation({
          ...input,
          remainingQuantity: input.allocatedQuantity,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        allocatedQuantity: z.string().optional(),
        reservedQuantity: z.string().optional(),
        remainingQuantity: z.string().optional(),
        channelReportedQuantity: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const patch = definedFields(data);
        if (!patch) return { success: true };
        await db.updateInventoryAllocation(id, patch);
        return { success: true };
      }),
  });
