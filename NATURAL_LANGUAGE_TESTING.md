# Natural Language Testing Guide

## Test Cases for Each Entity Type

### 1. Invoice Creation (Already Implemented)
**Status:** ✅ Working

**Test Cases:**
- ✅ "$8500 invoice for 300lbs beef barbacoa bill to sysco net 30"
- ✅ "$1000 invoice to Acme Corp"
- ✅ "$5000 for consulting services to TechStart Inc due on receipt"

### 2. Purchase Order Creation
**Status:** ⏳ Backend integration pending

**Test Cases:**
- [ ] "Order 500kg mushrooms from Fresh Farms by Friday"
- [ ] "Create PO for Sysco: 300lbs beef $2500, 150lbs chicken $800"
- [ ] "Purchase order to Vendor ABC for 1000 units of SKU-123 at $5 each"
- [ ] "Order from supplier: 100kg flour, 50kg sugar, delivery next week"

**Expected Results:**
- Draft PO created with vendor
- Line items created for each material
- Materials auto-created if don't exist
- Delivery date parsed correctly
- Navigate to /procurement after creation

### 3. Shipment Tracking
**Status:** ⏳ Backend integration pending

**Test Cases:**
- [ ] "FedEx tracking 123456789 delivered to warehouse"
- [ ] "Shipment from LA to NYC via UPS, tracking ABC123, arriving Friday"
- [ ] "DHL package 987654321 in transit, 50kg, ETA March 15"
- [ ] "Track shipment USPS 555666777 pending pickup"

**Expected Results:**
- Shipment record created
- Carrier and tracking number captured
- Status set appropriately
- Origin/destination if provided
- Weight and delivery date if provided

### 4. Payment Recording
**Status:** ⏳ Backend integration pending

**Test Cases:**
- [ ] "$5000 payment received from Acme Corp for invoice INV-001"
- [ ] "Bank transfer $2500 reference #TX123 from Customer XYZ"
- [ ] "Check payment 3500 for invoice 2024-045 dated March 10"
- [ ] "Received $1000 from John Doe via credit card"

**Expected Results:**
- Payment record created
- Linked to invoice if mentioned
- Customer/vendor identified or created
- Invoice status updated (partial or paid)
- Navigate to /finance after creation

### 5. Work Order Creation
**Status:** ⏳ Backend integration pending

**Test Cases:**
- [ ] "Produce 1000 units of Widget A by end of month"
- [ ] "Work order for 500kg pasta batch, high priority, due Friday"
- [ ] "Manufacturing order: 250 cases product SKU-789 needed by March 20"
- [ ] "Make 100 units of Premium Product, urgent"

**Expected Results:**
- Work order created in draft
- Product identified or created
- Quantity and unit parsed
- Due date set if provided
- Priority level set if mentioned
- Navigate to /operations/manufacturing

### 6. Inventory Transfer
**Status:** ⏳ Backend integration pending

**Test Cases:**
- [ ] "Transfer 100kg flour from Main Warehouse to Production Facility"
- [ ] "Move 50 units SKU-123 and 30 units SKU-456 from LA to NYC warehouse"
- [ ] "Inventory transfer: 200kg tomatoes from storage to processing"
- [ ] "Transfer materials from Warehouse A to Warehouse B: 100 units item1, 50 units item2"

**Expected Results:**
- Transfer record created
- Source and destination warehouses identified
- Multiple items supported
- Materials identified or created
- Status set to pending

## Testing Procedure

### Phase 1: Frontend Testing
1. Open AI Command Bar (⌘K)
2. Try each test case
3. Verify intent is detected correctly
4. Check that appropriate mutation is called
5. Note any errors in console

### Phase 2: Backend Testing (After Integration)
1. Add backend endpoints to routers
2. Test each createFromText endpoint
3. Verify database records created
4. Check audit logs
5. Verify entity linking (vendor→PO, customer→payment, etc.)

### Phase 3: End-to-End Testing
1. Complete full user flow for each entity
2. Verify navigation works
3. Check toast notifications
4. Test error scenarios:
   - Invalid input
   - Missing required fields
   - Non-existent entities
   - Network errors

### Phase 4: Edge Cases
Test edge cases for each entity:
- Very long text input
- Ambiguous input
- Multiple currencies
- Special characters
- Different date formats
- Missing units
- Zero quantities
- Negative amounts (should error)

## Test Results Template

```markdown
### Test: [Entity Type] - [Test Case]
**Input:** "[exact text entered]"
**Expected:** [expected behavior]
**Actual:** [what actually happened]
**Status:** ✅ Pass | ❌ Fail | ⚠️ Partial
**Notes:** [any observations]
```

## Known Limitations

1. **Backend Integration:** Endpoints defined but not yet integrated into main routers
2. **Database Functions:** Some helper functions may not exist (e.g., `getWarehouseByName`)
3. **Entity Linking:** Complex linking logic may need refinement
4. **Error Messages:** User-facing errors may need improvement

## Success Criteria

✅ All test cases pass
✅ No console errors
✅ Database records created correctly
✅ Navigation works
✅ Toast notifications show
✅ Audit logs created
✅ Related entities linked properly
✅ Error handling graceful
✅ Performance acceptable (<5s per operation)
✅ Code review passes
✅ Security scan passes

## Performance Benchmarks

Target performance for each operation:
- Intent detection: <50ms
- LLM parsing: 1-3 seconds
- Database operations: <500ms
- Total time: <4 seconds

## Monitoring

Track these metrics:
- Success rate per entity type
- Average parsing time
- Error rates
- Most common failure reasons
- User satisfaction (implicit: completion rate)
