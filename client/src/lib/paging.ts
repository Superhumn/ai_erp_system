// Page arithmetic for server-paged lists (orders, invoices, transactions, customers, POs).

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export type PageRange = {
  /** 1-based index of the first row shown; 0 when there are no rows. */
  from: number;
  /** 1-based index of the last row shown. */
  to: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function pageRange(page: number, pageSize: number, total: number): PageRange {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return { from, to, pageCount, hasPrev: page > 0, hasNext: page < pageCount - 1 };
}

/** Largest valid page index for `total` rows — used when a delete shrinks the list. */
export function lastPage(pageSize: number, total: number): number {
  return Math.max(0, Math.ceil(total / pageSize) - 1);
}
