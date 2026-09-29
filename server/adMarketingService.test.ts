import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getUsersByRoles: vi.fn(async () => [{ id: 1, email: "jade@example.com" }]),
  createNotificationsForAllUsers: vi.fn(async () => 1),
  getAdLeadByExternalId: vi.fn(async () => undefined),
  getAdCampaignById: vi.fn(async () => undefined),
  getAdCampaignByExternalId: vi.fn(async () => undefined),
  getAdCampaignByUtm: vi.fn(async () => undefined),
  getAdPlatformById: vi.fn(async () => undefined),
  getAdPlatforms: vi.fn(async () => []),
  findOrCreateCrmContact: vi.fn(async () => ({ id: 42, created: true })),
  getCrmContactById: vi.fn(async () => ({ id: 42, tags: JSON.stringify(["existing"]) })),
  updateCrmContact: vi.fn(async () => undefined),
  createAdLead: vi.fn(async () => 7),
  updateAdLead: vi.fn(async () => undefined),
  createAdCampaign: vi.fn(async () => 99),
  updateAdCampaign: vi.fn(async () => undefined),
  upsertAdSpendDaily: vi.fn(async () => true),
  updateAdPlatform: vi.fn(async () => undefined),
  createAdSyncLog: vi.fn(async () => 1),
  getAdCampaigns: vi.fn(async () => []),
  getAdSpend: vi.fn(async () => []),
  getAdSpendTotalsByCampaign: vi.fn(async () => []),
  getAdCredits: vi.fn(async () => []),
  updateAdCredit: vi.fn(async () => undefined),
}));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(async () => ({ success: true, messageId: "m" })) }));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import {
  applySpendRows, budgetReached, ingestAdLead, leadTags, mergeTags, parseTags, renderWelcome, runAlertChecks, splitName, syncSpendForPlatform, weeklySummaryText,
} from "./adMarketingService";
import {
  buildTrackingUrl, costPerSignup, cpsAboveTargetStreak, creditNeedsExpiryWarning, creditRemainingUsd, parseUtm, sumSpend, sumSpendBy, utmSlug,
} from "../shared/adMarketing";
import { parseLinkedInAnalytics, parseMetaInsights, parseRedditReport, extractMetaLeadgenIds, metaLeadFromFieldData } from "./_core/adPlatforms";
import { verifyMetaSignature, landingPayloadToLead } from "./_core/adWebhooks";
import { createHmac } from "crypto";

const NOW = new Date("2026-09-29T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getAdLeadByExternalId).mockResolvedValue(undefined);
  vi.mocked(db.getAdCampaignById).mockResolvedValue(undefined);
  vi.mocked(db.getAdCampaignByExternalId).mockResolvedValue(undefined);
  vi.mocked(db.getAdCampaignByUtm).mockResolvedValue(undefined);
  vi.mocked(db.getAdPlatformById).mockResolvedValue(undefined);
  vi.mocked(db.findOrCreateCrmContact).mockResolvedValue({ id: 42, created: true });
  vi.mocked(db.getUsersByRoles).mockResolvedValue([{ id: 1, email: "jade@example.com" }] as never);
});

// ---------------------------------------------------------------------------
// shared/adMarketing — pure helpers
// ---------------------------------------------------------------------------

describe("cost per signup", () => {
  it("is spend ÷ signups, rounded to cents, null without signups", () => {
    expect(costPerSignup(100, 4)).toBe(25);
    expect(costPerSignup(10, 3)).toBe(3.33);
    expect(costPerSignup(100, 0)).toBeNull();
    expect(costPerSignup(0, 0)).toBeNull();
  });

  it("sums rows and derives ratios; string decimals from MySQL are accepted", () => {
    const t = sumSpend([
      { spendUsd: "10.50", impressions: 1000, clicks: 50, signups: 2 },
      { spendUsd: 9.5, impressions: 1000, clicks: 50, signups: 3 },
    ]);
    expect(t).toEqual({ spendUsd: 20, impressions: 2000, clicks: 100, signups: 5, costPerSignup: 4, costPerClick: 0.2, clickRate: 5 });
  });

  it("groups by key keeping first-seen order", () => {
    const g = sumSpendBy(
      [{ p: "meta", spendUsd: 1, impressions: 0, clicks: 0, signups: 1 }, { p: "reddit", spendUsd: 2, impressions: 0, clicks: 0, signups: 0 }, { p: "meta", spendUsd: 3, impressions: 0, clicks: 0, signups: 1 }],
      (r) => r.p,
    );
    expect(g.map((x) => x.key)).toEqual(["meta", "reddit"]);
    expect(g[0].totals.spendUsd).toBe(4);
    expect(g[0].totals.costPerSignup).toBe(2);
    expect(g[1].totals.costPerSignup).toBeNull();
  });
});

describe("cost-per-signup streak", () => {
  const row = (date: string, spend: number, signups: number) => ({ date, spendUsd: spend, impressions: 0, clicks: 0, signups });
  it("fires only after 3 consecutive days above target ending on the end date", () => {
    const rows = [row("2026-09-26", 30, 1), row("2026-09-27", 40, 1), row("2026-09-28", 50, 1)];
    expect(cpsAboveTargetStreak(rows, 20, "2026-09-28")).toBe(true);
    expect(cpsAboveTargetStreak(rows, 45, "2026-09-28")).toBe(false); // day 1 and 2 under target
    expect(cpsAboveTargetStreak(rows, 20, "2026-09-29")).toBe(false); // no row for the end date
  });
  it("treats spend with zero signups as above target, and a gap as a reset", () => {
    expect(cpsAboveTargetStreak([row("2026-09-26", 30, 0), row("2026-09-27", 40, 0), row("2026-09-28", 50, 0)], 20, "2026-09-28")).toBe(true);
    expect(cpsAboveTargetStreak([row("2026-09-26", 30, 0), row("2026-09-28", 50, 0)], 20, "2026-09-28")).toBe(false);
  });
  it("never fires without a target", () => {
    expect(cpsAboveTargetStreak([row("2026-09-28", 50, 0)], null, "2026-09-28", 1)).toBe(false);
    expect(cpsAboveTargetStreak([row("2026-09-28", 50, 0)], 0, "2026-09-28", 1)).toBe(false);
  });
});

describe("tracking links", () => {
  it("slugs campaign names into utm-safe values", () => {
    expect(utmSlug("Fall Launch 2026!")).toBe("fall_launch_2026");
    expect(utmSlug("  IG / Reels  ")).toBe("ig_reels");
  });
  it("builds a tagged link and keeps existing query params", () => {
    const url = buildTrackingUrl("https://superhumn.co/signup?ref=x", { source: "Instagram", campaign: "Fall Launch", content: "Video A" });
    const u = new URL(url);
    expect(u.searchParams.get("ref")).toBe("x");
    expect(u.searchParams.get("utm_source")).toBe("instagram");
    expect(u.searchParams.get("utm_medium")).toBe("paid_social");
    expect(u.searchParams.get("utm_campaign")).toBe("fall_launch");
    expect(u.searchParams.get("utm_content")).toBe("video_a");
  });
  it("replaces utm values already on the page address", () => {
    const url = buildTrackingUrl("https://x.co/?utm_source=old&utm_campaign=old", { source: "reddit", campaign: "new" });
    expect(url).toBe("https://x.co/?utm_source=reddit&utm_campaign=new&utm_medium=paid_social");
  });
  it("rejects bad addresses with a plain message", () => {
    expect(() => buildTrackingUrl("superhumn.co/signup", { source: "a", campaign: "b" })).toThrow(/https:\/\//);
    expect(() => buildTrackingUrl("ftp://x.co", { source: "a", campaign: "b" })).toThrow(/http/);
    expect(() => buildTrackingUrl("https://x.co", { source: "", campaign: "b" })).toThrow(/source/);
  });
  it("reads utm values back from a page url or query string", () => {
    expect(parseUtm("https://x.co/?utm_source=reddit&utm_campaign=fall")).toEqual({ source: "reddit", campaign: "fall" });
    expect(parseUtm("?utm_medium=cpc")).toEqual({ medium: "cpc" });
    expect(parseUtm(null)).toEqual({});
  });
});

describe("credits", () => {
  const base = { amountUsd: "500", amountUsedUsd: "100", status: "active" };
  it("computes the remaining balance", () => {
    expect(creditRemainingUsd("500", "100.5")).toBe(399.5);
    expect(creditRemainingUsd("100", "150")).toBe(0);
  });
  it("warns 14 days before expiry, not before, and never for spent or expired credits", () => {
    expect(creditNeedsExpiryWarning({ ...base, expiresAt: new Date("2026-10-13T00:00:00Z") }, NOW)).toBe(true);
    expect(creditNeedsExpiryWarning({ ...base, expiresAt: new Date("2026-10-20T00:00:00Z") }, NOW)).toBe(false);
    expect(creditNeedsExpiryWarning({ ...base, expiresAt: new Date("2026-09-20T00:00:00Z") }, NOW)).toBe(true);
    expect(creditNeedsExpiryWarning({ ...base, amountUsedUsd: "500", expiresAt: new Date("2026-10-01T00:00:00Z") }, NOW)).toBe(false);
    expect(creditNeedsExpiryWarning({ ...base, status: "expired", expiresAt: new Date("2026-10-01T00:00:00Z") }, NOW)).toBe(false);
    expect(creditNeedsExpiryWarning({ ...base, expiresAt: null }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// service helpers
// ---------------------------------------------------------------------------

describe("service helpers", () => {
  it("merges tags without duplicates and survives bad JSON", () => {
    expect(parseTags("nope")).toEqual([]);
    expect(mergeTags('["a"]', ["a", "b"])).toBe('["a","b"]');
    expect(mergeTags(null, ["x"])).toBe('["x"]');
    expect(leadTags("meta", "Fall")).toEqual(["ad:meta", "campaign:Fall"]);
  });
  it("splits names so firstName is never empty", () => {
    expect(splitName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace", fullName: "Ada Lovelace" });
    expect(splitName(null, "Ada", null)).toEqual({ firstName: "Ada", lastName: undefined, fullName: "Ada" });
    expect(splitName("")).toEqual({ firstName: "Unknown", fullName: "Unknown" });
  });
  it("detects a reached budget from the total, or daily × run length", () => {
    expect(budgetReached({ totalBudgetUsd: "100", dailyBudgetUsd: null, startDate: null, endDate: null }, 100)).toEqual({ reached: true, budgetUsd: 100 });
    expect(budgetReached({ totalBudgetUsd: "100", dailyBudgetUsd: null, startDate: null, endDate: null }, 99)).toEqual({ reached: false, budgetUsd: 100 });
    const r = budgetReached({ totalBudgetUsd: null, dailyBudgetUsd: "10", startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-10T00:00:00Z") }, 100);
    expect(r).toEqual({ reached: true, budgetUsd: 100 });
    expect(budgetReached({ totalBudgetUsd: null, dailyBudgetUsd: "10", startDate: null, endDate: null }, 1e9).reached).toBe(false);
  });
  it("renders welcome merge fields and the weekly summary", () => {
    expect(renderWelcome("Hi {{firstName}}, welcome to {{ campaign }}!", { firstName: "Ada", campaign: "Fall" })).toBe("Hi Ada, welcome to Fall!");
    expect(renderWelcome("{{missing}}", {})).toBe("");
    const text = weeklySummaryText("2026-09-22", "2026-09-28", [{ platform: "Reddit", totals: sumSpend([{ spendUsd: 50, impressions: 0, clicks: 0, signups: 2 }]) }]);
    expect(text).toContain("Reddit: spend $50.00, signups 2, cost per signup $25.00");
    expect(text).toContain("Total: spend $50.00");
    expect(weeklySummaryText("a", "b", [])).toMatch(/No ad spend/);
  });
});

// ---------------------------------------------------------------------------
// lead intake
// ---------------------------------------------------------------------------

describe("ingestAdLead", () => {
  const campaign = { id: 5, platformId: 2, companyId: 1, name: "Fall", utmCampaign: "fall", welcomeSubject: "Welcome {{firstName}}", welcomeBody: "Hi {{firstName}}" };
  const platform = { id: 2, name: "meta", companyId: 1 };

  it("creates the CRM contact with paid_ad source and tags, records the lead, sends the welcome email and notifies", async () => {
    vi.mocked(db.getAdPlatformById).mockResolvedValue(platform as never);
    vi.mocked(db.getAdCampaignByExternalId).mockResolvedValue(campaign as never);

    const r = await ingestAdLead({ source: "meta", platformId: 2, externalCampaignId: "c1", externalLeadId: "L1", email: "Ada@X.com", fullName: "Ada Lovelace", answers: { q: "a" } });

    expect(r).toEqual({ leadId: 7, contactId: 42, contactCreated: true, duplicate: false, campaignId: 5, welcomeSent: true });
    const contact = vi.mocked(db.findOrCreateCrmContact).mock.calls[0][0];
    expect(contact).toMatchObject({ firstName: "Ada", lastName: "Lovelace", email: "ada@x.com", source: "paid_ad", contactType: "lead", tags: JSON.stringify(["ad:meta", "campaign:Fall"]) });
    expect(vi.mocked(db.createAdLead).mock.calls[0][0]).toMatchObject({ campaignId: 5, platformId: 2, contactId: 42, externalLeadId: "L1", utmCampaign: "fall", answersJson: '{"q":"a"}' });
    expect(sendEmail).toHaveBeenCalledWith({ to: "ada@x.com", subject: "Welcome Ada", text: "Hi Ada" });
    expect(db.updateAdLead).toHaveBeenCalledWith(7, { welcomeEmailSentAt: expect.any(Date) });
    expect(db.createNotificationsForAllUsers).toHaveBeenCalledWith(expect.objectContaining({ title: "New ad lead" }), [1]);
  });

  it("drops a retried webhook for the same platform lead id", async () => {
    vi.mocked(db.getAdLeadByExternalId).mockResolvedValue({ id: 3, contactId: 9, campaignId: 5, welcomeEmailSentAt: null } as never);
    const r = await ingestAdLead({ source: "meta", platformId: 2, externalLeadId: "L1", email: "a@b.co" });
    expect(r.duplicate).toBe(true);
    expect(db.createAdLead).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("adds the ad tags onto a matched existing contact instead of overwriting them", async () => {
    vi.mocked(db.getAdCampaignByUtm).mockResolvedValue(campaign as never);
    vi.mocked(db.getAdPlatformById).mockResolvedValue(platform as never);
    vi.mocked(db.findOrCreateCrmContact).mockResolvedValue({ id: 42, created: false });
    const r = await ingestAdLead({ source: "landing_page", utm: { source: "reddit", campaign: "fall" }, email: "a@b.co", fullName: "A B" });
    expect(r.contactCreated).toBe(false);
    expect(db.updateCrmContact).toHaveBeenCalledWith(42, { tags: JSON.stringify(["existing", "ad:meta", "campaign:Fall"]) });
  });

  it("skips the welcome email without an address or campaign template, and records a send failure", async () => {
    await ingestAdLead({ source: "manual", fullName: "No Email" });
    expect(sendEmail).not.toHaveBeenCalled();

    vi.mocked(db.getAdCampaignById).mockResolvedValue(campaign as never);
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: false, error: "SendGrid down" });
    const r = await ingestAdLead({ source: "manual", campaignId: 5, email: "a@b.co" });
    expect(r.welcomeSent).toBe(false);
    expect(db.updateAdLead).toHaveBeenCalledWith(7, { welcomeEmailError: "SendGrid down" });
  });

  it("still records the lead when the CRM write fails", async () => {
    vi.mocked(db.findOrCreateCrmContact).mockRejectedValue(new Error("db down"));
    const r = await ingestAdLead({ source: "manual", email: "a@b.co" });
    expect(r.contactId).toBeNull();
    expect(db.createAdLead).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// spend sync
// ---------------------------------------------------------------------------

describe("spend sync", () => {
  const platform = { id: 2, name: "meta", companyId: 1, accountId: "act_1", accessToken: "plain-token", connectionStatus: "connected" } as any;

  it("upserts one row per campaign/day and creates campaigns it has not seen", async () => {
    vi.mocked(db.getAdCampaignByExternalId).mockImplementation(async (_p, ext) => (ext === "known" ? ({ id: 11 } as never) : undefined));
    const r = await applySpendRows(platform, [
      { externalCampaignId: "known", date: "2026-09-28", spendUsd: 12.345, impressions: 10, clicks: 2, signups: 1 },
      { externalCampaignId: "new1", campaignName: "New one", date: "2026-09-28", spendUsd: 3, impressions: 1, clicks: 0, signups: 0 },
      { externalCampaignId: "new1", date: "2026-09-27", spendUsd: 4, impressions: 1, clicks: 0, signups: 0 },
    ]);
    expect(r).toEqual({ rows: 3, campaignsCreated: 1 });
    expect(db.createAdCampaign).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.createAdCampaign).mock.calls[0][0]).toMatchObject({ platformId: 2, externalId: "new1", name: "New one", status: "active" });
    expect(vi.mocked(db.upsertAdSpendDaily).mock.calls[0][0]).toEqual({ campaignId: 11, date: "2026-09-28", spendUsd: "12.35", impressions: 10, clicks: 2, signups: 1, source: "sync" });
    expect(vi.mocked(db.upsertAdSpendDaily).mock.calls[2][0]).toMatchObject({ campaignId: 99, date: "2026-09-27" });
  });

  it("logs success and marks the platform connected", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [
      { campaign_id: "c1", campaign_name: "C1", spend: "10.00", impressions: "100", clicks: "5", date_start: "2026-09-28", date_stop: "2026-09-28", actions: [{ action_type: "lead", value: "2" }] },
    ] }), { status: 200 })) as any;
    const r = await syncSpendForPlatform(platform, "2026-09-28", "2026-09-28", fetchImpl);
    expect(r).toMatchObject({ rows: 1, campaignsCreated: 1 });
    expect(r.error).toBeUndefined();
    expect(db.updateAdPlatform).toHaveBeenCalledWith(2, expect.objectContaining({ connectionStatus: "connected", lastSyncError: null }));
    expect(db.createAdSyncLog).toHaveBeenCalledWith(expect.objectContaining({ kind: "spend_sync", period: "2026-09-28", status: "success", rowsAffected: 1 }));
    expect(db.createNotificationsForAllUsers).not.toHaveBeenCalled();
  });

  it("logs a failed sync, marks the platform in error and alerts the team", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), { status: 401 })) as any;
    const r = await syncSpendForPlatform(platform, "2026-09-28", "2026-09-28", fetchImpl);
    expect(r.error).toMatch(/HTTP 401.*Invalid OAuth/);
    expect(db.updateAdPlatform).toHaveBeenCalledWith(2, expect.objectContaining({ connectionStatus: "error" }));
    expect(db.createAdSyncLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(db.createNotificationsForAllUsers).toHaveBeenCalledWith(expect.objectContaining({ title: "Instagram (Meta) spend sync failed", severity: "warning" }), [1]);
  });

  it("skips a platform without credentials", async () => {
    const r = await syncSpendForPlatform({ ...platform, accessToken: null }, "2026-09-28", "2026-09-28");
    expect(r.error).toMatch(/Not connected/);
    expect(db.createAdSyncLog).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
  });
});

// ---------------------------------------------------------------------------
// alerts
// ---------------------------------------------------------------------------

describe("runAlertChecks", () => {
  const campaign = { id: 5, platformId: 2, name: "Fall", status: "active", targetCostPerSignupUsd: "20", totalBudgetUsd: "1000", dailyBudgetUsd: null, startDate: null, endDate: null, cpsAlertAt: null, budgetAlertAt: null };
  const row = (date: string, spend: number, signups: number) => ({ campaignId: 5, date, spendUsd: String(spend), impressions: 0, clicks: 0, signups });

  it("alerts on 3 days above target and on a reached budget, once", async () => {
    vi.mocked(db.getAdCampaigns).mockResolvedValue([campaign] as never);
    vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 2, name: "reddit" }] as never);
    vi.mocked(db.getAdSpend).mockResolvedValue([row("2026-09-26", 60, 1), row("2026-09-27", 60, 2), row("2026-09-28", 90, 1)] as never);
    vi.mocked(db.getAdSpendTotalsByCampaign).mockResolvedValue([{ campaignId: 5, spendUsd: 1000, impressions: 0, clicks: 0, signups: 4, firstDate: null, lastDate: null }]);

    const r = await runAlertChecks(NOW);
    expect(r).toEqual({ cpsAlerts: 1, budgetAlerts: 1, creditAlerts: 0 });
    const titles = vi.mocked(db.createNotificationsForAllUsers).mock.calls.map((c) => c[0].title);
    expect(titles).toEqual(["Cost per signup above target: Fall", "Budget reached: Fall"]);
    expect(db.updateAdCampaign).toHaveBeenCalledWith(5, { cpsAlertAt: NOW });
    expect(db.updateAdCampaign).toHaveBeenCalledWith(5, { budgetAlertAt: NOW });

    // Already alerted this week → quiet.
    vi.clearAllMocks();
    vi.mocked(db.getAdCampaigns).mockResolvedValue([{ ...campaign, cpsAlertAt: NOW, budgetAlertAt: NOW }] as never);
    vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 2, name: "reddit" }] as never);
    vi.mocked(db.getAdSpend).mockResolvedValue([row("2026-09-26", 60, 1), row("2026-09-27", 60, 2), row("2026-09-28", 90, 1)] as never);
    vi.mocked(db.getAdSpendTotalsByCampaign).mockResolvedValue([{ campaignId: 5, spendUsd: 1000, impressions: 0, clicks: 0, signups: 4, firstDate: null, lastDate: null }]);
    vi.mocked(db.getAdCredits).mockResolvedValue([]);
    expect(await runAlertChecks(NOW)).toEqual({ cpsAlerts: 0, budgetAlerts: 0, creditAlerts: 0 });
  });

  it("warns about a credit 14 days from expiry once", async () => {
    vi.mocked(db.getAdCampaigns).mockResolvedValue([]);
    vi.mocked(db.getAdPlatforms).mockResolvedValue([{ id: 2, name: "linkedin" }] as never);
    vi.mocked(db.getAdCredits).mockResolvedValue([
      { id: 1, platformId: 2, offer: "LinkedIn $250", amountUsd: "250", amountUsedUsd: "50", status: "active", expiresAt: new Date("2026-10-10T00:00:00Z"), expiryWarnedAt: null },
      { id: 2, platformId: 2, offer: "Already warned", amountUsd: "250", amountUsedUsd: "0", status: "active", expiresAt: new Date("2026-10-10T00:00:00Z"), expiryWarnedAt: NOW },
      { id: 3, platformId: 2, offer: "Far out", amountUsd: "250", amountUsedUsd: "0", status: "active", expiresAt: new Date("2026-12-10T00:00:00Z"), expiryWarnedAt: null },
    ] as never);
    const r = await runAlertChecks(NOW);
    expect(r.creditAlerts).toBe(1);
    expect(db.createNotificationsForAllUsers).toHaveBeenCalledWith(expect.objectContaining({ title: "Ad credit expiring: LinkedIn $250", message: expect.stringContaining("$200.00 remaining") }), [1]);
    expect(db.updateAdCredit).toHaveBeenCalledWith(1, { expiryWarnedAt: NOW });
  });
});

// ---------------------------------------------------------------------------
// platform adapters — parsing
// ---------------------------------------------------------------------------

describe("platform parsers", () => {
  it("parses Meta insights, taking lead actions as signups", () => {
    const rows = parseMetaInsights({ data: [
      { campaign_id: "1", campaign_name: "A", spend: "12.5", impressions: "1000", clicks: "40", date_start: "2026-09-28", actions: [{ action_type: "link_click", value: "40" }, { action_type: "lead", value: "3" }] },
      { campaign_id: "2", spend: "1", impressions: "1", clicks: "0", date_start: "bad" },
    ] });
    expect(rows).toEqual([{ externalCampaignId: "1", campaignName: "A", date: "2026-09-28", spendUsd: 12.5, impressions: 1000, clicks: 40, signups: 3 }]);
  });
  it("parses LinkedIn analytics elements keyed by campaign urn", () => {
    const rows = parseLinkedInAnalytics({ elements: [
      { pivotValues: ["urn:li:sponsoredCampaign:555"], dateRange: { start: { year: 2026, month: 9, day: 8 } }, impressions: 10, clicks: 2, costInUsd: "5.5", oneClickLeads: 1 },
    ] });
    expect(rows).toEqual([{ externalCampaignId: "555", date: "2026-09-08", spendUsd: 5.5, impressions: 10, clicks: 2, signups: 1 }]);
  });
  it("parses Reddit reports and converts micro-dollars", () => {
    const rows = parseRedditReport({ data: { metrics: [{ campaign_id: "r1", date: "2026-09-28T00:00:00Z", spend: 12_340_000, impressions: 500, clicks: 9, conversion_signup_total: 2 }] } });
    expect(rows).toEqual([{ externalCampaignId: "r1", date: "2026-09-28", spendUsd: 12.34, impressions: 500, clicks: 9, signups: 2 }]);
  });
  it("extracts leadgen ids from a Meta webhook and maps field_data to a lead", () => {
    const ids = extractMetaLeadgenIds({ object: "page", entry: [{ id: "p1", changes: [{ field: "leadgen", value: { leadgen_id: "99", page_id: "p1", form_id: "f", ad_id: "a" } }, { field: "feed", value: {} }] }] });
    expect(ids).toEqual([{ leadgenId: "99", pageId: "p1", formId: "f", adId: "a", createdTime: undefined }]);
    expect(extractMetaLeadgenIds({ object: "user" })).toEqual([]);
    const lead = metaLeadFromFieldData("99", { campaign_id: "c1", created_time: "2026-09-28T10:00:00+0000", field_data: [{ name: "email", values: ["a@b.co"] }, { name: "full_name", values: ["Ada L"] }, { name: "phone_number", values: ["+1 555"] }] });
    expect(lead).toMatchObject({ externalLeadId: "99", externalCampaignId: "c1", email: "a@b.co", fullName: "Ada L", phone: "+1 555", answers: { email: "a@b.co", full_name: "Ada L", phone_number: "+1 555" } });
  });
});

// ---------------------------------------------------------------------------
// webhooks
// ---------------------------------------------------------------------------

describe("webhook helpers", () => {
  it("verifies Meta's sha256 signature over the raw body", () => {
    const body = Buffer.from('{"object":"page"}');
    const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", "secret")).toBe(false);
    expect(verifyMetaSignature(body, undefined, "secret")).toBe(false);
  });
  it("maps a landing-page form post, reading utm values from the page url when not sent as fields", () => {
    const lead = landingPayloadToLead({ name: "Ada L", email: "a@b.co", company: "ACME", pageUrl: "https://x.co/signup?utm_source=reddit&utm_campaign=fall", interest: "coffee" });
    expect(lead).toMatchObject({ fullName: "Ada L", email: "a@b.co", organization: "ACME", utm: { source: "reddit", campaign: "fall" }, answers: { interest: "coffee" } });
    expect(landingPayloadToLead({ utm_source: "linkedin", utm_campaign: "x" }).utm.source).toBe("linkedin");
  });
});
