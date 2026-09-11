// appRouter.quickbooks — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { getQuickBooksAuthUrl, refreshQuickBooksToken, getCompanyInfo, getChartOfAccounts, getQuickBooksItems, getProfitAndLoss, parseProfitAndLossReport } from "../_core/quickbooks";
import { isMergeConfigured, checkMergeConnection, getMergeCompanyInfo, getMergeAccounts, getMergeItems, getMergeProfitAndLoss } from "../_core/merge";
import { ENV } from "../_core/env";
import { adminProcedure, resolveRequestScope, mergeCompanyExists, assertAccountingProviderValid, createAuditLog } from "./_shared";

// ============================================
// QUICKBOOKS INTEGRATION
// ============================================
export const quickbooksRouter = router({
    // Get QuickBooks OAuth URL
    getAuthUrl: protectedProcedure.query(({ ctx }) => {
      if (ENV.accountingSyncProvider === "invalid") {
        return { error: 'ACCOUNTING_SYNC_PROVIDER is set to an unrecognized value; expected "intuit" or "merge".' };
      }
      if (ENV.accountingSyncProvider === "merge") {
        return {
          error: isMergeConfigured()
            ? "Merge.dev sync is active — no in-app OAuth needed. Manage the linked account from the Merge dashboard."
            : "Merge.dev sync is selected but not configured. Set MERGE_API_KEY, MERGE_ACCOUNT_TOKEN and MERGE_COMPANY_ID (link the QuickBooks account from the Merge dashboard first).",
        };
      }
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
        provider: ENV.accountingSyncProvider,
        mergeApiKeySet: !!ENV.mergeApiKey,
        mergeAccountTokenSet: !!ENV.mergeAccountToken,
        // Sanitized: validity + value, never the API credentials.
        mergeCompanyIdValid: Number.isInteger(ENV.mergeCompanyId) && ENV.mergeCompanyId > 0,
        mergeCompanyId: Number.isInteger(ENV.mergeCompanyId) ? ENV.mergeCompanyId : null,
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
      if (ENV.accountingSyncProvider === "invalid") {
        return { connected: false, realmId: null, companyName: null, provider: "invalid" };
      }
      if (ENV.accountingSyncProvider === "merge") {
        // The linked Merge account belongs to one ERP entity; users scoped
        // away from it must not see its connection details.
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, ENV.mergeCompanyId) || !(await mergeCompanyExists())) {
          return { connected: false, realmId: null, companyName: null, provider: "merge" };
        }
        // Reachability, not just env presence: an invalid token or unlinked
        // account should not report as connected. Cached ~60s in merge.ts.
        // realmId stays an Intuit-only identifier; the linked company's name
        // travels in its own field.
        const check = await checkMergeConnection();
        return { connected: check.connected, realmId: null, companyName: check.companyName ?? null, provider: "merge" };
      }
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
      if (ENV.accountingSyncProvider === "merge") {
        // The Merge connection is env-managed; deleting the per-user Intuit
        // token would report success while changing nothing.
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Accounting sync is managed via Merge.dev env config. Remove MERGE_API_KEY / MERGE_ACCOUNT_TOKEN (or unlink the account in the Merge dashboard) to disconnect.',
        });
      }
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
      assertAccountingProviderValid();
      if (ENV.accountingSyncProvider === "merge") {
        // Same visibility rule as getConnectionStatus: don't reveal the
        // linked company's name to users scoped away from its entity.
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, ENV.mergeCompanyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'The accounting connection belongs to an entity outside your access.' });
        }
        // Same fail-closed rule as status and syncs: the configured entity
        // must exist before any Merge state is reported.
        if (!(await mergeCompanyExists())) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `MERGE_COMPANY_ID ${ENV.mergeCompanyId} does not match an existing company.` });
        }
        const info = await getMergeCompanyInfo();
        if (info.error) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: info.error });
        }
        return { success: true, message: 'Merge.dev connection is working', companyName: info.name };
      }
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
        assertAccountingProviderValid();
        // Default target: in Merge mode the linked entity, otherwise the
        // caller's own entity (the UI calls this with {}). Company 1 only as
        // the legacy fallback for users with no home entity.
        const companyId = input.companyId
          || (ENV.accountingSyncProvider === "merge" ? ENV.mergeCompanyId : (ctx.user.companyId ?? 1));

        // The synced rows are persisted under companyId — refuse a target
        // entity outside the caller's scope.
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot sync accounts into an entity outside your access.' });
        }

        if (ENV.accountingSyncProvider === "merge") {
          // The process-wide Merge account is bound to one ERP entity —
          // refuse to copy the linked company's chart into any other.
          if (companyId !== ENV.mergeCompanyId) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `The linked Merge account belongs to company ${ENV.mergeCompanyId}; cannot sync into company ${companyId}.` });
          }
          if (!(await mergeCompanyExists())) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `MERGE_COMPANY_ID ${ENV.mergeCompanyId} does not match an existing company.` });
          }
          const res = await getMergeAccounts(companyId);
          if (res.error) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: res.error });
          }
          const synced = await db.syncQuickBooksAccountsForCompany(companyId, res.accounts ?? []);
          await createAuditLog(ctx.user.id, 'create', 'quickbooks_sync', 0, `Synced ${synced.synced} accounts from Merge`);
          return {
            success: true,
            synced: synced.synced,
            message: `Successfully synced ${synced.synced} accounts from Merge`,
          };
        }

        const token = await db.getQuickBooksOAuthToken(ctx.user.id);
        if (!token || !token.realmId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'QuickBooks not connected' });
        }

        const result = await getChartOfAccounts(token.accessToken, token.realmId);
        if (result.error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
        }

        // Map raw QuickBooks objects onto our column names and use the
        // company-scoped upsert so direct-mode rows are entity-scoped too.
        const accounts = (result.data?.QueryResponse?.Account || []).map((a: any) => ({
          companyId,
          quickbooksAccountId: String(a.Id),
          name: a.Name ?? "Unnamed account",
          accountType: a.AccountType ?? null,
          accountSubType: a.AccountSubType ?? null,
          classification: a.Classification ?? null,
          fullyQualifiedName: a.FullyQualifiedName ?? null,
          active: a.Active !== false,
          currentBalance: a.CurrentBalance != null ? String(a.CurrentBalance) : null,
          currency: a.CurrencyRef?.value ?? "USD",
          lastSyncedAt: new Date(),
        }));
        const synced = await db.syncQuickBooksAccountsForCompany(companyId, accounts);

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
        assertAccountingProviderValid();
        // Same defaulting rule as syncAccounts.
        const companyId = input.companyId
          || (ENV.accountingSyncProvider === "merge" ? ENV.mergeCompanyId : (ctx.user.companyId ?? 1));

        // Same scope rule as syncAccounts: rows land under companyId.
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot sync items into an entity outside your access.' });
        }

        if (ENV.accountingSyncProvider === "merge") {
          // Same binding rule as syncAccounts.
          if (companyId !== ENV.mergeCompanyId) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `The linked Merge account belongs to company ${ENV.mergeCompanyId}; cannot sync into company ${companyId}.` });
          }
          if (!(await mergeCompanyExists())) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `MERGE_COMPANY_ID ${ENV.mergeCompanyId} does not match an existing company.` });
          }
          const res = await getMergeItems(companyId, { type: input.type });
          if (res.error) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: res.error });
          }
          const synced = await db.syncQuickBooksItemsForCompany(companyId, res.items ?? []);
          await createAuditLog(ctx.user.id, 'create', 'quickbooks_sync', 0, `Synced ${synced.synced} items from Merge`);
          return {
            success: true,
            synced: synced.synced,
            message: `Successfully synced ${synced.synced} items from Merge`,
          };
        }

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

        // Same column mapping + company-scoped upsert as syncAccounts.
        const items = (result.data?.QueryResponse?.Item || []).map((i: any) => ({
          companyId,
          quickbooksItemId: String(i.Id),
          name: i.Name ?? "Unnamed item",
          sku: i.Sku ?? null,
          type: i.Type ?? null,
          description: i.Description ?? null,
          unitPrice: i.UnitPrice != null ? String(i.UnitPrice) : null,
          purchaseCost: i.PurchaseCost != null ? String(i.PurchaseCost) : null,
          quantityOnHand: i.QtyOnHand != null ? String(i.QtyOnHand) : null,
          incomeAccountId: i.IncomeAccountRef?.value ?? null,
          expenseAccountId: i.ExpenseAccountRef?.value ?? null,
          assetAccountId: i.AssetAccountRef?.value ?? null,
          active: i.Active !== false,
          lastSyncedAt: new Date(),
        }));
        const synced = await db.syncQuickBooksItemsForCompany(companyId, items);

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
      .query(async ({ input, ctx }) => {
        if (ENV.accountingSyncProvider === "invalid") return [];
        const companyId = input?.companyId
          || (ENV.accountingSyncProvider === "merge" ? ENV.mergeCompanyId : (ctx.user.companyId ?? 1));
        // In Merge mode the accounting data is bound to the linked entity —
        // a caller-supplied override of any other company reads nothing.
        if (ENV.accountingSyncProvider === "merge" && companyId !== ENV.mergeCompanyId) return [];
        // Synced accounts are entity data — hide them from users scoped away.
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, companyId)) return [];
        // Filter on the classification column the sync paths populate — the
        // ...ByType helper filters accountType, which holds provider types.
        return db.getQuickBooksAccountsByClassification(companyId, input?.classification);
      }),

    // Get account mappings
    getAccountMappings: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (ENV.accountingSyncProvider === "invalid") return [];
        const companyId = input.companyId
          || (ENV.accountingSyncProvider === "merge" ? ENV.mergeCompanyId : (ctx.user.companyId ?? 1));
        // Same Merge binding rule as getAccounts.
        if (ENV.accountingSyncProvider === "merge" && companyId !== ENV.mergeCompanyId) return [];
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, companyId)) return [];
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
        assertAccountingProviderValid();
        const companyId = input.companyId
          || (ENV.accountingSyncProvider === "merge" ? ENV.mergeCompanyId : (ctx.user.companyId ?? 1));
        // In Merge mode mapping writes are bound to the linked entity, like
        // the syncs.
        if (ENV.accountingSyncProvider === "merge" && companyId !== ENV.mergeCompanyId) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `The linked Merge account belongs to company ${ENV.mergeCompanyId}; cannot write mappings for company ${companyId}.` });
        }
        // Mapping writes land under companyId — same scope rule as syncs.
        const scope = await resolveRequestScope(ctx.user);
        if (!scopeAllows(scope, companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify account mappings for an entity outside your access.' });
        }
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
        if (ENV.accountingSyncProvider === "invalid") return { connected: false, months: [] };
        if (ENV.accountingSyncProvider === "merge") {
          // The linked Merge account's P&L belongs to one ERP entity; users
          // scoped away from it must not see those actuals.
          const scope = await resolveRequestScope(ctx.user);
          if (!scopeAllows(scope, ENV.mergeCompanyId) || !(await mergeCompanyExists())) {
            return { connected: false, months: [] };
          }
          // Same reachability semantics as getConnectionStatus: an invalid
          // token or unlinked account reports as not connected, not as a
          // connected provider with an error.
          const check = await checkMergeConnection();
          if (!check.connected) return { connected: false, months: [] };
          const res = await getMergeProfitAndLoss({
            startDate: input?.startDate,
            endDate: input?.endDate,
            summarizeBy: input?.summarizeBy ?? "Month",
          });
          // A transient report failure after reachability succeeded keeps
          // connected: true (matching the Intuit branch) so the dashboard
          // doesn't silently fall back to proxy data.
          if (res.error) return { connected: true, error: res.error, months: [] };
          return { connected: true, months: res.report!.months, expenseAccounts: res.report!.expenseAccounts };
        }

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
