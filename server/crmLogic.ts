/**
 * Pure CRM helpers — no DB, no I/O — so every rule the CRM relies on can be
 * unit-tested directly. server/crmService.ts wires these to the database and
 * server/routers/crm.ts stays thin.
 */
import { scopeAllows, scopeCompanyIds, type Scope } from "./_core/scope";

// ---------------------------------------------------------------------------
// Entity scope
// ---------------------------------------------------------------------------

export interface CrmScopeOptions {
  /**
   * Reference rows (pipelines, tags, loss reasons) with a NULL companyId are
   * shared across entities and stay visible to everyone. Business rows
   * (contacts, deals, accounts, tasks) with a NULL companyId are visible to
   * global scope only — same rule as `scopeAllows`.
   */
  sharedWhenNull?: boolean;
}

/** Whether a row owned by `companyId` is visible under `scope`. */
export function crmRowVisible(scope: Scope, companyId: number | null | undefined, opts: CrmScopeOptions = {}): boolean {
  if (scope.companyIds === "all") return true;
  if (companyId == null) return opts.sharedWhenNull === true;
  return scopeAllows(scope, companyId);
}

/** Filters rows in memory with `crmRowVisible`. */
export function filterCrmRows<T extends { companyId?: number | null }>(rows: T[], scope: Scope, opts: CrmScopeOptions = {}): T[] {
  if (scope.companyIds === "all") return rows;
  return rows.filter((r) => crmRowVisible(scope, r.companyId, opts));
}

/**
 * Company-id allow-list for a DB helper: `null` means unrestricted, `[]`
 * means "no rows" (a scoped user with no entities — callers must short-circuit).
 */
export function crmScopeCompanyIds(scope: Scope): number[] | null {
  return scopeCompanyIds(scope);
}

/** Whether a scoped list query can return nothing at all and should skip the DB. */
export function scopeIsEmpty(companyIds: number[] | null | undefined): boolean {
  return Array.isArray(companyIds) && companyIds.length === 0;
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

export const DEFAULT_ROTTING_DAYS = 21;

export interface StageLike {
  name: string;
  sortOrder: number;
  defaultProbability: number;
  isWon: boolean;
  isLost: boolean;
  rottingDays?: number | null;
}

/** Parses crm_pipelines.stages (a JSON string array); tolerates junk. */
export function parseStageNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === "string" ? x : typeof x === "object" && x && typeof (x as { name?: unknown }).name === "string" ? (x as { name: string }).name : ""))
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isWonName(name: string): boolean {
  return /won/i.test(name);
}
function isLostName(name: string): boolean {
  return /lost/i.test(name) && !isWonName(name);
}

/**
 * Default stage rows for a list of stage names: the first regular stage is
 * 10%, the last 90%, evenly spaced in between; won = 100, lost = 0.
 * Mirrors the SQL backfill in drizzle/0073_crm_upgrade.sql.
 */
export function seedStagesFromNames(names: string[]): StageLike[] {
  const regular = names.filter((n) => !isWonName(n) && !isLostName(n));
  const step = regular.length > 1 ? 80 / (regular.length - 1) : 0;
  let regularIdx = 0;
  return names.map((name, sortOrder) => {
    const won = isWonName(name);
    const lost = isLostName(name);
    let defaultProbability: number;
    if (won) defaultProbability = 100;
    else if (lost) defaultProbability = 0;
    else {
      defaultProbability = regular.length <= 1 ? 10 : Math.round(10 + step * regularIdx);
      regularIdx++;
    }
    return { name, sortOrder, defaultProbability, isWon: won, isLost: lost, rottingDays: null };
  });
}

/** Stage row matching a deal's `stage` string (case-insensitive), if any. */
export function findStage<T extends { name: string }>(stages: T[], stageName: string): T | undefined {
  const n = stageName.trim().toLowerCase();
  return stages.find((s) => s.name.trim().toLowerCase() === n);
}

/**
 * Probability to store when a deal moves stage: the caller's explicit value
 * wins; otherwise the target stage's default; otherwise the deal's current
 * value is kept (undefined = leave unchanged).
 */
export function resolveMoveProbability(
  explicit: number | undefined,
  stage: Pick<StageLike, "defaultProbability"> | undefined,
): number | undefined {
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.max(0, Math.min(100, Math.round(explicit)));
  if (stage) return stage.defaultProbability;
  return undefined;
}

/** Deal status implied by the target stage (undefined = leave unchanged). */
export function statusForStage(stage: Pick<StageLike, "isWon" | "isLost"> | undefined): "won" | "lost" | "open" | undefined {
  if (!stage) return undefined;
  if (stage.isWon) return "won";
  if (stage.isLost) return "lost";
  return "open";
}

/** Whether a deal has gone idle in its stage longer than the stage allows. */
export function dealIsRotting(
  lastActivityAt: Date | string | null | undefined,
  rottingDays: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastActivityAt) return false;
  const days = rottingDays ?? DEFAULT_ROTTING_DAYS;
  const last = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last > days * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface ForecastDeal {
  id: number;
  stage: string;
  status: string;
  amount: string | number | null;
  probability: number | null;
  expectedCloseDate: Date | string | null;
}

export interface ForecastBucket {
  key: string;
  count: number;
  amount: number;
  weighted: number;
}

export interface Forecast {
  totalOpen: number;
  totalWeighted: number;
  byMonth: ForecastBucket[];
  byStage: ForecastBucket[];
}

export function monthKey(d: Date | string | null | undefined): string {
  if (!d) return "unscheduled";
  const date = new Date(d);
  if (!Number.isFinite(date.getTime())) return "unscheduled";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Weighted pipeline: amount × probability for every open deal, bucketed by
 * expected-close month (YYYY-MM, "unscheduled" when unset) and by stage. A
 * deal with no probability falls back to its stage default, then 0.
 */
export function computeForecast(deals: ForecastDeal[], stages: StageLike[] = []): Forecast {
  const byMonth = new Map<string, ForecastBucket>();
  const byStage = new Map<string, ForecastBucket>();
  let totalOpen = 0;
  let totalWeighted = 0;
  const add = (map: Map<string, ForecastBucket>, key: string, amount: number, weighted: number) => {
    const b = map.get(key) ?? { key, count: 0, amount: 0, weighted: 0 };
    b.count++;
    b.amount += amount;
    b.weighted += weighted;
    map.set(key, b);
  };
  for (const deal of deals) {
    if (deal.status !== "open") continue;
    const amount = Number(deal.amount ?? 0) || 0;
    const stage = findStage(stages, deal.stage);
    const p = typeof deal.probability === "number" ? deal.probability : stage?.defaultProbability ?? 0;
    const weighted = amount * Math.max(0, Math.min(100, p)) / 100;
    totalOpen += amount;
    totalWeighted += weighted;
    add(byMonth, monthKey(deal.expectedCloseDate), amount, weighted);
    add(byStage, deal.stage, amount, weighted);
  }
  const round = (b: ForecastBucket): ForecastBucket => ({ ...b, amount: Math.round(b.amount * 100) / 100, weighted: Math.round(b.weighted * 100) / 100 });
  const stageOrder = new Map(stages.map((s, i) => [s.name.toLowerCase(), s.sortOrder ?? i]));
  return {
    totalOpen: Math.round(totalOpen * 100) / 100,
    totalWeighted: Math.round(totalWeighted * 100) / 100,
    byMonth: [...byMonth.values()].map(round).sort((a, b) => (a.key === "unscheduled" ? 1 : b.key === "unscheduled" ? -1 : a.key.localeCompare(b.key))),
    byStage: [...byStage.values()].map(round).sort((a, b) => (stageOrder.get(a.key.toLowerCase()) ?? 999) - (stageOrder.get(b.key.toLowerCase()) ?? 999)),
  };
}

// ---------------------------------------------------------------------------
// Deals: items, close
// ---------------------------------------------------------------------------

export const DEFAULT_LOSS_REASONS = ["Price", "Timing/Budget cycle", "Chose incumbent", "No decision", "Product fit", "Lost bid", "Other"];

/** Line total = quantity × unitPrice, rounded to cents. */
export function dealItemTotal(quantity: string | number | null | undefined, unitPrice: string | number | null | undefined): number {
  const q = Number(quantity ?? 0);
  const p = Number(unitPrice ?? 0);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return Math.round(q * p * 100) / 100;
}

/**
 * Deal amount implied by its items: the sum of line totals when there is at
 * least one item, otherwise `undefined` (leave the manually entered amount).
 */
export function dealAmountFromItems(items: Array<{ total: string | number | null }>): number | undefined {
  if (items.length === 0) return undefined;
  const sum = items.reduce((acc, it) => acc + (Number(it.total ?? 0) || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** Deal patch for closing it as won or lost. */
export function closeDealPatch(
  outcome: "won" | "lost",
  opts: { lossReasonId?: number | null; note?: string | null; wonStage?: string; lostStage?: string },
  now: Date = new Date(),
): { status: "won" | "lost"; probability: number; wonAt?: Date; lostAt?: Date; lossReasonId?: number | null; lostReason?: string | null; stage?: string } {
  if (outcome === "won") {
    return { status: "won", probability: 100, wonAt: now, lossReasonId: null, lostReason: null, ...(opts.wonStage ? { stage: opts.wonStage } : {}) };
  }
  return {
    status: "lost",
    probability: 0,
    lostAt: now,
    lossReasonId: opts.lossReasonId ?? null,
    lostReason: opts.note?.trim() ? opts.note.trim().slice(0, 255) : null,
    ...(opts.lostStage ? { stage: opts.lostStage } : {}),
  };
}
