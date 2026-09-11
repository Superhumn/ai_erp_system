// appRouter.cycleCounts — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { ADJUSTMENT_REASON_CODES, CYCLE_COUNT_TYPES, CYCLE_COUNT_STATUSES } from "@shared/inventoryAdjustments";
import { router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, opsProcedure, createAuditLog } from "./_shared";

// ============================================
// CYCLE COUNTING / PHYSICAL INVENTORY
// ============================================
export const cycleCountsRouter = router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        warehouseId: z.number().optional(),
        status: z.enum(CYCLE_COUNT_STATUSES).optional(),
        limit: z.number().min(1).max(500).optional(),
      }).optional())
      .query(({ input }) => db.getCycleCounts(input)),

    getById: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const count = await db.getCycleCountById(input.id);
        if (!count) return null;
        const [lines, summary] = await Promise.all([
          db.getCycleCountLines(input.id),
          db.getCycleCountVarianceSummary(input.id),
        ]);
        // Blind counts withhold book quantity until the count is closed.
        const hideSystemQty = count.blindCount && (count.status === 'draft' || count.status === 'in_progress');
        return {
          ...count,
          summary,
          lines: hideSystemQty
            ? lines.map((l) => ({ ...l, systemQuantity: null, variance: null, varianceValue: null }))
            : lines,
        };
      }),

    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        warehouseId: z.number(),
        countType: z.enum(CYCLE_COUNT_TYPES).default('cycle'),
        blindCount: z.boolean().default(true),
        scheduledDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCycleCount({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'cycleCount', result.id, result.countNumber);
        return result;
      }),

    /** Snapshot current book quantities into count lines. */
    generateLines: opsProcedure
      .input(z.object({
        countId: z.number(),
        productIds: z.array(z.number()).optional(),
        includeZeroQuantity: z.boolean().optional(),
      }))
      .mutation(({ input }) => db.generateCycleCountLines(input.countId, {
        productIds: input.productIds,
        includeZeroQuantity: input.includeZeroQuantity,
      })),

    start: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.startCycleCount(input.id);
        await createAuditLog(ctx.user.id, 'update', 'cycleCount', input.id);
        return result;
      }),

    recordLine: opsProcedure
      .input(z.object({
        lineId: z.number(),
        countedQuantity: z.number().min(0),
        reasonCode: z.enum(ADJUSTMENT_REASON_CODES).optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => db.recordCycleCountLine(input.lineId, {
        countedQuantity: input.countedQuantity,
        reasonCode: input.reasonCode,
        notes: input.notes,
        countedBy: ctx.user.id,
      })),

    flagForRecount: opsProcedure
      .input(z.object({ lineId: z.number() }))
      .mutation(({ input }) => db.flagCycleCountLineForRecount(input.lineId)),

    submitForReview: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.submitCycleCountForReview(input.id);
        await createAuditLog(ctx.user.id, 'update', 'cycleCount', input.id);
        return result;
      }),

    /**
     * Approve and post variances to the inventory ledger. Restricted to admin
     * so the person counting cannot also sign off their own variance.
     */
    approve: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.approveCycleCount(input.id, ctx.user.id);
        await createAuditLog(ctx.user.id, 'approve', 'cycleCount', input.id, result.countNumber);
        return result;
      }),

    cancel: opsProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.cancelCycleCount(input.id, input.reason);
        await createAuditLog(ctx.user.id, 'update', 'cycleCount', input.id);
        return result;
      }),

    varianceSummary: opsProcedure
      .input(z.object({ countId: z.number() }))
      .query(({ input }) => db.getCycleCountVarianceSummary(input.countId)),
  });
