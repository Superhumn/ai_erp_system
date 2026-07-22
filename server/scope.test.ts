import { describe, it, expect, vi } from "vitest";
import { resolveScope, scopeCompanyIds, type ScopeLookup } from "./_core/scope";

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
