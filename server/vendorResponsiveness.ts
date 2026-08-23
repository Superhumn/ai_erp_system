/**
 * Vendor Responsiveness
 *
 * Measures how vendors actually behave on RFQs instead of asking a model to
 * guess. Everything here derives from `vendorRfqInvitations`: when we invited
 * them, when they answered, and whether the answer beat the quote due date.
 *
 * `recordInvitationResponse` stamps the per-invitation facts at the moment a
 * reply lands; `computeVendorResponsiveness` aggregates them; and
 * `responsivenessScoreFromMetrics` turns them into the 0-100 number that
 * `supplierScoringService` and the monthly `supplierPerformance` rollup consume.
 *
 * The scoring function is pure so its weighting can be unit-tested and argued
 * about without a database.
 */

import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "./db/connection";
import { vendorRfqInvitations, vendorRfqs } from "../drizzle/schema";

const MS_PER_HOUR = 1000 * 60 * 60;

/** A response inside this window is treated as immediate. */
export const FAST_RESPONSE_HOURS = 24;
/** A response at or beyond this is treated as unresponsive. */
export const SLOW_RESPONSE_HOURS = 336; // 14 days
/** Below this many closed invitations, the score is flagged low-confidence. */
export const MIN_SAMPLE_FOR_CONFIDENCE = 3;
/** How long past the quote due date an invitation stays open before it counts as no-response. */
export const NO_RESPONSE_GRACE_DAYS = 3;
/** Bounds a single close-out pass so one run cannot issue an unbounded UPDATE. */
export const MAX_INVITATIONS_CLOSED_PER_RUN = 1000;

export interface ResponsivenessMetrics {
  vendorId: number;
  invited: number;
  responded: number;
  declined: number;
  noResponse: number;
  /** Invitations still legitimately open — excluded from rate denominators. */
  pending: number;
  /** responded + declined + noResponse. */
  closed: number;
  averageResponseHours: number | null;
  medianResponseHours: number | null;
  /** (responded + declined) / closed, as a percentage. */
  responseRatePct: number | null;
  /** Share of responses that beat the quote due date, as a percentage. */
  onTimeRatePct: number | null;
}

export interface ResponsivenessScore {
  score: number | null;
  lowConfidence: boolean;
  /** Human-readable justification for the score, shown in the scoring UI. */
  details: string;
}

// ─── Per-invitation recording ──────────────────────────────────────────

/**
 * Stamp a vendor's response onto its invitation for an RFQ.
 *
 * Idempotent on `respondedAt`: a vendor that sends a revised quote keeps its
 * original first-response time, because that is what responsiveness measures.
 */
export async function recordInvitationResponse(
  rfqId: number,
  vendorId: number,
  respondedAt: Date = new Date(),
): Promise<{ updated: boolean; firstResponseHours: number | null }> {
  const db = await getDb();
  if (!db) return { updated: false, firstResponseHours: null };

  const rows = await db
    .select()
    .from(vendorRfqInvitations)
    .where(and(eq(vendorRfqInvitations.rfqId, rfqId), eq(vendorRfqInvitations.vendorId, vendorId)))
    .limit(1);
  const invitation = rows[0];
  if (!invitation) return { updated: false, firstResponseHours: null };

  // Keep the first response; later revisions do not reset the clock.
  if (invitation.respondedAt && invitation.firstResponseHours !== null) {
    return { updated: false, firstResponseHours: parseFloat(String(invitation.firstResponseHours)) };
  }

  const invitedAt = invitation.invitedAt ? new Date(invitation.invitedAt) : null;
  const firstResponseHours = invitedAt
    ? Math.max(0, (respondedAt.getTime() - invitedAt.getTime()) / MS_PER_HOUR)
    : null;

  const rfqRows = await db.select().from(vendorRfqs).where(eq(vendorRfqs.id, rfqId)).limit(1);
  const dueDate = rfqRows[0]?.quoteDueDate ? new Date(rfqRows[0].quoteDueDate) : null;

  await db
    .update(vendorRfqInvitations)
    .set({
      status: invitation.status === "declined" ? "declined" : "responded",
      respondedAt: invitation.respondedAt ?? respondedAt,
      firstResponseHours: firstResponseHours === null ? null : firstResponseHours.toFixed(2),
      respondedBeforeDueDate: dueDate ? respondedAt.getTime() <= dueDate.getTime() : null,
    })
    .where(eq(vendorRfqInvitations.id, invitation.id));

  return { updated: true, firstResponseHours };
}

/**
 * Close out invitations that are past their quote due date (plus grace) with no
 * reply. Without this, silent vendors sit as "sent" forever and never register
 * as unresponsive.
 */
export async function markStaleInvitationsNoResponse(
  options: { graceDays?: number; now?: Date } = {},
): Promise<{ closed: number }> {
  const db = await getDb();
  if (!db) return { closed: 0 };

  const now = options.now ?? new Date();
  const graceDays = options.graceDays ?? NO_RESPONSE_GRACE_DAYS;
  const cutoff = new Date(now.getTime() - graceDays * 24 * MS_PER_HOUR);

  // Joined rather than fetching every overdue RFQ id first: on a mature system
  // that id list would be unbounded.
  const stale = await db
    .select({ id: vendorRfqInvitations.id })
    .from(vendorRfqInvitations)
    .innerJoin(vendorRfqs, eq(vendorRfqs.id, vendorRfqInvitations.rfqId))
    .where(
      and(
        lte(vendorRfqs.quoteDueDate, cutoff),
        inArray(vendorRfqInvitations.status, ["pending", "sent", "viewed"] as any),
        isNull(vendorRfqInvitations.respondedAt),
      ),
    )
    .limit(MAX_INVITATIONS_CLOSED_PER_RUN);
  if (stale.length === 0) return { closed: 0 };

  await db
    .update(vendorRfqInvitations)
    .set({ status: "no_response", closedAt: now })
    .where(inArray(vendorRfqInvitations.id, stale.map(i => i.id)));

  if (stale.length === MAX_INVITATIONS_CLOSED_PER_RUN) {
    // Never let a capped run read as "everything is closed out".
    console.warn(
      `[VendorResponsiveness] Hit the ${MAX_INVITATIONS_CLOSED_PER_RUN}-invitation close-out cap; ` +
      `run again to clear the remainder.`,
    );
  }

  return { closed: stale.length };
}

// ─── Aggregation ───────────────────────────────────────────────────────

interface InvitationRow {
  vendorId: number;
  status: string;
  firstResponseHours: unknown;
  respondedBeforeDueDate: unknown;
}

/** Aggregate raw invitation rows into per-vendor metrics. Pure. */
export function aggregateInvitations(
  vendorIds: number[],
  rows: InvitationRow[],
): Map<number, ResponsivenessMetrics> {
  const byVendor = new Map<number, InvitationRow[]>();
  for (const id of vendorIds) byVendor.set(id, []);
  for (const row of rows) {
    if (!byVendor.has(row.vendorId)) byVendor.set(row.vendorId, []);
    byVendor.get(row.vendorId)!.push(row);
  }

  const out = new Map<number, ResponsivenessMetrics>();
  for (const [vendorId, invitations] of byVendor) {
    const responded = invitations.filter(i => i.status === "responded");
    const declined = invitations.filter(i => i.status === "declined");
    const noResponse = invitations.filter(i => i.status === "no_response");
    const pending = invitations.length - responded.length - declined.length - noResponse.length;
    const closed = responded.length + declined.length + noResponse.length;

    const hours = responded
      .map(i => (i.firstResponseHours === null || i.firstResponseHours === undefined
        ? NaN
        : parseFloat(String(i.firstResponseHours))))
      .filter(h => Number.isFinite(h))
      .sort((a, b) => a - b);

    const onTimeKnown = responded.filter(
      i => i.respondedBeforeDueDate !== null && i.respondedBeforeDueDate !== undefined,
    );
    const onTime = onTimeKnown.filter(i => !!i.respondedBeforeDueDate);

    out.set(vendorId, {
      vendorId,
      invited: invitations.length,
      responded: responded.length,
      declined: declined.length,
      noResponse: noResponse.length,
      pending,
      closed,
      averageResponseHours: hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : null,
      medianResponseHours: hours.length ? hours[Math.floor((hours.length - 1) / 2)] : null,
      responseRatePct: closed > 0 ? ((responded.length + declined.length) / closed) * 100 : null,
      onTimeRatePct: onTimeKnown.length > 0 ? (onTime.length / onTimeKnown.length) * 100 : null,
    });
  }
  return out;
}

/**
 * Turn measured behaviour into a 0-100 responsiveness score.
 *
 *   50%  did they answer at all (a prompt decline still counts as answering)
 *   30%  how fast the answer came
 *   20%  did it land before the quote due date
 *
 * Returns `score: null` when there is nothing to measure — callers must show
 * "no data" rather than substituting a flattering default.
 */
export function responsivenessScoreFromMetrics(m: ResponsivenessMetrics): ResponsivenessScore {
  if (m.closed === 0) {
    return {
      score: null,
      lowConfidence: true,
      details:
        m.pending > 0
          ? `${m.pending} RFQ invitation${m.pending === 1 ? "" : "s"} still open; no completed responses yet.`
          : "No RFQ invitations on record.",
    };
  }

  const responseRate = m.responseRatePct ?? 0;

  let speedScore: number;
  if (m.averageResponseHours === null) {
    speedScore = 0;
  } else if (m.averageResponseHours <= FAST_RESPONSE_HOURS) {
    speedScore = 100;
  } else if (m.averageResponseHours >= SLOW_RESPONSE_HOURS) {
    speedScore = 0;
  } else {
    speedScore =
      100 *
      (1 - (m.averageResponseHours - FAST_RESPONSE_HOURS) / (SLOW_RESPONSE_HOURS - FAST_RESPONSE_HOURS));
  }

  // With no due dates recorded, on-time is unmeasurable; fold its weight into
  // the response rate rather than scoring an unknown as a failure.
  const onTimeKnown = m.onTimeRatePct !== null;
  const score = onTimeKnown
    ? responseRate * 0.5 + speedScore * 0.3 + (m.onTimeRatePct as number) * 0.2
    : responseRate * 0.7 + speedScore * 0.3;

  const parts = [
    `${m.responded}/${m.closed} answered`,
    m.declined > 0 ? `${m.declined} declined` : null,
    m.noResponse > 0 ? `${m.noResponse} no reply` : null,
    m.averageResponseHours !== null ? `avg ${m.averageResponseHours.toFixed(1)}h to first reply` : null,
    onTimeKnown ? `${Math.round(m.onTimeRatePct as number)}% before due date` : null,
  ].filter(Boolean);

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    lowConfidence: m.closed < MIN_SAMPLE_FOR_CONFIDENCE,
    details: parts.join(", "),
  };
}

/** Metrics + score for one vendor over an optional window. */
export async function computeVendorResponsiveness(
  vendorId: number,
  window?: { since?: Date; until?: Date },
): Promise<ResponsivenessMetrics & { scoring: ResponsivenessScore }> {
  const map = await computeResponsivenessForVendors([vendorId], window);
  const metrics = map.get(vendorId)!;
  return { ...metrics, scoring: responsivenessScoreFromMetrics(metrics) };
}

/**
 * Batch version — one query for every vendor, so the monthly rollup and the
 * scoring service do not fan out per vendor.
 */
export async function computeResponsivenessForVendors(
  vendorIds: number[],
  window?: { since?: Date; until?: Date },
): Promise<Map<number, ResponsivenessMetrics>> {
  const unique = Array.from(new Set(vendorIds)).filter(id => Number.isFinite(id));
  if (unique.length === 0) return new Map();

  const db = await getDb();
  if (!db) return aggregateInvitations(unique, []);

  const conditions: any[] = [inArray(vendorRfqInvitations.vendorId, unique)];
  if (window?.since) {
    // Keep invitations sent before the window that are still open or that were
    // answered inside it, so a long-running RFQ is not silently dropped.
    conditions.push(
      or(
        gte(vendorRfqInvitations.invitedAt, window.since),
        gte(vendorRfqInvitations.respondedAt, window.since),
      ),
    );
  }
  if (window?.until) conditions.push(lte(vendorRfqInvitations.invitedAt, window.until));

  const rows = await db
    .select({
      vendorId: vendorRfqInvitations.vendorId,
      status: vendorRfqInvitations.status,
      firstResponseHours: vendorRfqInvitations.firstResponseHours,
      respondedBeforeDueDate: vendorRfqInvitations.respondedBeforeDueDate,
    })
    .from(vendorRfqInvitations)
    .where(and(...conditions));

  return aggregateInvitations(unique, rows as InvitationRow[]);
}
