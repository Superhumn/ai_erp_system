import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db/marketingDb";
import { router, protectedProcedure, createAuditLog } from "./middleware";
import {
  schedulePost as providerSchedule,
  fetchEngagement as providerFetchEngagement,
  fetchMetrics as providerFetchMetrics,
  isSocialProviderConfigured,
  type SocialPlatform,
} from "../socialProviderService";

const platformEnum = z.enum(["linkedin", "twitter", "facebook", "instagram", "tiktok", "youtube", "threads"]);
const postStatusEnum = z.enum(["draft", "scheduled", "queued", "posted", "failed", "cancelled"]);
const campaignStatusEnum = z.enum(["draft", "active", "paused", "completed", "archived"]);
const campaignGoalEnum = z.enum(["awareness", "engagement", "leads", "conversions", "retention"]);

// Marketing section is gated to sales/admin/exec per the locked sidebar spec.
const marketingProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "sales", "exec"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Marketing access required" });
  }
  return next({ ctx });
});

export const marketingRouter = router({
  marketing: router({
    providerStatus: protectedProcedure.query(() => ({
      configured: isSocialProviderConfigured(),
    })),

    overview: marketingProcedure.query(() => db.getMarketingOverviewStats()),

    // --- Social accounts ---
    accounts: router({
      list: marketingProcedure.query(() => db.getSocialAccounts()),
      create: marketingProcedure
        .input(z.object({
          platform: platformEnum,
          handle: z.string().min(1),
          displayName: z.string().optional(),
          avatarUrl: z.string().optional(),
          provider: z.enum(["ayrshare", "direct", "manual"]).optional(),
          providerProfileKey: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createSocialAccount({ ...input, createdBy: ctx.user.id });
          await createAuditLog(ctx.user.id, "create", "socialAccount", id, `${input.platform}:${input.handle}`);
          return { id };
        }),
      update: marketingProcedure
        .input(z.object({
          id: z.number(),
          handle: z.string().optional(),
          displayName: z.string().optional(),
          status: z.enum(["active", "disconnected", "error"]).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...rest } = input;
          await db.updateSocialAccount(id, rest);
          await createAuditLog(ctx.user.id, "update", "socialAccount", id);
          return { success: true };
        }),
      delete: marketingProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteSocialAccount(input.id);
          await createAuditLog(ctx.user.id, "delete", "socialAccount", input.id);
          return { success: true };
        }),
    }),

    // --- Campaigns ---
    campaigns: router({
      list: marketingProcedure
        .input(z.object({ status: z.string().optional(), search: z.string().optional() }).optional())
        .query(({ input }) => db.getMarketingCampaigns(input)),
      get: marketingProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getMarketingCampaignById(input.id)),
      create: marketingProcedure
        .input(z.object({
          name: z.string().min(1),
          goal: campaignGoalEnum.optional(),
          status: campaignStatusEnum.optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          budgetAmount: z.string().optional(),
          spendAmount: z.string().optional(),
          currency: z.string().optional(),
          targetTags: z.string().optional(),
          utmSource: z.string().optional(),
          utmMedium: z.string().optional(),
          utmCampaign: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createMarketingCampaign({ ...input, createdBy: ctx.user.id });
          await createAuditLog(ctx.user.id, "create", "marketingCampaign", id, input.name);
          return { id };
        }),
      update: marketingProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          goal: campaignGoalEnum.optional(),
          status: campaignStatusEnum.optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          budgetAmount: z.string().optional(),
          spendAmount: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...rest } = input;
          await db.updateMarketingCampaign(id, rest);
          await createAuditLog(ctx.user.id, "update", "marketingCampaign", id);
          return { success: true };
        }),
      delete: marketingProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteMarketingCampaign(input.id);
          await createAuditLog(ctx.user.id, "delete", "marketingCampaign", input.id);
          return { success: true };
        }),
      roi: marketingProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCampaignRoi(input.id)),
    }),

    // --- Posts ---
    posts: router({
      list: marketingProcedure
        .input(z.object({
          campaignId: z.number().optional(),
          status: z.string().optional(),
          from: z.date().optional(),
          to: z.date().optional(),
          limit: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getMarketingPosts(input)),
      get: marketingProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getMarketingPostById(input.id)),
      create: marketingProcedure
        .input(z.object({
          campaignId: z.number().optional(),
          title: z.string().optional(),
          body: z.string().min(1),
          mediaUrls: z.array(z.string()).optional(),
          platforms: z.array(platformEnum).min(1),
          accountIds: z.array(z.number()).optional(),
          scheduledAt: z.date().optional(),
          status: postStatusEnum.optional(),
          aiGenerated: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createMarketingPost({
            campaignId: input.campaignId,
            title: input.title,
            body: input.body,
            mediaUrls: input.mediaUrls ? JSON.stringify(input.mediaUrls) : undefined,
            platforms: JSON.stringify(input.platforms),
            accountIds: input.accountIds ? JSON.stringify(input.accountIds) : undefined,
            scheduledAt: input.scheduledAt,
            status: input.status ?? (input.scheduledAt ? "scheduled" : "draft"),
            aiGenerated: input.aiGenerated ?? false,
            createdBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, "create", "marketingPost", id, input.title ?? input.body.slice(0, 64));
          return { id };
        }),
      update: marketingProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().optional(),
          body: z.string().optional(),
          mediaUrls: z.array(z.string()).optional(),
          platforms: z.array(platformEnum).optional(),
          accountIds: z.array(z.number()).optional(),
          scheduledAt: z.date().nullable().optional(),
          status: postStatusEnum.optional(),
          campaignId: z.number().nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, mediaUrls, platforms, accountIds, ...rest } = input;
          const data: any = { ...rest };
          if (mediaUrls !== undefined) data.mediaUrls = JSON.stringify(mediaUrls);
          if (platforms !== undefined) data.platforms = JSON.stringify(platforms);
          if (accountIds !== undefined) data.accountIds = JSON.stringify(accountIds);
          await db.updateMarketingPost(id, data);
          await createAuditLog(ctx.user.id, "update", "marketingPost", id);
          return { success: true };
        }),
      delete: marketingProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteMarketingPost(input.id);
          await createAuditLog(ctx.user.id, "delete", "marketingPost", input.id);
          return { success: true };
        }),

      // Hand a post to the provider. No-ops with simulated=true when no API key.
      publish: marketingProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const post = await db.getMarketingPostById(input.id);
          if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
          const platforms = JSON.parse(post.platforms || "[]") as SocialPlatform[];
          const mediaUrls = post.mediaUrls ? JSON.parse(post.mediaUrls) : undefined;
          const result = await providerSchedule({
            body: post.body,
            mediaUrls,
            platforms,
            scheduledAt: post.scheduledAt ?? undefined,
          });
          if (!result.ok) {
            await db.updateMarketingPost(input.id, {
              status: "failed",
              failureReason: result.error ?? "unknown",
            });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Publish failed" });
          }
          await db.updateMarketingPost(input.id, {
            status: post.scheduledAt && post.scheduledAt > new Date() ? "scheduled" : "posted",
            postedAt: post.scheduledAt && post.scheduledAt > new Date() ? undefined : new Date(),
            externalIds: JSON.stringify(result.perPlatform ?? {}),
          });
          await createAuditLog(ctx.user.id, "approve", "marketingPost", input.id);
          return { success: true, simulated: !!result.simulated };
        }),
    }),

    // --- Engagement inbox ---
    engagement: router({
      list: marketingProcedure
        .input(z.object({
          postId: z.number().optional(),
          platform: z.string().optional(),
          type: z.string().optional(),
          unlinkedOnly: z.boolean().optional(),
          limit: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getMarketingEngagements(input)),
      suggestContact: marketingProcedure
        .input(z.object({ handle: z.string() }))
        .query(({ input }) => db.suggestContactForHandle(input.handle)),
      linkContact: marketingProcedure
        .input(z.object({ engagementId: z.number(), contactId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.linkEngagementToContact(input.engagementId, input.contactId);
          await createAuditLog(ctx.user.id, "update", "marketingEngagement", input.engagementId);
          return { success: true };
        }),
      markReplied: marketingProcedure
        .input(z.object({ engagementId: z.number() }))
        .mutation(async ({ input }) => {
          await db.markEngagementReplied(input.engagementId);
          return { success: true };
        }),
      sync: marketingProcedure
        .input(z.object({ postId: z.number() }))
        .mutation(async ({ input }) => {
          const post = await db.getMarketingPostById(input.postId);
          if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
          const externalIds = post.externalIds ? JSON.parse(post.externalIds) : {};
          const ids = Object.values(externalIds as Record<string, { id: string }>).map((x) => x.id).filter(Boolean);
          const result = await providerFetchEngagement(ids);
          if (!result.ok) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Sync failed" });
          }
          for (const item of result.items) {
            await db.createMarketingEngagement({
              postId: input.postId,
              platform: item.platform,
              externalId: item.externalId,
              type: item.type,
              authorHandle: item.authorHandle,
              authorName: item.authorName,
              body: item.body,
              permalink: item.permalink,
              occurredAt: item.occurredAt,
            });
          }
          return { imported: result.items.length, simulated: !!result.simulated };
        }),
    }),

    metrics: router({
      syncForPost: marketingProcedure
        .input(z.object({ postId: z.number() }))
        .mutation(async ({ input }) => {
          const post = await db.getMarketingPostById(input.postId);
          if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
          const externalIds = post.externalIds ? JSON.parse(post.externalIds) : {};
          let recorded = 0;
          for (const platform of Object.keys(externalIds)) {
            const ext = externalIds[platform];
            if (!ext?.id) continue;
            const result = await providerFetchMetrics(ext.id);
            if (!result.ok) continue;
            for (const m of result.items) {
              await db.recordMarketingMetric({
                postId: input.postId,
                platform: m.platform,
                impressions: m.impressions ?? 0,
                reach: m.reach ?? 0,
                clicks: m.clicks ?? 0,
                likes: m.likes ?? 0,
                comments: m.comments ?? 0,
                shares: m.shares ?? 0,
                saves: m.saves ?? 0,
                videoViews: m.videoViews ?? 0,
              });
              recorded++;
            }
          }
          return { recorded };
        }),
      latest: marketingProcedure
        .input(z.object({ postId: z.number() }))
        .query(({ input }) => db.getLatestMetricsForPost(input.postId)),
    }),
  }),
});
