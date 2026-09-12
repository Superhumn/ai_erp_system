# AI ERP System — Development Guide

## Sidebar Navigation (LOCKED)

The sidebar structure is **frozen** and enforced by `client/src/components/DashboardLayout.test.ts` (26 tests).
Do NOT reorganize, rename, reorder, or add sections without explicit product approval.
Any change to `getMenuGroups()` will fail CI.

### Canonical structure (agreed 2026-04-15)

| # | Section         | Roles                  | Items                                              |
|---|-----------------|------------------------|----------------------------------------------------|
| 1 | Command Center  | all                    | Dashboard, Projects, Email Inbox, Meetings, Messaging |
| 2 | Sales           | sales, ops, admin, exec | Orders; CRM + Marketing (sales/admin/exec only)   |
| 3 | Finance         | finance, admin, exec   | Finance, Grants, Fundraising, Investors, Data Room |
| 4 | Operations      | ops, admin, exec       | Operations, Logistics, Recipes (admin/ops), Vendors |
| 5 | People          | all                    | HR, Recruiting, Legal (legal/admin/exec)           |
| 6 | Tools           | all (items gated)      | SOPs; Code+Settings (admin); Import (admin/ops); EDI (ops) |

### Key constraints

- **AI Assistant + Approval Queue** live in the top menu bar, NOT the sidebar.
- **Support** is a panel inside Orders (customer click), not a nav item.
- **Finance** = single consolidated page (Accounts + Transactions + Reports + R&D Tax Credit).
- **Operations** = single consolidated page (Inventory + Manufacturing + Procurement).
- **Logistics** = merged Logistics + Freight.
- **Fundraising** = merged Fundraising + Campaigns.
- **Investors** = includes cap table / equity portal. Investor-role users see their own share view.
- **Recipes** restricted to admin + ops only (trade secrets).
- **Code / Settings** admin-only.
- **Equity Portal / Time Tracking** removed from sidebar (absorbed into HR and Investors respectively).

### Items that must NEVER reappear in the sidebar

`Sales & Finance`, `CRM` (as section), `Communications` (as section), `AI Assistant`,
`Approval Queue`, `Support`, `Equity Portal`, `Time Tracking`, `Inventory Mgmt`

---

## Stack

- **Frontend:** React 19 + Vite 7 + Tailwind v4 + Radix UI + wouter (routing) + TanStack Query + tRPC 11 client
- **Backend:** Express 4 + tRPC 11 + Drizzle ORM + MySQL (via `mysql2`)
- **Tests:** Vitest (unit) + Playwright (e2e)
- **Language:** TypeScript 5.9, ESM
- **Package manager:** pnpm

## Commands

| Command              | Purpose                                                       |
|----------------------|---------------------------------------------------------------|
| `pnpm dev`           | Dev server (tsx watch on `server/_core/index.ts`)             |
| `pnpm build`         | Build client (vite) + bundle server (esbuild) to `dist/`      |
| `pnpm check`         | Typecheck (`tsc --noEmit`)                                    |
| `pnpm check:strict`  | Typecheck with `tsconfig.strict.json`                         |
| `pnpm test`          | Vitest unit tests                                             |
| `pnpm test:e2e`      | Playwright e2e tests                                          |
| `pnpm db:push`       | Generate + apply Drizzle migrations                           |
| `pnpm format`        | Prettier write                                                |
| `pnpm strict:check`  | CI gate: no file's strict-error count may grow (`.strict-baseline.json`) |
| `pnpm strict:audit`  | Show current strict-error counts per file                     |
| `pnpm strict:update` | Lower the baseline after fixing strict errors                 |
| `pnpm index:legacy`  | Regenerate `DB_INDEX.md` (CI checks freshness)                |
| `pnpm audit:coverage`| List tRPC procedures with no client caller → `docs/FEATURE_COVERAGE.md` |

CI (`.github/workflows/ci.yml`) runs: `check`, `check:strict`, `strict:check`, `test`, `index:legacy:check`. Run the same five before pushing.

## Testing expectations

- 95 server unit tests (`server/**/*.test.ts`, node) + 10 client tests (`client/src/**/*.test.ts(x)`, jsdom). One Playwright smoke spec.
- New service logic in `server/` → sibling `.test.ts`. Mock `./db` at module level; no live MySQL.
- New pure helper in `client/src/lib/` → sibling `.test.ts`.
- Bug fix → a test that fails before the fix.
- New table in `drizzle/schema.ts` → `pnpm test server/entity-scope.test.ts` must pass (companyId rule).
- Any change to `server/routers/index.ts` → `pnpm exec tsx scripts/dump-trpc-paths.ts` before and after; the diff is the review.
- Run one file: `pnpm test <path>`.

## Hooks (`.claude/settings.json`)

- `PostToolUse` on Edit/Write → `.claude/hooks/regen-legacy-index.sh` regenerates `DB_INDEX.md` when `server/db.ts` or `server/db/*` change.
- `Stop` → `.claude/hooks/typecheck-on-stop.sh` runs `pnpm check` once per turn when `.ts`/`.tsx` files are dirty. A failure is fed back so the turn ends with a fix.
- Both no-op when `node_modules` is absent.

## Nested guides

Each directory below has its own `CLAUDE.md`, loaded when you work there: `server/`, `server/_core/`, `client/src/pages/`, `client/src/components/`, `drizzle/`, `shared/`, `scripts/`.

## Repo map

```
client/src/          React app
  pages/             Top-level routes + feature folders
                     (ai, autonomous, crm, edi, finance, freight, grants,
                      hr, legal, marketing, operations, ...)
  components/        Shared UI (DashboardLayout, AIChatBox, ...)
  _core/hooks/       Reusable hooks
server/              Express + tRPC backend
  _core/             Entry point, tRPC setup, infra (llm, email,
                     oauth, gmail, googleDrive, quickbooks, shopify, ...)
  routers/           LIVE tRPC router — index.ts mounts one file per
                     top-level key; _shared.ts holds leftover helpers
  db/                Extracted DB helpers — mostly unwired
  db.ts              LIVE monolith (18k lines) — see warning below
  agent/             Autonomous agent loop (tools, memory, prompts)
shared/              Types + constants used by both client and server
drizzle/             SQL migrations + schema.ts (8k lines)
scripts/             One-off imports / cleanups
e2e/                 Playwright specs
docs/                Feature + integration docs
```

## Large-file warnings

Do **not** read these in full. Use one of: the generated index, `rg`/`grep`, or `Read` with `offset`/`limit`.

- `server/db.ts` — **18.2k lines, 1,156 exports, 120 banner sections**. See [`DB_INDEX.md`](./DB_INDEX.md) for section map and per-export coverage. Still the default import target for most of the codebase.
- `drizzle/schema.ts` — **~8.3k lines, ~300 tables**. Drizzle table definitions.
- `server/routers/` — 130 files, no single large one any more, but seven are over 1k lines: `dataRoom.ts` (2.4k), `_shared.ts` (1.6k), `emailScanning.ts` (1.4k), `crm.ts` (1.3k), `aiAgent.ts`, `freight.ts`, `vendorQuotes.ts` (~1k each). `rg` for the procedure name; don't read whole files.

**Rule: for any investigation that requires scanning `server/db.ts` beyond a single feature's line range, delegate to an `Explore` subagent.** Keeps the main context lean and avoids accidentally pulling tens of thousands of lines into the transcript.

Regenerate the index with `pnpm index:legacy` after any change to `server/db.ts` or `server/db/*.ts`. The output is deterministic — no manual edits.

Because the index is generated *and* tracked, any two PRs that touch `server/db.ts` will conflict in
`DB_INDEX.md` on merge. Never hand-resolve that conflict — take either side and regenerate:

```sh
git checkout --theirs DB_INDEX.md   # or --ours; the content is discarded either way
pnpm index:legacy
git add DB_INDEX.md
```

The same applies to `drizzle/meta/_journal.json`: parallel branches all claim the next free
migration number, so the last one merged must renumber its `.sql` file and its journal entry to
sit after everything already on `main`. Migration `idx` values need not be contiguous, but `when`
must increase monotonically.

### ⚠️ `server/db/` is partial and unwired

`server/db/` looks like a finished refactor but isn't. Someone extracted ~70% of the db helpers into per-feature files and built `server/db/index.ts` to re-export them, but most callers still `import * as db from "./db"` (the file). Only the `db/*` files that `DB_INDEX.md` marks as imported directly are live.

Implications:

- **Adding a helper to `server/db/<feature>.ts` only works if the caller imports from `server/db/<feature>` directly.** If the caller uses `import * as db from "./db"`, the helper is invisible. Default: add helpers to `server/db.ts` in the matching banner section.
- The legacy-only exports listed in the index quantify the gap.

`server/routers.ts` had the same shape and was retired by splitting the live monolith one-file-per-key into `server/routers/` (`scripts/split-legacy-router.mjs`, verified by `scripts/dump-trpc-paths.ts` parity). `server/db.ts` is next.

## Conventions

- **New API routes:** add the procedure to the matching `server/routers/<key>.ts`. New top-level key → new `server/routers/<key>.ts` exporting `<key>Router` + one line in `server/routers/index.ts`. Never add to `server/routers/_shared.ts`.
- **New DB helpers:** add to `server/db.ts` in the matching banner section (see [`DB_INDEX.md`](./DB_INDEX.md)). Same caveat for `server/db/<feature>.ts`.
- **New pages:** add under `client/src/pages/<feature>/`, route in `client/src/App.tsx` (wouter).
- **Cross-boundary types:** live in `shared/types.ts`.
- **DB changes:** edit `drizzle/schema.ts`, run `pnpm db:push`.
- **UI:** Tailwind utilities + Radix primitives (shadcn config in `components.json`).
- **Sidebar:** never modify `DashboardLayout.tsx`'s `getMenuGroups()` — it's the contract enforced by the tests referenced above.
