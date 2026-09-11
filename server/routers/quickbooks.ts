// appRouter.quickbooks — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getQuickBooksAuthUrl, refreshQuickBooksToken, getCompanyInfo, getChartOfAccounts, getQuickBooksItems, getProfitAndLoss, parseProfitAndLossReport } from "../_core/quickbooks";
import { ENV } from "../_core/env";
import { adminProcedure, createAuditLog } from "./_shared";

// ============================================
// QUICKBOOKS INTEGRATION
// ============================================
export const quickbooksRouter = router({
    // Get QuickBooks OAuth URL
    getAuthUrl: protectedProcedure.query(({ ctx }) => {
      return getQuickBooksAuthUrl(ctx.user.id);
    }),

    // Diagnostic: reveal the QuickBooks credentials the running server has
    // loaded from env, with the client_id masked. Lets an admin verify that
    // a deploy actually picked up updated env vars without leaking secrets.
    debugConfig: adminProcedure.query(async () => {
      const { getQuickBooksRedirectUri } = await import("../_core/quickbooks");
      const clientId = ENV.quickbooksClientId;
      const mask = (s: string) =>
        s.length <= 8 ? "*".repeat(s.length) : `${s.slice(0, 8)}…${s.slice(-4)}`;
      return {
        clientIdPrefix: clientId ? clientId.slice(0, 8) : null,
        clientIdSuffix: clientId ? clientId.slice(-4) : null,
        clientIdMasked: clientId ? mask(clientId) : null,
        clientIdLength: clientId.length,
        clientSecretSet: !!ENV.quickbooksClientSecret,
        environment: ENV.quickbooksEnvironment,
        redirectUri: getQuickBooksRedirectUri(),
        publicAppUrl: ENV.publicAppUrl,
      };
    }),

    // Get connection status
    getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const token = await db.getQuickBooksOAuthToken(ctx.user.id);
      if (!token) {
        return { connected: false, realmId: null };
      }
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      if (isExpired && token.refreshToken) {
        const refreshResult = await refreshQuickBooksToken(token.refreshToken);
        if (refreshResult.access_token && refreshResult.expires_in) {
          await db.upsertQuickBooksOAuthToken({
            userId: ctx.user.id,
            accessToken: refreshResult.access_token,
            refreshToken: refreshResult.refresh_token || token.refreshToken,
            expiresAt: new Date(Date.now() + (refreshResult.expires_in * 1000)),
            realmId: token.realmId,
            scope: token.scope || "com.intuit.quickbooks.accounting",
          });
          return {
            connected: true,
            realmId: token.realmId,
            needsRefresh: false,
          };
        }
      }
      return { 
        connected: !isExpired, 
        realmId: token.realmId,
        needsRefresh: isExpired 
      };
    }),

    // Disconnect QuickBooks
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteQuickBooksOAuthToken(ctx.user.id);
      await db.createSyncLog({
        integration: 'quickbooks',
        action: 'disconnect',
        status: 'success',
        details: 'QuickBooks disconnected',
      });
      return { success: true };
    }),

    // Test connection
    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const token = await db.getQuickBooksOAuthToken(ctx.user.id);
      if (!token || !token.realmId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
      }

      // Check if token is expired
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      let accessToken = token.accessToken;

      if (isExpired && token.refreshToken) {
        // Try to refresh the token
        const refreshResult = await refreshQuickBooksToken(token.refreshToken);
        if (refreshResult.error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Token expired and refresh failed' });
        }
        
        // Update token in database
        // QuickBooks always returns a new refresh token on token refresh
        await db.upsertQuickBooksOAuthToken({
          userId: ctx.user.id,
          accessToken: refreshResult.access_token!,
          refreshToken: refreshResult.refresh_token!, // QuickBooks always provides a new refresh token
          expiresAt: new Date(Date.now() + (refreshResult.expires_in! * 1000)),
          realmId: token.realmId,
        });
        
        accessToken = refreshResult.access_token!;
      }

      // Test the connection by fetching company info
      const result = await getCompanyInfo(accessToken, token.realmId);
      
      if (result.error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
      }

      return { 
        success: true, 
        message: 'QuickBooks connection is working',
        companyName: result.data?.CompanyInfo?.CompanyName 
      };
    }),

    // Sync Chart of Accounts from QuickBooks
    syncAccounts: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
        }

        const result = await getChartOfAccounts(token.accessToken, token.realmId);
        if (result.error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
        }

        const accounts = result.data?.QueryResponse?.Account || [];
        const companyId = input.companyId || 1; // Default to company 1
        const synced = await db.syncQuickBooksAccounts(companyId, accounts);

        await createAuditLog(ctx.user.id, 'create', 'quickbooks_sync', 0, `Synced ${synced.synced} accounts from QuickBooks`);
        
        return { 
          success: true, 
          synced: synced.synced,
          message: `Successfully synced ${synced.synced} accounts from QuickBooks`
        };
      }),

    // Sync Items/Products from QuickBooks
    syncItems: protectedProcedure
      .input(z.object({ 
        companyId: z.number().optional(),
        type: z.enum(['Inventory', 'NonInventory', 'Service']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
        }

        const result = await getQuickBooksItems(token.accessToken, token.realmId, {
          type: input.type,
          activeOnly: true,
        });
        
        if (result.error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
        }

        const items = result.data?.QueryResponse?.Item || [];
        const companyId = input.companyId || 1;
        const synced = await db.syncQuickBooksItems(companyId, items);

        await createAuditLog(ctx.user.id, 'create', 'quickbooks_sync', 0, `Synced ${synced.synced} items from QuickBooks`);
        
        return { 
          success: true, 
          synced: synced.synced,
          message: `Successfully synced ${synced.synced} items from QuickBooks`
        };
      }),

    // Get QuickBooks accounts for mapping
    getAccounts: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        classification: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']).optional(),
      }).optional())
      .query(async ({ input }) => {
        const companyId = input?.companyId || 1;
        return db.getQuickBooksAccountsByType(input?.classification as any, companyId);
      }),

    // Get account mappings
    getAccountMappings: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }))
      .query(async ({ input }) => {
        const companyId = input.companyId || 1;
        return db.getQuickBooksAccountMappings(companyId);
      }),

    // Create or update account mapping
    upsertAccountMapping: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        mappingType: z.enum([
          'cogs_product',
          'cogs_freight',
          'cogs_customs',
          'inventory_asset',
          'freight_expense',
          'income_sales',
          'expense_other'
        ]),
        quickbooksAccountId: z.string(),
        erpCategoryName: z.string().optional(),
        isDefault: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const companyId = input.companyId || 1;
        const result = await db.upsertQuickBooksAccountMapping({
          companyId,
          mappingType: input.mappingType,
          quickbooksAccountId: input.quickbooksAccountId,
          erpCategoryName: input.erpCategoryName,
          isDefault: input.isDefault ?? true,
          notes: input.notes,
          createdBy: ctx.user.id,
        });

        await createAuditLog(ctx.user.id, 'create', 'quickbooks_mapping', result.id, `Mapped ${input.mappingType} to QB account ${input.quickbooksAccountId}`);

        return { success: true, id: result.id };
      }),

    // Fetch Profit & Loss from QuickBooks and return parsed monthly totals.
    // Drives actual burn / gross margin / EBITDA on the CFO dashboard.
    getProfitAndLoss: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        summarizeBy: z.enum(["Month", "Quarter", "Year"]).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) return { connected: false, months: [] };

        let accessToken = token.accessToken;
        const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
        if (isExpired && token.refreshToken) {
          const refreshResult = await refreshQuickBooksToken(token.refreshToken);
          if (!refreshResult.error && refreshResult.access_token && refreshResult.expires_in) {
            await db.upsertQuickBooksOAuthToken({
              userId: ctx.user.id,
              accessToken: refreshResult.access_token,
              refreshToken: refreshResult.refresh_token ?? token.refreshToken,
              expiresAt: new Date(Date.now() + refreshResult.expires_in * 1000),
              realmId: token.realmId,
            });
            accessToken = refreshResult.access_token;
          }
        }

        const result = await getProfitAndLoss(accessToken, token.realmId, {
          startDate: input?.startDate,
          endDate: input?.endDate,
          summarizeBy: input?.summarizeBy ?? "Month",
        });
        if (result.error) return { connected: true, error: result.error, months: [] };

        const { months, expenseAccounts } = parseProfitAndLossReport(result.data);

        return { connected: true, months, expenseAccounts };
      }),
  });
