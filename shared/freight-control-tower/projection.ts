// ============================================================================
// Coverage projection — the single source of truth for "when do we run out".
//
// A day-by-day balance walk: start at on-hand, subtract the burn rate each day,
// add each inbound shipment on its ETA day, and record the first day the balance
// hits zero (stockout) and the first arrival that recovers it. Quarantined lots
// never credit the balance — they arrive with prog === 1 and are filtered out of
// the inbound feed before they reach this function.
//
// Runway, Plant wall and the Today "cover at risk" list ALL read this. Keeping
// one walk here is deliberate: the old planner and the runway view disagreed
// until they were unified, and any discrepancy destroys trust immediately.
// ============================================================================

import { MONTHS, TODAY, AXIS0, AXIS_DAYS, DAY, type CoverRow, type Shipment } from "./fixtures";

/** Horizon = days from TODAY to the end of the 49-day axis (== 46). */
export const HORIZON = Math.round((AXIS0 + AXIS_DAYS * DAY - TODAY) / DAY);

/** Parse a `"04 Aug"` label to a UTC ms timestamp (year pinned to 2026), or null. */
export function parseDay(s: string | undefined, year = 2026): number | null {
  if (!s) return null;
  const m = /^(\d{1,2})\s+([A-Za-z]{3})/.exec(s.trim());
  if (!m) return null;
  const mon = MONTHS[m[2] as keyof typeof MONTHS];
  if (mon === undefined) return null;
  return Date.UTC(year, mon, Number(m[1]));
}

export interface ProjectionOpts {
  today?: number;
  horizon?: number;
  day?: number;
}

export interface CoverProjection {
  sku: string;
  /** consumption per day = onHandN / days (a trailing-average proxy) */
  burn: number;
  /** first day (1-indexed from today) the balance is <= 0, or null if covered */
  stockoutDay: number | null;
  /** first credited arrival strictly after stockout, or null */
  resumeDay: number | null;
  hasGap: boolean;
  /** credited arrival days, ascending */
  arrivalDays: number[];
  /** day (>=1) -> total qty arriving that day */
  credits: Record<number, number>;
}

/** Burn rate for a cover row: on-hand spread over its authored days of cover. */
export function burnRate(cover: CoverRow): number {
  return cover.onHandN / cover.days;
}

/**
 * Project a single SKU. `inbounds` are the not-yet-received shipments for this
 * SKU (caller filters `prog < 1`, which already excludes quarantined lots).
 */
export function projectSku(
  sku: string,
  cover: CoverRow,
  inbounds: Array<{ eta: string; qtyN: number }>,
  opts: ProjectionOpts = {},
): CoverProjection {
  const today = opts.today ?? TODAY;
  const horizon = opts.horizon ?? HORIZON;
  const day = opts.day ?? DAY;
  const burn = burnRate(cover);

  // Credit each inbound on its ETA day (never earlier than tomorrow).
  const credits: Record<number, number> = {};
  for (const r of inbounds) {
    const eta = parseDay(r.eta);
    if (eta == null) continue;
    const d = Math.max(1, Math.round((eta - today) / day));
    credits[d] = (credits[d] || 0) + (r.qtyN || 0);
  }

  // Walk day 1..horizon: add that day's credits, subtract a day of burn.
  let bal = cover.onHandN;
  let stockoutDay: number | null = null;
  for (let d = 1; d <= horizon; d++) {
    bal += credits[d] || 0;
    bal -= burn;
    if (bal <= 0) {
      stockoutDay = d;
      break;
    }
  }

  const arrivalDays = Object.keys(credits)
    .map(Number)
    .sort((a, b) => a - b);
  const resumeDay =
    stockoutDay == null ? null : arrivalDays.find((d) => d > stockoutDay) ?? null;

  return { sku, burn, stockoutDay, resumeDay, hasGap: stockoutDay != null, arrivalDays, credits };
}

/**
 * Project every SKU in `cover`. Inbound = shipments for the SKU with prog < 1
 * (received and quarantined lots, prog === 1, are excluded from the feed).
 */
export function projectAll(
  cover: Record<string, CoverRow>,
  shipments: Shipment[],
  opts: ProjectionOpts = {},
): Record<string, CoverProjection> {
  const out: Record<string, CoverProjection> = {};
  for (const sku of Object.keys(cover)) {
    const inbounds = shipments.filter((r) => r.sku === sku && r.prog < 1);
    out[sku] = projectSku(sku, cover[sku], inbounds, opts);
  }
  return out;
}
