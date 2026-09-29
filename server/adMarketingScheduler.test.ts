import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getAdPlatforms: vi.fn(async () => []),
  hasAdSyncLog: vi.fn(async () => false),
  createAdSyncLog: vi.fn(async () => 1),
}));
vi.mock("./adMarketingService", () => ({
  runDailySpendSync: vi.fn(async () => []),
  runLeadPoll: vi.fn(async () => []),
  runAlertChecks: vi.fn(async () => ({ cpsAlerts: 0, budgetAlerts: 0, creditAlerts: 0 })),
  runWeeklySummary: vi.fn(async () => ({ text: "" })),
}));

import * as db from "./db";
import * as svc from "./adMarketingService";
import { adMarketingTick, isoWeek } from "./adMarketingScheduler";

const MONDAY_7AM = new Date("2026-09-28T07:00:00.000Z");
const TUESDAY_3AM = new Date("2026-09-29T03:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.hasAdSyncLog).mockResolvedValue(false);
  vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 1, name: "meta", accessToken: "t" }, { id: 2, name: "linkedin", accessToken: "t" }, { id: 3, name: "reddit", accessToken: null }] as never);
});

describe("isoWeek", () => {
  it("formats ISO week keys", () => {
    expect(isoWeek(new Date("2026-09-28T00:00:00Z"))).toBe("2026-W40");
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
  });
});

describe("adMarketingTick", () => {
  it("on a Monday morning runs the spend sync, lead poll, alert checks and the weekly summary", async () => {
    const r = await adMarketingTick(MONDAY_7AM);
    expect(r).toEqual({ spendSynced: true, leadsPolled: true, alertsChecked: true, weeklySent: true });
    expect(svc.runDailySpendSync).toHaveBeenCalledWith("2026-09-27");
    expect(db.createAdSyncLog).toHaveBeenCalledWith(expect.objectContaining({ kind: "alert_check", period: "2026-09-28" }));
    expect(db.createAdSyncLog).toHaveBeenCalledWith(expect.objectContaining({ kind: "weekly_summary", period: "2026-W40" }));
  });

  it("before 06:00 UTC only polls leads (platform reports are not final yet)", async () => {
    const r = await adMarketingTick(TUESDAY_3AM);
    expect(r).toEqual({ spendSynced: false, leadsPolled: true, alertsChecked: false, weeklySent: false });
    expect(svc.runDailySpendSync).not.toHaveBeenCalled();
    expect(svc.runAlertChecks).not.toHaveBeenCalled();
  });

  it("does not repeat a run already logged for the period", async () => {
    vi.mocked(db.hasAdSyncLog).mockResolvedValue(true);
    const r = await adMarketingTick(MONDAY_7AM);
    expect(r).toEqual({ spendSynced: false, leadsPolled: true, alertsChecked: false, weeklySent: false });
    expect(svc.runDailySpendSync).not.toHaveBeenCalled();
    expect(svc.runWeeklySummary).not.toHaveBeenCalled();
  });

  it("skips the lead poll when no LinkedIn platform has a token", async () => {
    vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 1, name: "meta", accessToken: "t" }] as never);
    const r = await adMarketingTick(TUESDAY_3AM);
    expect(r.leadsPolled).toBe(false);
    expect(svc.runLeadPoll).not.toHaveBeenCalled();
  });
});
