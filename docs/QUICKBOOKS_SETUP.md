# QuickBooks Integration Setup

This document explains how to set up the QuickBooks Online integration for the AI ERP System.

## Overview

The QuickBooks integration allows you to connect your QuickBooks Online account to the ERP system for:

- Automatic customer and vendor synchronization
- Invoice creation and management
- Payment tracking
- Chart of accounts sync
- Financial reporting
- Inventory reconciliation

## Prerequisites

1. **QuickBooks Online Account**: You need an active QuickBooks Online account (not QuickBooks Desktop)
2. **QuickBooks App**: You need to create a QuickBooks app in the Intuit Developer Portal

## Setup Steps

### 1. Create a QuickBooks App

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Sign in with your Intuit account
3. Click **Dashboard** → **Create an app**
4. Select **QuickBooks Online** as the product
5. Choose a descriptive name for your app (e.g., "My ERP System")
6. Complete the app creation process

### 2. Configure OAuth 2.0 Settings

1. In your app dashboard, go to **Keys & credentials**
2. Under **OAuth 2.0**, configure the following:
   - **Redirect URI**: Add your callback URL
     - For production: `https://your-domain.com/api/oauth/quickbooks/callback`
     - For development: `http://localhost:3000/api/oauth/quickbooks/callback`
3. Note down your:
   - **Client ID**
   - **Client Secret**

### 3. Configure Environment Variables

Add the following environment variables to your `.env` file or deployment settings:

```bash
# QuickBooks OAuth Configuration
QUICKBOOKS_CLIENT_ID=your_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/oauth/quickbooks/callback  # Optional
QUICKBOOKS_ENVIRONMENT=sandbox  # Use 'production' for live environment
```

**Important:**
- The `QUICKBOOKS_REDIRECT_URI` is optional. If not provided, it defaults to `{APP_URL}/api/oauth/quickbooks/callback`
- Use `QUICKBOOKS_ENVIRONMENT=sandbox` for testing with sample company data
- Use `QUICKBOOKS_ENVIRONMENT=production` for live QuickBooks companies

### 4. Connect QuickBooks in the ERP System

1. Log in to your ERP system
2. Navigate to **Settings** → **Integrations**
3. Find the **QuickBooks** card
4. Click **Configure** or **Connect QuickBooks**
5. You'll be redirected to QuickBooks to authorize the connection
6. Select the company you want to connect
7. Click **Authorize** to complete the connection

### 5. Verify the Connection

After connecting:

1. You should see a success message
2. The QuickBooks card will show **Connected** status
3. You can test the connection by clicking **Test Connection** in the QuickBooks tab

## OAuth Flow

The QuickBooks integration uses OAuth 2.0 for secure authentication:

1. **Authorization Request**: User clicks "Connect QuickBooks" and is redirected to QuickBooks
2. **User Authorization**: User authorizes the ERP system to access their QuickBooks company
3. **Token Exchange**: The system exchanges the authorization code for access and refresh tokens
4. **Token Storage**: Tokens are securely stored in the database
5. **Automatic Refresh**: The system automatically refreshes expired tokens

## Security Features

1. **OAuth 2.0**: Industry-standard authentication protocol
2. **State Parameter**: CSRF protection using cryptographically random state values
3. **Token Expiration**: Access tokens expire after 1 hour and are automatically refreshed
4. **Refresh Tokens**: Long-lived tokens (180 days) for maintaining connection
5. **Secure Storage**: Tokens are stored securely in the database

## API Scopes

The integration requests the following scope:

- `com.intuit.quickbooks.accounting` - Full access to accounting data

This allows the ERP system to:
- Read and write customers, vendors, items, invoices, and bills
- Read and write transactions
- Access company information
- Manage chart of accounts

## Sandbox vs Production

### Sandbox Environment

- Use for development and testing
- Access to sample company data
- No real financial data
- Set `QUICKBOOKS_ENVIRONMENT=sandbox`

### Production Environment

- Use for live operations
- Access to real QuickBooks companies
- Real financial data
- Set `QUICKBOOKS_ENVIRONMENT=production`
- Requires app to be published (for public apps) or added to specific companies (for private apps)

## Troubleshooting

### "QuickBooks OAuth not configured" Error

**Cause**: Missing or invalid environment variables

**Solution**: 
1. Verify `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` are set correctly
2. Restart the application after adding environment variables

### "Invalid OAuth state parameter" Error

**Cause**: OAuth state expired or was tampered with

**Solution**: 
1. The state is valid for 10 minutes
2. Try connecting again
3. Make sure your system clock is accurate

### "Token exchange failed" Error

**Cause**: Invalid credentials or redirect URI mismatch

**Solution**:
1. Verify your Client ID and Client Secret are correct
2. Ensure the redirect URI in your QuickBooks app settings matches the one in your environment variables
3. Check that you're using the correct environment (sandbox vs production)

### Connection Shows "Needs Refresh"

**Cause**: Access token expired

**Solution**: The system should automatically refresh the token. If it doesn't, try:
1. Click "Test Connection" to trigger a token refresh
2. If that fails, disconnect and reconnect QuickBooks

## Rate Limits

QuickBooks API has the following rate limits:

- **Sandbox**: 100 requests per minute per app per company
- **Production**: 500 requests per minute per company (aggregated across all apps)

The integration respects these limits and implements appropriate error handling.

## Supported Features

Currently implemented:
- ✅ OAuth authentication
- ✅ Connection status checking
- ✅ Automatic token refresh
- ✅ Company information retrieval

Coming soon:
- Customer sync
- Vendor sync
- Invoice creation
- Payment tracking
- Item/inventory sync
- Chart of accounts integration

## Additional Resources

- [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/get-started)
- [OAuth 2.0 Guide](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [API Reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the QuickBooks integration logs in the Sync History tab
3. Contact your system administrator
