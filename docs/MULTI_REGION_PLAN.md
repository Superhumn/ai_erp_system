# Multi-Region / Multi-Country Setup — Implementation Plan

**Status:** Proposal (for review before implementation)
**Operating model:** Separate legal entities per country, with consolidated global reporting
**Author:** Engineering
**Date:** 2026-07-22

---

## 1. Goal

We are launching in multiple countries. Each country is (or will be) its **own legal
entity** — a subsidiary/branch with its own currency, tax registration, statutory books,
and local compliance — but leadership needs a **single consolidated view** across all of
them (global P&L, cross-region inventory, one login).

The system today is **single-tenant with a flat, global data model**: every authenticated
user can query every record, everything defaults to USD, and there is no tax-jurisdiction
or FX concept. This plan closes that gap **without** splitting into separate ERP instances
per country — one system, region-scoped data, consolidation on top.

### Non-goals (for this phase)
- Separate database/instance per country (rejected — kills consolidation, re-keys everything).
- Full UI translation / RTL (deferred to Phase 5 — build the seam, defer the content).
- Country-specific statutory report formats beyond tax registration/rates.

---

## 2. Current state (grounded in the codebase)

| Area | State today | Key references |
|------|-------------|----------------|
| Legal entity | `companies` already models `parent`/`subsidiary`/`branch` + `parentCompanyId`, with `country`, `currency`, `taxId` | `drizzle/schema.ts:203` |
| Data scoping | **None.** Any logged-in user sees all rows. `getCustomers` returns every row when `companyId` is omitted, and the router passes the *client-supplied* `input?.companyId` — scope is never derived from the user | Live monolith: `server/db.ts:557` (`getCustomers`), `:1043` (`getOrders`); `server/routers.ts:548-549` |
| User identity | `users` has **no** `companyId`/`region`/`locale` | `drizzle/schema.ts:9` |
| Roles | Single enum: `user, admin, finance, ops, legal, exec, sales, copacker, vendor, contractor, investor`. `plant`/`procurement` appear **only** in the orphaned `server/routers/middleware.ts:51,59` — the live monolith and the enum don't include them | `drizzle/schema.ts:15` |
| AuthZ | Role-gate only, no scope injection. Base procedures in `server/_core/trpc.ts:29,31`; role gates defined **inline in the live monolith** (`server/routers.ts:110` `financeProcedure`, `:117` `opsProcedure`). The `server/routers/middleware.ts` copy is part of the orphaned tree | `server/_core/trpc.ts:29`; `server/routers.ts:110,117` |
| Currency | Per-row `varchar(3) default("USD")` on ~30 tables. **No FX/exchange-rate table, no functional/reporting currency.** `customers`/`vendors` have no currency at all | `drizzle/schema.ts:291,315,337,372,395,433` |
| Tax | Scalar `taxRate`/`taxAmount` per line. **No jurisdiction/rate registry, no VAT/GST typing.** Best existing shape is `product_price_tiers.taxMode` (inclusive/exclusive/exempt) | `drizzle/schema.ts:7247` |
| Addresses | Denormalized inline columns; inconsistent (`varchar(64)` names in core tables vs ISO `varchar(8)` in newer ones). `orders` addresses are unstructured `text` | `drizzle/schema.ts:426`, various |
| Formatting | `Intl` locked to `en-US`/USD; `formatCurrency` ignores per-record currency | `client/src/lib/format.ts` |
| i18n | No framework. 100% hardcoded English | `package.json`, `client/src` |
| Multi-country engine | Holiday + timezone support for US/IN/ZA/CO already exists | `server/_core/businessDays.ts:18` |
| Region-sensitive integrations | Shopify (multi-store) ✅, QuickBooks (multi-realm) ✅, SeaRates freight (international) ✅, **Mercury banking (US-only, single token)** ⚠️, **R&D tax credit = IRS Form 6765 (US-only)** ⚠️ | `server/mercuryService.ts`; `server/rdTaxCreditService.ts` |

**Takeaway:** the *domain* layer is partly region-aware already; the gap is the
*identity/scoping* layer plus FX and tax registries.

> ⚠️ **Repo caveat (from `CLAUDE.md`):** `server/routers/` and `server/db/` are **orphaned
> extracted trees** — nothing imports `server/routers/index.ts`. New routes go in
> `server/routers.ts`; new DB helpers go in `server/db.ts` (matching banner section).
> Adding to the extracted tree alone produces dead code that typechecks but never runs.

---

## 3. Target architecture

Region-awareness is built as **five layers**, each independently shippable:

```
┌─────────────────────────────────────────────────────────────┐
│ 5. Locale / i18n     locale-aware formatting → i18n framework │
├─────────────────────────────────────────────────────────────┤
│ 4. Tax               tax_jurisdictions + tax_rates registry   │
├─────────────────────────────────────────────────────────────┤
│ 3. Currency          fx_rates + functional/reporting currency │
├─────────────────────────────────────────────────────────────┤
│ 2. Identity+Scoping  user→entity binding + scopedProcedure    │  ← security fix
├─────────────────────────────────────────────────────────────┤
│ 1. Entity/Region     extend `companies` = legal entity model  │  ← foundation
└─────────────────────────────────────────────────────────────┘
```

**Core model:** one `region` groups one-or-more legal `companies` (entities). A user is
bound to one home entity (+ optional cross-region visibility for exec/global roles).
Every business record already carries `companyId`; we make it **mandatory and
server-derived** instead of an optional client filter.

---

## 4. Phased plan

Recommended order: **0 → 1 + 2 (together) → 3 → 4 → 5**. Phase 2 (scoping) is the priority
because it closes a live data-leak, but it needs the entity model (a `companyId` FK target) to
exist first — and Phase 1 is tiny (extend `companies`). So land **1 and 2 as a pair**, doing the
minimal entity work needed to unblock scoping. The dependency table in §8 reflects this
(Phase 2 depends on 0 and 1).

### Phase 0 — Reconciliation & guardrails (0.5 day)
Small cleanups that unblock the rest and prevent enum drift.

- Reconcile the `plant`/`procurement` role drift: these roles are referenced **only** in the
  orphaned `server/routers/middleware.ts:51,59` — the live monolith (`server/routers.ts`) and
  the `users` enum don't use them. Decide whether they're real (add to the enum at
  `drizzle/schema.ts:15` + the `teamInvitations` copy at `:67`, and wire live procedures) or
  dead (drop them) so region-based roles don't inherit the inconsistency.
- Decide canonical country encoding: **ISO 3166-1 alpha-2** everywhere (newer tables already
  do this). Add a `shared/regions.ts` constant with the launch countries + ISO codes,
  currency, default locale, and timezone.
- Confirm `pnpm index:legacy` is run after any `routers.ts`/`db.ts` edits.

### Phase 1 — Entity / region model (1–2 days)
The legal-entity foundation. Reuse `companies`; add a light `regions` grouping.

- **Schema (`drizzle/schema.ts`):**
  - Extend `companies` with: `functionalCurrency varchar(3)`, `locale varchar(10)`,
    `timezone varchar(64)`, `regionId` (FK → new `regions`), `taxRegime` enum
    (`vat`/`gst`/`sales_tax`/`none`). (`companies` already has `country`, `currency`, `taxId`.)
  - New `regions` table: `id`, `code` (e.g. `EMEA`, `APAC`, or per-country), `name`,
    `baseCurrency`, `status`. Generalizes the module-scoped `pmMarkets` (`:7115`).
  - New `entity_tax_registrations` table (used in Phase 4): `companyId`, `country`,
    `regime`, `registrationNumber`, `effectiveFrom`.
- **DB helpers (`server/db.ts`, companies section):** `getRegions()`, `getEntitiesByRegion()`,
  extend `getCompanyStructure` to include currency/locale.
- **Router (`server/routers.ts`, companies section ~L478):** `regions.list`, `entities.list`,
  `entities.update` (admin-only).
- **Migration:** backfill existing data into a single default "home" entity + region so nothing
  is orphaned. `pnpm db:push`.

### Phase 2 — Identity + data scoping (3–5 days) ⟵ highest priority
Turns `companyId` from an optional filter into an enforced security boundary.

- **Schema:** add `companyId` (FK → `companies`) and optional `regionScope` enum
  (`entity`/`region`/`global`) to `users` (`drizzle/schema.ts:9`). `global` = exec/consolidation.
- **Context:** load `companyId`/`regionScope` into `ctx.user` in
  `server/_core/context.ts` / `sdk.ts:79`.
- **New procedure (in the live monolith):** add `scopedProcedure` alongside the existing inline
  role gates in `server/routers.ts` (`financeProcedure` :110, `opsProcedure` :117) — or next to
  `protectedProcedure` in `server/_core/trpc.ts:29`. It resolves the caller's visible `companyId`
  set (self, region siblings, or all) and exposes it as `ctx.scope.companyIds`. **Not** the
  orphaned `server/routers/middleware.ts`, which the live tree doesn't import.
- **DB helpers:** change the ~40 `getX(companyId?)` signatures in the live monolith
  (`server/db.ts:557` `getCustomers`, `:1043` `getOrders`, and siblings) so scope is
  **required**; queries `WHERE companyId IN (...)`.
  Audit every `protectedProcedure` list route — a missed call site leaks all data.
- **Tests:** add a scoping test suite — user in Entity A must not see Entity B's
  orders/customers/invoices; a `global` user sees both.
- **Rollout:** ship behind the default single-entity backfill so existing behavior is
  preserved until entities are actually created.

### Phase 3 — Multi-currency & FX (3–4 days)
Enable mixed-currency consolidation.

- **Schema:**
  - New `fx_rates`: `baseCurrency`, `quoteCurrency`, `rate decimal(18,8)`, `asOf`, `source`.
  - Add `currency` to `customers` (`:224`) and `vendors` (`:251`) — currently missing.
  - Add `reportingCurrency` on `regions`/`companies` and a single global consolidation currency
    (company-settings; see below).
  - Fix zero-decimal/high-precision currencies: money columns are all `decimal(_,2)` — add a
    currency-precision helper rather than assuming 2 dp (JPY, KWD, etc.).
- **Service (`server/_core/`):** `fxService` — fetch/store daily rates, `convert(amount, from,
  to, asOf)`. Consolidation reports convert local → reporting currency at period rate.
- **DB/Router:** consolidated finance queries sum in reporting currency; keep native amounts
  for statutory/local views.

### Phase 4 — Tax jurisdiction registry (4–6 days)
Replace scalar tax rates with a real registry.

- **Schema:**
  - New `tax_jurisdictions`: `country`, `region`, `regime` (`vat`/`gst`/`sales_tax`), `name`.
  - New `tax_rates`: `jurisdictionId`, `category` (standard/reduced/zero/exempt), `rate`,
    `effectiveFrom`/`effectiveTo`.
  - Promote `product_price_tiers.taxMode` (`inclusive`/`exclusive`/`exempt`, `:7247`) out of the
    price-book module into a shared concept on order/invoice lines.
  - `entity_tax_registrations` (from Phase 1) links entities to the jurisdictions they're
    registered in.
- **Service:** `taxService.resolveRate({ country, category, date })` + place-of-supply helper
  (destination vs origin) for cross-border. Reverse-charge flag for B2B intra-EU.
- **Router/UI:** tax settings page per entity; order/invoice tax calc calls the registry
  instead of the free-text `taxRate` column.

### Phase 5 — Locale / i18n (2–3 days seam; content ongoing)
Build the formatting seam now; defer translation content until a non-English market is real.

- **Formatting:** rewrite `client/src/lib/format.ts` and the duplicate in
  `client/src/pages/InvestorPortal.tsx:18` + `server/_core/invoicePdf.ts:66` to take
  `{ locale, currency }` (from the record's entity / the user's locale) instead of hardcoding
  `en-US`/USD. This alone fixes wrong currency symbols on multi-currency data.
- **Dates:** replace bare `toLocaleDateString()` calls with a locale-aware helper.
- **i18n framework:** add `react-i18next`, wrap the app, extract strings to a catalog. Start
  English-only; add locales per market on demand. (494 `toLocale*` calls across 109 files —
  do this incrementally, highest-traffic pages first.)

### Phase 6 — Region-sensitive integrations (scoped per market)
- **Banking:** Mercury is US-only/single-token (`server/mercuryService.ts:11`). For non-US
  entities, add a per-entity banking connection model (like Shopify/QuickBooks already do) and
  a local banking provider (e.g. Wise/Airwallex) per region. **No global card gateway exists
  today** (no Stripe) — add if selling online abroad.
- **Tax module:** `rdTaxCreditService.ts` (IRS Form 6765) is US-federal only — gate it to US
  entities and add local equivalents (e.g. UK R&D relief, SR&ED) as separate services rather
  than generalizing 6765.
- **EDI:** X12 is North-American; non-US trading partners may need EDIFACT — review per partner.
- **QuickBooks/Shopify:** already multi-realm/multi-store — wire each entity to its own
  connection.

---

## 5. Migration & rollout strategy

1. **Backfill-safe:** Phases 0–1 create a single default entity/region and assign all existing
   records + users to it. Behavior is identical to today until a second entity exists.
2. **Scoping is the risky change** — ship Phase 2 behind the single-entity backfill, with the
   scoping test suite green, then create the first real second entity in staging and verify
   isolation before production.
3. **Per-country onboarding checklist** (repeatable once the platform is ready): create entity →
   set currency/locale/timezone/tax regime → add tax registration + rates → connect
   banking/QuickBooks/Shopify → assign users.
4. **Consolidation** goes live with Phase 3 (FX) — until then, per-entity reporting only.

---

## 6. Risks & watch-items

- **Data-leak during Phase 2 cutover** — any `protectedProcedure` list route not migrated to
  `scopedProcedure` leaks cross-entity data. Requires an exhaustive audit, not spot checks.
- **Orphaned extracted trees** — must edit `server/routers.ts` / `server/db.ts`, not the
  `server/routers/*` / `server/db/*` files (per `CLAUDE.md`).
- **Sidebar is frozen** (`DashboardLayout.test.ts`, 26 tests) — any new region/entity nav must
  fit the existing structure or get explicit product approval; don't touch `getMenuGroups()`.
- **Currency precision** — assuming 2 decimals breaks JPY/KWD/etc.
- **Mixed-currency totals today** silently sum different currencies — do not expose consolidated
  totals until FX (Phase 3) lands.

---

## 7. Open questions for product/finance

1. Which countries are in the **first wave**, and which are full subsidiaries vs. branches?
2. What is the **global consolidation currency** (USD? EUR?) and reporting calendar?
3. Do any target countries impose **data-residency** requirements that would force a separate
   instance (revisiting the single-system decision)?
4. Which markets need **local payment/banking** on day one vs. later?
5. Priority order of markets for **UI translation** (drives Phase 5 content).

---

## 8. Rough sequencing

| Phase | Scope | Est. | Depends on |
|-------|-------|------|-----------|
| 0 | Reconciliation & constants | 0.5d | — |
| 1 | Entity/region model | 1–2d | 0 |
| 2 | Identity + scoping (security) | 3–5d | 0, 1 |
| 3 | Currency & FX | 3–4d | 1 |
| 4 | Tax registry | 4–6d | 1 |
| 5 | Locale/i18n seam | 2–3d | 1, 3 |
| 6 | Regional integrations | per-market | 1, 2 |

Phases 1+2 are the unlock and land together (Phase 2 depends on Phase 1); 3+4 are the
compliance heavy-lifts; 5+6 are incremental per market.
