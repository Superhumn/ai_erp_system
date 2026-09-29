import { describe, expect, it } from "vitest";
import type { Scope } from "./_core/scope";
import { crmRowVisible, crmScopeCompanyIds, filterCrmRows, scopeIsEmpty } from "./crmLogic";

const global: Scope = { mode: "global", companyIds: "all" };
const entity: Scope = { mode: "entity", companyIds: [2, 3] };
const empty: Scope = { mode: "entity", companyIds: [] };

describe("crmRowVisible", () => {
  it("global scope sees everything, including unassigned rows", () => {
    expect(crmRowVisible(global, 1)).toBe(true);
    expect(crmRowVisible(global, null)).toBe(true);
    expect(crmRowVisible(global, undefined)).toBe(true);
  });

  it("entity scope sees only its own companies", () => {
    expect(crmRowVisible(entity, 2)).toBe(true);
    expect(crmRowVisible(entity, 3)).toBe(true);
    expect(crmRowVisible(entity, 4)).toBe(false);
  });

  it("business rows with no company are hidden from a scoped user", () => {
    expect(crmRowVisible(entity, null)).toBe(false);
    expect(crmRowVisible(entity, undefined)).toBe(false);
  });

  it("reference rows with no company are shared when sharedWhenNull is set", () => {
    expect(crmRowVisible(entity, null, { sharedWhenNull: true })).toBe(true);
    expect(crmRowVisible(entity, 9, { sharedWhenNull: true })).toBe(false);
    expect(crmRowVisible(empty, null, { sharedWhenNull: true })).toBe(true);
  });

  it("an empty entity scope sees nothing", () => {
    expect(crmRowVisible(empty, 2)).toBe(false);
    expect(crmRowVisible(empty, null)).toBe(false);
  });
});

describe("filterCrmRows", () => {
  const rows = [{ id: 1, companyId: 2 }, { id: 2, companyId: 4 }, { id: 3, companyId: null }];
  it("returns the same array for global scope", () => {
    expect(filterCrmRows(rows, global)).toBe(rows);
  });
  it("drops rows outside the scope", () => {
    expect(filterCrmRows(rows, entity).map((r) => r.id)).toEqual([1]);
    expect(filterCrmRows(rows, entity, { sharedWhenNull: true }).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe("crmScopeCompanyIds / scopeIsEmpty", () => {
  it("null means unrestricted, [] means no rows", () => {
    expect(crmScopeCompanyIds(global)).toBeNull();
    expect(crmScopeCompanyIds(entity)).toEqual([2, 3]);
    expect(scopeIsEmpty(null)).toBe(false);
    expect(scopeIsEmpty(undefined)).toBe(false);
    expect(scopeIsEmpty([])).toBe(true);
    expect(scopeIsEmpty([1])).toBe(false);
  });
});
