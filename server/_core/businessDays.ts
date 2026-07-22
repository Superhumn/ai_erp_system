/**
 * Business-day, send-window, holiday and timezone helpers for automated
 * outbound email (Thread Follow-Up workflow).
 *
 * Rules encoded here (see server/threadFollowUp.ts for the workflow):
 *  - Send ONLY Tue/Wed/Thu, 09:00–16:00 in the RECIPIENT's local timezone.
 *    Never Mon, Fri, or weekends.
 *  - Skip public holidays in the recipient's country (US, IN, ZA, CO).
 *  - "N business days after X" counts Mon–Fri, excluding public holidays.
 *
 * No external date library is used (only date-fns v4 is installed and it has
 * no holiday/timezone awareness). Timezone conversion is done with the
 * platform Intl API, which ships full IANA tz data.
 */

// ─── Country / timezone resolution ─────────────────────────────────────────

export type CountryCode = "US" | "IN" | "ZA" | "CO";

const COUNTRY_ALIASES: Record<string, CountryCode> = {
  us: "US", usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US",
  "united states": "US", "united states of america": "US",
  in: "IN", india: "IN", ind: "IN",
  za: "ZA", rsa: "ZA", "south africa": "ZA",
  co: "CO", col: "CO", colombia: "CO",
};

/** Normalize a free-text country string to a supported country code, or null. */
export function normalizeCountry(country?: string | null): CountryCode | null {
  if (!country) return null;
  return COUNTRY_ALIASES[country.trim().toLowerCase()] ?? null;
}

const COUNTRY_TZ: Record<CountryCode, string> = {
  US: "America/New_York",
  IN: "Asia/Kolkata",
  ZA: "Africa/Johannesburg",
  CO: "America/Bogota",
};

export const DEFAULT_TIMEZONE = "America/New_York";

/** Representative timezone for a country when no explicit tz is on record. */
export function timezoneForCountry(country?: string | null, fallback = DEFAULT_TIMEZONE): string {
  const c = normalizeCountry(country);
  return c ? COUNTRY_TZ[c] : fallback;
}

/**
 * Resolve the timezone to use for a recipient: an explicit IANA tz if we have
 * one on record, otherwise the country default, otherwise the app default.
 */
export function resolveTimezone(explicitTz?: string | null, country?: string | null): string {
  if (explicitTz && isValidTimeZone(explicitTz)) return explicitTz;
  return timezoneForCountry(country);
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── Public holidays ────────────────────────────────────────────────────────
// Curated national public holidays for 2025–2027. Because we only ever send on
// Tue/Wed/Thu, holidays that fall on Mon/Fri/weekends are already excluded by
// the send-window rule; the dates below still matter for business-day counting.
// NOTE: extend this table each year (and for movable feasts) before go-live.

const HOLIDAYS: Record<CountryCode, Set<string>> = {
  US: new Set([
    // 2025
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26", "2025-06-19",
    "2025-07-04", "2025-09-01", "2025-10-13", "2025-11-11", "2025-11-27", "2025-12-25",
    // 2026
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
    "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
    // 2027
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18",
    "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24",
  ]),
  IN: new Set([
    // Fixed national holidays + major movable feasts (approximate)
    "2025-01-26", "2025-03-14", "2025-08-15", "2025-10-02", "2025-10-21", "2025-12-25",
    "2026-01-26", "2026-03-04", "2026-08-15", "2026-10-02", "2026-11-08", "2026-12-25",
    "2027-01-26", "2027-03-22", "2027-08-15", "2027-10-02", "2027-10-29", "2027-12-25",
  ]),
  ZA: new Set([
    // 2025 (incl. Good Friday / Family Day)
    "2025-01-01", "2025-03-21", "2025-04-18", "2025-04-21", "2025-04-27", "2025-04-28",
    "2025-05-01", "2025-06-16", "2025-08-09", "2025-09-24", "2025-12-16", "2025-12-25", "2025-12-26",
    // 2026
    "2026-01-01", "2026-03-21", "2026-04-03", "2026-04-06", "2026-04-27", "2026-05-01",
    "2026-06-16", "2026-08-09", "2026-08-10", "2026-09-24", "2026-12-16", "2026-12-25", "2026-12-26",
    // 2027
    "2027-01-01", "2027-03-21", "2027-03-22", "2027-03-26", "2027-03-29", "2027-04-27",
    "2027-05-01", "2027-06-16", "2027-08-09", "2027-09-24", "2027-12-16", "2027-12-25", "2027-12-27",
  ]),
  CO: new Set([
    // Fixed + main movable holidays (many CO holidays are Emiliano-law Mondays,
    // already excluded by the Tue–Thu send window)
    "2025-01-01", "2025-05-01", "2025-07-20", "2025-08-07", "2025-12-08", "2025-12-25",
    "2026-01-01", "2026-05-01", "2026-07-20", "2026-08-07", "2026-12-08", "2026-12-25",
    "2027-01-01", "2027-05-01", "2027-07-20", "2027-08-07", "2027-12-08", "2027-12-25",
  ]),
};

// ─── Timezone-aware date math (Intl based) ──────────────────────────────────

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0=Sun … 6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Break an absolute instant into wall-clock parts as seen in a timezone. */
export function getZonedParts(instant: Date, tz: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

/** Milliseconds to add to a UTC instant to get its wall-clock time in tz. */
function offsetMs(instant: Date, tz: string): number {
  const p = getZonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/** Convert a wall-clock time in tz to the absolute UTC instant. */
export function zonedWallTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, tz: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Two-pass refinement handles DST transitions.
  let ts = naive - offsetMs(new Date(naive), tz);
  ts = naive - offsetMs(new Date(ts), tz);
  return new Date(ts);
}

function dateKey(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// ─── Holiday / send-window predicates ───────────────────────────────────────

/** Is the given instant a public holiday in the recipient's country? */
export function isPublicHoliday(instant: Date, country?: string | null, tz?: string): boolean {
  const c = normalizeCountry(country);
  if (!c) return false;
  const zone = tz || timezoneForCountry(country);
  return HOLIDAYS[c].has(dateKey(getZonedParts(instant, zone)));
}

/** A day we are allowed to send on: Tue/Wed/Thu and not a public holiday. */
export function isSendableDay(instant: Date, tz: string, country?: string | null): boolean {
  const p = getZonedParts(instant, tz);
  if (p.weekday < 2 || p.weekday > 4) return false; // Tue(2) Wed(3) Thu(4) only
  return !isPublicHoliday(instant, country, tz);
}

export const SEND_START_HOUR = 9;
export const SEND_END_HOUR = 16; // exclusive: last sendable hour is 15:xx

/** Is the instant inside a valid send window (day + 09:00–16:00 local)? */
export function isWithinSendWindow(instant: Date, tz: string, country?: string | null): boolean {
  if (!isSendableDay(instant, tz, country)) return false;
  const p = getZonedParts(instant, tz);
  return p.hour >= SEND_START_HOUR && p.hour < SEND_END_HOUR;
}

/**
 * The next instant at or after `from` that falls inside a valid send window.
 * If `from` is already valid it is returned unchanged; otherwise the result is
 * 09:00 local on the next Tue/Wed/Thu that is not a holiday.
 */
export function nextSendSlot(from: Date, tz: string, country?: string | null): Date {
  if (isWithinSendWindow(from, tz, country)) return from;

  const p = getZonedParts(from, tz);
  let candidate: Date;
  if (isSendableDay(from, tz, country) && p.hour < SEND_START_HOUR) {
    candidate = zonedWallTimeToUtc(p.year, p.month, p.day, SEND_START_HOUR, 0, tz);
  } else {
    const np = getZonedParts(new Date(from.getTime() + 24 * 3600 * 1000), tz);
    candidate = zonedWallTimeToUtc(np.year, np.month, np.day, SEND_START_HOUR, 0, tz);
  }

  for (let i = 0; i < 400; i++) {
    if (isWithinSendWindow(candidate, tz, country)) return candidate;
    const np = getZonedParts(new Date(candidate.getTime() + 24 * 3600 * 1000), tz);
    candidate = zonedWallTimeToUtc(np.year, np.month, np.day, SEND_START_HOUR, 0, tz);
  }
  return candidate; // safety fallback (unreachable in practice)
}

/**
 * Add `n` business days (Mon–Fri, excluding public holidays) to `from`.
 * The result is anchored at 09:00 local on the resulting calendar day.
 */
export function addBusinessDays(from: Date, n: number, tz: string, country?: string | null): Date {
  const p0 = getZonedParts(from, tz);
  let cursor = zonedWallTimeToUtc(p0.year, p0.month, p0.day, SEND_START_HOUR, 0, tz);
  let added = 0;
  let guard = 0;
  while (added < n && guard < 1000) {
    guard++;
    const np = getZonedParts(new Date(cursor.getTime() + 24 * 3600 * 1000), tz);
    cursor = zonedWallTimeToUtc(np.year, np.month, np.day, SEND_START_HOUR, 0, tz);
    const isWeekday = np.weekday >= 1 && np.weekday <= 5;
    if (isWeekday && !isPublicHoliday(cursor, country, tz)) added++;
  }
  return cursor;
}

/**
 * Compute the next-nudge timestamp: `businessDays` business days after `from`,
 * then snapped forward into the next valid send window.
 */
export function computeNextNudgeAt(
  from: Date, businessDays: number, tz: string, country?: string | null,
): Date {
  return nextSendSlot(addBusinessDays(from, businessDays, tz, country), tz, country);
}
