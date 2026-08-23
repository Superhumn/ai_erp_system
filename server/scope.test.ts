import { describe, it, expect, vi } from "vitest";
import {
  resolveScope,
  resolveScopeFromAccess,
  scopeAllows,
  scopeCompanyIds,
  type AccessScopeLookup,
  type ScopeLookup,
} from "./_core/scope";

// A user in region 1 (companies 10, 11); a lone company 20 in region 2.
const lookup: ScopeLookup = {
  getCompanyRegionId: async (companyId) =>
    companyId === 10 || companyId === 11 ? 1 : companyId === 20 ? 2 : null,
  getCompanyIdsInRegion: async (regionId) => (regionId === 1 ? [10, 11] : regionId === 2 ? [20] : []),
};

describe("resolveScope", () => {
  it("global users see everything", async () => {
    const scope = await resolveScope({ companyId: 10, regionScope: "global" }, lookup);
    expect(scope).toEqual({ mode: "global", companyIds: "all" });
  });

  it("global users see everything even with no home entity", async () => {
    const scope = await resolveScope({ companyId: null, regionScope: "global" }, lookup);
    expect(scope.companyIds).toBe("all");
  });

  it("treats an unset regionScope as global (legacy/pre-migration users keep full access)", async () => {
    expect((await resolveScope({ companyId: 10, regionScope: undefined }, lookup)).companyIds).toBe("all");
    expect((await resolveScope({ companyId: null, regionScope: null }, lookup)).companyIds).toBe("all");
  });

  it("entity users see only their home entity", async () => {
    const scope = await resolveScope({ companyId: 10, regionScope: "entity" }, lookup);
    expect(scope).toEqual({ mode: "entity", companyIds: [10] });
  });

  it("region users see all sibling entities in their region", async () => {
    const scope = await resolveScope({ companyId: 10, regionScope: "region" }, lookup);
    expect(scope.mode).toBe("region");
    expect(scope.companyIds).toEqual([10, 11]);
  });

  it("region users do NOT see entities in other regions", async () => {
    const scope = await resolveScope({ companyId: 10, regionScope: "region" }, lookup);
    expect(scope.companyIds).not.toContain(20);
  });

  it("region user whose entity has no region falls back to just the home entity", async () => {
    const scope = await resolveScope({ companyId: 99, regionScope: "region" }, lookup);
    expect(scope.companyIds).toEqual([99]);
  });

  it("fails closed: non-global user with no home entity sees nothing", async () => {
    const entity = await resolveScope({ companyId: null, regionScope: "entity" }, lookup);
    expect(entity.companyIds).toEqual([]);
    const region = await resolveScope({ companyId: undefined, regionScope: "region" }, lookup);
    expect(region.companyIds).toEqual([]);
  });

  it("does not hit region lookups for entity/global scopes", async () => {
    const spy = vi.fn(lookup.getCompanyIdsInRegion);
    await resolveScope({ companyId: 10, regionScope: "entity" }, { ...lookup, getCompanyIdsInRegion: spy });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("scopeCompanyIds", () => {
  it("returns null (unrestricted) for global", () => {
    expect(scopeCompanyIds({ mode: "global", companyIds: "all" })).toBeNull();
  });

  it("returns the allow-list for scoped users", () => {
    expect(scopeCompanyIds({ mode: "entity", companyIds: [10] })).toEqual([10]);
  });

  it("returns an empty allow-list (not null) for a scoped user with no entities", () => {
    // Critical: [] must NOT collapse to null, or a no-scope user would see everything.
    expect(scopeCompanyIds({ mode: "entity", companyIds: [] })).toEqual([]);
  });
});

describe("scopeAllows (by-id visibility)", () => {
  const entity: Parameters<typeof scopeAllows>[0] = { mode: "entity", companyIds: [10, 11] };

  it("global scope allows any record", () => {
    expect(scopeAllows({ mode: "global", companyIds: "all" }, 999)).toBe(true);
    expect(scopeAllows({ mode: "global", companyIds: "all" }, null)).toBe(true);
  });

  it("allows records within the entity allow-list", () => {
    expect(scopeAllows(entity, 10)).toBe(true);
    expect(scopeAllows(entity, 11)).toBe(true);
  });

  it("denies records outside the allow-list or with no company", () => {
    expect(scopeAllows(entity, 20)).toBe(false);
    expect(scopeAllows(entity, null)).toBe(false);
    expect(scopeAllows(entity, undefined)).toBe(false);
  });
});

describe("resolveScopeFromAccess (multi-entity, STEP 3)", () => {
  // Entity tree: GLOBAL(1) → US(2) → US_WEST(5); GLOBAL(1) → SA(3), IN(4).
  const descendants: Record<number, number[]> = {
    1: [1, 2, 3, 4, 5], // GLOBAL (holdco) reaches everything
    2: [2, 5], // US + its sub-entity
    3: [3], // SA
    4: [4], // IN (India)
    5: [5], // US_WEST
  };
  const accessLookup: AccessScopeLookup = {
    ...lookup,
    getEntityAndDescendants: async (id) => descendants[id] ?? [id],
  };

  it("a US-scoped user CANNOT see an India row", async () => {
    const scope = await resolveScopeFromAccess({ companyId: 2, regionScope: "entity" }, [2], accessLookup);
    expect(scope.companyIds).toEqual([2, 5]); // US + US_WEST
    expect(scopeAllows(scope, 4)).toBe(false); // India(4) is invisible
    expect(scopeAllows(scope, 3)).toBe(false); // Saudi(3) too
    expect(scopeAllows(scope, 2)).toBe(true); // own US row visible
  });

  it("a multi-entity user sees the union of their entities' subtrees", async () => {
    const scope = await resolveScopeFromAccess({ companyId: 2, regionScope: "entity" }, [2, 4], accessLookup);
    expect(scope.companyIds).toEqual([2, 4, 5]); // US + US_WEST + India
    expect(scopeAllows(scope, 4)).toBe(true);
    expect(scopeAllows(scope, 3)).toBe(false); // still not Saudi
  });

  it("access to GLOBAL (holdco) reaches every operating company", async () => {
    const scope = await resolveScopeFromAccess({ companyId: 1, regionScope: "entity" }, [1], accessLookup);
    expect(scope.companyIds).toEqual([1, 2, 3, 4, 5]);
  });

  it("exec (regionScope global) sees everything regardless of access rows", async () => {
    const scope = await resolveScopeFromAccess({ companyId: 2, regionScope: "global" }, [2], accessLookup);
    expect(scope.companyIds).toBe("all");
  });

  it("no access rows → falls back to legacy single-home resolution", async () => {
    // regionScope 'region', home company 10 (region 1 = [10,11]) — the pre-STEP-3 path.
    const scope = await resolveScopeFromAccess({ companyId: 10, regionScope: "region" }, [], accessLookup);
    expect(scope.companyIds).toEqual([10, 11]);
  });

  it("fails closed: non-global user with no access rows and no home entity sees nothing", async () => {
    const scope = await resolveScopeFromAccess({ companyId: null, regionScope: "entity" }, [], accessLookup);
    expect(scope.companyIds).toEqual([]);
  });
});
