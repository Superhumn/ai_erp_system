# Phase 1 + 2 Technical Spec — Entity Model & Region Data Scoping

**Status:** Spec for review (no code written yet)
**Scope:** The entity/region foundation (Phase 1) and the data-scoping security layer (Phase 2)
from [`MULTI_REGION_PLAN.md`](./MULTI_REGION_PLAN.md). These two land **together** because
scoping needs a `companyId` FK target to exist.
**Why first:** Today any authenticated user can read every record. `server/db.ts:557`
(`getCustomers`) returns all rows when `companyId` is omitted, and `server/routers.ts:548-549`
passes the *client-supplied* `input?.companyId`. This is a live cross-entity data-leak,
independent of internationalization.

---

## 1. Objectives & non-goals

**Objectives**
1. Model each country as a legal entity (extend `companies`) grouped into `regions`.
2. Bind every user to a home entity + a visibility scope.
3. Enforce scope **server-side** on every read (and write) so a user in Entity A cannot see
   Entity B's data, while `global`-scope users (exec/consolidation) still see everything.
4. Ship behind a backfill so existing single-entity behavior is byte-for-byte preserved until a
   second entity is created.

**Non-goals (this spec):** FX/tax/i18n (Phases 3–5), per-entity integrations (Phase 6),
UI for entity management beyond a minimal admin list.

---

## 2. Schema changes (`drizzle/schema.ts`)

> **FK convention:** the schema **mixes** two styles — ~57 plain `int("companyId")` columns
> (e.g. `quickbooksAccounts` :131, `parentCompanyId` :209) and ~20 that add
> `.references(() => companies.id)`. Crucially, the **core scoped business tables use
> `.references()`** (`customers` :253, `invoices` :325, `orders`/`inventory` :462). The new scope
> FKs below therefore adopt that core-table style and include `.references(...)` explicitly.

### 2.1 New `regions` table
```
export const regions = mysqlTable("regions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(),  // natural key; e.g. "EMEA", "APAC", "US"
  name: varchar("name", { length: 128 }).notNull(),
  baseCurrency: varchar("baseCurrency", { length: 3 }).notNull().default("USD"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
```

### 2.2 Extend `companies` (`drizzle/schema.ts:203`)
`companies` today has `country` + `taxId` but **no** `currency`/`locale`/`timezone`/`regionId`.
Add:
```
regionId: int("regionId").references(() => regions.id),    // home region
functionalCurrency: varchar("functionalCurrency", { length: 3 }).notNull().default("USD"),
locale: varchar("locale", { length: 10 }).notNull().default("en-US"),
timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
taxRegime: mysqlEnum("taxRegime", ["vat", "gst", "sales_tax", "none"]).default("none").notNull(),
```
(Defaults chosen so the backfill row is valid without manual entry.)

### 2.3 Extend `users` (`drizzle/schema.ts:9`)
```
companyId: int("companyId").references(() => companies.id),  // home entity
regionScope: mysqlEnum("regionScope", ["entity", "region", "global"]).default("entity").notNull(),
```
- `entity` — sees only their home entity.
- `region` — sees all entities sharing their home entity's `regionId`.
- `global` — sees everything (exec, consolidation, finance-group). Replaces today's implicit
  "everyone sees all."

### 2.4 Migration / backfill (`pnpm db:push` + a one-off script in `scripts/`)
1. Create one `regions` row (`code: "HQ"`, `baseCurrency: "USD"`).
2. Create/confirm a single default `companies` row (the current implicit entity), set its
   `regionId`.
3. `UPDATE users SET companyId = <default>, regionScope = 'global'` — **everyone starts
   `global`** so behavior is unchanged on day one; scopes are tightened per-user only once real
   entities exist.
4. Backfill `companyId` on existing business rows that are null → default entity (most tables
   already have the column).

> ⚠️ Add all columns/tables to `drizzle/schema.ts` and run `pnpm db:push`. Do **not** hand-write
> SQL migrations.

---

## 3. Scope resolution & enforcement

### 3.1 Context (`server/_core/context.ts`, `server/_core/sdk.ts:79`)
When loading the user, also load `companyId` + `regionScope`, then compute the visible entity
set once per request and attach it:
```
// shape (define the type once, e.g. in server/_core/context.ts)
type Scope = { mode: "entity" | "region" | "global"; companyIds: number[] | "all" };
// value attached per request:
ctx.scope = { mode: user.regionScope, companyIds: [/* visible entity ids */] };  // or "all" for global
```
- `entity` → `[user.companyId]`
- `region` → all `companies.id where regionId = <user's entity's regionId>`
- `global` → `"all"`

### 3.2 `scopedProcedure` (define it in the live monolith, not the unused middleware copy)
Add alongside the existing inline gates in `server/routers.ts` (`financeProcedure` :110,
`opsProcedure` :117, `plantProcedure` :171, `procurementProcedure` :180) — or next to
`protectedProcedure` in `server/_core/trpc.ts:29`:
```
const scopedProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.companyId && ctx.scope.mode !== "global") {
    throw new TRPCError({ code: "FORBIDDEN", message: "No entity scope" });
  }
  return next({ ctx });   // ctx.scope already computed in context
});
```
Compose with role gates where both apply (e.g. a scoped finance route).

### 3.3 DB helper contract change
Convert the **51** `getX(companyId?)` helpers (enumerated in §5) from *optional client filter*
to *required scope*:
```
// before
export async function getCustomers(companyId?: number) { ... returns ALL when omitted ... }
// after
export async function getCustomers(scope: Scope, filters?: {...}) {
  // scope.companyIds === "all"  -> no where clause (global users only)
  // otherwise                    -> where inArray(customers.companyId, scope.companyIds)
}
```
Routers pass `ctx.scope`, **never** `input.companyId`, for the security boundary. `input` may
still carry non-security filters (status, date range). The **106** list routes that currently
take `companyId: z.number().optional()` (see §5) drop that input field or repurpose it as a
`global`-only override.

---

## 4. Test plan (add `server/__tests__/scoping.test.ts` or Vitest equivalent)

1. **Isolation:** user in Entity A `entity`-scope → `getCustomers/getOrders/getInvoices` return
   only A's rows; never B's. Repeat for a representative helper per domain.
2. **Region scope:** user with `region` scope sees siblings in the same region, not other regions.
3. **Global scope:** `global` user sees all (parity with today).
4. **No-scope guard:** non-global user with null `companyId` is `FORBIDDEN`.
5. **Client-override rejected:** passing another entity's `companyId` in `input` does not widen
   results (proves scope comes from `ctx`, not input).
6. **Backfill parity:** with the single default entity + everyone `global`, every list endpoint
   returns exactly what it did pre-change (regression guard).

---

## 5. Migration surface (the audit checklist)

Concrete counts from the live monolith (2026-07-22), each reproducible via grep so they don't
silently drift:
- **~51** DB helpers take `companyId` as their **primary** scope argument —
  `grep -cE 'export async function get[A-Za-z]+\((companyId\?: number|filters\?: \{[^}]*companyId)' server/db.ts`
  (e.g. `getCustomers` :557, `getVendors` :631, `getInvoices` :817, `getOrders` :1043,
  `getInventory` :1114, `getEmployees` :1477, …). A looser `get.*companyId` scan returns **57**;
  the extra ~6 take `companyId` as a **secondary** filter (`getAccountByCode`, `getAccountByName`,
  `getEmailCredentials`, `getMaterialSupplyOverview`, …) and need the same scoping treatment — so
  **treat 57 as the audit upper bound**, not 51.
- **106** router inputs `companyId: z.number().optional()` in `server/routers.ts`
  (`grep -cE 'companyId: z\.number\(\)\.optional\(\)' server/routers.ts`).

**Process:** generate the full list with
`grep -nE "export async function get.*companyId" server/db.ts` and
`grep -nE "companyId: z\.number\(\)\.optional\(\)" server/routers.ts`, then migrate
domain-by-domain (customers → orders → invoices → inventory → …), landing each with its
isolation test. **A single missed list route leaks all data**, so this is an exhaustive audit,
not a spot-check — track it as a checklist, not a batch edit.

---

## 6. Rollout

1. Land schema + backfill (everyone `global`) — no behavior change.
2. Merge `scopedProcedure` + migrated helpers with the full test suite green.
3. In staging, create a second entity, set a test user to `entity` scope, verify isolation.
4. Only then start assigning real users to real entities in production.

---

## 7. Risks

| Risk | Mitigation |
|------|-----------|
| Missed list route leaks cross-entity data | Exhaustive §5 checklist + client-override test; consider a lint/CI check banning `protectedProcedure` on list routes that read scoped tables |
| Writes not scoped (create under wrong entity) | Also derive `companyId` from `ctx.scope` on create/update, not from input |
| Editing the orphaned tree by mistake | All changes in `server/routers.ts` / `server/db.ts`; run `pnpm index:legacy` after |
| `global` left as the default forever | Track a follow-up to tighten default to `entity` once real entities exist |
| Enum drift (`plant`/`procurement`) | Reconcile in Phase 0 first (see plan §4) so scope roles build on a clean enum |

---

## 8. Estimate

| Item | Est. |
|------|------|
| Schema + backfill script | 1 day |
| `scopedProcedure` + context scope resolution | 0.5 day |
| Migrate ~57 helpers + 106 routes (domain by domain) | 3–4 days |
| Scoping test suite | 1 day |
| **Total** | **~1 week** |
