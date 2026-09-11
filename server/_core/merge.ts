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
  return !!(ENV.mergeApiKey && ENV.mergeAccountToken);
}

/**
 * Shared GET with cursor pagination. Returns all results across pages.
 * Endpoints that return a single object (no `results` field) are wrapped
 * into a one-element array.
 */
async function mergeGetAll(endpoint: string, params?: Record<string, string>): Promise<{ results?: any[]; error?: string }> {
  if (!isMergeConfigured()) {
    return { error: "Merge is not configured. Set MERGE_API_KEY and MERGE_ACCOUNT_TOKEN." };
  }
  const results: any[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
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
    // Cursor still present after MAX_PAGES — refuse to report a partial
    // sync as complete.
    return { error: `Merge ${endpoint} returned more than ${MAX_PAGES * 100} rows; aborting to avoid a partial sync` };
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
  return { accounts: (res.results ?? []).map((a: any) => mapMergeAccount(a, companyId)) };
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
  const res = await mergeGetAll("items");
  if (res.error) return { error: res.error };
  let items = (res.results ?? []).map((i: any) => mapMergeItem(i, companyId));
  if (options?.type) {
    items = items.filter((i: any) => i.type === options.type);
  }
  return { items };
}

/** Pure mapper — exported for tests. */
export function mapMergeItem(i: any, companyId: number) {
  const unitPrice = i.unit_price ?? i.sales_price;
  return {
    companyId,
    quickbooksItemId: String(i.remote_id ?? i.id),
    name: i.name ?? "Unnamed item",
    type: mapItemType(i.type ?? i.item_type),
    unitPrice: unitPrice != null ? String(unitPrice) : null,
    purchaseCost: i.purchase_price != null ? String(i.purchase_price) : null,
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
  const start = options?.startDate ? new Date(options.startDate).getTime() : -Infinity;
  const end = options?.endDate ? new Date(options.endDate).getTime() : Infinity;
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

/** Fetch + parse the P&L for a date window from Merge income statements. */
export async function getMergeProfitAndLoss(options?: {
  startDate?: string;
  endDate?: string;
  summarizeBy?: SummarizeBy;
}): Promise<{ report?: ParsedProfitAndLoss; error?: string }> {
  const res = await mergeGetAll("income-statements");
  if (res.error) return { error: res.error };
  return { report: parseMergeIncomeStatements(res.results ?? [], options) };
}
