import { describe, it, expect } from "vitest";
import {
  normalizeCountry,
  timezoneForCountry,
  resolveTimezone,
  isPublicHoliday,
  isSendableDay,
  isWithinSendWindow,
  nextSendSlot,
  addBusinessDays,
  computeNextNudgeAt,
  getZonedParts,
  zonedWallTimeToUtc,
} from "./businessDays";

const NY = "America/New_York";

describe("country / timezone resolution", () => {
  it("normalizes free-text country strings", () => {
    expect(normalizeCountry("USA")).toBe("US");
    expect(normalizeCountry("united states")).toBe("US");
    expect(normalizeCountry("India")).toBe("IN");
    expect(normalizeCountry("South Africa")).toBe("ZA");
    expect(normalizeCountry("colombia")).toBe("CO");
    expect(normalizeCountry("Narnia")).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });

  it("maps countries to representative timezones", () => {
    expect(timezoneForCountry("US")).toBe("America/New_York");
    expect(timezoneForCountry("India")).toBe("Asia/Kolkata");
    expect(timezoneForCountry("ZA")).toBe("Africa/Johannesburg");
    expect(timezoneForCountry("Colombia")).toBe("America/Bogota");
    expect(timezoneForCountry("unknown")).toBe("America/New_York");
  });

  it("prefers an explicit valid tz over the country default", () => {
    expect(resolveTimezone("Asia/Kolkata", "US")).toBe("Asia/Kolkata");
    expect(resolveTimezone("Not/AZone", "US")).toBe("America/New_York");
    expect(resolveTimezone(null, "India")).toBe("Asia/Kolkata");
  });
});

describe("public holidays", () => {
  it("detects US Thanksgiving (a Thursday holiday)", () => {
    // 2026-11-26 is Thanksgiving (Thursday) — a send day but a holiday.
    const thanksgiving = zonedWallTimeToUtc(2026, 11, 26, 10, 0, NY);
    expect(isPublicHoliday(thanksgiving, "US")).toBe(true);
    expect(isSendableDay(thanksgiving, NY, "US")).toBe(false);
  });

  it("returns false for a non-holiday and for unsupported countries", () => {
    const normalTue = zonedWallTimeToUtc(2026, 1, 6, 10, 0, NY);
    expect(isPublicHoliday(normalTue, "US")).toBe(false);
    expect(isPublicHoliday(normalTue, "Narnia")).toBe(false);
  });
});

describe("send-day / send-window predicates", () => {
  it("only allows Tue/Wed/Thu", () => {
    // Jan 2026: 5=Mon 6=Tue 7=Wed 8=Thu 9=Fri 10=Sat 11=Sun
    expect(isSendableDay(zonedWallTimeToUtc(2026, 1, 5, 10, 0, NY), NY, "US")).toBe(false); // Mon
    expect(isSendableDay(zonedWallTimeToUtc(2026, 1, 6, 10, 0, NY), NY, "US")).toBe(true);  // Tue
    expect(isSendableDay(zonedWallTimeToUtc(2026, 1, 7, 10, 0, NY), NY, "US")).toBe(true);  // Wed
    expect(isSendableDay(zonedWallTimeToUtc(2026, 1, 8, 10, 0, NY), NY, "US")).toBe(true);  // Thu
    expect(isSendableDay(zonedWallTimeToUtc(2026, 1, 9, 10, 0, NY), NY, "US")).toBe(false); // Fri
    expect(isSendableDay(zonedWallTimeToUtc(2026, 1, 10, 10, 0, NY), NY, "US")).toBe(false); // Sat
  });

  it("enforces 09:00–16:00 local window", () => {
    expect(isWithinSendWindow(zonedWallTimeToUtc(2026, 1, 6, 8, 59, NY), NY, "US")).toBe(false);
    expect(isWithinSendWindow(zonedWallTimeToUtc(2026, 1, 6, 9, 0, NY), NY, "US")).toBe(true);
    expect(isWithinSendWindow(zonedWallTimeToUtc(2026, 1, 6, 15, 59, NY), NY, "US")).toBe(true);
    expect(isWithinSendWindow(zonedWallTimeToUtc(2026, 1, 6, 16, 0, NY), NY, "US")).toBe(false);
  });

  it("evaluates the window in the RECIPIENT's timezone", () => {
    // 09:30 in Kolkata is a valid slot there, even though it's the middle of
    // the night in New York.
    const kolkataMorning = zonedWallTimeToUtc(2026, 1, 6, 9, 30, "Asia/Kolkata");
    expect(isWithinSendWindow(kolkataMorning, "Asia/Kolkata", "India")).toBe(true);
  });
});

describe("nextSendSlot", () => {
  it("returns the instant unchanged if already in-window", () => {
    const inWindow = zonedWallTimeToUtc(2026, 1, 6, 10, 0, NY);
    expect(nextSendSlot(inWindow, NY, "US").getTime()).toBe(inWindow.getTime());
  });

  it("rolls a Friday forward to the next Tuesday 09:00 local", () => {
    const friday = zonedWallTimeToUtc(2026, 1, 9, 10, 0, NY);
    const slot = nextSendSlot(friday, NY, "US");
    const p = getZonedParts(slot, NY);
    expect(p.weekday).toBe(2); // Tuesday
    expect(p.day).toBe(13);
    expect(p.hour).toBe(9);
    expect(p.minute).toBe(0);
  });

  it("moves a before-hours sendable day to 09:00 the same day", () => {
    const tueEarly = zonedWallTimeToUtc(2026, 1, 6, 6, 0, NY);
    const slot = nextSendSlot(tueEarly, NY, "US");
    const p = getZonedParts(slot, NY);
    expect(p.day).toBe(6);
    expect(p.hour).toBe(9);
  });
});

describe("addBusinessDays", () => {
  it("counts Mon–Fri across a weekend", () => {
    // From Tue Jan 6, +3 business days => Wed, Thu, Fri = Jan 9.
    const from = zonedWallTimeToUtc(2026, 1, 6, 10, 0, NY);
    const p = getZonedParts(addBusinessDays(from, 3, NY, "US"), NY);
    expect(p.day).toBe(9);
  });

  it("skips public holidays when counting", () => {
    // From Wed Nov 25 2026, +1 business day skips Thanksgiving (Thu Nov 26) to Fri Nov 27.
    const from = zonedWallTimeToUtc(2026, 11, 25, 10, 0, NY);
    const p = getZonedParts(addBusinessDays(from, 1, NY, "US"), NY);
    expect(p.day).toBe(27);
  });
});

describe("computeNextNudgeAt", () => {
  it("adds business days then snaps into a valid send window", () => {
    // Tue Jan 6 + 3 business days = Fri Jan 9 (not sendable) -> next Tue Jan 13 09:00.
    const from = zonedWallTimeToUtc(2026, 1, 6, 10, 0, NY);
    const next = computeNextNudgeAt(from, 3, NY, "US");
    const p = getZonedParts(next, NY);
    expect(p.weekday).toBe(2);
    expect(p.day).toBe(13);
    expect(p.hour).toBe(9);
  });
});
