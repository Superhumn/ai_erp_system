import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { router, publicProcedure, protectedProcedure, adminProcedure, createAuditLog, generateNumber } from "./middleware";

export const salesRouter = router({
  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================
  customers: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getCustomers(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getCustomerById(input.id)),
    create: protectedProcedure
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
        const result = await db.createCustomer(input);
        await createAuditLog(ctx.user.id, 'create', 'customer', result.id, input.name);
        return result;
      }),
    update: protectedProcedure
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
        await db.updateCustomer(id, data);
        await createAuditLog(ctx.user.id, 'update', 'customer', id);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
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
        
        for (const sc of shopifyCustomers) {
          // Check if customer already exists by Shopify ID
          const existing = await db.getCustomerByShopifyId(sc.id.toString());
          
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
    getSyncStatus: protectedProcedure.query(async () => {
      const customers = await db.getCustomers();
      const shopifyCount = customers.filter(c => c.shopifyCustomerId).length;
      const manualCount = customers.filter(c => !c.shopifyCustomerId).length;

      return {
        total: customers.length,
        shopify: shopifyCount,
        manual: manualCount,
      };
    }),
  }),
  // ============================================
  // SALES - ORDERS
  // ============================================
  orders: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getOrders(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getOrderWithItems(input.id)),
    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        customerId: z.number().optional(),
        type: z.enum(['sales', 'return']).optional(),
        orderDate: z.date(),
        shippingAddress: z.string().optional(),
        billingAddress: z.string().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        shippingAmount: z.string().optional(),
        discountAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          sku: z.string().optional(),
          name: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxAmount: z.string().optional(),
          discountAmount: z.string().optional(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...orderData } = input;
        const orderNumber = generateNumber('ORD');
        const result = await db.createOrder({ ...orderData, orderNumber, createdBy: ctx.user.id });
        
        if (items && items.length > 0) {
          for (const item of items) {
            await db.createOrderItem({ ...item, orderId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'order', result.id, orderNumber);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateOrder(id, data);
        await createAuditLog(ctx.user.id, 'update', 'order', id);
        return { success: true };
      }),
  }),
  // ============================================
  // SHOPIFY INTEGRATION
  // ============================================
  shopify: router({
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
          isActive: z.boolean().optional(),
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
      list: protectedProcedure
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
          return db.getShopifyLocationMappings(input.storeId);
        }),
      create: protectedProcedure
        .input(z.object({
          storeId: z.number(),
          shopifyLocationId: z.string(),
          warehouseId: z.number(),
          isActive: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return db.createShopifyLocationMapping(input);
        }),
    }),
    // Webhook handler (would be called by Shopify webhooks)
    handleWebhook: publicProcedure
      .input(z.object({
        topic: z.string(),
        shopDomain: z.string(),
        payload: z.any(),
        idempotencyKey: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Check idempotency
        const existing = await db.getWebhookEventByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          return { success: true, message: 'Already processed' };
        }
        
        // Get store
        const store = await db.getShopifyStoreByDomain(input.shopDomain);
        if (!store) {
          throw new Error('Unknown store');
        }
        
        // Create webhook event
        const { id: eventId } = await db.createWebhookEvent({
          source: 'shopify',
          topic: input.topic,
          payload: JSON.stringify(input.payload),
          idempotencyKey: input.idempotencyKey,
          status: 'received',
        });
        
        try {
          // Process based on topic
          if (input.topic === 'orders/create' || input.topic === 'orders/updated') {
            // Create/update sales order from Shopify order
            const shopifyOrder = input.payload;
            const existingOrder = await db.getSalesOrderByShopifyId(shopifyOrder.id.toString());
            
            if (existingOrder) {
              await db.updateSalesOrder(existingOrder.id, {
                status: mapShopifyOrderStatusToDb(shopifyOrder.financial_status, shopifyOrder.fulfillment_status),
                totalAmount: shopifyOrder.total_price,
              });
            } else {
              const { id: orderId } = await db.createSalesOrder({
                source: 'shopify',
                shopifyOrderId: shopifyOrder.id.toString(),
                customerId: undefined,
                status: mapShopifyOrderStatusToDb(shopifyOrder.financial_status, shopifyOrder.fulfillment_status),
                orderDate: new Date(shopifyOrder.created_at),
                totalAmount: shopifyOrder.total_price,
                currency: shopifyOrder.currency,
                shippingAddress: JSON.stringify(shopifyOrder.shipping_address),
              });
              
              // Create order lines
              for (const item of shopifyOrder.line_items || []) {
                const product = await db.getProductByShopifySku(store.id, item.variant_id?.toString());
                if (product) {
                  await db.createSalesOrderLine({
                    salesOrderId: orderId,
                    productId: product.id,
                    shopifyLineItemId: item.id?.toString(),
                    sku: item.sku,
                    quantity: item.quantity?.toString() || '0',
                    unitPrice: item.price || '0',
                    totalPrice: (parseFloat(item.price || '0') * (item.quantity || 0)).toString(),
                  });
                }
              }
            }
          }
          
          await db.updateWebhookEvent(eventId, { status: 'processed', processedAt: new Date() });
          return { success: true };
        } catch (error) {
          await db.updateWebhookEvent(eventId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
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
                  'X-Shopify-Access-Token': store.accessToken!,
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
                  'X-Shopify-Access-Token': store.accessToken!,
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
                    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
                    isActive: product.status === 'active',
                  } as any);
                  totalUpdated++;
                } else {
                  await db.createProduct({
                    name: product.title,
                    sku: product.variants[0]?.sku || `SHOP-${product.id}`,
                    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
                    unitPrice: product.variants[0]?.price || '0',
                    isActive: product.status === 'active',
                    category: product.product_type || 'General',
                    source: 'shopify',
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
              const apiBase = `https://${store.storeDomain}/admin/api/2024-01`;

              // Step 1: Fetch active locations (inventory_levels requires location_ids)
              const locResp = await fetch(`${apiBase}/locations.json`, {
                headers: { 'X-Shopify-Access-Token': store.accessToken!, 'Content-Type': 'application/json' },
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

              // Step 2: Fetch inventory levels for those locations
              const response = await fetch(`${apiBase}/inventory_levels.json?location_ids=${locationIds.join(',')}&limit=250`, {
                headers: { 'X-Shopify-Access-Token': store.accessToken!, 'Content-Type': 'application/json' },
              });

              if (!response.ok) {
                throw new Error(`Shopify API error: ${response.status}`);
              }

              const data = await response.json();
              const levels = data.inventory_levels || [];

              // Get SKU mappings for this store
              const mappings = await db.getShopifySkuMappings(store.id);

              // Shopify inventory_levels are keyed by inventory_item_id, NOT the
              // variant id we store on the mapping. Backfill each mapping's
              // inventory_item_id from the Shopify variant (once) so we can match.
              for (const mapping of mappings) {
                if (mapping.shopifyInventoryItemId || !mapping.shopifyVariantId) continue;
                try {
                  const variantResp = await fetch(`${apiBase}/variants/${mapping.shopifyVariantId}.json`, {
                    headers: { 'X-Shopify-Access-Token': store.accessToken!, 'Content-Type': 'application/json' },
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
              const locationMappings = await db.getShopifyLocationMappings(store.id);
              const activeLocationMappings = locationMappings.filter(m => m.isActive !== false);
              const warehouseByLocationId = new Map(
                activeLocationMappings.map(m => [m.shopifyLocationId, m.warehouseId] as const)
              );

              for (const level of levels) {
                const mapping = mappings.find(m => m.shopifyInventoryItemId === level.inventory_item_id.toString());
                if (!mapping) continue;
                const quantity = level.available?.toString() || '0';

                if (activeLocationMappings.length > 0) {
                  const warehouseId = warehouseByLocationId.get(level.location_id?.toString());
                  if (warehouseId == null) {
                    console.warn(`[Shopify Sync] No warehouse mapping for location ${level.location_id} in ${store.storeDomain}, skipping level`);
                    continue;
                  }
                  const inventory = await db.getInventoryByProductAndWarehouse(mapping.productId, warehouseId);
                  if (inventory) {
                    await db.updateInventory(inventory.id, { quantity });
                    totalUpdated++;
                  } else {
                    console.warn(`[Shopify Sync] No inventory row for product ${mapping.productId} at warehouse ${warehouseId}, skipping`);
                  }
                } else {
                  const inventory = await db.getInventoryByProductId(mapping.productId);
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
                  'X-Shopify-Access-Token': store.accessToken!,
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
  }),
  // ============================================
  // SALES ORDERS
  // ============================================
  salesOrders: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'confirmed', 'allocated', 'picking', 'shipped', 'delivered', 'cancelled']).optional(),
        source: z.enum(['shopify', 'amazon', 'manual', 'api']).optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSalesOrders(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const order = await db.getSalesOrderById(input.id);
        if (!order) return null;
        const lines = await db.getSalesOrderLines(input.id);
        const reservations = await db.getInventoryReservations(input.id);
        return { ...order, lines, reservations };
      }),
    create: protectedProcedure
      .input(z.object({
        customerId: z.number().optional(),
        source: z.enum(['shopify', 'manual', 'api', 'other']).default('manual'),
        orderDate: z.date().optional(),
        requestedShipDate: z.date().optional(),
        shippingAddress: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(z.object({
          productId: z.number(),
          quantity: z.string(),
          unitPrice: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const totalAmount = input.lines.reduce((sum, line) => {
          return sum + parseFloat(line.quantity) * parseFloat(line.unitPrice);
        }, 0);
        
        const { id: orderId, orderNumber } = await db.createSalesOrder({
          customerId: input.customerId,
          source: input.source,
          status: 'pending',
          orderDate: input.orderDate || new Date(),
          shippingAddress: input.shippingAddress,
          notes: input.notes,
          totalAmount: totalAmount.toString(),
        });
        
        for (const line of input.lines) {
          await db.createSalesOrderLine({
            salesOrderId: orderId,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice)).toString(),
          });
        }

        // Auto-generate invoice from sales order
        try {
          const invoice = await db.createInvoice({
            customerId: input.customerId,
            invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
            issueDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30
            subtotal: totalAmount.toString(),
            taxAmount: "0",
            totalAmount: totalAmount.toString(),
            status: "draft",
            type: "invoice",
            notes: `Auto-generated from Sales Order #${orderId}`,
            createdBy: ctx.user.id,
          });
          for (const line of input.lines) {
            await db.createInvoiceItem({
              invoiceId: invoice.id,
              description: `Product ${line.productId}`,
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalAmount: (parseFloat(line.quantity) * parseFloat(line.unitPrice)).toString(),
            });
          }
        } catch (e) {
          console.warn("[Auto-Invoice] Failed to auto-generate invoice from sales order:", e);
        }

        return { id: orderId, orderNumber };
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
      }))
      .mutation(async ({ input }) => {
        await db.updateSalesOrder(input.id, { status: input.status });
        return { success: true };
      }),
  }),
});

// Helper function to map Shopify order status to DB enum
function mapShopifyOrderStatusToDb(financialStatus: string, fulfillmentStatus: string | null): 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' {
  if (financialStatus === 'refunded') return 'refunded';
  if (financialStatus === 'voided') return 'cancelled';
  if (fulfillmentStatus === 'fulfilled') return 'delivered';
  if (fulfillmentStatus === 'partial') return 'shipped';
  if (financialStatus === 'paid') return 'confirmed';
  return 'pending';
}
