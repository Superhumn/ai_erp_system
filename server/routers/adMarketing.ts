// appRouter.adMarketing — paid-ads module: platforms, campaigns, daily spend,
// leads, tracking links, ad credits, automation log. Logic lives in
// server/adMarketingService.ts; procedures stay thin.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, salesProcedure } from "./middleware";
import { resolveRequestScope, assertNonEmptyScope, createAuditLog } from "./_shared";
import { scopeAllows } from "../_core/scope";
import {
  AD_CAMPAIGN_STATUSES, AD_CREDIT_STATUSES, AD_PLATFORM_NAMES, addIsoDays, buildTrackingUrl, parseIsoDate, toIsoDate, utmSlug,
} from "../../shared/adMarketing";
import {
  buildWeeklySummary, encryptToken, ingestAdLead, runAlertChecks, runDailySpendSync, runLeadPoll, runWeeklySummary, spendSummary, syncSpendForPlatform,
} from "../adMarketingService";
import type { AdCampaign, AdPlatform } from "../../drizzle/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const money = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).transform((v) => (typeof v === "number" ? v.toFixed(2) : v));

async function scopeOf(user: { id: number; companyId: number | null; regionScope: "entity" | "region" | "global" }) {
  const scope = assertNonEmptyScope(await resolveRequestScope(user));
  return { scope, companyIds: scope.companyIds === "all" ? null : scope.companyIds };
}

function assertVisible(scope: Awaited<ReturnType<typeof resolveRequestScope>>, row: { companyId: number | null } | undefined, what: string) {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
  if (row.companyId != null && !scopeAllows(scope, row.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: `${what} is outside your entity scope` });
  return row;
}

/** Strip the token before a platform row leaves the server. */
function publicPlatform(p: AdPlatform) {
  const { accessToken, ...rest } = p;
  return { ...rest, hasToken: !!accessToken };
}

const campaignFields = z.object({
  companyId: z.number().optional(),
  platformId: z.number(),
  externalId: z.string().max(128).nullable().optional(),
  name: z.string().min(1).max(255),
  objective: z.string().max(128).nullable().optional(),
  dailyBudgetUsd: money.nullable().optional(),
  totalBudgetUsd: money.nullable().optional(),
  targetCostPerSignupUsd: money.nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  status: z.enum(AD_CAMPAIGN_STATUSES).optional(),
  ownerUserId: z.number().nullable().optional(),
  utmCampaign: z.string().max(128).nullable().optional(),
  welcomeSubject: z.string().max(255).nullable().optional(),
  welcomeBody: z.string().max(10000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const adMarketingRouter = router({
  // ---------------- Platforms ----------------
  platforms: router({
    list: salesProcedure.query(async ({ ctx }) => {
      const { companyIds } = await scopeOf(ctx.user);
      return (await db.getAdPlatforms(companyIds)).map(publicPlatform);
    }),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        companyId: z.number().nullable().optional(),
        name: z.enum(AD_PLATFORM_NAMES),
        label: z.string().max(128).nullable().optional(),
        accountId: z.string().max(128).nullable().optional(),
        pageId: z.string().max(128).nullable().optional(),
        /** Plain token; stored encrypted. Omit to keep the current one. */
        accessToken: z.string().max(4000).optional(),
        tokenExpiresAt: z.coerce.date().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, accessToken, ...rest } = input;
        const patch: Record<string, unknown> = { ...rest };
        if (accessToken !== undefined) {
          patch.accessToken = accessToken.trim() ? encryptToken(accessToken.trim()) : null;
          patch.connectionStatus = accessToken.trim() ? "connected" : "disconnected";
          patch.lastSyncError = null;
        }
        if (id) {
          const { scope } = await scopeOf(ctx.user);
          assertVisible(scope, await db.getAdPlatformById(id), "Platform");
          await db.updateAdPlatform(id, patch);
          await createAuditLog(ctx.user.id, "update", "adPlatform", id, input.name);
          return { id };
        }
        const newId = await db.createAdPlatform({ ...(patch as any), companyId: input.companyId ?? ctx.user.companyId ?? undefined });
        await createAuditLog(ctx.user.id, "create", "adPlatform", newId, input.name);
        return { id: newId };
      }),
    disconnect: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdPlatformById(input.id), "Platform");
      await db.updateAdPlatform(input.id, { accessToken: null, connectionStatus: "disconnected", lastSyncError: null });
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdPlatformById(input.id), "Platform");
      const campaigns = await db.getAdCampaigns({ platformId: input.id });
      if (campaigns.length > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Delete or move this platform's campaigns first" });
      await db.deleteAdPlatform(input.id);
      return { success: true };
    }),
    /** Pull spend now for a date range (defaults to the last 7 days). */
    syncNow: adminProcedure
      .input(z.object({ id: z.number(), from: isoDate.optional(), to: isoDate.optional() }))
      .mutation(async ({ input, ctx }) => {
        const { scope } = await scopeOf(ctx.user);
        const platform = assertVisible(scope, await db.getAdPlatformById(input.id), "Platform") as AdPlatform;
        const to = input.to ?? addIsoDays(toIsoDate(new Date()), -1);
        const from = input.from ?? addIsoDays(to, -6);
        if (!parseIsoDate(from) || !parseIsoDate(to) || from > to) throw new TRPCError({ code: "BAD_REQUEST", message: "Bad date range" });
        return syncSpendForPlatform(platform, from, to);
      }),
    syncLogs: salesProcedure
      .input(z.object({ platformId: z.number().optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
      .query(({ input }) => db.getAdSyncLogs({ platformId: input?.platformId, limit: input?.limit ?? 100 })),
  }),

  // ---------------- Campaigns ----------------
  campaigns: router({
    list: salesProcedure
      .input(z.object({ platformId: z.number().optional(), status: z.enum(AD_CAMPAIGN_STATUSES).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const { companyIds } = await scopeOf(ctx.user);
        const campaigns = await db.getAdCampaigns({ companyIds, platformId: input?.platformId, status: input?.status });
        const totals = await db.getAdSpendTotalsByCampaign(campaigns.map((c) => c.id));
        return campaigns.map((c) => ({ ...c, totals: totals.find((t) => t.campaignId === c.id) ?? null }));
      }),
    create: salesProcedure.input(campaignFields).mutation(async ({ input, ctx }) => {
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdPlatformById(input.platformId), "Platform");
      const id = await db.createAdCampaign({
        ...input,
        companyId: input.companyId ?? ctx.user.companyId ?? undefined,
        utmCampaign: input.utmCampaign?.trim() ? utmSlug(input.utmCampaign) : utmSlug(input.name),
        ownerUserId: input.ownerUserId ?? ctx.user.id,
        createdBy: ctx.user.id,
      });
      await createAuditLog(ctx.user.id, "create", "adCampaign", id, input.name);
      return { id };
    }),
    update: salesProcedure.input(campaignFields.partial().extend({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdCampaignById(id), "Campaign");
      if (data.utmCampaign !== undefined && data.utmCampaign) data.utmCampaign = utmSlug(data.utmCampaign);
      await db.updateAdCampaign(id, data);
      await createAuditLog(ctx.user.id, "update", "adCampaign", id, data.name);
      return { id };
    }),
    delete: salesProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdCampaignById(input.id), "Campaign");
      await db.deleteAdCampaign(input.id);
      await createAuditLog(ctx.user.id, "delete", "adCampaign", input.id);
      return { success: true };
    }),
  }),

  // ---------------- Spend & cost per signup ----------------
  spend: router({
    /** Totals by platform, campaign and day for a date range (defaults: last 30 days). */
    summary: salesProcedure
      .input(z.object({ from: isoDate.optional(), to: isoDate.optional() }).optional())
      .query(async ({ ctx, input }) => {
        const { companyIds } = await scopeOf(ctx.user);
        const to = input?.to ?? addIsoDays(toIsoDate(new Date()), -1);
        const from = input?.from ?? addIsoDays(to, -29);
        if (from > to) throw new TRPCError({ code: "BAD_REQUEST", message: "Start date is after end date" });
        const campaigns = (await db.getAdCampaigns({ companyIds })) as AdCampaign[];
        return spendSummary(campaigns, from, to);
      }),
    list: salesProcedure
      .input(z.object({ campaignId: z.number(), from: isoDate.optional(), to: isoDate.optional() }))
      .query(async ({ ctx, input }) => {
        const { scope } = await scopeOf(ctx.user);
        assertVisible(scope, await db.getAdCampaignById(input.campaignId), "Campaign");
        return db.getAdSpend({ campaignIds: [input.campaignId], from: input.from, to: input.to });
      }),
    /** Key in a day by hand (platform not connected, or a correction). */
    record: salesProcedure
      .input(z.object({
        campaignId: z.number(),
        date: isoDate,
        spendUsd: money,
        impressions: z.number().int().nonnegative().default(0),
        clicks: z.number().int().nonnegative().default(0),
        signups: z.number().int().nonnegative().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const { scope } = await scopeOf(ctx.user);
        assertVisible(scope, await db.getAdCampaignById(input.campaignId), "Campaign");
        if (!parseIsoDate(input.date)) throw new TRPCError({ code: "BAD_REQUEST", message: "Bad date" });
        await db.upsertAdSpendDaily({ ...input, source: "manual" });
        return { success: true };
      }),
    delete: salesProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteAdSpendDaily(input.id);
      return { success: true };
    }),
  }),

  // ---------------- Leads ----------------
  leads: router({
    list: salesProcedure
      .input(z.object({ campaignId: z.number().optional(), platformId: z.number().optional(), from: isoDate.optional(), to: isoDate.optional(), limit: z.number().int().min(1).max(1000).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const { companyIds } = await scopeOf(ctx.user);
        return db.getAdLeads({
          companyIds,
          campaignId: input?.campaignId,
          platformId: input?.platformId,
          from: input?.from ? parseIsoDate(input.from) ?? undefined : undefined,
          to: input?.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
          limit: input?.limit,
        });
      }),
    /** Key in a lead by hand — runs the same intake (CRM match, tags, notification). */
    create: salesProcedure
      .input(z.object({
        campaignId: z.number().nullable().optional(),
        email: z.string().email().optional(),
        fullName: z.string().max(255).optional(),
        phone: z.string().max(32).optional(),
        organization: z.string().max(255).optional(),
        notes: z.string().max(2000).optional(),
        sendWelcome: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!input.email && !input.fullName) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a name or an email" });
        const { scope } = await scopeOf(ctx.user);
        if (input.campaignId) assertVisible(scope, await db.getAdCampaignById(input.campaignId), "Campaign");
        return ingestAdLead({
          source: "manual",
          campaignId: input.campaignId ?? null,
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          organization: input.organization,
          answers: input.notes ? { notes: input.notes } : undefined,
          companyId: ctx.user.companyId,
          skipWelcome: !input.sendWelcome,
        });
      }),
  }),

  // ---------------- Tracking links ----------------
  links: router({
    list: salesProcedure
      .input(z.object({ campaignId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const { companyIds } = await scopeOf(ctx.user);
        return db.getAdTrackingLinks({ companyIds, campaignId: input?.campaignId });
      }),
    /** Build (without saving) — the form previews the link as the user types. */
    preview: salesProcedure
      .input(z.object({ baseUrl: z.string(), source: z.string(), medium: z.string().optional(), campaign: z.string(), content: z.string().optional() }))
      .query(({ input }) => {
        try {
          return { url: buildTrackingUrl(input.baseUrl, input), error: null };
        } catch (e) {
          return { url: null, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    create: salesProcedure
      .input(z.object({
        campaignId: z.number().nullable().optional(),
        label: z.string().max(255).optional(),
        baseUrl: z.string().max(2000),
        source: z.string().max(128),
        medium: z.string().max(128).optional(),
        campaign: z.string().max(128),
        content: z.string().max(128).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { scope } = await scopeOf(ctx.user);
        if (input.campaignId) assertVisible(scope, await db.getAdCampaignById(input.campaignId), "Campaign");
        let fullUrl: string;
        try {
          fullUrl = buildTrackingUrl(input.baseUrl, input);
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : String(e) });
        }
        const u = new URL(fullUrl);
        const id = await db.createAdTrackingLink({
          companyId: ctx.user.companyId ?? undefined,
          campaignId: input.campaignId ?? null,
          label: input.label,
          baseUrl: input.baseUrl.trim(),
          fullUrl,
          utmSource: u.searchParams.get("utm_source") ?? utmSlug(input.source),
          utmMedium: u.searchParams.get("utm_medium") ?? "paid_social",
          utmCampaign: u.searchParams.get("utm_campaign") ?? utmSlug(input.campaign),
          utmContent: u.searchParams.get("utm_content"),
          createdBy: ctx.user.id,
        });
        return { id, fullUrl };
      }),
    delete: salesProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdTrackingLinkById(input.id), "Link");
      await db.deleteAdTrackingLink(input.id);
      return { success: true };
    }),
  }),

  // ---------------- Credits ----------------
  credits: router({
    list: salesProcedure.query(async ({ ctx }) => {
      const { companyIds } = await scopeOf(ctx.user);
      return db.getAdCredits({ companyIds });
    }),
    create: salesProcedure
      .input(z.object({
        platformId: z.number().nullable().optional(),
        offer: z.string().min(1).max(255),
        amountUsd: money,
        amountUsedUsd: money.optional(),
        conditions: z.string().max(5000).nullable().optional(),
        claimedAt: z.coerce.date().nullable().optional(),
        expiresAt: z.coerce.date().nullable().optional(),
        status: z.enum(AD_CREDIT_STATUSES).optional(),
        notes: z.string().max(5000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createAdCredit({ ...input, companyId: ctx.user.companyId ?? undefined, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, "create", "adCredit", id, input.offer);
        return { id };
      }),
    update: salesProcedure
      .input(z.object({
        id: z.number(),
        platformId: z.number().nullable().optional(),
        offer: z.string().min(1).max(255).optional(),
        amountUsd: money.optional(),
        amountUsedUsd: money.optional(),
        conditions: z.string().max(5000).nullable().optional(),
        claimedAt: z.coerce.date().nullable().optional(),
        expiresAt: z.coerce.date().nullable().optional(),
        status: z.enum(AD_CREDIT_STATUSES).optional(),
        notes: z.string().max(5000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const { scope } = await scopeOf(ctx.user);
        assertVisible(scope, await db.getAdCreditById(id), "Credit");
        // A moved expiry date gets a fresh warning.
        const patch: Record<string, unknown> = { ...data };
        if (data.expiresAt !== undefined) patch.expiryWarnedAt = null;
        await db.updateAdCredit(id, patch);
        return { id };
      }),
    delete: salesProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const { scope } = await scopeOf(ctx.user);
      assertVisible(scope, await db.getAdCreditById(input.id), "Credit");
      await db.deleteAdCredit(input.id);
      return { success: true };
    }),
  }),

  // ---------------- Automations (run by hand) ----------------
  automations: router({
    runSpendSync: adminProcedure.input(z.object({ date: isoDate.optional() }).optional()).mutation(({ input }) => runDailySpendSync(input?.date)),
    runLeadPoll: adminProcedure.mutation(() => runLeadPoll()),
    runAlertChecks: adminProcedure.mutation(() => runAlertChecks()),
    weeklySummary: salesProcedure.query(() => buildWeeklySummary()),
    sendWeeklySummary: adminProcedure.mutation(() => runWeeklySummary()),
  }),
});
