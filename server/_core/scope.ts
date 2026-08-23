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

// Discriminated union so illegal states are unrepresentable: only global scope may be "all",
// and entity/region scopes always carry a concrete allow-list. This prevents a
// `{ mode: "entity", companyIds: "all" }` mistake from silently bypassing scoping.
export type Scope =
  | { mode: "global"; companyIds: "all" }
  | { mode: "entity" | "region"; companyIds: number[] };

export interface ScopeLookup {
  /** Region id of a company, or null/undefined if it has no region. */
  getCompanyRegionId: (companyId: number) => Promise<number | null | undefined>;
  /** All company ids in a region. */
  getCompanyIdsInRegion: (regionId: number) => Promise<number[]>;
}

export interface AccessScopeLookup extends ScopeLookup {
  /** A company plus all of its descendants (via the entity_tree view). */
  getEntityAndDescendants: (companyId: number) => Promise<number[]>;
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
 * Multi-entity resolution (STEP 3). A user may belong to several entities via `user_entity_access`.
 * The permitted set is the union of each access entity expanded to its descendants — so access to
 * GLOBAL (the holdco) reaches every operating company, and access to a region parent reaches its
 * children. Precedence:
 *   1. regionScope "global" (or unset) → exec/consolidation, sees everything.
 *   2. explicit access rows → union of their entity subtrees.
 *   3. no access rows → fall back to the legacy single-home `resolveScope` (backward compatible).
 * Fails closed: a non-global user with neither access rows nor a home entity sees nothing.
 */
export async function resolveScopeFromAccess(
  user: { companyId: number | null | undefined; regionScope: ScopeMode | null | undefined },
  accessEntityIds: number[],
  lookup: AccessScopeLookup,
): Promise<Scope> {
  if (user.regionScope == null || user.regionScope === "global") {
    return { mode: "global", companyIds: "all" };
  }
  if (accessEntityIds.length > 0) {
    const set = new Set<number>();
    for (const id of accessEntityIds) {
      for (const descendant of await lookup.getEntityAndDescendants(id)) set.add(descendant);
    }
    return { mode: "entity", companyIds: [...set].sort((a, b) => a - b) };
  }
  return resolveScope(user, lookup);
}

/**
 * Company-id allow-list for a WHERE clause, or null for unrestricted (global) access.
 * A scoped user with an empty allow-list yields `[]` — callers must treat that as "no rows".
 */
export function scopeCompanyIds(scope: Scope): number[] | null {
  return scope.companyIds === "all" ? null : scope.companyIds;
}

/**
 * Whether a single record belonging to `companyId` is visible under `scope`.
 * Used for by-id reads: a record outside scope (or with no company) should be treated as
 * not found. Global scope sees everything.
 */
export function scopeAllows(scope: Scope, companyId: number | null | undefined): boolean {
  if (scope.companyIds === "all") return true;
  return companyId != null && scope.companyIds.includes(companyId);
}
