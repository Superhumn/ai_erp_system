# AI Command Bar Invoice Creation - Manual Test Guide

## Overview
This document provides manual testing steps for the invoice creation capability in the AI Command Bar.

## Feature Description
Users can now create invoices using natural language prompts in the AI Command Bar (⌘K/Ctrl+K).

## Testing Steps

### Test 1: Create Invoice with Natural Language
1. Open the application
2. Press `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) to open the AI Command Bar
3. Type: `$8500 invoice for 300lbs beef barbacoa bill to sysco net 30`
4. Press Enter or click Submit
5. **Expected Result**: 
   - Success toast: "Invoice created successfully"
   - Description: "Invoice #INV-XXXXX has been created as a draft"
   - Automatic redirect to `/finance/invoices` page
   - New invoice appears in the list with:
     - Customer: Sysco (or newly created if doesn't exist)
     - Amount: $8,500.00
     - Status: Draft
     - Description: 300lbs beef barbacoa

### Test 2: Simple Invoice Creation
1. Open AI Command Bar (⌘K)
2. Type: `$1000 invoice to Acme Corp`
3. Press Enter
4. **Expected Result**:
   - Invoice created with $1,000 total
   - Customer: Acme Corp
   - Default payment terms (Net 30)

### Test 3: Invoice with Custom Terms
1. Open AI Command Bar (⌘K)
2. Type: `$5000 for consulting services to TechStart Inc due on receipt`
3. Press Enter
4. **Expected Result**:
   - Invoice created with $5,000 total
   - Customer: TechStart Inc
   - Description: consulting services
   - Due date: Same as issue date (due on receipt)

### Test 4: Quick Action Button
1. Open AI Command Bar (⌘K)
2. Look for "Create invoice quickly" in the quick actions list
3. Click on it
4. **Expected Result**:
   - Input field pre-filled with: `$500 invoice to Acme Corp for consulting services`
   - Ready to submit

### Test 5: Error Handling
1. Open AI Command Bar (⌘K)
2. Type: `invoice` (incomplete/invalid input)
3. Press Enter
4. **Expected Result**:
   - Error toast displayed with helpful message
   - User can try again

## Intent Detection Patterns

The system recognizes invoice creation with these patterns:

### Pattern 1: Explicit Creation
- "create invoice for..."
- "generate invoice..."
- "send invoice to..."
- "create bill for..."

### Pattern 2: Direct Invoice
- "$500 invoice to..."
- "invoice for $1000..."
- "$2000 bill to Customer Name"
- "invoice net 30 to..."

## Backend Processing

When an invoice is created:
1. AI parses the natural language text
2. Extracts: amount, description, customer name, quantity, unit, payment terms
3. Finds or creates customer in database
4. Generates invoice number (e.g., INV-20260216-001)
5. Creates draft invoice with parsed data
6. Creates invoice line item
7. Logs audit trail
8. Returns invoice ID and number

## API Endpoint Used

```typescript
trpc.invoices.createFromText.mutate({
  text: "user's natural language input"
})
```

Returns:
```typescript
{
  invoiceId: number,
  invoiceNumber: string,
  parsed: {
    amount: number,
    description: string,
    customerName: string,
    quantity?: number,
    unit?: string,
    paymentTerms?: string,
    dueInDays?: number
  }
}
```

## Code Changes Summary

### File: `client/src/components/AICommandBar.tsx`

1. **Added Intent Detection** (lines ~520-540):
   - Detects invoice creation keywords
   - Handles both explicit ("create invoice") and implicit ("$500 invoice to") patterns

2. **Added Mutation** (lines ~641-656):
   - `createInvoiceFromText` mutation
   - Success handling with toast and redirect
   - Error handling with user-friendly messages

3. **Added Handler** (lines ~782-789):
   - Handles `generate_invoice` task type
   - Calls mutation with user's input text

4. **Added Quick Action** (line ~344):
   - Example invoice creation in suggestions list

## Notes for Developers

- Backend infrastructure was already complete (invoiceTextParser.ts)
- Only frontend wiring was missing
- No database changes required
- No new dependencies added
- Minimal code changes (~50 lines)
