/**
 * Shopify API Integration
 * Handles webhook verification and API interactions with Shopify stores
 * 
 * Note: Shopify OAuth state management, authorization URL generation, and
 * callback handling are implemented in `server/_core/index.ts` at /api/shopify/callback.
 * This module focuses on shared Shopify utilities such as webhook verification.
 */

import crypto from "crypto";

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
    
    return hash === hmacHeader;
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
