// ============================================================================
// Auto-scheduler — finds free time-blocks in the user's calendar and helps book
// a task/event into an open slot. The interval math is pure and unit-tested; the
// timezone-aware working-window construction is isolated here.
//
// Busy set = the user's Google Calendar events (when connected). Working-hours
// windows are subtracted against busy intervals to yield candidate slots.
// ============================================================================

import { getCalendarEvents } from "./calendarService";
import {
  DEFAULT_WORKING_HOURS, DEFAULT_PLANNER_TIMEZONE,
  type TimeInterval, type ScheduleSlot, type WorkingHours,
} from "@shared/planner";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// ---- Timezone helpers (isolated so the pure slot math stays testable) ------

function tzParts(ms: number, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return parts;
}

// Offset (ms) such that localWallClockAsIfUTC = instant + offset.
function tzOffsetMs(ms: number, tz: string): number {
  const p = tzParts(ms, tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - ms;
}

// Convert a wall-clock time in `tz` to an absolute epoch-ms instant.
export function zonedWallTimeToUtcMs(
  y: number, m0: number, d: number, hh: number, mm: number, tz: string,
): number {
  const guess = Date.UTC(y, m0, d, hh, mm, 0);
  const offset = tzOffsetMs(guess, tz);
  return guess - offset;
}

/**
 * Build the working-hours windows (absolute epoch intervals) that fall inside
 * [windowStartMs, windowEndMs], honoring working days + hours in `tz`.
 */
export function buildWorkingWindows(
  windowStartMs: number,
  windowEndMs: number,
  wh: WorkingHours = DEFAULT_WORKING_HOURS,
  tz: string = DEFAULT_PLANNER_TIMEZONE,
): TimeInterval[] {
  const windows: TimeInterval[] = [];
  let cursor = windowStartMs;
  let safety = 0;
  while (cursor < windowEndMs && safety++ < 400) {
    const p = tzParts(cursor, tz);
    const y = +p.year, m0 = +p.month - 1, d = +p.day;
    const dow = WEEKDAY_INDEX[p.weekday] ?? 0;
    if (wh.days.includes(dow)) {
      const ws = zonedWallTimeToUtcMs(y, m0, d, wh.startHour, 0, tz);
      const we = zonedWallTimeToUtcMs(y, m0, d, wh.endHour, 0, tz);
      const s = Math.max(ws, windowStartMs);
      const e = Math.min(we, windowEndMs);
      if (e > s) windows.push({ start: s, end: e });
    }
    // Advance to next local midnight.
    const nextMidnight = zonedWallTimeToUtcMs(y, m0, d + 1, 0, 0, tz);
    cursor = nextMidnight > cursor ? nextMidnight : cursor + DAY_MS;
  }
  return windows;
}

// ---- Pure interval math ----------------------------------------------------

/** Free sub-intervals of `window` after removing overlapping `busy` intervals. */
export function subtractBusy(window: TimeInterval, busy: TimeInterval[]): TimeInterval[] {
  const overlapping = busy
    .filter((b) => b.end > window.start && b.start < window.end)
    .map((b) => ({ start: Math.max(b.start, window.start), end: Math.min(b.end, window.end) }))
    .sort((a, b) => a.start - b.start);
  const free: TimeInterval[] = [];
  let cursor = window.start;
  for (const b of overlapping) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/**
 * Earliest free slot of length `durationMs` within each working window's gaps,
 * up to `maxResults`. `nowMs` clips past time out of the first window.
 */
export function findFreeSlots(
  windows: TimeInterval[],
  busy: TimeInterval[],
  durationMs: number,
  maxResults = 6,
  nowMs?: number,
): TimeInterval[] {
  const slots: TimeInterval[] = [];
  for (const w of windows) {
    const eff: TimeInterval = nowMs ? { start: Math.max(w.start, nowMs), end: w.end } : w;
    if (eff.end <= eff.start) continue;
    // One (earliest) slot per gap keeps suggestions well spread across the day.
    for (const gap of subtractBusy(eff, busy)) {
      if (gap.end - gap.start >= durationMs) {
        slots.push({ start: gap.start, end: gap.start + durationMs });
        if (slots.length >= maxResults) return slots;
      }
    }
  }
  return slots;
}

/** Parse a Google Calendar events.list response into busy intervals (skips all-day/free/cancelled). */
export function busyIntervalsFromGoogleEvents(json: unknown): TimeInterval[] {
  const items = (json as { items?: any[] })?.items ?? [];
  const out: TimeInterval[] = [];
  for (const ev of items) {
    if (ev?.status === "cancelled") continue;
    if (ev?.transparency === "transparent") continue;
    const s = ev?.start?.dateTime;
    const e = ev?.end?.dateTime;
    if (!s || !e) continue; // all-day events (date only) don't block time
    const sm = Date.parse(s);
    const em = Date.parse(e);
    if (Number.isNaN(sm) || Number.isNaN(em)) continue;
    out.push({ start: sm, end: em });
  }
  return out;
}

export function formatSlotLabel(startMs: number, endMs: number, tz: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(startMs);
  const t = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(ms);
  return `${day} · ${t(startMs)}–${t(endMs)}`;
}

interface SuggestArgs {
  accessToken: string | null;
  windowStartMs: number;
  windowEndMs: number;
  durationMin: number;
  tz?: string;
  workingHours?: WorkingHours;
  maxResults?: number;
  nowMs: number;
}

/** Orchestrate: gather busy from Google (if connected), compute free slots. */
export async function suggestSlots(args: SuggestArgs): Promise<ScheduleSlot[]> {
  const tz = args.tz || DEFAULT_PLANNER_TIMEZONE;
  const wh = args.workingHours || DEFAULT_WORKING_HOURS;
  let busy: TimeInterval[] = [];
  if (args.accessToken) {
    try {
      const events = await getCalendarEvents(
        args.accessToken,
        new Date(args.windowStartMs).toISOString(),
        new Date(args.windowEndMs).toISOString(),
        250,
      );
      busy = busyIntervalsFromGoogleEvents(events);
    } catch {
      busy = [];
    }
  }
  const windows = buildWorkingWindows(args.windowStartMs, args.windowEndMs, wh, tz);
  const durationMs = Math.max(5, args.durationMin) * 60 * 1000;
  const free = findFreeSlots(windows, busy, durationMs, args.maxResults ?? 6, args.nowMs);
  return free.map((f) => ({
    startMs: f.start,
    endMs: f.end,
    startIso: new Date(f.start).toISOString(),
    endIso: new Date(f.end).toISOString(),
    label: formatSlotLabel(f.start, f.end, tz),
  }));
}
