// Group consolidation logic (multi-entity STEP 5).
//
// The production consolidation runs as SQL views over the live rows (drizzle/manual/step5_group_views.sql) —
// never a copied/synced table. These pure functions mirror that logic so the rules (rollup,
// intercompany elimination, recursive ownership) are unit-tested without a database, and can be
// reused in-app where a view isn't convenient.

export type EntityNode = {
  id: number;
  parentCompanyId: number | null;
  ownershipPctOfParent: number | null; // parent's % of this entity; null = 100 (wholly owned)
};

/**
 * Effective % the ultimate parent owns of each entity, walking the tree and multiplying each
 * hop's ownership. Roots (holdco, no parent) are 100%. Mirrors the v_group_ownership view.
 * Example: GLOBAL → US(100%) → JV(51%) → subJV(49%) ⇒ subJV = 100 × 51% × 49% = 24.99%.
 */
export function computeEffectiveOwnership(entities: EntityNode[]): Map<number, number> {
  const childrenOf = new Map<number, EntityNode[]>();
  for (const e of entities) {
    if (e.parentCompanyId == null) continue;
    if (!childrenOf.has(e.parentCompanyId)) childrenOf.set(e.parentCompanyId, []);
    childrenOf.get(e.parentCompanyId)!.push(e);
  }
  const result = new Map<number, number>();
  const walk = (node: EntityNode, pct: number) => {
    result.set(node.id, pct);
    for (const child of childrenOf.get(node.id) ?? []) {
      walk(child, (pct * (child.ownershipPctOfParent ?? 100)) / 100);
    }
  };
  for (const root of entities.filter((e) => e.parentCompanyId == null)) walk(root, 100);
  return result;
}

export type GroupTxn = {
  id: number;
  type: string; // 'invoice' = revenue; 'expense' | 'payment' = expense
  amountGroup: number; // group reporting currency (USD)
};
export type Link = { transactionAId: number; transactionBId: number };

const REVENUE_TYPES = new Set(["invoice"]);
const EXPENSE_TYPES = new Set(["expense", "payment"]);

/**
 * Group P&L in the group currency with intercompany transactions eliminated: any transaction that
 * appears in an intercompany link is internal (e.g. the SA→US sale ↔ US purchase) and excluded, so
 * only real external revenue/cost remains. Mirrors the v_group_pnl view.
 */
export function eliminateIntercompany(transactions: GroupTxn[], links: Link[]) {
  const internal = new Set<number>();
  for (const l of links) {
    internal.add(l.transactionAId);
    internal.add(l.transactionBId);
  }
  const external = transactions.filter((t) => !internal.has(t.id));
  const revenueGroup = external.filter((t) => REVENUE_TYPES.has(t.type)).reduce((s, t) => s + t.amountGroup, 0);
  const expenseGroup = external.filter((t) => EXPENSE_TYPES.has(t.type)).reduce((s, t) => s + t.amountGroup, 0);
  return { revenueGroup, expenseGroup, netGroup: revenueGroup - expenseGroup };
}

export type EquityGrant = { stakeholderId: number; companyId: number | null; shares: number };

/**
 * Cap tables (STEP 6). An investor's effective GLOBAL ownership = their share of an entity ×
 * the ultimate parent's effective % of that entity. Recursive because the entity's effective %
 * already compounds every hop up the tree (from computeEffectiveOwnership / v_group_ownership).
 * Example: 40% of a JV that the group effectively owns 24.99% of ⇒ 40% × 24.99% = 9.996% global.
 * Mirrors the v_investor_global_ownership view.
 */
export function computeInvestorGlobalOwnership(
  grants: EquityGrant[],
  effectivePctByEntity: Map<number, number>,
): Array<{ stakeholderId: number; companyId: number; localPct: number; globalPct: number }> {
  const totalByEntity = new Map<number, number>();
  const sharesByPair = new Map<string, { stakeholderId: number; companyId: number; shares: number }>();
  for (const g of grants) {
    if (g.companyId == null) continue;
    totalByEntity.set(g.companyId, (totalByEntity.get(g.companyId) ?? 0) + g.shares);
    const key = `${g.stakeholderId}:${g.companyId}`;
    const acc = sharesByPair.get(key) ?? { stakeholderId: g.stakeholderId, companyId: g.companyId, shares: 0 };
    acc.shares += g.shares;
    sharesByPair.set(key, acc);
  }
  const out: Array<{ stakeholderId: number; companyId: number; localPct: number; globalPct: number }> = [];
  for (const { stakeholderId, companyId, shares } of sharesByPair.values()) {
    const total = totalByEntity.get(companyId) ?? 0;
    const localPct = total > 0 ? (shares / total) * 100 : 0;
    const effectivePct = effectivePctByEntity.get(companyId) ?? 0;
    out.push({ stakeholderId, companyId, localPct, globalPct: (localPct * effectivePct) / 100 });
  }
  return out;
}

/** Per-entity net P&L (mirrors v_entity_pnl), summing an amount field grouped by companyId. */
export function rollupByEntity(
  transactions: Array<{ companyId: number | null; type: string; amount: number }>,
) {
  const byEntity = new Map<number, { revenue: number; expense: number; net: number }>();
  for (const t of transactions) {
    if (t.companyId == null) continue;
    const acc = byEntity.get(t.companyId) ?? { revenue: 0, expense: 0, net: 0 };
    if (REVENUE_TYPES.has(t.type)) acc.revenue += t.amount;
    else if (EXPENSE_TYPES.has(t.type)) acc.expense += t.amount;
    acc.net = acc.revenue - acc.expense;
    byEntity.set(t.companyId, acc);
  }
  return byEntity;
}
