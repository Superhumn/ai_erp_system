# Natural Language Commands - Quick Reference

## Open AI Command Bar
- **Mac:** `⌘K`
- **Windows/Linux:** `Ctrl+K`

## Purchase Orders 📦
```
Order 500kg mushrooms from Fresh Farms by Friday
Create PO for Sysco: 300lbs beef $2500, 150lbs chicken $800
Purchase order to ABC for 1000 units SKU-123 at $5 each
```

## Shipments 🚚
```
FedEx tracking 123456789 delivered to warehouse
Shipment LA to NYC via UPS, tracking ABC123, Friday
DHL 987654321 in transit, 50kg, ETA March 15
```

## Payments 💰
```
$5000 payment from Acme Corp for invoice INV-001
Bank transfer $2500 ref #TX123 from Customer XYZ
Check payment 3500 for invoice 2024-045 March 10
```

## Work Orders 🏭
```
Produce 1000 units Widget A by end of month
Work order 500kg pasta batch, high priority, Friday
Manufacturing: 250 cases SKU-789 by March 20
```

## Inventory Transfers 📊
```
Transfer 100kg flour from Main to Production
Move 50 units SKU-123 from LA to NYC warehouse
Transfer 200kg tomatoes from storage to processing
```

## Invoices 📄
```
$500 invoice to Acme Corp for consulting services
$8500 invoice for 300lbs beef to Sysco net 30
$1000 invoice to customer XYZ
```

## Quick Entity Creation

### Customers
```
New customer Acme Corp email contact@acme.com
Add customer John Doe, 123 Main St
```

### Vendors
```
Vendor Fresh Farms contact sarah@freshfarms.com
Supplier Global Foods Inc, net 30
```

### Products
```
Product Premium Pasta SKU PASTA-001 $12.99
Add product Organic Flour 25kg $15 cost $25 sell
```

### Materials
```
Material Wheat Flour SKU FLOUR-001 kg $2.50
Material Olive Oil supplier Italian Foods reorder 100L
```

## Pattern Examples

### Quantities
- `500kg` `100lbs` `25g`
- `50L` `10gal` `500ml`
- `100 units` `25 pieces` `10 cases`

### Dates
- `tomorrow` `next Friday` `in 2 weeks`
- `end of month` `March 15` `2026-03-15`
- `due on receipt` `net 30`

### Multiple Items
```
Order from Fresh Farms: 100kg flour, 50kg sugar, 25L oil
```

## Tips

✅ **Do:**
- Be specific with quantities and dates
- Include entity names (vendors, customers)
- Use natural language
- Review draft records before finalizing

❌ **Don't:**
- Be too vague ("Order stuff")
- Omit required details (amount, customer)
- Use special syntax or commands
- Expect exact format matching

## Common Issues

| Issue | Solution |
|-------|----------|
| "Unable to identify payer" | Create entity first or be more specific |
| "Warehouse not found" | Use exact warehouse name |
| "Missing required field" | Include all key details |
| "Failed to parse" | Be more specific |

## Access

Press `⌘K` anywhere in the app to open the AI Command Bar.

Quick actions appear automatically based on your current page.

---

**Print this page for easy reference!**
