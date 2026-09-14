// appRouter.serials — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// OPERATIONS - SERIAL NUMBERS
// ============================================
// Unit-level tracking beneath lots: a lot says which batch a unit came from,
// a serial says where that exact unit is now.
export const serialsRouter = router({
    list: opsProcedure
      .input(z.object({
        productId: z.number().optional(),
        lotId: z.number().optional(),
        warehouseId: z.number().optional(),
        status: z.enum(['in_stock', 'allocated', 'shipped', 'returned', 'scrapped']).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
      }).optional())
      .query(({ input }) => db.getSerialNumbers(input)),

    receive: opsProcedure
      .input(z.object({
        productId: z.number(),
        serialNumbers: z.array(z.string().min(1)).min(1).max(1000),
        lotId: z.number().optional(),
        warehouseId: z.number().optional(),
        binCode: z.string().optional(),
        sourceType: z.string().default('manual'),
        sourceReferenceId: z.number().optional(),
        companyId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.receiveSerialNumbers({ ...input, performedBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id, 'create', 'serial_number', input.productId,
          `Received ${result.received} serial(s)`,
        );
        return result;
      }),

    updateStatus: opsProcedure
      .input(z.object({
        serialId: z.number(),
        toStatus: z.enum(['in_stock', 'allocated', 'shipped', 'returned', 'scrapped']),
        warehouseId: z.number().nullable().optional(),
        binCode: z.string().nullable().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.updateSerialStatus({ ...input, performedBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id, 'update', 'serial_number', input.serialId,
          `${result.fromStatus} -> ${result.toStatus}`,
        );
        return result;
      }),

    /** Where one unit is now and every move it made. */
    trace: opsProcedure
      .input(z.object({
        serialNumber: z.string().min(1),
        productId: z.number().optional(),
      }))
      .query(({ input }) => db.traceSerialNumber(input.serialNumber, input.productId)),

    /** Serials in a lot — the recall direction that starts from a batch. */
    forLot: opsProcedure
      .input(z.object({ lotId: z.number() }))
      .query(({ input }) => db.getSerialsForLot(input.lotId)),
  });
