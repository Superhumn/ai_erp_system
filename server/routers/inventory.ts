// appRouter.inventory — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ADJUSTMENT_REASON_CODES } from "@shared/inventoryAdjustments";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { adminProcedure, opsProcedure, resolveRequestScope, assertNonEmptyScope, createAuditLog, notifyIfBelowReorderLevel } from "./_shared";

// ============================================
// OPERATIONS - INVENTORY
// ============================================
export const inventoryRouter = router({
    // opsProcedure keeps the role gate; scope is resolved server-side and applied on top so a
    // user only sees their entities' inventory. companyId is no longer a client input.
    list: opsProcedure
      .input(z.object({
        warehouseId: z.number().optional(),
        productId: z.number().optional(),
        limit: z.number().min(1).max(1000).optional(),
      }).optional())
      .query(async ({ input, ctx }) =>
        db.getInventory(assertNonEmptyScope(await resolveRequestScope(ctx.user)), {
          warehouseId: input?.warehouseId,
          productId: input?.productId,
          limit: input?.limit,
        }),
      ),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        productId: z.number(),
        warehouseId: z.number().optional(),
        quantity: z.string(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createInventory(input);
        await createAuditLog(ctx.user.id, 'create', 'inventory', result.id);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.string().optional(),
        reservedQuantity: z.string().optional(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
        // Recorded on the ledger when `quantity` is set to a new absolute value.
        reasonCode: z.enum(ADJUSTMENT_REASON_CODES).default('other'),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, quantity, reasonCode, reason, ...data } = input;
        const [existing] = await db.getInventoryByIds([id]);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inventory row not found' });

        if (Object.values(data).some((v) => v !== undefined)) {
          await db.updateInventory(id, data);
        }

        // A quantity set posts the implied delta to the ledger rather than
        // overwriting the number, so the movement stays attributable.
        if (quantity !== undefined) {
          if (existing.warehouseId == null) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot adjust quantity on a row with no warehouse' });
          }
          const target = parseFloat(quantity);
          if (!Number.isFinite(target) || target < 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Quantity must be a non-negative number' });
          }

          const current = parseFloat(existing.quantity as string) || 0;
          const delta = target - current;

          if (delta !== 0) {
            const result = await db.adjustInventoryQuantity({
              productId: existing.productId,
              warehouseId: existing.warehouseId,
              quantityDelta: delta,
              transactionType: 'adjust',
              reasonCode,
              reason,
              companyId: existing.companyId ?? undefined,
              performedBy: ctx.user.id,
            });
            await createAuditLog(
              ctx.user.id, 'update', 'inventory', id, result.transactionNumber,
              { quantity: current }, { quantity: result.newQuantity, reasonCode },
            );
            await notifyIfBelowReorderLevel(existing.productId, existing.warehouseId, result.newQuantity);
            return { success: true, transactionNumber: result.transactionNumber };
          }
        }

        await createAuditLog(ctx.user.id, 'update', 'inventory', id);
        return { success: true };
      }),
    // Inventory rows sharing a (product, warehouse) pair. The table has no
    // unique key on that pair, so a race between two stock movements leaves two
    // rows for the same stock and every row count / sum double-counts it.
    duplicates: opsProcedure.query(() => db.getDuplicateInventoryGroups()),
    mergeDuplicates: opsProcedure
      .input(z.object({
        keepId: z.number(),
        removeIds: z.array(z.number()).min(1).max(100),
        strategy: z.enum(['keep_one', 'sum']),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.mergeDuplicateInventoryRows(input.keepId, input.removeIds, input.strategy);
        await createAuditLog(
          ctx.user.id, 'update', 'inventory', input.keepId, undefined,
          { duplicateRowIds: input.removeIds },
          { strategy: input.strategy, quantity: result.quantity, removed: result.removed },
        );
        return result;
      }),
    bulkUpdate: opsProcedure
      .input(z.object({
        ids: z.array(z.number()),
        action: z.enum(['adjust_quantity', 'change_location', 'update_reorder_point']),
        quantityAdjustment: z.number().optional(),
        warehouseId: z.number().optional(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
        // Applied to every adjusted line; recorded on the inventory ledger.
        reasonCode: z.enum(ADJUSTMENT_REASON_CODES).default('other'),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { ids, action, reasonCode, reason, ...data } = input;

        // Quantity changes go through the ledger so each one carries a reason
        // and a transaction row, rather than silently rewriting the number.
        if (action === 'adjust_quantity') {
          if (data.quantityAdjustment === undefined || data.quantityAdjustment === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'A non-zero quantityAdjustment is required' });
          }

          const items = await db.getInventoryByIds(ids);
          const itemById = new Map(items.map((i) => [i.id, i]));
          const results: { id: number; success: boolean; error?: string }[] = [];

          for (const id of ids) {
            const item = itemById.get(id);
            if (!item || item.warehouseId == null) {
              results.push({ id, success: false, error: 'Inventory row not found or has no warehouse' });
              continue;
            }
            try {
              const result = await db.adjustInventoryQuantity({
                productId: item.productId,
                warehouseId: item.warehouseId,
                quantityDelta: data.quantityAdjustment,
                transactionType: 'adjust',
                reasonCode,
                reason,
                companyId: item.companyId ?? undefined,
                performedBy: ctx.user.id,
              });
              await createAuditLog(
                ctx.user.id, 'update', 'inventory', id, result.transactionNumber,
                { quantity: result.previousQuantity }, { quantity: result.newQuantity, reasonCode },
              );
              await notifyIfBelowReorderLevel(item.productId, item.warehouseId, result.newQuantity);
              results.push({ id, success: true });
            } catch (error) {
              results.push({ id, success: false, error: (error as Error).message });
            }
          }

          return {
            success: results.some((r) => r.success),
            results,
            totalUpdated: results.reduce((n, r) => n + (r.success ? 1 : 0), 0),
            totalFailed: results.reduce((n, r) => n + (r.success ? 0 : 1), 0),
          };
        }

        // Non-quantity attribute changes carry no stock movement.
        const updateData: {
          warehouseId?: number;
          reorderLevel?: string;
          reorderQuantity?: string;
        } = {};

        if (action === 'change_location') {
          if (data.warehouseId !== undefined) updateData.warehouseId = data.warehouseId;
        } else {
          if (data.reorderLevel !== undefined) updateData.reorderLevel = data.reorderLevel;
          if (data.reorderQuantity !== undefined) updateData.reorderQuantity = data.reorderQuantity;
        }

        const results = await db.bulkUpdateInventory(ids, updateData);
        for (const result of results.filter((r) => r.success)) {
          await createAuditLog(ctx.user.id, 'update', 'inventory', result.id);
        }

        return {
          success: true,
          results,
          totalUpdated: results.reduce((n, r) => n + (r.success ? 1 : 0), 0),
          totalFailed: results.reduce((n, r) => n + (r.success ? 0 : 1), 0),
        };
      }),

    /**
     * Ledger-backed single-item adjustment. Unlike `update`, this posts an
     * inventoryTransactions row with a structured reason and keeps the
     * aggregate and lot-level balances in step.
     */
    adjust: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        lotId: z.number().optional(),
        quantityDelta: z.number().refine((n) => n !== 0, "Adjustment cannot be zero"),
        reasonCode: z.enum(ADJUSTMENT_REASON_CODES),
        reason: z.string().optional(),
        companyId: z.number().optional(),
        unit: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.adjustInventoryQuantity({
          ...input,
          transactionType: 'adjust',
          performedBy: ctx.user.id,
        });
        await createAuditLog(
          ctx.user.id, 'update', 'inventory', input.productId, result.transactionNumber,
          { quantity: result.previousQuantity }, { quantity: result.newQuantity, reasonCode: input.reasonCode },
        );
        await notifyIfBelowReorderLevel(input.productId, input.warehouseId, result.newQuantity);
        return result;
      }),

    /** Write stock off (damage, expiry, theft, ...). Always a decrease. */
    scrap: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        lotId: z.number().optional(),
        quantity: z.number().gt(0),
        reasonCode: z.enum(ADJUSTMENT_REASON_CODES),
        reason: z.string().optional(),
        companyId: z.number().optional(),
        unit: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.scrapInventory({ ...input, performedBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id, 'update', 'inventory', input.productId, result.transactionNumber,
          { quantity: result.previousQuantity }, { quantity: result.newQuantity, reasonCode: input.reasonCode },
        );
        await notifyIfBelowReorderLevel(input.productId, input.warehouseId, result.newQuantity);
        return result;
      }),

    /** Lots that could be picked now, in the order FEFO would consume them. */
    pickableLots: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        includeExpired: z.boolean().default(false),
      }))
      .query(({ input }) => db.getPickableLots(input.productId, input.warehouseId, {
        includeExpired: input.includeExpired,
      })),

    /** What a FEFO pick would consume, and what it would be short by. */
    planPick: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number().gt(0),
        includeExpired: z.boolean().default(false),
      }))
      .query(({ input }) => db.planFefoPick(input)),

    /**
     * Ship stock, consuming the soonest-expiring lots first.
     *
     * Until now nothing decremented stock on fulfilment — `shipInventory` was
     * defined and never called — so book quantity drifted from physical on
     * every shipment.
     */
    pickFefo: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number().gt(0),
        referenceType: z.string().default('manual'),
        referenceId: z.number(),
        fromStatus: z.enum(['reserved', 'available']).default('available'),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.pickInventoryFEFO({ ...input, performedBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id, 'update', 'inventory', input.productId,
          `Picked ${result.quantity} across ${result.allocations.length} lot(s)`,
        );
        const last = result.shipments[result.shipments.length - 1];
        if (last) {
          await notifyIfBelowReorderLevel(input.productId, input.warehouseId, last.newQuantity);
        }
        return result;
      }),

    /**
     * What to reorder, how much, and why.
     *
     * Replenishment was previously hand-entered reorder levels plus an
     * after-the-fact low-stock notification: nothing consulted demand, vendor
     * lead time, or stock already on order. A hand-entered level still wins
     * where one is set.
     */
    replenishmentPlan: opsProcedure
      .input(z.object({
        windowDays: z.number().min(7).max(730).default(90),
        warehouseId: z.number().optional(),
        safetyDays: z.number().min(0).max(365).optional(),
        coverageDays: z.number().min(1).max(365).optional(),
        onlyActionable: z.boolean().default(false),
      }).optional())
      .query(({ input }) => db.getReplenishmentPlan(input)),

    /** Stock approaching or past its expiry date, bucketed by urgency. */
    expiring: opsProcedure
      .input(z.object({
        withinDays: z.number().min(0).max(3650).default(90),
        warehouseId: z.number().optional(),
        includeUndated: z.boolean().default(false),
      }))
      .query(({ input }) => db.getExpiringInventory(input)),

    /**
     * Move expired stock out of available into quarantine.
     *
     * Admin-only: it takes stock out of circulation across the whole warehouse
     * in one action. It does not write anything off — disposal stays an
     * explicit `scrap`.
     */
    sweepExpired: adminProcedure
      .input(z.object({ warehouseId: z.number().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        const result = await db.sweepExpiredLots({
          warehouseId: input?.warehouseId,
          performedBy: ctx.user.id,
        });
        if (result.count > 0) {
          await createAuditLog(
            ctx.user.id, 'update', 'inventory', 0,
            `Expiry sweep quarantined ${result.count} lot(s)`,
          );
        }
        return result;
      }),

    /** Movement ledger for a product/warehouse — the audit trail for stock. */
    getMovementHistory: opsProcedure
      .input(z.object({
        productId: z.number().optional(),
        warehouseId: z.number().optional(),
        lotId: z.number().optional(),
        type: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      }))
      .query(({ input }) => db.getInventoryTransactionHistory(input, input.limit)),

    // Get pending inventory from POs (on order or in transit)
    getPendingFromPOs: opsProcedure
      .query(() => db.getPendingInventoryFromPOs()),
    // Get inbound shipments from POs
    getInboundShipments: opsProcedure
      .query(() => db.getInboundShipmentsFromPOs()),

    transferFromText: opsProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const parsed = await invokeLLM({
          messages: [
            { role: 'system', content: 'Extract inventory transfer details from the text and return a JSON object with: fromWarehouseId (number or null), toWarehouseId (number or null), notes (string). Return only valid JSON.' },
            { role: 'user', content: input.text },
          ],
        });
        let transferData: any = {};
        try {
          const rawContent = parsed.choices[0]?.message?.content;
          const raw = typeof rawContent === 'string' ? rawContent : '{}';
          transferData = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        } catch { transferData = {}; }
        const result = await db.createTransfer({
          fromWarehouseId: transferData.fromWarehouseId || null,
          toWarehouseId: transferData.toWarehouseId || null,
          notes: transferData.notes || input.text,
          status: 'pending',
          requestedBy: ctx.user.id,
        } as any);
        await createAuditLog(ctx.user.id, 'create', 'inventory_transfer', result.id, result.transferNumber);
        return { transferNumber: result.transferNumber, id: result.id };
      }),
  });
