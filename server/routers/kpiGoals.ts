// appRouter.kpiGoals — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure, createAuditLog } from "./_shared";

// ============================================
// KPI GOALS
// ============================================
export const kpiGoalsRouter = router({
    list: financeProcedure
      .input(z.object({
        year: z.number().optional(),
        category: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { kpiGoals: kg } = await import("../../drizzle/schema");
        let query = database.select().from(kg);
        const conditions: any[] = [];
        if (input?.year) conditions.push(eq(kg.year, input.year));
        if (input?.category) conditions.push(eq(kg.category, input.category));
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
        return query;
      }),

    updateActual: financeProcedure
      .input(z.object({
        id: z.number(),
        actualValue: z.string(),
        status: z.enum(["on_track", "at_risk", "behind", "exceeded", "not_started"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { kpiGoals: kg } = await import("../../drizzle/schema");
        await database.update(kg)
          .set({
            actualValue: input.actualValue,
            ...(input.status ? { status: input.status } : {}),
            ...(input.notes ? { notes: input.notes } : {}),
          })
          .where(eq(kg.id, input.id));
        await createAuditLog(ctx.user.id, 'update', 'kpi_goal', input.id, undefined, undefined, { actualValue: input.actualValue });
        return { success: true };
      }),

    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        category: z.string(),
        metricName: z.string(),
        year: z.number(),
        month: z.number().optional(),
        targetValue: z.string(),
        actualValue: z.string().optional(),
        unit: z.string().optional(),
        status: z.enum(["on_track", "at_risk", "behind", "exceeded", "not_started"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { kpiGoals: kg } = await import("../../drizzle/schema");
        const result = await database.insert(kg).values(input as any);
        const id = (result as any)[0]?.insertId ?? 0;
        await createAuditLog(ctx.user.id, 'create', 'kpi_goal', id);
        return { id, success: true };
      }),

    categories: financeProcedure
      .query(async () => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { kpiGoals: kg } = await import("../../drizzle/schema");
        const rows = await database.selectDistinct({ category: kg.category }).from(kg);
        return rows.map(r => r.category).filter(Boolean);
      }),
  });
