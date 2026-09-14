// appRouter.rawMaterialInventory — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// Raw Material Inventory
export const rawMaterialInventoryRouter = router({
    list: protectedProcedure
      .input(z.object({
        rawMaterialId: z.number().optional(),
        warehouseId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRawMaterialInventory(input);
      }),
    getTransactions: protectedProcedure
      .input(z.object({ rawMaterialId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getRawMaterialTransactions(input.rawMaterialId, input.limit);
      }),
    adjust: protectedProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        unit: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getRawMaterialInventoryByLocation(input.rawMaterialId, input.warehouseId);
        const currentQty = parseFloat(current?.quantity?.toString() || '0');
        const newQty = currentQty + input.quantity;
        
        await db.upsertRawMaterialInventory(input.rawMaterialId, input.warehouseId, {
          quantity: newQty.toFixed(4),
          availableQuantity: newQty.toFixed(4),
          unit: input.unit,
        });
        
        await db.createRawMaterialTransaction({
          rawMaterialId: input.rawMaterialId,
          warehouseId: input.warehouseId,
          transactionType: 'adjust',
          quantity: input.quantity.toFixed(4),
          previousQuantity: currentQty.toFixed(4),
          newQuantity: newQty.toFixed(4),
          unit: input.unit,
          notes: input.notes,
          performedBy: ctx.user?.id,
        });
        
        return { success: true };
      }),
  });
