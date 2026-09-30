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
 * Mirrors the SQL backfill in drizzle/0074_crm_upgrade.sql.
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

export const DEFAULT_LOSS_REASONS = ["Price", "Chose incumbent", "No budget this cycle", "Bid timing", "Product fit", "Distributor not carrying", "No decision"];

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
export function dealAmountFromItems(items: Array<{ totalAmount: string | number | null }>): number | undefined {
  if (items.length === 0) return undefined;
  const sum = items.reduce((acc, it) => acc + (Number(it.totalAmount ?? 0) || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** Deal patch for closing it as won or lost. */
export function closeDealPatch(
  outcome: "won" | "lost",
  opts: { lossReasonId?: number | null; note?: string | null; wonStage?: string; lostStage?: string },
  now: Date = new Date(),
): { status: "won" | "lost"; probability: number; wonAt?: Date; lostAt?: Date; lossReasonId?: number | null; lostReason?: string | null; wonReason?: string | null; stage?: string } {
  if (outcome === "won") {
    return { status: "won", probability: 100, wonAt: now, lossReasonId: null, lostReason: null, wonReason: opts.note?.trim() ? opts.note.trim().slice(0, 500) : null, ...(opts.wonStage ? { stage: opts.wonStage } : {}) };
  }
  return {
    status: "lost",
    probability: 0,
    lostAt: now,
    lossReasonId: opts.lossReasonId ?? null,
    lostReason: opts.note?.trim() ? opts.note.trim().slice(0, 255) : null,
    wonReason: null,
    ...(opts.lostStage ? { stage: opts.lostStage } : {}),
  };
}

// ---------------------------------------------------------------------------
// Velocity + sales reports
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StageHistoryRow {
  dealId: number;
  fromStage: string | null;
  toStage: string;
  changedAt: Date | string;
}

export interface StageVelocity {
  stage: string;
  /** Completed stays (deal entered and later left the stage). */
  samples: number;
  avgDays: number;
}

/**
 * Average days a deal spends in each stage, from stage history. A stay is
 * the time between entering a stage and the next move out of it; a deal
 * still sitting in a stage does not count (it has no end yet).
 */
export function computeVelocity(history: StageHistoryRow[]): StageVelocity[] {
  const byDeal = new Map<number, StageHistoryRow[]>();
  for (const h of history) {
    const list = byDeal.get(h.dealId) ?? [];
    list.push(h);
    byDeal.set(h.dealId, list);
  }
  const totals = new Map<string, { days: number; n: number }>();
  for (const rows of byDeal.values()) {
    const sorted = [...rows].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const enter = new Date(sorted[i].changedAt).getTime();
      const leave = new Date(sorted[i + 1].changedAt).getTime();
      if (!Number.isFinite(enter) || !Number.isFinite(leave) || leave < enter) continue;
      const stage = sorted[i].toStage;
      const t = totals.get(stage) ?? { days: 0, n: 0 };
      t.days += (leave - enter) / DAY_MS;
      t.n++;
      totals.set(stage, t);
    }
  }
  return [...totals.entries()].map(([stage, t]) => ({ stage, samples: t.n, avgDays: Math.round((t.days / t.n) * 10) / 10 }));
}

export interface ReportDeal extends ForecastDeal {
  name?: string | null;
  source?: string | null;
  createdAt: Date | string;
  wonAt?: Date | string | null;
  lostAt?: Date | string | null;
  lossReasonId?: number | null;
  isStale?: boolean | null;
}

export interface SalesReport {
  forecast: Forecast;
  wonCount: number;
  lostCount: number;
  /** won / (won + lost), 0-100; null when nothing has closed. */
  winRate: number | null;
  /** Average days from creation to won, over won deals. */
  avgCycleDays: number | null;
  bySource: Array<{ source: string; count: number; amount: number; won: number }>;
  lossesByReason: Array<{ reasonId: number | null; reason: string; count: number; amount: number }>;
  staleDeals: Array<{ id: number; name: string; stage: string; amount: number; expectedCloseDate: Date | string | null }>;
}

export function computeSalesReport(
  deals: ReportDeal[],
  stages: StageLike[],
  lossReasons: Array<{ id: number; name: string }>,
): SalesReport {
  const won = deals.filter((d) => d.status === "won");
  const lost = deals.filter((d) => d.status === "lost");
  const closed = won.length + lost.length;
  const cycles = won
    .map((d) => (d.wonAt ? (new Date(d.wonAt).getTime() - new Date(d.createdAt).getTime()) / DAY_MS : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const amountOf = (d: ReportDeal) => Number(d.amount ?? 0) || 0;

  const sources = new Map<string, { source: string; count: number; amount: number; won: number }>();
  for (const d of deals) {
    const key = (d.source ?? "").trim() || "Unknown";
    const s = sources.get(key.toLowerCase()) ?? { source: key, count: 0, amount: 0, won: 0 };
    s.count++;
    s.amount += amountOf(d);
    if (d.status === "won") s.won++;
    sources.set(key.toLowerCase(), s);
  }

  const reasonName = new Map(lossReasons.map((r) => [r.id, r.name]));
  const losses = new Map<string, { reasonId: number | null; reason: string; count: number; amount: number }>();
  for (const d of lost) {
    const id = d.lossReasonId ?? null;
    const key = id == null ? "none" : String(id);
    const b = losses.get(key) ?? { reasonId: id, reason: id == null ? "No reason given" : reasonName.get(id) ?? `Reason #${id}`, count: 0, amount: 0 };
    b.count++;
    b.amount += amountOf(d);
    losses.set(key, b);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    forecast: computeForecast(deals, stages),
    wonCount: won.length,
    lostCount: lost.length,
    winRate: closed ? Math.round((won.length / closed) * 1000) / 10 : null,
    avgCycleDays: cycles.length ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10 : null,
    bySource: [...sources.values()].map((s) => ({ ...s, amount: round2(s.amount) })).sort((a, b) => b.count - a.count),
    lossesByReason: [...losses.values()].map((l) => ({ ...l, amount: round2(l.amount) })).sort((a, b) => b.count - a.count),
    staleDeals: deals
      .filter((d) => d.status === "open" && d.isStale)
      .map((d) => ({ id: d.id, name: d.name ?? `Deal #${d.id}`, stage: d.stage, amount: amountOf(d), expectedCloseDate: d.expectedCloseDate }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ---------------------------------------------------------------------------
// Stale deals
// ---------------------------------------------------------------------------

export type StaleReason = "idle" | "past_close";

/**
 * Why an open deal is stale, or null: no interaction for more than the
 * stage's rottingDays (default 21) — measured from the last interaction, or
 * from the deal's creation when it never had one — or an expected close date
 * already in the past.
 */
export function dealStaleReason(
  deal: { status: string; createdAt: Date | string; expectedCloseDate?: Date | string | null },
  lastActivityAt: Date | string | null | undefined,
  rottingDays: number | null | undefined,
  now: Date = new Date(),
): StaleReason | null {
  if (deal.status !== "open") return null;
  if (dealIsRotting(lastActivityAt ?? deal.createdAt, rottingDays, now)) return "idle";
  if (deal.expectedCloseDate) {
    const close = new Date(deal.expectedCloseDate).getTime();
    if (Number.isFinite(close) && close < startOfUtcDay(now).getTime()) return "past_close";
  }
  return null;
}

export function staleFollowUpTitle(dealName: string, reason: StaleReason): string {
  return reason === "past_close" ? `Update close date: ${dealName}` : `Follow up: ${dealName} has gone quiet`;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskView = "mine" | "today" | "overdue" | "upcoming" | "all";
export type TaskBucket = "overdue" | "today" | "upcoming" | "someday" | "done";

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function endOfUtcDay(d: Date): Date {
  return new Date(startOfUtcDay(d).getTime() + DAY_MS - 1);
}

/** Which list a task belongs in, relative to `now` (UTC days). */
export function taskBucket(task: { dueAt?: Date | string | null; completedAt?: Date | string | null }, now: Date = new Date()): TaskBucket {
  if (task.completedAt) return "done";
  if (!task.dueAt) return "someday";
  const due = new Date(task.dueAt).getTime();
  if (!Number.isFinite(due)) return "someday";
  if (due < startOfUtcDay(now).getTime()) return "overdue";
  if (due <= endOfUtcDay(now).getTime()) return "today";
  return "upcoming";
}

/** Filters for db.getCrmTasks implied by a tasks.list view. */
export function taskViewFilters(view: TaskView, userId: number, now: Date = new Date()): {
  assignedTo?: number; status: "open" | "done" | "all"; overdue?: boolean; dueBefore?: Date; dueAfter?: Date;
} {
  switch (view) {
    case "today":
      return { assignedTo: userId, status: "open", dueAfter: startOfUtcDay(now), dueBefore: endOfUtcDay(now) };
    case "overdue":
      return { assignedTo: userId, status: "open", dueBefore: new Date(startOfUtcDay(now).getTime() - 1) };
    case "upcoming":
      return { assignedTo: userId, status: "open", dueAfter: new Date(endOfUtcDay(now).getTime() + 1) };
    case "mine":
      return { assignedTo: userId, status: "open" };
    default:
      return { status: "all" };
  }
}

export interface ReminderTask {
  id: number;
  title: string;
  type: string;
  dueAt: Date | string | null;
  assignedTo: number | null;
}

/** Groups due tasks by assignee for one digest email each. */
export function groupTasksByAssignee<T extends ReminderTask>(tasks: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const t of tasks) {
    if (t.assignedTo == null) continue;
    const list = out.get(t.assignedTo) ?? [];
    list.push(t);
    out.set(t.assignedTo, list);
  }
  return out;
}

/** Plain-text body of the daily CRM task digest. */
export function renderTaskReminderText(name: string | null | undefined, tasks: ReminderTask[], now: Date = new Date()): string {
  const overdue = tasks.filter((t) => taskBucket(t, now) === "overdue");
  const due = tasks.filter((t) => taskBucket(t, now) !== "overdue");
  const line = (t: ReminderTask) => `- [${t.type}] ${t.title}${t.dueAt ? ` (due ${new Date(t.dueAt).toISOString().slice(0, 10)})` : ""}`;
  const parts = [`Hi ${name?.trim() || "there"},`, ""];
  if (overdue.length) parts.push(`Overdue (${overdue.length}):`, ...overdue.map(line), "");
  if (due.length) parts.push(`Due today (${due.length}):`, ...due.map(line), "");
  parts.push("Open the CRM to update or complete them.");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Lead scoring
// ---------------------------------------------------------------------------

export interface LeadScoreInput {
  contactType: string | null | undefined;
  accountType?: string | null;
  mealsPerDay?: number | null;
  lastInteractionAt?: Date | string | null;
  lastRepliedAt?: Date | string | null;
  openDealAmount?: number | null;
}

export interface LeadScore {
  score: number;
  factors: Array<{ factor: string; points: number }>;
}

const CONTACT_TYPE_POINTS: Record<string, number> = { customer: 25, prospect: 18, lead: 10, partner: 8 };
const ACCOUNT_TYPE_POINTS: Record<string, number> = { district: 15, distributor: 15, gpo: 12, operator: 8, school: 6 };

function daysSince(d: Date | string | null | undefined, now: Date): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / DAY_MS);
}

/**
 * 0-100 lead score. Rules (additive, capped at 100):
 *  - contact type: customer 25, prospect 18, lead 10, partner 8
 *  - account type: district / distributor 15, GPO 12, operator 8, school 6
 *  - meals per day: >=50k 20, >=10k 15, >=2k 10, >=500 5
 *  - last interaction: <=7d 15, <=30d 10, <=90d 5
 *  - replied: <=14d 15, <=60d 8
 *  - open deal amount: >=250k 10, >=50k 7, >=10k 4, >0 2
 */
export function computeLeadScore(input: LeadScoreInput, now: Date = new Date()): LeadScore {
  const factors: Array<{ factor: string; points: number }> = [];
  const add = (factor: string, points: number) => { if (points > 0) factors.push({ factor, points }); };

  add(`contact type: ${input.contactType ?? "unknown"}`, CONTACT_TYPE_POINTS[input.contactType ?? ""] ?? 0);
  if (input.accountType) add(`account type: ${input.accountType}`, ACCOUNT_TYPE_POINTS[input.accountType] ?? 0);

  const meals = input.mealsPerDay ?? 0;
  add("meals per day", meals >= 50000 ? 20 : meals >= 10000 ? 15 : meals >= 2000 ? 10 : meals >= 500 ? 5 : 0);

  const touched = daysSince(input.lastInteractionAt, now);
  if (touched != null) add("recent interaction", touched <= 7 ? 15 : touched <= 30 ? 10 : touched <= 90 ? 5 : 0);

  const replied = daysSince(input.lastRepliedAt, now);
  if (replied != null) add("replied recently", replied <= 14 ? 15 : replied <= 60 ? 8 : 0);

  const amount = input.openDealAmount ?? 0;
  add("open deal value", amount >= 250000 ? 10 : amount >= 50000 ? 7 : amount >= 10000 ? 4 : amount > 0 ? 2 : 0);

  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  return { score, factors };
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, CRLF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const IMPORT_FIELDS = [
  "firstName", "lastName", "fullName", "email", "phone", "organization", "jobTitle",
  "city", "state", "country", "linkedinUrl", "contactType", "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
/** header index -> field ("" = ignore). */
export type ImportMapping = Record<number, ImportField | "">;

const HEADER_HINTS: Array<[ImportField, RegExp]> = [
  ["email", /e ?mail/],
  ["firstName", /^(first|given) ?name$|^first$/],
  ["lastName", /^(last|family|sur) ?name$|^last$|^surname$/],
  ["fullName", /^(full ?name|name|contact( name)?)$/],
  ["phone", /phone|mobile|tel/],
  ["linkedinUrl", /linkedin|profile ?url/],
  ["organization", /company|organi[sz]ation|district|account|employer|school/],
  ["jobTitle", /title|position|role/],
  ["city", /^city$|town/],
  ["state", /^state$|province|region/],
  ["country", /country/],
  ["contactType", /^(type|contact ?type|category)$/],
  ["notes", /notes?|comments?/],
];

/** Best-guess column mapping from header names; each field used at most once. */
export function guessImportMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<ImportField>();
  headers.forEach((raw, i) => {
    const h = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const hit = HEADER_HINTS.find(([field, re]) => !used.has(field) && re.test(h));
    mapping[i] = hit ? hit[0] : "";
    if (hit) used.add(hit[0]);
  });
  return mapping;
}

const CONTACT_TYPES = ["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"] as const;
export type ImportContactType = (typeof CONTACT_TYPES)[number];

export interface ImportedContact {
  firstName: string;
  lastName?: string;
  fullName: string;
  email?: string;
  phone?: string;
  organization?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedinUrl?: string;
  contactType?: ImportContactType;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maps one CSV row to a contact, or an error when it cannot be imported. */
export function mapImportRow(cells: string[], mapping: ImportMapping): { contact?: ImportedContact; error?: string } {
  const v: Partial<Record<ImportField, string>> = {};
  for (const [idx, field] of Object.entries(mapping)) {
    if (!field) continue;
    const val = (cells[Number(idx)] ?? "").trim();
    if (val) v[field] = val;
  }
  let firstName = v.firstName ?? "";
  let lastName = v.lastName ?? "";
  if (!firstName && v.fullName) {
    const parts = v.fullName.split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = lastName || parts.slice(1).join(" ");
  }
  if (!firstName && v.email) firstName = v.email.split("@")[0] ?? "";
  if (!firstName) return { error: "Missing name" };
  const email = v.email?.toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { error: `Invalid email "${v.email}"` };
  if (!email && !v.phone && !v.linkedinUrl && !v.organization) return { error: "Needs an email, phone, LinkedIn URL or organization" };
  const type = v.contactType?.toLowerCase();
  const contactType = CONTACT_TYPES.find((t) => t === type);
  return {
    contact: {
      firstName: firstName.slice(0, 128),
      lastName: lastName ? lastName.slice(0, 128) : undefined,
      fullName: (v.fullName || `${firstName} ${lastName}`).trim().slice(0, 255),
      email,
      phone: v.phone?.slice(0, 32),
      organization: v.organization?.slice(0, 255),
      jobTitle: v.jobTitle?.slice(0, 255),
      city: v.city?.slice(0, 128),
      state: v.state?.slice(0, 64),
      country: v.country?.slice(0, 64),
      linkedinUrl: v.linkedinUrl?.slice(0, 512),
      contactType,
      notes: v.notes,
    },
  };
}
