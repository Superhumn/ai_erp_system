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
// serveStatic is inlined here to avoid importing vite.ts (which pulls in vite devDependencies)
import path from "path";
import fs from "fs";
function serveStatic(app: import("express").Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "..", "public");
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }
  app.use(express.static(distPath));
  app.use("*", (_req: any, res: any) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
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

async function ensureTables() {
  try {
    const db = await import("../db");
    const database = await db.getDb();
    if (!database) return;
    const tables = [
      `CREATE TABLE IF NOT EXISTS fireflies_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        apiKey VARCHAR(512) NOT NULL,
        autoCreateContacts BOOLEAN DEFAULT FALSE,
        autoCreateTasks BOOLEAN DEFAULT FALSE,
        autoCreateProjects BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS fireflies_meetings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companyId INT,
        firefliesId VARCHAR(128) NOT NULL,
        title VARCHAR(500),
        date TIMESTAMP NULL,
        duration INT,
        participants TEXT,
        transcript TEXT,
        summary TEXT,
        aiSummary TEXT,
        actionItemsRaw TEXT,
        videoUrl TEXT,
        audioUrl TEXT,
        status ENUM('pending','contacts_created','tasks_created','fully_processed') DEFAULT 'pending',
        crmContactId INT,
        linkedEntityType VARCHAR(64),
        linkedEntityId INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS fireflies_action_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meetingId INT NOT NULL,
        text TEXT,
        assignee VARCHAR(255),
        dueDate TIMESTAMP NULL,
        status ENUM('pending','completed','cancelled') DEFAULT 'pending',
        linkedTaskId INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`,
    ];
    for (const sql of tables) {
      try { await database.execute(require('drizzle-orm/sql').sql.raw(sql)); } catch { /* already exists */ }
    }
    console.log("[Startup] Ensured critical tables exist");
  } catch (e) {
    console.warn("[Startup] Table check skipped:", e instanceof Error ? e.message : e);
  }
}

async function cleanupPlaceholders() {
  try {
    const db = await import("../db");
    const database = await db.getDb();
    if (!database) return;
    const schema = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // Delete placeholder stakeholders (Investor 1, 2, 3, etc.)
    const stakeholders = await database.select().from(schema.stakeholders);
    const placeholderSH = stakeholders.filter((s: any) => /^(Investor|Stakeholder|Placeholder)\s*\d+$/i.test(s.name || ""));
    for (const p of placeholderSH) {
      await database.delete(schema.stakeholders).where(eq(schema.stakeholders.id, p.id));
    }
    if (placeholderSH.length > 0) console.log(`[Cleanup] Deleted ${placeholderSH.length} placeholder stakeholders`);

    // Delete placeholder contacts (Contact 1, 2, 3, etc.)
    const contacts = await database.select().from(schema.crmContacts);
    const placeholderContacts = contacts.filter((c: any) => {
      const name = (c.fullName || c.firstName || "").trim();
      const source = (c.source || "").toLowerCase();
      return /^(Contact|Test|Placeholder|Sample)\s*\d*$/i.test(name) ||
        name === "" || name === "-" ||
        source === "contact_form";
    });
    for (const p of placeholderContacts) {
      await database.delete(schema.crmContacts).where(eq(schema.crmContacts.id, p.id));
    }
    if (placeholderContacts.length > 0) console.log(`[Cleanup] Deleted ${placeholderContacts.length} placeholder contacts`);

    // Delete all WhatsApp messages (placeholder/test data)
    try {
      await database.delete(schema.whatsappMessages);
      console.log("[Cleanup] Deleted all WhatsApp messages");
    } catch { /* table may not exist */ }

    // Delete data room ID 1
    try {
      await database.delete(schema.dataRoomChecklistItems).where(eq(schema.dataRoomChecklistItems.dataRoomId, 1));
      await database.delete(schema.dataRoomChecklists).where(eq(schema.dataRoomChecklists.dataRoomId, 1));
      await database.delete(schema.dataRoomDocuments).where(eq(schema.dataRoomDocuments.dataRoomId, 1));
      await database.delete(schema.dataRoomFolders).where(eq(schema.dataRoomFolders.dataRoomId, 1));
      await database.delete(schema.dataRoomLinks).where(eq(schema.dataRoomLinks.dataRoomId, 1));
      await database.delete(schema.dataRooms).where(eq(schema.dataRooms.id, 1));
      console.log("[Cleanup] Deleted data room ID 1");
    } catch (e) {
      // Data room tables may not exist yet
    }
  } catch (e) {
    console.warn("[Cleanup] Skipped:", e instanceof Error ? e.message : e);
  }
}

async function startServer() {
  await initErrorTracking();

  validateCriticalConfig();

  // Ensure critical tables exist + cleanup placeholders
  ensureTables().then(() => cleanupPlaceholders()).catch(console.warn);

  const emailConfigValidation = validateEmailConfig();
  if (!emailConfigValidation.valid) {
    logger.warn("Some email configuration is missing — email features will be disabled", {
      errors: emailConfigValidation.errors,
    });
  }

  const app = express();

  // Trust exactly one proxy hop in production (Railway/Vercel reverse proxy)
  // so that req.secure / req.ip are derived from X-Forwarded-* headers correctly.
  if (ENV.isProduction) {
    app.set("trust proxy", 1);
  }

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
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self' https://fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
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
        const requestHost = new URL(origin as string).host;
        // Allow both the Railway domain and custom domain
        const allowedHosts = new Set([
          new URL(ENV.publicAppUrl).host,
          "app.superhumn.co",
          "aierpsystem-production.up.railway.app",
        ]);
        if (!allowedHosts.has(requestHost)) {
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
    // Determine the redirect page from the state (defaults to /import)
    let returnTo = '/import';
    if (!code || !state) return res.redirect(`${returnTo}?error=missing_params`);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect(`${returnTo}?error=not_configured`);
    try {
      // Verify HMAC-signed state and authenticate session
      const { verifySignedOAuthState } = await import('./crypto');
      const stateData = verifySignedOAuthState(state as string);
      if (!stateData) return res.redirect(`${returnTo}?error=invalid_state`);
      // Use returnTo from state if the caller encoded one (e.g. Gmail pages)
      if (typeof stateData.returnTo === 'string' && stateData.returnTo.startsWith('/')) {
        returnTo = stateData.returnTo;
      }
      const { sdk: authSdk } = await import('./sdk');
      let user: any;
      try { user = await authSdk.authenticateRequest(req); } catch { return res.redirect(`${returnTo}?error=not_authenticated`); }
      if (!user) return res.redirect(`${returnTo}?error=not_authenticated`);
      if (stateData.userId !== user.id) return res.redirect(`${returnTo}?error=user_mismatch`);
      const userId = user.id;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: code as string, grant_type: 'authorization_code', redirect_uri: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/google/callback` }),
      });
      if (!tokenResponse.ok) return res.redirect(`${returnTo}?error=token_exchange_failed`);
      const tokens = await tokenResponse.json();
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      let googleEmail = null;
      if (userInfoResponse.ok) { const userInfo = await userInfoResponse.json(); googleEmail = userInfo.email; }
      const { upsertGoogleOAuthToken } = await import('../db');
      await upsertGoogleOAuthToken({ userId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000), scope: tokens.scope, googleEmail });
      res.redirect(`${returnTo}?success=connected&google_connected=true`);
    } catch (error) {
      logger.error("Google OAuth error", { error: error instanceof Error ? error.message : String(error) });
      res.redirect(`${returnTo}?error=oauth_failed`);
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

  // tRPC API
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  
  if (process.env.NODE_ENV === "development") {
    // Use a variable path to prevent esbuild from tracing this import at build time.
    // In development, tsx runs the source directly (no esbuild), so this resolves fine.
    const vitePath = "./vite" + "";
    const { setupVite } = await import(vitePath);
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

    // One-time cleanup: remove non-food products (equipment, machinery, etc.)
    (async () => {
      try {
        const db = await import("../db");
        const allProducts = await db.getDb().then(async (d) => {
          if (!d) return [];
          const { products } = await import("../../drizzle/schema");
          return d.select().from(products);
        });
        const equipmentKeywords = ["equipment", "machinery", "machine", "tools", "supplies", "office", "furniture", "hardware", "electronics", "forklift", "conveyor", "mixer", "oven", "printer", "computer", "laptop", "monitor", "desk"];
        const toDelete = allProducts.filter((p: any) => {
          const cat = (p.category || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          return equipmentKeywords.some(kw => cat.includes(kw) || name.includes(kw));
        });
        if (toDelete.length > 0) {
          for (const p of toDelete) {
            try { await db.deleteProduct(p.id); } catch { /* FK constraint, skip */ }
          }
          console.log(`[Startup] Cleaned up ${toDelete.length} non-food products (equipment/machinery)`);
        }
      } catch { /* skip */ }
    })();

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

    // Start email inbox polling (IMAP) — supports multiple inboxes
    (async () => {
      try {
        const { scanAndCategorizeInbox } = await import("./emailInboxScanner");
        const db = await import("../db");
        const { parseUploadedDocument } = await import("../documentImportService");

        const inboxes = [
          { host: process.env.IMAP_HOST, user: process.env.IMAP_USER, password: process.env.IMAP_PASSWORD, port: parseInt(process.env.IMAP_PORT || "993") },
          { host: process.env.IMAP_HOST_2, user: process.env.IMAP_USER_2, password: process.env.IMAP_PASSWORD_2, port: parseInt(process.env.IMAP_PORT_2 || "993") },
        ].filter(i => i.host && i.user && i.password);

        if (inboxes.length > 0) {
          const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
          console.log(`[Email Polling] Starting inbox scanner for ${inboxes.length} inbox(es) with 5m interval`);
          for (const inbox of inboxes) {
            console.log(`[Email Polling] Monitoring: ${inbox.user}`);
          }

          const processInbox = async (inbox: any) => {
            try {
              const { scanResult, parsedResults } = await scanAndCategorizeInbox(
                { host: inbox.host!, port: inbox.port, secure: true, auth: { user: inbox.user!, pass: inbox.password! } },
                { unseenOnly: true, limit: 50, fullAiParsing: true, markAsSeen: true }
              );

              // Save each email to DB and parse attachments
              for (const { email, parseResult } of parsedResults) {
                try {
                  // Save inbound email record
                  const savedEmail = await db.createInboundEmail?.({
                    fromEmail: email.from.address,
                    fromName: email.from.name || "",
                    toEmail: email.to.join(", ") || "inbox",
                    subject: email.subject,
                    bodyText: email.bodyText?.substring(0, 10000) || "",
                    receivedAt: email.date,
                    status: "parsed",
                    category: email.categorization?.category || "other",
                  } as any);

                  // Parse attachments and AUTO-IMPORT into correct database tables
                  if ((email as any).attachmentContents?.length > 0) {
                    const { bulkImportDocuments } = await import("../documentImportService");
                    const docs = (email as any).attachmentContents.map((att: any) => ({
                      content: `data:${att.contentType};base64,${att.data.toString("base64")}`,
                      filename: att.filename,
                    }));
                    try {
                      const importResult = await bulkImportDocuments(docs, 1, true);
                      for (const r of importResult.results) {
                        if (r.success) {
                          console.log(`[Email Import] ✓ ${r.documentType}: created ${r.createdRecords.length} records, updated ${r.updatedRecords.length}`);
                          // Also save the raw file as a document for reference
                          const att = (email as any).attachmentContents[importResult.results.indexOf(r)];
                          if (att) {
                            await db.createDocument?.({
                              name: att.filename,
                              type: r.documentType === "customs_document" ? "customs" : r.documentType === "vendor_invoice" ? "invoice" : r.documentType === "purchase_order" ? "po" : "other",
                              referenceType: "email",
                              referenceId: savedEmail?.id,
                              fileData: att.data.toString("base64"),
                              mimeType: att.contentType,
                              description: `Auto-imported ${r.documentType}: ${r.createdRecords.map((cr: any) => cr.id || cr.number || "").join(", ")}`,
                            } as any);
                          }
                        } else {
                          console.warn(`[Email Import] ✗ ${r.documentType}: ${r.error}`);
                        }
                      }
                      if (importResult.successful > 0) {
                        // Create notification for imported documents
                        await db.createNotification({
                          userId: 1,
                          type: "reminder" as const,
                          title: `📧 Auto-imported ${importResult.successful} document(s)`,
                          message: `From: ${email.from.name || email.from.address} — ${importResult.results.filter((r: any) => r.success).map((r: any) => r.documentType.replace(/_/g, " ")).join(", ")}`,
                        });
                      }
                    } catch (e) {
                      console.warn(`[Email Import] Bulk import failed:`, e);
                    }
                  }
                } catch (e) {
                  console.warn(`[Email Polling] Failed to save email:`, e);
                }
              }

              if (scanResult.newEmails > 0) {
                console.log(`[Email Polling] Processed ${scanResult.newEmails} new emails from ${inbox.user}`);
              }
            } catch (e) {
              console.warn(`[Email Polling] Scan failed for ${inbox.user}:`, e);
            }
          };

          // Ongoing polling
          setInterval(async () => {
            for (const inbox of inboxes) await processInbox(inbox);
          }, POLL_INTERVAL);

          // Initial sync after 1 minute
          setTimeout(async () => {
            for (const inbox of inboxes) await processInbox(inbox);
          }, 60 * 1000);
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

    // ── Automation #3 & #4: Material shortage background check + PO auto-generation (every 30 min) ──
    (async () => {
      try {
        const SHORTAGE_INTERVAL = 30 * 60 * 1000; // 30 minutes
        console.log("[Material Shortage] Starting background check with 30m interval");
        setInterval(async () => {
          try {
            const { runShortageCheckAndNotify, detectMaterialShortages } = await import("../materialShortageService");
            const result = await runShortageCheckAndNotify();
            if (result.shortageCount > 0) {
              console.log(`[Material Shortage] Found ${result.shortageCount} shortages, notified ${result.notifiedUsers} users`);
            }

            // Automation #4: Auto-suggest PO for materials below reorder point without pending POs
            try {
              const shortages = await detectMaterialShortages();
              const { getPendingOrdersForMaterial, createPurchaseOrder, createPurchaseOrderItem } = await import("../db");
              for (const shortage of shortages) {
                const pendingOrders = await getPendingOrdersForMaterial(shortage.rawMaterialId);
                if (pendingOrders.length === 0 && shortage.preferredVendorId) {
                  const poNumber = `AUTO-PO-${Date.now().toString(36).toUpperCase()}-${shortage.rawMaterialId}`;
                  const po = await createPurchaseOrder({
                    poNumber,
                    vendorId: shortage.preferredVendorId,
                    status: "draft",
                    orderDate: new Date(),
                    totalAmount: "0",
                    notes: `Auto-generated: ${shortage.shortfall.toFixed(1)} ${shortage.unit} shortage of ${shortage.rawMaterialName}`,
                  } as any);
                  await createPurchaseOrderItem({
                    purchaseOrderId: po.id,
                    description: shortage.rawMaterialName,
                    quantity: Math.ceil(shortage.shortfall).toString(),
                    unit: shortage.unit,
                    unitPrice: "0",
                    totalAmount: "0",
                  } as any);
                  console.log(`[Material Shortage→PO] Auto-created draft PO ${poNumber} for ${shortage.rawMaterialName} (shortfall: ${shortage.shortfall.toFixed(1)} ${shortage.unit})`);
                }
              }
            } catch (poErr) {
              console.warn("[Material Shortage→PO] Auto PO generation failed:", poErr);
            }
          } catch (e) {
            console.warn("[Material Shortage] Check failed:", e);
          }
        }, SHORTAGE_INTERVAL);
        // Initial check after 2 minutes
        setTimeout(async () => {
          try {
            const { runShortageCheckAndNotify } = await import("../materialShortageService");
            await runShortageCheckAndNotify();
          } catch (e) {
            console.warn("[Material Shortage] Initial check failed:", e);
          }
        }, 2 * 60 * 1000);
      } catch (e) {
        console.warn("[Material Shortage] Could not initialize:", e);
      }
    })();

    // ── Automation #7: Vendor follow-up emails background schedule (daily) ──
    (async () => {
      try {
        const FOLLOWUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
        console.log("[Vendor Follow-Up] Starting daily PO follow-up scheduler");
        setInterval(async () => {
          try {
            const { checkAndSendPoFollowups } = await import("../vendorEmailAutomation");
            const result = await checkAndSendPoFollowups();
            if (result.followUpsSent > 0) {
              console.log(`[Vendor Follow-Up] Sent ${result.followUpsSent} follow-up emails`);
            }
            if (result.errors.length > 0) {
              console.warn(`[Vendor Follow-Up] ${result.errors.length} errors:`, result.errors.slice(0, 3));
            }
          } catch (e) {
            console.warn("[Vendor Follow-Up] Check failed:", e);
          }
        }, FOLLOWUP_INTERVAL);
        // Initial check after 5 minutes
        setTimeout(async () => {
          try {
            const { checkAndSendPoFollowups } = await import("../vendorEmailAutomation");
            await checkAndSendPoFollowups();
          } catch (e) {
            console.warn("[Vendor Follow-Up] Initial check failed:", e);
          }
        }, 5 * 60 * 1000);
      } catch (e) {
        console.warn("[Vendor Follow-Up] Could not initialize:", e);
      }
    })();

    // ── Data Room follow-up emails (daily check) ──
    (async () => {
      try {
        const DR_FOLLOWUP_INTERVAL = 24 * 60 * 60 * 1000; // Daily
        console.log("[Data Room Follow-Up] Starting daily follow-up scheduler");
        setInterval(async () => {
          try {
            const { sendDataRoomFollowUps } = await import("../dataRoomFollowUp");
            const result = await sendDataRoomFollowUps();
            if (result.sent > 0) {
              console.log(`[Data Room Follow-Up] Sent ${result.sent} follow-up emails`);
            }
          } catch (e) {
            console.warn("[Data Room Follow-Up] Failed:", e);
          }
        }, DR_FOLLOWUP_INTERVAL);
        // Initial check after 10 minutes
        setTimeout(async () => {
          try {
            const { sendDataRoomFollowUps } = await import("../dataRoomFollowUp");
            await sendDataRoomFollowUps();
          } catch {}
        }, 10 * 60 * 1000);
      } catch (e) {
        console.warn("[Data Room Follow-Up] Could not initialize:", e);
      }
    })();

    // ── Automation #8: Mercury transaction sync (every 15 minutes) ──
    if (process.env.MERCURY_API_TOKEN) {
      (async () => {
        try {
          const MERCURY_INTERVAL = 24 * 60 * 60 * 1000; // Daily
          console.log("[Mercury Sync] Starting background sync with 15m interval");
          setInterval(async () => {
            try {
              const { getMercuryAccounts, getMercuryTransactions } = await import("../mercuryService");
              const accounts = await getMercuryAccounts();
              let totalImported = 0;
              for (const account of (accounts.accounts || []) as any[]) {
                const txns = await getMercuryTransactions(account.id);
                for (const txn of (txns.transactions || []) as any[]) {
                  const existing = await db.getBankTransactionByExternalId(txn.id);
                  if (existing) continue;
                  await db.createBankTransaction({
                    externalId: txn.id,
                    accountName: account.name,
                    accountId: account.id,
                    date: new Date(txn.postedDate || txn.createdAt),
                    amount: Math.abs(txn.amount).toString(),
                    type: txn.amount < 0 ? "debit" : "credit",
                    description: txn.bankDescription || txn.note || txn.externalMemo || "",
                    counterpartyName: txn.counterpartyName || txn.friendlyDescription || "",
                    status: txn.status,
                    source: "mercury",
                  });
                  totalImported++;
                }
              }
              if (totalImported > 0) {
                console.log(`[Mercury Sync] Imported ${totalImported} new transactions`);
              }
            } catch (e) {
              console.warn("[Mercury Sync] Failed:", e);
            }
          }, MERCURY_INTERVAL);
        } catch (e) {
          console.warn("[Mercury Sync] Could not initialize:", e);
        }
      })();
    }

    // Data Room Google Drive auto-sync (hourly)
    (async () => {
      try {
        const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // Daily
        console.log("[Data Room Sync] Starting daily auto-sync");
        setInterval(async () => {
          try {
            const { syncDriveFolder, downloadDriveFile, getSimpleFileType } = await import("../routers").then(() => import("./googleDrive"));
            const rooms = await db.getDataRooms();
            for (const room of rooms) {
              if (room.googleDriveFolderId) {
                const token = await db.getGoogleOAuthTokenByUserId(room.ownerId);
                if (token?.accessToken) {
                  try {
                    const syncResult = await syncDriveFolder(token.accessToken, room.googleDriveFolderId);
                    if (syncResult.success && syncResult.files.length > 0) {
                      // Check for new files not yet in the data room
                      const existingDocs = await db.getDataRoomDocuments(room.id);
                      const existingDriveIds = new Set(
                        existingDocs.filter(d => d.googleDriveFileId).map(d => d.googleDriveFileId!)
                      );

                      let newFilesCount = 0;
                      for (const driveFile of syncResult.files) {
                        if (existingDriveIds.has(driveFile.id)) continue;

                        // Download actual file content
                        const downloaded = await downloadDriveFile(token.accessToken, driveFile.id, driveFile.mimeType);
                        const isGoogleWorkspaceFile = driveFile.mimeType.startsWith('application/vnd.google-apps.');
                        const displayName = isGoogleWorkspaceFile ? `${driveFile.name}.pdf` : driveFile.name;
                        const effectiveMimeType = ('exportedMimeType' in downloaded) ? downloaded.exportedMimeType : driveFile.mimeType;
                        const fileType = getSimpleFileType(effectiveMimeType);

                        let storageUrl: string | undefined;
                        let storageType: string = 'google_drive';

                        if ('buffer' in downloaded && downloaded.buffer.length < 5 * 1024 * 1024) {
                          storageUrl = `data:${downloaded.exportedMimeType};base64,${downloaded.buffer.toString('base64')}`;
                          storageType = 's3';
                        }

                        await db.createDataRoomDocument({
                          dataRoomId: room.id,
                          folderId: null,
                          name: displayName,
                          fileType,
                          mimeType: effectiveMimeType,
                          fileSize: ('buffer' in downloaded) ? downloaded.buffer.length : (driveFile.size ? parseInt(driveFile.size) : undefined),
                          storageType: storageType as any,
                          storageUrl,
                          googleDriveFileId: driveFile.id,
                          googleDriveWebViewLink: driveFile.webViewLink,
                          thumbnailUrl: driveFile.thumbnailLink,
                          uploadedBy: room.ownerId,
                        });
                        newFilesCount++;
                      }

                      if (newFilesCount > 0) {
                        console.log(`[Data Room Sync] Synced room ${room.id}: ${newFilesCount} new files added`);
                        await db.updateDataRoom(room.id, { lastSyncedAt: new Date() });
                      }
                    }
                  } catch (roomErr) {
                    console.warn(`[Data Room Sync] Failed to sync room ${room.id}:`, roomErr);
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[Data Room Sync] Failed:", e);
          }
        }, SYNC_INTERVAL);
      } catch (e) {
        console.warn("[Data Room Sync] Could not initialize:", e);
      }
    })();

    // ── Fireflies meeting auto-sync (every 30 minutes) ──
    (async () => {
      try {
        if (process.env.FIREFLIES_API_KEY) {
          const FIREFLIES_INTERVAL = 24 * 60 * 60 * 1000; // Daily
          console.log("[Fireflies Sync] Starting auto-sync with 30m interval");
          setInterval(async () => {
            try {
              const { syncAllFirefliesMeetings } = await import("../firefliesSyncService");
              const result = await syncAllFirefliesMeetings();
              if (result.totalSynced > 0) {
                console.log(`[Fireflies Sync] Synced ${result.totalSynced} meetings, created ${result.contactsCreated} contacts, ${result.dealsCreated} deals, ${result.notificationsCreated} notifications`);
              }
            } catch (e) {
              console.warn("[Fireflies Sync] Failed:", e);
            }
          }, FIREFLIES_INTERVAL);
          // Initial sync after 3 minutes
          setTimeout(async () => {
            try {
              const { syncAllFirefliesMeetings } = await import("../firefliesSyncService");
              await syncAllFirefliesMeetings();
              console.log("[Fireflies Sync] Initial sync complete");
            } catch (e) {
              console.warn("[Fireflies Sync] Initial sync failed:", e);
            }
          }, 3 * 60 * 1000);
        }
      } catch (e) {
        console.warn("[Fireflies Sync] Could not initialize:", e);
      }
    })();

    // ── Shopify auto-sync (every 12 hours) ──
    (async () => {
      try {
        const SHOPIFY_SYNC_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
        console.log("[Shopify Sync] Starting auto-sync with 12h interval");
        setInterval(async () => {
          try {
            const { runAllShopifySyncs } = await import("./shopify");
            const result = await runAllShopifySyncs();
            for (const r of result.results) {
              if (r.result) {
                console.log(`[Shopify Sync] ${r.domain}: products=${r.result.products.created}+${r.result.products.updated}, orders=${r.result.orders.created}+${r.result.orders.updated}, customers=${r.result.customers.created}+${r.result.customers.updated} (${(r.result.duration / 1000).toFixed(1)}s)`);
              } else if (r.error) {
                console.warn(`[Shopify Sync] ${r.domain} failed: ${r.error}`);
              }
            }
          } catch (e) {
            console.warn("[Shopify Sync] Auto-sync error:", e);
          }
        }, SHOPIFY_SYNC_INTERVAL);

        // Run initial sync after 2 minutes to let the server warm up
        setTimeout(async () => {
          try {
            const { runAllShopifySyncs } = await import("./shopify");
            const result = await runAllShopifySyncs();
            console.log(`[Shopify Sync] Initial sync complete for ${result.stores} store(s)`);
          } catch (e) {
            console.warn("[Shopify Sync] Initial sync failed:", e);
          }
        }, 2 * 60 * 1000);
      } catch (e) {
        console.warn("[Shopify Sync] Could not initialize:", e);
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
