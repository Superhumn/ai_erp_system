import { describe, it, expect } from "vitest";
import {
  computeEffectiveOwnership,
  computeInvestorGlobalOwnership,
  eliminateIntercompany,
  rollupByEntity,
  type EntityNode,
} from "./groupReporting";

describe("computeEffectiveOwnership (recursive ownership)", () => {
  it("wholly-owned subsidiaries stay 100%", () => {
    const tree: EntityNode[] = [
      { id: 1, parentCompanyId: null, ownershipPctOfParent: null }, // GLOBAL
      { id: 2, parentCompanyId: 1, ownershipPctOfParent: 100 }, // US
      { id: 3, parentCompanyId: 1, ownershipPctOfParent: 100 }, // SA
    ];
    const own = computeEffectiveOwnership(tree);
    expect(own.get(1)).toBe(100);
    expect(own.get(2)).toBe(100);
    expect(own.get(3)).toBe(100);
  });

  it("a 49/51 JV two levels deep computes the compounded effective ownership", () => {
    // GLOBAL → US (100%) → JV (51%) → subJV (49%)
    const tree: EntityNode[] = [
      { id: 1, parentCompanyId: null, ownershipPctOfParent: null }, // GLOBAL
      { id: 2, parentCompanyId: 1, ownershipPctOfParent: 100 }, // US
      { id: 3, parentCompanyId: 2, ownershipPctOfParent: 51 }, // JV (51% owned by US)
      { id: 4, parentCompanyId: 3, ownershipPctOfParent: 49 }, // subJV (49% owned by JV)
    ];
    const own = computeEffectiveOwnership(tree);
    expect(own.get(3)).toBeCloseTo(51, 6); // 100 × 51%
    expect(own.get(4)).toBeCloseTo(24.99, 6); // 100 × 51% × 49% = 24.99%
  });
});

describe("eliminateIntercompany (group P&L)", () => {
  it("cancels the internal SA→US sale/purchase pair, keeping only external flows", () => {
    const txns = [
      { id: 1, type: "invoice", amountGroup: 500 }, // US external sale to customer
      { id: 2, type: "expense", amountGroup: 200 }, // SA raw-material cost (external)
      { id: 3, type: "invoice", amountGroup: 100 }, // SA internal sale to US
      { id: 4, type: "expense", amountGroup: 100 }, // US internal purchase from SA
    ];
    const links = [{ transactionAId: 3, transactionBId: 4 }]; // the intercompany pair
    const pnl = eliminateIntercompany(txns, links);
    // External only: revenue 500, expense 200 → net 300. The internal 100/100 is eliminated.
    expect(pnl.revenueGroup).toBe(500);
    expect(pnl.expenseGroup).toBe(200);
    expect(pnl.netGroup).toBe(300);
  });

  it("with no links, nothing is eliminated", () => {
    const txns = [
      { id: 1, type: "invoice", amountGroup: 500 },
      { id: 2, type: "expense", amountGroup: 200 },
    ];
    expect(eliminateIntercompany(txns, []).netGroup).toBe(300);
  });
});

describe("computeInvestorGlobalOwnership (cap tables, STEP 6)", () => {
  it("an investor's global ownership compounds their entity stake with the group's effective %", () => {
    // GLOBAL → US(100%) → JV(51%) → subJV(49%); group effectively owns 24.99% of subJV(4).
    const tree: EntityNode[] = [
      { id: 1, parentCompanyId: null, ownershipPctOfParent: null },
      { id: 2, parentCompanyId: 1, ownershipPctOfParent: 100 },
      { id: 3, parentCompanyId: 2, ownershipPctOfParent: 51 },
      { id: 4, parentCompanyId: 3, ownershipPctOfParent: 49 },
    ];
    const effective = computeEffectiveOwnership(tree);
    // Investor 100 holds 40 of 100 shares of subJV(4) → 40% local.
    const grants = [
      { stakeholderId: 100, companyId: 4, shares: 40 },
      { stakeholderId: 200, companyId: 4, shares: 60 },
    ];
    const own = computeInvestorGlobalOwnership(grants, effective);
    const inv100 = own.find((o) => o.stakeholderId === 100)!;
    expect(inv100.localPct).toBeCloseTo(40, 6);
    // 40% of an entity the group effectively owns 24.99% of → 40% × 24.99% = 9.996% global.
    expect(inv100.globalPct).toBeCloseTo(9.996, 6);
  });

  it("a direct investor in a wholly-owned entity keeps their full local percentage globally", () => {
    const tree: EntityNode[] = [
      { id: 1, parentCompanyId: null, ownershipPctOfParent: null },
      { id: 2, parentCompanyId: 1, ownershipPctOfParent: 100 },
    ];
    const effective = computeEffectiveOwnership(tree);
    const own = computeInvestorGlobalOwnership([{ stakeholderId: 1, companyId: 2, shares: 25 }, { stakeholderId: 2, companyId: 2, shares: 75 }], effective);
    const inv1 = own.find((o) => o.stakeholderId === 1)!;
    expect(inv1.localPct).toBeCloseTo(25, 6);
    expect(inv1.globalPct).toBeCloseTo(25, 6); // wholly-owned ⇒ global == local
  });
});

describe("rollupByEntity (v_entity_pnl)", () => {
  it("sums revenue/expense per entity in the given currency", () => {
    const txns = [
      { companyId: 2, type: "invoice", amount: 500 },
      { companyId: 2, type: "expense", amount: 120 },
      { companyId: 3, type: "invoice", amount: 300 },
      { companyId: null, type: "invoice", amount: 999 }, // unscoped — ignored
    ];
    const roll = rollupByEntity(txns);
    expect(roll.get(2)).toEqual({ revenue: 500, expense: 120, net: 380 });
    expect(roll.get(3)).toEqual({ revenue: 300, expense: 0, net: 300 });
    expect(roll.has(999)).toBe(false);
  });
});
