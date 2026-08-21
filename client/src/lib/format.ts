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

// Formatters for non-USD currencies are built on demand and cached; most pages
// only ever need USD, so this stays empty in the common case.
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, whole: boolean): Intl.NumberFormat {
  const key = `${currency}:${whole}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
      });
    } catch {
      // Malformed code — fall back to USD rather than throwing mid-render.
      // (A well-formed but unrecognised code is accepted by Intl and rendered
      // as a plain prefix, e.g. "ZZZ 10.00", which is the honest outcome.)
      formatter = whole ? usdWholeFormatter : usdFormatter;
    }
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Format a value as currency — USD unless `opts.currency` names another code.
 * Handles string, number, null, and undefined inputs.
 *
 * Pass `currency` whenever the amount is not necessarily USD (a vendor quote's
 * landed cost, for instance, is in its RFQ's base currency); rendering a EUR
 * total with a "$" sign is worse than not formatting it at all.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  opts?: { whole?: boolean; currency?: string }
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "-";
  const currency = opts?.currency?.toUpperCase();
  if (currency && currency !== "USD") {
    return formatterFor(currency, !!opts?.whole).format(num);
  }
  return opts?.whole ? usdWholeFormatter.format(num) : usdFormatter.format(num);
}
