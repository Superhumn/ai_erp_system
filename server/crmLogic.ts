/**
 * Pure CRM helpers — no DB, no I/O — so every rule the CRM relies on can be
 * unit-tested directly. server/crmService.ts wires these to the database and
 * server/routers/crm.ts stays thin.
 */
import { scopeAllows, scopeCompanyIds, type Scope } from "./_core/scope";

// ---------------------------------------------------------------------------
// Entity scope
// ---------------------------------------------------------------------------

export interface CrmScopeOptions {
  /**
   * Reference rows (pipelines, tags, loss reasons) with a NULL companyId are
   * shared across entities and stay visible to everyone. Business rows
   * (contacts, deals, accounts, tasks) with a NULL companyId are visible to
   * global scope only — same rule as `scopeAllows`.
   */
  sharedWhenNull?: boolean;
}

/** Whether a row owned by `companyId` is visible under `scope`. */
export function crmRowVisible(scope: Scope, companyId: number | null | undefined, opts: CrmScopeOptions = {}): boolean {
  if (scope.companyIds === "all") return true;
  if (companyId == null) return opts.sharedWhenNull === true;
  return scopeAllows(scope, companyId);
}

/** Filters rows in memory with `crmRowVisible`. */
export function filterCrmRows<T extends { companyId?: number | null }>(rows: T[], scope: Scope, opts: CrmScopeOptions = {}): T[] {
  if (scope.companyIds === "all") return rows;
  return rows.filter((r) => crmRowVisible(scope, r.companyId, opts));
}

/**
 * Company-id allow-list for a DB helper: `null` means unrestricted, `[]`
 * means "no rows" (a scoped user with no entities — callers must short-circuit).
 */
export function crmScopeCompanyIds(scope: Scope): number[] | null {
  return scopeCompanyIds(scope);
}

/** Whether a scoped list query can return nothing at all and should skip the DB. */
export function scopeIsEmpty(companyIds: number[] | null | undefined): boolean {
  return Array.isArray(companyIds) && companyIds.length === 0;
}
