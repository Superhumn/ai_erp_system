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

export function isMergeConfigured(): boolean {
  return !!(ENV.mergeApiKey && ENV.mergeAccountToken);
}

/** Shared GET with cursor pagination. Returns all results across pages. */
async function mergeGetAll(endpoint: string, params?: Record<string, string>): Promise<{ results?: any[]; error?: string }> {
  if (!isMergeConfigured()) {
    return { error: "Merge is not configured. Set MERGE_API_KEY and MERGE_ACCOUNT_TOKEN." };
  }
  const results: any[] = [];
  let cursor: string | undefined;
  try {
    // Page through; hard cap of 20 pages (2000 rows) as a safety valve.
    for (let page = 0; page < 20; page++) {
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
      results.push(...(data.results ?? []));
      if (!data.next) break;
      cursor = data.next;
    }
    return { results };
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

/**
 * Chart of accounts, mapped to InsertQuickBooksAccount column names so
 * db.syncQuickBooksAccounts can upsert them directly.
 */
export async function getMergeAccounts(companyId: number): Promise<{ accounts?: any[]; error?: string }> {
  const res = await mergeGetAll("accounts");
  if (res.error) return { error: res.error };
  const accounts = (res.results ?? []).map((a: any) => ({
    companyId,
    quickbooksAccountId: String(a.remote_id ?? a.id),
    name: a.name ?? "Unnamed account",
    accountType: a.type ?? null,
    accountSubType: null,
    classification: mapClassification(a.classification),
    fullyQualifiedName: a.name ?? null,
    active: a.status ? a.status === "ACTIVE" : true,
    currentBalance: a.current_balance != null ? String(a.current_balance) : null,
    currency: a.currency ?? "USD",
    lastSyncedAt: new Date(),
  }));
  return { accounts };
}

/**
 * Items (products/services), mapped to InsertQuickBooksItem column names
 * for db.syncQuickBooksItems.
 */
export async function getMergeItems(companyId: number): Promise<{ items?: any[]; error?: string }> {
  const res = await mergeGetAll("items");
  if (res.error) return { error: res.error };
  const items = (res.results ?? []).map((i: any) => ({
    companyId,
    quickbooksItemId: String(i.remote_id ?? i.id),
    name: i.name ?? "Unnamed item",
    type: null,
    unitPrice: i.unit_price != null ? String(i.unit_price) : null,
    purchaseCost: i.purchase_price != null ? String(i.purchase_price) : null,
    active: i.status ? i.status === "ACTIVE" : true,
    lastSyncedAt: new Date(),
  }));
  return { items };
}

// ─── Income statements → ParsedProfitAndLoss ────────────────────────────────

type MergeReportItem = {
  name?: string | null;
  value?: number | null;
  sub_items?: MergeReportItem[] | null;
};

export type MergeIncomeStatement = {
  start_period?: string | null;
  end_period?: string | null;
  income?: MergeReportItem | null;
  cost_of_sales?: MergeReportItem | null;
  operating_expenses?: MergeReportItem | null;
  non_operating_expenses?: MergeReportItem | null;
};

/** A report item's value, falling back to the sum of its sub-items. */
function itemValue(item?: MergeReportItem | null): number {
  if (!item) return 0;
  if (typeof item.value === "number") return item.value;
  return (item.sub_items ?? []).reduce((s, sub) => s + itemValue(sub), 0);
}

/** Leaf sub-items (name + value) for the per-account expense breakdown. */
function leafItems(item?: MergeReportItem | null): { name: string; value: number }[] {
  if (!item) return [];
  const subs = item.sub_items ?? [];
  if (subs.length === 0) {
    const value = itemValue(item);
    return item.name ? [{ name: item.name, value }] : [];
  }
  return subs.flatMap((s) => leafItems(s));
}

function monthLabel(dateStr?: string | null): string {
  if (!dateStr) return "Period";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Period";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Convert Merge income statements to the ParsedProfitAndLoss shape the CFO
 * dashboard consumes ({months, expenseAccounts}). Statements are filtered to
 * the requested window by end_period and sorted ascending. Pure — unit tested.
 */
export function parseMergeIncomeStatements(
  statements: MergeIncomeStatement[],
  options?: { startDate?: string; endDate?: string },
): ParsedProfitAndLoss {
  const start = options?.startDate ? new Date(options.startDate).getTime() : -Infinity;
  const end = options?.endDate ? new Date(options.endDate).getTime() : Infinity;

  const inRange = statements
    .filter((s) => {
      const t = s.end_period ? new Date(s.end_period).getTime() : NaN;
      return !isNaN(t) && t >= start && t <= end;
    })
    .sort((a, b) => new Date(a.start_period ?? 0).getTime() - new Date(b.start_period ?? 0).getTime());

  const months: ProfitAndLossMonth[] = inRange.map((s) => ({
    label: monthLabel(s.end_period),
    income: itemValue(s.income),
    cogs: itemValue(s.cost_of_sales),
    expense: itemValue(s.operating_expenses) + itemValue(s.non_operating_expenses),
  }));

  const totals = new Map<string, number>();
  for (const s of inRange) {
    for (const leaf of [...leafItems(s.operating_expenses), ...leafItems(s.non_operating_expenses)]) {
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
}): Promise<{ report?: ParsedProfitAndLoss; error?: string }> {
  const res = await mergeGetAll("income-statements");
  if (res.error) return { error: res.error };
  return { report: parseMergeIncomeStatements(res.results ?? [], options) };
}
