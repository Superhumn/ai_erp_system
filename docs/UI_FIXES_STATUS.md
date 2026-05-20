# UI Fixes — what got wired, what's left, why

Live status of the work started from `docs/UI_MISSING_FEATURES.md`. Updated after each batch.

## What I wired up

### Batch 1 — `sales/Orders`, `operations/Procurement`, `edi/TradingPartners`
Inline status edit on orders, row deletes on PO/vendor/raw-material rows in
Procurement, vendor activate/deactivate, crosswalks + ship-to-locations
sub-resource CRUD on EDI TradingPartners, destructive verbs gated by
AlertDialog confirms.

### Batch 2 — `hr/Employees`, `operations/WorkOrderDetail`
Cap Table dropdown in Employees header: **Record 409A Valuation**,
**Record Equity Transaction** (vest/exercise/transfer/etc), **Generate Cap
Table Report**. WorkOrderDetail row dropdown: **Cancel Work Order**,
**Delete Work Order** with confirms.

### Batch 3 — `finance/Invoices`, `operations/PurchaseOrders`, `autonomous/Settings`
Inline status edit on Invoices + Approve (mark as Sent) action. Inline
status edit on PurchaseOrders + Approve + Send to Supplier in the row
dropdown. Wired the placeholder Edit pencil on each workflow row in
autonomous Settings to a full edit dialog (name, trigger, cron schedule,
approval policy, escalation).

### Batch 4 — `DataRoomDetail` (folders, links, due diligence)
**Rename Folder** menu item with inline dialog. **Edit share link** pencil
button — rename, expiry, max views, active toggle. **Add Item** to the
due-diligence checklist (category autocomplete, requirement selector).
**Remove from checklist** entry on each DD item's menu.

### Batch 5 — `DataRoomDetail` invitations + `grants/GrantBidSubmitter`
Pending invitations card in the Visitors tab with **Resend**, **Edit
permissions** (role + allowDownload + allowPrint), and **Revoke** actions.
Per-row **Delete application** column on GrantBidSubmitter with
AlertDialog confirm. **Delete permanently** action on dismissed/expired
opportunities.

### Batch 6 — `legal/Contracts`, `hr/EquityPortal`
Inline contract status select + **Approve (activate)** button + **Add Key
Date** dialog (renewal / termination / milestone / review / payment /
custom) in the detail sheet. Stock-option exercise requests gain a
context-aware action column: **Approve** + **Deny** (with reason prompt)
for admins, **Cancel** for grantees.

### Batch 7 — `autonomous/Settings`, `hr/Employees`, `hr/InvestorPortalAdmin`
Click-to-edit on approval threshold rows (auto-approve cap + three
escalation levels). **Add Rule** dialog on the Exceptions tab —
exceptionType + resolution strategy (auto/AI/human/escalate) + priority +
timeout. **Clean up placeholders** action on Employees Cap Table dropdown
calls `stakeholders.deletePlaceholders` for test-data cleanup. **Delete
stakeholder** button in the danger-zone footer of each row on
InvestorPortalAdmin (server rejects when grants are still attached).

### Running count

19 page surfaces touched, ~65 user-visible actions added across 8 commits.
Every destructive verb gated by a confirm. Typecheck + build green on
every push.

## What's NOT wired and why

The raw punch list had 281 HIGH-priority suggestions across 63 pages.
Cross-page filtering via `scripts/find-real-missing.mjs` narrowed that to
~50 pages with genuinely-missing mutations. The remaining ones split:

### A. Mutation already wired on a sibling/detail page
Examples: `freight.rfqs.update` on `Carriers.tsx` (lives on `RFQDetail.tsx`),
`bom.addComponent` on `BOM.tsx` (lives on `BOMDetail.tsx`),
`customs.clearances.update` on `CustomsClearance.tsx` (lives on
`CustomsDetail.tsx`). Cross-page filter eliminates these.

### B. Server endpoint exists but no natural UI home
These need new sub-pages, not bolted-on buttons:

- **`Messaging.tsx`** (15 HIGH on CRM domain): `crm.campaigns.*`, `crm.pipelines.*`,
  `crm.tags.*`, `crm.deals.delete`, `crm.contacts.merge` — the gap analysis
  attributed these to Messaging because of primary-domain inference, but
  Messaging is the chat UI. The real home is a CRM settings/admin page
  that doesn't exist yet.
- **`ai/ApprovalQueue.tsx`** (5 HIGH): `aiAgent.emailTemplates.*`,
  `aiAgent.rules.*`, `aiAgent.tasks.create` — no agent-config page exists;
  ApprovalQueue is for reviewing pending approvals, not editing rules.
- **`operations/EmailInbox.tsx`** (3 HIGH + 4 MED):
  `emailScanning.createAutoReplyRule` + update/delete — there's no
  auto-reply rules section on EmailInbox currently.
- **`portal/CopackerPortal.tsx`** (3 HIGH + 3 MED):
  `copackerPortal.createInvoice`, `createInventoryUpdate`,
  `uploadShipmentDocument` — copacker workflow ops needing dedicated
  composers.
- **`edi/EDITransactions.tsx`** + **`edi/RetailerOnboarding.tsx`** (5 HIGH
  + 2 MED each): `edi.documentMaps.*`, `edi.compliance.create`,
  `edi.crosswalks.update`, `edi.shipToLocations.update`,
  `edi.transactions.generateOutbound`, `edi.transport.deliverOutbound` —
  the missing pieces are JSON config editors for EDI document mapping
  (~50 fields each) plus large lifecycle ops.
- **`Projects.tsx` / `projects/Projects.tsx`** (4 HIGH each):
  `projects.addMilestone`, `updateMilestone` — milestones aren't surfaced
  in the current Projects UI; would need a milestones panel.
- **`DataRoomDetail.tsx`** remaining (`documents.create` for metadata-only
  docs; `documents.update` for rename; `dueDiligence.createFromTemplate` /
  `delete`) — would extend the existing tabs further; `documents.upload`
  already covers the create-with-file flow.

### C. Cap-table family (`Employees`, `EquityPortal`, `InvestorPortalAdmin`)
Same 5–6 remaining gaps across all three pages: `capTable.grants.update`,
`capTable.shareClasses.update/delete`, `capTable.stakeholders.update`,
`capTable.valuations.update`. Batch 2 + 7 added the highest-leverage
ones (create valuation, create transaction, generate report, delete
placeholders, delete stakeholder, tier update). The remaining
update/delete on grants and share classes need inline edit on existing
detail panels — feasible but not "wire the button" scope.

## Tooling left behind

- `scripts/extract-ui-inventory.mjs` → `docs/UI_INVENTORY.md`
- `scripts/curate-missing-features.mjs` → `docs/UI_MISSING_FEATURES.md` (raw)
- `scripts/find-real-missing.mjs` → `/tmp/real-missing.md` (cross-page filtered)

All three scripts read `/tmp/server-procs.txt` (produced by
`npx tsx scripts/dump-trpc-paths.ts`). Refresh: re-dump, re-run.
