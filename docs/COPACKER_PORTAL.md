# Copacker Portal

A self-service portal for external co-packers / contract manufacturers. A copacker
logs into your ERP, but only sees data scoped to the single warehouse they're
assigned to. They can report inventory, submit invoices, upload shipping/customs
documents, view recipes you choose to share, and complete work orders.

**Status: functional end-to-end and safe to share with external partners.**

## How to grant a copacker access

1. **Create a warehouse** for the copacker with `type: 'copacker'` (Operations → locations).
2. **Send an invite** via the admin-only `invitations.create` endpoint with the copacker
   role and the warehouse they're assigned to:

   ```ts
   invitations.create({
     email: "partner@copacker.example",
     role: "copacker",
     linkedWarehouseId: 5,   // REQUIRED — the warehouse from step 1
     expiresInDays: 7,
   })
   ```

3. The invitee accepts (`invitations.accept`), creates an account (Google OAuth or
   password), and their user is provisioned with `role: 'copacker'` and the
   `linkedWarehouseId` baked in.
4. **Send them the direct link: `/portal/copacker`.** The portal is intentionally
   **not in the sidebar** — external users won't discover it on their own.

> ⚠️ **`linkedWarehouseId` is mandatory.** Without it, every portal query returns
> `FORBIDDEN: No warehouse assigned to this account` and the page is empty. There is a
> second, generic email-invite path (`teamInvites.invite`) that does *not* set the
> warehouse — don't use it for copackers.

## What a copacker can do

| Capability | Notes |
|------------|-------|
| View inventory | Scoped to their warehouse only (`getInventory`). |
| Update stock levels | Inline edit; auto-triggers a low-stock PO if thresholds are hit. |
| Biweekly inventory updates | Draft → submit workflow; on submit, quantities post to live inventory. |
| Submit invoices | Manual line-item entry, or upload a PDF/image that is AI-parsed and emailed to AP (`superhumn@ap.mercury.com`). Copacker fees auto-allocate to COGS cost layers. |
| Upload shipping documents | BOL, packing list, proof of delivery, customs docs. |
| View shared recipes | Read-only; you control per-share whether ingredients/procedures are visible (trade-secret protection). |
| Complete work orders | View active work orders and mark production complete. |

## Access control model

All endpoints live under the `copackerProcedure` middleware
(`server/routers.ts:110`), which allows roles `admin`, `ops`, and `copacker`.
For `copacker` users, every query/mutation re-checks `ctx.user.linkedWarehouseId`
and rejects cross-warehouse access — a copacker cannot see another warehouse's
inventory, updates, invoices, or documents. `admin`/`ops` users see all warehouses.

## Key files

| Concern | Location |
|---------|----------|
| Frontend page | `client/src/pages/portal/CopackerPortal.tsx` |
| Route | `client/src/App.tsx` → `/portal/copacker` |
| Live tRPC router | `server/routers.ts` → `copackerPortal` (~L8424–9075) |
| Middleware | `server/routers.ts:110` (`copackerProcedure`) |
| Onboarding | `server/routers.ts` → `invitations.create` (~L8257) |
| DB helpers | `server/db.ts` § "COPACKER PORTAL" |
| Schema | `drizzle/schema.ts` — `recipeCopackerShares`, `copackerInventoryUpdates`, `copackerInventoryUpdateItems`, `copackerInvoices`, `copackerInvoiceItems`, `copackerShippingDocuments` |
| Tests | `server/portal.test.ts` → `copackerPortal` describe blocks |

## Known gaps & gotchas

- **Discoverability:** no sidebar/nav entry — share the `/portal/copacker` URL directly.
- **`UI_MISSING_FEATURES.md` lists several copacker mutations as "missing" — these are
  false positives.** The page wires them through `(trpc.copackerPortal as any).createInventoryUpdate`
  casts (see `CopackerPortal.tsx:158–197`), which defeats the static detector that builds
  that report. The buttons exist and work; the `as any` casts are a client-type lag, not a
  missing feature.
- **Test coverage** covers customs-clearance access, inventory scoping, and the biweekly
  update create/submit lifecycle. Invoice submission, AI invoice upload, recipe sharing, and
  shipping-document upload are not yet covered by unit tests.
