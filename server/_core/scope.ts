// Region / multi-entity data scoping.
//
// The security-critical decision — "which legal entities may this user see?" — lives here as a
// pure function so it can be unit-tested without a database. tRPC middleware (`scopedProcedure`)
// and DB helpers consume the resolved `Scope`.
//
// Scope modes:
//   - "entity" : only the user's home company
//   - "region" : every company sharing the home company's region
//   - "global" : everything (exec / consolidation; the backfill default so existing behavior is
//                preserved until real entities are assigned)

export type ScopeMode = "entity" | "region" | "global";

export type Scope = {
  mode: ScopeMode;
  /** Allow-listed company ids, or "all" for unrestricted (global) access. */
  companyIds: number[] | "all";
};

export interface ScopeLookup {
  /** Region id of a company, or null/undefined if it has no region. */
  getCompanyRegionId: (companyId: number) => Promise<number | null | undefined>;
  /** All company ids in a region. */
  getCompanyIdsInRegion: (regionId: number) => Promise<number[]>;
}

/**
 * Resolve a user's visible entity set. Fails closed: a non-global user without a home entity
 * sees nothing rather than everything.
 */
export async function resolveScope(
  user: { companyId: number | null | undefined; regionScope: ScopeMode | null | undefined },
  lookup: ScopeLookup,
): Promise<Scope> {
  // An unset regionScope (legacy rows before the migration default lands, or a user object
  // built without it) is treated as global — matching the schema default and keeping existing
  // behavior until entities are explicitly assigned.
  if (user.regionScope == null || user.regionScope === "global") {
    return { mode: "global", companyIds: "all" };
  }

  if (user.companyId == null) {
    // Non-global user with no home entity → no visibility (fail closed).
    return { mode: user.regionScope, companyIds: [] };
  }

  if (user.regionScope === "entity") {
    return { mode: "entity", companyIds: [user.companyId] };
  }

  // region scope
  const regionId = await lookup.getCompanyRegionId(user.companyId);
  if (regionId == null) {
    // Home entity has no region → fall back to just the home entity.
    return { mode: "region", companyIds: [user.companyId] };
  }
  const ids = await lookup.getCompanyIdsInRegion(regionId);
  return { mode: "region", companyIds: ids.length ? ids : [user.companyId] };
}

/**
 * Company-id allow-list for a WHERE clause, or null for unrestricted (global) access.
 * A scoped user with an empty allow-list yields `[]` — callers must treat that as "no rows".
 */
export function scopeCompanyIds(scope: Scope): number[] | null {
  return scope.companyIds === "all" ? null : scope.companyIds;
}
