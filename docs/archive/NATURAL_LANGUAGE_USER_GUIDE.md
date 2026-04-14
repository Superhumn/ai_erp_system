# Natural Language Commands - User Guide

## Overview

You can now use natural language to perform complex operations in the AI ERP system through the AI Command Bar. Simply press `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) and type what you want to do in plain English.

## Getting Started

### Open the AI Command Bar
- **Mac:** Press `⌘K`
- **Windows/Linux:** Press `Ctrl+K`
- **Or:** Click the "Ask AI" button in the bottom right corner

### Type Your Command
Use natural language to describe what you want to do. The system will understand and execute your request.

## Supported Operations

### 1. Create Purchase Orders 📦

**What You Can Do:**
- Order materials from vendors
- Specify quantities, delivery dates, and prices
- Auto-create vendors and materials if they don't exist

**Examples:**
```
Order 500kg mushrooms from Fresh Farms by Friday

Create PO for Sysco: 300lbs beef $2500, 150lbs chicken $800

Purchase order to Vendor ABC for 1000 units of SKU-123 at $5 each

Order from supplier: 100kg flour, 50kg sugar, delivery next week
```

**What Happens:**
1. System parses your text using AI
2. Finds or creates the vendor
3. Finds or creates materials
4. Creates a draft Purchase Order
5. Navigates you to the Procurement page
6. Shows success notification with PO number

---

### 2. Track Shipments 🚚

**What You Can Do:**
- Add shipment tracking information
- Update shipment status
- Record carrier and delivery details

**Examples:**
```
FedEx tracking 123456789 delivered to warehouse

Shipment from LA to NYC via UPS, tracking ABC123, arriving Friday

DHL package 987654321 in transit, 50kg, ETA March 15

Track shipment USPS 555666777 pending pickup
```

**What Happens:**
1. System extracts carrier and tracking number
2. Identifies status and locations
3. Creates shipment record
4. Shows confirmation with tracking details

---

### 3. Record Payments 💰

**What You Can Do:**
- Record payments received from customers
- Link payments to invoices
- Track payment methods and references

**Examples:**
```
$5000 payment received from Acme Corp for invoice INV-001

Bank transfer $2500 reference #TX123 from Customer XYZ

Check payment 3500 for invoice 2024-045 dated March 10

Received $1000 from John Doe via credit card
```

**What Happens:**
1. System identifies payer and amount
2. Links to invoice if mentioned
3. Creates payment record
4. Updates invoice status (partial or paid)
5. Navigates to Finance page
6. Shows confirmation

---

### 4. Create Work Orders 🏭

**What You Can Do:**
- Schedule production runs
- Set priorities and deadlines
- Specify quantities and products

**Examples:**
```
Produce 1000 units of Widget A by end of month

Work order for 500kg pasta batch, high priority, due Friday

Manufacturing order: 250 cases product SKU-789 needed by March 20

Make 100 units of Premium Product, urgent
```

**What Happens:**
1. System identifies product and quantity
2. Extracts due date and priority
3. Creates draft work order
4. Navigates to Manufacturing page
5. Shows confirmation with WO number

---

### 5. Transfer Inventory 📊

**What You Can Do:**
- Move items between warehouses
- Transfer multiple items at once
- Specify quantities and units

**Examples:**
```
Transfer 100kg flour from Main Warehouse to Production Facility

Move 50 units SKU-123 and 30 units SKU-456 from LA to NYC warehouse

Inventory transfer: 200kg tomatoes from storage to processing

Transfer materials from Warehouse A to Warehouse B: 100 units item1, 50 units item2
```

**What Happens:**
1. System identifies source and destination warehouses
2. Extracts items and quantities
3. Creates transfer record
4. Shows confirmation with transfer number

---

### 6. Create Invoices 📄

**What You Can Do:**
- Bill customers for products or services
- Set payment terms and amounts
- Specify quantities and descriptions

**Examples:**
```
$500 invoice to Acme Corp for consulting services

$8500 invoice for 300lbs beef barbacoa bill to Sysco net 30

$1000 invoice to customer XYZ

$5000 for consulting services to TechStart Inc due on receipt
```

**What Happens:**
1. System extracts amount and customer
2. Finds or creates customer
3. Creates draft invoice
4. Navigates to Invoices page
5. Shows confirmation with invoice number

---

### 7. Quick Entity Creation

**Customers:**
```
New customer Acme Corp email contact@acme.com phone 555-1234

Add customer John Doe, individual, 123 Main St
```

**Vendors:**
```
Vendor Fresh Farms contact sarah@freshfarms.com phone 555-9876

Add supplier Global Foods Inc, payment terms net 30
```

**Products:**
```
Product Premium Pasta SKU PASTA-001 price $12.99

Add product Organic Flour 25kg bag cost $15 sell $25
```

**Materials:**
```
Material Wheat Flour SKU FLOUR-001 unit kg cost $2.50

Add material Olive Oil supplier Italian Foods reorder 100L
```

## Tips for Better Results

### Be Specific
✅ **Good:** "Order 500kg mushrooms from Fresh Farms by Friday"
❌ **Too vague:** "Order mushrooms"

### Include Key Details
- **Quantities:** "500kg", "100 units", "25 cases"
- **Dates:** "by Friday", "next week", "March 15"
- **Entities:** "from Fresh Farms", "to Acme Corp"
- **Amounts:** "$5000", "$12.99 per unit"

### Use Natural Language
You don't need special syntax - just describe what you want:
- "Order 100kg of flour from supplier ABC"
- "Create invoice for $1000 to customer XYZ"
- "Transfer 50 units from warehouse A to warehouse B"

### Multiple Items
You can specify multiple items in one command:
```
Order from Fresh Farms: 100kg flour, 50kg sugar, 25L oil
```

## Common Patterns

### Dates
- **Relative:** "tomorrow", "next Friday", "in 2 weeks", "end of month"
- **Absolute:** "March 15", "2026-03-15"
- **Special:** "due on receipt", "net 30"

### Quantities
- **Weight:** "500kg", "100lbs", "25g"
- **Volume:** "50L", "10gal", "500ml"
- **Count:** "100 units", "25 pieces", "10 cases"

### Amounts
- **Currency:** "$500", "$12.99"
- **Payment Terms:** "net 30", "net 15", "due on receipt"

## Quick Reference

| Operation | Quick Action Suggestion |
|-----------|------------------------|
| Purchase Order | "Create PO with text" |
| Shipment | "Track shipment" |
| Payment | "Record payment" |
| Work Order | "Create work order" |
| Inventory Transfer | "Transfer inventory" |
| Invoice | "Create invoice quickly" |

## Troubleshooting

### "Unable to identify payer"
**Problem:** System couldn't find or create customer/vendor
**Solution:** Create the customer/vendor first, or be more specific with the name

### "Warehouse not found"
**Problem:** Warehouse name doesn't match exactly
**Solution:** Use the exact warehouse name from your system

### "Missing required field"
**Problem:** Essential information is missing (e.g., amount, customer name)
**Solution:** Include all required details in your command

### "Failed to parse text"
**Problem:** Text is too ambiguous or incomplete
**Solution:** Be more specific and include key details

## Best Practices

1. **Start Simple:** Try basic commands first to get familiar
2. **Review Drafts:** Most operations create drafts - review before finalizing
3. **Use Examples:** Copy and modify the examples above
4. **Check Results:** Verify the created records are correct
5. **Report Issues:** If something doesn't work as expected, let us know

## Privacy & Security

- All operations are logged for audit purposes
- Role-based access control still applies
- Sensitive information is protected
- You can only perform actions you have permission for

## Need Help?

- **Press `⌘K`** to see quick action suggestions
- **Hover over examples** to learn more
- **Check the audit log** to see what was created
- **Contact support** if you encounter issues

## What's Coming Next

Future enhancements planned:
- Voice input support
- Batch operations
- Learning from corrections
- More entity types
- Multi-language support

---

**Version:** 1.0
**Last Updated:** February 16, 2026
**Feedback:** Let us know how we can improve!
