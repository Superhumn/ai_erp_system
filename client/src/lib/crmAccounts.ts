/** Pure helpers for the CRM accounts tree (parent → children). */

export interface AccountLike {
  id: number;
  name: string;
  parentAccountId: number | null;
}

export interface AccountTreeNode<T extends AccountLike> {
  account: T;
  children: AccountTreeNode<T>[];
}

/**
 * Builds a forest from a flat account list. An account whose parent is not in
 * the list (outside scope, deleted) becomes a root; cycles are broken by
 * treating the first account reached again as a root. Siblings sort by name.
 */
export function buildAccountTree<T extends AccountLike>(accounts: T[]): AccountTreeNode<T>[] {
  const nodes = new Map<number, AccountTreeNode<T>>();
  for (const a of accounts) nodes.set(a.id, { account: a, children: [] });
  const roots: AccountTreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parentId = node.account.parentAccountId;
    const parent = parentId != null && parentId !== node.account.id ? nodes.get(parentId) : undefined;
    if (parent && !isAncestor(node, parent, nodes)) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: AccountTreeNode<T>[]) => {
    list.sort((a, b) => a.account.name.localeCompare(b.account.name));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** True when `node` is an ancestor of `candidate` via parentAccountId links (cycle guard). */
function isAncestor<T extends AccountLike>(node: AccountTreeNode<T>, candidate: AccountTreeNode<T>, nodes: Map<number, AccountTreeNode<T>>): boolean {
  const seen = new Set<number>();
  let cursor: AccountTreeNode<T> | undefined = candidate;
  while (cursor) {
    if (cursor.account.id === node.account.id) return true;
    if (seen.has(cursor.account.id)) return false;
    seen.add(cursor.account.id);
    const pid: number | null = cursor.account.parentAccountId;
    cursor = pid != null ? nodes.get(pid) : undefined;
  }
  return false;
}

/** Depth-first rows for rendering; children of `collapsed` ids are hidden. */
export function flattenAccountTree<T extends AccountLike>(
  roots: AccountTreeNode<T>[],
  collapsed: Set<number> = new Set(),
): Array<{ node: AccountTreeNode<T>; depth: number }> {
  const out: Array<{ node: AccountTreeNode<T>; depth: number }> = [];
  const walk = (list: AccountTreeNode<T>[], depth: number) => {
    for (const n of list) {
      out.push({ node: n, depth });
      if (!collapsed.has(n.account.id)) walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}
