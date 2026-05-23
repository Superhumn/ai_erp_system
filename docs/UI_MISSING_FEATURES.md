# Missing UI Features — curated punch list

Distilled from `docs/UI_INVENTORY.md` by `scripts/curate-missing-features.mjs`.

## What this is

For every page in `client/src/pages/`, this lists tRPC mutations that exist on the server, fall under the page's primary domain, and aren't currently called from the page. Each missing mutation is bucketed:

- **HIGH** — bare CRUD verbs on the page's primary entity (`create`, `update`, `delete`, `add`, `remove`, `edit`). If you can list/view it, you usually should be able to write/edit/delete it.
- **MED** — lifecycle / state-transition verbs (approve, archive, cancel, send, publish, assign, share, export, merge, duplicate, restore, …). Often real gaps but sometimes correctly absent.
- **LOW** — bulk/sync/upsert helpers and internals. Suppressed from this report; check `docs/UI_INVENTORY.md` if you want the full list.

## What was filtered out

Pages skipped as read-only by design (public views, generators, aggregate dashboards, navigation hubs): **24**. Examined: **95**. With HIGH-priority gaps: **63**. With MED-priority gaps: **36**.

## Caveats (do read these)

- A mutation listed here may already be reachable via a sibling page (e.g. `customers.update` lives on `CustomerDetail.tsx`, not `Customers.tsx`). Cross-reference before opening a ticket.
- A mutation marked HIGH may be intentionally absent for permission reasons (e.g. employees shouldn't self-delete).
- The button label suggestions are mechanical: "Verb Noun" derived from the mutation path. Tighten before shipping.

## Top 30 pages by HIGH-priority gap count

| # | Page | Section | HIGH | MED |
|---|------|---------|------|-----|
| 1 | `client/src/pages/DataRooms.tsx` | Not in sidebar | 25 | 7 |
| 2 | `client/src/pages/Messaging.tsx` | Command Center | 21 | 4 |
| 3 | `client/src/pages/DataRoomDetail.tsx` | Not in sidebar | 13 | 4 |
| 4 | `client/src/pages/hr/EquityPortal.tsx` | People | 13 | 3 |
| 5 | `client/src/pages/hr/Employees.tsx` | People | 12 | 1 |
| 6 | `client/src/pages/edi/EDITransactions.tsx` | Tools | 11 | 2 |
| 7 | `client/src/pages/hr/InvestorPortalAdmin.tsx` | Not routed | 11 | 1 |
| 8 | `client/src/pages/edi/TradingPartners.tsx` | Tools | 9 | 5 |
| 9 | `client/src/pages/edi/RetailerOnboarding.tsx` | Tools | 8 | 5 |
| 10 | `client/src/pages/operations/Procurement.tsx` | Operations | 8 | 2 |
| 11 | `client/src/pages/operations/CoreOperations.tsx` | Operations | 7 | 3 |
| 12 | `client/src/pages/freight/FreightTracking.tsx` | Not in sidebar | 7 | 1 |
| 13 | `client/src/pages/grants/GrantBidSubmitter.tsx` | Finance | 7 | 1 |
| 14 | `client/src/pages/Projects.tsx` | Not routed | 7 | 0 |
| 15 | `client/src/pages/ai/ApprovalQueue.tsx` | Not in sidebar | 6 | 4 |
| 16 | `client/src/pages/portal/CopackerPortal.tsx` | Not in sidebar | 6 | 3 |
| 17 | `client/src/pages/freight/RFQs.tsx` | Not in sidebar | 6 | 2 |
| 18 | `client/src/pages/freight/Carriers.tsx` | Not in sidebar | 5 | 2 |
| 19 | `client/src/pages/operations/POReceiving.tsx` | Operations | 5 | 2 |
| 20 | `client/src/pages/freight/RFQDetail.tsx` | Not in sidebar | 5 | 1 |
| 21 | `client/src/pages/autonomous/Exceptions.tsx` | Not in sidebar | 4 | 5 |
| 22 | `client/src/pages/autonomous/Approvals.tsx` | Not in sidebar | 4 | 3 |
| 23 | `client/src/pages/projects/Projects.tsx` | Command Center | 4 | 0 |
| 24 | `client/src/pages/operations/BOM.tsx` | Operations | 4 | 0 |
| 25 | `client/src/pages/operations/WorkOrderDetail.tsx` | Operations | 4 | 0 |
| 26 | `client/src/pages/sales/Orders.tsx` | Sales | 4 | 0 |
| 27 | `client/src/pages/autonomous/Settings.tsx` | Not in sidebar | 3 | 5 |
| 28 | `client/src/pages/operations/EmailInbox.tsx` | Command Center | 3 | 4 |
| 29 | `client/src/pages/freight/CustomsClearance.tsx` | Not in sidebar | 3 | 0 |
| 30 | `client/src/pages/operations/Vendors.tsx` | Operations | 3 | 0 |

## Command Center

### `client/src/pages/Messaging.tsx`
- **Route(s)**: `/messaging`
- **Primary domain(s)**: `crm`
- **HIGH (21)** — likely missing CRUD buttons:
  - `crm.campaigns.create` → suggested button: **Create campaigns**
  - `crm.campaigns.update` → suggested button: **Update campaigns**
  - `crm.contacts.create` → suggested button: **Create contacts**
  - `crm.contacts.delete` → suggested button: **Delete contacts**
  - `crm.contacts.deletePlaceholders` → suggested button: **Delete Placeholders contacts**
  - `crm.contacts.update` → suggested button: **Update contacts**
  - `crm.createCampaign` → suggested button: **Create Campaign crm**
  - `crm.createInvestor` → suggested button: **Create Investor crm**
  - `crm.deals.create` → suggested button: **Create deals**
  - `crm.deals.delete` → suggested button: **Delete deals**
  - `crm.deals.update` → suggested button: **Update deals**
  - `crm.interactions.addNote` → suggested button: **Add Note interactions**
  - `crm.interactions.create` → suggested button: **Create interactions**
  - `crm.pipelines.create` → suggested button: **Create pipelines**
  - `crm.pipelines.update` → suggested button: **Update pipelines**
  - `crm.tags.addToContact` → suggested button: **Add To Contact tags**
  - `crm.tags.create` → suggested button: **Create tags**
  - `crm.tags.delete` → suggested button: **Delete tags**
  - `crm.tags.removeFromContact` → suggested button: **Remove From Contact tags**
  - `crm.updateCampaign` → suggested button: **Update Campaign crm**
  - `crm.whatsapp.updateStatus` → suggested button: **Update Status whatsapp**
- **MED (4)** — likely missing lifecycle actions:
  - `crm.captures.processCapture` → suggested button: **Process Capture captures**
  - `crm.contacts.autoMergeDuplicates` → suggested button: **Auto Merge Duplicates contacts**
  - `crm.contacts.merge` → suggested button: **Merge contacts**
  - `crm.deals.moveStage` → suggested button: **Move Stage deals**

### `client/src/pages/operations/EmailInbox.tsx`
- **Route(s)**: `/operations/email-inbox`
- **Primary domain(s)**: `emailScanning`, `emailSequences`, `emailCannedResponses`
- **HIGH (3)** — likely missing CRUD buttons:
  - `emailScanning.createAutoReplyRule` → suggested button: **Create Auto Reply Rule email Scanning**
  - `emailScanning.deleteAutoReplyRule` → suggested button: **Delete Auto Reply Rule email Scanning**
  - `emailScanning.updateAutoReplyRule` → suggested button: **Update Auto Reply Rule email Scanning**
- **MED (4)** — likely missing lifecycle actions:
  - `emailScanning.approveDocument` → suggested button: **Approve Document email Scanning**
  - `emailScanning.processAttachments` → suggested button: **Process Attachments email Scanning**
  - `emailScanning.rejectDocument` → suggested button: **Reject Document email Scanning**
  - `emailScanning.submitEmail` → suggested button: **Submit Email email Scanning**

### `client/src/pages/projects/Projects.tsx`
- **Route(s)**: `/projects`
- **Primary domain(s)**: `projects`
- **HIGH (4)** — likely missing CRUD buttons:
  - `projects.addMilestone` → suggested button: **Add Milestone projects**
  - `projects.deleteTask` → suggested button: **Delete Task projects**
  - `projects.deleteTasks` → suggested button: **Delete Tasks projects**
  - `projects.updateMilestone` → suggested button: **Update Milestone projects**

### `client/src/pages/projects/InvestmentGrantChecklist.tsx`
- **Route(s)**: `/projects/investment-grants`
- **Primary domain(s)**: `investmentGrants`
- **HIGH (2)** — likely missing CRUD buttons:
  - `investmentGrants.addItem` → suggested button: **Add Item investment Grants**
  - `investmentGrants.update` → suggested button: **Update investment Grants**

### `client/src/pages/Meetings.tsx`
- **Route(s)**: `/meetings`
- **Primary domain(s)**: `fireflies`
- **MED (1)** — likely missing lifecycle actions:
  - `fireflies.processAllPending` → suggested button: **Process All Pending fireflies**

## Sales

### `client/src/pages/sales/Orders.tsx`
- **Route(s)**: `/sales/orders`
- **Primary domain(s)**: `orders`, `customers`
- **HIGH (4)** — likely missing CRUD buttons:
  - `customers.delete` → suggested button: **Delete customers**
  - `customers.update` → suggested button: **Update customers**
  - `orders.delete` → suggested button: **Delete orders**
  - `orders.update` → suggested button: **Update orders**

### `client/src/pages/sales/OrderDetail.tsx`
- **Route(s)**: `/sales/orders/:id`
- **Primary domain(s)**: `orders`
- **HIGH (2)** — likely missing CRUD buttons:
  - `orders.create` → suggested button: **Create orders**
  - `orders.delete` → suggested button: **Delete orders**

## Finance

### `client/src/pages/grants/GrantBidSubmitter.tsx`
- **Route(s)**: `/grants/submitter`
- **Primary domain(s)**: `grantBid`
- **HIGH (7)** — likely missing CRUD buttons:
  - `grantBid.applications.delete` → suggested button: **Delete applications**
  - `grantBid.documents.create` → suggested button: **Create documents**
  - `grantBid.opportunities.delete` → suggested button: **Delete opportunities**
  - `grantBid.opportunities.update` → suggested button: **Update opportunities**
  - `grantBid.templates.create` → suggested button: **Create templates**
  - `grantBid.templates.delete` → suggested button: **Delete templates**
  - `grantBid.templates.update` → suggested button: **Update templates**
- **MED (1)** — likely missing lifecycle actions:
  - `grantBid.webForm.regenerateScript` → suggested button: **Regenerate Script web Form**

### `client/src/pages/finance/Invoices.tsx`
- **Route(s)**: `/finance/invoices`
- **Primary domain(s)**: `invoices`, `recurringInvoices`
- **HIGH (2)** — likely missing CRUD buttons:
  - `invoices.update` → suggested button: **Update invoices**
  - `recurringInvoices.update` → suggested button: **Update recurring Invoices**
- **MED (1)** — likely missing lifecycle actions:
  - `invoices.approve` → suggested button: **Approve invoices**

### `client/src/pages/finance/Payments.tsx`
- **Route(s)**: `/finance/payments`
- **Primary domain(s)**: `payments`
- **HIGH (2)** — likely missing CRUD buttons:
  - `payments.createFromText` → suggested button: **Create From Text payments**
  - `payments.update` → suggested button: **Update payments**

### `client/src/pages/finance/RdTaxCredit.tsx`
- **Route(s)**: `/finance/rd-tax-credit`
- **Primary domain(s)**: `rdTaxCredit`
- **HIGH (1)** — likely missing CRUD buttons:
  - `rdTaxCredit.updateExpense` → suggested button: **Update Expense rd Tax Credit**
- **MED (1)** — likely missing lifecycle actions:
  - `rdTaxCredit.importFromQuickBooks` → suggested button: **Import From Quick Books rd Tax Credit**

### `client/src/pages/finance/Accounts.tsx`
- **Route(s)**: `/finance/accounts`
- **Primary domain(s)**: `accounts`
- **HIGH (1)** — likely missing CRUD buttons:
  - `accounts.update` → suggested button: **Update accounts**

## Operations

### `client/src/pages/operations/CoreOperations.tsx`
- **Route(s)**: `/operations/core`
- **Primary domain(s)**: `alerts`, `salesOrders`, `workOrders`
- **HIGH (7)** — likely missing CRUD buttons:
  - `alerts.create` → suggested button: **Create alerts**
  - `salesOrders.create` → suggested button: **Create sales Orders**
  - `salesOrders.updateStatus` → suggested button: **Update Status sales Orders**
  - `workOrders.create` → suggested button: **Create work Orders**
  - `workOrders.createFromText` → suggested button: **Create From Text work Orders**
  - `workOrders.delete` → suggested button: **Delete work Orders**
  - `workOrders.update` → suggested button: **Update work Orders**
- **MED (3)** — likely missing lifecycle actions:
  - `alerts.generateLowStockAlerts` → suggested button: **Generate Low Stock Alerts alerts**
  - `workOrders.completeProduction` → suggested button: **Complete Production work Orders**
  - `workOrders.startProduction` → suggested button: **Start Production work Orders**

### `client/src/pages/operations/Procurement.tsx`
- **Route(s)**: `/operations/procurement`
- **Primary domain(s)**: `purchaseOrders`, `vendors`, `rawMaterials`
- **HIGH (8)** — likely missing CRUD buttons:
  - `purchaseOrders.createFromText` → suggested button: **Create From Text purchase Orders**
  - `purchaseOrders.createFromTextV2` → suggested button: **Create From Text V2 purchase Orders**
  - `purchaseOrders.delete` → suggested button: **Delete purchase Orders**
  - `purchaseOrders.update` → suggested button: **Update purchase Orders**
  - `rawMaterials.delete` → suggested button: **Delete raw Materials**
  - `rawMaterials.update` → suggested button: **Update raw Materials**
  - `vendors.delete` → suggested button: **Delete vendors**
  - `vendors.update` → suggested button: **Update vendors**
- **MED (2)** — likely missing lifecycle actions:
  - `purchaseOrders.approve` → suggested button: **Approve purchase Orders**
  - `purchaseOrders.sendToSupplier` → suggested button: **Send To Supplier purchase Orders**

### `client/src/pages/operations/POReceiving.tsx`
- **Route(s)**: `/operations/receiving`
- **Primary domain(s)**: `purchaseOrders`
- **HIGH (5)** — likely missing CRUD buttons:
  - `purchaseOrders.create` → suggested button: **Create purchase Orders**
  - `purchaseOrders.createFromText` → suggested button: **Create From Text purchase Orders**
  - `purchaseOrders.createFromTextV2` → suggested button: **Create From Text V2 purchase Orders**
  - `purchaseOrders.delete` → suggested button: **Delete purchase Orders**
  - `purchaseOrders.update` → suggested button: **Update purchase Orders**
- **MED (2)** — likely missing lifecycle actions:
  - `purchaseOrders.approve` → suggested button: **Approve purchase Orders**
  - `purchaseOrders.sendToSupplier` → suggested button: **Send To Supplier purchase Orders**

### `client/src/pages/operations/BOM.tsx`
- **Route(s)**: `/operations/bom`
- **Primary domain(s)**: `bom`
- **HIGH (4)** — likely missing CRUD buttons:
  - `bom.addComponent` → suggested button: **Add Component bom**
  - `bom.deleteComponent` → suggested button: **Delete Component bom**
  - `bom.update` → suggested button: **Update bom**
  - `bom.updateComponent` → suggested button: **Update Component bom**

### `client/src/pages/operations/PurchaseOrders.tsx`
- **Route(s)**: `/operations/purchase-orders`
- **Primary domain(s)**: `purchaseOrders`
- **HIGH (2)** — likely missing CRUD buttons:
  - `purchaseOrders.createFromTextV2` → suggested button: **Create From Text V2 purchase Orders**
  - `purchaseOrders.update` → suggested button: **Update purchase Orders**
- **MED (2)** — likely missing lifecycle actions:
  - `purchaseOrders.approve` → suggested button: **Approve purchase Orders**
  - `purchaseOrders.sendToSupplier` → suggested button: **Send To Supplier purchase Orders**

### `client/src/pages/operations/WorkOrderDetail.tsx`
- **Route(s)**: `/operations/work-orders/:id`
- **Primary domain(s)**: `workOrders`
- **HIGH (4)** — likely missing CRUD buttons:
  - `workOrders.create` → suggested button: **Create work Orders**
  - `workOrders.createFromText` → suggested button: **Create From Text work Orders**
  - `workOrders.delete` → suggested button: **Delete work Orders**
  - `workOrders.update` → suggested button: **Update work Orders**

### `client/src/pages/operations/Transfers.tsx`
- **Route(s)**: `/operations/transfers`
- **Primary domain(s)**: `transfers`
- **HIGH (1)** — likely missing CRUD buttons:
  - `transfers.addItem` → suggested button: **Add Item transfers**
- **MED (2)** — likely missing lifecycle actions:
  - `transfers.cancel` → suggested button: **Cancel transfers**
  - `transfers.ship` → suggested button: **Ship transfers**

### `client/src/pages/operations/Vendors.tsx`
- **Route(s)**: `/operations/vendors`
- **Primary domain(s)**: `vendors`, `rawMaterials`
- **HIGH (3)** — likely missing CRUD buttons:
  - `rawMaterials.delete` → suggested button: **Delete raw Materials**
  - `rawMaterials.update` → suggested button: **Update raw Materials**
  - `vendors.update` → suggested button: **Update vendors**

### `client/src/pages/operations/WorkOrders.tsx`
- **Route(s)**: `/operations/work-orders`
- **Primary domain(s)**: `workOrders`
- **HIGH (2)** — likely missing CRUD buttons:
  - `workOrders.createFromText` → suggested button: **Create From Text work Orders**
  - `workOrders.update` → suggested button: **Update work Orders**
- **MED (1)** — likely missing lifecycle actions:
  - `workOrders.completeProduction` → suggested button: **Complete Production work Orders**

### `client/src/pages/operations/BOMDetail.tsx`
- **Route(s)**: `/operations/bom/:id`
- **Primary domain(s)**: `bom`
- **HIGH (2)** — likely missing CRUD buttons:
  - `bom.create` → suggested button: **Create bom**
  - `bom.delete` → suggested button: **Delete bom**

### `client/src/pages/operations/Inventory.tsx`
- **Route(s)**: `/operations/inventory`
- **Primary domain(s)**: `inventory`
- **HIGH (2)** — likely missing CRUD buttons:
  - `inventory.create` → suggested button: **Create inventory**
  - `inventory.update` → suggested button: **Update inventory**

### `client/src/pages/operations/InventoryCosting.tsx`
- **Route(s)**: `/operations/inventory-costing`
- **Primary domain(s)**: `inventoryCosting`
- **HIGH (1)** — likely missing CRUD buttons:
  - `inventoryCosting.configs.update` → suggested button: **Update configs**
- **MED (1)** — likely missing lifecycle actions:
  - `inventoryCosting.cogs.generateSummary` → suggested button: **Generate Summary cogs**

### `client/src/pages/operations/ProductDetail.tsx`
- **Route(s)**: `/operations/products/:id`
- **Primary domain(s)**: `products`
- **HIGH (2)** — likely missing CRUD buttons:
  - `products.create` → suggested button: **Create products**
  - `products.delete` → suggested button: **Delete products**

### `client/src/pages/operations/Shipments.tsx`
- **Route(s)**: `/operations/shipments`
- **Primary domain(s)**: `shipments`
- **HIGH (2)** — likely missing CRUD buttons:
  - `shipments.createFromText` → suggested button: **Create From Text shipments**
  - `shipments.update` → suggested button: **Update shipments**

### `client/src/pages/operations/TransferDetail.tsx`
- **Route(s)**: `/operations/transfers/:id`
- **Primary domain(s)**: `transfers`
- **HIGH (2)** — likely missing CRUD buttons:
  - `transfers.create` → suggested button: **Create transfers**
  - `transfers.delete` → suggested button: **Delete transfers**

### `client/src/pages/operations/VendorNegotiations.tsx`
- **Route(s)**: `/operations/vendor-negotiations`
- **Primary domain(s)**: `vendorNegotiations`
- **HIGH (1)** — likely missing CRUD buttons:
  - `vendorNegotiations.update` → suggested button: **Update vendor Negotiations**
- **MED (1)** — likely missing lifecycle actions:
  - `vendorNegotiations.generateDraft` → suggested button: **Generate Draft vendor Negotiations**

### `client/src/pages/operations/Products.tsx`
- **Route(s)**: `/operations/products`
- **Primary domain(s)**: `products`
- **HIGH (1)** — likely missing CRUD buttons:
  - `products.update` → suggested button: **Update products**

## People

### `client/src/pages/hr/EquityPortal.tsx`
- **Route(s)**: `/hr/equity-portal`
- **Primary domain(s)**: `capTable`, `exerciseRequests`
- **HIGH (13)** — likely missing CRUD buttons:
  - `capTable.grants.create` → suggested button: **Create grants**
  - `capTable.grants.update` → suggested button: **Update grants**
  - `capTable.shareClasses.create` → suggested button: **Create share Classes**
  - `capTable.shareClasses.delete` → suggested button: **Delete share Classes**
  - `capTable.shareClasses.update` → suggested button: **Update share Classes**
  - `capTable.stakeholders.create` → suggested button: **Create stakeholders**
  - `capTable.stakeholders.delete` → suggested button: **Delete stakeholders**
  - `capTable.stakeholders.deletePlaceholders` → suggested button: **Delete Placeholders stakeholders**
  - `capTable.stakeholders.documents.delete` → suggested button: **Delete documents**
  - `capTable.stakeholders.update` → suggested button: **Update stakeholders**
  - `capTable.transactions.create` → suggested button: **Create transactions**
  - `capTable.valuations.create` → suggested button: **Create valuations**
  - `capTable.valuations.update` → suggested button: **Update valuations**
- **MED (3)** — likely missing lifecycle actions:
  - `capTable.generateReport` → suggested button: **Generate Report cap Table**
  - `exerciseRequests.approve` → suggested button: **Approve exercise Requests**
  - `exerciseRequests.cancel` → suggested button: **Cancel exercise Requests**

### `client/src/pages/hr/Employees.tsx`
- **Route(s)**: `/hr/employees`
- **Primary domain(s)**: `capTable`, `employees`
- **HIGH (12)** — likely missing CRUD buttons:
  - `capTable.grants.update` → suggested button: **Update grants**
  - `capTable.shareClasses.delete` → suggested button: **Delete share Classes**
  - `capTable.shareClasses.update` → suggested button: **Update share Classes**
  - `capTable.stakeholders.delete` → suggested button: **Delete stakeholders**
  - `capTable.stakeholders.deletePlaceholders` → suggested button: **Delete Placeholders stakeholders**
  - `capTable.stakeholders.documents.delete` → suggested button: **Delete documents**
  - `capTable.stakeholders.update` → suggested button: **Update stakeholders**
  - `capTable.transactions.create` → suggested button: **Create transactions**
  - `capTable.valuations.create` → suggested button: **Create valuations**
  - `capTable.valuations.update` → suggested button: **Update valuations**
  - `employees.addCompensation` → suggested button: **Add Compensation employees**
  - `employees.update` → suggested button: **Update employees**
- **MED (1)** — likely missing lifecycle actions:
  - `capTable.generateReport` → suggested button: **Generate Report cap Table**

### `client/src/pages/legal/Contracts.tsx`
- **Route(s)**: `/legal/contracts`
- **Primary domain(s)**: `contracts`
- **HIGH (2)** — likely missing CRUD buttons:
  - `contracts.addKeyDate` → suggested button: **Add Key Date contracts**
  - `contracts.update` → suggested button: **Update contracts**
- **MED (1)** — likely missing lifecycle actions:
  - `contracts.approve` → suggested button: **Approve contracts**

### `client/src/pages/hr/EmployeePortal.tsx`
- **Route(s)**: `/hr/me`
- **Primary domain(s)**: `employeePortal`
- **HIGH (2)** — likely missing CRUD buttons:
  - `employeePortal.createOnboardingTask` → suggested button: **Create Onboarding Task employee Portal**
  - `employeePortal.updateEmergencyContact` → suggested button: **Update Emergency Contact employee Portal**

### `client/src/pages/hr/TimeTracking.tsx`
- **Route(s)**: `/hr/time-tracking`
- **Primary domain(s)**: `timeTracking`
- **HIGH (1)** — likely missing CRUD buttons:
  - `timeTracking.entries.update` → suggested button: **Update entries**
- **MED (1)** — likely missing lifecycle actions:
  - `timeTracking.entries.approve` → suggested button: **Approve entries**

### `client/src/pages/legal/CaseTracker.tsx`
- **Route(s)**: `/legal/cases`
- **Primary domain(s)**: `legalCases`
- **HIGH (1)** — likely missing CRUD buttons:
  - `legalCases.update` → suggested button: **Update legal Cases**

### `client/src/pages/legal/Disputes.tsx`
- **Route(s)**: `/legal/disputes`
- **Primary domain(s)**: `disputes`
- **HIGH (1)** — likely missing CRUD buttons:
  - `disputes.update` → suggested button: **Update disputes**

## Tools

### `client/src/pages/edi/TradingPartners.tsx`
- **Route(s)**: `/edi/partners`
- **Primary domain(s)**: `edi`
- **HIGH (9)** — likely missing CRUD buttons:
  - `edi.compliance.create` → suggested button: **Create compliance**
  - `edi.crosswalks.create` → suggested button: **Create crosswalks**
  - `edi.crosswalks.delete` → suggested button: **Delete crosswalks**
  - `edi.crosswalks.update` → suggested button: **Update crosswalks**
  - `edi.documentMaps.create` → suggested button: **Create document Maps**
  - `edi.documentMaps.update` → suggested button: **Update document Maps**
  - `edi.partners.delete` → suggested button: **Delete partners**
  - `edi.shipToLocations.create` → suggested button: **Create ship To Locations**
  - `edi.shipToLocations.update` → suggested button: **Update ship To Locations**
- **MED (5)** — likely missing lifecycle actions:
  - `edi.transactions.convertToOrder` → suggested button: **Convert To Order transactions**
  - `edi.transactions.generateOutbound` → suggested button: **Generate Outbound transactions**
  - `edi.transactions.processInbound` → suggested button: **Process Inbound transactions**
  - `edi.transactions.reprocess` → suggested button: **Reprocess transactions**
  - `edi.transport.deliverOutbound` → suggested button: **Deliver Outbound transport**

### `client/src/pages/edi/EDITransactions.tsx`
- **Route(s)**: `/edi/transactions`
- **Primary domain(s)**: `edi`
- **HIGH (11)** — likely missing CRUD buttons:
  - `edi.compliance.create` → suggested button: **Create compliance**
  - `edi.crosswalks.create` → suggested button: **Create crosswalks**
  - `edi.crosswalks.delete` → suggested button: **Delete crosswalks**
  - `edi.crosswalks.update` → suggested button: **Update crosswalks**
  - `edi.documentMaps.create` → suggested button: **Create document Maps**
  - `edi.documentMaps.update` → suggested button: **Update document Maps**
  - `edi.partners.create` → suggested button: **Create partners**
  - `edi.partners.delete` → suggested button: **Delete partners**
  - `edi.partners.update` → suggested button: **Update partners**
  - `edi.shipToLocations.create` → suggested button: **Create ship To Locations**
  - `edi.shipToLocations.update` → suggested button: **Update ship To Locations**
- **MED (2)** — likely missing lifecycle actions:
  - `edi.transactions.generateOutbound` → suggested button: **Generate Outbound transactions**
  - `edi.transport.deliverOutbound` → suggested button: **Deliver Outbound transport**

### `client/src/pages/edi/RetailerOnboarding.tsx`
- **Route(s)**: `/edi/connect`
- **Primary domain(s)**: `edi`
- **HIGH (8)** — likely missing CRUD buttons:
  - `edi.compliance.create` → suggested button: **Create compliance**
  - `edi.crosswalks.delete` → suggested button: **Delete crosswalks**
  - `edi.crosswalks.update` → suggested button: **Update crosswalks**
  - `edi.documentMaps.create` → suggested button: **Create document Maps**
  - `edi.documentMaps.update` → suggested button: **Update document Maps**
  - `edi.partners.delete` → suggested button: **Delete partners**
  - `edi.shipToLocations.create` → suggested button: **Create ship To Locations**
  - `edi.shipToLocations.update` → suggested button: **Update ship To Locations**
- **MED (5)** — likely missing lifecycle actions:
  - `edi.transactions.convertToOrder` → suggested button: **Convert To Order transactions**
  - `edi.transactions.generateOutbound` → suggested button: **Generate Outbound transactions**
  - `edi.transactions.processInbound` → suggested button: **Process Inbound transactions**
  - `edi.transactions.reprocess` → suggested button: **Reprocess transactions**
  - `edi.transport.deliverOutbound` → suggested button: **Deliver Outbound transport**

### `client/src/pages/settings/TransactionalEmails.tsx`
- **Route(s)**: `/settings/emails`
- **Primary domain(s)**: `transactionalEmail`
- **MED (5)** — likely missing lifecycle actions:
  - `transactionalEmail.sendAlertEmail` → suggested button: **Send Alert Email transactional Email**
  - `transactionalEmail.sendPOEmail` → suggested button: **Send P O Email transactional Email**
  - `transactionalEmail.sendQuoteEmail` → suggested button: **Send Quote Email transactional Email**
  - `transactionalEmail.sendRFQEmail` → suggested button: **Send R F Q Email transactional Email**
  - `transactionalEmail.sendShipmentEmail` → suggested button: **Send Shipment Email transactional Email**

### `client/src/pages/Settings.tsx`
- **Route(s)**: `/settings`
- **Primary domain(s)**: `users`
- **HIGH (2)** — likely missing CRUD buttons:
  - `users.delete` → suggested button: **Delete users**
  - `users.updateRole` → suggested button: **Update Role users**

### `client/src/pages/settings/Integrations.tsx`
- **Route(s)**: `/settings/integrations`
- **Primary domain(s)**: `integrations`
- **HIGH (2)** — likely missing CRUD buttons:
  - `integrations.create` → suggested button: **Create integrations**
  - `integrations.update` → suggested button: **Update integrations**

### `client/src/pages/settings/ShopifySettings.tsx`
- **Route(s)**: `/settings/shopify`
- **Primary domain(s)**: `shopify`
- **HIGH (2)** — likely missing CRUD buttons:
  - `shopify.locationMappings.create` → suggested button: **Create location Mappings**
  - `shopify.stores.create` → suggested button: **Create stores**

### `client/src/pages/settings/Fireflies.tsx`
- **Route(s)**: `/settings/fireflies`
- **Primary domain(s)**: `fireflies`
- **MED (1)** — likely missing lifecycle actions:
  - `fireflies.processMeeting` → suggested button: **Process Meeting fireflies**

### `client/src/pages/settings/Notifications.tsx`
- **Route(s)**: `/settings/notifications`
- **Primary domain(s)**: `notifications`
- **HIGH (1)** — likely missing CRUD buttons:
  - `notifications.delete` → suggested button: **Delete notifications**

## Not in sidebar

### `client/src/pages/DataRooms.tsx`
- **Route(s)**: `/datarooms`
- **Primary domain(s)**: `dataRoom`
- **HIGH (25)** — likely missing CRUD buttons:
  - `dataRoom.documents.create` → suggested button: **Create documents**
  - `dataRoom.documents.delete` → suggested button: **Delete documents**
  - `dataRoom.documents.update` → suggested button: **Update documents**
  - `dataRoom.driveSync.deleteConfig` → suggested button: **Delete Config drive Sync**
  - `dataRoom.dueDiligence.addItem` → suggested button: **Add Item due Diligence**
  - `dataRoom.dueDiligence.createFromTemplate` → suggested button: **Create From Template due Diligence**
  - `dataRoom.dueDiligence.createStandard` → suggested button: **Create Standard due Diligence**
  - `dataRoom.dueDiligence.delete` → suggested button: **Delete due Diligence**
  - `dataRoom.dueDiligence.deleteItem` → suggested button: **Delete Item due Diligence**
  - `dataRoom.dueDiligence.updateItem` → suggested button: **Update Item due Diligence**
  - `dataRoom.emailRules.create` → suggested button: **Create email Rules**
  - `dataRoom.emailRules.delete` → suggested button: **Delete email Rules**
  - `dataRoom.emailRules.update` → suggested button: **Update email Rules**
  - `dataRoom.folders.create` → suggested button: **Create folders**
  - `dataRoom.folders.delete` → suggested button: **Delete folders**
  - `dataRoom.folders.update` → suggested button: **Update folders**
  - `dataRoom.invitations.create` → suggested button: **Create invitations**
  - `dataRoom.invitations.updatePermissions` → suggested button: **Update Permissions invitations**
  - `dataRoom.links.create` → suggested button: **Create links**
  - `dataRoom.links.delete` → suggested button: **Delete links**
  - `dataRoom.links.update` → suggested button: **Update links**
  - `dataRoom.pageTracking.updatePageView` → suggested button: **Update Page View page Tracking**
  - `dataRoom.sessions.updateActivity` → suggested button: **Update Activity sessions**
  - `dataRoom.update` → suggested button: **Update data Room**
  - `dataRoom.updateCommitmentStatus` → suggested button: **Update Commitment Status data Room**
- **MED (7)** — likely missing lifecycle actions:
  - `dataRoom.detailedAnalytics.exportCsv` → suggested button: **Export Csv detailed Analytics**
  - `dataRoom.invitations.resend` → suggested button: **Resend invitations**
  - `dataRoom.invitations.revoke` → suggested button: **Revoke invitations**
  - `dataRoom.sessions.start` → suggested button: **Start sessions**
  - `dataRoom.submitInvestment` → suggested button: **Submit Investment data Room**
  - `dataRoom.visitors.restore` → suggested button: **Restore visitors**
  - `dataRoom.visitors.revoke` → suggested button: **Revoke visitors**

### `client/src/pages/DataRoomDetail.tsx`
- **Route(s)**: `/dataroom/:id`
- **Primary domain(s)**: `dataRoom`
- **HIGH (13)** — likely missing CRUD buttons:
  - `dataRoom.create` → suggested button: **Create data Room**
  - `dataRoom.delete` → suggested button: **Delete data Room**
  - `dataRoom.documents.create` → suggested button: **Create documents**
  - `dataRoom.documents.update` → suggested button: **Update documents**
  - `dataRoom.dueDiligence.addItem` → suggested button: **Add Item due Diligence**
  - `dataRoom.dueDiligence.createFromTemplate` → suggested button: **Create From Template due Diligence**
  - `dataRoom.dueDiligence.delete` → suggested button: **Delete due Diligence**
  - `dataRoom.dueDiligence.deleteItem` → suggested button: **Delete Item due Diligence**
  - `dataRoom.folders.update` → suggested button: **Update folders**
  - `dataRoom.invitations.updatePermissions` → suggested button: **Update Permissions invitations**
  - `dataRoom.links.update` → suggested button: **Update links**
  - `dataRoom.pageTracking.updatePageView` → suggested button: **Update Page View page Tracking**
  - `dataRoom.sessions.updateActivity` → suggested button: **Update Activity sessions**
- **MED (4)** — likely missing lifecycle actions:
  - `dataRoom.invitations.resend` → suggested button: **Resend invitations**
  - `dataRoom.invitations.revoke` → suggested button: **Revoke invitations**
  - `dataRoom.sessions.start` → suggested button: **Start sessions**
  - `dataRoom.submitInvestment` → suggested button: **Submit Investment data Room**

### `client/src/pages/ai/ApprovalQueue.tsx`
- **Route(s)**: `/ai/approvals`
- **Primary domain(s)**: `aiAgent`
- **HIGH (6)** — likely missing CRUD buttons:
  - `aiAgent.createEmailReplyTask` → suggested button: **Create Email Reply Task ai Agent**
  - `aiAgent.emailTemplates.create` → suggested button: **Create email Templates**
  - `aiAgent.emailTemplates.update` → suggested button: **Update email Templates**
  - `aiAgent.rules.create` → suggested button: **Create rules**
  - `aiAgent.rules.update` → suggested button: **Update rules**
  - `aiAgent.tasks.create` → suggested button: **Create tasks**
- **MED (4)** — likely missing lifecycle actions:
  - `aiAgent.generateEmailReply` → suggested button: **Generate Email Reply ai Agent**
  - `aiAgent.generatePoSuggestion` → suggested button: **Generate Po Suggestion ai Agent**
  - `aiAgent.generateRfqSuggestion` → suggested button: **Generate Rfq Suggestion ai Agent**
  - `aiAgent.sendEmailReply` → suggested button: **Send Email Reply ai Agent**

### `client/src/pages/autonomous/Exceptions.tsx`
- **Route(s)**: `/exceptions`
- **Primary domain(s)**: `autonomousWorkflows`
- **HIGH (4)** — likely missing CRUD buttons:
  - `autonomousWorkflows.config.createExceptionRule` → suggested button: **Create Exception Rule config**
  - `autonomousWorkflows.config.updateThreshold` → suggested button: **Update Threshold config**
  - `autonomousWorkflows.workflows.create` → suggested button: **Create workflows**
  - `autonomousWorkflows.workflows.update` → suggested button: **Update workflows**
- **MED (5)** — likely missing lifecycle actions:
  - `autonomousWorkflows.approvals.approve` → suggested button: **Approve approvals**
  - `autonomousWorkflows.approvals.reject` → suggested button: **Reject approvals**
  - `autonomousWorkflows.orchestrator.start` → suggested button: **Start orchestrator**
  - `autonomousWorkflows.orchestrator.stop` → suggested button: **Stop orchestrator**
  - `autonomousWorkflows.workflows.trigger` → suggested button: **Trigger workflows**

### `client/src/pages/portal/CopackerPortal.tsx`
- **Route(s)**: `/portal/copacker`
- **Primary domain(s)**: `copackerPortal`, `workOrders`
- **HIGH (6)** — likely missing CRUD buttons:
  - `copackerPortal.createInventoryUpdate` → suggested button: **Create Inventory Update copacker Portal**
  - `copackerPortal.createInvoice` → suggested button: **Create Invoice copacker Portal**
  - `workOrders.create` → suggested button: **Create work Orders**
  - `workOrders.createFromText` → suggested button: **Create From Text work Orders**
  - `workOrders.delete` → suggested button: **Delete work Orders**
  - `workOrders.update` → suggested button: **Update work Orders**
- **MED (3)** — likely missing lifecycle actions:
  - `copackerPortal.submitInventoryUpdate` → suggested button: **Submit Inventory Update copacker Portal**
  - `copackerPortal.uploadShipmentDocument` → suggested button: **Upload Shipment Document copacker Portal**
  - `workOrders.startProduction` → suggested button: **Start Production work Orders**

### `client/src/pages/autonomous/Settings.tsx`
- **Route(s)**: `/autonomous-settings`
- **Primary domain(s)**: `autonomousWorkflows`
- **HIGH (3)** — likely missing CRUD buttons:
  - `autonomousWorkflows.config.createExceptionRule` → suggested button: **Create Exception Rule config**
  - `autonomousWorkflows.config.updateThreshold` → suggested button: **Update Threshold config**
  - `autonomousWorkflows.workflows.update` → suggested button: **Update workflows**
- **MED (5)** — likely missing lifecycle actions:
  - `autonomousWorkflows.approvals.approve` → suggested button: **Approve approvals**
  - `autonomousWorkflows.approvals.reject` → suggested button: **Reject approvals**
  - `autonomousWorkflows.orchestrator.start` → suggested button: **Start orchestrator**
  - `autonomousWorkflows.orchestrator.stop` → suggested button: **Stop orchestrator**
  - `autonomousWorkflows.workflows.trigger` → suggested button: **Trigger workflows**

### `client/src/pages/freight/FreightTracking.tsx`
- **Route(s)**: `/freight/tracking`
- **Primary domain(s)**: `freight`
- **HIGH (7)** — likely missing CRUD buttons:
  - `freight.bookings.update` → suggested button: **Update bookings**
  - `freight.carriers.create` → suggested button: **Create carriers**
  - `freight.carriers.update` → suggested button: **Update carriers**
  - `freight.quotes.create` → suggested button: **Create quotes**
  - `freight.quotes.update` → suggested button: **Update quotes**
  - `freight.rfqs.create` → suggested button: **Create rfqs**
  - `freight.rfqs.update` → suggested button: **Update rfqs**
- **MED (1)** — likely missing lifecycle actions:
  - `freight.rfqs.sendToCarriers` → suggested button: **Send To Carriers rfqs**

### `client/src/pages/freight/RFQs.tsx`
- **Route(s)**: `/freight/rfqs`
- **Primary domain(s)**: `freight`
- **HIGH (6)** — likely missing CRUD buttons:
  - `freight.bookings.update` → suggested button: **Update bookings**
  - `freight.carriers.create` → suggested button: **Create carriers**
  - `freight.carriers.update` → suggested button: **Update carriers**
  - `freight.quotes.create` → suggested button: **Create quotes**
  - `freight.quotes.update` → suggested button: **Update quotes**
  - `freight.rfqs.update` → suggested button: **Update rfqs**
- **MED (2)** — likely missing lifecycle actions:
  - `freight.rfqs.sendToCarriers` → suggested button: **Send To Carriers rfqs**
  - `freight.trackShipment` → suggested button: **Track Shipment freight**

### `client/src/pages/autonomous/Approvals.tsx`
- **Route(s)**: `/approvals`
- **Primary domain(s)**: `autonomousWorkflows`
- **HIGH (4)** — likely missing CRUD buttons:
  - `autonomousWorkflows.config.createExceptionRule` → suggested button: **Create Exception Rule config**
  - `autonomousWorkflows.config.updateThreshold` → suggested button: **Update Threshold config**
  - `autonomousWorkflows.workflows.create` → suggested button: **Create workflows**
  - `autonomousWorkflows.workflows.update` → suggested button: **Update workflows**
- **MED (3)** — likely missing lifecycle actions:
  - `autonomousWorkflows.orchestrator.start` → suggested button: **Start orchestrator**
  - `autonomousWorkflows.orchestrator.stop` → suggested button: **Stop orchestrator**
  - `autonomousWorkflows.workflows.trigger` → suggested button: **Trigger workflows**

### `client/src/pages/freight/Carriers.tsx`
- **Route(s)**: `/freight/carriers`
- **Primary domain(s)**: `freight`
- **HIGH (5)** — likely missing CRUD buttons:
  - `freight.bookings.update` → suggested button: **Update bookings**
  - `freight.quotes.create` → suggested button: **Create quotes**
  - `freight.quotes.update` → suggested button: **Update quotes**
  - `freight.rfqs.create` → suggested button: **Create rfqs**
  - `freight.rfqs.update` → suggested button: **Update rfqs**
- **MED (2)** — likely missing lifecycle actions:
  - `freight.rfqs.sendToCarriers` → suggested button: **Send To Carriers rfqs**
  - `freight.trackShipment` → suggested button: **Track Shipment freight**

### `client/src/pages/freight/RFQDetail.tsx`
- **Route(s)**: `/freight/rfqs/:id`
- **Primary domain(s)**: `freight`
- **HIGH (5)** — likely missing CRUD buttons:
  - `freight.bookings.update` → suggested button: **Update bookings**
  - `freight.carriers.create` → suggested button: **Create carriers**
  - `freight.carriers.update` → suggested button: **Update carriers**
  - `freight.rfqs.create` → suggested button: **Create rfqs**
  - `freight.rfqs.update` → suggested button: **Update rfqs**
- **MED (1)** — likely missing lifecycle actions:
  - `freight.trackShipment` → suggested button: **Track Shipment freight**

### `client/src/pages/freight/CustomsClearance.tsx`
- **Route(s)**: `/freight/customs`
- **Primary domain(s)**: `customs`
- **HIGH (3)** — likely missing CRUD buttons:
  - `customs.clearances.update` → suggested button: **Update clearances**
  - `customs.documents.create` → suggested button: **Create documents**
  - `customs.documents.update` → suggested button: **Update documents**

### `client/src/pages/freight/CustomsDetail.tsx`
- **Route(s)**: `/freight/customs/:id`
- **Primary domain(s)**: `customs`
- **HIGH (2)** — likely missing CRUD buttons:
  - `customs.clearances.create` → suggested button: **Create clearances**
  - `customs.documents.create` → suggested button: **Create documents**

### `client/src/pages/Notes.tsx`
- **Route(s)**: `/notes`
- **Primary domain(s)**: `notes`
- **HIGH (2)** — likely missing CRUD buttons:
  - `notes.create` → suggested button: **Create notes**
  - `notes.update` → suggested button: **Update notes**

### `client/src/pages/Notifications.tsx`
- **Route(s)**: `/notifications`
- **Primary domain(s)**: `notifications`
- **HIGH (2)** — likely missing CRUD buttons:
  - `notifications.delete` → suggested button: **Delete notifications**
  - `notifications.updatePreferences` → suggested button: **Update Preferences notifications**

### `client/src/pages/AIAssistant.tsx`
- **Route(s)**: `/ai`
- **Primary domain(s)**: `ai`
- **HIGH (1)** — likely missing CRUD buttons:
  - `ai.createConversation` → suggested button: **Create Conversation ai**

### `client/src/pages/InvestorPortal.tsx`
- **Route(s)**: `/investor-portal`
- **Primary domain(s)**: `investorPortal`
- **MED (1)** — likely missing lifecycle actions:
  - `investorPortal.inviteToPortal` → suggested button: **Invite To Portal investor Portal**

### `client/src/pages/sales/Customers.tsx`
- **Route(s)**: `/sales/customers`
- **Primary domain(s)**: `customers`
- **HIGH (1)** — likely missing CRUD buttons:
  - `customers.update` → suggested button: **Update customers**

## Not routed

### `client/src/pages/hr/InvestorPortalAdmin.tsx`
- **Route(s)**: _not routed_
- **Primary domain(s)**: `capTable`
- **HIGH (11)** — likely missing CRUD buttons:
  - `capTable.grants.create` → suggested button: **Create grants**
  - `capTable.grants.update` → suggested button: **Update grants**
  - `capTable.shareClasses.create` → suggested button: **Create share Classes**
  - `capTable.shareClasses.delete` → suggested button: **Delete share Classes**
  - `capTable.shareClasses.update` → suggested button: **Update share Classes**
  - `capTable.stakeholders.create` → suggested button: **Create stakeholders**
  - `capTable.stakeholders.delete` → suggested button: **Delete stakeholders**
  - `capTable.stakeholders.deletePlaceholders` → suggested button: **Delete Placeholders stakeholders**
  - `capTable.transactions.create` → suggested button: **Create transactions**
  - `capTable.valuations.create` → suggested button: **Create valuations**
  - `capTable.valuations.update` → suggested button: **Update valuations**
- **MED (1)** — likely missing lifecycle actions:
  - `capTable.generateReport` → suggested button: **Generate Report cap Table**

### `client/src/pages/Projects.tsx`
- **Route(s)**: _not routed_
- **Primary domain(s)**: `projects`
- **HIGH (7)** — likely missing CRUD buttons:
  - `projects.addMilestone` → suggested button: **Add Milestone projects**
  - `projects.create` → suggested button: **Create projects**
  - `projects.delete` → suggested button: **Delete projects**
  - `projects.deleteTask` → suggested button: **Delete Task projects**
  - `projects.deleteTasks` → suggested button: **Delete Tasks projects**
  - `projects.update` → suggested button: **Update projects**
  - `projects.updateMilestone` → suggested button: **Update Milestone projects**

### `client/src/pages/marketing/SocialPosts.tsx`
- **Route(s)**: _not routed_
- **Primary domain(s)**: `marketing`
- **HIGH (2)** — likely missing CRUD buttons:
  - `marketing.deleteVideo` → suggested button: **Delete Video marketing**
  - `marketing.updateVideo` → suggested button: **Update Video marketing**

### `client/src/pages/finance/AccountsAndTransactions.tsx`
- **Route(s)**: _not routed_
- **Primary domain(s)**: `accounts`
- **HIGH (1)** — likely missing CRUD buttons:
  - `accounts.update` → suggested button: **Update accounts**

---

## Totals
- Pages with HIGH gaps: **63**
- Pages with MED gaps: **36**
- Total HIGH suggestions: **281**
- Total MED suggestions: **89**