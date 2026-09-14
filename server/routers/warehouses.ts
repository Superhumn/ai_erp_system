// appRouter.warehouses — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// OPERATIONS - WAREHOUSES
// ============================================
export const warehousesRouter = router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getWarehouses(input)),
    getById: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getWarehouseById(input.id)),
    create: opsProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['warehouse', 'store', 'distribution', 'copacker', '3pl', 'factory']).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWarehouse(input);
        await createAuditLog(ctx.user.id, 'create', 'warehouse', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['warehouse', 'store', 'distribution', 'copacker', '3pl', 'factory']).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateWarehouse(id, data);
        await createAuditLog(ctx.user.id, 'update', 'warehouse', id, `Updated warehouse ${id}`);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteWarehouse(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'warehouse', input.id, `Deleted warehouse ${input.id}`);
        return { success: true };
      }),
    summary: opsProcedure.query(() => db.getLocationInventorySummary()),
  });
