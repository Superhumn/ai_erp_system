/**
 * Currency Service
 *
 * Deterministic FX lookup and conversion backed by the `currencyRates` table.
 * No LLM involvement: a quote in EUR and a quote in USD must compare on a rate
 * we can point an auditor at, with the as-of date and source recorded alongside
 * the converted number.
 *
 * Resolution order for a pair:
 *   1. identity      — from === to
 *   2. direct        — a stored from->to row
 *   3. inverse       — a stored to->from row, reciprocated
 *   4. triangulated  — from->PIVOT->to (USD pivot by default)
 *
 * Every lookup picks the newest row with `asOf <= requested date`, so historical
 * quotes are converted at the rate that was current when they were received
 * rather than at today's rate.
 */

import { and, desc, eq, lte, or } from "drizzle-orm";
import { getDb } from "./db/connection";
import { currencyRates } from "../drizzle/schema";

export const DEFAULT_BASE_CURRENCY = "USD";
const PIVOT_CURRENCY = "USD";

export type FxRateSource = "identity" | "direct" | "inverse" | "triangulated";

export interface FxRate {
  from: string;
  to: string;
  /** Multiply an amount in `from` by this to get `to`. */
  rate: number;
  asOf: Date;
  source: FxRateSource;
  /** Provenance of the underlying stored row(s), e.g. "manual", "ecb". */
  provider: string;
}

export interface ConversionResult {
  amount: number;
  fx: FxRate;
}

/** Uppercase + validate an ISO-4217-ish code. Returns null when unusable. */
export function normalizeCurrencyCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = String(code).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

/** Coerce to a currency code, falling back to `fallback` when unusable. */
export function currencyOr(code: string | null | undefined, fallback = DEFAULT_BASE_CURRENCY): string {
  return normalizeCurrencyCode(code) ?? fallback;
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : NaN;
}

// ─── Rate lookup ───────────────────────────────────────────────────────

/**
 * Newest stored row for either direction of a pair with asOf <= `asOf`.
 * One query covers both directions so the caller can prefer whichever is fresher.
 */
async function findStoredRate(
  from: string,
  to: string,
  asOf: Date,
): Promise<{ rate: number; asOf: Date; provider: string; inverted: boolean } | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(currencyRates)
    .where(
      and(
        or(
          and(eq(currencyRates.fromCurrency, from), eq(currencyRates.toCurrency, to)),
          and(eq(currencyRates.fromCurrency, to), eq(currencyRates.toCurrency, from)),
        ),
        lte(currencyRates.asOf, asOf),
      ),
    )
    .orderBy(desc(currencyRates.asOf))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const rate = toNumber(row.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const inverted = row.fromCurrency.toUpperCase() !== from;
  return {
    rate: inverted ? 1 / rate : rate,
    asOf: new Date(row.asOf),
    provider: row.source || "manual",
    inverted,
  };
}

/**
 * Resolve the rate that converts 1 unit of `from` into `to` as of a date.
 * Returns null when no path exists — callers must surface that rather than
 * silently treating foreign currency as base currency.
 */
export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  asOf: Date = new Date(),
): Promise<FxRate | null> {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (!from || !to) return null;

  if (from === to) {
    return { from, to, rate: 1, asOf, source: "identity", provider: "identity" };
  }

  const direct = await findStoredRate(from, to, asOf);
  if (direct) {
    return {
      from,
      to,
      rate: direct.rate,
      asOf: direct.asOf,
      source: direct.inverted ? "inverse" : "direct",
      provider: direct.provider,
    };
  }

  // Triangulate through the pivot when neither leg is the pivot itself
  // (if one were, the direct lookup above would already have covered it).
  if (from !== PIVOT_CURRENCY && to !== PIVOT_CURRENCY) {
    const [legA, legB] = await Promise.all([
      findStoredRate(from, PIVOT_CURRENCY, asOf),
      findStoredRate(PIVOT_CURRENCY, to, asOf),
    ]);
    if (legA && legB) {
      return {
        from,
        to,
        rate: legA.rate * legB.rate,
        // The older of the two legs bounds how current the combined rate is.
        asOf: legA.asOf < legB.asOf ? legA.asOf : legB.asOf,
        source: "triangulated",
        provider: `${legA.provider}+${legB.provider} via ${PIVOT_CURRENCY}`,
      };
    }
  }

  return null;
}

/** Convert an amount, or null when no rate is available for the pair. */
export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  asOf: Date = new Date(),
): Promise<ConversionResult | null> {
  if (!Number.isFinite(amount)) return null;
  const fx = await getFxRate(fromCurrency, toCurrency, asOf);
  if (!fx) return null;
  return { amount: amount * fx.rate, fx };
}

/**
 * Resolve every rate needed to convert a set of currencies into `toCurrency`
 * in one pass. Missing pairs are simply absent from the map.
 */
export async function getFxRateTable(
  fromCurrencies: string[],
  toCurrency: string,
  asOf: Date = new Date(),
): Promise<Map<string, FxRate>> {
  const unique = Array.from(
    new Set(fromCurrencies.map(c => normalizeCurrencyCode(c)).filter((c): c is string => !!c)),
  );
  const entries = await Promise.all(
    unique.map(async from => [from, await getFxRate(from, toCurrency, asOf)] as const),
  );
  const table = new Map<string, FxRate>();
  for (const [from, fx] of entries) if (fx) table.set(from, fx);
  return table;
}

// ─── Rate management ───────────────────────────────────────────────────

export interface UpsertRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf?: Date;
  source?: string;
  notes?: string;
  createdBy?: number;
}

/**
 * Store a rate for a pair on a given day. Re-posting the same pair/day replaces
 * the value rather than stacking duplicates (the table's unique index is on
 * from/to/asOf, and we normalize asOf to midnight UTC so "today's rate" is one row).
 */
export async function upsertCurrencyRate(input: UpsertRateInput): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const from = normalizeCurrencyCode(input.fromCurrency);
  const to = normalizeCurrencyCode(input.toCurrency);
  if (!from || !to) throw new Error("Invalid currency code");
  if (from === to) throw new Error("Cannot store a rate for a currency against itself");
  if (!Number.isFinite(input.rate) || input.rate <= 0) throw new Error("Rate must be a positive number");

  const asOf = startOfUtcDay(input.asOf ?? new Date());

  const existing = await db
    .select()
    .from(currencyRates)
    .where(
      and(
        eq(currencyRates.fromCurrency, from),
        eq(currencyRates.toCurrency, to),
        eq(currencyRates.asOf, asOf),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(currencyRates)
      .set({
        rate: input.rate.toString(),
        source: input.source || "manual",
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? existing[0].createdBy ?? null,
      })
      .where(eq(currencyRates.id, existing[0].id));
    return { id: existing[0].id };
  }

  const result = await db.insert(currencyRates).values({
    fromCurrency: from,
    toCurrency: to,
    rate: input.rate.toString(),
    asOf,
    source: input.source || "manual",
    notes: input.notes ?? null,
    createdBy: input.createdBy ?? null,
  });
  return { id: (result as any)[0].insertId as number };
}

/** Midnight UTC of the given date, so one calendar day holds one rate per pair. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function listCurrencyRates(filters?: {
  fromCurrency?: string;
  toCurrency?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  const from = normalizeCurrencyCode(filters?.fromCurrency);
  const to = normalizeCurrencyCode(filters?.toCurrency);
  if (from) conditions.push(eq(currencyRates.fromCurrency, from));
  if (to) conditions.push(eq(currencyRates.toCurrency, to));

  const query = db.select().from(currencyRates);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return filtered.orderBy(desc(currencyRates.asOf)).limit(filters?.limit ?? 100);
}

export async function deleteCurrencyRate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(currencyRates).where(eq(currencyRates.id, id));
}

// ─── Bulk entry ────────────────────────────────────────────────────────
//
// The feed covers the ECB's ~30 currencies. Procurement buys in CNY, INR, VND,
// THB and plenty of others it does not publish, so those rates arrive as a list
// someone pastes out of a bank statement or a broker's email. This parses that
// list rather than making them fill in one form per currency.

export interface ParsedRateLine {
  line: number;
  raw: string;
  fromCurrency?: string;
  toCurrency?: string;
  rate?: number;
  error?: string;
}

/**
 * Read pasted rate lines. Accepts the shapes people actually paste:
 *
 *   CNY 7.24            (base -> CNY, base supplied by the caller)
 *   CNY, 7.24
 *   USD/CNY 7.24
 *   USD -> CNY 7.24
 *   1 USD = 7.24 CNY
 *
 * Blank lines are skipped, and anything from a `#` to the end of a line is
 * treated as a comment — whole-line or trailing. A line that cannot be read is
 * returned with an `error` rather than dropped, so the caller can show which
 * line was wrong instead of silently importing fewer rates than were pasted.
 */
export function parseRatePaste(
  text: string,
  options: { base?: string } = {},
): ParsedRateLine[] {
  const base = normalizeCurrencyCode(options.base) ?? DEFAULT_BASE_CURRENCY;
  const out: ParsedRateLine[] = [];

  const lines = String(text ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    // A trailing note is common when someone annotates a pasted list
    // ("CNY 7.24  # from the bank"), so strip from the first # rather than only
    // skipping whole comment lines. No currency code or rate contains one.
    const withoutComment = raw.split("#")[0].trim();
    if (!withoutComment) continue;

    const entry: ParsedRateLine = { line: i + 1, raw };
    // Commas and tabs are separators here, never decimal marks — a pasted
    // "1,234.5" would be ambiguous, so it is rejected below rather than guessed.
    const cleaned = withoutComment.replace(/[,\t]+/g, " ").replace(/\s+/g, " ").trim();

    let from: string | null = null;
    let to: string | null = null;
    let rateText: string | null = null;

    // 1 USD = 7.24 CNY
    const equation = cleaned.match(/^1\s+([A-Za-z]{3})\s*=\s*([-+]?[\d.]+)\s+([A-Za-z]{3})$/);
    // USD/CNY 7.24  |  USD->CNY 7.24  |  USD CNY 7.24
    const pair = cleaned.match(/^([A-Za-z]{3})\s*(?:\/|->|→|\s)\s*([A-Za-z]{3})\s+([-+]?[\d.]+)$/);
    // CNY 7.24
    const single = cleaned.match(/^([A-Za-z]{3})\s+([-+]?[\d.]+)$/);

    if (equation) {
      from = normalizeCurrencyCode(equation[1]);
      rateText = equation[2];
      to = normalizeCurrencyCode(equation[3]);
    } else if (pair) {
      from = normalizeCurrencyCode(pair[1]);
      to = normalizeCurrencyCode(pair[2]);
      rateText = pair[3];
    } else if (single) {
      from = base;
      to = normalizeCurrencyCode(single[1]);
      rateText = single[2];
    } else {
      entry.error = "Could not read a currency and a rate from this line.";
      out.push(entry);
      continue;
    }

    if (!from || !to) {
      entry.error = "Not a valid three-letter currency code.";
      out.push(entry);
      continue;
    }
    if (from === to) {
      entry.error = `A rate from ${from} to itself is always 1.`;
      out.push(entry);
      continue;
    }

    const rate = Number(rateText);
    if (!Number.isFinite(rate) || rate <= 0) {
      entry.error = `"${rateText}" is not a positive number.`;
      out.push(entry);
      continue;
    }

    entry.fromCurrency = from;
    entry.toCurrency = to;
    entry.rate = rate;
    out.push(entry);
  }

  return out;
}
