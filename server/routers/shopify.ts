// appRouter.shopify — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { safeDecryptToken } from "../_core/crypto";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure } from "./_shared";

// ============================================
// SHOPIFY INTEGRATION
// ============================================
export const shopifyRouter = router({
    stores: router({
      list: protectedProcedure.query(async () => {
        return db.getShopifyStores();
      }),
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifyStoreById(input.id);
        }),
      create: protectedProcedure
        .input(z.object({
          storeName: z.string(),
          storeDomain: z.string(),
          apiKey: z.string().optional(),
          apiSecret: z.string().optional(),
          accessToken: z.string().optional(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifyStore(input);
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          storeName: z.string().optional(),
          isEnabled: z.boolean().optional(),
          syncOrders: z.boolean().optional(),
          syncInventory: z.boolean().optional(),
          lastSyncAt: z.date().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateShopifyStore(id, data);
          return { success: true };
        }),
    }),
    skuMappings: router({
      list: protectedProcedure
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifySkuMappings(input.storeId);
        }),
      create: protectedProcedure
        .input(z.object({
          storeId: z.number(),
          shopifyProductId: z.string(),
          shopifyVariantId: z.string(),
          productId: z.number(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifySkuMapping(input);
        }),
    }),
    locationMappings: router({
      // Admin-only across the board: location→warehouse routing (and the
      // warehouse ids it exposes) is an admin/Settings concern, so the list
      // read is gated to match the mutations below.
      list: adminProcedure
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifyLocationMappings(input.storeId);
        }),
      // Location→warehouse routing drives where synced inventory lands, so
      // restrict mutations to admins (matches Settings being admin-only).
      create: adminProcedure
        .input(z.object({
          storeId: z.number(),
          shopifyLocationId: z.string(),
          shopifyLocationName: z.string().optional(),
          warehouseId: z.number(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifyLocationMapping(input);
        }),
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          storeId: z.number(),
          shopifyLocationId: z.string().optional(),
          shopifyLocationName: z.string().optional(),
          warehouseId: z.number().optional(),
          isActive: z.boolean().optional(),
        }).refine(
          (v) => v.shopifyLocationId !== undefined || v.shopifyLocationName !== undefined || v.warehouseId !== undefined || v.isActive !== undefined,
          { message: "At least one field to update must be provided" },
        ))
        .mutation(async ({ input }) => {
          // Scope the write by (id, storeId) so a mapping can only be mutated
          // through the store it belongs to.
          const { id, storeId, ...data } = input;
          return db.updateShopifyLocationMapping(id, storeId, data);
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number(), storeId: z.number() }))
        .mutation(async ({ input }) => {
          return db.deleteShopifyLocationMapping(input.id, input.storeId);
        }),
    }),
    // Sync operations
    sync: router({
      // Sync orders from Shopify store
      orders: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalImported = 0;
          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/orders.json?status=any&limit=50`, {
                headers: {
                  'X-Shopify-Access-Token': safeDecryptToken(store.accessToken!),
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const orders = data.orders || [];

              for (const order of orders) {
                const existingOrder = await db.getSalesOrderByShopifyId(order.id.toString());
                if (existingOrder) {
                  await db.updateSalesOrder(existingOrder.id, {
                    status: order.fulfillment_status === 'fulfilled' ? 'delivered' :
                            order.financial_status === 'paid' ? 'confirmed' : 'pending',
                    totalAmount: order.total_price,
                  });
                  totalUpdated++;
                } else {
                  // Find or create customer
                  let customerId: number | undefined;
                  if (order.customer?.email) {
                    const customer = await db.getCustomerByEmail(order.customer.email);
                    if (customer) {
                      customerId = customer.id;
                    }
                  }

                  await db.createSalesOrder({
                    shopifyOrderId: order.id.toString(),
                    source: 'shopify',
                    status: order.fulfillment_status === 'fulfilled' ? 'delivered' :
                            order.financial_status === 'paid' ? 'confirmed' : 'pending',
                    orderDate: new Date(order.created_at),
                    totalAmount: order.total_price,
                    customerId,
                    shippingAddress: JSON.stringify(order.shipping_address),
                    notes: `Shopify Order: ${order.name}`,
                  });
                  totalImported++;
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing orders from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_orders',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Imported ${totalImported}, Updated ${totalUpdated}`,
            recordsProcessed: totalImported + totalUpdated,
            recordsFailed: totalErrors,
          });

          return { imported: totalImported, updated: totalUpdated, errors: totalErrors };
        }),

      // Sync products from Shopify store
      products: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalImported = 0;
          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/products.json?limit=100`, {
                headers: {
                  'X-Shopify-Access-Token': safeDecryptToken(store.accessToken!),
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const products = data.products || [];

              for (const product of products) {
                const existingProduct = await db.getProductBySku(product.variants[0]?.sku || `SHOP-${product.id}`);
                if (existingProduct) {
                  await db.updateProduct(existingProduct.id, {
                    name: product.title,
                    unitPrice: product.variants[0]?.price || '0',
                    description: product.body_html ? product.body_html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '') : '',
                    status: product.status === 'active' ? 'active' : 'inactive',
                  } as any);
                  totalUpdated++;
                } else {
                  await db.createProduct({
                    name: product.title,
                    sku: product.variants[0]?.sku || `SHOP-${product.id}`,
                    description: product.body_html ? product.body_html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '') : '',
                    unitPrice: product.variants[0]?.price || '0',
                    status: product.status === 'active' ? 'active' : 'inactive',
                    category: product.product_type || 'General',
                  } as any);
                  totalImported++;
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing products from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_products',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Imported ${totalImported}, Updated ${totalUpdated}`,
            recordsProcessed: totalImported + totalUpdated,
            recordsFailed: totalErrors,
          });

          return { imported: totalImported, updated: totalUpdated, errors: totalErrors };
        }),

      // Sync inventory from Shopify store
      inventory: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const token = safeDecryptToken(store.accessToken!);
              const apiBase = `https://${store.storeDomain}/admin/api/2024-01`;

              // Step 1: Fetch active locations (inventory_levels requires location_ids)
              const locResp = await fetch(`${apiBase}/locations.json`, {
                headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
              });
              if (!locResp.ok) throw new Error(`Shopify locations API error: ${locResp.status}`);
              const locData = await locResp.json();
              const locationIds: number[] = (locData.locations || [])
                .filter((l: any) => l.active)
                .map((l: any) => l.id);

              if (locationIds.length === 0) {
                console.warn(`[Shopify Sync] No active locations for ${store.storeDomain}, skipping inventory sync`);
                await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
                continue;
              }

              // Step 2: Fetch inventory levels for those locations, following
              // Shopify's Link-header cursor pagination so stores with more than
              // one page (>250) of levels aren't silently truncated.
              const parseNextLink = (linkHeader: string | null): string | null => {
                if (!linkHeader) return null;
                for (const part of linkHeader.split(',')) {
                  const m = part.match(/<([^>]+)>;\s*rel="next"/);
                  if (m) return m[1];
                }
                return null;
              };

              const levels: any[] = [];
              let nextUrl: string | null = `${apiBase}/inventory_levels.json?location_ids=${locationIds.join(',')}&limit=250`;
              let pageGuard = 0;
              while (nextUrl && pageGuard < 100) {
                pageGuard++;
                const response = await fetch(nextUrl, {
                  headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json',
                  },
                });
                if (!response.ok) {
                  throw new Error(`Shopify API error: ${response.status}`);
                }
                const data = await response.json();
                levels.push(...(data.inventory_levels || []));
                nextUrl = parseNextLink(response.headers.get('link'));
              }
              if (nextUrl) {
                console.warn(`[Shopify Sync] inventory_levels pagination hit the ${pageGuard}-page cap for ${store.storeDomain}; inventory sync may be incomplete`);
              }

              // Get SKU mappings for this store
              const mappings = await db.getShopifySkuMappings(store.id);

              // Shopify inventory_levels are keyed by inventory_item_id, which is
              // NOT the variant id we store on the mapping. Backfill each mapping's
              // inventory_item_id from the Shopify variant (once) so we can match.
              for (const mapping of mappings) {
                if (mapping.shopifyInventoryItemId || !mapping.shopifyVariantId) continue;
                try {
                  const variantResp = await fetch(`${apiBase}/variants/${mapping.shopifyVariantId}.json`, {
                    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
                  });
                  if (!variantResp.ok) continue;
                  const variantData = await variantResp.json();
                  const inventoryItemId = variantData.variant?.inventory_item_id;
                  if (inventoryItemId != null) {
                    mapping.shopifyInventoryItemId = inventoryItemId.toString();
                    await db.updateShopifySkuMapping(mapping.id, { shopifyInventoryItemId: mapping.shopifyInventoryItemId });
                  }
                } catch (e) {
                  console.warn(`[Shopify Sync] Failed to resolve inventory_item_id for variant ${mapping.shopifyVariantId}:`, e);
                }
              }

              // Route each level to a warehouse via the store's location mappings.
              // inventory_levels are per-location, so with location mappings we
              // update the (product, warehouse) row for the level's location.
              const locationMappings = await db.getShopifyLocationMappings(store.id);
              const activeLocationMappings = locationMappings.filter(m => m.isActive !== false);
              const warehouseByLocationId = new Map(
                activeLocationMappings.map(m => [m.shopifyLocationId, m.warehouseId] as const)
              );

              // Index mappings by inventory_item_id for O(1) lookup per level.
              const mappingByInventoryItemId = new Map(
                mappings.filter(m => m.shopifyInventoryItemId).map(m => [m.shopifyInventoryItemId!, m] as const)
              );

              // Pre-fetch every inventory row for the mapped products in one
              // query and index it, so the per-level loop below does in-memory
              // lookups instead of a DB read per inventory level (avoids N+1).
              const inventoryRows = await db.getInventoryByProductIds(
                [...new Set(mappings.map(m => m.productId))]
              );
              const inventoryByProductWarehouse = new Map(
                inventoryRows.map(r => [`${r.productId}:${r.warehouseId}`, r] as const)
              );
              const inventoryByProduct = new Map<number, typeof inventoryRows[number]>();
              for (const r of inventoryRows) {
                if (!inventoryByProduct.has(r.productId)) inventoryByProduct.set(r.productId, r);
              }

              for (const level of levels) {
                const mapping = mappingByInventoryItemId.get(level.inventory_item_id.toString());
                if (!mapping) continue;
                const quantity = level.available?.toString() || '0';

                if (activeLocationMappings.length > 0) {
                  // The store has configured location→warehouse routing.
                  const warehouseId = warehouseByLocationId.get(level.location_id?.toString());
                  if (warehouseId == null) {
                    // Location isn't mapped to a warehouse — don't guess where it lands.
                    console.warn(`[Shopify Sync] No warehouse mapping for location ${level.location_id} in ${store.storeDomain}, skipping level`);
                    continue;
                  }
                  const inventory = inventoryByProductWarehouse.get(`${mapping.productId}:${warehouseId}`);
                  if (inventory) {
                    await db.updateInventory(inventory.id, { quantity });
                    totalUpdated++;
                  } else {
                    console.warn(`[Shopify Sync] No inventory row for product ${mapping.productId} at warehouse ${warehouseId}, skipping`);
                  }
                } else {
                  // No location mappings configured — fall back to product-level update.
                  const inventory = inventoryByProduct.get(mapping.productId);
                  if (inventory) {
                    await db.updateInventory(inventory.id, { quantity });
                    totalUpdated++;
                  }
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing inventory from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_inventory',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Updated ${totalUpdated} inventory records`,
            recordsProcessed: totalUpdated,
            recordsFailed: totalErrors,
          });

          return { updated: totalUpdated, errors: totalErrors };
        }),

      // Sync customers from Shopify store
      customers: protectedProcedure
        .input(z.object({ storeId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const stores = input.storeId
            ? [await db.getShopifyStoreById(input.storeId)]
            : await db.getShopifyStores();

          const activeStores = stores.filter(s => s && s.isEnabled && s.accessToken);
          if (activeStores.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active Shopify stores configured' });
          }

          let totalImported = 0;
          let totalUpdated = 0;
          let totalErrors = 0;

          for (const store of activeStores) {
            if (!store) continue;
            try {
              const response = await fetch(`https://${store.storeDomain}/admin/api/2024-01/customers.json?limit=100`, {
                headers: {
                  'X-Shopify-Access-Token': safeDecryptToken(store.accessToken!),
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const customers = data.customers || [];

              for (const customer of customers) {
                const existingCustomer = await db.getCustomerByEmail(customer.email);
                if (existingCustomer) {
                  await db.updateCustomer(existingCustomer.id, {
                    name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || existingCustomer.name,
                    phone: customer.phone || existingCustomer.phone,
                    shopifyCustomerId: customer.id.toString(),
                  });
                  totalUpdated++;
                } else if (customer.email) {
                  await db.createCustomer({
                    name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Shopify Customer',
                    email: customer.email,
                    phone: customer.phone || '',
                    shopifyCustomerId: customer.id.toString(),
                    syncSource: 'shopify',
                  });
                  totalImported++;
                }
              }

              await db.updateShopifyStore(store.id, { lastSyncAt: new Date() });
            } catch (error) {
              totalErrors++;
              console.error(`Error syncing customers from ${store.storeName}:`, error);
            }
          }

          await db.createSyncLog({
            integration: 'shopify',
            action: 'sync_customers',
            status: totalErrors > 0 ? 'warning' : 'success',
            details: `Imported ${totalImported}, Updated ${totalUpdated}`,
            recordsProcessed: totalImported + totalUpdated,
            recordsFailed: totalErrors,
          });

          return { imported: totalImported, updated: totalUpdated, errors: totalErrors };
        }),
    }),
  });
