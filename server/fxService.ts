/**
 * FX Rate Management Service
 *
 * Manages exchange rates, converts currencies, and computes
 * realized/unrealized FX gains and losses.
 */

import * as db from "./db";

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

/**
 * Convert an amount from one currency to another using the latest rate.
 */
export async function convertCurrency(
  fromCurrency: string,
  toCurrency: string,
  amount: number,
  date?: Date
): Promise<{ convertedAmount: number; rate: number; rateDate: Date | null }> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1, rateDate: null };
  }

  // Try direct rate
  let rateRecord = await db.getExchangeRate(fromCurrency, toCurrency, date);
  if (rateRecord) {
    const rate = toNum(rateRecord.rate);
    return {
      convertedAmount: amount * rate,
      rate,
      rateDate: rateRecord.rateDate,
    };
  }

  // Try inverse rate
  rateRecord = await db.getExchangeRate(toCurrency, fromCurrency, date);
  if (rateRecord) {
    const rate = 1 / toNum(rateRecord.rate);
    return {
      convertedAmount: amount * rate,
      rate,
      rateDate: rateRecord.rateDate,
    };
  }

  throw new Error(`No exchange rate found for ${fromCurrency}/${toCurrency}`);
}

/**
 * Calculate realized FX gain/loss when a foreign-currency invoice is paid
 * at a different rate than when it was booked.
 */
export async function calculateRealizedGainLoss(params: {
  companyId?: number;
  entityType: string;
  entityId: number;
  originalCurrency: string;
  functionalCurrency: string;
  originalAmount: number;
  originalRate: number;
  settlementRate: number;
}) {
  const originalFunctional = params.originalAmount * params.originalRate;
  const settlementFunctional = params.originalAmount * params.settlementRate;
  const gainLoss = settlementFunctional - originalFunctional;

  const result = await db.createFxGainLoss({
    companyId: params.companyId,
    type: "realized",
    entityType: params.entityType,
    entityId: params.entityId,
    originalCurrency: params.originalCurrency,
    functionalCurrency: params.functionalCurrency,
    originalAmount: params.originalAmount.toFixed(2),
    originalRate: params.originalRate.toFixed(8),
    settlementRate: params.settlementRate.toFixed(8),
    gainLossAmount: gainLoss.toFixed(2),
    periodDate: new Date(),
  });

  return {
    id: result.id,
    type: "realized" as const,
    originalFunctionalAmount: originalFunctional.toFixed(2),
    settlementFunctionalAmount: settlementFunctional.toFixed(2),
    gainLossAmount: gainLoss.toFixed(2),
    isGain: gainLoss >= 0,
  };
}

/**
 * Calculate unrealized FX gain/loss for open foreign-currency invoices
 * at period-end (revaluation).
 */
export async function calculateUnrealizedGainLoss(params: {
  companyId?: number;
  entityType: string;
  entityId: number;
  originalCurrency: string;
  functionalCurrency: string;
  originalAmount: number;
  bookRate: number;
  periodEndDate?: Date;
}) {
  const periodDate = params.periodEndDate || new Date();

  // Get current rate
  const currentRateRecord = await db.getExchangeRate(
    params.originalCurrency,
    params.functionalCurrency,
    periodDate
  );

  let currentRate: number;
  if (currentRateRecord) {
    currentRate = toNum(currentRateRecord.rate);
  } else {
    // Try inverse
    const inverseRate = await db.getExchangeRate(
      params.functionalCurrency,
      params.originalCurrency,
      periodDate
    );
    if (!inverseRate) {
      throw new Error(
        `No exchange rate found for ${params.originalCurrency}/${params.functionalCurrency}`
      );
    }
    currentRate = 1 / toNum(inverseRate.rate);
  }

  const bookedFunctional = params.originalAmount * params.bookRate;
  const currentFunctional = params.originalAmount * currentRate;
  const gainLoss = currentFunctional - bookedFunctional;

  const result = await db.createFxGainLoss({
    companyId: params.companyId,
    type: "unrealized",
    entityType: params.entityType,
    entityId: params.entityId,
    originalCurrency: params.originalCurrency,
    functionalCurrency: params.functionalCurrency,
    originalAmount: params.originalAmount.toFixed(2),
    originalRate: params.bookRate.toFixed(8),
    settlementRate: currentRate.toFixed(8),
    gainLossAmount: gainLoss.toFixed(2),
    periodDate,
  });

  return {
    id: result.id,
    type: "unrealized" as const,
    bookedFunctionalAmount: bookedFunctional.toFixed(2),
    currentFunctionalAmount: currentFunctional.toFixed(2),
    gainLossAmount: gainLoss.toFixed(2),
    currentRate: currentRate.toFixed(8),
    isGain: gainLoss >= 0,
  };
}

/**
 * Get FX gain/loss summary for a period.
 */
export async function getFxSummary(companyId?: number) {
  const allRecords = await db.getFxGainLosses(companyId);

  const realized = allRecords.filter((r) => r.type === "realized");
  const unrealized = allRecords.filter((r) => r.type === "unrealized");

  return {
    realizedGainLoss: {
      count: realized.length,
      totalGains: realized
        .filter((r) => toNum(r.gainLossAmount) >= 0)
        .reduce((s, r) => s + toNum(r.gainLossAmount), 0)
        .toFixed(2),
      totalLosses: realized
        .filter((r) => toNum(r.gainLossAmount) < 0)
        .reduce((s, r) => s + toNum(r.gainLossAmount), 0)
        .toFixed(2),
      netAmount: realized.reduce((s, r) => s + toNum(r.gainLossAmount), 0).toFixed(2),
    },
    unrealizedGainLoss: {
      count: unrealized.length,
      totalGains: unrealized
        .filter((r) => toNum(r.gainLossAmount) >= 0)
        .reduce((s, r) => s + toNum(r.gainLossAmount), 0)
        .toFixed(2),
      totalLosses: unrealized
        .filter((r) => toNum(r.gainLossAmount) < 0)
        .reduce((s, r) => s + toNum(r.gainLossAmount), 0)
        .toFixed(2),
      netAmount: unrealized.reduce((s, r) => s + toNum(r.gainLossAmount), 0).toFixed(2),
    },
    records: allRecords,
  };
}

/**
 * Bulk import exchange rates (e.g., from an API or CSV).
 */
export async function bulkImportRates(
  rates: Array<{
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    rateDate: Date;
    source?: "manual" | "api" | "bank";
  }>,
  companyId?: number
) {
  const results = [];
  for (const rate of rates) {
    const result = await db.createExchangeRate({
      companyId,
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rate: rate.rate.toFixed(8),
      rateDate: rate.rateDate,
      source: rate.source || "manual",
      isActive: true,
    });
    results.push(result);
  }
  return { imported: results.length, rates: results };
}
