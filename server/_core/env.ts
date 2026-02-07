export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
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
  // QuickBooks OAuth configuration
  quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID ?? "",
  quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
  quickbooksRedirectUri: process.env.QUICKBOOKS_REDIRECT_URI ?? "",
  quickbooksEnvironment: process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox", // sandbox or production
  // Shopify OAuth configuration
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID ?? "",
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
  shopifyRedirectUri: process.env.SHOPIFY_REDIRECT_URI ?? "",
};

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
