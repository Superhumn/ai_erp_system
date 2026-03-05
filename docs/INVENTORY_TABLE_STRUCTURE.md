# Inventory Management Hub - Table Structure

## Table Layout

```
+----------------+--------------------+------------------+-------------------+-------------------+
|   Material     | Production         | Raw Material PO  | Copacker          | Freight           |
|                | Forecast           |                  | Location          | Tracking          |
+----------------+--------------------+------------------+-------------------+-------------------+
| - Name         | - Forecast Qty ✏️  | - PO Number      | - Location Name   | - Booking Number  |
| - SKU          | - Period Dates     | - Status ✏️      | - City, State     | - Status ✏️       |
| - Category     | - Confidence %     | - Expected Date  | - (Multiple locs) | - Tracking # ✏️   |
|                |                    | - Total Amount   |                   | - ETA Date        |
+----------------+--------------------+------------------+-------------------+-------------------+
```

✏️ = Editable field (click to edit inline)

## Column Details

### 1. Material
- **Name**: Product/raw material name
- **SKU**: Stock keeping unit identifier
- **Category**: Material category badge

### 2. Production Forecast
- **Forecasted Quantity**: Expected demand (EDITABLE)
  - Shows quantity with unit (e.g., "500 EA")
  - Click to edit quantity
- **Period Dates**: Forecast date range
  - Format: "MMM d - MMM d, yyyy"
- **Confidence**: AI confidence percentage
  - Format: "Confidence: XX%"

### 3. Raw Material PO
- **PO Number**: Purchase order identifier (clickable link)
- **Status**: Order status (EDITABLE)
  - Options: draft, sent, confirmed, partial, received, cancelled
  - Color-coded badges
- **Expected Date**: Expected delivery date
  - Format: "Expected: MMM d, yyyy"
- **Total Amount**: PO total cost
  - Format: "$X,XXX.XX"

### 4. Copacker Location
- **Multiple Locations**: List of copacker facilities
  - Shows up to 2 locations with full details
  - Additional locations shown as "+X more" badge
- **Location Info**:
  - Facility name
  - City, State

### 5. Freight Tracking
- **Booking Number**: Freight booking identifier
- **Status**: Shipment status (EDITABLE)
  - Options: pending, confirmed, in_transit, arrived, delivered, cancelled
  - Color-coded badges
- **Tracking Number**: Carrier tracking number (EDITABLE)
  - Click to add or edit tracking number
- **ETA**: Estimated arrival date
  - Format: "ETA: MMM d, yyyy"

## Edit Functionality

### How to Edit a Cell:
1. Hover over any editable cell (shows edit icon)
2. Click the cell to enter edit mode
3. For text fields: Type new value
4. For status fields: Select from dropdown
5. Press Enter or click checkmark ✓ to save
6. Press Escape or click X to cancel

### What Happens on Save:
1. Value is validated
2. API call updates the database
3. Audit log entry is created
4. Success toast notification appears
5. Table data is refreshed
6. Cell exits edit mode

## Summary Cards (Above Table)

```
+------------------+  +------------------+  +------------------+  +------------------+
| 📦 Raw Materials |  | 🛒 Active POs    |  | 🚚 In Transit   |  | 📈 Forecasted   |
|       XX         |  |       XX         |  |       XX         |  |       XX         |
+------------------+  +------------------+  +------------------+  +------------------+
```

## Search Bar
- Real-time filtering
- Searches across: Material name, SKU, PO number
- Located in table header

## Example Row

```
Material: "Organic Wheat Flour"
SKU: "RM-001"
Category: [Ingredients]

Forecast: "2,500 KG" (editable)
Period: Jan 15 - Mar 15, 2026
Confidence: 87%

PO: #PO-2024-123 (clickable)
Status: [Confirmed] (editable dropdown)
Expected: Feb 1, 2026
Amount: $3,450.00

Locations:
- ABC Copacker, Portland, OR
- XYZ Manufacturing, Seattle, WA

Freight: BK-2024-456
Status: [In Transit] (editable dropdown)
Tracking: 1Z999AA10123456784 (editable)
ETA: Jan 28, 2026
```

## Data Sources (Backend)

The table aggregates data from these database tables:
- `rawMaterials` - Material master data
- `demandForecasts` - Production forecast data
- `purchaseOrders` + `purchaseOrderItems` - PO information
- `warehouses` (type='copacker') - Copacker facility locations
- `freightBookings` - Freight tracking information

All data is joined and consolidated in the `getInventoryManagementData()` function.
