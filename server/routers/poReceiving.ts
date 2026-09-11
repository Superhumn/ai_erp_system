// appRouter.poReceiving — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// PO Receiving
export const poReceivingRouter = router({
    getRecords: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ input }) => {
        return db.getPoReceivingRecords(input.purchaseOrderId);
      }),
    getItems: protectedProcedure
      .input(z.object({ receivingRecordId: z.number() }))
      .query(async ({ input }) => {
        return db.getPoReceivingItems(input.receivingRecordId);
      }),
    receive: protectedProcedure
      .input(z.object({
        purchaseOrderId: z.number(),
        warehouseId: z.number(),
        shipmentId: z.number().optional(),
        items: z.array(z.object({
          purchaseOrderItemId: z.number(),
          rawMaterialId: z.number().optional(),
          productId: z.number().optional(),
          quantity: z.number(),
          unit: z.string(),
          lotNumber: z.string().optional(),
          expirationDate: z.date().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.receivePurchaseOrderItems(
          input.purchaseOrderId,
          input.warehouseId,
          input.items,
          ctx.user?.id,
          input.shipmentId
        );
        return result;
      }),
  });
