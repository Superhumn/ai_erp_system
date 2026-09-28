// appRouter.legalCases — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { legalCases } from "../../drizzle/schema";
import { legalProcedure, resolveRequestScope, assertNonEmptyScope } from "./_shared";

// ============================================
// LEGAL CASES
// ============================================
const caseTypeEnum = z.enum(['trademark','litigation','compliance','contract_dispute','ip','regulatory','employment','other']);
const caseStatusEnum = z.enum(['open','pending','in_review','resolved','closed','dismissed']);
const casePriorityEnum = z.enum(['low','medium','high','critical']);

/** The client sends `<input type="date">` values (YYYY-MM-DD); the columns are timestamps. */
function toDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid date: ${value}` });
  return d;
}

export const legalCasesRouter = router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        type: z.string().optional(),
        priority: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) return [];
        const scope = assertNonEmptyScope(await resolveRequestScope(ctx.user));
        const conditions = [];
        if (scope.companyIds !== 'all') conditions.push(inArray(legalCases.companyId, scope.companyIds));
        if (input?.status) conditions.push(eq(legalCases.status, input.status as typeof legalCases.status.enumValues[number]));
        if (input?.type) conditions.push(eq(legalCases.type, input.type as typeof legalCases.type.enumValues[number]));
        if (input?.priority) conditions.push(eq(legalCases.priority, input.priority as typeof legalCases.priority.enumValues[number]));
        return database
          .select()
          .from(legalCases)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(legalCases.createdAt));
      }),
    create: legalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        caseNumber: z.string().optional(),
        title: z.string().min(1),
        type: caseTypeEnum.default('other'),
        status: caseStatusEnum.default('open'),
        priority: casePriorityEnum.default('medium'),
        opposingParty: z.string().optional(),
        attorney: z.string().optional(),
        lawFirm: z.string().optional(),
        filedDate: z.string().optional(),
        nextHearingDate: z.string().optional(),
        jurisdiction: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { filedDate, nextHearingDate, companyId, ...rest } = input;
        const [result] = await database.insert(legalCases).values({
          ...rest,
          companyId: companyId ?? ctx.user.companyId ?? undefined,
          filedDate: toDate(filedDate),
          nextHearingDate: toDate(nextHearingDate),
          createdBy: ctx.user.id,
        });
        return { id: result.insertId, success: true };
      }),
    update: legalProcedure
      .input(z.object({
        id: z.number(),
        caseNumber: z.string().optional(),
        title: z.string().optional(),
        type: caseTypeEnum.optional(),
        status: caseStatusEnum.optional(),
        priority: casePriorityEnum.optional(),
        opposingParty: z.string().optional(),
        attorney: z.string().optional(),
        lawFirm: z.string().optional(),
        filedDate: z.string().optional(),
        nextHearingDate: z.string().optional(),
        jurisdiction: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { id, filedDate, nextHearingDate, ...rest } = input;
        const fields = {
          ...rest,
          filedDate: toDate(filedDate),
          nextHearingDate: toDate(nextHearingDate),
        };
        const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        if (Object.keys(set).length === 0) return { success: true };
        await database.update(legalCases).set(set).where(eq(legalCases.id, id));
        return { success: true };
      }),
  });
