/**
 * FX rate feed — European Central Bank reference rates via Frankfurter
 *
 * `server/currencyService.ts` reads rates out of `currencyRates`; something has
 * to put them there. This is that something, for the currencies a published
 * reference exists for.
 *
 * Why ECB reference rates rather than a live trading feed: a quote comparison
 * has to be defensible months later. "We converted this EUR bid at the ECB
 * reference rate published on 2026-08-20" is a statement an auditor can check
 * against a public record. A mid-market snapshot from a trading API at an
 * unrecorded moment is not. The dated, once-a-day nature of these rates is the
 * feature, not a limitation.
 *
 * Two rules protect what is already stored:
 *
 *   1. A rate a person entered by hand is never overwritten by the feed. If
 *      someone typed the rate their bank actually gave them, that is better
 *      evidence than a reference rate, and the feed reports it as skipped.
 *   2. Nothing is written unless the whole response parses. A feed that changes
 *      shape, or returns an HTML error page with a 200, fails loudly rather
 *      than writing a partial or nonsense set of rates.
 *
 * Frankfurter covers roughly 30 currencies — the ECB's published set. It does
 * not cover CNY, INR, VND, THB and most other currencies procurement actually
 * buys in. Those stay manual, which is why `currency.upsert` and the bulk
 * paste-in exist alongside this.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "./db/connection";
import { currencyRates } from "../drizzle/schema";
import { normalizeCurrencyCode, startOfUtcDay, upsertCurrencyRate } from "./currencyService";
import { safeFetchHtml, BlockedUrlError } from "./webFetchGuard";
import { ENV } from "./_core/env";

/** Provenance written to `currencyRates.source` for anything this module stores. */
export const FX_FEED_SOURCE = "ecb_frankfurter";

/**
 * The public Frankfurter host. Kept here rather than in env.ts because it is
 * coupled to the response shape `parseFeedResponse` expects — changing one
 * without the other is the bug this proximity is meant to prevent.
 */
export const DEFAULT_FEED_BASE = "https://api.frankfurter.dev/v1";

/**
 * Where the feed lives. `FX_FEED_URL` points a deployment at a mirror or
 * self-hosted instance without a code change; the URL is fetched through the
 * SSRF guard either way — an env var is configuration, not a trusted input.
 */
export function feedBaseUrl(): string {
  return (ENV.fxFeedUrl || DEFAULT_FEED_BASE).replace(/\/+$/, "");
}

/** True when a deployment has overridden the feed URL. */
export function feedUrlIsOverridden(): boolean {
  return Boolean(ENV.fxFeedUrl);
}

/**
 * A rate outside this band is not a plausible FX rate against a major currency;
 * it is a parsing accident or a feed serving something else entirely. Refusing
 * is better than storing a number that silently multiplies a quote by 10^6.
 */
const MIN_PLAUSIBLE_RATE = 1e-6;
const MAX_PLAUSIBLE_RATE = 1e6;

export interface FeedRates {
  base: string;
  /** The date the feed says these rates are for, at UTC midnight. */
  asOf: Date;
  /** Target currency -> units of that currency per 1 unit of base. */
  rates: Record<string, number>;
}

export class FxFeedError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "FxFeedError";
  }
}

/**
 * Turn a feed response body into rates, or throw.
 *
 * Deliberately strict and separate from the fetch, because this is the part
 * that can be tested: the shape check is the whole defence against a feed that
 * changes under us.
 */
export function parseFeedResponse(body: string, expectedBase?: string): FeedRates {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    // An HTML error page served with a 200 lands here.
    throw new FxFeedError("Feed did not return JSON.", body.slice(0, 200));
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FxFeedError("Feed returned JSON that is not an object.");
  }
  const obj = payload as Record<string, unknown>;

  const base = normalizeCurrencyCode(typeof obj.base === "string" ? obj.base : null);
  if (!base) {
    throw new FxFeedError("Feed response has no usable `base` currency.");
  }
  if (expectedBase && base !== expectedBase) {
    throw new FxFeedError(`Asked for base ${expectedBase} but the feed answered with ${base}.`);
  }

  if (typeof obj.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) {
    throw new FxFeedError("Feed response has no usable `date` (expected YYYY-MM-DD).");
  }
  const asOf = new Date(`${obj.date}T00:00:00.000Z`);
  if (Number.isNaN(asOf.getTime())) {
    throw new FxFeedError(`Feed returned an unparseable date: ${obj.date}`);
  }

  const rawRates = obj.rates;
  if (!rawRates || typeof rawRates !== "object" || Array.isArray(rawRates)) {
    throw new FxFeedError("Feed response has no `rates` object.");
  }

  // Frankfurter echoes the `amount` it quoted for. We always ask for 1; if it
  // ever answers for something else the rates mean something different.
  if (obj.amount !== undefined && Number(obj.amount) !== 1) {
    throw new FxFeedError(`Feed quoted for amount ${String(obj.amount)}, expected 1.`);
  }

  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(rawRates as Record<string, unknown>)) {
    const currency = normalizeCurrencyCode(code);
    if (!currency) continue; // a key that is not a currency code is not ours to interpret
    const rate = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new FxFeedError(`Feed returned a non-numeric rate for ${currency}: ${String(value)}`);
    }
    if (rate < MIN_PLAUSIBLE_RATE || rate > MAX_PLAUSIBLE_RATE) {
      throw new FxFeedError(`Feed returned an implausible rate for ${currency}: ${rate}`);
    }
    rates[currency] = rate;
  }

  if (Object.keys(rates).length === 0) {
    throw new FxFeedError("Feed returned no usable rates.");
  }

  return { base, asOf, rates };
}

/** `2026-08-20`, in UTC — the path segment the feed wants for a historical day. */
function isoDay(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export interface FetchFeedOptions {
  base?: string;
  /** Restrict to these currencies. Omit to take everything the feed publishes. */
  symbols?: string[];
  /** Ask for a specific day rather than the latest publication. */
  asOf?: Date;
  timeoutMs?: number;
}

/**
 * Fetch and parse, without touching the database.
 *
 * Goes through `safeFetchHtml` for the SSRF guard, size cap and timeout — the
 * feed URL is configurable, so it gets the same treatment as any other
 * third-party URL this system fetches.
 */
export async function fetchFeedRates(options: FetchFeedOptions = {}): Promise<FeedRates> {
  const base = normalizeCurrencyCode(options.base) ?? "USD";
  const symbols = (options.symbols ?? [])
    .map(normalizeCurrencyCode)
    .filter((c): c is string => Boolean(c) && c !== base);

  const path = options.asOf ? isoDay(options.asOf) : "latest";
  const query = new URLSearchParams({ base });
  if (symbols.length > 0) query.set("symbols", Array.from(new Set(symbols)).join(","));

  const url = `${feedBaseUrl()}/${path}?${query.toString()}`;

  let response;
  try {
    response = await safeFetchHtml(url, { timeoutMs: options.timeoutMs ?? 10_000 });
  } catch (e) {
    if (e instanceof BlockedUrlError) {
      throw new FxFeedError(`Feed URL was refused by the fetch guard: ${e.message}`);
    }
    throw new FxFeedError(
      `Could not reach the FX feed at ${url}.`,
      e instanceof Error ? e.message : String(e),
    );
  }

  if (!response.ok) {
    throw new FxFeedError(
      `FX feed returned HTTP ${response.status}.`,
      response.body.slice(0, 200) || undefined,
    );
  }

  return parseFeedResponse(response.body, base);
}

export interface RefreshResult {
  base: string;
  asOf: Date;
  /** Pairs written, as `USD->EUR`. */
  written: string[];
  /** Pairs left alone because a person had entered that rate by hand. */
  skippedManual: string[];
  fetchedCount: number;
}

/**
 * Fetch the feed and store what it returns, one row per pair.
 *
 * Stores the base->target direction only. `getFxRate` already resolves the
 * inverse and the USD-triangulated path from that, so storing both directions
 * would just be two rows that can disagree.
 */
export async function refreshFxRatesFromFeed(
  options: FetchFeedOptions & { createdBy?: number } = {},
): Promise<RefreshResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const feed = await fetchFeedRates(options);

  const written: string[] = [];
  const skippedManual: string[] = [];

  for (const [target, rate] of Object.entries(feed.rates)) {
    const existing = await db
      .select()
      .from(currencyRates)
      .where(
        and(
          eq(currencyRates.fromCurrency, feed.base),
          eq(currencyRates.toCurrency, target),
          eq(currencyRates.asOf, feed.asOf),
        ),
      )
      .limit(1);

    // A rate someone typed in is better evidence than a reference rate — it is
    // probably what their bank actually charged. Never clobber it.
    if (existing[0] && existing[0].source === "manual") {
      skippedManual.push(`${feed.base}->${target}`);
      continue;
    }

    await upsertCurrencyRate({
      fromCurrency: feed.base,
      toCurrency: target,
      rate,
      asOf: feed.asOf,
      source: FX_FEED_SOURCE,
      notes: `ECB reference rate published ${isoDay(feed.asOf)}`,
      createdBy: options.createdBy,
    });
    written.push(`${feed.base}->${target}`);
  }

  return {
    base: feed.base,
    asOf: feed.asOf,
    written,
    skippedManual,
    fetchedCount: Object.keys(feed.rates).length,
  };
}
