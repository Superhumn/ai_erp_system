// Shared rules for the paged list endpoints (orders, invoices, transactions, customers).
// Pure so they can be tested without a database.

/** Rows per page when the caller does not say. */
export const DEFAULT_PAGE_LIMIT = 50;
/** Largest page a caller may request. */
export const MAX_PAGE_LIMIT = 200;

export type PageRequest = { limit?: number; offset?: number; sortDir?: "asc" | "desc" };

/**
 * Sortable columns per paged list. Order and transaction sorts are limited to indexed
 * columns (migration 0072): an unindexed sort over 1M rows took 4–9 s. Customers are
 * orders of magnitude fewer, so any displayed column is cheap to sort.
 */
export const ORDER_SORTS = ["createdAt", "orderDate", "totalAmount"] as const;
export const CUSTOMER_SORTS = ["createdAt", "name", "email", "lastSyncedAt"] as const;
export const TRANSACTION_SORTS = ["date", "totalAmount"] as const;

/** Clamp a requested page to sane bounds. */
export function resolvePage(req: PageRequest = {}): { limit: number; offset: number } {
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(req.limit ?? DEFAULT_PAGE_LIMIT)));
  const offset = Math.max(0, Math.floor(req.offset ?? 0));
  return { limit, offset };
}

/**
 * `%term%` for a LIKE match, with the LIKE wildcards escaped so a literal % or _ searches
 * for itself. Blank input returns null (no search condition).
 */
export function containsPattern(term: string | undefined | null): string | null {
  const t = term?.trim();
  if (!t) return null;
  return `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
