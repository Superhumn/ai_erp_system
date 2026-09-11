// appRouter.inventoryCosting — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { addCostLayer, recordCogs, getInventoryValuation, generateCogsPeriodSummary } from "../inventoryCostingService";
import * as db from "../db";
import { definedFields } from "../_core/definedFields";
import { financeProcedure, opsProcedure, createAuditLog } from "./_shared";

export const inventoryCostingRouter = router({
    // Costing config per product
    configs: router({
      list: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getInventoryCostingConfigs(input)),
      getByProduct: opsProcedure
        .input(z.object({ productId: z.number() }))
        .query(({ input }) => db.getInventoryCostingConfigByProduct(input.productId)),
      create: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number(),
          costingMethod: z.enum(["fifo", "lifo", "weighted_average"]),
          isActive: z.boolean().optional(),
          effectiveDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createInventoryCostingConfig({
            ...input,
            createdBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'inventoryCostingConfig', result.id);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          costingMethod: z.enum(["fifo", "lifo", "weighted_average"]).optional(),
          isActive: z.boolean().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const patch = definedFields(data);
          if (!patch) return { success: true };
          await db.updateInventoryCostingConfig(id, patch);
          await createAuditLog(ctx.user.id, 'update', 'inventoryCostingConfig', id);
          return { success: true };
        }),
    }),

    // Cost layers
    layers: router({
      list: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          warehouseId: z.number().optional(),
          status: z.string().optional(),
        }).optional())
        .query(({ input }) => db.getInventoryCostLayers(input)),
      create: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number(),
          warehouseId: z.number().optional(),
          purchaseOrderId: z.number().optional(),
          lotId: z.number().optional(),
          quantity: z.number().gt(0),
          unitCost: z.number().min(0),
          referenceType: z.string().optional(),
          referenceId: z.number().optional(),
          layerDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await addCostLayer({ ...input, createdBy: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'inventoryCostLayer', result.id);
          return result;
        }),
      getWeightedAverage: opsProcedure
        .input(z.object({ productId: z.number() }))
        .query(({ input }) => db.getWeightedAverageCost(input.productId)),
    }),

    // Valuation
    valuation: opsProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getInventoryValuation(input.productId)),

    // COGS
    cogs: router({
      list: financeProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          orderId: z.number().optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        }).optional())
        .query(({ input }) => db.getCogsRecords(input)),
      record: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number(),
          warehouseId: z.number().optional(),
          orderId: z.number().optional(),
          salesOrderLineId: z.number().optional(),
          quantitySold: z.number().gt(0),
          unitRevenue: z.number().min(0).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await recordCogs({ ...input, calculatedBy: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'cogsRecord', result.cogsRecordId);
          return result;
        }),
      summary: financeProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          periodType: z.string().optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        }).optional())
        .query(({ input }) => db.getCogsSummary(input)),
      generateSummary: financeProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          periodType: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
          periodStart: z.date(),
          periodEnd: z.date(),
        }))
        .mutation(({ input }) => generateCogsPeriodSummary(input)),
      dashboard: financeProcedure
        .input(z.object({ companyId: z.number().optional() }).optional())
        .query(({ input }) => db.getCogsDashboardStats(input?.companyId)),
    }),
  });
