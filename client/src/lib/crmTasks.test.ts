import { describe, expect, it } from "vitest";
import { dueAtFromUtcDate, isOverdueUtc, utcDateInput, utcDaysFromToday, utcDueLabel } from "./crmTasks";

// 23:30 UTC — in UTC-8 this is still the afternoon of the 29th; in UTC+5:30
// it is already the 30th. Everything below must follow the UTC day.
const NOW = new Date("2026-09-29T23:30:00Z");

describe("crm task UTC dates", () => {
  it("date input values are UTC calendar days", () => {
    expect(utcDateInput(0, NOW)).toBe("2026-09-29");
    expect(utcDateInput(1, NOW)).toBe("2026-09-30");
    expect(utcDateInput(3, new Date("2026-12-30T00:10:00Z"))).toBe("2027-01-02");
  });

  it("a picked day becomes noon UTC on that day, which the server buckets as that day", () => {
    expect(dueAtFromUtcDate("2026-09-29")?.toISOString()).toBe("2026-09-29T12:00:00.000Z");
    expect(dueAtFromUtcDate("")).toBeNull();
    expect(dueAtFromUtcDate("29/09/2026")).toBeNull();
  });

  it("labels and overdue follow UTC days", () => {
    expect(utcDaysFromToday("2026-09-29T00:00:00Z", NOW)).toBe(0);
    expect(utcDueLabel("2026-09-29T00:05:00Z", NOW)).toBe("Today");
    expect(utcDueLabel("2026-09-30T12:00:00Z", NOW)).toBe("Tomorrow");
    expect(utcDueLabel("2026-09-28T23:59:00Z", NOW)).toBe("Yesterday");
    expect(utcDueLabel("2026-10-05T12:00:00Z", NOW)).toBe("Oct 5");
    expect(isOverdueUtc("2026-09-28T23:59:00Z", false, NOW)).toBe(true);
    expect(isOverdueUtc("2026-09-29T00:00:00Z", false, NOW)).toBe(false);
    expect(isOverdueUtc("2026-09-01T00:00:00Z", true, NOW)).toBe(false);
  });
});
