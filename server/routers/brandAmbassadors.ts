// appRouter.brandAmbassadors — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

// ============================================
// BRAND AMBASSADORS / INFLUENCERS / CHARACTERS
// ============================================
export const brandAmbassadorsRouter = router({
    list: protectedProcedure
      .input(z.object({
        stage: z.string().optional(),
        type: z.string().optional(),
        country: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { brandAmbassadors } = await import("../../drizzle/schema");
        const conditions: any[] = [];
        if (input?.stage) conditions.push(eq(brandAmbassadors.stage, input.stage as any));
        if (input?.type) conditions.push(eq(brandAmbassadors.type, input.type as any));
        if (input?.country) conditions.push(eq(brandAmbassadors.country, input.country));
        const q = database.select().from(brandAmbassadors).orderBy(desc(brandAmbassadors.updatedAt));
        return conditions.length ? await q.where(and(...conditions)) : await q;
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { brandAmbassadors, brandAmbassadorActivities } = await import("../../drizzle/schema");
        const [row] = await database.select().from(brandAmbassadors).where(eq(brandAmbassadors.id, input.id));
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ambassador not found' });
        const activities = await database.select().from(brandAmbassadorActivities)
          .where(eq(brandAmbassadorActivities.ambassadorId, input.id))
          .orderBy(desc(brandAmbassadorActivities.occurredAt));
        return { ...row, activities };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.enum([
          "celebrity", "athlete", "influencer", "chef", "musician", "actor",
          "podcaster", "youtuber", "streamer", "model", "creator",
          "animated_character", "fictional_character", "mascot", "other",
        ]),
        category: z.string().optional(),
        country: z.string().optional(),
        region: z.string().optional(),
        socialHandles: z.record(z.string(), z.string()).optional(),
        followerCount: z.number().optional(),
        followerCountByPlatform: z.record(z.string(), z.number()).optional(),
        estimatedReach: z.number().optional(),
        stage: z.enum([
          "shortlist", "prospect", "contacted", "in_negotiation",
          "term_sheet", "signed", "active", "paused", "ended", "declined", "blacklisted",
        ]).default("prospect"),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        agencyName: z.string().optional(),
        agentName: z.string().optional(),
        agentEmail: z.string().email().optional(),
        agentPhone: z.string().optional(),
        campaignName: z.string().optional(),
        contractStartDate: z.coerce.date().optional(),
        contractEndDate: z.coerce.date().optional(),
        contractValue: z.string().optional(),
        currency: z.string().length(3).default("USD"),
        paymentTerms: z.string().optional(),
        deliverables: z.string().optional(),
        exclusivity: z.string().optional(),
        usageRights: z.string().optional(),
        contactId: z.number().optional(),
        projectId: z.number().optional(),
        ownerUserId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { brandAmbassadors } = await import("../../drizzle/schema");
        const result = await database.insert(brandAmbassadors).values({
          ...input,
          createdBy: ctx.user.id,
        } as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    updateStage: protectedProcedure
      .input(z.object({
        id: z.number(),
        stage: z.enum([
          "shortlist", "prospect", "contacted", "in_negotiation",
          "term_sheet", "signed", "active", "paused", "ended", "declined", "blacklisted",
        ]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { brandAmbassadors } = await import("../../drizzle/schema");
        const patch: any = { stage: input.stage };
        if (input.notes) patch.notes = input.notes;
        await database.update(brandAmbassadors).set(patch).where(eq(brandAmbassadors.id, input.id));
        return { ok: true };
      }),

    logActivity: protectedProcedure
      .input(z.object({
        ambassadorId: z.number(),
        activityType: z.enum([
          "outreach", "meeting", "call", "email", "proposal_sent",
          "contract_sent", "contract_signed", "content_published",
          "appearance", "shipment", "payment", "note",
        ]),
        occurredAt: z.coerce.date(),
        summary: z.string().optional(),
        details: z.string().optional(),
        postUrl: z.string().url().optional(),
        impressions: z.number().optional(),
        engagements: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { brandAmbassadorActivities } = await import("../../drizzle/schema");
        const result = await database.insert(brandAmbassadorActivities).values({
          ...input,
          createdBy: ctx.user.id,
        } as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),
  });
