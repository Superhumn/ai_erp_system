// FX conversion for multi-entity money (STEP 4).
//
// A money row stores three amounts + the rate frozen at its transaction date:
//   amount_txn / currency_txn : what was actually transacted (existing amount + `currency`)
//   amount_func               : the entity's functional (reporting) currency
//   amount_group              : group reporting currency (USD)
//   fx_rate_used / fx_rate_date : the rate applied, frozen at the transaction date
//
// Historical rows are NEVER recomputed. Rates are looked up as the most recent published rate on
// or before the transaction date. The pure helpers below are unit-tested without a database.
import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "./db";
import { fxRates } from "../drizzle/schema";

export const GROUP_CURRENCY = "USD";

/** Pure: pick the applicable rate from candidate rows — same currency → 1, else the most recent
 *  rate on or before `asOf`, or null if none is available yet. */
export function pickRate(
  candidates: { rate: string | number; asOfDate: Date }[],
  from: string,
  to: string,
  asOf: Date,
): number | null {
  if (from === to) return 1;
  const eligible = candidates
    .filter((r) => r.asOfDate.getTime() <= asOf.getTime())
    .sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime());
  return eligible.length ? Number(eligible[0].rate) : null;
}

/** Pure: apply a rate to an amount. */
export function convertAmount(amount: number, rate: number): number {
  return amount * rate;
}

/** DB-backed rate lookup, frozen at `asOf` (most recent published rate on or before that date). */
export async function getFxRate(from: string, to: string, asOf: Date): Promise<number | null> {
  if (from === to) return 1;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ rate: fxRates.rate, asOfDate: fxRates.asOfDate })
    .from(fxRates)
    .where(and(eq(fxRates.fromCcy, from), eq(fxRates.toCcy, to), lte(fxRates.asOfDate, asOf)))
    .orderBy(desc(fxRates.asOfDate))
    .limit(1);
  return rows.length ? Number(rows[0].rate) : null;
}

/**
 * Compute the frozen money triple for a transaction amount. Returns nulls for amounts whose rate
 * isn't available yet (caller stores what it can; a backfill can fill the rest once rates exist).
 */
export async function computeMoneyTriple(opts: {
  amountTxn: number;
  currencyTxn: string;
  functionalCurrency: string;
  asOf: Date;
}): Promise<{ amountFunc: number | null; amountGroup: number | null; fxRateUsed: number | null; fxRateDate: Date }> {
  const { amountTxn, currencyTxn, functionalCurrency, asOf } = opts;
  const funcRate = await getFxRate(currencyTxn, functionalCurrency, asOf);
  const groupRate = await getFxRate(currencyTxn, GROUP_CURRENCY, asOf);
  return {
    amountFunc: funcRate == null ? null : convertAmount(amountTxn, funcRate),
    amountGroup: groupRate == null ? null : convertAmount(amountTxn, groupRate),
    fxRateUsed: groupRate, // rate to the group currency, frozen at asOf
    fxRateDate: asOf,
  };
}
