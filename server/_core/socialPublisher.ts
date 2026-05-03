// Picks the best video cut for each social platform and dispatches uploads.
//
// Platform-fit conventions (per platform documentation, April 2026):
//   tiktok          → vertical only (9:16). Horizontal will be letterboxed and underperform.
//   youtube         → horizontal preferred (16:9). Long-form.
//   youtube_shorts  → vertical only (9:16), <= 60s.
//   instagram_reels → vertical preferred (9:16). Square works but is downscaled.
//   instagram_feed  → square preferred (1:1), then vertical 4:5, then horizontal.
//
// If the user uploaded only one cut, we fall back to the next-best ratio per
// platform — except where the platform refuses the fallback (TikTok and
// YouTube Shorts have no horizontal mode), in which case we mark the post
// `skipped` with a `skipReason`.

import { uploadVideoToYouTube, type OAuthTokens } from "./youtube";

export type Platform =
  | "tiktok"
  | "youtube"
  | "youtube_shorts"
  | "instagram_reels"
  | "instagram_feed";

export type AspectRatio = "horizontal" | "vertical" | "square";

export interface VideoCuts {
  horizontalUrl?: string | null;
  verticalUrl?: string | null;
  squareUrl?: string | null;
}

export interface PlatformFitResult {
  platform: Platform;
  pickedRatio: AspectRatio | null;
  pickedUrl: string | null;
  skipReason: string | null;
}

// Per-platform preference order. Earlier entries are preferred.
// `null` terminates the list — anything not listed before it forces a skip.
const PLATFORM_PREFERENCES: Record<Platform, readonly (AspectRatio | null)[]> = {
  tiktok:          ["vertical", null],
  youtube:         ["horizontal", "square", "vertical"],
  youtube_shorts:  ["vertical", null],
  instagram_reels: ["vertical", "square", null],
  instagram_feed:  ["square", "vertical", "horizontal"],
};

const RATIO_TO_URL_KEY: Record<AspectRatio, keyof VideoCuts> = {
  horizontal: "horizontalUrl",
  vertical:   "verticalUrl",
  square:     "squareUrl",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok:          "TikTok",
  youtube:         "YouTube",
  youtube_shorts:  "YouTube Shorts",
  instagram_reels: "Instagram Reels",
  instagram_feed:  "Instagram Feed",
};

export function pickBestCut(platform: Platform, cuts: VideoCuts): PlatformFitResult {
  const prefs = PLATFORM_PREFERENCES[platform];
  for (const ratio of prefs) {
    if (ratio === null) break;
    const url = cuts[RATIO_TO_URL_KEY[ratio]];
    if (url) return { platform, pickedRatio: ratio, pickedUrl: url, skipReason: null };
  }
  // Build a human-readable reason listing what would have worked.
  const acceptable = prefs.filter((r): r is AspectRatio => r !== null);
  const labels = acceptable.map(r => r === "horizontal" ? "16:9" : r === "vertical" ? "9:16" : "1:1");
  return {
    platform,
    pickedRatio: null,
    pickedUrl: null,
    skipReason: `${PLATFORM_LABEL[platform]} requires ${labels.join(" or ")}; none of those cuts were uploaded.`,
  };
}

export function planPublish(platforms: Platform[], cuts: VideoCuts): PlatformFitResult[] {
  return platforms.map(p => pickBestCut(p, cuts));
}

// ============================================
// PUBLISHING DISPATCH (stubbed — wire OAuth + per-platform SDKs later)
// ============================================

export interface PublishInput {
  platform: Platform;
  videoUrl: string;
  title: string;
  caption: string;
  hashtags?: string;
  tokens: OAuthTokens | null;
  // Privacy controls for platforms that have them (currently YouTube only).
  privacyStatus?: "public" | "unlisted" | "private";
}

export interface PublishResult {
  externalId: string | null;
  externalUrl: string | null;
  // If the platform's OAuth refresh produced new tokens, the caller should
  // persist these so the next publish doesn't re-refresh. Null = no change.
  refreshedTokens: OAuthTokens | null;
}

// Dispatches the upload to the platform's API. YouTube is real; TikTok and
// Instagram remain stubbed pending their OAuth + SDK wiring.
//
// References:
//   tiktok:    https://developers.tiktok.com/doc/content-posting-api-get-started
//   instagram: Graph API two-step (create container → publish)
export async function publishToPlatform(input: PublishInput): Promise<PublishResult> {
  if (!input.tokens?.accessToken) {
    throw new Error(`Missing OAuth credentials for ${input.platform}. Connect the account in Marketing → Settings.`);
  }

  if (input.platform === "youtube" || input.platform === "youtube_shorts") {
    // Shorts auto-detection on YouTube: a vertical video <= 60s is shown as
    // a Short. The selector already enforces vertical for `youtube_shorts`,
    // so the same upload endpoint works for both.
    const tagList = input.hashtags
      ? input.hashtags.split(/[\s,]+/).map(t => t.replace(/^#/, "")).filter(Boolean)
      : undefined;
    const result = await uploadVideoToYouTube(input.tokens, {
      videoUrl: input.videoUrl,
      title: input.title,
      description: input.caption,
      tags: tagList,
      privacyStatus: input.privacyStatus ?? "private",
    });
    return {
      externalId: result.videoId,
      externalUrl: result.url,
      refreshedTokens: result.refreshedTokens,
    };
  }

  // TikTok / Instagram are not wired yet. Throwing instead of returning a
  // fake id makes the post row clearly fail (status=failed, errorMessage set)
  // rather than misleadingly read as "published" in the UI.
  throw new Error(
    `${input.platform} publishing is not yet implemented. YouTube is currently the only supported platform; TikTok and Instagram require their OAuth + upload integrations to be wired.`,
  );
}
