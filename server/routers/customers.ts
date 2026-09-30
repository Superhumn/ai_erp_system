// appRouter.customers — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { CUSTOMER_SORTS, MAX_PAGE_LIMIT } from "../listPaging";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { adminProcedure, scopedProcedure, createAuditLog } from "./_shared";

// ============================================
// CUSTOMER MANAGEMENT
// ============================================
export const customersRouter = router({
    // Scope is derived server-side from the caller's identity (ctx.scope), never from client input.
    list: scopedProcedure
      .query(({ ctx }) => db.getCustomers(ctx.scope)),
    // One page (newest first) plus the total for the same filters.
    listPaged: scopedProcedure
      .input(z.object({
        status: z.string().optional(),
        source: z.enum(["shopify", "manual"]).optional(),
        sortBy: z.enum(CUSTOMER_SORTS).optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional())
      .query(({ input, ctx }) => db.getCustomersPaged(ctx.scope, input ?? {})),
    get: scopedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input, ctx }) => db.getCustomerById(input.id, ctx.scope)),
    create: scopedProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['individual', 'business']).optional(),
        creditLimit: z.string().optional(),
        paymentTerms: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Can't create a customer under an entity the caller doesn't have access to.
        if (input.companyId != null && !scopeAllows(ctx.scope, input.companyId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot create a customer under an entity outside your access.' });
        }
        const companyId = input.companyId ?? ctx.user.companyId ?? null;
        const result = await db.createCustomer({ ...input, companyId });
        await createAuditLog(ctx.user.id, 'create', 'customer', result.id, input.name);
        return result;
      }),
    update: scopedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        status: z.enum(['active', 'inactive', 'prospect']).optional(),
        creditLimit: z.string().optional(),
        paymentTerms: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        // Scoped lookup: a customer outside the caller's entities reads as not found.
        const existing = await db.getCustomerById(id, ctx.scope);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
        await db.updateCustomer(id, data);
        await createAuditLog(ctx.user.id, 'update', 'customer', id);
        return { success: true };
      }),
    delete: scopedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await db.getCustomerById(input.id, ctx.scope);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
        await db.deleteCustomer(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'customer', input.id);
        return { success: true };
      }),
    
    // Shopify sync
    syncFromShopify: adminProcedure
      .input(z.object({ shopifyAccessToken: z.string(), shopifyStoreDomain: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { shopifyAccessToken, shopifyStoreDomain } = input;
        
        // Fetch customers from Shopify
        const response = await fetch(`https://${shopifyStoreDomain}/admin/api/2024-01/customers.json`, {
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Failed to fetch Shopify customers' });
        }
        
        const data = await response.json();
        const shopifyCustomers = data.customers || [];
        
        let imported = 0;
        let updated = 0;
        let skipped = 0;

        // Bulk-load existing customers by Shopify ID to avoid a lookup per record.
        const shopifyIds = [...new Set(shopifyCustomers.map((sc: any) => sc.id.toString()))] as string[];
        const existingByShopifyId = new Map(
          (await db.getCustomersByShopifyIds(shopifyIds))
            .filter((c) => c.shopifyCustomerId != null)
            .map((c) => [c.shopifyCustomerId, c]),
        );

        for (const sc of shopifyCustomers) {
          // Check if customer already exists by Shopify ID (from the bulk map)
          const existing = existingByShopifyId.get(sc.id.toString());
          
          const customerData = {
            name: `${sc.first_name || ''} ${sc.last_name || ''}`.trim() || sc.email || 'Unknown',
            email: sc.email || undefined,
            phone: sc.phone || undefined,
            address: sc.default_address?.address1 || undefined,
            city: sc.default_address?.city || undefined,
            state: sc.default_address?.province || undefined,
            country: sc.default_address?.country || undefined,
            postalCode: sc.default_address?.zip || undefined,
            type: 'individual' as const,
            shopifyCustomerId: sc.id.toString(),
            syncSource: 'shopify' as const,
            lastSyncedAt: new Date(),
            shopifyData: JSON.stringify(sc),
          };
          
          if (existing) {
            await db.updateCustomer(existing.id, customerData);
            updated++;
          } else {
            await db.createCustomer(customerData);
            imported++;
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'shopify_sync', 0, `Imported ${imported}, Updated ${updated}`);
        
        return { imported, updated, skipped, total: shopifyCustomers.length };
      }),
    
    // Get sync status
    getSyncStatus: scopedProcedure.query(async ({ ctx }) => {
      const customers = await db.getCustomers(ctx.scope);
      const shopifyCount = customers.filter(c => c.shopifyCustomerId).length;
      const manualCount = customers.filter(c => !c.shopifyCustomerId).length;

      return {
        total: customers.length,
        shopify: shopifyCount,
        manual: manualCount,
      };
    }),
  });
