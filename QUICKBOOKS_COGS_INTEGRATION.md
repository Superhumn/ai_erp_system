# QuickBooks COGS Data Integration Guide

## Overview

The COGS (Cost of Goods Sold) tracking system now integrates with QuickBooks Online to automatically source cost data and maintain proper accounting category mappings. This ensures your profitability calculations match your QuickBooks financial records.

## Prerequisites

1. **QuickBooks Online Account** - Active QuickBooks Online subscription
2. **QuickBooks OAuth Connection** - Connect your QB account via Settings
3. **Chart of Accounts** - QB Chart of Accounts configured with COGS categories
4. **Inventory Items** - Products set up as items in QuickBooks

## Setup Process

### Step 1: Connect QuickBooks

1. Navigate to **Settings** → **Integrations**
2. Click **Connect QuickBooks**
3. Authorize the application in QuickBooks OAuth flow
4. Verify connection status shows "Connected"

### Step 2: Sync Chart of Accounts

1. Go to **Settings** → **QuickBooks Integration** (`/settings/quickbooks`)
2. Click **Sync Accounts** button
3. Wait for sync to complete (syncs all active QB accounts)
4. Verify accounts appear in the dropdown lists

### Step 3: Map COGS Categories

Configure which QuickBooks accounts to use for each COGS category:

**Required Mappings:**

1. **COGS - Product Cost**
   - Map to your main "Cost of Goods Sold" account
   - Typically: `AccountType = "Cost of Goods Sold"`, `SubType = "SuppliesMaterialsCogs"`
   - Example: "Cost of Goods Sold" or "Inventory Cost"

2. **COGS - Freight/Shipping**
   - Map to freight-specific COGS account
   - Typically: `AccountType = "Cost of Goods Sold"`, `SubType = "FreightAndDeliveryCogs"`
   - Example: "Freight In" or "Shipping Costs - COGS"

3. **COGS - Customs/Duties**
   - Map to customs and duties COGS account
   - Example: "Import Duties and Tariffs"

4. **Inventory Asset**
   - Map to your inventory asset account
   - Typically: `AccountType = "Other Current Asset"`, `SubType = "Inventory"`
   - Example: "Inventory Asset" or "Merchandise Inventory"

5. **Freight Expense**
   - Map to operational freight expense (not COGS)
   - Typically: `AccountType = "Expense"`, `SubType = "ShippingFreightAndDelivery"`
   - Example: "Shipping & Delivery"

6. **Sales Income**
   - Map to your main revenue account
   - Typically: `AccountType = "Income"`, `SubType = "SalesOfProductIncome"`
   - Example: "Sales" or "Product Revenue"

7. **Other Expenses**
   - Map to miscellaneous expense account
   - Example: "Other Business Expenses"

**To Set a Mapping:**
1. Select the category from the dropdown
2. Select the QuickBooks account
3. Click **Save Mapping**
4. Verify it appears in the "Current Mappings" table with green "Configured" badge

### Step 4: Sync Items/Products

1. Click **Sync Items** button
2. This syncs all QuickBooks inventory items
3. System automatically:
   - Matches items to products by SKU
   - Updates product cost prices with QB `PurchaseCost`
   - Stores QB item IDs for future syncs

### Step 5: Verify Data Source

1. Navigate to **Operations** → **Profitability** (`/operations/profitability`)
2. Check for green "QuickBooks Connected" badge in header
3. Cost data will now come from QuickBooks when available

## How It Works

### Data Flow

```
QuickBooks Online
    ↓ (OAuth API)
Sync Accounts → quickbooksAccounts table
Sync Items → quickbooksItems table → Update products.costPrice
    ↓
Map Categories → quickbooksAccountMappings table
    ↓
COGS Calculation → Uses QB costs + mappings
    ↓
Journal Entries → Posted back to QB (optional)
```

### Cost Sourcing Priority

1. **QuickBooks Item Cost** (if synced)
   - Uses `PurchaseCost` from QB item
   - Updated during sync
   
2. **Local Product Cost** (fallback)
   - Uses `products.costPrice` from ERP
   - Set manually or from purchase orders

3. **Weighted Average** (inventory)
   - Calculated from receipts
   - Uses `inventory.averageCost`

### COGS Calculation Example

When a sale is fulfilled:

```typescript
// 1. Get product cost from QuickBooks item (if available)
const qbItem = await getQuickBooksItemByProductId(productId);
const unitCost = qbItem?.purchaseCost || inventory.averageCost;

// 2. Calculate COGS with allocated costs
const productCost = quantity * unitCost;
const freightAllocated = allocateFreightByQuantity(totalFreight, items);
const totalCOGS = productCost + freightAllocated + customsCost + insuranceCost;

// 3. Record in COGS transactions table
await recordCOGSSale({
  productCost,
  freightCostAllocated: freightAllocated,
  totalCOGS,
  revenueAmount,
  grossProfit: revenueAmount - totalCOGS
});

// 4. Post to QuickBooks (optional)
await createJournalEntry({
  Line: [
    { Debit: totalCOGS, Account: cogsProductAccount },
    { Credit: totalCOGS, Account: inventoryAssetAccount }
  ]
});
```

## Account Mapping Details

### COGS - Product Cost
- **Purpose**: Record the base cost of inventory sold
- **QB Account Type**: Cost of Goods Sold
- **Debit on**: Sale fulfillment
- **Credit**: Inventory Asset account

### COGS - Freight
- **Purpose**: Allocate inbound freight to products sold
- **QB Account Type**: Cost of Goods Sold
- **Calculation**: Proportional to quantity/value/weight
- **Posted**: When freight invoice processed

### COGS - Customs/Duties
- **Purpose**: Allocate import duties to products
- **QB Account Type**: Cost of Goods Sold
- **Calculation**: From customs clearance documents
- **Posted**: When customs bill paid

### Inventory Asset
- **Purpose**: Track value of inventory on hand
- **QB Account Type**: Other Current Asset
- **Balance**: Decreases when sold, increases when purchased
- **Valuation**: Uses weighted average cost

## Sync Schedule

**Recommended Sync Frequency:**
- **Accounts**: Monthly (or when chart of accounts changes)
- **Items**: Daily (to catch cost updates)
- **Costs**: Real-time via QB webhook (future enhancement)

**Manual Sync:**
- Use "Sync Accounts" button when QB accounts change
- Use "Sync Items" button when adding new products in QB
- Mappings only need setup once (unless accounts change)

## API Reference

### QuickBooks Sync Endpoints

```typescript
// Sync Chart of Accounts
trpc.quickbooks.syncAccounts.mutate({ companyId: 1 })

// Sync Items
trpc.quickbooks.syncItems.mutate({ 
  companyId: 1, 
  type: 'Inventory' 
})

// Get QB Accounts
trpc.quickbooks.getAccounts.query({ 
  companyId: 1,
  classification: 'Expense' 
})

// Set Account Mapping
trpc.quickbooks.upsertAccountMapping.mutate({
  companyId: 1,
  mappingType: 'cogs_product',
  quickbooksAccountId: '123',
  isDefault: true
})
```

### Database Functions

```typescript
// Sync accounts from QB API response
await db.syncQuickBooksAccounts(companyId, qbAccounts);

// Sync items and update product costs
await db.syncQuickBooksItems(companyId, qbItems);

// Get account mapping
const mapping = await db.getQuickBooksAccountMapping(
  companyId, 
  'cogs_product'
);

// Update inventory cost from QB
await db.updateInventoryCostFromQuickBooks(
  productId, 
  warehouseId, 
  qbPurchaseCost
);
```

## Troubleshooting

### QB Not Connected
**Symptom**: Badge shows "Local Data Only"
**Solution**: Go to Settings → Integrations → Connect QuickBooks

### Accounts Not Syncing
**Symptom**: Dropdown lists empty
**Solution**: 
1. Check QuickBooks connection is active
2. Click "Sync Accounts" button
3. Verify accounts exist in QuickBooks

### Items Not Matching
**Symptom**: QB items don't link to ERP products
**Solution**:
1. Ensure product SKUs match QuickBooks item SKUs
2. Set `quickbooksItemId` field on products manually
3. Re-sync items

### Cost Not Updating
**Symptom**: Product costs remain old values
**Solution**:
1. Sync items from QuickBooks
2. Check QB item has `PurchaseCost` set
3. Verify product is linked to QB item

### Mapping Not Saving
**Symptom**: Error when saving account mapping
**Solution**:
1. Ensure QuickBooks account exists
2. Check account is active in QuickBooks
3. Verify you have permissions to modify settings

## Best Practices

1. **Initial Setup**
   - Map all 7 categories before using COGS tracking
   - Use dedicated COGS accounts (not general expense)
   - Test with a few products first

2. **Ongoing Maintenance**
   - Sync items daily or when costs change
   - Review COGS reports monthly
   - Reconcile with QuickBooks P&L

3. **Cost Accuracy**
   - Keep QB item costs current
   - Allocate freight to products promptly
   - Record customs duties when paid

4. **Account Structure**
   - Use sub-accounts in QB for detailed tracking
   - Keep COGS categories separate
   - Match account naming between systems

## Security Notes

- OAuth tokens are encrypted and refreshed automatically
- Only users with 'ops' or 'admin' roles can configure mappings
- All sync operations are logged in audit trail
- QuickBooks API calls use company-specific realm IDs

## Support

For issues or questions:
1. Check connection status in Settings
2. Review audit logs for sync errors
3. Verify QuickBooks permissions
4. Contact administrator if mappings need changes

## Future Enhancements

- [ ] Real-time webhooks from QuickBooks
- [ ] Automated journal entry posting
- [ ] Multi-currency COGS support
- [ ] Historical cost reconciliation
- [ ] QB P&L to COGS variance report
