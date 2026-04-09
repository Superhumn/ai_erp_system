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
import { createLogger } from "./logger";
import { initErrorTracking, captureException } from "./errorTracking";

const logger = createLogger("Server");

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
const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many OAuth callback requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

async function startServer() {
  await initErrorTracking();

  validateCriticalConfig();

  const emailConfigValidation = validateEmailConfig();
  if (!emailConfigValidation.valid) {
    logger.warn("Some email configuration is missing — email features will be disabled", {
      errors: emailConfigValidation.errors,
    });
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
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // ============================================
  // RATE LIMITING
  // ============================================
  const apiLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });

  app.use("/api/", apiLimiter);

  // CSRF protection: validate Origin header on state-changing requests
  app.use("/api/", (req, res, next) => {
    // Safe methods don't need CSRF protection
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const origin = req.headers.origin || req.headers.referer;
    if (!origin) {
      return res.status(403).json({ error: "Missing Origin header" });
    }

    // In production, validate origin matches our app URL
    if (ENV.isProduction && ENV.publicAppUrl) {
      try {
        const allowedHost = new URL(ENV.publicAppUrl).host;
        const requestHost = new URL(origin as string).host;
        if (requestHost !== allowedHost) {
          return res.status(403).json({ error: "Origin mismatch" });
        }
      } catch {
        return res.status(403).json({ error: "Invalid Origin header" });
      }
    }

    next();
  });

  // OAuth callback rate limiter is defined at module scope above

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Auth routes (login, register)
  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================
  // SENDGRID WEBHOOK ENDPOINT
  // ============================================
  app.post('/webhooks/sendgrid/events', express.raw({ type: 'application/json' }), async (req, res) => {
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
          const metadata = { reason: event.reason || event.response, bounceType: event.type };

          // Look up the linked message first to avoid inserting a bare row then a duplicate linked row
          const message = providerMessageId ? await db.getEmailMessageByProviderMessageId(providerMessageId) : null;

          // Insert a single event row, linking to the message when available
          await db.createEmailEvent({
            providerEventType,
            providerTimestamp: timestamp,
            providerMessageId,
            emailMessageId: message?.id,
            email,
            rawEventJson: metadata,
          } as any);

          if (message) {
            const newStatus = sendgridProvider.mapEventToStatus(providerEventType);
            if (newStatus) await db.updateEmailMessageStatus(message.id, newStatus);
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
  const handleShopifyWebhook = async (req: any, res: any, _topic?: string) => {
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

  app.post('/webhooks/shopify/orders', express.raw({ type: 'application/json' }), (req, res) =>
    handleShopifyWebhook(req, res)
  );

  app.post('/webhooks/shopify/inventory', express.raw({ type: 'application/json' }), (req, res) =>
    handleShopifyWebhook(req, res)
  );

  // ============================================
  // EDI WEBHOOK ENDPOINT
  // ============================================

  // EDI webhook API key authentication middleware
  app.use("/webhooks/edi", (req, res, next) => {
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    const expectedKey = process.env.EDI_WEBHOOK_SECRET;

    if (!expectedKey) {
      // No secret configured — allow in development, block in production
      if (ENV.isProduction) {
        return res.status(403).json({ error: "EDI webhook secret not configured" });
      }
      return next();
    }

    if (apiKey !== expectedKey) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    next();
  });

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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect('/import?error=not_configured');
    try {
      // Verify HMAC-signed state and authenticate session
      const { verifySignedOAuthState } = await import('./crypto');
      const stateData = verifySignedOAuthState(state as string);
      if (!stateData) return res.redirect('/import?error=invalid_state');
      const { sdk: authSdk } = await import('./sdk');
      let user: any;
      try { user = await authSdk.authenticateRequest(req); } catch { return res.redirect('/import?error=not_authenticated'); }
      if (!user) return res.redirect('/import?error=not_authenticated');
      if (stateData.userId !== user.id) return res.redirect('/import?error=user_mismatch');
      const userId = user.id;
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
      logger.error("Google OAuth error", { error: error instanceof Error ? error.message : String(error) });
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
      const { verifySignedOAuthState } = await import('./crypto');
      const stateData = verifySignedOAuthState(state as string);
      if (!stateData) return res.redirect('/settings/integrations?shopify_error=invalid_state');
      const stateUserId = stateData.userId as number;
      const stateCompanyId = stateData.companyId as number | undefined;
      const stateShop = stateData.shop as string;
      if (stateUserId !== user.id) return res.redirect('/settings/integrations?shopify_error=user_mismatch');
      if (user.companyId && stateCompanyId !== user.companyId) return res.redirect('/settings/integrations?shopify_error=company_mismatch');
      let shopDomain = (shop as string).trim().toLowerCase();
      if (!shopDomain.endsWith('.myshopify.com')) return res.redirect('/settings/integrations?shopify_error=invalid_domain');
      if (stateShop !== shopDomain) return res.redirect('/settings/integrations?shopify_error=shop_mismatch');
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
      await upsertShopifyStore(shopDomain, { storeDomain: shopDomain, storeName: shopInfo.shop.name || shopDomain, accessToken: encryptedToken, apiVersion: '2024-01', isEnabled: true, syncInventory: true, syncOrders: true, inventoryAuthority: 'hybrid' });
      await createSyncLog({ integration: 'shopify', action: 'store_connected', status: 'success', details: `Connected store: ${shopInfo.shop.name} (${shopDomain})` });
      res.redirect('/settings/integrations?shopify_success=connected&shop=' + encodeURIComponent(shopInfo.shop.name));
    } catch (error) {
      logger.error("Shopify OAuth error", { error: error instanceof Error ? error.message : String(error) });
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
      logger.error("QuickBooks OAuth error", { error: error instanceof Error ? error.message : String(error) });
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
  if (port !== preferredPort) logger.info("Preferred port busy, using alternative", { preferredPort, port });

  server.listen(port, "0.0.0.0", () => {
    logger.info("Server started", { url: `http://0.0.0.0:${port}/`, port });

    // Start the email queue worker
    startEmailQueueWorker();

    // Start EDI polling scheduler (check every 5 minutes)
    import('../ediTransportService').then(({ startEdiPolling }) => {
      startEdiPolling(5 * 60 * 1000);
    }).catch(err => {
      console.warn('[EDI Polling] Could not start polling scheduler:', err.message);
    });
    logger.info("Starting autonomous supply chain orchestrator");
    startOrchestrator().catch(err => {
      logger.error("Failed to start orchestrator — autonomous workflows disabled", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    logger.info("Starting AI agent scheduler");
    try {
      startScheduler();
    } catch (err) {
      logger.error("Failed to start AI agent scheduler — AI agent automation disabled", {
        error: err instanceof Error ? (err as Error).message : String(err),
      });
    }

    // Start email inbox polling (IMAP)
    (async () => {
      try {
        const { scanInbox, getImapConfig, isImapConfigured } = await import("./emailInboxScanner");
        if (isImapConfigured()) {
          const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
          console.log("[Email Polling] Starting inbox scanner with 5m interval");
          setInterval(async () => {
            try {
              const config = getImapConfig();
              if (config) {
                await scanInbox(config, { unseenOnly: true, limit: 50 });
              }
            } catch (e) {
              console.warn("[Email Polling] Scan failed:", e);
            }
          }, POLL_INTERVAL);
          // Initial scan after 30 seconds
          setTimeout(() => {
            const config = getImapConfig();
            if (config) {
              scanInbox(config, { unseenOnly: true, limit: 50 }).catch(e =>
                console.warn("[Email Polling] Initial scan failed:", e)
              );
            }
          }, 30000);
        }
      } catch (e) {
        console.warn("[Email Polling] Could not initialize:", e);
      }
    })();

    // Start recurring invoice scheduler
    (async () => {
      try {
        const RECUR_INTERVAL = 60 * 60 * 1000; // Check every hour
        console.log("[Recurring Invoices] Starting scheduler with 1h interval");
        setInterval(async () => {
          try {
            const templates = await db.getRecurringInvoicesDueForGeneration();
            for (const template of templates) {
              try {
                const recurring = await db.getRecurringInvoiceWithItems(template.id);
                if (!recurring) continue;

                const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
                const issueDate = new Date();
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + (recurring.daysUntilDue || 30));

                const invoiceResult = await db.createInvoice({
                  companyId: recurring.companyId,
                  customerId: recurring.customerId,
                  invoiceNumber,
                  type: 'invoice',
                  status: 'draft',
                  issueDate,
                  dueDate,
                  subtotal: recurring.subtotal,
                  taxAmount: recurring.taxAmount,
                  discountAmount: recurring.discountAmount,
                  totalAmount: recurring.totalAmount,
                  currency: recurring.currency,
                  notes: recurring.notes,
                  terms: recurring.terms,
                });

                for (const item of recurring.items || []) {
                  await db.createInvoiceItem({
                    invoiceId: invoiceResult.id,
                    productId: item.productId,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxRate: item.taxRate,
                    taxAmount: item.taxAmount,
                    totalAmount: item.totalAmount,
                  });
                }

                // Calculate next generation date based on frequency
                const nextDate = new Date(issueDate);
                if (recurring.frequency === 'weekly') {
                  nextDate.setDate(nextDate.getDate() + 7);
                } else if (recurring.frequency === 'biweekly') {
                  nextDate.setDate(nextDate.getDate() + 14);
                } else if (recurring.frequency === 'monthly') {
                  nextDate.setMonth(nextDate.getMonth() + 1);
                } else if (recurring.frequency === 'quarterly') {
                  nextDate.setMonth(nextDate.getMonth() + 3);
                } else if (recurring.frequency === 'annually') {
                  nextDate.setFullYear(nextDate.getFullYear() + 1);
                } else {
                  nextDate.setMonth(nextDate.getMonth() + 1); // default monthly
                }

                await db.updateRecurringInvoice(template.id, {
                  lastGeneratedAt: new Date(),
                  nextGenerationDate: nextDate,
                  generationCount: (recurring.generationCount || 0) + 1,
                });

                await db.createRecurringInvoiceHistory({
                  recurringInvoiceId: template.id,
                  generatedInvoiceId: invoiceResult.id,
                  scheduledFor: issueDate,
                  status: 'generated',
                });

                console.log(`[Recurring Invoices] Generated invoice ${invoiceNumber} from template ${recurring.templateName}`);
              } catch (templateErr) {
                console.warn(`[Recurring Invoices] Failed to generate invoice from template ${template.id}:`, templateErr);
              }
            }
          } catch (e) {
            console.warn("[Recurring Invoices] Generation cycle failed:", e);
          }
        }, RECUR_INTERVAL);
      } catch (e) {
        console.warn("[Recurring Invoices] Could not initialize:", e);
      }
    })();
  });

  function gracefulShutdown(signal: string) {
    logger.info("Shutdown signal received, closing server", { signal });
    server.close(() => {
      logger.info("Server closed, exiting");
      process.exit(0);
    });
    // Force exit after 10 seconds if connections don't drain
    setTimeout(() => {
      logger.error("Forced exit after timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  captureException(reason, { type: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
  captureException(error, { type: "uncaughtException" });
  process.exit(1);
});

startServer().catch(console.error);
