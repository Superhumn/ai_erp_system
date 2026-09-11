// appRouter.financialModel — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure, createAuditLog } from "./_shared";

// ============================================
// FINANCIAL MODEL
// ============================================
export const financialModelRouter = router({
    list: financeProcedure
      .input(z.object({
        sheetName: z.string().optional(),
        category: z.string().optional(),
        year: z.number().optional(),
        metricName: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { financialModel: fm } = await import("../../drizzle/schema");
        let query = database.select().from(fm);
        const conditions: any[] = [];
        if (input?.sheetName) conditions.push(eq(fm.sheetName, input.sheetName));
        if (input?.category) conditions.push(eq(fm.category, input.category));
        if (input?.year) conditions.push(eq(fm.year, input.year));
        if (input?.metricName) conditions.push(eq(fm.metricName, input.metricName));
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
        return query;
      }),

    getComparison: financeProcedure
      .input(z.object({
        metricName: z.string(),
        sheetName: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { financialModel: fm } = await import("../../drizzle/schema");
        const conditions = [eq(fm.metricName, input.metricName)];
        if (input.sheetName) conditions.push(eq(fm.sheetName, input.sheetName));
        const rows = await database.select().from(fm).where(and(...conditions));
        return rows.map(r => ({
          id: r.id,
          sheetName: r.sheetName,
          category: r.category,
          metricName: r.metricName,
          year: r.year,
          month: r.month,
          projectedValue: r.projectedValue,
          actualValue: r.actualValue,
          variance: r.projectedValue && r.actualValue
            ? (parseFloat(r.actualValue) - parseFloat(r.projectedValue)).toFixed(2)
            : null,
          variancePct: r.projectedValue && r.actualValue && parseFloat(r.projectedValue) !== 0
            ? (((parseFloat(r.actualValue) - parseFloat(r.projectedValue)) / parseFloat(r.projectedValue)) * 100).toFixed(2)
            : null,
          unit: r.unit,
        }));
      }),

    updateActual: financeProcedure
      .input(z.object({
        id: z.number(),
        actualValue: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { financialModel: fm } = await import("../../drizzle/schema");
        await database.update(fm)
          .set({
            actualValue: input.actualValue,
            ...(input.notes ? { notes: input.notes } : {}),
          })
          .where(eq(fm.id, input.id));
        await createAuditLog(ctx.user.id, 'update', 'financialModel', input.id, undefined, undefined, { actualValue: input.actualValue });
        return { success: true };
      }),

    sheets: financeProcedure
      .query(async () => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { financialModel: fm } = await import("../../drizzle/schema");
        const rows = await database.selectDistinct({ sheetName: fm.sheetName }).from(fm);
        return rows.map(r => r.sheetName);
      }),

    categories: financeProcedure
      .input(z.object({ sheetName: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { financialModel: fm } = await import("../../drizzle/schema");
        let query = database.selectDistinct({ category: fm.category }).from(fm);
        if (input?.sheetName) {
          query = query.where(eq(fm.sheetName, input.sheetName)) as any;
        }
        return (await query).map(r => r.category).filter(Boolean);
      }),
  });
