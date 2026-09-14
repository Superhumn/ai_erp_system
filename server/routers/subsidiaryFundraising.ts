// appRouter.subsidiaryFundraising — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure } from "./_shared";

// ============================================
// SUBSIDIARY FUNDRAISING ROUNDS
// ============================================
export const subsidiaryFundraisingRouter = router({
    listRounds: financeProcedure
      .input(z.object({ subsidiaryCompanyId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { subsidiaryFundraisingRounds } = await import("../../drizzle/schema");
        const q = database.select().from(subsidiaryFundraisingRounds).orderBy(desc(subsidiaryFundraisingRounds.openedDate));
        if (input?.subsidiaryCompanyId) {
          return q.where(eq(subsidiaryFundraisingRounds.subsidiaryCompanyId, input.subsidiaryCompanyId));
        }
        return q;
      }),

    getRound: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { subsidiaryFundraisingRounds, subsidiaryFundraisingInvestors } = await import("../../drizzle/schema");
        const [round] = await database.select().from(subsidiaryFundraisingRounds)
          .where(eq(subsidiaryFundraisingRounds.id, input.id));
        if (!round) throw new TRPCError({ code: 'NOT_FOUND', message: 'Round not found' });
        const investors = await database.select().from(subsidiaryFundraisingInvestors)
          .where(eq(subsidiaryFundraisingInvestors.roundId, input.id));
        return { ...round, investors };
      }),

    createRound: financeProcedure
      .input(z.object({
        subsidiaryCompanyId: z.number(),
        parentCompanyId: z.number().optional(),
        name: z.string().min(1).max(255),
        roundType: z.enum([
          "pre_seed", "seed", "series_a", "series_b", "series_c",
          "bridge", "convertible_note", "safe", "debt", "grant", "strategic", "other",
        ]),
        targetAmount: z.string().optional(),
        currency: z.string().length(3).default("USD"),
        preMoneyValuation: z.string().optional(),
        leadInvestorName: z.string().optional(),
        openedDate: z.coerce.date().optional(),
        status: z.enum(["planning", "open", "closing", "closed", "cancelled"]).default("planning"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { subsidiaryFundraisingRounds } = await import("../../drizzle/schema");
        const result = await database.insert(subsidiaryFundraisingRounds).values({
          ...input,
          createdBy: ctx.user.id,
        } as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    addInvestor: financeProcedure
      .input(z.object({
        roundId: z.number(),
        investorName: z.string().min(1),
        investorType: z.enum([
          "individual", "angel", "vc", "pe", "corporate", "government", "family_office",
          "crowd", "strategic", "employee", "other",
        ]).default("individual"),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        country: z.string().optional(),
        commitmentAmount: z.string().optional(),
        currency: z.string().length(3).default("USD"),
        contactId: z.number().optional(),
        status: z.enum([
          "introduced", "in_diligence", "term_sheet", "committed",
          "wired", "closed", "declined", "lapsed",
        ]).default("introduced"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { subsidiaryFundraisingInvestors } = await import("../../drizzle/schema");
        const result = await database.insert(subsidiaryFundraisingInvestors).values(input as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    updateInvestor: financeProcedure
      .input(z.object({
        id: z.number(),
        patch: z.object({
          status: z.enum([
            "introduced", "in_diligence", "term_sheet", "committed",
            "wired", "closed", "declined", "lapsed",
          ]).optional(),
          commitmentAmount: z.string().optional(),
          fundedAmount: z.string().optional(),
          ownershipPct: z.string().optional(),
          notes: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { subsidiaryFundraisingInvestors } = await import("../../drizzle/schema");
        await database.update(subsidiaryFundraisingInvestors).set(input.patch as any)
          .where(eq(subsidiaryFundraisingInvestors.id, input.id));
        return { ok: true };
      }),
  });
