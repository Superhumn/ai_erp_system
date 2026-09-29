/**
 * Bank-to-payment reconciliation: pure matching logic.
 *
 * A bank line (Mercury feed, `bank_transactions`) is matched to the `payments` row it settles.
 * Rules:
 *   - the amount must match to the cent, with the sign mapped to the payment type
 *     (money out / debit ↔ "made", money in / credit ↔ "received");
 *   - the payment date must fall within ±MATCH_WINDOW_DAYS of the bank date (closer scores higher);
 *   - a reference number or payee (vendor / customer) name appearing in the bank description or
 *     counterparty boosts confidence.
 *
 * No I/O here: the router loads the rows, this module scores them.
 */

export const MATCH_WINDOW_DAYS = 5;
export const DEFAULT_AUTO_MATCH_CONFIDENCE = 90;

export const RECONCILIATION_STATUSES = ["unreconciled", "suggested", "reconciled", "excluded"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export type PaymentDirection = "made" | "received";

export interface BankLineInput {
  /** Signed amount: negative = money out (debit), positive = money in (credit). */
  amount: number;
  date: Date;
  description?: string | null;
  counterpartyName?: string | null;
}

export interface PaymentCandidate {
  id: number;
  type: PaymentDirection;
  amount: string | number;
  paymentDate: Date;
  referenceNumber?: string | null;
  paymentNumber?: string | null;
  status?: string | null;
  vendorName?: string | null;
  customerName?: string | null;
}

export interface MatchSuggestion<P extends PaymentCandidate = PaymentCandidate> {
  paymentId: number;
  payment: P;
  confidence: number;
  daysApart: number;
  reasons: string[];
}

const DAY_MS = 86_400_000;

// Scoring weights. An exact amount on the same day scores 85; it takes a reference or payee
// hit on top to clear the default auto-match threshold of 90.
const SCORE_AMOUNT = 60;
const SCORE_DATE_MAX = 25;
const SCORE_DATE_STEP = SCORE_DATE_MAX / MATCH_WINDOW_DAYS;
const SCORE_REFERENCE = 15;
const SCORE_NAME_FULL = 10;
const SCORE_NAME_PARTIAL = 5;

/** Words too generic to identify a payee on a bank statement. */
const STOPWORDS = new Set([
  "inc", "llc", "ltd", "corp", "co", "company", "the", "and", "of",
  "ach", "wire", "payment", "pmt", "transfer", "xfer", "debit", "credit", "deposit",
  "from", "to", "for", "pos", "card", "online", "bank", "usa", "us",
]);

/** Integer cents, rounding away float noise ("1200.00" and 1199.999999 → 120000). */
export function toCents(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

/** Map a bank line's signed amount to the payment type that would settle it; null for zero. */
export function directionForAmount(signedAmount: number): PaymentDirection | null {
  if (signedAmount < 0) return "made";
  if (signedAmount > 0) return "received";
  return null;
}

/** Signed amount of a stored bank line (amount is stored positive, `type` carries the sign). */
export function signedBankAmount(line: { amount: string | number; type: "debit" | "credit" | string }): number {
  const abs = Math.abs(typeof line.amount === "number" ? line.amount : Number.parseFloat(line.amount));
  return line.type === "debit" ? -abs : abs;
}

function utcDay(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS);
}

/** Whole calendar days (UTC) between two dates, always ≥ 0. */
export function daysBetween(a: Date, b: Date): number {
  return Math.abs(utcDay(a) - utcDay(b));
}

/** The paymentDate window to search for a bank line dated `date`. */
export function candidateWindow(date: Date, days: number = MATCH_WINDOW_DAYS): { from: Date; to: Date } {
  const start = new Date(utcDay(date) * DAY_MS - days * DAY_MS);
  const end = new Date(utcDay(date) * DAY_MS + (days + 1) * DAY_MS - 1);
  return { from: start, to: end };
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function normalizeRef(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatUsd(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Score one candidate against a bank line. Returns null when a hard rule fails
 * (direction, amount, date window, or a failed / cancelled payment).
 */
export function scoreCandidate<P extends PaymentCandidate>(line: BankLineInput, payment: P): MatchSuggestion<P> | null {
  const direction = directionForAmount(line.amount);
  if (!direction || payment.type !== direction) return null;
  if (payment.status === "failed" || payment.status === "cancelled") return null;

  const lineCents = Math.abs(toCents(line.amount));
  const paymentCents = Math.abs(toCents(payment.amount));
  if (!Number.isFinite(paymentCents) || lineCents !== paymentCents) return null;

  const daysApart = daysBetween(line.date, payment.paymentDate);
  if (daysApart > MATCH_WINDOW_DAYS) return null;

  const reasons: string[] = [`Amount matches exactly (${formatUsd(lineCents)})`];
  let score = SCORE_AMOUNT;

  score += SCORE_DATE_MAX - SCORE_DATE_STEP * daysApart;
  reasons.push(daysApart === 0 ? "Same day" : `${daysApart} day${daysApart === 1 ? "" : "s"} apart`);

  const haystackText = `${line.description ?? ""} ${line.counterpartyName ?? ""}`;
  const haystackRef = normalizeRef(haystackText);
  const haystackTokens = new Set(tokenize(haystackText));

  const refs = [payment.referenceNumber, payment.paymentNumber].filter((r): r is string => !!r && normalizeRef(r).length >= 3);
  const refHit = refs.find((r) => haystackRef.includes(normalizeRef(r)));
  if (refHit) {
    score += SCORE_REFERENCE;
    reasons.push(`Reference ${refHit} found in bank description`);
  }

  const payee = payment.type === "made" ? payment.vendorName : payment.customerName;
  const payeeTokens = [...new Set(tokenize(payee))];
  if (payee && payeeTokens.length > 0) {
    const hits = payeeTokens.filter((t) => haystackTokens.has(t)).length;
    if (hits === payeeTokens.length) {
      score += SCORE_NAME_FULL;
      reasons.push(`${payment.type === "made" ? "Vendor" : "Customer"} name matches (${payee})`);
    } else if (hits > 0) {
      score += SCORE_NAME_PARTIAL;
      reasons.push(`${payment.type === "made" ? "Vendor" : "Customer"} name partly matches (${payee})`);
    }
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));
  return { paymentId: payment.id, payment, confidence, daysApart, reasons };
}

/** Rank candidates for a bank line: highest confidence first, then closest date, then lowest id. */
export function rankCandidates<P extends PaymentCandidate>(line: BankLineInput, candidates: readonly P[]): MatchSuggestion<P>[] {
  const out: MatchSuggestion<P>[] = [];
  for (const c of candidates) {
    const s = scoreCandidate(line, c);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.daysApart - b.daysApart || a.paymentId - b.paymentId);
}

/**
 * Why a manual match is not allowed, or null when the payment can settle the line. Manual
 * matches skip the date window (the user may know better) but never the amount or direction.
 */
export function manualMatchProblem(line: BankLineInput, payment: Pick<PaymentCandidate, "type" | "amount" | "status">): string | null {
  const direction = directionForAmount(line.amount);
  if (!direction) return "Bank line has a zero amount";
  if (payment.type !== direction) {
    return direction === "made"
      ? "Bank line is money out; only a payment made can match it"
      : "Bank line is money in; only a payment received can match it";
  }
  if (payment.status === "failed" || payment.status === "cancelled") return `Payment is ${payment.status}`;
  if (Math.abs(toCents(line.amount)) !== Math.abs(toCents(payment.amount))) {
    return `Amount differs: bank ${formatUsd(toCents(line.amount))} vs payment ${formatUsd(toCents(payment.amount))}`;
  }
  return null;
}

export interface AutoMatchLine<P extends PaymentCandidate = PaymentCandidate> {
  bankTransactionId: number;
  suggestions: MatchSuggestion<P>[];
}

export interface AutoMatchPlan {
  /** Lines to reconcile now: exactly one suggestion at/above the threshold, payment not contested. */
  matches: Array<{ bankTransactionId: number; paymentId: number; confidence: number }>;
  /** Lines with a candidate but no safe auto-match (several above threshold, contested, or below it). */
  needsReview: number[];
  /** Lines with no candidate at all. */
  noCandidates: number[];
}

/**
 * Decide which lines auto-match may reconcile. A line qualifies only when exactly one of its
 * suggestions reaches `minConfidence`, and no other line in the batch claims that same payment
 * as its sole high-confidence match.
 */
export function planAutoMatch(lines: readonly AutoMatchLine[], minConfidence: number = DEFAULT_AUTO_MATCH_CONFIDENCE): AutoMatchPlan {
  const plan: AutoMatchPlan = { matches: [], needsReview: [], noCandidates: [] };
  const sole = new Map<number, { paymentId: number; confidence: number }>();
  const claims = new Map<number, number>();

  for (const line of lines) {
    if (line.suggestions.length === 0) {
      plan.noCandidates.push(line.bankTransactionId);
      continue;
    }
    const high = line.suggestions.filter((s) => s.confidence >= minConfidence);
    if (high.length === 1) {
      sole.set(line.bankTransactionId, { paymentId: high[0].paymentId, confidence: high[0].confidence });
      claims.set(high[0].paymentId, (claims.get(high[0].paymentId) ?? 0) + 1);
    }
  }

  for (const line of lines) {
    if (line.suggestions.length === 0) continue;
    const pick = sole.get(line.bankTransactionId);
    if (pick && claims.get(pick.paymentId) === 1) {
      plan.matches.push({ bankTransactionId: line.bankTransactionId, ...pick });
    } else {
      plan.needsReview.push(line.bankTransactionId);
    }
  }
  return plan;
}

export interface SummaryRow {
  status: ReconciliationStatus | null;
  type: "debit" | "credit" | string;
  count: number | string;
  total: number | string | null;
}

export interface StatusTotals {
  count: number;
  /** Money in (credits), positive. */
  inflow: number;
  /** Money out (debits), positive. */
  outflow: number;
  /** inflow + outflow — gross value of the lines. */
  total: number;
}

export type ReconciliationSummary = Record<ReconciliationStatus, StatusTotals> & { all: StatusTotals };

const emptyTotals = (): StatusTotals => ({ count: 0, inflow: 0, outflow: 0, total: 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fold grouped (status, type) rows into per-status counts and totals. A null status is "unreconciled". */
export function summarizeReconciliation(rows: readonly SummaryRow[]): ReconciliationSummary {
  const out: ReconciliationSummary = {
    unreconciled: emptyTotals(),
    suggested: emptyTotals(),
    reconciled: emptyTotals(),
    excluded: emptyTotals(),
    all: emptyTotals(),
  };
  for (const row of rows) {
    const status: ReconciliationStatus = row.status && RECONCILIATION_STATUSES.includes(row.status) ? row.status : "unreconciled";
    const count = Number(row.count) || 0;
    const amount = Math.abs(Number(row.total) || 0);
    for (const bucket of [out[status], out.all]) {
      bucket.count += count;
      if (row.type === "credit") bucket.inflow = round2(bucket.inflow + amount);
      else bucket.outflow = round2(bucket.outflow + amount);
      bucket.total = round2(bucket.inflow + bucket.outflow);
    }
  }
  return out;
}
