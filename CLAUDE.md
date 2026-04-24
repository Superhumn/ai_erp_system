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
  routers/           Per-feature tRPC routers (preferred home for new routes)
  routers/index.ts   Router aggregation
  routers.ts         LEGACY (21k lines) — see warning below
  db/                Preferred home for new DB helpers
  db.ts              LEGACY (12k lines) — see warning below
shared/              Types + constants used by both client and server
drizzle/             SQL migrations + schema.ts (6.4k lines)
scripts/             One-off imports / cleanups
e2e/                 Playwright specs
docs/                Feature + integration docs
```

## Large-file warnings

Do **not** read these in full. Use one of: the generated index, `rg`/`grep`, or `Read` with `offset`/`limit`.

- `server/routers.ts` — **21,798 lines, 103 top-level routers**. See [`ROUTERS_INDEX.md`](./ROUTERS_INDEX.md) for feature → line range. New routes should go in `server/routers/<feature>.ts`.
- `server/db.ts` — **12,503 lines, 911 exports, 108 banner sections**. See [`DB_INDEX.md`](./DB_INDEX.md) for section map and per-export coverage. New helpers should go in `server/db/<feature>.ts`.
- `drizzle/schema.ts` — **6,413 lines**. Drizzle table definitions.

**Rule: for any investigation that requires scanning `server/routers.ts` or `server/db.ts` beyond a single feature's line range, delegate to an `Explore` subagent.** Keeps the main context lean and avoids accidentally pulling tens of thousands of lines into the transcript.

Regenerate both indexes with `pnpm index:legacy` after any change to either legacy file or to `server/routers/*.ts` / `server/db/*.ts`. The output is deterministic — no manual edits.

## Conventions

- **New API routes:** add a file under `server/routers/<feature>.ts` and register it in `server/routers/index.ts`.
- **New pages:** add under `client/src/pages/<feature>/`, route in `client/src/App.tsx` (wouter).
- **Cross-boundary types:** live in `shared/types.ts`.
- **DB changes:** edit `drizzle/schema.ts`, run `pnpm db:push`.
- **UI:** Tailwind utilities + Radix primitives (shadcn config in `components.json`).
- **Sidebar:** never modify `DashboardLayout.tsx`'s `getMenuGroups()` — it's the contract enforced by the tests referenced above.
