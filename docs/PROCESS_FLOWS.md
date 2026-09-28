# Process flows verified end to end

Each module's core business process is exercised start to finish by a flow test
under `server/flows/`. A flow test drives the real tRPC routers through
`appRouter.createCaller` with users of the appropriate roles, against a stateful
in-memory stand-in for the database, and asserts every state transition,
side effect (email, audit log, notification), permission check, and entity-scope
rule. SQL itself is not executed; the repo's `pnpm audit:sweep` against a
throwaway MySQL database covers that layer.

Run all flows: `pnpm test server/flows`

| Module | Test | Steps | Status |
|---|---|---|---|
| Sales | `sales.flow.test.ts` | 8 | all work |
| Procurement and inventory | `procurement.flow.test.ts` | 8 | all work |
| Manufacturing | `manufacturing.flow.test.ts` | 7 | all work |
| Logistics | `logistics.flow.test.ts` | 7 | all work |
| Finance | `finance.flow.test.ts` | 9 | all work, no bank-to-payment reconciliation feature |
| People (HR) | `people.flow.test.ts` | 6 | all work, offer letters are not emailed |
| CRM and marketing | `crm.flow.test.ts` | 6 | all work, campaigns cannot be sent |
| Document import | `documentImport.flow.test.ts` | 5 | all work |
| AI agent | `aiAgent.flow.test.ts` | 5 | all work, no completion notification |
| Data rooms, investors, legal | `dataRoom.flow.test.ts` | 6 | all work |
| Projects | `projects.flow.test.ts` | 3 | all work, tasks cannot be assigned to the AI agent |

## Sales

1. Sales creates a customer, filed under the rep's own entity.
2. Creates an order with line items; number, totals, and status pending.
3. Order moves pending, confirmed, processing, shipped, delivered; invalid statuses rejected. Shipping flips the linked draft invoice to sent.
4. Finance raises an invoice for the order; a posted journal entry debits Accounts Receivable and credits Revenue.
5. Customer payments are recorded; a partial payment leaves the invoice partial, the balance marks it paid and the order delivered.
6. A recurring invoice template generates a draft invoice on demand.
7. Users of another entity cannot see or change this entity's customers, orders, invoices, or payments.
8. External portal accounts cannot create sales orders.

## Procurement and inventory

1. Ops creates a vendor and a raw material with a preferred vendor.
2. Raises a purchase order; number, totals, status draft, raw-material line linked.
3. Sends it to the supplier: email goes out, a portal session is stored, the supplier reads the PO, uploads documents, saves freight details, and confirms with no login.
4. Goods arrive in two deliveries: stock rises in the right warehouse, one cost layer per receipt at the PO price, PO goes partial then received, each receipt audited.
5. Freight and duties are spread across the existing cost layers without adding quantity.
6. A blind cycle count is recorded by ops and approved by admin; stock is corrected with a reason code.
7. A stock drop below the reorder point raises a low-stock alert and a replenishment suggestion naming the preferred vendor.
8. Other entities see nothing; sales roles cannot buy.

## Manufacturing

1. Two raw materials with stock, one finished product.
2. Bill of materials with quantities and rolled-up cost per unit.
3. Work order for 100 units; required materials computed from the BOM.
4. Start production reserves each material exactly once across warehouses.
5. Complete production consumes materials, books a finished-goods lot, closes the work order, and notifies ops with the yield.
6. Yield below target escalates the notification; moisture conversions calculate.
7. Finance and vendors cannot create work orders.

## Logistics

1. Warehouses with valid types, and a carrier.
2. Freight RFQ sent to carriers: verified contacts get email, unverified are blocked, status sent.
3. Quotes arrive; accepting one rejects the rest, books the shipment, and awards the RFQ.
4. Shipment pending, in transit, delivered; delivery marks the sales order delivered and notifies sales.
5. Warehouse transfer: create, ship (source decreases), receive (destination increases).
6. Customs clearance receives PO lines that have a product and skips lines that do not.
7. Vendors cannot create shipments.

## Finance

1. Chart of accounts created and listed.
2. Vendor bill entered by ops, matched to its PO within tolerance, approved by finance, paid by ACH creating a payment record; aging drops to zero; paid bills cannot be cancelled or re-paid.
3. Payment workflow auto-pays bills under the threshold and requests approval above it.
4. Journal transactions are entity-scoped; posting to another entity is refused.
5. Bank sync imports and de-duplicates transactions; AI categorization matches the vendor. No bank-to-payment reconciliation exists in the product.
6. Profit and loss, balance sheet, and AP aging reflect the bills above.
7. R&D tax credit honours a stored 0% rate on edits.
8. KPI goals track actual against target.
9. Sales cannot touch bills; ops can create but not approve or pay.

## People (HR)

1. Department created; candidate moves through recruiting stages to hired.
2. Offer letter drafted, sent, accepted (status only, no email exists); candidate becomes an employee with an auto number.
3. The employee sees their own portal profile and documents; team invites email a token.
4. Time entries logged, submitted, approved by admin, invoiced, emailed to Accounts Payable, paid, and shown as a payslip.
5. Another user cannot edit or submit someone else's entries.
6. External portal accounts cannot read the employee directory.

## CRM and marketing

1. Contact created; duplicates merge by email; self-email rejected.
2. Calls, emails, and meetings logged and listed newest first.
3. A deal request goes to the approval queue, admin approves, the deal moves through stages to won, and pipeline stats update.
4. Email sequences build and activate; campaigns draft and schedule. Neither can send to recipients yet.
5. Marketing plans and publishes a video per platform; brand ambassadors move through stages.
6. Ops cannot wipe the CRM; investors cannot read contacts.

## Document import

1. A CSV purchase order is parsed by the model and normalized.
2. Imported as a PO with vendor and materials created under the caller's entity; duplicates skipped; inventory updated only when asked; history recorded.
3. A vendor invoice import creates a bill that finance can approve and pay.
4. Freight invoices and customs documents create bookings and link to the PO when asked.
5. Scanned PDFs are rendered to page images for the vision model; a clear message names the missing packages when the renderer is absent.

## AI agent

1. Admin creates a low-stock rule.
2. Evaluation creates one pending task and never a duplicate.
3. Ops cannot approve; admin approves; execution creates a draft PO with the raw-material link and completes the task. No notification is sent on completion.
4. Rejections record a reason; bulk delete is admin only.
5. A natural-language order becomes a pending task, not a direct purchase.

## Data rooms, investors, legal

1. Admin creates a room, folder, document, expiring share link, and an emailed invitation.
2. Non-owners cannot change the room.
3. A visitor opens the link, is recorded, views content, and the room owner is notified.
4. NDA uploaded, signed by the visitor, listed for the owner; investment interest notifies the owner.
5. Stakeholders are invited to the portal; updates are entity-scoped and visible only once sent.
6. Legal cases are entity-scoped with validated dates.

## Projects

1. Project, milestone, and tasks created, assigned, and completed; project closes at 100%.
2. Investors and vendors cannot create projects.
3. PM matrix markets, functions, and projects roll up task counts and fire the completion hook once.

## Known gaps found by the flows (not yet fixed)

- Finished goods from a completed work order go to lots and balances but not the main inventory table, so they do not appear in the inventory list and cannot be transferred or scrapped.
- Receiving a purchase order updates raw-material stock but not product-level stock, so product reorder alerts and cycle counts do not see receipts.
- Invoice, payment, and recurring-invoice lookups by id skip entity scope.
- Recurring invoices use a different numbering scheme and post no journal entry.
- Financial reports accept a date range but ignore it.
- Bills can be created with any status by ops, bypassing the approval gate.
- No feature exists for: bank-to-payment reconciliation, emailing offer letters, enrolling contacts in sequences, sending campaigns, linking a login to an employee record via the API, or assigning a project task to the AI agent.
