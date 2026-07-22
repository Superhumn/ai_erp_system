/**
 * Shopify API Integration
 * Handles webhook verification, token refresh, and full data sync with Shopify stores
 *
 * Note: Shopify OAuth state management, authorization URL generation, and
 * callback handling are implemented in `server/_core/index.ts` at /api/shopify/callback.
 * This module focuses on shared Shopify utilities such as webhook verification,
 * token auto-refresh, and product/order/customer sync.
 */

import crypto from "crypto";
import https from "https";
import sanitizeHtml from "sanitize-html";
import { encrypt, safeDecryptToken } from "./crypto";

/**
 * Verify Shopify webhook signature
 */
export function verifyWebhookSignature(
  body: string,
  hmacHeader: string,
  secret: string
): boolean {
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');

    const hashBuf = Buffer.from(hash);
    const headerBuf = Buffer.from(hmacHeader);
    return hashBuf.length === headerBuf.length && crypto.timingSafeEqual(hashBuf, headerBuf);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return false;
  }
}

/**
 * Process Shopify webhook with common validation and idempotency handling
 * Returns true if webhook should be processed, false if already processed
 */
export async function processShopifyWebhook(
  rawBody: string,
  headers: {
    hmac?: string;
    shopDomain?: string;
    topic?: string;
  }
): Promise<{ 
  shouldProcess: boolean; 
  error?: string;
  payload?: any;
  topic?: string;
  shopDomain?: string;
  idempotencyKey?: string;
}> {
  const { hmac, shopDomain, topic } = headers;

  if (!hmac || !shopDomain || !topic) {
    return { shouldProcess: false, error: 'Missing required headers' };
  }

  // Get store from database to retrieve webhook secret
  // This import is done here to avoid circular dependencies
  const { getShopifyStoreByDomain } = await import('../db');
  const store = await getShopifyStoreByDomain(shopDomain);
  
  if (!store || !store.webhookSecret) {
    return { shouldProcess: false, error: 'Unknown store or missing webhook secret' };
  }

  // Verify webhook signature
  const isValid = verifyWebhookSignature(rawBody, hmac, store.webhookSecret);
  
  if (!isValid) {
    return { shouldProcess: false, error: 'Invalid signature' };
  }

  // Parse the payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { shouldProcess: false, error: 'Invalid JSON payload' };
  }
  
  // Create idempotency key from Shopify event ID or unique fallback
  const uniqueComponent = payload.id ?? `${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  const idempotencyKey = `shopify-${topic}-${uniqueComponent}`;

  // Check idempotency
  const { getWebhookEventByIdempotencyKey, createWebhookEvent } = await import('../db');
  const existing = await getWebhookEventByIdempotencyKey(idempotencyKey);
  
  if (existing) {
    return { 
      shouldProcess: false, 
      error: 'Already processed',
      idempotencyKey 
    };
  }

  // Create webhook event
  await createWebhookEvent({
    source: 'shopify',
    topic,
    payload: rawBody,
    idempotencyKey,
    status: 'received',
  });

  return {
    shouldProcess: true,
    payload,
    topic,
    shopDomain,
    idempotencyKey
  };
}

// ============================================
// SHOPIFY API HELPERS
// ============================================

/**
 * Make an HTTPS request and return parsed JSON using native https module
 */
function shopifyRequest(options: {
  hostname: string;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: options.hostname,
        path: options.path,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Shopify API ${res.statusCode}: ${JSON.stringify(parsed)}`));
            } else {
              resolve({ body: parsed, headers: res.headers, statusCode: res.statusCode });
            }
          } catch {
            reject(new Error(`Shopify API: Invalid JSON response (status ${res.statusCode}): ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ============================================
// TOKEN AUTO-REFRESH
// ============================================

/**
 * Refresh the Shopify access token using client_credentials grant.
 * Updates the token + expiration in the shopify_stores table.
 * Returns the new access token.
 */
export async function refreshShopifyToken(storeId: number): Promise<string> {
  const { getShopifyStoreById, updateShopifyStore } = await import("../db");
  const store = await getShopifyStoreById(storeId);
  if (!store) throw new Error(`Shopify store ${storeId} not found`);
  if (!store.clientId || !store.clientSecret) {
    throw new Error(`Store ${store.storeDomain} is missing clientId/clientSecret for token refresh`);
  }

  console.log(`[Shopify Token] Refreshing token for ${store.storeDomain}...`);

  const result = await shopifyRequest({
    hostname: store.storeDomain,
    path: "/admin/oauth/access_token",
    method: "POST",
    body: JSON.stringify({
      client_id: store.clientId,
      client_secret: store.clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const newToken = result.body.access_token;
  const expiresIn = result.body.expires_in || 86399; // default ~24h
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await updateShopifyStore(storeId, {
    accessToken: encrypt(newToken), // store encrypted, consistent with OAuth callback; returns plain text for immediate use by caller
    tokenExpiresAt: expiresAt,
  } as any);

  console.log(`[Shopify Token] Refreshed for ${store.storeDomain}, expires at ${expiresAt.toISOString()}`);
  return newToken;
}

/**
 * Ensure the Shopify token is valid. Refreshes if expired or about to expire (within 10 min).
 * Returns the valid access token.
 */
export async function ensureValidToken(storeId: number): Promise<string> {
  const { getShopifyStoreById } = await import("../db");
  const store = await getShopifyStoreById(storeId);
  if (!store) throw new Error(`Shopify store ${storeId} not found`);

  const now = Date.now();
  const bufferMs = 10 * 60 * 1000; // 10 minute buffer

  if (
    store.accessToken &&
    store.tokenExpiresAt &&
    new Date(store.tokenExpiresAt).getTime() > now + bufferMs
  ) {
    return safeDecryptToken(store.accessToken);
  }

  if (store.clientId && store.clientSecret) {
    return refreshShopifyToken(storeId);
  }

  return safeDecryptToken(store.accessToken ?? "");
}

// ============================================
// SHOPIFY DATA FETCHING (paginated)
// ============================================

/**
 * Fetch all pages of a Shopify REST resource using Link-header pagination.
 */
async function fetchAllShopify(
  storeDomain: string,
  accessToken: string,
  apiVersion: string,
  resource: string
): Promise<any[]> {
  const results: any[] = [];
  let path = `/admin/api/${apiVersion}/${resource}.json?limit=250`;

  while (path) {
    const resp = await shopifyRequest({
      hostname: storeDomain,
      path,
      headers: { "X-Shopify-Access-Token": accessToken },
    });

    const body = resp.body;
    const items = body[resource] || body[Object.keys(body)[0]] || [];
    results.push(...items);

    // Parse Link header for next page
    const linkHeader = resp.headers["link"] || "";
    const nextMatch = linkHeader.match(/<https:\/\/[^>]*\/admin\/api\/[^>]+>;\s*rel="next"/);
    if (nextMatch) {
      const urlMatch = nextMatch[0].match(/<https:\/\/[^/]+(\/admin\/api\/[^>]+)>/);
      path = urlMatch ? urlMatch[1] : "";
    } else {
      path = "";
    }
  }

  return results;
}

// ============================================
// SYNC FUNCTIONS
// ============================================

export interface ShopifySyncResult {
  products: { created: number; updated: number; errors: number };
  orders: { created: number; updated: number; errors: number };
  customers: { created: number; updated: number; errors: number };
  duration: number;
}

/**
 * Sync all products from Shopify into the ERP products table.
 */
async function syncProducts(
  storeDomain: string,
  accessToken: string,
  apiVersion: string
): Promise<{ created: number; updated: number; errors: number }> {
  const {
    getProductByShopifyId,
    getProductBySku,
    createProduct,
    updateProduct,
  } = await import("../db");

  const shopifyProducts = await fetchAllShopify(storeDomain, accessToken, apiVersion, "products");
  let created = 0, updated = 0, errors = 0;

  for (const sp of shopifyProducts) {
    try {
      const variant = sp.variants?.[0];
      const sku = variant?.sku || `SHOPIFY-${sp.id}`;
      const price = variant?.price || "0";
      const statusMap: Record<string, string> = { active: "active", draft: "inactive", archived: "discontinued" };

      // Check by Shopify ID first, then by SKU
      let existing = await getProductByShopifyId(String(sp.id));
      if (!existing) existing = await getProductBySku(sku);

      const productData: any = {
        sku,
        name: sp.title || "Untitled",
        description: sp.body_html
          ? sanitizeHtml(sp.body_html, { allowedTags: [], allowedAttributes: {} })
          : null,
        category: sp.product_type || null,
        unitPrice: price,
        status: statusMap[sp.status] || "active",
        shopifyProductId: String(sp.id),
      };

      if (existing) {
        await updateProduct(existing.id, productData);
        updated++;
      } else {
        productData.type = "physical";
        await createProduct(productData);
        created++;
      }
    } catch (err) {
      console.error(`[Shopify Sync] Error syncing product ${sp.id}:`, err);
      errors++;
    }
  }

  console.log(`[Shopify Sync] Products: ${created} created, ${updated} updated, ${errors} errors`);
  return { created, updated, errors };
}

/**
 * Map Shopify financial_status to ERP order status.
 */
function mapShopifyOrderStatus(financialStatus: string): string {
  const map: Record<string, string> = {
    pending: "pending",
    authorized: "confirmed",
    paid: "confirmed",
    partially_paid: "processing",
    partially_refunded: "processing",
    refunded: "refunded",
    voided: "cancelled",
  };
  return map[financialStatus] || "pending";
}

/**
 * Sync all orders from Shopify into the ERP orders + order_items tables.
 */
async function syncOrders(
  storeDomain: string,
  accessToken: string,
  apiVersion: string
): Promise<{ created: number; updated: number; errors: number }> {
  const db = await import("../db");

  // Fetch orders with status=any to get all orders
  const allOrders: any[] = [];
  let path = `/admin/api/${apiVersion}/orders.json?limit=250&status=any`;

  while (path) {
    const resp = await shopifyRequest({
      hostname: storeDomain,
      path,
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    allOrders.push(...(resp.body.orders || []));

    const linkHeader = resp.headers["link"] || "";
    const nextMatch = linkHeader.match(/<https:\/\/[^>]*\/admin\/api\/[^>]+>;\s*rel="next"/);
    if (nextMatch) {
      const urlMatch = nextMatch[0].match(/<https:\/\/[^/]+(\/admin\/api\/[^>]+)>/);
      path = urlMatch ? urlMatch[1] : "";
    } else {
      path = "";
    }
  }

  let created = 0, updated = 0, errors = 0;

  for (const so of allOrders) {
    try {
      const shopifyOrderId = String(so.id);

      // Find or link customer
      let customerId: number | null = null;
      if (so.customer) {
        const existingCustomer = await db.getCustomerByShopifyId(String(so.customer.id));
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }

      // Check if order already exists by shopifyOrderId
      const existing = await db.getOrderByShopifyId(shopifyOrderId);

      const orderData: any = {
        orderNumber: so.name || `#${so.order_number}`,
        customerId,
        type: "sales",
        status: mapShopifyOrderStatus(so.financial_status || "pending"),
        orderDate: new Date(so.created_at),
        subtotal: so.subtotal_price || "0",
        taxAmount: so.total_tax || "0",
        shippingAmount: (so.shipping_lines || []).reduce(
          (sum: number, s: any) => sum + parseFloat(s.price || "0"),
          0
        ).toString(),
        discountAmount: so.total_discounts || "0",
        totalAmount: so.total_price || "0",
        currency: so.currency || "USD",
        shopifyOrderId,
        shippingAddress: so.shipping_address
          ? `${so.shipping_address.address1 || ""}, ${so.shipping_address.city || ""}, ${so.shipping_address.province || ""} ${so.shipping_address.zip || ""}, ${so.shipping_address.country || ""}`
          : null,
        notes: so.note || null,
      };

      if (existing) {
        await db.updateOrder(existing.id, orderData);
        updated++;
      } else {
        const result = await db.createOrder(orderData);
        const orderId = result.id;

        // Create line items
        for (const li of so.line_items || []) {
          try {
            // Try to find the matching product by SKU or shopifyProductId
            let productId: number | null = null;
            if (li.sku) {
              const prod = await db.getProductBySku(li.sku);
              if (prod) productId = prod.id;
            }

            await db.createOrderItem({
              orderId,
              productId,
              sku: li.sku || null,
              name: li.title || li.name || "Item",
              quantity: String(li.quantity || 1),
              unitPrice: li.price || "0",
              taxAmount: (li.tax_lines || [])
                .reduce((sum: number, t: any) => sum + parseFloat(t.price || "0"), 0)
                .toString(),
              discountAmount: (li.discount_allocations || [])
                .reduce((sum: number, d: any) => sum + parseFloat(d.amount || "0"), 0)
                .toString(),
              totalAmount: (
                parseFloat(li.price || "0") * (li.quantity || 1)
              ).toString(),
            });
          } catch (itemErr) {
            console.error(`[Shopify Sync] Error syncing line item for order ${so.name}:`, itemErr);
          }
        }
        created++;
      }
    } catch (err) {
      console.error(`[Shopify Sync] Error syncing order ${so.id}:`, err);
      errors++;
    }
  }

  console.log(`[Shopify Sync] Orders: ${created} created, ${updated} updated, ${errors} errors`);
  return { created, updated, errors };
}

/**
 * Sync all customers from Shopify into the ERP customers table.
 */
async function syncCustomers(
  storeDomain: string,
  accessToken: string,
  apiVersion: string
): Promise<{ created: number; updated: number; errors: number }> {
  const {
    getCustomerByShopifyId,
    getCustomerByEmail,
    createCustomer,
    updateCustomer,
  } = await import("../db");

  const shopifyCustomers = await fetchAllShopify(storeDomain, accessToken, apiVersion, "customers");
  let created = 0, updated = 0, errors = 0;

  for (const sc of shopifyCustomers) {
    try {
      const shopifyId = String(sc.id);
      const name = [sc.first_name, sc.last_name].filter(Boolean).join(" ") || sc.email || "Unknown";
      const email = sc.email || null;

      // Skip junk entries (contact form submissions, empty records)
      const lowerName = name.toLowerCase();
      if (lowerName === "contact form" || lowerName === "unknown") continue;
      if (!email && (!sc.first_name || sc.first_name === "Contact")) continue;

      // Check by shopify ID first, then by email
      let existing = await getCustomerByShopifyId(shopifyId);
      if (!existing && email) {
        existing = await getCustomerByEmail(email);
      }

      const address = sc.default_address;
      const customerData: any = {
        name,
        email,
        phone: sc.phone || (address?.phone) || null,
        address: address ? `${address.address1 || ""}${address.address2 ? ", " + address.address2 : ""}` : null,
        city: address?.city || null,
        state: address?.province || null,
        country: address?.country || null,
        postalCode: address?.zip || null,
        shopifyCustomerId: shopifyId,
        syncSource: "shopify",
        lastSyncedAt: new Date(),
        shopifyData: JSON.stringify(sc),
      };

      if (existing) {
        await updateCustomer(existing.id, customerData);
        updated++;
      } else {
        customerData.type = "individual";
        customerData.status = "active";
        await createCustomer(customerData);
        created++;
      }
    } catch (err) {
      console.error(`[Shopify Sync] Error syncing customer ${sc.id}:`, err);
      errors++;
    }
  }

  console.log(`[Shopify Sync] Customers: ${created} created, ${updated} updated, ${errors} errors`);
  return { created, updated, errors };
}

/**
 * Run a full Shopify sync: refresh token if needed, then sync products, orders, customers.
 * Updates lastSyncAt on the store record.
 */
export async function runShopifySync(storeId: number): Promise<ShopifySyncResult> {
  const start = Date.now();
  const { getShopifyStoreById, updateShopifyStore } = await import("../db");

  const store = await getShopifyStoreById(storeId);
  if (!store) throw new Error(`Shopify store ${storeId} not found`);
  if (!store.isEnabled) throw new Error(`Shopify store ${store.storeDomain} is disabled`);

  // Ensure valid token
  const accessToken = await ensureValidToken(storeId);
  const apiVersion = store.apiVersion || "2025-01";
  const domain = store.storeDomain;

  console.log(`[Shopify Sync] Starting full sync for ${domain} (API ${apiVersion})...`);

  // Sync in order: customers first (so orders can link), then products, then orders
  const customerResult = await syncCustomers(domain, accessToken, apiVersion);
  const productResult = await syncProducts(domain, accessToken, apiVersion);
  const orderResult = await syncOrders(domain, accessToken, apiVersion);

  // Update last sync time
  await updateShopifyStore(storeId, { lastSyncAt: new Date() } as any);

  const duration = Date.now() - start;
  console.log(`[Shopify Sync] Complete for ${domain} in ${(duration / 1000).toFixed(1)}s`);

  return {
    products: productResult,
    orders: orderResult,
    customers: customerResult,
    duration,
  };
}

/**
 * Run sync for all enabled Shopify stores.
 */
export async function runAllShopifySyncs(): Promise<{
  stores: number;
  results: Array<{ storeId: number; domain: string; result?: ShopifySyncResult; error?: string }>;
}> {
  const { getShopifyStores } = await import("../db");
  const stores = await getShopifyStores();
  const enabledStores = stores.filter((s: any) => s.isEnabled);

  const results: Array<{ storeId: number; domain: string; result?: ShopifySyncResult; error?: string }> = [];

  for (const store of enabledStores) {
    try {
      const result = await runShopifySync(store.id);
      results.push({ storeId: store.id, domain: store.storeDomain, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Shopify Sync] Failed for store ${store.storeDomain}:`, errorMsg);
      results.push({ storeId: store.id, domain: store.storeDomain, error: errorMsg });
    }
  }

  return { stores: enabledStores.length, results };
}
