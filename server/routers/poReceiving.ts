// appRouter.poReceiving — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

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
    // Books goods into raw-material inventory and advances the PO. Ops-gated
    // like every other PO mutation, guarded against draft/cancelled POs like
    // purchaseOrders.receiveItems, and audited so a receipt is traceable.
    receive: opsProcedure
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
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        if (po.status === 'cancelled') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This PO has been cancelled and cannot receive items.' });
        }
        if (po.status === 'draft') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Send this draft PO to the supplier before receiving items.' });
        }
        const result = await db.receivePurchaseOrderItems(
          input.purchaseOrderId,
          input.warehouseId,
          input.items,
          ctx.user.id,
          input.shipmentId
        );
        const after = await db.getPurchaseOrderById(input.purchaseOrderId);
        await createAuditLog(
          ctx.user.id, 'update', 'purchaseOrder', po.id, po.poNumber,
          { status: po.status },
          {
            status: after?.status ?? po.status,
            receivingRecordId: result.id,
            warehouseId: input.warehouseId,
            items: input.items.map((i) => ({ purchaseOrderItemId: i.purchaseOrderItemId, quantity: i.quantity })),
          },
        );
        return result;
      }),
  });
