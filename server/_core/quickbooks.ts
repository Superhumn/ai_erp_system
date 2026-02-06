/**
 * QuickBooks Online API Integration
 * Handles OAuth authentication and API interactions with QuickBooks
 */

import { ENV } from "./env";
import crypto from "crypto";

const QB_OAUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";
const QB_SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com/v3/company";

// OAuth state management (in-memory for now, could be moved to Redis/DB)
const oauthStates = new Map<string, { userId: number; timestamp: number }>();

// Clean up expired states (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  const tenMinutesAgo = now - 10 * 60 * 1000;
  for (const [state, data] of oauthStates.entries()) {
    if (data.timestamp < tenMinutesAgo) {
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

/**
 * Get QuickBooks OAuth authorization URL
 */
export function getQuickBooksAuthUrl(userId: number): { url?: string; error?: string } {
  const clientId = ENV.quickbooksClientId;
  const redirectUri = ENV.quickbooksRedirectUri || `${ENV.appUrl}/api/oauth/quickbooks/callback`;
  
  if (!clientId) {
    return {
      error: "QuickBooks integration is not configured. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in Settings → Secrets."
    };
  }
  
  // Generate state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");
  oauthStates.set(state, { userId, timestamp: Date.now() });
  
  // QuickBooks OAuth scopes
  const scope = encodeURIComponent("com.intuit.quickbooks.accounting");
  
  const url = `${QB_OAUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
  
  return { url };
}

/**
 * Validate OAuth state parameter
 */
export function validateOAuthState(state: string): { userId?: number; error?: string } {
  const stateData = oauthStates.get(state);
  
  if (!stateData) {
    return { error: "Invalid or expired OAuth state" };
  }
  
  // Check if state is too old (10 minutes)
  const now = Date.now();
  const tenMinutesAgo = now - 10 * 60 * 1000;
  if (stateData.timestamp < tenMinutesAgo) {
    oauthStates.delete(state);
    return { error: "OAuth state expired" };
  }
  
  // Clean up the state after validation
  oauthStates.delete(state);
  
  return { userId: stateData.userId };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  realmId?: string;
  error?: string;
}> {
  const clientId = ENV.quickbooksClientId;
  const clientSecret = ENV.quickbooksClientSecret;
  const redirectUri = ENV.quickbooksRedirectUri || `${ENV.appUrl}/api/oauth/quickbooks/callback`;
  
  if (!clientId || !clientSecret) {
    return { error: "QuickBooks credentials not configured" };
  }
  
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  
  // Create Basic Auth header
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("QuickBooks token exchange failed:", error);
      return { error: "Failed to exchange authorization code for token" };
    }
    
    const data = await response.json();
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    };
  } catch (error: any) {
    console.error("QuickBooks token exchange error:", error);
    return { error: error.message || "Token exchange failed" };
  }
}

/**
 * Refresh QuickBooks access token
 */
export async function refreshQuickBooksToken(refreshToken: string): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}> {
  const clientId = ENV.quickbooksClientId;
  const clientSecret = ENV.quickbooksClientSecret;
  
  if (!clientId || !clientSecret) {
    return { error: "QuickBooks credentials not configured" };
  }
  
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("QuickBooks token refresh failed:", error);
      return { error: "Failed to refresh token" };
    }
    
    const data = await response.json();
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  } catch (error: any) {
    console.error("QuickBooks token refresh error:", error);
    return { error: error.message || "Token refresh failed" };
  }
}

/**
 * Make an authenticated API request to QuickBooks
 */
export async function makeQuickBooksRequest(
  accessToken: string,
  realmId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: any; error?: string }> {
  const apiBase = ENV.quickbooksEnvironment === "production" ? QB_API_BASE : QB_SANDBOX_API_BASE;
  const url = `${apiBase}/${realmId}/${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("QuickBooks API request failed:", error);
      return { error: `API request failed: ${response.statusText}` };
    }
    
    const data = await response.json();
    return { data };
  } catch (error: any) {
    console.error("QuickBooks API request error:", error);
    return { error: error.message || "API request failed" };
  }
}

/**
 * Get QuickBooks company info (useful for testing connection)
 */
export async function getCompanyInfo(accessToken: string, realmId: string) {
  return makeQuickBooksRequest(accessToken, realmId, "companyinfo/" + realmId);
}
