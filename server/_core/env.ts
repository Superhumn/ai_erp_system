function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET must be set to at least 32 characters in production. Generate one with: openssl rand -hex 32");
    }
    const fallback = "dev-only-jwt-secret-not-for-production-use!!";
    if (!secret) {
        console.warn("[Auth] JWT_SECRET not set — using insecure dev fallback. Set JWT_SECRET in .env for production.");
    } else {
        console.warn("[Auth] JWT_SECRET is shorter than 32 characters — using insecure dev fallback.");
    }
    return fallback;
}

export const ENV = {
    appId: process.env.VITE_APP_ID || "ai_erp_system",
    cookieSecret: getJwtSecret(),
    databaseUrl: process.env.DATABASE_URL ?? "",
    oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
    ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
    isProduction: process.env.NODE_ENV === "production",

    // LLM Configuration (Anthropic Claude)
    llmProvider: process.env.LLM_PROVIDER ?? "anthropic",
    llmApiUrl: process.env.LLM_API_URL ?? "",
    llmApiKey: process.env.LLM_API_KEY ?? "",
    llmModel: process.env.LLM_MODEL ?? "claude-sonnet-4-20250514",

    // SendGrid email configuration
    sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
    sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? "",  // MAIL_FROM - e.g., quotes@yourdomain.com
    sendgridReplyTo: process.env.SENDGRID_REPLY_TO ?? "",      // REPLY_TO - optional reply-to address
    sendgridWebhookSecret: process.env.SENDGRID_WEBHOOK_SECRET ?? "", // For webhook signature verification

    // Public app URL for email links
    publicAppUrl: process.env.PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000",

    // IMAP email inbox configuration
    imapHost: process.env.IMAP_HOST ?? "",
    imapPort: process.env.IMAP_PORT ?? "993",
    imapUser: process.env.IMAP_USER ?? "",
    imapPassword: process.env.IMAP_PASSWORD ?? "",

    // Google OAuth configuration
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
    appUrl: process.env.APP_URL ?? "http://localhost:3000",

    // Google Service Account (for reading private Drive folders shared with the
    // service account directly, bypassing per-user OAuth). Either provide the
    // whole JSON key via GOOGLE_SERVICE_ACCOUNT_JSON, or the email + private key
    // pair. Private key literal newlines may be escaped as "\n".
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    googleServiceAccountPrivateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "",

    // QuickBooks OAuth configuration
    quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID ?? "",
    quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
    quickbooksRedirectUri: process.env.QUICKBOOKS_REDIRECT_URI ?? "",
    quickbooksEnvironment: process.env.QUICKBOOKS_ENVIRONMENT ?? "production", // sandbox or production

    // Shopify OAuth configuration
    shopifyClientId: process.env.SHOPIFY_CLIENT_ID ?? "",
    shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    shopifyRedirectUri: process.env.SHOPIFY_REDIRECT_URI ?? "",

    // Twilio voice/SMS configuration
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ?? "",

    // Forge API (image generation, voice, maps, notifications)
    forgeApiUrl: process.env.FORGE_API_URL ?? "",
    forgeApiKey: process.env.FORGE_API_KEY ?? "",

    // AWS S3 (file storage fallback when Forge API is not configured)
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    awsS3Bucket: process.env.AWS_S3_BUCKET ?? "",

    // Cloudflare R2 (S3-compatible storage; takes priority over S3 and Forge when configured)
    r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    r2Bucket: process.env.R2_BUCKET ?? "",
    // Optional: set to your bucket's public URL or custom domain (e.g. https://assets.example.com).
    // When set, returned URLs point directly to R2 instead of using presigned GET URLs.
    r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",

    // Airtable integration
    airtablePersonalAccessToken: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN ?? "",

    // CRM deduplication: set to "true" on the first deploy that includes
    // migration 0035 so the app merges existing duplicates *before* the
    // UNIQUE indexes are created. After migration 0035 is applied, unset
    // or set to "false" to avoid the full-table scan on every boot.
    crmDedupOnStartup: process.env.CRM_DEDUP_ON_STARTUP === "true",

    // Ayrshare social media aggregator
    ayrshareApiKey: process.env.AYRSHARE_API_KEY ?? "",
};

/**
 * Validate critical environment variables at startup
 */
export function validateCriticalConfig(): void {
  const INSECURE_DEFAULTS = ["your-secret-key-here-min-32-chars", "changeme", "secret"];
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32 || INSECURE_DEFAULTS.includes(ENV.cookieSecret)) {
    if (ENV.isProduction) {
      throw new Error("CRITICAL: JWT_SECRET must be a secure random value of at least 32 characters in production");
    }
    console.warn("[Security] WARNING: JWT_SECRET is weak or uses a default value. Generate a secure random value for production.");
  }
}

/**
 * Validate required environment variables for production
 * Call this at startup to fail fast if critical config is missing
 */
export function validateEmailConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

  if (ENV.isProduction) {
        if (!ENV.sendgridApiKey) {
                errors.push("SENDGRID_API_KEY is required in production");
        }
        if (!ENV.sendgridFromEmail) {
                errors.push("SENDGRID_FROM_EMAIL (MAIL_FROM) is required in production");
        }
        if (!ENV.publicAppUrl || ENV.publicAppUrl === "http://localhost:3000") {
                errors.push("PUBLIC_APP_URL is required in production for email links");
        }
  }

  // Validate email format if provided
  if (ENV.sendgridFromEmail && !isValidEmail(ENV.sendgridFromEmail)) {
        errors.push(`SENDGRID_FROM_EMAIL "${ENV.sendgridFromEmail}" is not a valid email address`);
  }

  if (ENV.sendgridReplyTo && !isValidEmail(ENV.sendgridReplyTo)) {
        errors.push(`SENDGRID_REPLY_TO "${ENV.sendgridReplyTo}" is not a valid email address`);
  }

  return { valid: errors.length === 0, errors };
}

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Check if SendGrid is fully configured for transactional emails
 */
export function isTransactionalEmailReady(): boolean {
    return !!(ENV.sendgridApiKey && ENV.sendgridFromEmail);
}

/**
 * Validate critical secrets at startup. Throws in production if
 * required secrets are missing so the process fails fast.
 */
export function validateRequiredSecrets(): void {
  if (!ENV.isProduction) return;

  const missing: string[] = [];
  if (!ENV.cookieSecret) missing.push("JWT_SECRET");
  if (!ENV.databaseUrl) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required secrets in production: ${missing.join(", ")}. ` +
      `The server cannot start without these environment variables.`
    );
  }
}
