# Inventory & COGS Tracking - Implementation Summary

## Overview
This implementation adds comprehensive Cost of Goods Sold (COGS) and profitability tracking to the AI ERP system. It enables businesses to track true profitability on every product including freight and delivery costs across all sales channels.

## What Was Implemented

### 1. Database Schema Enhancements

**New Tables:**
- `cogsTransactions` - Tracks COGS for each sale with detailed cost breakdown
  - Product cost, freight allocation, customs, insurance, other costs
  - Revenue, gross profit, and margin calculations
  - Support for FIFO, LIFO, average, and specific costing methods

- `freightCostAllocations` - Distributes freight/delivery costs to products
  - Allocation by weight, volume, quantity, value, or manual
  - Links to purchase orders and shipments
  - Tracks freight, customs, insurance, and handling fees

**Modified Tables:**
- `inventory` - Added cost tracking fields
  - `averageCost` - Weighted average cost per unit
  - `totalCostBasis` - Total value of inventory on hand

- `salesOrders` - Added profitability tracking
  - `totalCOGS` - Total cost of goods sold
  - `grossProfit` - Revenue minus COGS
  - `grossProfitMargin` - Profit margin percentage

- `salesOrderLines` - Added line-level COGS
  - `costOfGoodsSold` - COGS for this line item
  - `grossProfit` - Profit for this line item

**Migration:** `drizzle/0027_add_cogs_tracking.sql`
- Includes indexes for performance optimization

### 2. Backend Functions (server/db.ts)

**Core COGS Functions:**

1. **`updateInventoryCostBasis(productId, warehouseId, receivedQuantity, unitCost)`**
   - Updates inventory cost using weighted average method
   - Called when receiving goods from purchase orders
   - Maintains accurate cost basis for COGS calculations

2. **`calculateCOGS(productId, warehouseId, quantity, method)`**
   - Computes COGS using average cost or FIFO method
   - Returns unit cost and total cost
   - Foundation for profitability calculations

3. **`recordCOGSSale(salesOrderId, salesOrderLineId, productId, ...)`**
   - Records COGS when sales are fulfilled
   - Includes product cost plus allocated freight/customs/insurance
   - Updates sales order and inventory automatically
   - Calculates gross profit and margin

4. **`allocateFreightCosts(purchaseOrderId, shipmentId, costs, method)`**
   - Distributes freight costs to products proportionally
   - Supports allocation by quantity, value, weight, or volume
   - Creates freight allocation records for audit trail

**Reporting Functions:**

5. **`getProductProfitability(productId, startDate, endDate)`**
   - Generates profitability reports by product
   - Shows revenue, COGS breakdown, profit, and margins
   - Supports date range filtering

6. **`getInventoryValuation(warehouseId)`**
   - Calculates total inventory value at cost
   - Reports by product and warehouse
   - Uses average cost for valuation

7. **`getCOGSTransactions(filters, limit)`**
   - Retrieves COGS transaction history
   - Filterable by product, order, date range
   - Includes product and order details

### 3. API Endpoints (server/routers.ts)

**COGS Router:** `trpc.cogs.*`

- **`recordSale`** - Record COGS when fulfilling sales
- **`getTransactions`** - Get COGS history with filters
- **`profitability`** - Product profitability analysis
- **`valuation`** - Inventory valuation reports
- **`allocateFreight`** - Allocate freight costs to products
- **`updateCostBasis`** - Update inventory cost basis

All endpoints include:
- Input validation with Zod schemas
- Role-based access control (operations users)
- Audit logging
- Error handling

### 4. UI Components

**Profitability Dashboard** (`client/src/pages/operations/Profitability.tsx`)

**Features:**
- **Summary Cards**
  - Total Revenue for period
  - Total COGS with breakdown
  - Gross Profit and margin
  - Current inventory value

- **Product Profitability Report**
  - Revenue, COGS, and profit by product
  - Breakdown of product cost, freight, customs
  - Margin percentage with trend indicators
  - Sortable, filterable table

- **Inventory Valuation Report**
  - Current inventory value by product/warehouse
  - Quantity on hand
  - Average cost per unit
  - Total value calculation

- **Date Range Filtering**
  - Calendar picker with date range selection
  - Real-time data updates

- **Export Functionality**
  - Export reports to CSV/Excel
  - Full audit trail

**Route:** `/operations/profitability`

## How It Works

### COGS Calculation Flow

1. **Receiving Goods:**
   ```
   PO Received → updateInventoryCostBasis() 
   → Weighted average cost updated
   → Inventory value tracked
   ```

2. **Allocating Freight:**
   ```
   Shipment arrives → allocateFreightCosts()
   → Costs distributed to products
   → Freight allocation records created
   ```

3. **Recording Sales:**
   ```
   Order fulfilled → recordCOGSSale()
   → COGS calculated from inventory cost
   → Freight/customs costs allocated
   → Profit calculated and recorded
   → Inventory reduced and updated
   ```

### Cost Tracking Methods

**Weighted Average Cost:**
- Default method for inventory valuation
- New cost: `(old_qty × old_cost + new_qty × new_cost) / total_qty`
- Simple and accurate for most businesses

**FIFO (First In, First Out):**
- Uses lot tracking for specific costing
- Sells oldest inventory first
- More complex but accurate for perishables

## Integration Points

### Existing Systems

1. **Purchase Orders:**
   - When PO is received, call `updateInventoryCostBasis()`
   - When freight invoice processed, call `allocateFreightCosts()`

2. **Sales Orders:**
   - When order fulfilled, call `recordCOGSSale()`
   - COGS automatically calculated and recorded

3. **Shopify Integration:**
   - Sales from Shopify automatically trigger COGS calculation
   - Freight costs from Shopify orders can be tracked

4. **Inventory Management:**
   - Cost basis visible in inventory views
   - Valuation reports show total inventory value

### Sample Usage

**Recording a sale:**
```typescript
await trpc.cogs.recordSale.mutate({
  salesOrderId: 123,
  salesOrderLineId: 456,
  productId: 789,
  warehouseId: 1,
  quantitySold: 10,
  revenueAmount: 1000,
  freightCostAllocated: 50,
  customsCostAllocated: 25
});
```

**Getting profitability report:**
```typescript
const profitability = await trpc.cogs.profitability.query({
  productId: 789,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});
```

## Benefits

✅ **True Profitability** - Know exact profit including all costs
✅ **Freight Tracking** - Allocate delivery costs to products
✅ **Multi-Channel** - Works across Shopify, manual orders, and API
✅ **Inventory Valuation** - Accurate inventory asset tracking
✅ **Margin Analysis** - Identify high and low margin products
✅ **Historical Reporting** - Track profitability trends over time
✅ **Audit Trail** - Complete COGS transaction history

## Future Enhancements

- **Landed Cost Calculator** - Interactive tool for freight allocation
- **Margin Alerts** - Notifications for low margin products
- **Variance Analysis** - Compare actual vs. expected costs
- **Multi-Currency** - COGS in multiple currencies
- **Standard Costing** - Set standard costs for comparison
- **Cost Breakdown Charts** - Visualize cost components

## Security

- ✅ CodeQL scan passed with 0 vulnerabilities
- ✅ All endpoints protected with role-based access
- ✅ Input validation on all API calls
- ✅ SQL injection prevention via Drizzle ORM
- ✅ Audit logging for all COGS operations

## Testing Recommendations

1. **Unit Tests:**
   - Test COGS calculation methods (average, FIFO)
   - Test freight allocation algorithms
   - Test edge cases (zero quantity, negative margins)

2. **Integration Tests:**
   - Test full order-to-COGS flow
   - Test Shopify order integration
   - Test multi-warehouse scenarios

3. **Performance Tests:**
   - Test with large product catalogs
   - Test profitability queries with date ranges
   - Verify index usage on COGS tables

## Documentation

For detailed API documentation, see:
- `server/db.ts` - Function JSDoc comments
- `server/routers.ts` - Endpoint schemas
- `drizzle/schema.ts` - Table definitions

## Support

For questions or issues, contact the development team or refer to the main README.
