import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getAdPlatforms: vi.fn(async () => []),
  claimAdSyncRun: vi.fn(async () => 1),
  finishAdSyncRun: vi.fn(async () => undefined),
}));
vi.mock("./adMarketingService", () => ({
  runDailySpendSync: vi.fn(async () => [{ platformId: 1 }]),
  runLeadPoll: vi.fn(async () => []),
  runAlertChecks: vi.fn(async () => ({ cpsAlerts: 1, budgetAlerts: 0, creditAlerts: 2 })),
  runWeeklySummary: vi.fn(async () => [{ companyId: null, text: "" }]),
}));
vi.mock("./_core/tenancy", () => ({
  isMultiTenant: vi.fn(() => false),
  forEachTenant: vi.fn(async (fn: (t: { slug: string }) => Promise<void>) => { await fn({ slug: "a" }); await fn({ slug: "b" }); return []; }),
}));

import * as db from "./db";
import * as svc from "./adMarketingService";
import { isMultiTenant } from "./_core/tenancy";
import { adMarketingTick, isoWeek, runTickForAllTenants } from "./adMarketingScheduler";

const MONDAY_7AM = new Date("2026-09-28T07:00:00.000Z");
const TUESDAY_3AM = new Date("2026-09-29T03:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.claimAdSyncRun).mockResolvedValue(1);
  vi.mocked(svc.runDailySpendSync).mockResolvedValue([{ platformId: 1 }] as never);
  vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 1, name: "meta", accessToken: "t" }, { id: 2, name: "linkedin", accessToken: "t" }, { id: 3, name: "reddit", accessToken: null }] as never);
});

describe("isoWeek", () => {
  it("formats ISO week keys", () => {
    expect(isoWeek(new Date("2026-09-28T00:00:00Z"))).toBe("2026-W40");
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
  });
});

describe("adMarketingTick", () => {
  it("on a Monday morning runs the spend sync, lead poll, alert checks and the weekly summary, claiming each first", async () => {
    const r = await adMarketingTick(MONDAY_7AM);
    expect(r).toEqual({ spendSynced: 1, leadsPolled: true, alertsChecked: true, weeklySent: true });
    expect(svc.runDailySpendSync).toHaveBeenCalledWith("2026-09-27");
    expect(db.claimAdSyncRun).toHaveBeenCalledWith({ kind: "alert_check", period: "2026-09-28" });
    expect(db.claimAdSyncRun).toHaveBeenCalledWith({ kind: "weekly_summary", period: "2026-W40" });
    expect(db.finishAdSyncRun).toHaveBeenCalledWith(1, { status: "success", rowsAffected: 3 });
    expect(db.finishAdSyncRun).toHaveBeenCalledWith(1, { status: "success", rowsAffected: 1 });
  });

  it("before 06:00 UTC only polls leads (platform reports are not final yet)", async () => {
    const r = await adMarketingTick(TUESDAY_3AM);
    expect(r).toEqual({ spendSynced: 0, leadsPolled: true, alertsChecked: false, weeklySent: false });
    expect(svc.runDailySpendSync).not.toHaveBeenCalled();
    expect(svc.runAlertChecks).not.toHaveBeenCalled();
  });

  it("skips a run another instance has claimed for the period", async () => {
    vi.mocked(db.claimAdSyncRun).mockResolvedValue(null);
    vi.mocked(svc.runDailySpendSync).mockResolvedValue([]);
    const r = await adMarketingTick(MONDAY_7AM);
    expect(r).toEqual({ spendSynced: 0, leadsPolled: true, alertsChecked: false, weeklySent: false });
    expect(svc.runAlertChecks).not.toHaveBeenCalled();
    expect(svc.runWeeklySummary).not.toHaveBeenCalled();
  });

  it("marks a claimed run failed when its work throws, so a later tick retries it", async () => {
    vi.mocked(svc.runAlertChecks).mockRejectedValueOnce(new Error("db down"));
    await expect(adMarketingTick(new Date("2026-09-29T07:00:00.000Z"))).rejects.toThrow("db down");
    expect(db.finishAdSyncRun).toHaveBeenCalledWith(1, { status: "failed", message: "db down" });
  });

  it("runs once per tenant in multi-tenant mode and once otherwise", async () => {
    await runTickForAllTenants(TUESDAY_3AM);
    expect(db.getAdPlatforms).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    vi.mocked(isMultiTenant).mockReturnValue(true);
    await runTickForAllTenants(TUESDAY_3AM);
    expect(db.getAdPlatforms).toHaveBeenCalledTimes(2);
  });

  it("skips the lead poll when no LinkedIn platform has a token", async () => {
    vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 1, name: "meta", accessToken: "t" }] as never);
    const r = await adMarketingTick(TUESDAY_3AM);
    expect(r.leadsPolled).toBe(false);
    expect(svc.runLeadPoll).not.toHaveBeenCalled();
  });
});
