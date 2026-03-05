# B2B and International Freight Invoicing Feature

## Overview
This implementation adds comprehensive B2B (business-to-business) and international freight capabilities to the invoicing system, supporting various shipping options, payment terms, and payment methods required for global trade.

## Features Added

### 1. Payment Terms
Support for various payment term options commonly used in B2B transactions:
- **Due on Receipt**: Payment required immediately upon receipt
- **Net 15/30/45/60/90**: Payment due within specified days
- **EOM (End of Month)**: Payment due at the end of the month
- **COD (Cash on Delivery)**: Payment upon delivery
- **CIA (Cash in Advance)**: Payment before shipment
- **Custom**: Custom payment terms

### 2. Payment Methods
Support for international payment methods:
- **Bank Transfer**: Standard bank-to-bank transfer
- **Wire Transfer**: International wire transfer
- **ACH**: Automated Clearing House (US)
- **Check**: Traditional check payment
- **Credit Card**: Credit card payment
- **Letter of Credit**: Documentary credit for international trade
- **Cash in Advance**: Pre-payment before shipment
- **Documentary Collection**: Payment via banks collecting documents
- **Open Account**: Credit terms without security
- **Consignment**: Payment after goods are sold
- **Other**: Custom payment methods

### 3. International Freight Fields
Comprehensive fields for international shipping:
- **Incoterms**: International commercial terms (FOB, CIF, DDP, etc.)
- **Port of Loading**: Origin port for sea/air freight
- **Port of Discharge**: Destination port
- **Export/Import License Numbers**: Required licenses for customs
- **Shipping Instructions**: Special handling or routing instructions
- **Freight Amount**: Shipping cost
- **Insurance Amount**: Cargo insurance cost
- **Customs Duties**: Import duties and taxes

### 4. Invoice Line Item Enhancements
Additional fields for customs compliance:
- **HS Code**: Harmonized System tariff code for customs classification
- **Country of Origin**: Manufacturing country for trade compliance
- **Weight**: Item weight in kilograms
- **Volume**: Item volume in cubic meters

### 5. B2B Integration
- **Purchase Order Number**: Link invoices to customer PO
- **Freight RFQ Integration**: Link invoices to freight shipments

## Database Schema Changes

### Invoices Table
Added columns:
```sql
paymentTerms ENUM(...)
paymentMethod ENUM(...)
purchaseOrderNumber VARCHAR(64)
incoterms VARCHAR(10)
freightRfqId INT
portOfLoading VARCHAR(255)
portOfDischarge VARCHAR(255)
exportLicenseNumber VARCHAR(64)
importLicenseNumber VARCHAR(64)
shippingInstructions TEXT
freightAmount DECIMAL(15,2)
insuranceAmount DECIMAL(15,2)
customsDuties DECIMAL(15,2)
```

### Invoice Items Table
Added columns:
```sql
hsCode VARCHAR(20)
countryOfOrigin VARCHAR(100)
weight DECIMAL(12,2)
volume DECIMAL(12,2)
```

## PDF Invoice Enhancements

The invoice PDF now includes:
1. **Payment terms display** with human-readable formatting
2. **Shipping information section** showing:
   - Incoterms
   - Ports of loading and discharge
   - License numbers
   - Payment method
   - Shipping instructions
3. **Enhanced totals section** with:
   - Freight charges
   - Insurance costs
   - Customs duties
   - Taxes
   - Final total

## API Changes

### Invoice Creation/Update
Extended input validation to accept new fields:
```typescript
{
  // ... existing fields ...
  paymentTerms?: 'net_30' | 'net_60' | ...,
  paymentMethod?: 'wire' | 'letter_of_credit' | ...,
  purchaseOrderNumber?: string,
  incoterms?: string,
  portOfLoading?: string,
  portOfDischarge?: string,
  freightAmount?: string,
  insuranceAmount?: string,
  customsDuties?: string,
  items: [{
    // ... existing fields ...
    hsCode?: string,
    countryOfOrigin?: string,
    weight?: string,
    volume?: string,
  }]
}
```

## Testing

Comprehensive test suite added (`server/b2b-invoicing.test.ts`):
- Payment terms validation (10 different terms)
- Payment methods validation (11 different methods)
- B2B invoice validation
- International freight invoice validation
- Invoice item validation with international fields
- Incoterms support (11 standard terms)
- Total calculation with freight charges
- Payment terms due date calculation

All tests passing: ✅ 19/19

## Usage Examples

### Creating a B2B Invoice with Payment Terms
```typescript
const invoice = await trpc.invoices.create.mutate({
  customerId: 123,
  issueDate: new Date(),
  subtotal: "10000.00",
  totalAmount: "10800.00",
  paymentTerms: "net_30",
  paymentMethod: "wire",
  purchaseOrderNumber: "PO-2026-001",
});
```

### Creating an International Freight Invoice
```typescript
const invoice = await trpc.invoices.create.mutate({
  customerId: 456,
  issueDate: new Date(),
  subtotal: "50000.00",
  freightAmount: "5000.00",
  insuranceAmount: "1500.00",
  customsDuties: "2000.00",
  totalAmount: "58500.00",
  incoterms: "CIF",
  portOfLoading: "Shanghai Port",
  portOfDischarge: "Los Angeles Port",
  exportLicenseNumber: "EXP-123456",
  items: [{
    description: "Electronic Components",
    quantity: "1000",
    unitPrice: "50.00",
    totalAmount: "50000.00",
    hsCode: "8542.31",
    countryOfOrigin: "China",
    weight: "500.00",
    volume: "5.00",
  }],
});
```

## Migration

Run the migration to add new fields:
```bash
# Apply migration 0025
mysql < drizzle/0025_add_b2b_international_freight_to_invoices.sql
```

## Benefits

1. **Compliance**: Proper customs documentation with HS codes and country of origin
2. **Transparency**: Clear breakdown of all charges (freight, insurance, duties)
3. **Professional**: Industry-standard payment terms and methods
4. **Integration**: Links invoices to freight shipments for complete tracking
5. **Global Trade**: Supports international shipping with proper documentation
6. **Flexibility**: Optional fields allow domestic and international use

## Future Enhancements

Potential improvements:
- Automatic due date calculation based on payment terms
- Integration with freight quotes for automatic freight amount population
- Multi-currency support enhancements
- Customs document generation
- Trade compliance validation
