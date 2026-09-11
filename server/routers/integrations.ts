// appRouter.integrations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { safeDecryptToken } from "../_core/crypto";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { getServiceAccountEmail, isServiceAccountConfigured } from "../_core/googleServiceAccount";
import { refreshQuickBooksToken } from "../_core/quickbooks";
import { checkMergeConnection } from "../_core/merge";
import { ENV } from "../_core/env";
import { adminProcedure, resolveRequestScope, mergeCompanyExists, createAuditLog, refreshGoogleToken, getValidGoogleToken } from "./_shared";

// ============================================
// INTEGRATIONS
// ============================================
export const integrationsRouter = router({
    list: adminProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getIntegrationConfigs(input?.companyId)),
    create: adminProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['quickbooks', 'shopify', 'email', 'webhook', 'airtable']),
        name: z.string().min(1),
        config: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createIntegrationConfig(input as any);
        await createAuditLog(ctx.user.id, 'create', 'integration', result.id, input.name);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        config: z.any().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateIntegrationConfig(id, data);
        await createAuditLog(ctx.user.id, 'update', 'integration', id);
        return { success: true };
      }),
    
    // Get all integration statuses
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const sendgridConfigured = isEmailConfigured();
      const shopifyStores = await db.getShopifyStores();
      const activeShopifyStores = shopifyStores.filter(s => s.isEnabled);
      const syncHistory = await db.getSyncHistory(10);
      
      // Check Google OAuth connection — attempt auto-refresh if expired
      const googleToken = await db.getGoogleOAuthToken(ctx.user.id);
      let googleConnected = googleToken && (!googleToken.expiresAt || new Date(googleToken.expiresAt) > new Date());
      if (googleToken && !googleConnected && googleToken.refreshToken) {
        const refreshed = await refreshGoogleToken(googleToken.refreshToken);
        if (refreshed.accessToken && refreshed.expiresAt) {
          try {
            await db.upsertGoogleOAuthToken({
              userId: ctx.user.id,
              accessToken: refreshed.accessToken,
              refreshToken: googleToken.refreshToken,
              expiresAt: refreshed.expiresAt,
              googleEmail: googleToken.googleEmail,
            });
          } catch (e) {
            console.warn('[getStatus] Failed to save refreshed Google token:', e);
          }
          googleConnected = true;
        }
      }
      // If connected but missing email, try to fetch it from Google
      if (googleConnected && googleToken && !googleToken.googleEmail) {
        try {
          const { accessToken: validToken } = await getValidGoogleToken(ctx.user.id);
          if (validToken) {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${validToken}` } });
            if (userInfoRes.ok) {
              const userInfo = await userInfoRes.json();
              if (userInfo.email) {
                await db.upsertGoogleOAuthToken({ userId: ctx.user.id, accessToken: validToken, googleEmail: userInfo.email });
                googleToken.googleEmail = userInfo.email;
              }
            }
          }
        } catch { /* best-effort email fetch */ }
      }
      
      // Check QuickBooks OAuth connection and attempt refresh if expired.
      // In Merge mode the connection is env-configured, not per-user OAuth.
      const usingMerge = ENV.accountingSyncProvider === "merge";
      const providerInvalid = ENV.accountingSyncProvider === "invalid";
      // Merge connection details are only visible to users with access to
      // the linked entity; others see it as not configured.
      const mergeVisible = usingMerge
        ? scopeAllows(await resolveRequestScope(ctx.user), ENV.mergeCompanyId) && (await mergeCompanyExists())
        : false;
      const mergeCheck = usingMerge && mergeVisible ? await checkMergeConnection() : null;
      const quickbooksToken = usingMerge ? null : await db.getQuickBooksOAuthToken(ctx.user.id);
      let quickbooksConnected = providerInvalid
        ? false
        : usingMerge
          ? !!mergeCheck?.connected
          : !!(quickbooksToken && (!quickbooksToken.expiresAt || new Date(quickbooksToken.expiresAt) > new Date()));
      // realmId stays an Intuit identifier; Merge's linked company name is
      // reported separately so the UI doesn't show a name as an ID.
      let quickbooksRealmId = usingMerge ? null : quickbooksToken?.realmId;
      const quickbooksCompanyName = usingMerge ? (mergeCheck?.companyName ?? null) : null;
      if (quickbooksToken && !quickbooksConnected && quickbooksToken.refreshToken) {
        try {
          const refreshResult = await refreshQuickBooksToken(quickbooksToken.refreshToken);
          if (refreshResult.access_token && refreshResult.expires_in) {
            await db.upsertQuickBooksOAuthToken({
              userId: ctx.user.id,
              accessToken: refreshResult.access_token,
              refreshToken: refreshResult.refresh_token || quickbooksToken.refreshToken,
              expiresAt: new Date(Date.now() + (refreshResult.expires_in * 1000)),
              realmId: quickbooksToken.realmId,
              scope: quickbooksToken.scope || "com.intuit.quickbooks.accounting",
            });
            quickbooksConnected = true;
            quickbooksRealmId = quickbooksToken.realmId;
          }
        } catch (e) {
          console.warn("[getStatus] Failed to refresh QuickBooks token:", e);
        }
      }
      
      return {
        sendgrid: {
          configured: sendgridConfigured,
          status: sendgridConfigured ? 'connected' : 'not_configured',
        },
        shopify: {
          configured: activeShopifyStores.length > 0,
          status: activeShopifyStores.length > 0 ? 'connected' : 'not_configured',
          storeCount: activeShopifyStores.length,
          stores: shopifyStores,
        },
        google: {
          configured: googleConnected,
          status: googleConnected ? 'connected' : 'not_configured',
          email: googleToken?.googleEmail,
        },
        gmail: {
          configured: googleConnected,
          status: googleConnected ? 'connected' : 'not_configured',
          email: googleToken?.googleEmail,
        },
        googleWorkspace: {
          configured: googleConnected,
          status: googleConnected ? 'connected' : 'not_configured',
          email: googleToken?.googleEmail,
        },
        googleDriveServiceAccount: {
          configured: isServiceAccountConfigured(),
          email: getServiceAccountEmail(),
        },
        quickbooks: {
          configured: quickbooksConnected,
          status: quickbooksConnected ? 'connected' : 'not_configured',
          realmId: quickbooksRealmId,
          companyName: quickbooksCompanyName,
          provider: ENV.accountingSyncProvider,
        },
        syncHistory,
        fireflies: await (async () => {
          try {
            const config = await db.getFirefliesConfig(ctx.user.id);
            console.log(`[getStatus] Fireflies config for user ${ctx.user.id}:`, config ? 'found' : 'not found');
            return {
              configured: !!config,
              status: config ? 'connected' : 'not_configured',
            };
          } catch (e: any) {
            console.warn(`[getStatus] Fireflies check failed:`, e.message);
            return { configured: false, status: 'not_configured' };
          }
        })(),
      };
    }),

    // Test SendGrid connection
    testSendgrid: adminProcedure
      .input(z.object({ testEmail: z.string().email() }))
      .mutation(async ({ input }) => {
        if (!isEmailConfigured()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'SendGrid is not configured. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in Settings → Secrets.' });
        }
        
        const result = await sendEmail({
          to: input.testEmail,
          subject: 'ERP System - SendGrid Test',
          html: formatEmailHtml('SendGrid Connection Test\n\nThis is a test email to verify your SendGrid integration is working correctly.\n\nSent from your AI-Native ERP System'),
        });
        
        if (!result.success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to send test email' });
        }
        
        await db.createSyncLog({
          integration: 'sendgrid',
          action: 'test_email',
          status: 'success',
          details: `Test email sent to ${input.testEmail}`,
        });
        
        return { success: true, message: `Test email sent to ${input.testEmail}` };
      }),

    // Sync history
    getSyncHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getSyncHistory(input.limit || 50);
      }),

    // Clear sync history
    clearSyncHistory: adminProcedure.mutation(async () => {
      await db.clearSyncHistory();
      return { success: true };
    }),

    // Shopify OAuth sub-router (used by client Integrations page)
    shopify: router({
      initiateOAuth: protectedProcedure
        .input(z.object({ shop: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const clientId = process.env.SHOPIFY_CLIENT_ID;
          const redirectUri = process.env.SHOPIFY_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/shopify/callback`;
          if (!clientId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Shopify integration is not configured' });
          let shopDomain = input.shop.trim().toLowerCase();
          if (!shopDomain.includes('.')) shopDomain = `${shopDomain}.myshopify.com`;
          if (!shopDomain.endsWith('.myshopify.com')) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid Shopify domain' });
          const { createSignedOAuthState } = await import('../_core/crypto');
          const state = createSignedOAuthState({ userId: ctx.user.id, companyId: (ctx.user as any).companyId, shop: shopDomain });
          const scopes = 'read_products,read_orders,read_inventory,write_inventory,read_locations,read_fulfillments';
          const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
          return { authUrl };
        }),
      disconnect: protectedProcedure
        .input(z.object({ storeId: z.number() }))
        .mutation(async ({ input }) => {
          await db.updateShopifyStore(input.storeId, { isEnabled: false, accessToken: null });
          await db.createSyncLog({ integration: 'shopify', action: 'disconnect', status: 'success', details: `Disconnected store ${input.storeId}` });
          return { success: true };
        }),
      testConnection: protectedProcedure
        .input(z.object({ storeId: z.number() }))
        .mutation(async ({ input }) => {
          const store = await db.getShopifyStoreById(input.storeId);
          if (!store || !store.accessToken) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Store not found or not connected' });
          const accessToken = safeDecryptToken(store.accessToken);
          const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/shop.json`, {
            headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          });
          if (!response.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: `Shopify API error: ${response.status}` });
          return { success: true, message: 'Connection is active' };
        }),
    }),
  });
