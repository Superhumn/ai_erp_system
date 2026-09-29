import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getCrmEmailCampaigns: vi.fn(),
  getCrmEmailCampaignById: vi.fn(),
  createCrmEmailCampaign: vi.fn(),
  getCrmCampaignRecipients: vi.fn(),
  createAuditLog: vi.fn(),
}));
vi.mock("../campaignService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../campaignService")>();
  return { ...actual, addCampaignRecipients: vi.fn(), scheduleCampaign: vi.fn() };
});

import * as db from "../db";
import * as svc from "../campaignService";
import { executeMarketing, marketingTool } from "./marketing";
import type { AIAgentContext } from "../aiAgentService";

const m = vi.mocked(db);
const s = vi.mocked(svc);
const ctx = (userRole: string, companyId: number | undefined = 1): AIAgentContext => ({ userId: 10, userName: "Jade", userRole, companyId });
const run = (params: Record<string, unknown>, c: AIAgentContext) => executeMarketing("manage_marketing", params, c);

const campaign = (patch: Record<string, unknown> = {}) => ({
  id: 1, companyId: 1, name: "October news", subject: "Hi {{firstName}}", bodyHtml: "<p>x</p>", bodyText: null, type: "newsletter", status: "draft",
  scheduledAt: null, sentAt: null, targetTags: null, targetContactTypes: null, targetPipelineStages: null,
  totalRecipients: 10, sentCount: 8, deliveredCount: 8, openedCount: 4, clickedCount: 2, bouncedCount: 0, unsubscribedCount: 1, createdBy: 1, ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.createAuditLog.mockResolvedValue(undefined as never);
  m.getCrmEmailCampaignById.mockImplementation(async (id: number) => (id === 1 ? campaign() : id === 2 ? campaign({ id: 2, companyId: 2 }) : undefined) as never);
});

it("declares manage_marketing", () => {
  const props = marketingTool.function.parameters?.properties as Record<string, { enum?: string[] }>;
  expect(props.action.enum).toEqual(["list_campaigns", "campaign_stats", "create_campaign_draft", "add_recipients", "schedule_campaign"]);
});

describe("list_campaigns", () => {
  it("filters rows to the caller's company", async () => {
    m.getCrmEmailCampaigns.mockResolvedValue([campaign(), campaign({ id: 2, companyId: 2 })] as never);
    const res = await run({ action: "list_campaigns", status: "draft" }, ctx("user")) as { total: number; campaigns: Array<{ id: number }> };
    expect(m.getCrmEmailCampaigns).toHaveBeenCalledWith({ status: "draft", limit: 50 });
    expect(res.campaigns.map((c) => c.id)).toEqual([1]);
  });

  it("refuses vendors", async () => {
    await expect(run({ action: "list_campaigns" }, ctx("vendor"))).rejects.toThrow(/Not authorized/);
  });
});

describe("campaign_stats", () => {
  it("computes rates from counts and recipient statuses", async () => {
    m.getCrmCampaignRecipients.mockResolvedValue([{ status: "sent" }, { status: "opened" }, { status: "pending" }] as never);
    const res = await run({ action: "campaign_stats", campaignId: 1 }, ctx("sales")) as { rates: { openRate: number; clickRate: number }; recipients: { byStatus: Record<string, number> } };
    expect(res.rates).toMatchObject({ openRate: 50, clickRate: 25 });
    expect(res.recipients.byStatus).toEqual({ sent: 1, opened: 1, pending: 1 });
  });

  it("hides a campaign from another company", async () => {
    await expect(run({ action: "campaign_stats", campaignId: 2 }, ctx("sales"))).rejects.toThrow(/Campaign not found/);
  });
});

describe("create_campaign_draft", () => {
  it("creates a draft with html derived from text, stamped with company and creator", async () => {
    m.createCrmEmailCampaign.mockResolvedValue(33 as never);
    const res = await run({ action: "create_campaign_draft", name: "Launch", subject: "New flavour", bodyText: "Hello\n\nWorld", type: "announcement" }, ctx("user")) as { campaignId: number; status: string };
    expect(res).toMatchObject({ created: true, campaignId: 33, status: "draft" });
    expect(m.createCrmEmailCampaign.mock.calls[0][0]).toMatchObject({ name: "Launch", subject: "New flavour", bodyHtml: "<p>Hello</p><p>World</p>", bodyText: "Hello\n\nWorld", type: "announcement", status: "draft", companyId: 1, createdBy: 10 });
    expect(m.createCrmEmailCampaign.mock.calls[0][0]).not.toHaveProperty("scheduledAt");
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "crm_campaign", entityId: 33 }));
  });

  it("requires a body", async () => {
    await expect(run({ action: "create_campaign_draft", name: "x", subject: "y" }, ctx("user"))).rejects.toThrow(/bodyHtml or bodyText/);
  });

  it("refuses contractors", async () => {
    await expect(run({ action: "create_campaign_draft", name: "x", subject: "y", bodyText: "z" }, ctx("contractor"))).rejects.toThrow(/Not authorized/);
  });
});

describe("add_recipients", () => {
  it("delegates to campaignService with the caller's companyIds", async () => {
    s.addCampaignRecipients.mockResolvedValue({ added: 2, alreadyAdded: 0, skipped: [{ contactId: 9, reason: "Contact not found" }], totalRecipients: 12 });
    const res = await run({ action: "add_recipients", campaignId: 1, contactIds: [4, 5, "9"], contactTypes: ["customer"], useCampaignTargeting: true }, ctx("user")) as { added: number; skippedCount: number };
    expect(res).toMatchObject({ campaignId: 1, added: 2, skippedCount: 1, totalRecipients: 12 });
    expect(s.addCampaignRecipients).toHaveBeenCalledWith({
      campaign: expect.objectContaining({ id: 1 }),
      contactIds: [4, 5, 9],
      segment: { contactTypes: ["customer"], pipelineStages: undefined, tagIds: undefined, useCampaignTargeting: true },
      companyIds: [1],
    });
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "crm_campaign", entityId: 1, entityName: "added 2 recipients" }));
  });

  it("surfaces service precondition errors as tool errors", async () => {
    s.addCampaignRecipients.mockRejectedValue(new svc.CampaignError("Recipients cannot be changed while the campaign is sent", "PRECONDITION_FAILED"));
    await expect(run({ action: "add_recipients", campaignId: 1, contactIds: [1] }, ctx("user"))).rejects.toThrow(/cannot be changed/);
  });

  it("needs contactIds or a segment", async () => {
    await expect(run({ action: "add_recipients", campaignId: 1 }, ctx("user"))).rejects.toThrow(/Provide contactIds or a segment/);
    expect(s.addCampaignRecipients).not.toHaveBeenCalled();
  });
});

describe("schedule_campaign", () => {
  it("schedules through the service for sales/admin/exec", async () => {
    s.scheduleCampaign.mockResolvedValue({ scheduledAt: new Date("2026-10-01T09:00:00Z") });
    const res = await run({ action: "schedule_campaign", campaignId: 1, scheduledAt: "2026-10-01T09:00:00Z" }, ctx("sales")) as { scheduled: boolean };
    expect(res.scheduled).toBe(true);
    expect(s.scheduleCampaign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), new Date("2026-10-01T09:00:00Z"));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "crm_campaign", newValues: expect.objectContaining({ status: "scheduled" }) }));
  });

  it("refuses ops and regular users (campaignSendProcedure roles)", async () => {
    await expect(run({ action: "schedule_campaign", campaignId: 1, scheduledAt: "2026-10-01" }, ctx("ops"))).rejects.toThrow(/requires one of these roles/);
    await expect(run({ action: "schedule_campaign", campaignId: 1, scheduledAt: "2026-10-01" }, ctx("user"))).rejects.toThrow(/Not authorized/);
    expect(s.scheduleCampaign).not.toHaveBeenCalled();
  });
});
