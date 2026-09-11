// appRouter.alerts — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// ALERT SYSTEM
// ============================================
export const alertsRouter = router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(['low_stock', 'shortage', 'late_shipment', 'yield_variance', 'reconciliation_variance', 'expiring_lot', 'other']).optional(),
        status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAlerts(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAlertById(input.id);
      }),
    acknowledge: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.acknowledgeAlert(input.id, ctx.user!.id);
        return { success: true };
      }),
    resolve: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.resolveAlert(input.id, ctx.user!.id, input.notes);
        return { success: true };
      }),
    dismiss: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateAlert(input.id, { status: 'dismissed' });
        return { success: true };
      }),
    generateLowStockAlerts: protectedProcedure
      .mutation(async () => {
        const alertIds = await db.generateLowStockAlerts();
        return { created: alertIds.length, alertIds };
      }),
    create: protectedProcedure
      .input(z.object({
        type: z.enum(['low_stock', 'shortage', 'late_shipment', 'yield_variance', 'reconciliation_variance', 'expiring_lot', 'quality_issue', 'po_overdue']),
        severity: z.enum(['info', 'warning', 'critical']),
        title: z.string(),
        description: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createAlert(input);
      }),
  });
