/**
 * Social provider adapter. Ayrshare is the v1 aggregator because one API covers
 * LinkedIn / X / Meta / IG / TikTok and it handles OAuth + rate limits for us.
 * When AYRSHARE_API_KEY is absent every method becomes a safe no-op so dev and
 * CI never depend on the network.
 */
import { ENV } from "./_core/env";


export type SocialPlatform =
  | "linkedin"
  | "twitter"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "threads";

export interface ScheduleInput {
  body: string;
  mediaUrls?: string[];
  platforms: SocialPlatform[];
  scheduledAt?: Date;
  profileKey?: string;
}

export interface ScheduleResult {
  ok: boolean;
  providerPostId?: string;
  perPlatform?: Record<string, { id: string; permalink?: string }>;
  error?: string;
  simulated?: boolean;
}

export interface EngagementFetchResult {
  ok: boolean;
  items: Array<{
    platform: SocialPlatform;
    externalId: string;
    type: "like" | "comment" | "share" | "mention" | "dm" | "reaction";
    authorHandle?: string;
    authorName?: string;
    body?: string;
    permalink?: string;
    occurredAt?: Date;
  }>;
  simulated?: boolean;
  error?: string;
}

export interface MetricsFetchResult {
  ok: boolean;
  items: Array<{
    platform: SocialPlatform;
    impressions?: number;
    reach?: number;
    clicks?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    videoViews?: number;
  }>;
  simulated?: boolean;
  error?: string;
}

const API_BASE = "https://app.ayrshare.com/api";

function apiKey(): string | undefined {
  const key = ENV.ayrshareApiKey
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export function isSocialProviderConfigured(): boolean {
  return Boolean(apiKey());
}

async function ayrshare(path: string, init: RequestInit) {
  const key = apiKey();
  if (!key) throw new Error("AYRSHARE_API_KEY not set");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Ayrshare ${path} ${res.status}: ${data?.message ?? text}`);
  }
  return data;
}

export async function schedulePost(input: ScheduleInput): Promise<ScheduleResult> {
  if (!isSocialProviderConfigured()) {
    return {
      ok: true,
      simulated: true,
      providerPostId: `sim_${Date.now()}`,
      perPlatform: Object.fromEntries(
        input.platforms.map((p) => [p, { id: `sim_${p}_${Date.now()}` }]),
      ),
    };
  }

  try {
    const payload: Record<string, unknown> = {
      post: input.body,
      platforms: input.platforms,
    };
    if (input.mediaUrls?.length) payload.mediaUrls = input.mediaUrls;
    if (input.scheduledAt) payload.scheduleDate = input.scheduledAt.toISOString();
    if (input.profileKey) payload.profileKey = input.profileKey;

    const data = await ayrshare("/post", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const perPlatform: Record<string, { id: string; permalink?: string }> = {};
    for (const entry of data?.postIds ?? []) {
      if (entry?.platform && entry?.id) {
        perPlatform[entry.platform] = { id: entry.id, permalink: entry.postUrl };
      }
    }

    return { ok: true, providerPostId: data?.id, perPlatform };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function fetchEngagement(
  externalPostIds: string[],
  platform?: SocialPlatform,
): Promise<EngagementFetchResult> {
  if (!isSocialProviderConfigured()) {
    return { ok: true, items: [], simulated: true };
  }
  if (externalPostIds.length === 0) return { ok: true, items: [] };

  try {
    const results: EngagementFetchResult["items"] = [];
    for (const id of externalPostIds) {
      const data = await ayrshare(`/comments/${encodeURIComponent(id)}`, {
        method: "GET",
      });
      for (const c of data?.comments ?? []) {
        results.push({
          platform: (c.platform ?? platform ?? "linkedin") as SocialPlatform,
          externalId: c.commentId ?? c.id,
          type: "comment",
          authorHandle: c.authorUsername,
          authorName: c.authorName,
          body: c.text ?? c.comment,
          permalink: c.permalink,
          occurredAt: c.created ? new Date(c.created) : undefined,
        });
      }
    }
    return { ok: true, items: results };
  } catch (err: any) {
    return { ok: false, items: [], error: err?.message ?? String(err) };
  }
}

export async function fetchMetrics(externalPostId: string): Promise<MetricsFetchResult> {
  if (!isSocialProviderConfigured()) {
    return { ok: true, items: [], simulated: true };
  }

  try {
    const data = await ayrshare(`/analytics/post`, {
      method: "POST",
      body: JSON.stringify({ id: externalPostId }),
    });
    const items: MetricsFetchResult["items"] = [];
    for (const key of Object.keys(data ?? {})) {
      const p = data[key];
      if (!p || typeof p !== "object") continue;
      items.push({
        platform: key as SocialPlatform,
        impressions: p.impressions ?? p.views,
        reach: p.reach,
        clicks: p.clicks ?? p.linkClicks,
        likes: p.likes ?? p.reactions,
        comments: p.comments,
        shares: p.shares,
        saves: p.saves,
        videoViews: p.videoViews,
      });
    }
    return { ok: true, items };
  } catch (err: any) {
    return { ok: false, items: [], error: err?.message ?? String(err) };
  }
}
