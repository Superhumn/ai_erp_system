// appRouter.governmentTenders — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure } from "./_shared";

// ============================================
// GOVERNMENT TENDERS  (GeM, IRCTC, ICDS, CSD, AIIMS...)
// ============================================
export const governmentTendersRouter = router({
    list: protectedProcedure
      .input(z.object({
        portal: z.enum([
          "gem", "irctc", "icds", "csd", "aiims", "state_nutrition", "state_hospital",
          "ministry_defense", "ministry_railways", "ministry_health", "ministry_food",
          "eu_ted", "us_sam_gov", "uk_contracts_finder", "other",
        ]).optional(),
        status: z.enum([
          "watching", "qualifying", "preparing", "submitted", "under_review",
          "shortlisted", "awarded", "lost", "withdrawn", "cancelled",
        ]).optional(),
        country: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { governmentTenders } = await import("../../drizzle/schema");
        const conditions: any[] = [];
        if (input?.portal) conditions.push(eq(governmentTenders.portal, input.portal));
        if (input?.status) conditions.push(eq(governmentTenders.status, input.status));
        if (input?.country) conditions.push(eq(governmentTenders.country, input.country));
        const q = database.select().from(governmentTenders).orderBy(desc(governmentTenders.submissionDeadline));
        return conditions.length ? await q.where(and(...conditions)) : await q;
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { governmentTenders } = await import("../../drizzle/schema");
        const [row] = await database.select().from(governmentTenders).where(eq(governmentTenders.id, input.id));
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tender not found' });
        return row;
      }),

    create: opsProcedure
      .input(z.object({
        title: z.string().min(1).max(500),
        portal: z.enum([
          "gem", "irctc", "icds", "csd", "aiims", "state_nutrition", "state_hospital",
          "ministry_defense", "ministry_railways", "ministry_health", "ministry_food",
          "eu_ted", "us_sam_gov", "uk_contracts_finder", "other",
        ]),
        customPortalName: z.string().optional(),
        category: z.enum([
          "food_supply", "defense_canteen", "midday_meal", "hospital_procurement",
          "railway_catering", "school_nutrition", "humanitarian_aid", "other",
        ]).default("food_supply"),
        solicitationNumber: z.string().optional(),
        agency: z.string().optional(),
        country: z.string().optional(),
        state: z.string().optional(),
        publishedDate: z.coerce.date().optional(),
        submissionDeadline: z.coerce.date().optional(),
        bidOpeningDate: z.coerce.date().optional(),
        estimatedValue: z.string().optional(),
        emdAmount: z.string().optional(),
        currency: z.string().length(3).default("INR"),
        status: z.enum([
          "watching", "qualifying", "preparing", "submitted", "under_review",
          "shortlisted", "awarded", "lost", "withdrawn", "cancelled",
        ]).default("watching"),
        classILocalSupplier: z.boolean().optional(),
        fssaiRequired: z.boolean().optional(),
        bomRequired: z.boolean().optional(),
        bankGuaranteeRequired: z.boolean().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        portalUrl: z.string().url().optional(),
        projectId: z.number().optional(),
        ownerId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { governmentTenders } = await import("../../drizzle/schema");
        const result = await database.insert(governmentTenders).values({
          ...input,
          createdBy: ctx.user.id,
        } as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    updateStatus: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum([
          "watching", "qualifying", "preparing", "submitted", "under_review",
          "shortlisted", "awarded", "lost", "withdrawn", "cancelled",
        ]),
        bidAmount: z.string().optional(),
        awardedAmount: z.string().optional(),
        awardDate: z.coerce.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { governmentTenders } = await import("../../drizzle/schema");
        const { id, ...patch } = input;
        await database.update(governmentTenders).set(patch as any).where(eq(governmentTenders.id, id));
        return { ok: true };
      }),
  });
