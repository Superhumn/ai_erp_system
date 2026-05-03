// YouTube Data API v3 — video upload and OAuth token refresh.
//
// Uses the resumable upload protocol so large files don't need to be buffered
// in memory:
//   1. POST snippet+status JSON to /upload/youtube/v3/videos?uploadType=resumable
//   2. Server responds with a Location header (the upload session URL).
//   3. Stream the video bytes via PUT to that URL.
//
// Auth: Google access tokens expire in ~1h. We refresh on demand using the
// stored refresh token, and surface the new pair so the caller can persist it.
//
// Docs: https://developers.google.com/youtube/v3/guides/uploading_a_video

import { ENV } from "./env";
import { createSignedOAuthState } from "./crypto";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

const YT_REDIRECT_PATH = "/api/oauth/youtube/callback";

// SSRF guard. Rejects URLs that aren't http(s), and resolves the hostname to
// confirm it isn't a loopback / link-local / private / cloud-metadata address.
// Called before any server-initiated fetch of a user-provided video URL.
async function assertSafeRemoteUrl(raw: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error(`Invalid video URL: ${raw}`); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Video URL must use http(s): ${raw}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Video URL must not contain credentials.");
  }
  // Resolve host to all A/AAAA records. If hostname is already an IP literal,
  // dns.lookup just returns it unchanged.
  const host = parsed.hostname;
  const records = isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  for (const r of records) {
    if (isPrivateAddress(r.address)) {
      throw new Error(`Video URL resolves to a non-public address (${r.address}). Use a public CDN.`);
    }
  }
}

function isPrivateAddress(ip: string): boolean {
  if (!ip) return true;
  // IPv6 loopback / link-local / unique-local / IPv4-mapped private
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("::ffff:")) return isPrivateAddress(ip.slice(7));
  // IPv4
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. AWS/GCP metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function youtubeRedirectUri(): string {
  const base = process.env.VITE_APP_URL || ENV.appUrl || "http://localhost:3000";
  return `${base}${YT_REDIRECT_PATH}`;
}

// Build the consent URL for the YouTube upload scope. We request offline
// access + prompt=consent so we always receive a refresh token (Google omits
// it on subsequent grants otherwise).
export function getYouTubeAuthUrl(userId: number): string {
  if (!ENV.googleClientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
  const scope = encodeURIComponent("https://www.googleapis.com/auth/youtube.upload");
  const state = createSignedOAuthState({ userId, provider: "youtube" });
  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  // URLSearchParams encodes scope; keep our pre-encoded version since Google
  // accepts either, and this matches the existing google* helpers in this file's siblings.
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}&scope=${scope}`;
}

// Exchange an authorization code for tokens. Used by the OAuth callback.
export async function exchangeYouTubeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  if (!ENV.googleClientId || !ENV.googleClientSecret) {
    throw new Error("Google OAuth client not configured.");
  }
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: youtubeRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube code exchange failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke the app at https://myaccount.google.com/permissions and try connecting again.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

// Fetches the connected channel's handle so we can show "@superhumn" rather
// than a bare "Connected" label. Failure is non-fatal — we just skip the handle.
export async function fetchYouTubeChannel(accessToken: string): Promise<{ id: string; handle: string | null } | null> {
  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }> };
    const item = data.items?.[0];
    if (!item) return null;
    return { id: item.id, handle: item.snippet?.customUrl ?? item.snippet?.title ?? null };
  } catch {
    return null;
  }
}

export interface YouTubeUploadInput {
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  // YouTube category id. 22 = "People & Blogs", a safe default for marketing.
  categoryId?: string;
  // "public" surfaces immediately. Use "private" or "unlisted" for staged rollouts.
  privacyStatus?: "public" | "unlisted" | "private";
  // Marks the video as kid-content (COPPA). Marketing content is virtually
  // never made-for-kids — leaving this as false matches the typical case.
  madeForKids?: boolean;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Refreshes a Google access token using the stored refresh token. Google
// reuses the same refresh token, so callers should keep the existing one if
// the response omits a new one.
export async function refreshYouTubeToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
}> {
  const clientId = ENV.googleClientId;
  const clientSecret = ENV.googleClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  }
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube token refresh failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    refreshToken: data.refresh_token,
  };
}

// Returns a usable access token, refreshing if the stored one has expired or
// is within a 60s buffer. The caller is responsible for persisting any
// updated tokens returned in the second tuple element.
export async function ensureYouTubeAccessToken(tokens: OAuthTokens): Promise<{
  accessToken: string;
  refreshed: { accessToken: string; refreshToken?: string; expiresAt: Date } | null;
}> {
  const expiresSoon = tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon && tokens.accessToken) {
    return { accessToken: tokens.accessToken, refreshed: null };
  }
  if (!tokens.refreshToken) {
    if (tokens.accessToken) return { accessToken: tokens.accessToken, refreshed: null };
    throw new Error("YouTube credentials expired and no refresh token available. Reconnect the account.");
  }
  const refreshed = await refreshYouTubeToken(tokens.refreshToken);
  return { accessToken: refreshed.accessToken, refreshed };
}

export async function uploadVideoToYouTube(
  tokens: OAuthTokens,
  input: YouTubeUploadInput,
): Promise<YouTubeUploadResult & { refreshedTokens: OAuthTokens | null }> {
  // Reject anything that isn't a public http(s) URL pointing at a non-private
  // host. Without this, a user could supply http://169.254.169.254/... or a
  // file:// scheme and force the server to fetch internal metadata.
  await assertSafeRemoteUrl(input.videoUrl);

  const { accessToken, refreshed } = await ensureYouTubeAccessToken(tokens);

  // Step 1: figure out content length so we can announce it for the resumable
  // session. HEAD lets us avoid downloading the full file twice.
  const head = await fetch(input.videoUrl, { method: "HEAD" });
  if (!head.ok) {
    throw new Error(`Could not access video URL (${head.status}): ${input.videoUrl}`);
  }
  const contentType = head.headers.get("content-type") ?? "video/mp4";
  const contentLengthHeader = head.headers.get("content-length");
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

  const metadata = {
    snippet: {
      title: input.title.slice(0, 100),
      description: (input.description ?? "").slice(0, 5000),
      tags: input.tags?.slice(0, 30),
      categoryId: input.categoryId ?? "22",
    },
    status: {
      privacyStatus: input.privacyStatus ?? "private",
      selfDeclaredMadeForKids: input.madeForKids ?? false,
      embeddable: true,
    },
  };

  // Step 2: start the resumable session.
  const initRes = await fetch(`${UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      ...(contentLength ? { "X-Upload-Content-Length": String(contentLength) } : {}),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`YouTube upload init failed (${initRes.status}): ${text}`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return an upload session URL.");

  // Step 3: stream the video bytes into the session.
  const videoRes = await fetch(input.videoUrl);
  if (!videoRes.ok || !videoRes.body) {
    throw new Error(`Failed to fetch video for upload (${videoRes.status}): ${input.videoUrl}`);
  }
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
    body: videoRes.body,
    // @ts-expect-error: undici-specific option; required for streaming bodies under fetch.
    duplex: "half",
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`YouTube upload PUT failed (${putRes.status}): ${text}`);
  }
  const result = await putRes.json() as { id: string };
  if (!result.id) throw new Error("YouTube upload returned no video id.");

  return {
    videoId: result.id,
    url: `https://www.youtube.com/watch?v=${result.id}`,
    refreshedTokens: refreshed
      ? {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
          expiresAt: refreshed.expiresAt,
        }
      : null,
  };
}
