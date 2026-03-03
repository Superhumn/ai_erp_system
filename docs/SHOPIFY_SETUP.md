# Shopify OAuth Integration Setup

This document explains how to set up the Shopify OAuth integration for the AI ERP System.

## Overview

The Shopify integration allows you to connect your Shopify stores to the ERP system for:
- Order synchronization
- Inventory management
- Product catalog sync
- Customer data sync

## Prerequisites

1. A Shopify store (with admin access)
2. Access to your Shopify Partner account (or ability to create custom apps in your store)

## Setup Instructions

### 1. Create a Shopify Custom App

1. Log into your Shopify admin panel
2. Navigate to **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **Create an app**
4. Give it a name (e.g., "AI ERP System Integration")
5. Click **Create app**

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
4. Click **Save**

### 3. Get OAuth Credentials

1. Go to the **API credentials** tab
2. Under **Admin API access token**, you'll see:
   - **API key** (Client ID)
   - **API secret key** (Client Secret)
3. Copy these values for the next step

### 4. Configure Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Shopify OAuth Configuration
SHOPIFY_CLIENT_ID=your_api_key_here
SHOPIFY_CLIENT_SECRET=your_api_secret_key_here

# Your application URL (used for OAuth callback)
VITE_APP_URL=http://localhost:3000  # For development
# VITE_APP_URL=https://your-domain.com  # For production
```

### 5. Set Up OAuth Redirect URL in Shopify

1. In your Shopify app configuration, go to **App setup** → **URLs**
2. Under **Allowed redirection URL(s)**, add:
   ```
   http://localhost:3000/api/shopify/callback  # For development
   https://your-domain.com/api/shopify/callback  # For production
   ```
3. Click **Save**

## Using the Integration

### Connect a Shopify Store

1. Log into your ERP system
2. Navigate to **Settings** → **Integrations**
3. Click on the **Shopify** tab
4. Click **Add Store**
5. Enter your Shopify store domain (e.g., `mystore.myshopify.com`)
6. Click **Connect to Shopify**
7. You'll be redirected to Shopify to authorize the connection
8. After authorization, you'll be redirected back to the ERP system

### Manage Connected Stores

From the Integrations page, you can:
- **Test Connection** - Verify the store is still accessible
- **Disconnect Store** - Remove the connection (does not delete historical data)
- View last sync time
- Configure sync settings

## Sync Configuration

Once a store is connected, you can configure:
- **Sync Orders** - Automatically import orders from Shopify
- **Sync Inventory** - Push inventory levels to Shopify
- **Auto-fulfill Orders** - Mark orders as fulfilled when shipped in ERP

## Security Notes

1. **Access Token Encryption**: Shopify access tokens are encrypted using AES-256-CBC encryption before being stored in the database. The encryption key is derived from the `JWT_SECRET` environment variable. Ensure you have a strong, unique `JWT_SECRET` configured.

2. **OAuth Flow**: The integration uses OAuth 2.0 for secure authentication. No manual token entry is required, reducing the risk of token exposure.

3. **Scope Limitation**: The integration only requests the minimum required scopes for its functionality.

4. **Company Scoping**: Shopify stores are scoped to companies, ensuring multi-tenant data isolation.

## Troubleshooting

### "OAuth not configured" error
- Ensure `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` are set in your environment variables
- Restart your server after adding environment variables

### "Invalid shop domain" error
- Ensure the shop domain ends with `.myshopify.com`
- Example: `mystore.myshopify.com` (not just `mystore`)

### "Failed to exchange authorization code" error
- Check that your OAuth redirect URL in Shopify matches your `VITE_APP_URL`
- Ensure your Shopify app's API secret key is correct

### Connection test fails
- The access token may have been revoked in Shopify
- Try disconnecting and reconnecting the store
- Check if the app is still installed in your Shopify admin

## API Rate Limits

Shopify has API rate limits:
- **REST Admin API**: 2 requests per second
- **GraphQL Admin API**: 1000 points per second

The integration respects these limits to avoid throttling.

## Support

For issues with:
- **Shopify app setup**: Contact Shopify Support
- **ERP integration**: Check the sync history in Settings → Integrations → History tab
- **Technical issues**: Review server logs for detailed error messages
