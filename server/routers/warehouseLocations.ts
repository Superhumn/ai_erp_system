// appRouter.warehouseLocations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// OPERATIONS - ZONES & BINS
// ============================================
// `inventoryBalances.zoneId` / `binId` were free text with nothing behind
// them. These give the codes a master table, a walk order, and a capacity.
export const warehouseLocationsRouter = router({
    zones: opsProcedure
      .input(z.object({ warehouseId: z.number().optional() }).optional())
      .query(({ input }) => db.getWarehouseZones(input?.warehouseId)),

    createZone: opsProcedure
      .input(z.object({
        warehouseId: z.number(),
        code: z.string().min(1).max(64),
        name: z.string().min(1).max(255),
        zoneType: z.enum(['picking', 'bulk', 'receiving', 'staging', 'quarantine', 'returns']).default('picking'),
        pickSequence: z.number().int().min(0).default(0),
        companyId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWarehouseZone(input);
        await createAuditLog(ctx.user.id, 'create', 'warehouse_zone', result.id, input.code);
        return result;
      }),

    updateZone: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        zoneType: z.enum(['picking', 'bulk', 'receiving', 'staging', 'quarantine', 'returns']).optional(),
        pickSequence: z.number().int().min(0).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await db.updateWarehouseZone(id, data);
        await createAuditLog(ctx.user.id, 'update', 'warehouse_zone', id);
        return result;
      }),

    bins: opsProcedure
      .input(z.object({
        warehouseId: z.number().optional(),
        zoneId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getWarehouseBins(input)),

    createBin: opsProcedure
      .input(z.object({
        warehouseId: z.number(),
        zoneId: z.number().optional(),
        code: z.string().min(1).max(64),
        name: z.string().max(255).optional(),
        pickSequence: z.number().int().min(0).default(0),
        capacity: z.number().positive().optional(),
        companyId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWarehouseBin({
          ...input,
          capacity: input.capacity != null ? input.capacity.toString() : undefined,
        });
        await createAuditLog(ctx.user.id, 'create', 'warehouse_bin', result.id, input.code);
        return result;
      }),

    updateBin: opsProcedure
      .input(z.object({
        id: z.number(),
        zoneId: z.number().optional(),
        name: z.string().max(255).optional(),
        pickSequence: z.number().int().min(0).optional(),
        capacity: z.number().positive().optional(),
        status: z.enum(['active', 'inactive', 'blocked']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, capacity, ...rest } = input;
        const result = await db.updateWarehouseBin(id, {
          ...rest,
          ...(capacity != null ? { capacity: capacity.toString() } : {}),
        });
        await createAuditLog(ctx.user.id, 'update', 'warehouse_bin', id);
        return result;
      }),

    /** What is sitting in each bin, in walk order. */
    contents: opsProcedure
      .input(z.object({
        warehouseId: z.number(),
        binCode: z.string().optional(),
      }))
      .query(({ input }) => db.getBinContents(input)),

    /**
     * Move stock between bins. Nothing leaves the warehouse, so the aggregate
     * does not change — only where the units sit.
     */
    moveBetweenBins: opsProcedure
      .input(z.object({
        lotId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number().gt(0),
        fromBinCode: z.string().nullable(),
        toBinCode: z.string().min(1),
        status: z.enum(['available', 'hold', 'reserved', 'quarantine', 'damaged']).default('available'),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.moveBetweenBins({ ...input, performedBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id, 'update', 'inventory', input.productId,
          `Moved ${result.moved} from ${result.from ?? 'unbinned'} to ${result.to}`,
        );
        return result;
      }),
  });
