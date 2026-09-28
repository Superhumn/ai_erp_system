// Date-range handling for financialReports.generate. Pure so the boundary rules can be
// unit-tested without the router or the db.

export interface ReportRange {
  /** Inclusive lower bound, or undefined for "from the beginning". */
  start?: Date;
  /** Inclusive upper bound, or undefined for "until now". */
  end?: Date;
  /** Point-in-time reports (aging, balances) are computed as of this date: endDate, else now. */
  asOf: Date;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  // A bare calendar date means the whole day: "2026-12-31" as an end bound includes 31 Dec.
  const iso = DATE_ONLY.test(value) ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : value;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/** Resolve the optional startDate/endDate strings a report request carries. Unparseable values are ignored. */
export function parseReportRange(startDate: string | undefined, endDate: string | undefined, now: Date = new Date()): ReportRange {
  const start = parseDate(startDate, false);
  const end = parseDate(endDate, true);
  return { start, end, asOf: end ?? now };
}

/** Whether a row dated `value` falls inside the range. Rows with no usable date are kept, so bad data never silently vanishes from a report. */
export function inReportRange(range: Pick<ReportRange, "start" | "end">, value: Date | string | null | undefined): boolean {
  if (value == null) return true;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return true;
  if (range.start && t < range.start.getTime()) return false;
  if (range.end && t > range.end.getTime()) return false;
  return true;
}

/** Whether a row dated `value` exists as of the report date (point-in-time reports). */
export function onOrBefore(asOf: Date, value: Date | string | null | undefined): boolean {
  if (value == null) return true;
  const t = new Date(value).getTime();
  return !Number.isFinite(t) || t <= asOf.getTime();
}
