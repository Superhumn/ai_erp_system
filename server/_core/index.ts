import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV, validateEmailConfig } from "./env";
import * as sendgridProvider from "./sendgridProvider";
import * as emailService from "./emailService";
import * as db from "../db";
import { startEmailQueueWorker } from "../emailQueueWorker";

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
  // Validate email configuration at startup
  const emailConfigValidation = validateEmailConfig();
  if (!emailConfigValidation.valid) {
    if (ENV.isProduction) {
      console.error("[Email Config] FATAL: Missing required email configuration in production:");
      emailConfigValidation.errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    } else {
      console.warn("[Email Config] Warning: Some email configuration is missing:");
      emailConfigValidation.errors.forEach(err => console.warn(`  - ${err}`));
    }
  }

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ============================================
  // SENDGRID WEBHOOK ENDPOINT
  // ============================================
  app.post('/webhooks/sendgrid/events', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      // Get the raw body for signature verification
      const rawBody = req.body.toString();

      // Verify webhook signature if configured
      if (ENV.sendgridWebhookSecret) {
        const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
        const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

        if (!signature || !timestamp) {
          console.warn('[SendGrid Webhook] Missing signature or timestamp headers');
          return res.status(401).json({ error: 'Missing signature headers' });
        }

        const isValid = sendgridProvider.verifyWebhookSignature(
          ENV.sendgridWebhookSecret,
          rawBody,
          signature,
          timestamp
        );

        if (!isValid) {
          console.warn('[SendGrid Webhook] Invalid signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      // Parse the events
      let events: any[];
      try {
        events = JSON.parse(rawBody);
      } catch (e) {
        console.error('[SendGrid Webhook] Failed to parse body:', e);
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      if (!Array.isArray(events)) {
        events = [events];
      }

      console.log(`[SendGrid Webhook] Received ${events.length} event(s)`);

      // Process each event
      for (const event of events) {
        try {
          const providerEventType = event.event;
          const providerMessageId = event.sg_message_id?.split('.')[0]; // Remove the .filter_id suffix
          const email = event.email;
          const timestamp = event.timestamp ? new Date(event.timestamp * 1000) : new Date();

          // Store the raw event
          const emailEvent = await db.createEmailEvent({
            providerEventType,
            providerMessageId,
            providerTimestamp: timestamp,
            rawEventJson: event,
            email,
            reason: event.reason || event.response || null,
            bounceType: event.type || null,
            processedAt: new Date(),
          });

          // Find and update the corresponding email message
          if (providerMessageId) {
            const message = await db.getEmailMessageByProviderMessageId(providerMessageId);
            if (message) {
              // Update the event with the message ID
              await db.createEmailEvent({
                ...emailEvent,
                emailMessageId: message.id,
              });

              // Map the event to a status
              const newStatus = sendgridProvider.mapEventToStatus(providerEventType);
              if (newStatus) {
                await db.updateEmailMessageStatus(message.id, newStatus);
                console.log(`[SendGrid Webhook] Updated message ${message.id} status to ${newStatus}`);
              }
            }
          }
        } catch (eventError) {
          console.error('[SendGrid Webhook] Error processing event:', eventError);
          // Continue processing other events
        }
      }

      res.status(200).json({ received: events.length });
    } catch (error) {
      console.error('[SendGrid Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ============================================
  // SHOPIFY WEBHOOK ENDPOINTS
  // ============================================
  
  // Generic Shopify webhook handler to reduce code duplication
  const handleShopifyWebhook = async (req: any, res: any, endpointType: 'orders' | 'inventory') => {
    try {
      const rawBody = req.body.toString();
      const { processShopifyWebhook } = await import('./shopify');
      
      const result = await processShopifyWebhook(rawBody, {
        hmac: req.headers['x-shopify-hmac-sha256'] as string,
        shopDomain: req.headers['x-shopify-shop-domain'] as string,
        topic: req.headers['x-shopify-topic'] as string,
      });

      if (!result.shouldProcess) {
        if (result.error === 'Already processed') {
          return res.status(200).json({ success: true, message: 'Already processed' });
        }
        console.warn('[Shopify Webhook]', result.error);
        return res.status(result.error === 'Invalid signature' ? 401 : 400).json({ error: result.error });
      }

      const logMessage = endpointType === 'orders' 
        ? `Received ${result.topic} for order ${result.payload?.id}`
        : `Received ${result.topic} for inventory`;
      console.log(`[Shopify Webhook] ${logMessage}`);
      
      res.status(200).json({ success: true });

    } catch (error) {
      console.error('[Shopify Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  app.post('/webhooks/shopify/orders', express.raw({ type: 'application/json' }), (req, res) => 
    handleShopifyWebhook(req, res, 'orders')
  );

  app.post('/webhooks/shopify/inventory', express.raw({ type: 'application/json' }), (req, res) => 
    handleShopifyWebhook(req, res, 'inventory')
  );
  
  // Google OAuth callback for Drive/Sheets integration
  app.get('/api/google/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.redirect('/import?error=missing_params');
    }
    
    // Validate state parameter (user ID)
    const userId = parseInt(state as string, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.redirect('/import?error=invalid_state');
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.redirect('/import?error=not_configured');
    }
    
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/google/callback`,
        }),
      });
      
      if (!tokenResponse.ok) {
        console.error('Token exchange failed:', await tokenResponse.text());
        return res.redirect('/import?error=token_exchange_failed');
      }
      
      const tokens = await tokenResponse.json();
      
      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      
      let googleEmail = null;
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        googleEmail = userInfo.email;
      }
      
      // Import db functions dynamically to avoid circular deps
      const { upsertGoogleOAuthToken } = await import('../db');
      
      // Save tokens to database
      await upsertGoogleOAuthToken({
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
        googleEmail,
      });
      
      res.redirect('/import?success=connected');
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.redirect('/import?error=oauth_failed');
    }
  });

  // Shopify OAuth callback
  app.get('/api/shopify/callback', async (req, res) => {
    const { code, shop, state } = req.query;
    
    if (!code || !shop || !state) {
      return res.redirect('/settings/integrations?shopify_error=missing_params');
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.redirect('/settings/integrations?shopify_error=not_configured');
    }

    try {
      // Authenticate the user from session
      const { sdk } = await import('./sdk');
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch (error) {
        return res.redirect('/settings/integrations?shopify_error=not_authenticated');
      }

      if (!user) {
        return res.redirect('/settings/integrations?shopify_error=not_authenticated');
      }

      // Validate state parameter
      const stateParts = (state as string).split(':');
      if (stateParts.length < 4) {
        return res.redirect('/settings/integrations?shopify_error=invalid_state');
      }

      const stateUserId = parseInt(stateParts[0]);
      const stateCompanyId = stateParts[1] !== 'undefined' ? parseInt(stateParts[1]) : undefined;
      const stateShop = stateParts[2];
      const stateTimestamp = parseInt(stateParts[3]);

      // Verify user ID matches
      if (stateUserId !== user.id) {
        return res.redirect('/settings/integrations?shopify_error=user_mismatch');
      }

      // Verify company ID matches (if user has one)
      if (user.companyId && stateCompanyId !== user.companyId) {
        return res.redirect('/settings/integrations?shopify_error=company_mismatch');
      }

      // Validate shop domain
      let shopDomain = (shop as string).trim().toLowerCase();
      if (!shopDomain.endsWith('.myshopify.com')) {
        return res.redirect('/settings/integrations?shopify_error=invalid_domain');
      }

      // Verify shop matches state
      if (stateShop !== shopDomain) {
        return res.redirect('/settings/integrations?shopify_error=shop_mismatch');
      }

      // Check state is not too old (10 minutes max)
      const maxAge = 10 * 60 * 1000;
      if (Date.now() - stateTimestamp > maxAge) {
        return res.redirect('/settings/integrations?shopify_error=state_expired');
      }

      // Exchange code for access token
      const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code as string,
        }),
      });

      if (!tokenResponse.ok) {
        console.error('Token exchange failed:', await tokenResponse.text());
        return res.redirect('/settings/integrations?shopify_error=token_exchange_failed');
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Fetch shop info to get the store name
      const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!shopInfoResponse.ok) {
        return res.redirect('/settings/integrations?shopify_error=failed_to_fetch_shop_info');
      }

      const shopInfo = await shopInfoResponse.json();
      
      // Import db functions
      const { upsertShopifyStore, createSyncLog } = await import('../db');
      
      // Use the company ID from the authenticated user
      const companyId = user.companyId || undefined;

      // Import encryption function
      const { encrypt } = await import('../_core/crypto');
      const encryptedToken = encrypt(accessToken);

      // Store the Shopify connection
      await upsertShopifyStore(shopDomain, {
        companyId,
        storeDomain: shopDomain,
        storeName: shopInfo.shop.name || shopDomain,
        accessToken: encryptedToken,
        apiVersion: '2024-01',
        isEnabled: true,
        syncInventory: true,
        syncOrders: true,
        inventoryAuthority: 'hybrid',
      });

      // Log the connection
      await createSyncLog({
        integration: 'shopify',
        action: 'store_connected',
        status: 'success',
        details: `Connected store: ${shopInfo.shop.name} (${shopDomain})`,
      });

      res.redirect('/settings/integrations?shopify_success=connected&shop=' + encodeURIComponent(shopInfo.shop.name));
    } catch (error) {
      console.error('Shopify OAuth error:', error);
      res.redirect('/settings/integrations?shopify_error=oauth_failed');
    }
  });

  // QuickBooks OAuth callback
  app.get('/api/oauth/quickbooks/callback', async (req, res) => {
    const { code, state, realmId } = req.query;
    
    if (!code || !state || !realmId) {
      return res.redirect('/settings/integrations?quickbooks_error=missing_params');
    }

    try {
      // Authenticate the user from session
      const { sdk } = await import('./sdk');
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch (error) {
        return res.redirect('/settings/integrations?quickbooks_error=not_authenticated');
      }

      if (!user) {
        return res.redirect('/settings/integrations?quickbooks_error=not_authenticated');
      }

      // Validate state parameter
      const { validateOAuthState, exchangeCodeForToken } = await import('./quickbooks');
      const stateValidation = validateOAuthState(state as string);
      
      if (stateValidation.error || stateValidation.userId !== user.id) {
        return res.redirect('/settings/integrations?quickbooks_error=invalid_state');
      }

      // Exchange code for tokens
      const tokenResult = await exchangeCodeForToken(code as string);
      
      if (tokenResult.error) {
        console.error('QuickBooks token exchange failed:', tokenResult.error);
        return res.redirect('/settings/integrations?quickbooks_error=token_exchange_failed');
      }

      // Store the QuickBooks connection
      const { upsertQuickBooksOAuthToken, createSyncLog } = await import('../db');
      
      await upsertQuickBooksOAuthToken({
        userId: user.id,
        accessToken: tokenResult.access_token!,
        refreshToken: tokenResult.refresh_token!,
        expiresAt: new Date(Date.now() + (tokenResult.expires_in! * 1000)),
        realmId: realmId as string,
        scope: 'com.intuit.quickbooks.accounting',
      });

      // Log the connection
      await createSyncLog({
        integration: 'quickbooks',
        action: 'connected',
        status: 'success',
        details: `QuickBooks connected - Realm ID: ${realmId}`,
      });

      res.redirect('/settings/integrations?quickbooks_success=connected');
    } catch (error) {
      console.error('QuickBooks OAuth error:', error);
      res.redirect('/settings/integrations?quickbooks_error=oauth_failed');
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Start the email queue worker
    startEmailQueueWorker();
  });
}

startServer().catch(console.error);
