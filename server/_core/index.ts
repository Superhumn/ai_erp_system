import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "./localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV, validateEmailConfig, validateCriticalConfig } from "./env";
import * as sendgridProvider from "./sendgridProvider";
import * as emailService from "./emailService";
import * as db from "../db";
import { startEmailQueueWorker } from "../emailQueueWorker";
import { startOrchestrator } from "../supplyChainOrchestrator";
import { startScheduler } from "../aiAgentScheduler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateCriticalConfig();

  const emailConfigValidation = validateEmailConfig();
  if (!emailConfigValidation.valid) {
    console.warn("[Email Config] Warning: Some email configuration is missing:");
    emailConfigValidation.errors.forEach(err => console.warn(`  - ${err}`));
    console.warn("[Email Config] Email features will be disabled until configuration is provided.");
  }

  const app = express();
  const server = createServer(app);

  // ============================================
  // SECURITY HEADERS
  // ============================================
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // ============================================
  // RATE LIMITING
  // ============================================
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
  const RATE_LIMIT_MAX = 200; // requests per window

  app.use("/api/", (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
      return next();
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetTime - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    next();
  });

  // Periodically clean up stale rate limit entries
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetTime) rateLimitMap.delete(ip);
    }
  }, RATE_LIMIT_WINDOW_MS);

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const oauthCallbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Local authentication endpoints (email/password)
  registerLocalAuthRoutes(app);
  
  // OAuth callback under /api/oauth/callback (for legacy/external OAuth)
  registerOAuthRoutes(app);

  // SendGrid webhook
  app.post('/webhooks/sendgrid/events', webhookLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const rawBody = req.body.toString();
      if (ENV.sendgridWebhookSecret) {
        const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
        const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
        if (!signature || !timestamp) {
          return res.status(401).json({ error: 'Missing signature headers' });
        }
        const isValid = sendgridProvider.verifyWebhookSignature(ENV.sendgridWebhookSecret, rawBody, signature, timestamp);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      let events: any[];
      try {
        events = JSON.parse(rawBody);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      if (!Array.isArray(events)) events = [events];
      for (const event of events) {
        try {
          const providerEventType = event.event;
          const providerMessageId = event.sg_message_id?.split('.')[0];
          const email = event.email;
          const timestamp = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
          const emailEvent = await db.createEmailEvent({ providerEventType, providerMessageId, providerTimestamp: timestamp, rawEventJson: event, email, reason: event.reason || event.response || null, bounceType: event.type || null, processedAt: new Date() });
          if (providerMessageId) {
            const message = await db.getEmailMessageByProviderMessageId(providerMessageId);
            if (message) {
              await db.createEmailEvent({ ...emailEvent, emailMessageId: message.id });
              const newStatus = sendgridProvider.mapEventToStatus(providerEventType);
              if (newStatus) await db.updateEmailMessageStatus(message.id, newStatus);
            }
          }
        } catch (eventError) {
          console.error('[SendGrid Webhook] Error processing event:', eventError);
        }
      }
      res.status(200).json({ received: events.length });
    } catch (error) {
      console.error('[SendGrid Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Shopify webhooks
  const handleShopifyWebhook = async (req: any, res: any) => {
    try {
      const rawBody = req.body.toString();
      const { processShopifyWebhook } = await import('./shopify');
      const result = await processShopifyWebhook(rawBody, {
        hmac: req.headers['x-shopify-hmac-sha256'] as string,
        shopDomain: req.headers['x-shopify-shop-domain'] as string,
        topic: req.headers['x-shopify-topic'] as string,
      });
      if (!result.shouldProcess) {
        if (result.error === 'Already processed') return res.status(200).json({ success: true, message: 'Already processed' });
        return res.status(result.error === 'Invalid signature' ? 401 : 400).json({ error: result.error });
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Shopify Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  app.post('/webhooks/shopify/orders', express.raw({ type: 'application/json' }), handleShopifyWebhook);
  app.post('/webhooks/shopify/inventory', express.raw({ type: 'application/json' }), handleShopifyWebhook);

  // ============================================
  // EDI WEBHOOK ENDPOINT
  // ============================================

  app.post('/webhooks/edi/inbound', express.raw({ type: ['application/edi-x12', 'text/plain', 'application/octet-stream'] }), async (req, res) => {
    try {
      const { handleEdiWebhook } = await import('../ediTransportService');
      const rawContent = req.body.toString();

      if (!rawContent || rawContent.trim().length === 0) {
        return res.status(400).json({ error: 'Empty EDI content' });
      }

      const senderIsaId = req.headers['x-edi-sender-id'] as string | undefined;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }

      const result = await handleEdiWebhook(rawContent, senderIsaId, headers);

      if (result.success) {
        console.log(`[EDI Webhook] Processed inbound document, transaction ID: ${result.transactionId}`);
        res.status(200).json(result);
      } else {
        console.warn(`[EDI Webhook] Processing failed: ${result.message}`);
        res.status(422).json(result);
      }
    } catch (error) {
      console.error('[EDI Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Google OAuth callback
  app.get('/api/google/callback', oauthCallbackLimiter, async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) return res.redirect('/import?error=missing_params');
    const userId = parseInt(state as string, 10);
    if (isNaN(userId) || userId <= 0) return res.redirect('/import?error=invalid_state');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect('/import?error=not_configured');
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: code as string, grant_type: 'authorization_code', redirect_uri: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/google/callback` }),
      });
      if (!tokenResponse.ok) return res.redirect('/import?error=token_exchange_failed');
      const tokens = await tokenResponse.json();
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      let googleEmail = null;
      if (userInfoResponse.ok) { const userInfo = await userInfoResponse.json(); googleEmail = userInfo.email; }
      const { upsertGoogleOAuthToken } = await import('../db');
      await upsertGoogleOAuthToken({ userId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000), scope: tokens.scope, googleEmail });
      res.redirect('/import?success=connected');
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.redirect('/import?error=oauth_failed');
    }
  });

  // Shopify OAuth callback
  app.get('/api/shopify/callback', oauthCallbackLimiter, async (req, res) => {
    const { code, shop, state } = req.query;
    if (!code || !shop || !state) return res.redirect('/settings/integrations?shopify_error=missing_params');
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect('/settings/integrations?shopify_error=not_configured');
    try {
      const { sdk } = await import('./sdk');
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.redirect('/settings/integrations?shopify_error=not_authenticated'); }
      if (!user) return res.redirect('/settings/integrations?shopify_error=not_authenticated');
      const stateParts = (state as string).split(':');
      if (stateParts.length < 4) return res.redirect('/settings/integrations?shopify_error=invalid_state');
      const stateUserId = parseInt(stateParts[0]);
      const stateCompanyId = stateParts[1] !== 'undefined' ? parseInt(stateParts[1]) : undefined;
      const stateShop = stateParts[2];
      const stateTimestamp = parseInt(stateParts[3]);
      if (stateUserId !== user.id) return res.redirect('/settings/integrations?shopify_error=user_mismatch');
      if (user.companyId && stateCompanyId !== user.companyId) return res.redirect('/settings/integrations?shopify_error=company_mismatch');
      let shopDomain = (shop as string).trim().toLowerCase();
      if (!shopDomain.endsWith('.myshopify.com')) return res.redirect('/settings/integrations?shopify_error=invalid_domain');
      if (stateShop !== shopDomain) return res.redirect('/settings/integrations?shopify_error=shop_mismatch');
      if (Date.now() - stateTimestamp > 10 * 60 * 1000) return res.redirect('/settings/integrations?shopify_error=state_expired');
      const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code as string }) });
      if (!tokenResponse.ok) return res.redirect('/settings/integrations?shopify_error=token_exchange_failed');
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } });
      if (!shopInfoResponse.ok) return res.redirect('/settings/integrations?shopify_error=failed_to_fetch_shop_info');
      const shopInfo = await shopInfoResponse.json();
      const { upsertShopifyStore, createSyncLog } = await import('../db');
      const { encrypt } = await import('../_core/crypto');
      const encryptedToken = encrypt(accessToken);
      await upsertShopifyStore(shopDomain, { companyId: user.companyId || undefined, storeDomain: shopDomain, storeName: shopInfo.shop.name || shopDomain, accessToken: encryptedToken, apiVersion: '2024-01', isEnabled: true, syncInventory: true, syncOrders: true, inventoryAuthority: 'hybrid' });
      await createSyncLog({ integration: 'shopify', action: 'store_connected', status: 'success', details: `Connected store: ${shopInfo.shop.name} (${shopDomain})` });
      res.redirect('/settings/integrations?shopify_success=connected&shop=' + encodeURIComponent(shopInfo.shop.name));
    } catch (error) {
      console.error('Shopify OAuth error:', error);
      res.redirect('/settings/integrations?shopify_error=oauth_failed');
    }
  });

  // QuickBooks OAuth callback
  app.get('/api/oauth/quickbooks/callback', oauthCallbackLimiter, async (req, res) => {
    const { code, state, realmId } = req.query;
    if (!code || !state || !realmId) return res.redirect('/settings/integrations?quickbooks_error=missing_params');
    try {
      const { sdk } = await import('./sdk');
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.redirect('/settings/integrations?quickbooks_error=not_authenticated'); }
      if (!user) return res.redirect('/settings/integrations?quickbooks_error=not_authenticated');
      const { validateOAuthState, exchangeCodeForToken } = await import('./quickbooks');
      const stateValidation = validateOAuthState(state as string);
      if (stateValidation.error || stateValidation.userId !== user.id) return res.redirect('/settings/integrations?quickbooks_error=invalid_state');
      const tokenResult = await exchangeCodeForToken(code as string);
      if (tokenResult.error) return res.redirect('/settings/integrations?quickbooks_error=token_exchange_failed');
      const { upsertQuickBooksOAuthToken, createSyncLog } = await import('../db');
      await upsertQuickBooksOAuthToken({ userId: user.id, accessToken: tokenResult.access_token!, refreshToken: tokenResult.refresh_token!, expiresAt: new Date(Date.now() + (tokenResult.expires_in! * 1000)), realmId: realmId as string, scope: 'com.intuit.quickbooks.accounting' });
      await createSyncLog({ integration: 'quickbooks', action: 'connected', status: 'success', details: `QuickBooks connected - Realm ID: ${realmId}` });
      res.redirect('/settings/integrations?quickbooks_success=connected');
    } catch (error) {
      console.error('QuickBooks OAuth error:', error);
      res.redirect('/settings/integrations?quickbooks_error=oauth_failed');
    }
  });

  // Health check endpoint for Railway and other deployment platforms
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // tRPC API
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startEmailQueueWorker();

    // Start EDI polling scheduler (check every 5 minutes)
    import('../ediTransportService').then(({ startEdiPolling }) => {
      startEdiPolling(5 * 60 * 1000);
    }).catch(err => {
      console.warn('[EDI Polling] Could not start polling scheduler:', err.message);
    });
    console.log("[Startup] Starting autonomous supply chain orchestrator...");
    startOrchestrator().catch(err => {
      console.error("[Startup] Failed to start orchestrator:", err);
      console.warn("[Startup] Server running in degraded mode - autonomous workflows disabled");
    });
    console.log("[Startup] Starting AI agent scheduler...");
    try {
      startScheduler();
    } catch (err) {
      console.error("[Startup] Failed to start AI agent scheduler:", err);
      console.warn("[Startup] Server running in degraded mode - AI agent automation disabled");
    }
  });
}

startServer().catch(console.error);
