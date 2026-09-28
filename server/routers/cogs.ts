// appRouter.cogs — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// COGS & PROFITABILITY TRACKING
// ============================================
export const cogsRouter = router({
    // Record COGS when a sale is fulfilled. Consumes cost layers with the
    // system costing method and writes a cogsRecords row.
    recordSale: opsProcedure
      .input(z.object({
        salesOrderId: z.number(),
        salesOrderLineId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantitySold: z.number().positive(),
        revenueAmount: z.number(),
        freightCostAllocated: z.number().optional(),
        customsCostAllocated: z.number().optional(),
        insuranceCostAllocated: z.number().optional(),
        otherCostAllocated: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { recordCogs } = await import("../inventoryCostingService");
        const result = await recordCogs({
          companyId: ctx.user.companyId ?? undefined,
          productId: input.productId,
          warehouseId: input.warehouseId,
          orderId: input.salesOrderId,
          salesOrderLineId: input.salesOrderLineId,
          quantitySold: input.quantitySold,
          unitRevenue: input.revenueAmount / input.quantitySold,
          calculatedBy: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, 'create', 'cogs_transaction', result.cogsRecordId, `Recorded COGS for sale`);
        return result;
      }),

    // Get COGS transaction history
    getTransactions: opsProcedure
      .input(z.object({
        salesOrderId: z.number().optional(),
        productId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(1000).optional(),
      }).optional())
      .query(async ({ input }) => {
        const records = await db.getCogsRecords({
          productId: input?.productId,
          orderId: input?.salesOrderId,
          startDate: input?.startDate,
          endDate: input?.endDate,
        });
        return records.slice(0, input?.limit ?? 100).map((r) => ({
          ...r,
          date: r.periodDate,
          salesOrderId: r.orderId,
          quantity: r.quantitySold,
          unitCost: r.unitCogs,
          totalCost: r.totalCogs,
        }));
      }),

    // Get product profitability report (per product, optional date range)
    profitability: opsProcedure
      .input(z.object({
        productId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional())
      .query(({ input }) => db.getCogsProfitabilityByProduct({
        productId: input?.productId,
        startDate: input?.startDate,
        endDate: input?.endDate,
      })),

    // Get inventory valuation from active cost layers
    valuation: opsProcedure
      .input(z.object({
        warehouseId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInventoryValuation({ warehouseId: input?.warehouseId })),

    // Allocate freight / duties / insurance / handling to products on a PO.
    // Raises the unit cost of the PO products' existing cost layers instead
    // of inserting new layers, so on-hand quantity is unchanged.
    allocateFreight: opsProcedure
      .input(z.object({
        purchaseOrderId: z.number().optional(),
        shipmentId: z.number().optional(),
        totalFreightCost: z.number(),
        totalCustomsDuties: z.number().optional(),
        totalInsuranceCost: z.number().optional(),
        totalHandlingFees: z.number().optional(),
        allocationMethod: z.enum(['weight', 'volume', 'quantity', 'value', 'manual']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const totalLandedCost = input.totalFreightCost
          + (input.totalCustomsDuties || 0)
          + (input.totalInsuranceCost || 0)
          + (input.totalHandlingFees || 0);

        let layersAdjusted = 0;
        let productsAllocated = 0;
        if (input.purchaseOrderId && totalLandedCost > 0) {
          const poItems = await db.getPurchaseOrderItems(input.purchaseOrderId);
          const itemsWithProduct = poItems.filter((poi: any) => poi.productId);
          const totalQty = itemsWithProduct.reduce(
            (sum: number, poi: any) => sum + parseFloat(poi.quantity?.toString() || '0'), 0
          );
          if (totalQty > 0) {
            const { allocateOverheadToLayers } = await import("../inventoryCostingService");
            for (const poi of itemsWithProduct) {
              const qty = parseFloat(poi.quantity?.toString() || '0');
              if (qty <= 0 || !poi.productId) continue;
              const share = totalLandedCost * (qty / totalQty);
              const touched = await allocateOverheadToLayers({ productId: poi.productId, totalAmount: share });
              if (touched > 0) productsAllocated += 1;
              layersAdjusted += touched;
            }
          }
        }

        await createAuditLog(
          ctx.user.id,
          'create',
          'freight_allocation',
          input.purchaseOrderId || input.shipmentId || 0,
          `Allocated $${totalLandedCost.toFixed(2)} landed cost across ${productsAllocated} product(s), ${layersAdjusted} cost layer(s)`
        );
        return { success: true, totalLandedCost, productsAllocated, layersAdjusted };
      }),

    // Record received goods as a new cost layer at the given unit cost
    updateCostBasis: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        receivedQuantity: z.number().positive(),
        unitCost: z.number().nonnegative(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { addCostLayer } = await import("../inventoryCostingService");
        const layer = await addCostLayer({
          companyId: ctx.user.companyId ?? undefined,
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.receivedQuantity,
          unitCost: input.unitCost,
          referenceType: 'manual_cost_basis',
          createdBy: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, 'update', 'inventory', input.productId, 'Updated inventory cost basis');
        return { success: true, layerId: layer.id };
      }),
  });
