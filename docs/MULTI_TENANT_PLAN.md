# Multi-Tenant Plan

Goal: sell the ERP to outside companies, up to enterprises replacing SAP / Oracle / NetSuite.

## Core decision: one database per customer

| Option | Isolation | Code change | Enterprise fit |
|---|---|---|---|
| Shared tables + `tenantId` on 305 tables | One missed `WHERE` leaks data | Touch ~1,156 db helpers | Weak |
| **Database per tenant** | Physical. A bug cannot cross customers | One seam: `getDb()` | Strong: residency, own keys, per-customer restore |

`companyId` keeps its current job: entities *inside* one customer (holdco, subsidiaries, regions).
Tenant = which database. Entity = which rows inside it.

## Architecture

```
acme.app.example.com ──► tenant middleware ──► AsyncLocalStorage { tenant }
                                                    │
                          getDb() ──► pool cache ──► acme MySQL database
```

- **Resolve** tenant from the Host header (subdomain or custom domain). Unknown host → 404. Suspended → 403.
- **Fail closed.** In multi-tenant mode `getDb()` without a tenant throws. No default database.
- **Session cookies** carry a `tid` claim. A cookie from tenant A is rejected on tenant B.
- **Migrations** run once per tenant database.
- **Background workers** run per tenant, never across tenants.
- **Single-tenant mode** (today's deployment) is unchanged while `MULTI_TENANT` is off.

## Phases

### Phase 1 — Isolation foundation (this PR)
- [x] Tenant registry (`TENANTS_JSON`), host resolution, request context.
- [x] Per-tenant connection pools behind `getDb()`, fail closed.
- [x] `tid` claim on sessions; cross-tenant cookie replay rejected.
- [x] Per-tenant startup migrations and schema checks.
- [x] Workers and env-wide integrations off in multi-tenant mode (they would mix data).

### Phase 1b — Tenant-aware workers
- Run each worker inside `forEachTenant`. Remove module-level singletons.
- Move env-wide credentials (IMAP, Mercury, Shopify) to per-tenant encrypted settings rows.
- OAuth callbacks: one central callback host, tenant carried in signed `state`.
- Webhooks: tenant resolved from the URL host, signature verified per tenant secret.

### Phase 2 — Control plane
- Separate control-plane database: tenants, domains, plans, status, region, DB credentials (encrypted).
- Self-serve signup → provision database → migrate → seed → first admin invite.
- Remove `OWNER_OPEN_ID`; each tenant has its own admins.
- Billing (Stripe): plans, seats, usage metering. Suspension on non-payment.
- Admin console: tenant list, health, migration version, impersonation with audit trail.

### Phase 3 — Security and compliance
- SSO (SAML / OIDC), SCIM user provisioning, MFA enforcement per tenant.
- Immutable audit log (append-only, hash-chained), exportable for auditors.
- Encryption: TLS everywhere, at-rest per database, per-tenant keys (BYOK) for enterprise tier.
- SOC 2 Type II, annual penetration test, vulnerability disclosure, incident runbook.
- Data residency: tenant pinned to US or EU cluster via `region` in the registry.
- Backups: point-in-time recovery, per-tenant restore, quarterly restore drills. RPO ≤ 5 min, RTO ≤ 1 h.

### Phase 4 — Enterprise ERP depth
- Ledger: strict double entry, immutable posted journals, period close and lock, reversals only.
- Multi-currency revaluation, intercompany eliminations, consolidation across entities.
- ASC 606 revenue recognition, ASC 842 leases, fixed assets, tax engine (Avalara / Vertex).
- Controls: segregation of duties rules, approval matrices, SOX evidence exports.
- Migration toolkit: SAP / Oracle / NetSuite extract templates, mapping UI, dry-run loads,
  parallel-run reconciliation reports.
- Public API: versioned REST + webhooks, API keys per tenant, rate limits per plan.

### Phase 5 — Scale
- Heavy tenants on dedicated database clusters; small tenants packed on shared servers.
- Read replicas for reports. CDC stream to a warehouse (Snowflake / BigQuery) for analytics.
- Durable job queue (BullMQ / SQS) replacing in-process timers. Horizontal app scaling.
- Load test at 10× the largest customer's volume before each enterprise go-live.
- Finish splitting `server/db.ts` so teams can work in parallel.

## Configuration (Phase 1)

| Env | Meaning |
|---|---|
| `MULTI_TENANT` | `1` enables tenant routing. Off = today's single database. |
| `TENANTS_JSON` | `[{"slug":"acme","databaseUrl":"mysql://…","hosts":["erp.acme.com"],"status":"active"}]` |
| `TENANT_BASE_DOMAIN` | e.g. `app.example.com`, so `acme.app.example.com` → `acme` |
