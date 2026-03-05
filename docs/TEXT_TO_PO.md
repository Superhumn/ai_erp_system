# Text-to-PO Feature

## Overview

The Text-to-PO feature allows users to quickly create Purchase Orders using natural language input. The system uses AI to parse free-form text and automatically generate a structured PO with vendor matching and material lookup.

## How to Use

### 1. Access the Feature

Navigate to **Operations → Purchase Orders** in the application. Click the **"Quick Create from Text"** button (with sparkles icon) next to the regular "Create PO" button.

### 2. Enter Your Order Description

In the dialog that appears, enter a natural language description of what you want to order. For example:

```
order 3 tons of mushrooms ship to alex meats
```

Other examples:
- "order 500 kg of organic wheat flour from our supplier"
- "purchase 1000 units of packaging material ship to warehouse 3"
- "order 25 tons of tomatoes delivery next week"

### 3. Parse and Preview

Click **"Parse & Preview"** to have the AI analyze your text. The system will:

- Extract the material/product name
- Identify the quantity and unit
- Determine the shipping destination (if specified)
- Match to existing vendors and materials in your database
- Calculate preliminary pricing (if available)

### 4. Review the Preview

The preview shows:

- **Vendor**: Matched vendor from your database
- **Items**: Line items with descriptions and pricing
- **Total**: Calculated total amount
- **Ship To**: Delivery address (if specified)
- **Notes**: Auto-generated notes with any additional context

**Important Warnings:**

- ⚠️ **Default vendor suggested**: If the material isn't found in inventory, the system suggests the first available vendor
- ⚠️ **Price not available**: If pricing isn't available for the material, you'll need to update it manually after creation

### 5. Create the PO

You have two options:

- **Create Draft**: Creates the PO in draft status for further editing
- **Create & Email**: Creates the PO and immediately sends it to the supplier via email

## Technical Details

### Backend Implementation

- **Service**: `server/textToPOService.ts`
  - `parseTextToPO()`: Uses LLM to extract structured data from natural language
  - `findVendorForMaterial()`: Matches materials to vendors using fuzzy matching
  - `createPOPreview()`: Generates preview with pricing and vendor info
  - `createPOFromPreview()`: Creates the actual PO record

- **API Endpoints**: `server/routers.ts`
  - `purchaseOrders.parseText`: Parse text and return preview
  - `purchaseOrders.createFromText`: Create PO and optionally send email

### Frontend Implementation

- **Component**: `client/src/pages/operations/PurchaseOrders.tsx`
  - New dialog with text input
  - Preview display with warnings
  - Two-button workflow (Draft vs Email)

### Email Integration

When you choose "Create & Email", the system:
1. Creates the PO in the database
2. Uses the existing `sendPOEmail` service
3. Sends a formatted email to the vendor's email address
4. Includes PO details, line items, and totals
5. Provides a link to the supplier portal for document uploads

## Examples

### Example 1: Simple Order
**Input**: `order 3 tons of mushrooms ship to alex meats`

**Result**:
- Material: mushrooms (3 tons)
- Vendor: Matched from database
- Ship To: alex meats
- Status: Ready to create

### Example 2: Multiple Attributes
**Input**: `purchase 500 kg of organic wheat flour from our supplier for immediate delivery`

**Result**:
- Material: organic wheat flour (500 kg)
- Vendor: Matched based on "flour" in materials database
- Notes: Includes "immediate delivery" context
- Status: Ready to create

## Tips for Best Results

1. **Be specific**: Include quantity and unit (tons, kg, lbs, pieces, etc.)
2. **Mention recipients**: Use "ship to" or "delivery to" to specify destinations
3. **Use known materials**: Materials already in your inventory will match more accurately
4. **Review before emailing**: Always check the preview before sending to suppliers

## Limitations

- Currently supports single-item orders (one material per text input)
- Pricing relies on existing material data in the database
- Vendor matching uses fuzzy logic and may need manual correction
- Email sending requires configured SendGrid integration

## Future Enhancements

- Support for multi-item orders in a single text input
- Better natural language understanding for delivery dates
- Integration with contract pricing
- Auto-approval for trusted vendors below certain thresholds
