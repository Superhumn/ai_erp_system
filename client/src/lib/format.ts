/**
 * Shared formatting utilities — extracted to avoid 20+ duplicate definitions across pages.
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const usdWholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a value as USD currency.
 * Handles string, number, null, and undefined inputs.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  opts?: { whole?: boolean }
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "-";
  return opts?.whole ? usdWholeFormatter.format(num) : usdFormatter.format(num);
}
