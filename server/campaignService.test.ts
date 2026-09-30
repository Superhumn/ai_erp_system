import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getCrmContactsByIds: vi.fn(),
  getCrmContactsForSegment: vi.fn(),
  addCrmCampaignRecipients: vi.fn(),
  getCrmEmailCampaignById: vi.fn(),
  getCrmCampaignRecipients: vi.fn(),
  updateCrmEmailCampaign: vi.fn(),
}));

import * as db from "./db";
import { addCampaignRecipients, assertCampaignSchedulable, collectCampaignRecipients, parseTargetList, scheduleCampaign, CampaignError } from "./campaignService";

const m = vi.mocked(db);
const campaign = (patch: Record<string, unknown> = {}) => ({ id: 1, status: "draft", targetContactTypes: null, targetPipelineStages: null, targetTags: null, ...patch }) as never;
const contact = (id: number, patch: Record<string, unknown> = {}) => ({ id, companyId: 1, email: `c${id}@x.co`, status: "active", optedOutEmail: false, ...patch });

beforeEach(() => {
  vi.clearAllMocks();
  m.getCrmContactsByIds.mockResolvedValue([] as never);
  m.getCrmContactsForSegment.mockResolvedValue([] as never);
});

describe("parseTargetList", () => {
  it("tolerates null and malformed values", () => {
    expect(parseTargetList(null)).toEqual([]);
    expect(parseTargetList("nope")).toEqual([]);
    expect(parseTargetList('{"a":1}')).toEqual([]);
    expect(parseTargetList('["customer"]')).toEqual(["customer"]);
  });
});

describe("collectCampaignRecipients", () => {
  it("keeps mailable in-scope contacts and reports the rest", async () => {
    m.getCrmContactsByIds.mockResolvedValue([contact(1), contact(2, { optedOutEmail: true }), contact(3, { companyId: 2 }), contact(4, { email: null })] as never);
    const res = await collectCampaignRecipients({ campaign: campaign(), contactIds: [1, 2, 3, 4, 5, 1], companyIds: [1] });
    expect(res.candidates).toEqual([{ contactId: 1, email: "c1@x.co" }]);
    expect(res.skipped).toEqual([
      { contactId: 2, reason: "Contact opted out of email" },
      { contactId: 3, reason: "Contact not found" },
      { contactId: 4, reason: "Contact has no email address" },
      { contactId: 5, reason: "Contact not found" },
    ]);
  });

  it("merges the campaign's own targeting into the segment and passes companyIds", async () => {
    m.getCrmContactsForSegment.mockResolvedValue([contact(7), contact(8, { status: "bounced" })] as never);
    const res = await collectCampaignRecipients({
      campaign: campaign({ targetContactTypes: '["customer","bogus"]', targetPipelineStages: '["won"]', targetTags: '["3", 0]' }),
      segment: { useCampaignTargeting: true, contactTypes: ["lead"], tagIds: [2] },
      companyIds: [1],
    });
    expect(m.getCrmContactsForSegment).toHaveBeenCalledWith({ contactTypes: ["lead", "customer"], pipelineStages: ["won"], tagIds: [2, 3], companyIds: [1] });
    expect(res.candidates).toEqual([{ contactId: 7, email: "c7@x.co" }]);
  });

  it("rejects an empty segment, a sent campaign and a call with nothing to add", async () => {
    await expect(collectCampaignRecipients({ campaign: campaign(), segment: {}, companyIds: null })).rejects.toThrow(CampaignError);
    await expect(collectCampaignRecipients({ campaign: campaign({ status: "sent" }), contactIds: [1], companyIds: null })).rejects.toThrow(/cannot be changed while the campaign is sent/);
    await expect(collectCampaignRecipients({ campaign: campaign(), companyIds: null })).rejects.toThrow(/Provide contactIds or a segment/);
  });
});

describe("addCampaignRecipients", () => {
  it("persists candidates and reports duplicates", async () => {
    m.getCrmContactsByIds.mockResolvedValue([contact(1), contact(2)] as never);
    m.addCrmCampaignRecipients.mockResolvedValue(1 as never);
    m.getCrmEmailCampaignById.mockResolvedValue({ totalRecipients: 5 } as never);
    const res = await addCampaignRecipients({ campaign: campaign(), contactIds: [1, 2], companyIds: null });
    expect(m.addCrmCampaignRecipients).toHaveBeenCalledWith(1, [{ contactId: 1, email: "c1@x.co" }, { contactId: 2, email: "c2@x.co" }]);
    expect(res).toEqual({ added: 1, alreadyAdded: 1, skipped: [], totalRecipients: 5 });
  });
});

describe("scheduling", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("assertCampaignSchedulable enforces status, time and unsent recipients", () => {
    expect(() => assertCampaignSchedulable(campaign({ status: "sending" }), [{ status: "pending" }], new Date("2026-10-01"), now)).toThrow(/Campaign is sending/);
    expect(() => assertCampaignSchedulable(campaign(), [{ status: "pending" }], new Date("2026-09-01"), now)).toThrow(/in the past/);
    expect(() => assertCampaignSchedulable(campaign(), [{ status: "sent" }], new Date("2026-10-01"), now)).toThrow(/No unsent recipients/);
    expect(() => assertCampaignSchedulable(campaign(), [{ status: "failed" }], new Date("2026-10-01"), now)).not.toThrow();
  });

  it("scheduleCampaign flips the status without sending", async () => {
    m.getCrmCampaignRecipients.mockResolvedValue([{ status: "pending" }] as never);
    const at = new Date("2026-10-01T09:00:00Z");
    await expect(scheduleCampaign(campaign(), at, now)).resolves.toEqual({ scheduledAt: at });
    expect(m.updateCrmEmailCampaign).toHaveBeenCalledWith(1, { status: "scheduled", scheduledAt: at });
  });
});
