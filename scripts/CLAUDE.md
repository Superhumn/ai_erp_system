# scripts/ — tooling vs. one-offs

35 files. Four are live tooling wired into `package.json` / CI. The rest are one-time imports, seeds, and cleanups — run once against one database, never as part of a feature.

## Live tooling (keep working)

| Script | Wired as | Purpose |
|---|---|---|
| `generate-legacy-indexes.mjs` | `pnpm index:legacy`, CI "Legacy Index Freshness" | Regenerates `DB_INDEX.md` from `server/db.ts`. Deterministic. |
| `strict-ratchet.mjs` | `pnpm strict:audit` / `strict:check` / `strict:update`, CI "Strict Ratchet" | Per-file strict-error baseline in `.strict-baseline.json`. |
| `dump-trpc-paths.ts` + `feature-coverage.mjs` | `pnpm audit:coverage` | Lists tRPC procedures with no client caller → `docs/FEATURE_COVERAGE.md`. |
| `entity-scope-lib.mjs` + `gen-entity-scope-exempt.mjs` | used by `server/entity-scope.test.ts` | Baseline for tables allowed to lack `companyId`. Re-run only to re-baseline deliberately. |

## Dev environment

`dev-migrate.mjs` (local-only migration apply), `ensure-tables.ts` (CREATE IF NOT EXISTS all schema tables), `cloud-db-setup.mjs`, `cloud-agent-install.sh`, `cloud-agent-start.sh` (Cloud Agent VM bootstrap), `cleanup-merged-branches.sh`.

## UI audit (regenerate `docs/UI_*.md`)

`extract-ui-inventory.mjs` → `curate-missing-features.mjs` → `find-real-missing.mjs`. Regex over `client/src/pages/`; output is a punch list, not truth.

## One-offs (historical — do not extend)

Imports: `import-sheets-data.{ts,mjs}`, `import-bom-data.ts`, `import-copackers.ts`, `import-superhumn-sa-and-india.ts`, `importCapTable.{ts,mjs}`, `import_foodservice_pricelist.mjs`, `shopify-initial-sync.cjs`.
Seeds: `seed-entities.ts`, `seedJvEntities.ts`, `seed-pm-examples.ts`, `backfill-regions.ts`, `backfill-vendor-contacts.ts`.
Cleanups: `cleanup-junk-contacts.ts`, `cleanup-non-material-items.ts`, `cleanup-malformed-meeting-notifications.ts`, `delete-all-products.ts`, `delete-fireflies-meetings.ts`.
Reports: `thread-followup-report.ts`.
Migrations: `split-legacy-router.mjs` — split the 29k-line `server/routers.ts` into `server/routers/<key>.ts` (one-shot; refuses to run now that the monolith is gone; kept so the move is reproducible on its parent commit).

## Rules

- Run TS scripts with `tsx scripts/<name>.ts`; they read `DATABASE_URL` from `.env`.
- A new one-off gets a header comment: what it does, which migration/step it follows, whether it's idempotent, and the exact command to run it (see `backfill-regions.ts`, `seed-entities.ts`).
- Anything destructive (`delete-*`, `cleanup-*`) refuses to run against non-local hosts without `--force`, like `dev-migrate.mjs` does.
- Recurring logic belongs in `server/` with a test, not here.
