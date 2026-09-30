import { useEffect, useMemo, useState } from "react";
import { lastPage } from "@/lib/paging";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Page, page size, sort and debounced search for a server-paged list. Changing the search,
 * the sort or any value in `filterKey` returns to the first page. Pass `query` (plus the
 * page's own sortBy mapping of `sort.key`) to a `listPaged` query, then call
 * `clampTo(total)` with its result.
 */
export function usePagedList(filterKey = "", initialPageSize = 50) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(0), [search, filterKey, sort]);

  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(0);
  };

  /** Step back when the current page no longer exists (e.g. after deleting its last row). */
  const clampTo = (total: number | undefined) => {
    if (total === undefined) return;
    const max = lastPage(pageSize, total);
    if (page > max) setPage(max);
  };

  const query = useMemo(
    () => ({ limit: pageSize, offset: page * pageSize, search: search || undefined }),
    [page, pageSize, search],
  );

  return { page, setPage, pageSize, setPageSize, searchInput, setSearchInput, sort, setSort, query, clampTo };
}
