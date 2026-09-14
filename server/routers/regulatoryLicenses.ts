// appRouter.regulatoryLicenses — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { legalProcedure } from "./_shared";

// ============================================
// REGULATORY LICENSES  (FSSAI, DPIIT, EFSA Novel Food, ...)
// ============================================
export const regulatoryLicensesRouter = router({
    list: protectedProcedure
      .input(z.object({
        country: z.string().optional(),
        status: z.string().optional(),
        expiringWithinDays: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { regulatoryLicenses } = await import("../../drizzle/schema");
        const conditions: any[] = [];
        if (input?.country) conditions.push(eq(regulatoryLicenses.country, input.country));
        if (input?.status) conditions.push(eq(regulatoryLicenses.status, input.status as any));
        const q = database.select().from(regulatoryLicenses).orderBy(desc(regulatoryLicenses.expirationDate));
        const rows = conditions.length ? await q.where(and(...conditions)) : await q;
        if (input?.expiringWithinDays) {
          const cutoff = Date.now() + input.expiringWithinDays * 86400_000;
          return rows.filter(r => r.expirationDate && new Date(r.expirationDate).getTime() <= cutoff);
        }
        return rows;
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { regulatoryLicenses } = await import("../../drizzle/schema");
        const [row] = await database.select().from(regulatoryLicenses).where(eq(regulatoryLicenses.id, input.id));
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'License not found' });
        return row;
      }),

    create: legalProcedure
      .input(z.object({
        licenseType: z.enum([
          "fssai_central", "fssai_state", "fssai_basic",
          "dpiit_startup_india",
          "efsa_novel_food", "fic_1169_2011_label", "traces_nt", "eu_organic",
          "fda_food_facility", "fda_ffr", "usda_organic", "usda_amS",
          "haccp", "iso_22000", "brc", "sqf",
          "halal", "kosher", "non_gmo", "vegan_certified",
          "gst_registration", "iec_import_export", "rcmc",
          "pmksy_grant", "maharashtra_agro_grant", "karnataka_udyog_mitra",
          "trademark", "patent", "copyright",
          "other",
        ]),
        customTypeName: z.string().optional(),
        country: z.string().min(2).max(8),
        state: z.string().optional(),
        authority: z.string().optional(),
        licenseNumber: z.string().optional(),
        status: z.enum([
          "planned", "applied", "in_review", "issued", "active",
          "expiring_soon", "expired", "revoked", "renewed", "rejected", "withdrawn",
        ]).default("planned"),
        appliedDate: z.coerce.date().optional(),
        issuedDate: z.coerce.date().optional(),
        expirationDate: z.coerce.date().optional(),
        renewalDueDate: z.coerce.date().optional(),
        renewalReminderDays: z.number().default(60),
        applicationFee: z.string().optional(),
        annualFee: z.string().optional(),
        currency: z.string().length(3).default("USD"),
        coversFacilityId: z.number().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        portalUrl: z.string().url().optional(),
        documentUrl: z.string().url().optional(),
        responsibleUserId: z.number().optional(),
        projectId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { regulatoryLicenses } = await import("../../drizzle/schema");
        const result = await database.insert(regulatoryLicenses).values({
          ...input,
          createdBy: ctx.user.id,
        } as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    update: legalProcedure
      .input(z.object({
        id: z.number(),
        patch: z.object({
          status: z.enum([
            "planned", "applied", "in_review", "issued", "active",
            "expiring_soon", "expired", "revoked", "renewed", "rejected", "withdrawn",
          ]).optional(),
          licenseNumber: z.string().optional(),
          issuedDate: z.coerce.date().optional(),
          expirationDate: z.coerce.date().optional(),
          renewalDueDate: z.coerce.date().optional(),
          lastRenewedAt: z.coerce.date().optional(),
          notes: z.string().optional(),
          documentUrl: z.string().url().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { regulatoryLicenses } = await import("../../drizzle/schema");
        await database.update(regulatoryLicenses).set(input.patch as any).where(eq(regulatoryLicenses.id, input.id));
        return { ok: true };
      }),
  });
