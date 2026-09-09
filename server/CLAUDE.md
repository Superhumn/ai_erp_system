# server/ — backend

Express 4 + tRPC 11 + Drizzle (MySQL). Entry: `_core/index.ts`. Live router: `routers.ts` (root CLAUDE.md covers the legacy-file rules — read those first).

## What lives where

| Path | Role | Rule |
|---|---|---|
| `routers.ts` | The live `appRouter` (`L891`, ~128 top-level keys). | New routes go here, in the feature's section. Find it via `ROUTERS_INDEX.md`. |
| `db.ts` | Live DB helpers, grouped by `// ====` banner (USER MANAGEMENT, COMPANY MANAGEMENT, …). | New helpers go under the matching banner. Find it via `DB_INDEX.md`. |
| `*Service.ts` (flat, ~80 files) | Feature logic: `fxService`, `textToPOService`, `vendorNegotiationService`, `ediService`, … | One file per feature. `routers.ts` imports named functions from them (47 imports today). Put logic here, keep `routers.ts` procedures thin. |
| `*.test.ts` (flat, 95 files) | Vitest, colocated with the service they test. | Every new service gets a sibling `.test.ts`. |
| `_core/` | Infra only: auth, env, LLM, email, OAuth, storage integrations. | Never feature logic. See `_core/CLAUDE.md`. |
| `agent/` | Autonomous agent loop (`loop.ts`, `tools/`, `memory/`, `prompts/`). Exposes `agentRouter` + `triggerAgent`. | |
| `routers/`, `db/` | Extracted trees. **Unwired** except `routers/middleware.ts` (role procedures, `getValidGoogleToken`, `createAuditLog`) and the `db/*` files listed in `DB_INDEX.md` as imported directly. | Adding here alone = dead code. |
| `migrate.ts` | Production migration runner (`pnpm db:migrate` → `dist/migrate.js`). | |

## Procedures

From `_core/trpc.ts`: `publicProcedure`, `protectedProcedure` (`ctx.user` non-null), `adminProcedure`.
From `routers/middleware.ts`: `financeProcedure`, `opsProcedure`, `legalProcedure`, `copackerProcedure`, `vendorProcedure`, `plantProcedure`, `procurementProcedure`.

Default to `protectedProcedure` (86 of 95 uses in `routers.ts`). `publicProcedure` only for login/health. Role procedures for role-gated sidebar sections (root CLAUDE.md table).

## Multi-entity scope

Every business row carries `companyId` (or `ownerCompanyId`). `server/entity-scope.test.ts` fails CI when a new table lacks it and isn't in `drizzle/entity-scope-exempt.txt`. Filter reads with `resolveScope` / `scopeAllows` / `scopeCompanyIds` from `_core/scope.ts`. Plan + rules: `docs/MULTI_REGION_PLAN.md`, `docs/MULTI_REGION_PHASE_1_2_SPEC.md`.

## Money

`fxService.ts`: rows store `amount_txn` / `amount_func` / `amount_group` plus `fx_rate_used` frozen at the transaction date. Historical rows are never recomputed. Group currency is USD.

## Outbound fetches

Two guards, pick the right one:
- `attachmentUrl.ts` — fetching **our own** storage (allowlist of known hosts + `data:`).
- `webFetchGuard.ts` — fetching a **third-party** URL from user-supplied text (blocks private IPs, pins DNS, re-checks redirects, caps size/time).

Never call `fetch()` on a URL that came from a DB column or request body without one of these.

## LLM output

`response_format: json_schema` is a hint only. Parse model output with `llmJson.ts` (`parse…` returns `null` on miss) — never bare `JSON.parse`.

## Startup side effects (`_core/index.ts`)

Boot runs migrations, then starts `emailQueueWorker`, `supplyChainOrchestrator`, `aiAgentScheduler`. A new background worker registers there and must be idempotent across restarts.

## Tests

- `vitest.workspace.ts`: server tests run in `node`, client tests in `jsdom`.
- Mock the DB at module level: `vi.mock("./db", () => ({ getVendors: vi.fn(), … }))` (20 tests do this). No live MySQL in unit tests.
- Pure helpers (`pickRate`, `isDiskFullMigrationError`) get direct tests with no mocks. Write new logic as pure functions first so it can be tested that way.
- Run one file: `pnpm test server/fxService.test.ts`.

## Strict-mode ratchet

`.strict-baseline.json` pins per-file strict-error counts; `pnpm strict:check` fails CI if any grows. `routers.ts` has 5. New files must be strict-clean. Files in `tsconfig.strict.json` (`_core/env|trpc|context|cookies|crypto.ts`, `agent/types|logger.ts`, `db/connection.ts`, all of `shared/`) must pass `pnpm check:strict` with zero errors.
