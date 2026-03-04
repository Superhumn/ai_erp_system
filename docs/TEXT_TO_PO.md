# Text to Purchase Order (LLM PO Creation)

This feature allows creating Purchase Orders from natural language text input using AI.

## Overview

Users can type natural language requests like "order 3 tons of mushrooms ship to alex meats" and the system will:
1. Parse the text using an LLM to extract structured data
2. Find the appropriate vendor based on the material
3. Show a preview of the PO
4. Create the PO with one click

## API Endpoints

### Parse Text
```
POST /trpc/purchaseOrders.parseText
Body: { text: string }
```

Returns parsed data and a PO preview.

### Create from Text
```
POST /trpc/purchaseOrders.createFromText
Body: { text: string, preview: POPreview, sendEmail: boolean }
```

Creates the PO and optionally sends an email to the vendor.

## Usage

1. Navigate to Purchase Orders page
2. Click "Create from Text" button
3. Type your request in natural language
4. Review the AI-generated preview
5. Confirm to create the PO

## Technical Details

- Uses the configured LLM (via `invokeLLM`) to parse text
- Searches for matching raw materials and their preferred vendors
- Falls back to the first active vendor if no specific match found
- Prices are marked as "estimated" if not found in the database
