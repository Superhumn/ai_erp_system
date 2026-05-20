# UI Fixes — what got wired, what's left, why

Status of the work started from `docs/UI_MISSING_FEATURES.md`.

## What I wired up

| Page | Buttons added |
|------|---------------|
| `client/src/pages/sales/Orders.tsx` | Inline Status edit (calls `orders.update`); DetailSheet **Delete** with confirm (`orders.delete`). |
| `client/src/pages/operations/Procurement.tsx` | POs tab: per-row **Delete PO**. Vendors tab: per-row **Activate / Deactivate** (`vendors.update` status toggle) + **Delete vendor**. Raw Materials tab: per-row **Delete material**. All destructive actions use AlertDialog confirms. |
| `client/src/pages/edi/TradingPartners.tsx` | Detail header: **Delete Partner** with confirm. Crosswalks tab: **Add Crosswalk** dialog (product select, buyer/vendor part #, UPC, UOM, pack size) + per-row delete with confirm. Ship-To Locations tab: **Add Location** dialog (code, type, name, city/state, GLN). |
| `client/src/pages/hr/Employees.tsx` | New **Cap Table** dropdown in the header: **Record 409A Valuation** (`capTable.valuations.create` — full form with date, FMV, provider, methodology, status, expiration, notes), **Record Equity Transaction** (`capTable.transactions.create` — grant select, vest/exercise/transfer/etc. type, shares, price), **Generate Cap Table Report** (`capTable.generateReport`). |
| `client/src/pages/operations/WorkOrderDetail.tsx` | Header dropdown: **Cancel Work Order** (`workOrders.update` status='cancelled'), **Delete Work Order** (`workOrders.delete`) — both with AlertDialog confirms; on delete, navigate back to the list. |

5 pages, 16 new user-visible actions, every destructive verb gated by a confirm dialog. Typecheck + build green on each batch.

## What's NOT wired and why

The raw punch list had 281 HIGH-priority suggestions across 63 pages. After cross-referencing **what's actually called anywhere in `client/src/pages/`** (via `scripts/find-real-missing.mjs`), only **55 pages** have any truly-missing mutations. After applying judgment about where those mutations belong, most remaining gaps fall into three categories:

### A. Mutation belongs on a different page than the gap report suggested
The original gap analysis flagged mutations by **primary domain**, which over-attributes. Examples:
- `freight/Carriers.tsx` flagged for `freight.rfqs.update`, `freight.quotes.*` — but those belong on `freight/RFQs.tsx` and `freight/RFQDetail.tsx`, which already wire them.
- `operations/POReceiving.tsx` flagged for `purchaseOrders.create` — but POReceiving is a workflow page for incoming POs, not a PO authoring page.
- `operations/BOM.tsx` flagged for `bom.addComponent / deleteComponent / update` — all already wired on `operations/BOMDetail.tsx`.

These were dropped without UI changes; the gap report should not have flagged them.

### B. Mutation has no natural home anywhere in the current UI
Some server endpoints exist with no UI surface at all. Wiring them up isn't "add a button" — it's "design a new feature page". Out of scope for this pass:
- `aiAgent.emailTemplates.create/update`, `aiAgent.rules.create/update`, `aiAgent.tasks.create` — no agent-config page exists; ApprovalQueue is the closest but it's a queue reviewer, not a template editor.
- `emailScanning.createAutoReplyRule` + update/delete — no auto-reply rules section in EmailInbox.
- `autonomousWorkflows.config.createExceptionRule`, `config.updateThreshold`, `workflows.update` — `autonomous/Settings.tsx` is the right home but each needs its own non-trivial editor UI.
- `dataRoom.dueDiligence.addItem / createFromTemplate / deleteItem`, `dataRoom.invitations.resend / revoke / updatePermissions`, `dataRoom.folders.update`, `dataRoom.links.update` — data room is a substantial feature surface; adding all of these needs product/UX input on flow.
- `grantBid.templates.create/update/delete`, `grantBid.opportunities.update/delete`, `grantBid.applications.delete`, `grantBid.documents.create` — same: template/opportunity management needs its own UI.
- `crm.campaigns.create/update`, `crm.deals.delete`, `crm.pipelines.create/update`, `crm.tags.*` — these are flagged on `Messaging.tsx` because of primary-domain inference, but they belong on a CRM admin page; Messaging is the chat UI.

### C. Mutation exists but the gap doc was wrong
A few mutations the curator suggested don't actually exist on the server. Caught one during batch 1 (`edi.shipToLocations.delete` — the gap analysis only flagged create + update, but my interpretation overshot and added a phantom delete; trimmed via typecheck). The curator now hews more carefully to `/tmp/server-procs.txt`.

## What I'd recommend doing next

In order of value-to-effort:

1. **Inline status editing on `finance/Invoices.tsx`** — match the pattern from `sales/Orders.tsx` (mark status column editable, wire `invoices.update`). Adds the missing invoice update path without designing a new editor.
2. **Per-row delete on `operations/PurchaseOrders.tsx`** — `purchaseOrders.delete` is now wired on the Procurement consolidated screen but not on the dedicated PO list. Mirror the dropdown pattern.
3. **`autonomous/Settings.tsx` workflow editor** — the workflow tab has a Create dialog but no Edit. A minimal "Edit Workflow" dialog reusing the create form would close `workflows.update`.
4. **Data room sub-resource management on `DataRoomDetail.tsx`** — folders/links/invitations are real gaps but each needs a small inline editor. Worth a dedicated PR.
5. **CRM admin page** — campaigns, pipelines, tags. They're flagged on Messaging by accident; the actual home should be a CRM settings section. Greenfield.

Everything else is either covered, doesn't have a clear home, or would degrade quality if rushed.

## Tooling left behind

- `scripts/extract-ui-inventory.mjs` → `docs/UI_INVENTORY.md` — per-page audit of buttons, dialogs, nav, tRPC calls.
- `scripts/curate-missing-features.mjs` → `docs/UI_MISSING_FEATURES.md` — the original (per-page) gap list.
- `scripts/find-real-missing.mjs` → `/tmp/real-missing.md` — refined list (cross-page filtered). Re-run after future changes.

All three scripts read from `/tmp/server-procs.txt` (produced by `npx tsx scripts/dump-trpc-paths.ts`), so refreshing the picture is: re-dump the procs, re-run the three scripts. Deterministic.
