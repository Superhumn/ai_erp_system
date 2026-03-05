# Natural Language Invoice Creation Feature

## Overview

This feature allows users to create invoices from simple text input using AI-powered natural language processing. Instead of filling out complex forms, users can type natural language descriptions like:

```
$8500 invoice for 300lbs beef barbacoa bill to sysco net 30
```

The system will parse this text, create a draft invoice, show a preview, and upon approval, email the invoice with PDF attachment to the customer.

## Architecture

### Backend Components

#### 1. Invoice Text Parser (`server/_core/invoiceTextParser.ts`)

**Purpose**: Uses AI (LLM) to extract structured invoice data from natural language text.

**Key Functions**:
- `parseInvoiceText(text: string)`: Parses text and extracts:
  - Amount
  - Description
  - Quantity and unit
  - Customer name
  - Payment terms
  - Due date (calculated from payment terms)

**Example**:
```typescript
const parsed = await parseInvoiceText("$8500 invoice for 300lbs beef barbacoa bill to sysco net 30");
// Returns:
// {
//   amount: 8500,
//   description: "300lbs beef barbacoa",
//   quantity: 300,
//   unit: "lbs",
//   customerName: "sysco",
//   paymentTerms: "net 30",
//   dueInDays: 30
// }
```

**AI Integration**: Uses the existing `invokeLLM` function with a specialized system prompt for invoice data extraction.

#### 2. Database Functions (`server/db.ts`)

**New Function**:
- `getCustomerByName(name: string)`: Finds customer by name (case-insensitive)
- Used to match or create customer records from parsed text

#### 3. tRPC API Endpoints (`server/routers.ts`)

**New Endpoints**:

1. **`invoices.createFromText`**
   - Input: `{ text: string }`
   - Process:
     1. Parse text using AI
     2. Find or create customer
     3. Calculate dates (issue date, due date)
     4. Create draft invoice
     5. Create invoice line item
     6. Create audit log
   - Output: `{ invoiceId, invoiceNumber, parsed }`

2. **`invoices.approveAndEmail`**
   - Input: `{ invoiceId: number, message?: string }`
   - Process:
     1. Fetch invoice with items
     2. Generate PDF using existing invoice PDF service
     3. Send email with PDF attachment
     4. Update invoice status to 'sent'
     5. Mark as approved
     6. Create audit log
   - Output: `{ success: true, invoiceNumber }`

#### 4. Email Service Enhancement (`server/_core/email.ts`)

**Enhancement**: Added support for email attachments

```typescript
interface EmailOptions {
  // ... existing fields
  attachments?: Array<{
    content: string;      // Base64 encoded
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}
```

### Frontend Components

#### UI Location
`client/src/pages/finance/Invoices.tsx`

#### New Components

1. **Quick Create Button**
   - Location: Invoice page header, next to "Create Invoice" button
   - Label: "Quick Create"
   - Action: Opens text input dialog

2. **Text Input Dialog**
   - Title: "Quick Create Invoice"
   - Description: Instructions with example
   - Input: Multi-line textarea for natural language input
   - Buttons: "Cancel" and "Create Draft"
   - Example placeholder: `$8500 invoice for 300lbs beef barbacoa bill to sysco net 30`

3. **Preview Dialog**
   - Title: "Review Invoice Draft"
   - Shows parsed data:
     - Customer name
     - Amount (formatted as currency)
     - Description
     - Quantity and unit (if provided)
     - Payment terms (if provided)
   - Info message: "This invoice will be sent via email to the customer after approval. A PDF will be generated and attached to the email."
   - Buttons: "Cancel" and "Approve & Email"

## User Flow

```
1. User clicks "Quick Create" button
   ↓
2. Dialog opens with text input
   ↓
3. User enters: "$8500 invoice for 300lbs beef barbacoa bill to sysco net 30"
   ↓
4. User clicks "Create Draft"
   ↓
5. System parses text using AI
   ↓
6. System creates draft invoice in database
   ↓
7. Preview dialog shows parsed data
   ↓
8. User reviews and clicks "Approve & Email"
   ↓
9. System generates PDF
   ↓
10. System sends email with PDF attachment
    ↓
11. System updates invoice status to "sent"
    ↓
12. Success notification shown
```

## Example Usage

### Example 1: Basic Invoice
**Input**: `$8500 invoice for 300lbs beef barbacoa bill to sysco net 30`

**Parsed Data**:
- Amount: $8,500.00
- Description: 300lbs beef barbacoa
- Customer: sysco
- Payment Terms: net 30
- Due Date: 30 days from issue date

### Example 2: Simple Invoice
**Input**: `$1000 invoice to Acme Corp`

**Parsed Data**:
- Amount: $1,000.00
- Description: Invoice
- Customer: Acme Corp
- Payment Terms: (default)
- Due Date: 30 days from issue date (default)

### Example 3: Invoice with Due on Receipt
**Input**: `$5000 for consulting services to TechStart Inc due on receipt`

**Parsed Data**:
- Amount: $5,000.00
- Description: consulting services
- Customer: TechStart Inc
- Payment Terms: due on receipt
- Due Date: Same as issue date

## Testing

### Unit Tests
Location: `server/_core/invoiceTextParser.test.ts`

Tests cover:
- ✅ Parsing complete invoice with all fields
- ✅ Parsing invoice with missing optional fields
- ✅ Handling various formats

Run tests:
```bash
npm test server/_core/invoiceTextParser.test.ts
```

### Integration Testing

To test the complete flow:

1. Navigate to Finance → Invoices
2. Click "Quick Create" button
3. Enter: `$8500 invoice for 300lbs beef barbacoa bill to sysco net 30`
4. Click "Create Draft"
5. Review parsed data in preview
6. Click "Approve & Email"
7. Verify:
   - Invoice created in database
   - Email sent to customer
   - PDF attached to email
   - Invoice status updated to "sent"

## Dependencies

### Required Services
- **LLM Service**: For text parsing (uses existing `invokeLLM`)
- **Email Service**: For sending invoices (SendGrid)
- **PDF Generation**: For invoice PDF (Puppeteer)

### Required Configuration
- `SENDGRID_API_KEY`: SendGrid API key
- `SENDGRID_FROM_EMAIL`: From email address
- LLM API credentials (if not already configured)

## Security Considerations

1. **Input Validation**: Text is validated before processing
2. **Customer Verification**: System verifies customer exists or creates new record
3. **Approval Workflow**: Draft status prevents accidental sending
4. **Audit Logging**: All actions logged for compliance
5. **Role-Based Access**: Requires finance role or higher

## Future Enhancements

Potential improvements:
- [ ] Support for multiple line items in text
- [ ] Tax calculation from text
- [ ] Currency detection
- [ ] Address parsing
- [ ] Support for discount codes
- [ ] Batch invoice creation from multiple texts
- [ ] Training data collection for improved parsing
- [ ] Custom parsing rules per company
- [ ] Integration with accounting software

## Files Modified

1. **New Files**:
   - `server/_core/invoiceTextParser.ts` - AI text parser
   - `server/_core/invoiceTextParser.test.ts` - Unit tests

2. **Modified Files**:
   - `server/db.ts` - Added `getCustomerByName` function
   - `server/routers.ts` - Added `createFromText` and `approveAndEmail` endpoints
   - `server/_core/email.ts` - Added attachment support
   - `client/src/pages/finance/Invoices.tsx` - Added UI components

## Performance Considerations

- **AI Parsing**: ~1-3 seconds per invoice (depends on LLM response time)
- **PDF Generation**: ~1-2 seconds per invoice
- **Email Sending**: ~1 second per email

Total time from text input to email sent: ~3-6 seconds

## Error Handling

The system handles various error scenarios:

1. **Invalid Text**: Shows error if required fields missing
2. **Customer Not Found**: Automatically creates new customer
3. **Email Failure**: Shows error but keeps invoice in draft status
4. **PDF Generation Failure**: Falls back to HTML email
5. **LLM Unavailable**: Shows user-friendly error message
