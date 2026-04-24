/**
 * Google service account authentication for Drive API.
 *
 * Lets the server read private Drive folders that are shared with the service
 * account's email, without making them public and without depending on a
 * user's OAuth grant. Used as a fallback when user-OAuth returns 403.
 *
 * Configure via GOOGLE_SERVICE_ACCOUNT_JSON (full key JSON) or the
 * GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY pair.
 */

import { createSign } from "node:crypto";
import { ENV } from "./env";

interface ServiceAccountKey {
  clientEmail: string;
  privateKey: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let parsedKey: ServiceAccountKey | null | undefined;
let cachedToken: CachedToken | null = null;
let inFlight: Promise<string | null> | null = null;

function parseKey(): ServiceAccountKey | null {
  if (parsedKey !== undefined) return parsedKey;

  if (ENV.googleServiceAccountJson) {
    try {
      const raw = JSON.parse(ENV.googleServiceAccountJson);
      if (raw.client_email && raw.private_key) {
        parsedKey = {
          clientEmail: raw.client_email,
          privateKey: String(raw.private_key).replace(/\\n/g, "\n"),
        };
        return parsedKey;
      }
      console.warn("[GoogleServiceAccount] GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
    } catch (err) {
      console.warn("[GoogleServiceAccount] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:", (err as Error).message);
    }
  }

  if (ENV.googleServiceAccountEmail && ENV.googleServiceAccountPrivateKey) {
    parsedKey = {
      clientEmail: ENV.googleServiceAccountEmail,
      privateKey: ENV.googleServiceAccountPrivateKey.replace(/\\n/g, "\n"),
    };
    return parsedKey;
  }

  parsedKey = null;
  return null;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function isServiceAccountConfigured(): boolean {
  return parseKey() !== null;
}

export function getServiceAccountEmail(): string | null {
  return parseKey()?.clientEmail ?? null;
}

async function requestAccessToken(key: ServiceAccountKey): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: key.clientEmail,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  let signature: string;
  try {
    signature = base64url(signer.sign(key.privateKey));
  } catch (err) {
    console.error("[GoogleServiceAccount] Failed to sign JWT — check the private key format:", (err as Error).message);
    return null;
  }

  const assertion = `${signingInput}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[GoogleServiceAccount] Token request failed:", response.status, body);
    return null;
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    console.error("[GoogleServiceAccount] Token response missing access_token");
    return null;
  }

  const expiresIn = data.expires_in ?? 3600;
  cachedToken = { token: data.access_token, expiresAt: now + expiresIn };
  return data.access_token;
}

/**
 * Returns a valid service-account access token, minting a new one when needed.
 * Returns null when no service account is configured or token acquisition fails.
 */
export async function getServiceAccountAccessToken(): Promise<string | null> {
  const key = parseKey();
  if (!key) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  if (inFlight) return inFlight;
  inFlight = requestAccessToken(key).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
