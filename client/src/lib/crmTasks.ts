/**
 * CRM task dates on UTC calendar days — the same day boundaries the server
 * uses for the today / overdue / upcoming lists and the reminder email
 * (server/crmLogic.ts taskBucket). Using local days here would put a task in
 * "today" on screen but "overdue" or "upcoming" on the server near midnight.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** yyyy-MM-dd of the UTC day `days` from `now` (value for a date input). */
export function utcDateInput(days = 0, now: Date = new Date()): string {
  return new Date(utcDayStart(now) + days * DAY_MS).toISOString().slice(0, 10);
}

/** A yyyy-MM-dd date-input value as the dueAt instant: 12:00 UTC on that UTC day. */
export function dueAtFromUtcDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Whole UTC days from today to `due` (negative = overdue). */
export function utcDaysFromToday(due: Date | string, now: Date = new Date()): number {
  return Math.round((utcDayStart(new Date(due)) - utcDayStart(now)) / DAY_MS);
}

/** "Today" / "Tomorrow" / "Yesterday" / "Sep 29" — on the UTC calendar. */
export function utcDueLabel(due: Date | string, now: Date = new Date()): string {
  const days = utcDaysFromToday(due, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  const d = new Date(due);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Open task due on an earlier UTC day than today. */
export function isOverdueUtc(due: Date | string | null | undefined, completed: boolean, now: Date = new Date()): boolean {
  if (!due || completed) return false;
  return utcDaysFromToday(due, now) < 0;
}
