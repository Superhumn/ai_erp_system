/**
 * Merge.dev Accounting API integration
 *
 * Alternative sync provider for QuickBooks Online data. Merge hosts the
 * Intuit OAuth with their own approved app, so we talk to Merge's unified
 * Accounting API instead of Intuit directly. Selected via
 * ACCOUNTING_SYNC_PROVIDER=merge; the quickbooks tRPC routes branch on it,
 * so the Finance UI is unchanged.
 *
 * Linking: for a single company, link the QuickBooks account once from the
 * Merge dashboard (Linked Accounts), then set MERGE_API_KEY and
 * MERGE_ACCOUNT_TOKEN in the environment. No in-app OAuth flow needed.
 */

import { ENV } from "./env";
import type { ParsedProfitAndLoss, ProfitAndLossMonth } from "./quickbooks";

const MERGE_API_BASE = "https://api.merge.dev/api/accounting/v1";

// Cursor pagination safety valve. If an endpoint still reports more pages
// past this, we return an explicit truncation error rather than silently
// syncing a partial dataset.
const MAX_PAGES = 100; // 100 × 100 rows

export function isMergeConfigured(): boolean {
  // MERGE_COMPANY_ID must be an explicit positive integer — fail closed
  // rather than defaulting the linked company's financials to company 1.
  return !!(ENV.mergeApiKey && ENV.mergeAccountToken)
    && Number.isInteger(ENV.mergeCompanyId)
    && ENV.mergeCompanyId > 0;
}

/**
 * Shared GET with cursor pagination. Returns all results across pages.
 * Endpoints that return a single object (no `results` field) are wrapped
 * into a one-element array.
 */
async function mergeGetAll(endpoint: string, params?: Record<string, string>, maxPages = MAX_PAGES): Promise<{ results?: any[]; error?: string }> {
  if (!isMergeConfigured()) {
    return { error: "Merge is not configured. Set MERGE_API_KEY, MERGE_ACCOUNT_TOKEN and MERGE_COMPANY_ID." };
  }
  const results: any[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < maxPages; page++) {
      const qs = new URLSearchParams({ page_size: "100", ...params });
      if (cursor) qs.set("cursor", cursor);
      const response = await fetch(`${MERGE_API_BASE}/${endpoint}?${qs}`, {
        headers: {
          "Authorization": `Bearer ${ENV.mergeApiKey}`,
          "X-Account-Token": ENV.mergeAccountToken,
          "Accept": "application/json",
        },
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`[Merge] ${endpoint} failed (${response.status}):`, body.slice(0, 500));
        return { error: `Merge API request failed: ${response.status} ${response.statusText}` };
      }
      const data = await response.json();
      if (Array.isArray(data?.results)) {
        results.push(...data.results);
      } else if (data && typeof data === "object") {
        // Singleton response shape — no pagination envelope.
        results.push(data);
        return { results };
      }
      if (!data?.next) return { results };
      cursor = data.next;
    }
    // Cursor still present after maxPages — refuse to report a partial
    // sync as complete.
    return { error: `Merge ${endpoint} returned more than ${maxPages * 100} rows; aborting to avoid a partial sync` };
  } catch (error: any) {
    console.error(`[Merge] ${endpoint} error:`, error);
    return { error: error?.message || "Merge API request failed" };
  }
}

/** Company info — used by testConnection. */
export async function getMergeCompanyInfo(): Promise<{ name?: string; error?: string }> {
  const res = await mergeGetAll("company-info");
  if (res.error) return { error: res.error };
  const company = res.results?.[0];
  if (!company) return { error: "No company found on the linked Merge account" };
  return { name: company.name || company.legal_name || "Unknown company" };
}

// Reachability cache so connection-status queries don't hit Merge on every
// dashboard render. "Configured" (env strings present) is not "connected"
// (token valid, account linked) — status endpoints report the latter.
const CONNECTION_CACHE_MS = 60_000;
let connectionCache: { at: number; result: { connected: boolean; companyName?: string; error?: string } } | null = null;

/** For tests. */
export function _resetMergeConnectionCache(): void {
  connectionCache = null;
}

/**
 * Cached check that the Merge credentials actually work and a company is
 * linked — not just that the env vars are non-empty.
 */
export async function checkMergeConnection(): Promise<{ connected: boolean; companyName?: string; error?: string }> {
  if (!isMergeConfigured()) {
    return { connected: false, error: "Merge is not configured. Set MERGE_API_KEY, MERGE_ACCOUNT_TOKEN and MERGE_COMPANY_ID." };
  }
  const now = Date.now();
  if (connectionCache && now - connectionCache.at < CONNECTION_CACHE_MS) {
    return connectionCache.result;
  }
  const info = await getMergeCompanyInfo();
  const result = info.error
    ? { connected: false, error: info.error }
    : { connected: true, companyName: info.name };
  connectionCache = { at: now, result };
  return result;
}

/** Map Merge classification (ASSET) to QB-style (Asset) used by our tables/filters. */
function mapClassification(c?: string | null): string | null {
  if (!c) return null;
  const map: Record<string, string> = {
    ASSET: "Asset",
    LIABILITY: "Liability",
    EQUITY: "Equity",
    REVENUE: "Revenue",
    EXPENSE: "Expense",
  };
  return map[c.toUpperCase()] ?? c;
}

/** Map Merge item type (INVENTORY) to the QB-style value stored in our table. */
function mapItemType(t?: string | null): string | null {
  if (!t) return null;
  const map: Record<string, string> = {
    INVENTORY: "Inventory",
    NON_INVENTORY: "NonInventory",
    NONINVENTORY: "NonInventory",
    SERVICE: "Service",
  };
  return map[t.toUpperCase()] ?? t;
}

/**
 * Chart of accounts, mapped to InsertQuickBooksAccount column names so
 * db.syncQuickBooksAccountsForCompany can upsert them directly.
 */
export async function getMergeAccounts(companyId: number): Promise<{ accounts?: any[]; error?: string }> {
  const res = await mergeGetAll("accounts");
  if (res.error) return { error: res.error };
  // Parity with the direct QuickBooks path, which requests Active = true.
  const accounts = (res.results ?? [])
    .map((a: any) => mapMergeAccount(a, companyId))
    .filter((a: any) => a.active);
  return { accounts };
}

/** Pure mapper — exported for tests. */
export function mapMergeAccount(a: any, companyId: number) {
  return {
    companyId,
    quickbooksAccountId: String(a.remote_id ?? a.id),
    name: a.name ?? "Unnamed account",
    accountType: a.type ?? a.account_type ?? null,
    accountSubType: null,
    classification: mapClassification(a.classification),
    fullyQualifiedName: a.name ?? null,
    active: a.status ? a.status === "ACTIVE" : true,
    currentBalance: a.current_balance != null ? String(a.current_balance) : null,
    currency: a.currency ?? "USD",
    lastSyncedAt: new Date(),
  };
}

/**
 * Items (products/services), mapped to InsertQuickBooksItem column names
 * for db.syncQuickBooksItemsForCompany. Field names differ across Merge
 * API versions (`type` vs `item_type`, `unit_price` vs `sales_price`), so
 * read both. Optional `type` filters to one QB-style item type.
 */
export async function getMergeItems(
  companyId: number,
  options?: { type?: "Inventory" | "NonInventory" | "Service" },
): Promise<{ items?: any[]; error?: string }> {
  // Expand the account relations so refId can read each account's
  // QuickBooks remote_id — unexpanded, these fields are Merge-side UUIDs
  // that would never match the synced quickbooksAccounts rows. Only
  // sales_account and purchase_account are expandable Item relations;
  // Merge's Item model has no inventory/asset account.
  const res = await mergeGetAll("items", { expand: "sales_account,purchase_account" });
  if (res.error) return { error: res.error };
  // Parity with the direct QuickBooks path, which passes activeOnly: true.
  let items = (res.results ?? [])
    .map((i: any) => mapMergeItem(i, companyId))
    .filter((i: any) => i.active);
  if (options?.type) {
    items = items.filter((i: any) => i.type === options.type);
  }
  return { items };
}

/** An account reference from Merge — either a bare id or an expanded object. */
function refId(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return v.remote_id != null ? String(v.remote_id) : v.id != null ? String(v.id) : null;
}

/**
 * Pure mapper — exported for tests. Merge's Item model carries no SKU,
 * description, quantity-on-hand, or inventory/asset account, so those
 * quickbooksItems columns stay unpopulated on this path; sales/purchase
 * account references map onto the income/expense account columns.
 */
export function mapMergeItem(i: any, companyId: number) {
  const unitPrice = i.unit_price ?? i.sales_price;
  return {
    companyId,
    quickbooksItemId: String(i.remote_id ?? i.id),
    name: i.name ?? "Unnamed item",
    type: mapItemType(i.type ?? i.item_type),
    unitPrice: unitPrice != null ? String(unitPrice) : null,
    purchaseCost: i.purchase_price != null ? String(i.purchase_price) : null,
    incomeAccountId: refId(i.sales_account),
    expenseAccountId: refId(i.purchase_account),
    active: i.status ? i.status === "ACTIVE" : true,
    lastSyncedAt: new Date(),
  };
}

// ─── Income statements → ParsedProfitAndLoss ────────────────────────────────

export type MergeReportItem = {
  name?: string | null;
  value?: number | null;
  sub_items?: MergeReportItem[] | null;
};

// Merge exposes these sections as arrays of report items; older shapes and
// some fixtures use a single object. Accept both.
type ReportSection = MergeReportItem | MergeReportItem[] | null | undefined;

export type MergeIncomeStatement = {
  start_period?: string | null;
  end_period?: string | null;
  income?: ReportSection;
  cost_of_sales?: ReportSection;
  operating_expenses?: ReportSection;
  non_operating_expenses?: ReportSection;
};

/** Normalize a section to a list of report items. */
function sectionItems(section: ReportSection): MergeReportItem[] {
  if (!section) return [];
  return Array.isArray(section) ? section : [section];
}

/** A report item's value, falling back to the sum of its sub-items. */
function itemValue(item: MergeReportItem): number {
  if (typeof item.value === "number") return item.value;
  return (item.sub_items ?? []).reduce((s, sub) => s + itemValue(sub), 0);
}

/** Total value of a section (object or array shape). */
function sectionValue(section: ReportSection): number {
  return sectionItems(section).reduce((s, item) => s + itemValue(item), 0);
}

/** Leaf items (name + value) for the per-account expense breakdown. */
function leafItems(item: MergeReportItem): { name: string; value: number }[] {
  const subs = item.sub_items ?? [];
  if (subs.length === 0) {
    return item.name ? [{ name: item.name, value: itemValue(item) }] : [];
  }
  return subs.flatMap((s) => leafItems(s));
}

function sectionLeaves(section: ReportSection): { name: string; value: number }[] {
  return sectionItems(section).flatMap((item) => leafItems(item));
}

export type SummarizeBy = "Month" | "Quarter" | "Year";

function periodLabel(dateStr: string | null | undefined, summarizeBy: SummarizeBy): string {
  if (!dateStr) return "Period";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Period";
  const year = d.getUTCFullYear();
  if (summarizeBy === "Year") return String(year);
  if (summarizeBy === "Quarter") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${year}`;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Convert Merge income statements to the ParsedProfitAndLoss shape the CFO
 * dashboard consumes ({months, expenseAccounts}). Statements are filtered to
 * the requested window by end_period, sorted ascending, and aggregated into
 * Month (default), Quarter, or Year buckets. Pure — unit tested.
 */
export function parseMergeIncomeStatements(
  statements: MergeIncomeStatement[],
  options?: { startDate?: string; endDate?: string; summarizeBy?: SummarizeBy },
): ParsedProfitAndLoss {
  // Date-only boundaries span the whole day: Merge periods are timestamped,
  // so a bare endDate must not exclude a statement ending later that day.
  // An unparseable boundary fails closed (matches nothing) — the caller
  // asked for a window we can't honor, so returning everything would leak
  // out-of-window data.
  const boundary = (s: string | undefined, endOfDay: boolean): number => {
    if (!s) return endOfDay ? Infinity : -Infinity;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const d = new Date(dateOnly && endOfDay ? `${s}T23:59:59.999Z` : s);
    return isNaN(d.getTime()) ? (endOfDay ? -Infinity : Infinity) : d.getTime();
  };
  const start = boundary(options?.startDate, false);
  const end = boundary(options?.endDate, true);
  const summarizeBy = options?.summarizeBy ?? "Month";

  const inRange = statements
    .filter((s) => {
      const t = s.end_period ? new Date(s.end_period).getTime() : NaN;
      return !isNaN(t) && t >= start && t <= end;
    })
    .sort((a, b) => new Date(a.start_period ?? 0).getTime() - new Date(b.start_period ?? 0).getTime());

  // Aggregate statements into period buckets (a no-op for Month granularity
  // when Merge syncs monthly statements, which is its usual cadence).
  const buckets = new Map<string, ProfitAndLossMonth>();
  for (const s of inRange) {
    const label = periodLabel(s.end_period, summarizeBy);
    const bucket = buckets.get(label) ?? { label, income: 0, cogs: 0, expense: 0 };
    bucket.income += sectionValue(s.income);
    bucket.cogs += sectionValue(s.cost_of_sales);
    bucket.expense += sectionValue(s.operating_expenses) + sectionValue(s.non_operating_expenses);
    buckets.set(label, bucket);
  }
  const months = Array.from(buckets.values());

  const totals = new Map<string, number>();
  for (const s of inRange) {
    for (const leaf of [...sectionLeaves(s.operating_expenses), ...sectionLeaves(s.non_operating_expenses)]) {
      totals.set(leaf.name, (totals.get(leaf.name) ?? 0) + leaf.value);
    }
  }
  const expenseAccounts = Array.from(totals.entries())
    .map(([name, total]) => ({ name, total }))
    .filter((r) => r.total !== 0);

  return { months, expenseAccounts };
}

/**
 * Fetch + parse the P&L for a date window from Merge income statements.
 * The date bounds are forwarded as start_period/end_period query params
 * (Merge ignores unrecognized filters, so this is a no-op on API versions
 * without them); local filtering is retained as the correctness guarantee.
 * The fetch is bounded to 10 pages (1,000 statements — decades of monthly
 * reports for one company).
 */
export async function getMergeProfitAndLoss(options?: {
  startDate?: string;
  endDate?: string;
  summarizeBy?: SummarizeBy;
}): Promise<{ report?: ParsedProfitAndLoss; error?: string }> {
  const params: Record<string, string> = {};
  if (options?.startDate) params.start_period = options.startDate;
  if (options?.endDate) params.end_period = options.endDate;
  const res = await mergeGetAll("income-statements", Object.keys(params).length ? params : undefined, 10);
  if (res.error) return { error: res.error };
  return { report: parseMergeIncomeStatements(res.results ?? [], options) };
}
