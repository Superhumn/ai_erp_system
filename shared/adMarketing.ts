// Pure helpers for the paid-ads marketing module. Used by both the server
// (service, scheduler) and the client (cost per signup screen, link builder).
// Must stay free of Node/browser-only APIs — shared/ is strict-checked.

export const AD_PLATFORM_NAMES = ["meta", "linkedin", "reddit", "google", "tiktok", "other"] as const;
export type AdPlatformName = (typeof AD_PLATFORM_NAMES)[number];

export const AD_PLATFORM_LABELS: Record<AdPlatformName, string> = {
  meta: "Instagram (Meta)",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  google: "Google",
  tiktok: "TikTok",
  other: "Other",
};

export const AD_CAMPAIGN_STATUSES = ["planned", "active", "paused", "ended"] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export const AD_CREDIT_STATUSES = ["available", "claimed", "active", "used", "expired"] as const;
export type AdCreditStatus = (typeof AD_CREDIT_STATUSES)[number];

/** Days before expiry at which an unused credit raises an alert. */
export const CREDIT_EXPIRY_WARNING_DAYS = 14;
/** Consecutive days above the cost-per-signup target before an alert fires. */
export const CPS_ALERT_CONSECUTIVE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in UTC. Spend rows are keyed on this string, never on a timestamp. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string into a UTC midnight Date. Returns null for anything else. */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || toIsoDate(d) !== s ? null : d;
}

export function addIsoDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  if (!d) throw new Error(`Invalid date: ${iso}`);
  return toIsoDate(new Date(d.getTime() + days * DAY_MS));
}

/** Whole days from `from` until `to`, negative when `to` is in the past. */
export function daysUntil(to: Date, from: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Cost per signup = spend ÷ signups. Calculated, never stored. Null when there
 * are no signups so the UI can show "—" instead of dividing by zero.
 */
export function costPerSignup(spendUsd: number, signups: number): number | null {
  if (!Number.isFinite(spendUsd) || !Number.isFinite(signups) || signups <= 0) return null;
  return Math.round((spendUsd / signups) * 100) / 100;
}

export interface SpendRowLike {
  spendUsd: number | string | null;
  impressions: number | null;
  clicks: number | null;
  signups: number | null;
}

export interface SpendTotals {
  spendUsd: number;
  impressions: number;
  clicks: number;
  signups: number;
  costPerSignup: number | null;
  costPerClick: number | null;
  clickRate: number | null;
}

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

/** Sum a set of daily rows into one totals line with the derived ratios. */
export function sumSpend(rows: SpendRowLike[]): SpendTotals {
  let spendUsd = 0;
  let impressions = 0;
  let clicks = 0;
  let signups = 0;
  for (const r of rows) {
    spendUsd += num(r.spendUsd);
    impressions += num(r.impressions);
    clicks += num(r.clicks);
    signups += num(r.signups);
  }
  spendUsd = Math.round(spendUsd * 100) / 100;
  return {
    spendUsd,
    impressions,
    clicks,
    signups,
    costPerSignup: costPerSignup(spendUsd, signups),
    costPerClick: clicks > 0 ? Math.round((spendUsd / clicks) * 100) / 100 : null,
    clickRate: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
  };
}

/** Group rows by a key and total each group. Groups keep first-seen order. */
export function sumSpendBy<T extends SpendRowLike>(rows: T[], keyOf: (r: T) => string): Array<{ key: string; totals: SpendTotals }> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return Array.from(groups.entries()).map(([key, rs]) => ({ key, totals: sumSpend(rs) }));
}

/**
 * True when the cost per signup was above `targetUsd` on each of the last
 * `days` dates ending at `endDate` (inclusive). A day with no row, no spend, or
 * missing target counts as not-above, so a gap resets the streak.
 */
export function cpsAboveTargetStreak(
  rows: Array<SpendRowLike & { date: string }>,
  targetUsd: number | null | undefined,
  endDate: string,
  days: number = CPS_ALERT_CONSECUTIVE_DAYS,
): boolean {
  if (targetUsd == null || !Number.isFinite(targetUsd) || targetUsd <= 0 || days <= 0) return false;
  const byDate = new Map(rows.map((r) => [r.date, r] as const));
  for (let i = 0; i < days; i++) {
    const date = addIsoDays(endDate, -i);
    const row = byDate.get(date);
    if (!row) return false;
    const spend = num(row.spendUsd);
    if (spend <= 0) return false;
    const cps = costPerSignup(spend, num(row.signups));
    // No signups with spend counts as infinitely expensive.
    if (cps !== null && cps <= targetUsd) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tracking links
// ---------------------------------------------------------------------------

export interface UtmParams {
  source: string;
  medium?: string;
  campaign: string;
  content?: string;
  term?: string;
}

/**
 * Turn a free-text campaign name into a UTM-safe slug: lowercase, words
 * joined by underscores, everything else dropped. "Fall Launch 2026!" →
 * "fall_launch_2026".
 */
export function utmSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Build a tagged link from a page address and UTM values. Existing query
 * parameters on the base URL are kept; UTM keys already present are replaced.
 * Throws on a URL that is not http(s).
 */
export function buildTrackingUrl(baseUrl: string, utm: UtmParams): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error("Enter a full page address starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Tracking links must start with http:// or https://");
  }
  const source = utmSlug(utm.source);
  const campaign = utmSlug(utm.campaign);
  if (!source) throw new Error("A source is required");
  if (!campaign) throw new Error("A campaign name is required");
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", utmSlug(utm.medium || "paid_social") || "paid_social");
  url.searchParams.set("utm_campaign", campaign);
  if (utm.content && utmSlug(utm.content)) url.searchParams.set("utm_content", utmSlug(utm.content));
  else url.searchParams.delete("utm_content");
  if (utm.term && utmSlug(utm.term)) url.searchParams.set("utm_term", utmSlug(utm.term));
  else url.searchParams.delete("utm_term");
  return url.toString();
}

/** Read UTM values back out of a landing-page URL or a form payload's page URL. */
export function parseUtm(input: string | null | undefined): Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>> {
  if (!input) return {};
  let params: URLSearchParams;
  try {
    params = new URL(input).searchParams;
  } catch {
    params = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  }
  const out: Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>> = {};
  for (const k of ["source", "medium", "campaign", "content", "term"] as const) {
    const v = params.get(`utm_${k}`);
    if (v) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export function creditRemainingUsd(amountUsd: number | string | null, usedUsd: number | string | null): number {
  return Math.max(0, Math.round((num(amountUsd) - num(usedUsd)) * 100) / 100);
}

/**
 * A credit needs a warning when it still has money on it, has an expiry, and
 * that expiry is within the warning window (or already passed).
 */
export function creditNeedsExpiryWarning(
  credit: { amountUsd: number | string | null; amountUsedUsd: number | string | null; expiresAt: Date | null; status: string },
  now: Date,
  warningDays: number = CREDIT_EXPIRY_WARNING_DAYS,
): boolean {
  if (!credit.expiresAt) return false;
  if (credit.status === "used" || credit.status === "expired") return false;
  if (creditRemainingUsd(credit.amountUsd, credit.amountUsedUsd) <= 0) return false;
  return daysUntil(credit.expiresAt, now) <= warningDays;
}
