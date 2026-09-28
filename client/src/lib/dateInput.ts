/**
 * Helpers for `<input type="date">` values.
 *
 * `new Date("2026-03-01")` parses a date-only ISO string as UTC midnight, so in
 * any timezone west of UTC it renders (and is stored) as the previous day.
 * These helpers keep date-only values in local time in both directions.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a date input value ("yyyy-MM-dd") as local midnight.
 * Blank / null / undefined → undefined. Anything else that is not date-only
 * (e.g. a full ISO timestamp) falls back to the Date constructor, and an
 * unparseable value → undefined.
 */
export function parseDateInput(value: string | null | undefined): Date | undefined {
  if (value == null) return undefined;
  const s = value.trim();
  if (!s) return undefined;
  const m = DATE_ONLY.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Formats a Date (or anything `parseDateInput` accepts) as a local
 * "yyyy-MM-dd" string suitable for an `<input type="date">` value.
 * Blank / invalid → "".
 */
export function toDateInputValue(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : parseDateInput(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
