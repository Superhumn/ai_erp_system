# drizzle/ — schema + migrations

## Files

| Path | Role |
|---|---|
| `schema.ts` | 8k lines, ~295 `mysqlTable` definitions, grouped by `// ====` banner. Every table exports `X = typeof t.$inferSelect` / `InsertX = typeof t.$inferInsert`. |
| `relations.ts` | Drizzle `relations()` for the query builder. Update when adding FKs. |
| `NNNN_<name>.sql` + `meta/_journal.json` | Migrations applied by `drizzle-orm` `migrate()` at server boot and by `pnpm db:migrate`. 62 entries (0000–0061). |
| `meta/*_snapshot.json` | drizzle-kit snapshots. Generated. |
| `manual/*.sql`, `step*.sql` | Multi-entity rollout SQL applied by hand, outside the journal. Historical; don't add to them. |
| `entity-scope-exempt.txt` | Tables allowed to have no `companyId`. Guarded by `server/entity-scope.test.ts`. |

## Schema conventions

- Table + column names camelCase in SQL too (`mysqlTable("authTokens", { openId: varchar("openId") })`). A few legacy tables are snake_case (`user_entity_access`) — match whichever the neighbouring tables in that banner use.
- `id: int("id").autoincrement().primaryKey()`.
- `createdAt: timestamp("createdAt").defaultNow().notNull()`, `updatedAt: … .defaultNow().onUpdateNow().notNull()`.
- Enums inline: `mysqlEnum("status", ["draft", "sent"])`.
- Money: `decimal` + a currency column. Entity-scoped money also carries `amount_func`, `amount_group`, `fx_rate_used`, `fx_rate_date` (see `server/fxService.ts`).
- **Every business table gets `companyId: int("companyId")`.** Only global reference data, join/log tables, and children inheriting a parent's scope may skip it — and those go in `entity-scope-exempt.txt` with a reason in the PR.

## Migration workflow

```sh
# 1. edit schema.ts (+ relations.ts if FKs changed)
pnpm db:push            # drizzle-kit generate && drizzle-kit migrate — writes NNNN_*.sql + journal entry
pnpm test server/entity-scope.test.ts
```

- `db:push` needs `DATABASE_URL`. `db:push:direct` skips the migration file — dev only, never on a branch you'll push.
- `db:baseline` (`drizzle-kit pull`) re-introspects; use only when the DB is ahead of the schema.
- Local bootstrap without drizzle-kit: `node scripts/dev-migrate.mjs` (refuses non-local hosts without `--force`).
- Missing tables on a fresh env: `tsx scripts/ensure-tables.ts` (CREATE IF NOT EXISTS for every schema table). The SQL history is incomplete — schema has more tables than migrations create — so recent migrations (`0061`) are hand-written `CREATE TABLE IF NOT EXISTS` to backfill.

## Journal rules (`meta/_journal.json`)

- Parallel branches all claim the next free number. The **last one merged** renumbers its `.sql` and journal entry to sit after everything on `main`.
- `idx` need not be contiguous. `when` must increase monotonically — recent entries use hand-set round numbers (`1787300100000`); pick one larger than the last.
- On a journal merge conflict, keep both entries and fix ordering; never drop one.
- Never edit an applied migration. Add a new one.
- `STRICT_MIGRATIONS=1` makes a failed boot migration fatal in prod; otherwise the server logs and continues.
