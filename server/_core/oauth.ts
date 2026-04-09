import type { Express } from "express";

/**
 * OAuth route registration placeholder.
 * Email/password login and registration are handled by localAuth.ts.
 * Third-party OAuth callbacks (Google, QuickBooks, Shopify) are registered
 * directly in index.ts.
 */
export function registerOAuthRoutes(_app: Express) {
  // No-op: local auth routes in localAuth.ts handle login/register.
  // Third-party OAuth callbacks are registered in index.ts.
}
