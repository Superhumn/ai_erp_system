# Project Management module (`/pm`)

The PM module tracks Superhumn's international market expansion as a
**Market × Function matrix**. Every project lives at the intersection of one
market (geography) and one function (mfg / sales / legal / finance / brand),
so we always have a single view of "what's outstanding in <market>" and
"how does <function> compare across markets."

## Data model

All tables are prefixed `pm_` to namespace cleanly from the legacy `projects`
table (which the existing `/projects` page uses).

| Table             | Notes                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `pm_markets`      | Country/market. Tier 1/2/3. Seeded with ZA, IN, US, ID, CO, EU.                                    |
| `pm_functions`    | Manufacturing, Sales, Legal/Regulatory, Finance, Brand (seeded).                                   |
| `pm_programs`     | Market-level container (e.g. "South Africa market entry"). One per market, optional.               |
| `pm_projects`     | The atomic unit. Belongs to (market, function). Optionally rolls up into a program.                |
| `pm_tasks`        | Sub-units of a project. Assigned to a user, has a status/due date.                                 |
| `pm_dependencies` | (predecessor → successor) with type `blocks` / `related` / `informs`.                              |
| `pm_milestones`   | Date-pinned checkpoints for a project (target vs actual).                                          |

Key denormalization: `pm_projects.marketId` and `pm_projects.functionId` are
indexed together so the matrix view filters without joining `pm_programs`.

Cash events: a `pm_project` can carry a `cashEventAmount` + `cashEventType` +
`cashEventDate`. When the project's `status` transitions to `complete`, the
row is pushed into the existing `financial_model` table (so the runway chart
in `/finance/reports` automatically reflects it).

## API surface (`trpc.pm.*`)

| Procedure                          | Notes                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| `pm.matrix({ tier?, status? })`    | Returns `{ markets, functions, cells: [{ marketId, functionId, projects }] }`. |
| `pm.byMarket({ id? \| code? })`    | All programs + projects for one market.                               |
| `pm.byFunction({ id? \| code? })`  | All projects in one function across markets.                          |
| `pm.cockpit`                       | Blocked projects, sorted by `blockedSince` ASC (oldest first).        |
| `pm.cashForecast`                  | Cash events grouped by month + matching `financial_model` rows.       |
| `pm.owners`                        | Per-owner project counts split by status (capacity heatmap).          |
| `pm.markets.*` / `pm.functions.*`  | CRUD. Mutations are admin-only.                                       |
| `pm.programs.*`                    | CRUD. Mutations are `protectedProcedure`.                             |
| `pm.projects.*`                    | CRUD; `update` triggers workflows on status transitions.              |
| `pm.tasks.*` / `pm.milestones.*` / `pm.dependencies.*` | Project-scoped CRUD.                                |
| `pm.workflows.{blockerAlert, milestoneDue, weeklyDigest, cashForecastSync}` | Manual triggers for the autonomous workflows. |

All read procedures are `protectedProcedure`; mutations on global config
(markets/functions) require `admin`.

## UI pages

| Path                  | Page                                          |
| --------------------- | --------------------------------------------- |
| `/pm`                 | Redirects to `/pm/matrix`.                    |
| `/pm/matrix`          | The Market × Function grid (landing).         |
| `/pm/timeline`        | Lightweight Gantt, group by market or function. |
| `/pm/cockpit`         | Blocker board, sorted by days blocked DESC.   |
| `/pm/cash`            | Cash event forecast + recharts bar chart + synced `financial_model` rows. |
| `/pm/market/:code`    | Deep dive on one market.                      |
| `/pm/function/:code`  | One function across all markets.              |
| `/pm/project/:id`     | Project detail: tasks, milestones, dependencies. |
| `/pm/admin`           | Manage markets, functions, view owner capacity. |

> **Sidebar note.** The locked sidebar contract (`DashboardLayout.test.ts`)
> keeps "Projects" pointing at `/projects` (the legacy projects page). The
> PM module lives in parallel at `/pm/*`. To swap the sidebar item over,
> coordinate a sidebar-contract update in a separate PR.

## Autonomous workflows

Implemented as pure functions in `server/pmWorkflows.ts`. Two are
event-driven (called from `pm.projects.update`):

| Workflow                | Trigger                          | Effect                                                                 |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `workflow_blocker_alert`| Mon 09:00                        | Posts a Google Chat summary of projects blocked > 7 days via `GOOGLE_CHAT_OPS_WEBHOOK`. |
| `workflow_milestone_due`| Daily 08:00                      | Notifies milestone owners about milestones due within 7 days (via `notifications` table). |
| `workflow_cash_forecast_sync` | Project status → `complete` | Inserts a row into `financial_model` keyed off project name + month.   |
| `workflow_dependency_cascade` | Project status → `blocked`  | Flags all downstream (blocks-type) projects with `atRisk = true` and notifies their owners. |
| `workflow_weekly_digest`| Fri 16:00                        | Generates a matrix snapshot (intended to be uploaded to Drive — wiring marked TODO in `pmWorkflows.ts`). |

**Scheduling.** The codebase already has `autonomousWorkflowEngine.ts` /
`supplyChainOrchestrator.ts` for managed scheduling, but they are oriented
around supply-chain entities. The PM workflows currently expose manual
trigger mutations under `trpc.pm.workflows.*` for testing — wire them into
cron (e.g. a GitHub Action that calls each mutation, or `node-cron`) for
production.

## Migration & seed data

| File                                 | Notes                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `drizzle/0044_pm_module.sql`         | Creates all seven tables; seeds the 6 markets and 5 functions. Idempotent.           |
| `scripts/seed-pm-examples.ts`        | Adds one example program per Tier-1 market with 3 sample projects. Run after migrate. |

```bash
pnpm db:push                  # runs migration 0044 → creates tables, seeds markets & functions
tsx scripts/seed-pm-examples.ts  # populates example programs/projects
```

## Status transitions and side-effects

`pm.projects.update` is the only mutation that triggers workflows:

```
   not_started ──→ in_progress ──→ complete
                       │              │
                       ▼              ▼
                    blocked   pushes financial_model row
                       │
                       ▼
              flags downstream as atRisk
```

- Entering `blocked` stamps `blockedSince` and clears it on exit.
- Entering `complete` stamps `actualEndDate` (if not provided) and triggers
  `workflow_cash_forecast_sync` for any project carrying cash event fields.

## Adding a new market

1. `POST trpc.pm.markets.create` (admin) — or use `/pm/admin`.
2. Optionally create a program for the market.
3. Create projects under (market × function) — the matrix updates live.

## Where to extend next

- Wire `workflow_weekly_digest` to upload to a Drive folder (helpers in
  `server/_core/googleDrive.ts` and `server/_core/googleWorkspace.ts`).
- Hook the autonomous workflow engine: register the four scheduled workflows
  as `supplyChainWorkflows` rows so they show up in `/autonomous-dashboard`.
- The legacy `getDb`-based DB helpers live in `server/db.ts` (per
  `CLAUDE.md`). When extending PM, add helpers there, not in `server/db/`.
