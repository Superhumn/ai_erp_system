# Automation Gaps & Approval Coverage Review

## Executive Summary

An audit of the AI ERP system's workflow engine, orchestrator, schedulers, routers, and processors reveals several disconnected automation paths and missing approval gates. The system has strong automation *infrastructure* (event engine, workflow processors, AI decision-making, approval thresholds) but key wiring between modules is incomplete, meaning many automated workflows will never trigger from real user actions.

---

## 1. CRITICAL: Routers Don't Emit Supply Chain Events

**Files**: `server/routers.ts`, `server/autonomousWorkflowEngine.ts`, `server/supplyChainOrchestrator.ts`

The `supplyChainOrchestrator` configures 14 event-driven workflows that react to events like `order_confirmed`, `invoice_received`, `po_received`, etc. However, **`routers.ts` contains zero calls to `emitEvent()`**. All user-initiated CRUD operations (confirming orders, receiving POs, completing work orders) are invisible to the automation engine.

| Event Workflow Expects | What Should Trigger It | Emitted? |
|---|---|---|
| `order_confirmed` | Order status changed to confirmed in UI | **No** — `routers.ts:1227` updates but doesn't emit |
| `invoice_received` | Vendor invoice imported/created manually | **No** — only emitted from `workflowProcessors.ts` |
| `po_received` | PO marked as received | **No** — creates in-app notification only (`routers.ts:1732`) |
| `production_completed` | Work order completed | **No** — creates notification, not supply chain event (`routers.ts:6832`) |
| `order_shipped` | Order shipped | **No** |
| `inventory_adjustment` | Manual inventory correction | **No** |

**Impact**: Order Fulfillment, Invoice Matching, and Procurement workflows never fire from user actions — only from internal workflow processor outputs.

**Fix**: Add `emitEvent()` calls at each status-transition point in the routers.

---

## 2. Post-Approval Workflow Resumption is Unimplemented

**File**: `server/autonomousWorkflowEngine.ts:609-613`

```typescript
if (approved) {
  // Resume workflow execution
  // This would trigger continuation of the workflow from where it paused
  // For now, we'll mark it as approved and let the scheduler pick it up
}
```

After a human approves a PO, payment, or quote, the workflow run is marked `approved` but **nothing resumes it**. The scheduler only looks for `scheduled` and `event`-triggered workflows — paused workflows are never picked back up.

**Impact**: Approved suggested POs are never converted to actual POs. Approved payments are never executed. Approved vendor quotes don't generate POs.

**Fix**: After approval, either emit an `approval_completed` event (which the Procurement workflow already listens for) or add a scheduler loop that picks up `approved` workflow runs and resumes execution.

---

## 3. Email Notifications Recorded But Never Sent

Three separate broken email paths:

### 3a. Workflow Notifications
**File**: `server/autonomousWorkflowEngine.ts:881`
```typescript
// TODO: Actually send email if configured
// if (sendEmailNotification) {
//   await sendEmail({ ... });
// }
```
`sendNotification()` creates a DB record but never dispatches email.

### 3b. User Event Notifications
**File**: `server/db.ts:4793`
```typescript
// TODO: Send email notification via SendGrid
```
`notifyUsersOfEvent()` checks preferences, increments count, but doesn't call SendGrid.

### 3c. User Invitations
**Files**: `server/routers.ts:9976, 10008`
```typescript
// TODO: Send invitation email
// TODO: Resend invitation email
```

**Note**: The email infrastructure (`emailQueueWorker.ts`, `sendEmail()`, SendGrid integration) is fully implemented and functional — it just isn't called from these three sites.

**Fix**: Wire `sendEmail()` at each TODO site using the existing `emailQueueWorker` infrastructure.

---

## 4. Placeholder Scheduler Conditions

**File**: `server/aiAgentScheduler.ts`

| Condition | Line | Status |
|---|---|---|
| `checkPaymentReminderCondition()` | 199-201 | Always returns `false` — overdue invoices never checked |
| `checkShipmentTrackingCondition()` | 204-206 | Always returns `false` — tracking updates never trigger |

**Fix**: Implement actual DB queries to check for overdue invoices and shipments needing tracking.

---

## 5. Missing Cross-Module Connections

### 5a. Sales -> Finance
No automatic invoice/AR generation when an order ships or is delivered. The chain of Sales Order -> Customer Invoice -> Payment Tracking doesn't exist.

### 5b. Production -> Inventory
Work order completion (`routers.ts:6844`) updates the work order status but:
- Doesn't deduct raw materials from inventory based on BOM consumption
- Doesn't add finished goods to inventory

### 5c. Procurement -> Inventory (PO Receipt)
When a PO is marked `received` (`routers.ts:1730`), there's no automatic inventory receipt. The notification fires but inventory quantities aren't updated.

### 5d. Vendor Quote Award -> PO Creation
When a vendor quote is approved in the RFQ workflow (`workflowProcessors.ts:2528-2553`), the RFQ is marked `awarded` and the quote `accepted`, but no purchase order is created. The procurement chain stops.

### 5e. Shopify Sync -> Workflow Trigger
Shopify orders are synced (`routers.ts:8284`) but don't emit `order_confirmed` events, so the Order Fulfillment workflow never triggers for Shopify-sourced orders.

---

## 6. Approval Coverage Assessment

### Approvals That Exist and Work

| Process | Auto-Approve Threshold | Levels | File Reference |
|---|---|---|---|
| Purchase Orders | <= $500 (default) | 4 levels (ops -> admin -> exec) | `autonomousWorkflowEngine.ts:431-477` |
| Material Requirements / Suggested POs | <= $1,000 | Multi-level | `supplyChainOrchestrator.ts:617-619` |
| Payments | <= $2,000 | Multi-level | `supplyChainOrchestrator.ts:698-700` |
| Inventory Reorders | <= $500 | Multi-level | `supplyChainOrchestrator.ts:634-635` |
| Vendor Quotes | Configurable | Multi-level | `workflowProcessors.ts:2524` |

### Approvals That Are Missing

| Process | Risk | Recommendation |
|---|---|---|
| **Inventory Adjustments / Write-offs** | Any user can adjust quantities with no gate | Add approval for adjustments > threshold |
| **Credit Notes / Refunds** | No approval for issuing credits | Add approval workflow |
| **Vendor Master Data Changes** | Adding/editing vendors uncontrolled | Require approval for new vendors and payment term changes |
| **Product Price Changes** | Pricing updates go through unrestricted | Add approval for price changes > X% |
| **Work Order Cancellations/Overrides** | No gate on production changes | Add approval for cancellation or significant quantity changes |
| **AI Exception Auto-Resolution** | AI resolves at confidence > 75% with no review | Add human confirmation for high-value AI-resolved exceptions |

---

## 7. Recommended Fix Priority

### P0 — Blocks core automation
1. **Wire `emitEvent()` into routers** for order confirmation, PO receipt, invoice creation, work order completion, Shopify sync
2. **Implement post-approval workflow resumption** so approved items actually execute
3. **Connect `sendEmail()` calls** at the three TODO sites

### P1 — Completes automation loops
4. **Implement placeholder scheduler conditions** (payment reminders, shipment tracking)
5. **Add inventory transactions** on PO receipt and work order completion
6. **Create PO from awarded vendor quote**
7. **Auto-generate customer invoices** from shipped/delivered orders

### P2 — Adds missing approval gates
8. **Add approval workflows** for inventory adjustments, vendor master changes, refunds/credits, and price changes
9. **Add human review checkpoint** for high-value AI-resolved exceptions

### P3 — Infrastructure improvements
10. Replace DB polling with message broker (Redis Pub/Sub or similar) for real-time event processing
11. Add dead-letter queue for failed automations
12. Implement webhook receivers for Shopify order updates and shipment tracking callbacks
