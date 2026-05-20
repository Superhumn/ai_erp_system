# UI Fixes — what got wired, what's left, why

Live status of the work started from `docs/UI_MISSING_FEATURES.md`. Updated after each batch.

## Batch log (15 commits)

| Batch | Page surfaces | Highlights |
|-------|---------------|------------|
| 1 | `sales/Orders`, `operations/Procurement`, `edi/TradingPartners` | Inline order status, PO/vendor/raw-material deletes, vendor activate/deactivate, EDI crosswalks + ship-to add/delete |
| 2 | `hr/Employees`, `operations/WorkOrderDetail` | Cap Table dropdown (record 409A, record equity transaction, generate report), cancel/delete work order |
| 3 | `finance/Invoices`, `operations/PurchaseOrders`, `autonomous/Settings` | Inline invoice + PO status, approve + send-to-supplier, edit workflow dialog |
| 4 | `DataRoomDetail` (folders, links, DD) | Rename folder, edit share link, add/remove DD items |
| 5 | `DataRoomDetail` (invitations), `grants/GrantBidSubmitter` | Pending invitations card (resend, edit permissions, revoke), delete application + delete dismissed opportunity |
| 6 | `legal/Contracts`, `hr/EquityPortal` | Inline contract status + approve + add key date; exercise request approve/deny/cancel |
| 7 | `autonomous/Settings`, `hr/Employees`, `hr/InvestorPortalAdmin` | Edit threshold rows, add exception rule, clean up placeholder stakeholders, delete stakeholder |
| 8 | `grants/GrantBidSubmitter`, `DataRoomDetail` | New Narrative Templates tab with full CRUD; document rename |
| 9 | `projects/Projects`, `DataRoomDetail` | Single-task delete; delete entire DD checklist |
| 10 | `hr/Employees` | Share class edit + delete (in the existing Share Classes dialog) |
| 11 | `edi/TradingPartners` | Edit crosswalk + edit ship-to location |
| 12 | `Notes` | Edit captured note (title + content; re-parses via LLM) |
| 13 | `finance/Payments` | Inline payment status edit |
| 14 | `freight/FreightTracking` | Inline booking status edit on the selected-shipment detail bar |

### Tally

- **24 page surfaces** touched
- **~90 user-visible actions** added
- Every destructive verb gated by AlertDialog or `window.confirm`
- Typecheck + build green on every commit
- 15 commits on `claude/add-missing-ui-buttons-iBPn9`

## What's NOT wired and why

The raw curator produced 281 HIGH-priority suggestions across 63 pages.
`scripts/find-real-missing.mjs` narrowed that to ~50 pages with genuinely
unmapped mutations. After 15 batches, the remaining gaps split into:

### A. Mutation already wired on a sibling/detail page
Cross-page filter catches these. Examples now retired: `freight.rfqs.update`
on `Carriers.tsx` (lives on `RFQDetail.tsx`), `bom.addComponent` on
`BOM.tsx` (lives on `BOMDetail.tsx`), `customs.clearances.update` on
`CustomsClearance.tsx` (lives on `CustomsDetail.tsx`).

### B. Server endpoint exists but no natural UI home
These would each need a new sub-page or feature surface that doesn't
exist yet — out of scope for a "wire the button" pass:

- **`Messaging.tsx`** (15 HIGH on CRM domain) — `crm.campaigns.*`,
  `crm.pipelines.*`, `crm.tags.*`, `crm.deals.delete`. Primary-domain
  inference attributed these to Messaging because of the chat UI; the
  real home is a CRM settings/admin page.
- **`ai/ApprovalQueue.tsx`** (5 HIGH) — `aiAgent.emailTemplates.*`,
  `aiAgent.rules.*`, `aiAgent.tasks.create`. Needs an agent-config page.
- **`operations/EmailInbox.tsx`** (3 HIGH + 4 MED) —
  `emailScanning.createAutoReplyRule` + update/delete. Needs an
  auto-reply rules section.
- **`portal/CopackerPortal.tsx`** (3 HIGH + 3 MED) —
  `copackerPortal.createInvoice`, `createInventoryUpdate`,
  `uploadShipmentDocument` / `uploadShippingDocument`. Each needs a
  composer dialog of its own.
- **`edi/EDITransactions.tsx`** + **`edi/RetailerOnboarding.tsx`** —
  remaining gaps are `edi.documentMaps.*` and `edi.compliance.create`,
  which need JSON config editors (~50 fields each).
- **`Projects.tsx` / `projects/Projects.tsx`** — `projects.addMilestone`,
  `updateMilestone`. Milestones aren't surfaced in the current Projects
  UI; would need a milestones panel.
- **`DataRoomDetail`** remaining — `documents.create` (metadata-only,
  redundant with upload), `dueDiligence.createFromTemplate` (alternate
  to `createStandard`), and three telemetry mutations
  (`pageTracking.updatePageView`, `sessions.start`,
  `sessions.updateActivity`) that fire automatically during viewer
  sessions, not from a button.

### C. Single-mutation tail
A handful of pages still flag 1–2 unmapped mutations where the cost of
adding UI is high relative to value — typically because the entity is
hidden behind a workflow:

- `capTable.grants.update` / `valuations.update` — would need a grants
  list editor and a valuations history panel on Employees / EquityPortal.
- `freight.bookings.update` on `freight/Carriers.tsx` — bookings aren't
  shown on that page; FreightTracking gets it instead (batch 14).
- `grantBid.opportunities.update` — limited surface (status + notes +
  applicationId); largely redundant with existing save / dismiss.

## Tooling left behind

- `scripts/extract-ui-inventory.mjs` → `docs/UI_INVENTORY.md`
- `scripts/curate-missing-features.mjs` → `docs/UI_MISSING_FEATURES.md`
- `scripts/find-real-missing.mjs` → `/tmp/real-missing.md` (cross-page filtered)
- `scripts/dump-trpc-paths.ts` — produces `/tmp/server-procs.txt`; used
  by all three gap scripts to validate proc paths before wiring.

Refresh cycle: dump procs → re-run the three scripts → triage. Deterministic.
