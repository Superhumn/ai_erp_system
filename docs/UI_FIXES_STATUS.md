# UI Fixes — what got wired, what's left, why

Live status of the work started from `docs/UI_MISSING_FEATURES.md`. Updated after each batch.

## Batch log (24 commits)

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
| 10 | `hr/Employees` | Share class edit + delete |
| 11 | `edi/TradingPartners` | Edit crosswalk + edit ship-to location |
| 12 | `Notes` | Edit captured note (re-parses via LLM on save) |
| 13 | `finance/Payments` | Inline payment status edit |
| 14 | `freight/FreightTracking` | Inline booking status edit on the selected-shipment detail bar |
| 15 | `projects/Projects`, `hr/Employees` | Milestones panel per project; valuation list + edit |
| 16 | `operations/EmailInbox` | Auto-reply rules manager (full CRUD + enabled toggle) |
| 17 | `crm/CRMHub` | Deal delete + auto-merge duplicates + cleanup placeholders. Refined gap analyzer to recognize the `(trpc.x as any)` escape hatch — eliminates the largest source of remaining false positives. |
| 18 | `ai/ApprovalQueue` | AI agent config dialog: full CRUD on aiAgent.rules and aiAgent.emailTemplates, two tabs |
| 19 | `edi/TradingPartners` | Document maps tab (full CRUD) + compliance scorecard create |
| 20 | `crm/CRMHub` | Tag manager + pipeline manager dialogs |
| 21 | `hr/TimeTracking`, `finance/RdTaxCredit`, `marketing/SocialPosts` | Time entry hours edit + approve; R&D% inline edit; video edit + delete |
| 22 | `operations/VendorNegotiations`, `projects/InvestmentGrantChecklist` | Negotiation status + generate-draft; checklist status + add custom item |
| 23 | `hr/EmployeePortal` | Emergency contact phone edit + mark-as-primary |

### Tally

- **28 page surfaces** touched
- **~95 user-visible actions** added
- Every destructive verb gated by a confirm
- Typecheck + build green on every commit
- 24 commits on `claude/add-missing-ui-buttons-iBPn9`

## What's still NOT wired and why

The refined cross-page analyzer (`scripts/find-real-missing.mjs`) now reports 46 pages with at least one unmapped mutation. The remaining items split:

### A. Same mutation flagged on multiple sibling pages
`Messaging.tsx`, `sales/CRMInvestors.tsx`, `sales/FundraisingCampaigns.tsx` all flag the same 6 CRM mutations (`crm.campaigns.create/update`, `crm.interactions.create`, `crm.tags.addToContact/removeFromContact`, `crm.whatsapp.updateStatus`). These are inherently cross-cutting:

- **`crm.tags.addToContact / removeFromContact`** — per-contact tagging; the natural home is the contact detail UI inside each page, which would need a tag-picker component on three separate surfaces. Skipped here to avoid duplication.
- **`crm.campaigns.create / update`** — CRM-side campaigns (distinct from marketing campaigns). Would need a dedicated CRM campaigns admin section.
- **`crm.interactions.create`** — `interactions.addNote` is wired and covers ~90% of the use case; the broader `create` (with channel + direction + outcome fields) is admin-only.
- **`crm.whatsapp.updateStatus`** — workflow action that fires from the WhatsApp integration server-side, not user-triggered.

### B. Mutation needs a multi-field dialog, not a button
- **`inventoryCosting.cogs.generateSummary`** — requires periodType + start/end + companyId/productId; needs a dedicated reporting form.
- **`rdTaxCredit.importFromQuickBooks`** — requires studyId + projectId + date range + category; same shape.
- **`shopify.stores.create`** — stores connect via OAuth on the Integrations page; manual API-key entry is the wrong path.
- **`shopify.locationMappings.create`** — needs a Shopify-location list query that isn't currently exposed to the client.

### C. Telemetry / internal procs (not user-triggered)
- `dataRoom.pageTracking.updatePageView`, `dataRoom.sessions.start`, `dataRoom.sessions.updateActivity` — fire automatically while a visitor reads documents.
- `edi.transactions.generateOutbound`, `edi.transport.deliverOutbound` — fire on the server-side EDI processing pipeline.

### D. Single-mutation tail (1 each)
A long tail of pages with one unmapped mutation that's either context-bound (needs a different page's state) or below the value-effort threshold. Examples:
- `AIAssistant.tsx`, `Notifications.tsx`, `Settings.tsx`, `finance/Accounts.tsx`, `operations/CoreOperations.tsx` — typically a `*.create` or `*.update` whose proper home is on a sibling list page that already has it.

## Tooling left behind

- `scripts/extract-ui-inventory.mjs` → `docs/UI_INVENTORY.md`
- `scripts/curate-missing-features.mjs` → `docs/UI_MISSING_FEATURES.md` (raw)
- `scripts/find-real-missing.mjs` → `/tmp/real-missing.md` (cross-page filtered + recognizes the `(trpc.foo as any).bar` escape hatch)
- `scripts/dump-trpc-paths.ts` → `/tmp/server-procs.txt` (signatures of every wired tRPC procedure)

Refresh cycle: re-dump procs, re-run the three gap scripts, triage.
