// appRouter.cogs — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// COGS & PROFITABILITY TRACKING
// ============================================
export const cogsRouter = router({
    // Record COGS when a sale is fulfilled
    recordSale: opsProcedure
      .input(z.object({
        salesOrderId: z.number(),
        salesOrderLineId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantitySold: z.number(),
        revenueAmount: z.number(),
        freightCostAllocated: z.number().optional(),
        customsCostAllocated: z.number().optional(),
        insuranceCostAllocated: z.number().optional(),
        otherCostAllocated: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await (db as any).recordCOGSSale(
          input.salesOrderId,
          input.salesOrderLineId,
          input.productId,
          input.warehouseId,
          input.quantitySold,
          input.revenueAmount,
          input.freightCostAllocated,
          input.customsCostAllocated,
          input.insuranceCostAllocated,
          input.otherCostAllocated
        );
        await createAuditLog(ctx.user.id, 'create', 'cogs_transaction', input.salesOrderLineId, `Recorded COGS for sale`);
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
      .query(({ input }) => (db as any).getCOGSTransactions(input, input?.limit)),

    // Get product profitability report
    profitability: opsProcedure
      .input(z.object({
        productId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional())
      .query(({ input }) => (db as any).getProductProfitability(input?.productId, input?.startDate, input?.endDate)),

    // Get inventory valuation
    valuation: opsProcedure
      .input(z.object({
        warehouseId: z.number().optional(),
      }).optional())
      .query(({ input }) => (db as any).getInventoryValuation(input?.warehouseId)),

    // Allocate freight costs to products
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
        await (db as any).allocateFreightCosts(
          input.purchaseOrderId || null,
          input.shipmentId || null,
          input.totalFreightCost,
          input.totalCustomsDuties,
          input.totalInsuranceCost,
          input.totalHandlingFees,
          input.allocationMethod || 'quantity',
          ctx.user.id
        );
        await createAuditLog(ctx.user.id, 'create', 'freight_allocation', input.purchaseOrderId || input.shipmentId || 0, 'Allocated freight costs');

        // Auto-update cost layers with freight allocation (landed cost adjustment)
        try {
          if (input.purchaseOrderId) {
            const totalLandedCost = input.totalFreightCost
              + (input.totalCustomsDuties || 0)
              + (input.totalInsuranceCost || 0)
              + (input.totalHandlingFees || 0);

            if (totalLandedCost > 0) {
              const poItems = await db.getPurchaseOrderItems(input.purchaseOrderId);
              const itemsWithProduct = poItems.filter((poi: any) => poi.productId);
              const totalQty = itemsWithProduct.reduce(
                (sum: number, poi: any) => sum + parseFloat(poi.quantity?.toString() || '0'), 0
              );

              if (totalQty > 0) {
                const { addCostLayer } = await import("../inventoryCostingService");
                for (const poi of itemsWithProduct) {
                  const qty = parseFloat(poi.quantity?.toString() || '0');
                  if (qty > 0 && poi.productId) {
                    const freightPerUnit = (totalLandedCost * (qty / totalQty)) / qty;
                    await addCostLayer({
                      productId: poi.productId,
                      quantity: qty,
                      unitCost: freightPerUnit,
                      purchaseOrderId: input.purchaseOrderId,
                      referenceType: "freight_allocation",
                      referenceId: input.purchaseOrderId,
                      notes: `Freight/landed cost allocation: $${totalLandedCost.toFixed(2)} total`,
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[COGS] Failed to allocate freight to cost layers:", e);
        }

        return { success: true };
      }),

    // Update inventory cost basis (when receiving goods)
    updateCostBasis: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        receivedQuantity: z.number(),
        unitCost: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        await (db as any).updateInventoryCostBasis(
          input.productId,
          input.warehouseId,
          input.receivedQuantity,
          input.unitCost
        );
        await createAuditLog(ctx.user.id, 'update', 'inventory', input.productId, 'Updated inventory cost basis');
        return { success: true };
      }),
  });
