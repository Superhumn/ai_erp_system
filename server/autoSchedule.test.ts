import { describe, it, expect } from "vitest";
import {
  subtractBusy, findFreeSlots, buildWorkingWindows, zonedWallTimeToUtcMs,
  busyIntervalsFromGoogleEvents,
} from "./autoScheduleService";

describe("subtractBusy", () => {
  it("removes overlapping busy intervals and returns the gaps", () => {
    const free = subtractBusy({ start: 0, end: 100 }, [{ start: 20, end: 40 }, { start: 60, end: 70 }]);
    expect(free).toEqual([{ start: 0, end: 20 }, { start: 40, end: 60 }, { start: 70, end: 100 }]);
  });
  it("clips busy to the window and merges adjacent coverage", () => {
    const free = subtractBusy({ start: 10, end: 50 }, [{ start: 0, end: 20 }, { start: 15, end: 60 }]);
    expect(free).toEqual([]); // fully covered
  });
  it("returns the whole window when nothing is busy", () => {
    expect(subtractBusy({ start: 0, end: 30 }, [])).toEqual([{ start: 0, end: 30 }]);
  });
});

describe("findFreeSlots", () => {
  it("emits the earliest slot of the requested length in each gap", () => {
    const slots = findFreeSlots([{ start: 0, end: 100 }], [{ start: 20, end: 40 }, { start: 60, end: 70 }], 20, 6);
    expect(slots).toEqual([{ start: 0, end: 20 }, { start: 40, end: 60 }, { start: 70, end: 90 }]);
  });
  it("respects maxResults", () => {
    const slots = findFreeSlots([{ start: 0, end: 100 }], [{ start: 20, end: 40 }, { start: 60, end: 70 }], 20, 2);
    expect(slots).toHaveLength(2);
  });
  it("skips gaps shorter than the duration", () => {
    const slots = findFreeSlots([{ start: 0, end: 100 }], [{ start: 10, end: 90 }], 30, 6);
    expect(slots).toEqual([]); // only [0,10] and [90,100], both < 30
  });
  it("clips past time using nowMs", () => {
    const slots = findFreeSlots([{ start: 0, end: 100 }], [], 20, 6, 50);
    expect(slots).toEqual([{ start: 50, end: 70 }]);
  });
});

describe("zonedWallTimeToUtcMs", () => {
  it("maps a wall-clock time in a tz to the right UTC instant (EDT = UTC-4 in July)", () => {
    expect(zonedWallTimeToUtcMs(2026, 6, 6, 9, 0, "America/New_York")).toBe(Date.UTC(2026, 6, 6, 13, 0, 0));
    expect(zonedWallTimeToUtcMs(2026, 6, 6, 17, 0, "America/New_York")).toBe(Date.UTC(2026, 6, 6, 21, 0, 0));
  });
});

describe("buildWorkingWindows", () => {
  it("produces a single Mon 9-17 window (in NY) within a one-day UTC span", () => {
    // Monday 2026-07-06, whole UTC day.
    const start = Date.UTC(2026, 6, 6, 0, 0, 0);
    const end = Date.UTC(2026, 6, 7, 0, 0, 0);
    const windows = buildWorkingWindows(start, end, { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }, "America/New_York");
    expect(windows).toEqual([{ start: Date.UTC(2026, 6, 6, 13, 0, 0), end: Date.UTC(2026, 6, 6, 21, 0, 0) }]);
  });
  it("skips weekend days", () => {
    // Saturday 2026-07-04 → Sunday 2026-07-05 (both non-working)
    const start = Date.UTC(2026, 6, 4, 12, 0, 0);
    const end = Date.UTC(2026, 6, 5, 12, 0, 0);
    const windows = buildWorkingWindows(start, end, { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }, "America/New_York");
    expect(windows).toEqual([]);
  });
});

describe("busyIntervalsFromGoogleEvents", () => {
  it("keeps timed events, skips all-day / free / cancelled", () => {
    const busy = busyIntervalsFromGoogleEvents({
      items: [
        { start: { dateTime: "2026-07-06T14:00:00Z" }, end: { dateTime: "2026-07-06T15:00:00Z" } },
        { start: { date: "2026-07-06" }, end: { date: "2026-07-07" } }, // all-day
        { start: { dateTime: "2026-07-06T16:00:00Z" }, end: { dateTime: "2026-07-06T17:00:00Z" }, transparency: "transparent" },
        { start: { dateTime: "2026-07-06T18:00:00Z" }, end: { dateTime: "2026-07-06T19:00:00Z" }, status: "cancelled" },
      ],
    });
    expect(busy).toEqual([{ start: Date.parse("2026-07-06T14:00:00Z"), end: Date.parse("2026-07-06T15:00:00Z") }]);
  });
  it("tolerates a missing/empty items array", () => {
    expect(busyIntervalsFromGoogleEvents({})).toEqual([]);
    expect(busyIntervalsFromGoogleEvents(null)).toEqual([]);
  });
});
