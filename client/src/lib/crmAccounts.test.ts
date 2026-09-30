import { describe, expect, it } from "vitest";
import { buildAccountTree, flattenAccountTree } from "./crmAccounts";

const a = (id: number, name: string, parentAccountId: number | null = null) => ({ id, name, parentAccountId });

describe("buildAccountTree / flattenAccountTree", () => {
  it("nests children under parents, sorts by name, and orphans become roots", () => {
    const roots = buildAccountTree([
      a(1, "Springfield USD"),
      a(2, "Lincoln Elementary", 1),
      a(3, "Adams Middle", 1),
      a(4, "Sysco"),
      a(5, "Orphan School", 99),
    ]);
    expect(roots.map((r) => r.account.name)).toEqual(["Orphan School", "Springfield USD", "Sysco"]);
    const rows = flattenAccountTree(roots);
    expect(rows.map((r) => [r.node.account.id, r.depth])).toEqual([[5, 0], [1, 0], [3, 1], [2, 1], [4, 0]]);
  });

  it("hides children of collapsed accounts", () => {
    const rows = flattenAccountTree(buildAccountTree([a(1, "D"), a(2, "S", 1), a(3, "T", 2)]), new Set([2]));
    expect(rows.map((r) => r.node.account.id)).toEqual([1, 2]);
  });

  it("breaks parent cycles instead of looping", () => {
    const rows = flattenAccountTree(buildAccountTree([a(1, "A", 2), a(2, "B", 1), a(3, "Self", 3)]));
    expect(rows.map((r) => r.node.account.id).sort()).toEqual([1, 2, 3]);
  });
});
