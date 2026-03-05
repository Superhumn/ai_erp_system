# Shopify OAuth Integration Setup

This document explains how to set up the Shopify integration for the AI ERP System using OAuth.

## Overview

The Shopify integration allows you to connect your Shopify stores to the ERP system for:

- Automatic order synchronization
- Inventory level management
- Product catalog sync
- Customer data sync
- Webhook-based real-time updates

## Prerequisites

1. **Shopify Store**: You need an active Shopify store with admin access
2. **Shopify Partner Account** (for custom apps): Or ability to create custom apps in your store

## Setup Steps

### 1. Create a Shopify Custom App

1. Log into your Shopify admin panel
2. Navigate to **Settings** → **Apps and sales channels**
3. Click **Develop apps for your store** (you may need to enable custom app development)
4. Click **Create an app**
5. Give it a name (e.g., "AI ERP System Integration")
6. Click **Create app**

### 2. Configure API Scopes

1. In your app, go to the **Configuration** tab
2. Under **Admin API integration**, click **Configure**
3. Select the following scopes:
   - `read_products` - Read product data
   - `write_products` - Update product data
   - `read_orders` - Read order data
   - `write_orders` - Update order status
   - `read_inventory` - Read inventory levels
   - `write_inventory` - Update inventory levels
   - `read_customers` - Read customer data
   - `read_locations` - Read warehouse/location data
4. Click **Save**

### 3. Install the App

1. Go to the **API credentials** tab
2. Click **Install app**
3. Review the permissions and click **Install**

### 4. Get OAuth Credentials

1. After installation, you'll see:
   - **API key** (Client ID)
   - **API secret key** (Client Secret)
   - **Admin API access token** (for direct API access, not needed for OAuth)
2. Copy these values for the next step

### 5. Configure Environment Variables

Add the following environment variables to your `.env` file or deployment settings:

```bash
# Shopify OAuth Configuration
SHOPIFY_CLIENT_ID=your_api_key_here
SHOPIFY_CLIENT_SECRET=your_api_secret_key_here

# Your application URL (used for OAuth callback)
APP_URL=http://localhost:3000  # For development
# APP_URL=https://your-domain.com  # For production
```

### 6. Set Up OAuth Redirect URL in Shopify

For custom apps created directly in your store, you don't need to configure redirect URLs in the app settings. The OAuth flow will work automatically.

For Shopify Partner apps (public apps):
1. In your Shopify Partner dashboard, find your app
2. Go to **App setup** → **URLs**
3. Under **Allowed redirection URL(s)**, add:
   ```
   http://localhost:3000/api/shopify/callback  # For development
   https://your-domain.com/api/shopify/callback  # For production
   ```

## Using the Integration

### Connect a Shopify Store

1. Log into your ERP system
2. Navigate to **Settings** → **Integrations**
3. Find the **Shopify** section
4. Click **Add Store** or **Connect Store**
5. Enter your Shopify store domain (e.g., `mystore.myshopify.com`)
6. Click **Connect to Shopify**
7. You'll be redirected to Shopify to authorize the connection
8. After authorization, you'll be redirected back to the ERP system

### Configure Webhooks (Manual Setup Required)

After connecting your store, you need to manually register webhooks in your Shopify admin panel:

1. In your Shopify admin, go to **Settings** → **Notifications**
2. Scroll down to the **Webhooks** section
3. Click **Create webhook** for each of the following:

   **Order webhooks:**
   - Event: `Order creation`
   - Format: `JSON`
   - URL: `https://your-domain.com/webhooks/shopify/orders`
   - API version: `2024-01` or later

   **Inventory webhooks:**
   - Event: `Inventory levels update`
   - Format: `JSON`
   - URL: `https://your-domain.com/webhooks/shopify/inventory`
   - API version: `2024-01` or later

4. Click **Save** for each webhook

Webhook endpoints in your ERP system:
- `https://your-domain.com/webhooks/shopify/orders` - Receives order creation and updates
- `https://your-domain.com/webhooks/shopify/inventory` - Receives inventory level changes

**Note:** Automatic webhook registration is not currently implemented. Webhooks must be manually configured in the Shopify admin panel.

### Manage Connected Stores

From the Integrations page, you can:
- **View Store Status** - See connection health
- **Test Connection** - Verify the store is still accessible
- **Sync Orders** - Manually trigger order synchronization
- **Disconnect Store** - Remove the connection

## Features

### Order Synchronization
- Automatically imports orders from Shopify
- Creates sales orders in the ERP
- Maps Shopify products to ERP products
- Tracks fulfillment status

### Inventory Management
- Pushes inventory levels to Shopify
- Supports multi-location inventory
- Real-time updates via webhooks
- Weekly reconciliation reports

### Product Mapping
- Map Shopify products/variants to ERP SKUs
- Supports multiple stores with different product catalogs
- Location mapping for warehouse sync

## Security Notes

1. **Access Token Encryption**: Shopify access tokens are encrypted using AES-256-CBC encryption before being stored in the database. The encryption key is derived from the `JWT_SECRET` environment variable. Ensure you have a strong, unique `JWT_SECRET` configured.

2. **Webhook Verification**: All webhook requests are verified using HMAC SHA256 signatures to ensure they come from Shopify.

3. **OAuth Flow**: The integration uses OAuth 2.0 for secure authentication. No manual token entry is required, reducing the risk of token exposure.

4. **Scope Limitation**: The integration only requests the minimum required scopes for its functionality.

5. **Company Scoping**: Shopify stores are scoped to companies, ensuring multi-tenant data isolation.

## Troubleshooting

### "OAuth not configured" error
- Ensure `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` are set in your environment variables
- Restart your server after adding environment variables

### "Invalid shop domain" error
- Ensure the shop domain ends with `.myshopify.com`
- Example: `mystore.myshopify.com` (not just `mystore`)

### "Failed to exchange authorization code" error
- Check that your OAuth redirect URL in Shopify matches your `APP_URL`
- Ensure your Shopify app's API secret key is correct
- Verify the app is installed in your Shopify store

### Connection test fails
- The access token may have been revoked in Shopify
- Try disconnecting and reconnecting the store
- Check if the app is still installed in your Shopify admin
- Verify the app still has the required API scopes

### Webhook not receiving events
- Ensure your server is publicly accessible (webhooks require a public URL)
- Check that webhooks are registered in Shopify admin under Settings → Notifications → Webhooks
- Verify the webhook secret is correctly stored in the database
- Check server logs for webhook signature verification errors

## API Rate Limits

Shopify has API rate limits:
- **REST Admin API**: 2 requests per second per store
- **GraphQL Admin API**: 1000 points per second (varies by query complexity)

The integration respects these limits to avoid throttling.

## Data Flows

### Order Creation Flow
1. Customer places order on Shopify
2. Shopify sends `orders/create` webhook
3. ERP receives webhook, verifies signature
4. Creates sales order in database
5. Creates sales order lines with product mappings
6. Optionally creates inventory reservations

### Inventory Update Flow
1. ERP updates inventory levels
2. System pushes updates to Shopify via API
3. Shopify updates inventory for all connected locations
4. Shopify sends `inventory_levels/update` webhook for confirmation
5. ERP logs the confirmation

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the Shopify integration logs in Settings → Integrations → Sync History
3. Check server logs for detailed error messages
4. Verify API credentials and permissions in Shopify admin

## Additional Resources

- [Shopify Admin API Documentation](https://shopify.dev/api/admin-rest)
- [Shopify OAuth Guide](https://shopify.dev/apps/auth/oauth)
- [Shopify Webhooks Documentation](https://shopify.dev/api/admin-rest/latest/resources/webhook)
- [API Rate Limits](https://shopify.dev/api/usage/rate-limits)
