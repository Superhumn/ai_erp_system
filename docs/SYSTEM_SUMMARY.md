# AI ERP System — State of the System

**Prepared:** 2026-08-11 · **Branch:** `claude/system-features-summary-k6fzmk`

A developer-facing snapshot of what the system is, what it does, and what is
currently broken or outstanding. Sourced from the codebase, the docs in
`docs/`, CI config, and a live typecheck + test run.

---

## 1. What it is

An AI-powered ERP for CPG (Consumer Packaged Goods) companies, manufacturers,
and brands running complex supply chains — copackers, vendors, multi-warehouse
operations. It bundles sales, finance, operations/inventory, manufacturing,
procurement, logistics, HR, legal, CRM/fundraising, partner portals, and an AI
assistant / autonomous-workflow layer into one app.

## 2. Tech stack & scale

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Tailwind v4, Radix UI, wouter, TanStack Query, tRPC 11 client |
| Backend | Express 4, tRPC 11, Drizzle ORM, MySQL (`mysql2`) |
| Language | TypeScript 5.9.3, ESM |
| Tests | Vitest (unit), Playwright (e2e) |
| Auth | OAuth 2.0 (Google/Apple/Microsoft/GitHub) + JWT sessions |
| Package manager | pnpm |

**Scale (measured):**

- **207** page components across ~20 feature folders
- **123** top-level tRPC routers · **1,170** procedures · **945 (81%)** reached from the client
- Three legacy monoliths still live: `server/routers.ts` (**~26.5k lines**),
  `server/db.ts` (**~15.5k lines**), `drizzle/schema.ts` (**~7.8k lines**), 140+ tables
- **76** unit test files / **1,185** tests — **all passing** ✅
- e2e: a single Playwright `smoke.spec.ts`

> Note: `CLAUDE.md` / index docs cite older line counts (21.8k / 12.5k / 6.4k). The
> files have grown since; regenerate with `pnpm index:legacy`.

## 3. Feature map

Navigation is a **locked** 6-section sidebar (enforced by `DashboardLayout.test.ts`),
plus AI Assistant + Approval Queue in the top bar. The middle column below lists
the **exact, enforced sidebar item labels** from `getMenuGroups()`; the right
column lists the underlying features those items open onto (these are
capabilities/pages, **not** sidebar entries — several, like Freight and Time
Tracking, are deliberately absorbed into a parent item and banned as nav labels).

| Section | Sidebar items (canonical) | Underlying features |
|---|---|---|
| **Command Center** | Dashboard, Projects, Email Inbox, Meetings, Messaging | KPI dashboard, project/task management, inbound email triage, meeting notes, internal messaging |
| **Sales** | Orders, CRM, Marketing, CX, Sales AI *(role-gated)* | Orders & order detail, customers, invoicing, Shopify sync; CRM hub/admin; marketing (content, social posts, brand ambassadors); customer support; sales automation |
| **Finance** | Finance, Grants, Fundraising, Investors, Data Room | Consolidated Finance (accounts + transactions + reports + R&D tax credit), CFO dashboard, banking, costing/COGS, payments; grants & government tenders; fundraising campaigns; investors (cap table / equity); data rooms |
| **Operations** | Operations, Logistics, Recipes *(admin/ops)*, Vendors | Consolidated Operations (inventory + manufacturing + procurement), multi-warehouse inventory, BOM, work orders, production batches, recipes/ingredients, POs & receiving, forecasting/planning; Logistics = merged logistics + freight (carriers, RFQs, tracking, customs, FDA prior notice); vendors & supplier scoring, vendor negotiations |
| **People** | HR, Recruiting, Legal *(legal/admin/exec)* | HR hub, employees, departments, payroll, time tracking (absorbed into HR), offer letters, employee portal; recruiting; legal (contracts, disputes, cases, regulatory licenses, documents) |
| **Tools** | SOPs, Code *(admin)*, Settings *(admin)*, Import *(admin/ops)*, EDI *(ops)* | SOPs; in-app code editor; settings/integrations; data import; EDI (trading partners, transactions, insights, retailer onboarding) |

**AI / automation layer:** natural-language command bar (⌘K) for POs, invoices,
payments, work orders, inventory transfers; conversational AI assistant with 20+
tools; per-domain AI helpers (finance, HR, legal, manufacturing, projects, EDI);
autonomous supply-chain workflow engine with human-in-the-loop approvals &
exception handling.

**Partner portals:** Copacker portal, Vendor/Supplier portal, Contractor
documents, Investor portal, public Data Room views.

## 4. Integrations

QuickBooks · Shopify · Google Workspace (Drive/Gmail/Calendar) · SendGrid ·
Fireflies.ai · Twilio (voice/SMS) · IMAP inbox · Airtable · Mercury (banking) ·
EDI transports (AS2/SFTP) · Sentry · OCR document import.

Most are **config-gated**: they work when their env vars are set and fail
gracefully otherwise (see `.env.example` and `docs/BROKEN_INTEGRATIONS.md`).

---

## 5. Outstanding issues to fix

Prioritized for a developer picking this up. Severity is my assessment.

### 🔴 P0 — CI typecheck (`pnpm check`) is red on the pinned toolchain

`pnpm check` **fails** with pinned TypeScript 5.9.3:

```
tsconfig.json(20,5): error TS5101: Option 'baseUrl' is deprecated ...
  Specify compilerOption '"ignoreDeprecations": "6.0"'.
```

`tsconfig.json` sets `"ignoreDeprecations": "5.0"`, which no longer silences the
`baseUrl` deprecation in 5.9 — but bumping it to `"6.0"` is rejected (`TS5103:
Invalid value`) because 5.9 doesn't accept that value yet. `pnpm run check` is a
required CI job (`.github/workflows/ci.yml`) **and** a gate in both deploy
workflows.

**Verified fix:** remove `"baseUrl": "."` from `tsconfig.json`. The `paths`
entries are already project-relative (`./client/src/*`, `./shared/*`) and resolve
correctly under `moduleResolution: "bundler"`. With `baseUrl` removed, `pnpm
check` passes (exit 0, confirmed locally). `check:strict` already passes.

### 🔴 P0 — Critical broken integrations (`docs/BROKEN_INTEGRATIONS.md`)

- **Autonomous supply-chain workflow engine is non-functional at runtime.** 12
  tables (`supplyChainWorkflows`, `workflowRuns`, `workflowApprovalQueue`,
  `autonomousDecisions`, `exceptionRules`, `supplierPerformance`, …) were removed
  from the Drizzle schema but the code still references them via `{} as any`
  stubs. Typecheck passes; every query returns empty at runtime. Affects the
  Autonomous Dashboard, Approvals, Exceptions, and supplier-performance features.
  **Decide:** restore the tables or delete the dead code.
- **Data Room due-diligence / checklists throw at runtime.** DD templates /
  categories / items / checklist tables in `server/db/dataRoom.ts` are `null`
  stubs; any CRUD on them throws.
- **Mercury banking is only partially gated.** `MERCURY_API_TOKEN` *is* present
  in `.env.example` (line 98), and most helpers in `server/mercuryService.ts`
  (`getMercuryAccounts`, `getMercuryTransactions`) now return `{ configured:
  false }` when the token is unset, so the Banking UI can degrade cleanly. But
  `getMercuryTransactionDetail` still **throws** `"MERCURY_API_TOKEN not
  configured"` — that one path hard-errors. Make the remaining helper(s)
  consistent with the graceful-degradation pattern.

### 🟠 P1 — Known type-safety debt

- **`.strict-baseline.json` tracks 20 accepted strict-null errors** (19 in
  `server/routers.ts`, 1 in `finance/FinancialReports.tsx`). Grandfathered, not
  yet burned down.
- **AS2 EDI transport is a stub** (`ediTransportService.ts`) — HTTP POST with
  AS2-style headers but no S/MIME encryption/signing, no MDN receipts, no cert
  management. Not production-ready. SFTP transport depends on an optional
  `ssh2-sftp-client` package.

### 🟠 P1 — Architecture debt: orphaned refactor

`server/routers/` and `server/db/` look like finished per-feature refactors but
are **unwired** — nothing imports `server/routers/index.ts`; the live tree is
still the monolith (`server/routers.ts`). **Adding a route only to
`server/routers/<feature>.ts` produces dead code that tRPC never serves.** Until
it's wired, new routes go in `server/routers.ts` and new DB helpers in
`server/db.ts` (per `CLAUDE.md`). 33 legacy-only routers + 175 legacy-only db
exports quantify the gap.

### 🟡 P2 — Drizzle migration drift (issue #253)

Journal (`_journal.json`), SQL files on disk, and the live `__drizzle_migrations`
table are out of sync: duplicate migration-number prefixes, ~12 orphan files not
in the journal, 2 DB rows with no matching file. Fresh-DB replay via
`drizzle-kit migrate` is broken. **Not blocking today** because the flow uses
`pnpm db:push` (diffs `schema.ts` against the live DB directly). Cleanup is
per-migration verification, not a mechanical backfill.

### 🟡 P2 — UI capability gaps (tracked issues #268–#271)

Backend procedures with no frontend entry point: CRM admin mutations
(campaigns/tags/whatsapp status) `#268`, Shopify location mappings `#269`, R&D
tax credit QuickBooks import dialog `#270`, inventory-costing COGS summary `#271`.
Router-level coverage is otherwise healthy — 0 orphaned routers, 0 partial (see
`docs/FEATURE_COVERAGE.md`).

---

## 6. Quality snapshot

| Check | Status |
|---|---|
| `pnpm check` (typecheck) | ❌ **fails** — `baseUrl` deprecation (P0 above) |
| `pnpm check:strict` | ✅ passes |
| `pnpm test` (1,185 unit tests) | ✅ all pass |
| Sidebar contract (`DashboardLayout.test.ts`) | ✅ 47 tests pass |
| e2e coverage | ⚠️ single smoke spec only |

**Fastest path to green CI:** drop `baseUrl` from `tsconfig.json` (§5 P0). Then
triage the runtime-stubbed features (workflow engine, DD checklists, Mercury)
since those pass typecheck but fail silently or throw for users.
