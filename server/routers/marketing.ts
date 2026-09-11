// appRouter.marketing — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { safeDecryptToken } from "../_core/crypto";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { planPublish, publishToPlatform, type Platform as SocialPlatform } from "../_core/socialPublisher";
import { getYouTubeAuthUrl } from "../_core/youtube";
import { encrypt } from "../_core/crypto";
import { createAuditLog } from "./_shared";

// ============================================
// MARKETING — VIDEO ASSETS & SOCIAL POSTING
// ============================================
export const marketingRouter = router({
    // --- Video assets ---
    listVideos: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getMarketingVideos(input)),
    getVideo: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getMarketingVideoById(input.id)),
    createVideo: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        horizontalUrl: z.string().url().optional(),
        verticalUrl: z.string().url().optional(),
        squareUrl: z.string().url().optional(),
        thumbnailUrl: z.string().url().optional(),
        durationSec: z.number().int().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createMarketingVideo({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'marketingVideo', result.id, input.title);
        return result;
      }),
    updateVideo: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        horizontalUrl: z.string().url().nullable().optional(),
        verticalUrl: z.string().url().nullable().optional(),
        squareUrl: z.string().url().nullable().optional(),
        thumbnailUrl: z.string().url().nullable().optional(),
        durationSec: z.number().int().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateMarketingVideo(id, data);
        return { success: true };
      }),
    deleteVideo: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteMarketingVideo(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'marketingVideo', input.id);
        return { success: true };
      }),

    // --- Posts ---
    listPosts: protectedProcedure
      .input(z.object({
        videoId: z.number().optional(),
        platform: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getSocialPosts(input)),

    // Plan-only: returns the platform-fit decisions without creating any rows.
    // Lets the UI preview which platforms will succeed, get a fallback ratio,
    // or be skipped before the user commits to publishing.
    planPosts: protectedProcedure
      .input(z.object({
        videoId: z.number(),
        platforms: z.array(z.enum([
          "tiktok", "youtube", "youtube_shorts", "instagram_reels", "instagram_feed",
        ])).min(1),
      }))
      .query(async ({ input }) => {
        const video = await db.getMarketingVideoById(input.videoId);
        if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
        return planPublish(input.platforms as SocialPlatform[], {
          horizontalUrl: video.horizontalUrl,
          verticalUrl: video.verticalUrl,
          squareUrl: video.squareUrl,
        });
      }),

    // Fan-out: for each requested platform, picks the best cut, dispatches
    // the upload, and writes a `social_posts` row recording the result.
    // Platforms that have no compatible cut are recorded as `skipped`.
    publish: protectedProcedure
      .input(z.object({
        videoId: z.number(),
        platforms: z.array(z.enum([
          "tiktok", "youtube", "youtube_shorts", "instagram_reels", "instagram_feed",
        ])).min(1),
        caption: z.string().optional(),
        hashtags: z.string().optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const video = await db.getMarketingVideoById(input.videoId);
        if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });

        const plan = planPublish(input.platforms as SocialPlatform[], {
          horizontalUrl: video.horizontalUrl,
          verticalUrl: video.verticalUrl,
          squareUrl: video.squareUrl,
        });

        // OAuth lookup is by base platform — both `youtube` and `youtube_shorts`
        // share a YouTube credential; both `instagram_*` share Instagram.
        const credentials = await db.getSocialPlatformCredentials({ companyId: video.companyId ?? undefined });
        const baseFor = (p: SocialPlatform) =>
          p.startsWith("youtube") ? "youtube" : p.startsWith("instagram") ? "instagram" : "tiktok";
        const credFor = (p: SocialPlatform) =>
          credentials.find((c: any) => c.platform === baseFor(p) && c.isActive) ?? null;

        // Per-platform preferred aspect ratio. Used as the recorded ratio when
        // a publish is skipped so the row reflects what the platform expects.
        const PREFERRED_RATIO: Record<SocialPlatform, "horizontal" | "vertical" | "square"> = {
          tiktok: "vertical",
          youtube: "horizontal",
          youtube_shorts: "vertical",
          instagram_reels: "vertical",
          instagram_feed: "square",
        };

        const results = [];
        for (const fit of plan) {
          if (!fit.pickedUrl || !fit.pickedRatio) {
            const row = await db.createSocialPost({
              companyId: video.companyId,
              videoId: video.id,
              platform: fit.platform,
              aspectRatio: PREFERRED_RATIO[fit.platform],
              caption: input.caption,
              hashtags: input.hashtags,
              status: "skipped",
              skipReason: fit.skipReason,
              createdBy: ctx.user.id,
            });
            results.push({ ...fit, postId: row.id, status: "skipped" });
            continue;
          }

          const row = await db.createSocialPost({
            companyId: video.companyId,
            videoId: video.id,
            platform: fit.platform,
            aspectRatio: fit.pickedRatio,
            caption: input.caption,
            hashtags: input.hashtags,
            scheduledAt: input.scheduledAt,
            status: input.scheduledAt ? "scheduled" : "uploading",
            createdBy: ctx.user.id,
          });

          if (input.scheduledAt) {
            results.push({ ...fit, postId: row.id, status: "scheduled" });
            continue;
          }

          const cred = credFor(fit.platform);
          try {
            const pub = await publishToPlatform({
              platform: fit.platform,
              videoUrl: fit.pickedUrl,
              title: video.title,
              caption: input.caption ?? video.description ?? video.title,
              hashtags: input.hashtags ?? video.tags ?? undefined,
              // Tokens stored encrypted-at-rest. Decrypt for the API client.
              tokens: cred
                ? {
                    accessToken: cred.accessToken ? safeDecryptToken(cred.accessToken) : "",
                    refreshToken: cred.refreshToken ? safeDecryptToken(cred.refreshToken) : null,
                    expiresAt: cred.tokenExpiresAt,
                  }
                : null,
            });
            // If OAuth refresh produced new tokens, persist them encrypted so
            // the next upload doesn't re-spend the refresh budget.
            if (pub.refreshedTokens && cred) {
              await db.upsertSocialPlatformCredential({
                companyId: cred.companyId,
                platform: cred.platform,
                accessToken: encrypt(pub.refreshedTokens.accessToken),
                refreshToken: pub.refreshedTokens.refreshToken ? encrypt(pub.refreshedTokens.refreshToken) : null,
                tokenExpiresAt: pub.refreshedTokens.expiresAt,
              });
            }
            await db.updateSocialPost(row.id, {
              status: "published",
              publishedAt: new Date(),
              externalId: pub.externalId,
              externalUrl: pub.externalUrl,
            });
            results.push({ ...fit, postId: row.id, status: "published", externalUrl: pub.externalUrl });
          } catch (err: any) {
            await db.updateSocialPost(row.id, {
              status: "failed",
              errorMessage: err?.message ?? String(err),
            });
            results.push({ ...fit, postId: row.id, status: "failed", error: err?.message });
          }
        }

        await createAuditLog(ctx.user.id, 'create', 'socialPostFanout', video.id, video.title);
        return { videoId: video.id, results };
      }),

    // --- Credentials ---
    listCredentials: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        const creds = await db.getSocialPlatformCredentials(input);
        // Never leak tokens to the client.
        return creds.map((c: any) => ({
          id: c.id,
          platform: c.platform,
          accountHandle: c.accountHandle,
          isActive: c.isActive,
          isConnected: !!c.accessToken,
          tokenExpiresAt: c.tokenExpiresAt,
        }));
      }),
    // Returns the platform's OAuth consent URL. The frontend opens this in a
    // popup/new tab; the user authorizes; the platform redirects to our
    // /api/oauth/<platform>/callback route which writes the credential.
    getConnectUrl: protectedProcedure
      .input(z.object({ platform: z.enum(["tiktok", "youtube", "instagram"]) }))
      .mutation(({ input, ctx }) => {
        if (input.platform === "youtube") {
          return { url: getYouTubeAuthUrl(ctx.user.id) };
        }
        // TikTok and Instagram require their own developer apps + scopes; the
        // shape is the same so the UI works identically once those are wired.
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: `${input.platform} OAuth is not wired yet. YouTube is available now; TikTok and Instagram are next.`,
        });
      }),

    disconnectCredential: protectedProcedure
      .input(z.object({ platform: z.enum(["tiktok", "youtube", "instagram"]) }))
      .mutation(async ({ input }) => {
        await db.disconnectSocialPlatformCredential(input.platform);
        return { success: true };
      }),

  });
