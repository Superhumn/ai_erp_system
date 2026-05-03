/**
 * Google Chat API Integration
 * OAuth helper for connecting a user's Google account with Chat scopes.
 */

import { ENV } from "./env";
import { createSignedOAuthState } from "./crypto";

/**
 * Get OAuth URL for Google Chat access.
 * Requests the chat.messages scope plus userinfo.email so we can identify the
 * connected account. The redirect lands on /api/oauth/google/callback, which
 * is the shared Google OAuth callback that exchanges the code and persists
 * the tokens via upsertGoogleOAuthToken.
 */
export function getGoogleChatAuthUrl(userId: number, returnTo?: string): string {
  const clientId = ENV.googleClientId;
  const redirectUri =
    ENV.googleRedirectUri ||
    `${process.env.VITE_APP_URL || ENV.appUrl}/api/oauth/google/callback`;

  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/chat.messages " +
      "https://www.googleapis.com/auth/userinfo.email"
  );

  const statePayload: Record<string, unknown> = { userId, provider: "google" };
  if (returnTo) statePayload.returnTo = returnTo;
  const state = createSignedOAuthState(statePayload);

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
}
