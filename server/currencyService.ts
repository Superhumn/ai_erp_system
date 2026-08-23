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
