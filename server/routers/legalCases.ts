// appRouter.legalCases — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { legalProcedure } from "./_shared";

// ============================================
// LEGAL CASES
// ============================================
export const legalCasesRouter = router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        type: z.string().optional(),
        priority: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) return [];
        const conditions: string[] = [];
        const params: any[] = [];
        if (input?.status) { conditions.push('status = ?'); params.push(input.status); }
        if (input?.type) { conditions.push('type = ?'); params.push(input.type); }
        if (input?.priority) { conditions.push('priority = ?'); params.push(input.priority); }
        const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
        const conn = (database as any)._.session?.client;
        if (!conn) return [];
        const [rows] = await conn.query('SELECT * FROM legal_cases' + where + ' ORDER BY createdAt DESC', params);
        return rows as any[];
      }),
    create: legalProcedure
      .input(z.object({
        caseNumber: z.string().optional(),
        title: z.string().min(1),
        type: z.enum(['trademark','litigation','compliance','contract_dispute','ip','regulatory','employment','other']).default('other'),
        status: z.enum(['open','pending','in_review','resolved','closed','dismissed']).default('open'),
        priority: z.enum(['low','medium','high','critical']).default('medium'),
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
        const conn = (database as any)._.session?.client;
        if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection not available' });
        const [result] = await conn.query(
          'INSERT INTO legal_cases (caseNumber, title, type, status, priority, opposingParty, attorney, lawFirm, filedDate, nextHearingDate, jurisdiction, description, notes, assignedTo, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [input.caseNumber || null, input.title, input.type, input.status, input.priority, input.opposingParty || null, input.attorney || null, input.lawFirm || null, input.filedDate || null, input.nextHearingDate || null, input.jurisdiction || null, input.description || null, input.notes || null, input.assignedTo || null, ctx.user.id]
        );
        return { id: result.insertId, success: true };
      }),
    update: legalProcedure
      .input(z.object({
        id: z.number(),
        caseNumber: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(['trademark','litigation','compliance','contract_dispute','ip','regulatory','employment','other']).optional(),
        status: z.enum(['open','pending','in_review','resolved','closed','dismissed']).optional(),
        priority: z.enum(['low','medium','high','critical']).optional(),
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
        const conn = (database as any)._.session?.client;
        if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection not available' });
        const { id, ...fields } = input;
        const sets = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k]) => `${k} = ?`);
        const vals = Object.entries(fields).filter(([, v]) => v !== undefined).map(([, v]) => v);
        if (sets.length === 0) return { success: true };
        await conn.query('UPDATE legal_cases SET ' + sets.join(', ') + ' WHERE id = ?', [...vals, id]);
        return { success: true };
      }),
  });
