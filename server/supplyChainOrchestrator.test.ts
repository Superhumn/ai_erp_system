import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn() }));
vi.mock("./autonomousWorkflowEngine", () => ({ getWorkflowEngine: vi.fn() }));

import { computeNextCronRun } from "./supplyChainOrchestrator";

// Local-time constructor: (year, monthIndex, day, hour, minute)
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

describe("computeNextCronRun", () => {
  it("handles */N in the hour field (0 */2 * * *)", () => {
    // 09:15 -> next even hour is 10:00
    expect(computeNextCronRun("0 */2 * * *", at(2026, 3, 10, 9, 15))).toEqual(at(2026, 3, 10, 10, 0));
    // exactly on a match must move strictly forward
    expect(computeNextCronRun("0 */2 * * *", at(2026, 3, 10, 10, 0))).toEqual(at(2026, 3, 10, 12, 0));
    // 23:30 rolls over to next day 00:00
    expect(computeNextCronRun("0 */2 * * *", at(2026, 3, 10, 23, 30))).toEqual(at(2026, 3, 11, 0, 0));
  });

  it("honors day-of-month (0 0 1 * *)", () => {
    expect(computeNextCronRun("0 0 1 * *", at(2026, 3, 10, 9, 15))).toEqual(at(2026, 4, 1, 0, 0));
    // on the 1st but after midnight -> next month
    expect(computeNextCronRun("0 0 1 * *", at(2026, 4, 1, 0, 1))).toEqual(at(2026, 5, 1, 0, 0));
    // December wraps into next year
    expect(computeNextCronRun("0 0 1 * *", at(2026, 12, 15))).toEqual(at(2027, 1, 1, 0, 0));
  });

  it("honors day-of-week (0 2 * * 0)", () => {
    // 2026-03-10 is a Tuesday; next Sunday is 2026-03-15
    expect(at(2026, 3, 10).getDay()).toBe(2);
    expect(computeNextCronRun("0 2 * * 0", at(2026, 3, 10, 9, 15))).toEqual(at(2026, 3, 15, 2, 0));
    // 7 is an alias for Sunday
    expect(computeNextCronRun("0 2 * * 7", at(2026, 3, 10, 9, 15))).toEqual(at(2026, 3, 15, 2, 0));
  });

  it("honors weekday ranges (30 9 * * 1-5)", () => {
    // Friday 2026-03-13 at 10:00 -> Monday 2026-03-16 09:30
    expect(at(2026, 3, 13).getDay()).toBe(5);
    expect(computeNextCronRun("30 9 * * 1-5", at(2026, 3, 13, 10, 0))).toEqual(at(2026, 3, 16, 9, 30));
    // Friday before 09:30 -> same day
    expect(computeNextCronRun("30 9 * * 1-5", at(2026, 3, 13, 8, 0))).toEqual(at(2026, 3, 13, 9, 30));
  });

  it("supports lists and month restriction", () => {
    expect(computeNextCronRun("0 6,18 * * *", at(2026, 3, 10, 7, 0))).toEqual(at(2026, 3, 10, 18, 0));
    expect(computeNextCronRun("0 0 15 6 *", at(2026, 3, 10))).toEqual(at(2026, 6, 15, 0, 0));
  });

  it("uses OR semantics when both day-of-month and day-of-week are restricted", () => {
    // 1st of month OR Sunday; from Tue 2026-03-10 the Sunday (03-15) comes first
    expect(computeNextCronRun("0 0 1 * 0", at(2026, 3, 10, 9))).toEqual(at(2026, 3, 15, 0, 0));
  });

  it("rejects malformed expressions", () => {
    expect(() => computeNextCronRun("0 0 * *", new Date())).toThrow(/5 fields/);
    expect(() => computeNextCronRun("0 25 * * *", new Date())).toThrow(/out of range/);
    expect(() => computeNextCronRun("0 */0 * * *", new Date())).toThrow(/step/);
    expect(() => computeNextCronRun("0 0 31 2 *", new Date())).toThrow(/No run time/);
  });
});
