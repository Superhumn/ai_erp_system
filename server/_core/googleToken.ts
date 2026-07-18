/**
 * Reusable Google OAuth access-token retrieval (refreshes if expired).
 *
 * Mirrors the logic used inline in server/routers.ts (getValidGoogleToken /
 * refreshGoogleToken) but lives in a small importable module so background jobs
 * — e.g. the Thread Follow-Up workflow's Gmail in-thread reply — can obtain a
 * valid token for a given user without pulling in the router monolith.
 */
import { getGoogleOAuthToken, upsertGoogleOAuthToken } from "../db/auth";

export async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ accessToken?: string; expiresAt?: Date; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: "Google OAuth not configured" };

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) {
      console.error("[Google OAuth] Failed to refresh token:", await response.text());
      return { error: "Failed to refresh token" };
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  } catch (error: any) {
    console.error("[Google OAuth] Error refreshing token:", error);
    return { error: error?.message ?? "unknown" };
  }
}

/** Get a valid Google access token for a user, refreshing if it has expired. */
export async function getValidGoogleAccessToken(
  userId: number,
): Promise<{ accessToken: string; error?: string }> {
  const token = await getGoogleOAuthToken(userId);
  if (!token) return { accessToken: "", error: "Google account not connected" };

  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    if (!token.refreshToken) {
      return { accessToken: "", error: "Google token has expired. Please reconnect your Google account." };
    }
    const refreshed = await refreshGoogleToken(token.refreshToken);
    if (refreshed.accessToken && refreshed.expiresAt) {
      await upsertGoogleOAuthToken({
        userId,
        accessToken: refreshed.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: refreshed.expiresAt,
        googleEmail: token.googleEmail,
      });
      return { accessToken: refreshed.accessToken };
    }
    return { accessToken: "", error: refreshed.error || "Failed to refresh token" };
  }
  return { accessToken: token.accessToken };
}
