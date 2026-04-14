#!/usr/bin/env node
/**
 * Shopify Initial Sync Script
 * Fetches products, orders, and customers from Shopify and imports into the ERP database.
 * Uses batch operations for speed.
 */

const https = require('https');
const mysql = require('mysql2/promise');

const DB_URL = 'mysql://root:GSHsNkMyNiqTJdimvzLjhKbLpmyrRiKR@yamanote.proxy.rlwy.net:51481/railway';
const STORE_DOMAIN = 'hello-7d77.myshopify.com';
const API_VERSION = '2025-01';

function shopifyGet(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: STORE_DOMAIN,
      path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ body: JSON.parse(data), headers: res.headers, status: res.statusCode });
        } catch { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAll(resource, token, extraParams = '') {
  const all = [];
  let path = `/admin/api/${API_VERSION}/${resource}.json?limit=250${extraParams}`;
  let page = 0;
  while (path) {
    page++;
    const resp = await shopifyGet(path, token);
    if (resp.status >= 400) throw new Error(`Shopify ${resp.status}: ${JSON.stringify(resp.body)}`);
    const items = resp.body[resource] || resp.body[Object.keys(resp.body)[0]] || [];
    all.push(...items);
    process.stdout.write(`  Fetched page ${page} (${all.length} total)...\r`);
    const link = resp.headers['link'] || '';
    const next = link.match(/<https:\/\/[^>]*\/admin\/api\/[^>]+>;\s*rel="next"/);
    if (next) {
      const u = next[0].match(/<https:\/\/[^/]+(\/admin\/api\/[^>]+)>/);
      path = u ? u[1] : '';
    } else path = '';
  }
  console.log('');
  return all;
}

(async () => {
  const conn = await mysql.createConnection(DB_URL);
  const start = Date.now();

  // Get token
  const [stores] = await conn.query('SELECT * FROM shopifyStores WHERE storeDomain = ?', [STORE_DOMAIN]);
  if (!stores.length) { console.error('No store found'); process.exit(1); }
  const token = stores[0].accessToken;
  console.log('Store:', STORE_DOMAIN, '| API:', API_VERSION);

  // ── 1. SYNC CUSTOMERS ──
  console.log('\n=== Syncing Customers ===');
  const customers = await fetchAll('customers', token);
  console.log(`Fetched ${customers.length} customers from Shopify`);

  // Get existing customers indexed by shopifyCustomerId and email
  const [existingCusts] = await conn.query('SELECT id, shopifyCustomerId, email FROM customers');
  const custByShopifyId = {};
  const custByEmail = {};
  for (const c of existingCusts) {
    if (c.shopifyCustomerId) custByShopifyId[c.shopifyCustomerId] = c.id;
    if (c.email) custByEmail[c.email.toLowerCase()] = c.id;
  }

  let custCreated = 0, custUpdated = 0;
  const BATCH = 50;
  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);
    for (const sc of batch) {
      const shopifyId = String(sc.id);
      const name = [sc.first_name, sc.last_name].filter(Boolean).join(' ') || sc.email || 'Unknown';
      const email = sc.email || null;
      const addr = sc.default_address;
      const phone = sc.phone || (addr && addr.phone) || null;
      const address = addr ? (addr.address1 || '') + (addr.address2 ? ', ' + addr.address2 : '') : null;
      const city = addr ? addr.city : null;
      const state = addr ? addr.province : null;
      const country = addr ? addr.country : null;
      const zip = addr ? addr.zip : null;
      const shopifyData = JSON.stringify(sc);

      const existId = custByShopifyId[shopifyId] || (email ? custByEmail[email.toLowerCase()] : null);

      if (existId) {
        await conn.query(
          'UPDATE customers SET name=?, email=?, phone=?, address=?, city=?, state=?, country=?, postalCode=?, shopifyCustomerId=?, syncSource=?, lastSyncedAt=NOW(), shopifyData=? WHERE id=?',
          [name, email, phone, address, city, state, country, zip, shopifyId, 'shopify', shopifyData, existId]
        );
        custUpdated++;
      } else {
        const [ins] = await conn.query(
          'INSERT INTO customers (name, email, phone, address, city, state, country, postalCode, type, status, shopifyCustomerId, syncSource, lastSyncedAt, shopifyData) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)',
          [name, email, phone, address, city, state, country, zip, 'individual', 'active', shopifyId, 'shopify', shopifyData]
        );
        custByShopifyId[shopifyId] = ins.insertId;
        if (email) custByEmail[email.toLowerCase()] = ins.insertId;
        custCreated++;
      }
    }
    process.stdout.write(`  Progress: ${Math.min(i + BATCH, customers.length)}/${customers.length}\r`);
  }
  console.log(`\nCustomers: ${custCreated} created, ${custUpdated} updated`);

  // ── 2. SYNC PRODUCTS ──
  console.log('\n=== Syncing Products ===');
  const products = await fetchAll('products', token);
  console.log(`Fetched ${products.length} products from Shopify`);

  const [existingProds] = await conn.query('SELECT id, sku, shopifyProductId FROM products');
  const prodByShopifyId = {};
  const prodBySku = {};
  for (const p of existingProds) {
    if (p.shopifyProductId) prodByShopifyId[p.shopifyProductId] = p.id;
    if (p.sku) prodBySku[p.sku] = p.id;
  }

  let prodCreated = 0, prodUpdated = 0;
  const statusMap = { active: 'active', draft: 'inactive', archived: 'discontinued' };

  for (const sp of products) {
    const variant = sp.variants && sp.variants[0];
    const sku = (variant && variant.sku) || `SHOPIFY-${sp.id}`;
    const price = (variant && variant.price) || '0';
    const status = statusMap[sp.status] || 'active';
    const desc = sp.body_html ? sp.body_html.replace(/<[^>]*>/g, '') : null;
    const shopifyProductId = String(sp.id);

    const existId = prodByShopifyId[shopifyProductId] || prodBySku[sku];

    if (existId) {
      await conn.query(
        'UPDATE products SET sku=?, name=?, description=?, category=?, unitPrice=?, status=?, shopifyProductId=? WHERE id=?',
        [sku, sp.title || 'Untitled', desc, sp.product_type || null, price, status, shopifyProductId, existId]
      );
      prodUpdated++;
    } else {
      const [ins] = await conn.query(
        'INSERT INTO products (sku, name, description, category, type, unitPrice, status, shopifyProductId) VALUES (?,?,?,?,?,?,?,?)',
        [sku, sp.title || 'Untitled', desc, sp.product_type || null, 'physical', price, status, shopifyProductId]
      );
      prodByShopifyId[shopifyProductId] = ins.insertId;
      prodBySku[sku] = ins.insertId;
      prodCreated++;
    }
  }
  console.log(`Products: ${prodCreated} created, ${prodUpdated} updated`);

  // ── 3. SYNC ORDERS ──
  console.log('\n=== Syncing Orders ===');
  const allOrders = await fetchAll('orders', token, '&status=any');
  console.log(`Fetched ${allOrders.length} orders from Shopify`);

  const [existingOrds] = await conn.query('SELECT id, shopifyOrderId FROM orders WHERE shopifyOrderId IS NOT NULL');
  const ordByShopifyId = {};
  for (const o of existingOrds) {
    if (o.shopifyOrderId) ordByShopifyId[o.shopifyOrderId] = o.id;
  }

  let ordCreated = 0, ordUpdated = 0;
  const orderStatusMap = {
    pending: 'pending', authorized: 'confirmed', paid: 'confirmed',
    partially_paid: 'processing', partially_refunded: 'processing',
    refunded: 'refunded', voided: 'cancelled'
  };

  for (let i = 0; i < allOrders.length; i++) {
    const so = allOrders[i];
    const shopifyOrderId = String(so.id);
    const orderNumber = so.name || `#${so.order_number}`;

    let customerId = null;
    if (so.customer) {
      customerId = custByShopifyId[String(so.customer.id)] || null;
    }

    const shippingAmount = (so.shipping_lines || []).reduce((s, l) => s + parseFloat(l.price || '0'), 0);
    const shippingAddr = so.shipping_address
      ? [so.shipping_address.address1, so.shipping_address.city, so.shipping_address.province, so.shipping_address.zip, so.shipping_address.country].filter(Boolean).join(', ')
      : null;

    const existId = ordByShopifyId[shopifyOrderId];

    if (existId) {
      await conn.query(
        'UPDATE orders SET orderNumber=?, customerId=?, status=?, subtotal=?, taxAmount=?, shippingAmount=?, discountAmount=?, totalAmount=?, currency=?, notes=?, shippingAddress=? WHERE id=?',
        [orderNumber, customerId, orderStatusMap[so.financial_status] || 'pending',
         so.subtotal_price || '0', so.total_tax || '0', String(shippingAmount), so.total_discounts || '0',
         so.total_price || '0', so.currency || 'USD', so.note || null, shippingAddr, existId]
      );
      ordUpdated++;
    } else {
      const [ins] = await conn.query(
        'INSERT INTO orders (orderNumber, customerId, type, status, orderDate, subtotal, taxAmount, shippingAmount, discountAmount, totalAmount, currency, notes, shopifyOrderId, shippingAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [orderNumber, customerId, 'sales', orderStatusMap[so.financial_status] || 'pending',
         new Date(so.created_at), so.subtotal_price || '0', so.total_tax || '0', String(shippingAmount),
         so.total_discounts || '0', so.total_price || '0', so.currency || 'USD', so.note || null,
         shopifyOrderId, shippingAddr]
      );
      const orderId = ins.insertId;
      ordByShopifyId[shopifyOrderId] = orderId;

      // Insert line items
      for (const li of (so.line_items || [])) {
        let productId = null;
        if (li.sku && prodBySku[li.sku]) productId = prodBySku[li.sku];
        const taxAmt = (li.tax_lines || []).reduce((s, t) => s + parseFloat(t.price || '0'), 0);
        const discAmt = (li.discount_allocations || []).reduce((s, d) => s + parseFloat(d.amount || '0'), 0);
        const total = parseFloat(li.price || '0') * (li.quantity || 1);

        await conn.query(
          'INSERT INTO order_items (orderId, productId, sku, name, quantity, unitPrice, taxAmount, discountAmount, totalAmount) VALUES (?,?,?,?,?,?,?,?,?)',
          [orderId, productId, li.sku || null, li.title || li.name || 'Item',
           String(li.quantity || 1), li.price || '0', String(taxAmt), String(discAmt), String(total)]
        );
      }
      ordCreated++;
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  Progress: ${i + 1}/${allOrders.length}\r`);
  }
  console.log(`\nOrders: ${ordCreated} created, ${ordUpdated} updated`);

  // Update lastSyncAt
  await conn.query('UPDATE shopifyStores SET lastSyncAt = NOW() WHERE storeDomain = ?', [STORE_DOMAIN]);

  // Summary
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== SYNC COMPLETE (${elapsed}s) ===`);

  const [pc] = await conn.query('SELECT COUNT(*) as cnt FROM products WHERE shopifyProductId IS NOT NULL');
  const [oc] = await conn.query('SELECT COUNT(*) as cnt FROM orders WHERE shopifyOrderId IS NOT NULL');
  const [cc] = await conn.query('SELECT COUNT(*) as cnt FROM customers WHERE shopifyCustomerId IS NOT NULL');
  const [oi] = await conn.query('SELECT COUNT(*) as cnt FROM order_items');
  console.log(`DB: ${pc[0].cnt} products, ${oc[0].cnt} orders, ${cc[0].cnt} customers, ${oi[0].cnt} order items (with Shopify IDs)`);

  await conn.end();
})().catch(e => { console.error('SYNC ERROR:', e); process.exit(1); });
