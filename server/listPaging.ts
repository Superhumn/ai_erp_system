// Shared rules for the paged list endpoints (orders, invoices, transactions, customers).
// Pure so they can be tested without a database.

/** Rows per page when the caller does not say. */
export const DEFAULT_PAGE_LIMIT = 50;
/** Largest page a caller may request. */
export const MAX_PAGE_LIMIT = 200;
/**
 * Most rows the legacy `list` endpoints return. Those endpoints loaded whole tables; at
 * 1M orders the response exceeded V8's string limit and 20 concurrent loads exhausted an
 * 8 GB heap. The cap keeps the newest rows so existing screens keep working.
 */
export const LEGACY_LIST_CAP = 10_000;

export type PageRequest = { limit?: number; offset?: number };

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
