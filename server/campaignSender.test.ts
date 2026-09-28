import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getCrmEmailCampaignById: vi.fn(),
  claimCrmEmailCampaignForSend: vi.fn(),
  resetFailedCrmCampaignRecipients: vi.fn(),
  getCrmCampaignRecipients: vi.fn(),
  getCrmContactsByIds: vi.fn(),
  claimCrmCampaignRecipient: vi.fn(),
  updateCrmCampaignRecipient: vi.fn(),
  updateCrmEmailCampaign: vi.fn(),
  getDueScheduledCrmEmailCampaigns: vi.fn(),
}));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn() }));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import {
  escapeHtml, mailableSkipReason, mapWithConcurrency, renderCampaignEmail, renderSubject, renderTemplate,
  runDueCampaigns, sendCampaign, sendCampaignTest,
} from "./campaignSender";

type Row = Record<string, any> & { id: number };

const NOW = new Date("2026-09-28T12:00:00.000Z");
const campaign = {
  id: 7, companyId: 1, status: "draft", subject: "Hi {{firstName}}", bodyHtml: "<p>Hello {{firstName}} from {{company}}</p>", bodyText: "Hello {{ firstName | there }}",
};
const contact = (id: number, over: Row | object = {}) => ({
  id, firstName: `F${id}`, lastName: "L", fullName: `F${id} L`, email: `c${id}@x.com`, organization: "Acme", status: "active", optedOutEmail: false, ...over,
});

/** Stateful recipients so the claim guard really behaves like the SQL one. */
function setup(recipients: Row[], contacts: Row[]) {
  const recs = recipients.map((r) => ({ ...r }));
  vi.mocked(db.getCrmEmailCampaignById).mockResolvedValue(campaign as never);
  vi.mocked(db.claimCrmEmailCampaignForSend).mockResolvedValue(true);
  vi.mocked(db.resetFailedCrmCampaignRecipients).mockImplementation(async () => {
    for (const r of recs) if (r.status === "failed") { r.status = "pending"; r.error = null; }
  });
  vi.mocked(db.getCrmCampaignRecipients).mockImplementation(async () => recs.map((r) => ({ ...r })) as never);
  vi.mocked(db.getCrmContactsByIds).mockImplementation(async (ids: number[]) => contacts.filter((c) => ids.includes(c.id)) as never);
  vi.mocked(db.claimCrmCampaignRecipient).mockImplementation(async (id: number) => {
    const r = recs.find((x) => x.id === id);
    if (!r || r.status !== "pending") return false;
    r.status = "sending";
    return true;
  });
  vi.mocked(db.updateCrmCampaignRecipient).mockImplementation(async (id: number, patch: object) => {
    Object.assign(recs.find((x) => x.id === id)!, patch);
  });
  return recs;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "m-1" });
});

describe("renderTemplate", () => {
  const c = { firstName: "Jane", lastName: "Doe", fullName: "Jane Doe", organization: "Acme & Co", email: "j@x.com" };

  it("substitutes merge fields, including aliases and whitespace", () => {
    expect(renderTemplate("{{firstName}} {{ lastName }} at {{company}} / {{organization}} <{{email}}> {{name}}", c, { html: false }))
      .toBe("Jane Doe at Acme & Co / Acme & Co <j@x.com> Jane Doe");
  });

  it("HTML-escapes substituted values but not the template", () => {
    const evil = { firstName: `<script>alert("x")</script>`, organization: "A&B 'Q'" };
    expect(renderTemplate("<b>{{firstName}}</b> {{company}}", evil, { html: true }))
      .toBe("<b>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</b> A&amp;B &#39;Q&#39;");
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("uses the fallback for blank values and blanks unknown fields", () => {
    expect(renderTemplate("Hi {{firstName|there}}, {{unknown}}!", { firstName: "  " }, { html: false })).toBe("Hi there, !");
    expect(renderTemplate("Hi {{ firstName | friend }}", {}, { html: true })).toBe("Hi friend");
  });

  it("subjects never carry line breaks", () => {
    expect(renderSubject("Hello {{firstName}}", { firstName: "A\r\nBcc: evil@x.com" })).toBe("Hello A Bcc: evil@x.com");
  });

  it("renderCampaignEmail renders subject, html and text", () => {
    expect(renderCampaignEmail(campaign as never, c)).toEqual({
      subject: "Hi Jane", html: "<p>Hello Jane from Acme &amp; Co</p>", text: "Hello Jane",
    });
  });
});

describe("mailableSkipReason", () => {
  it("skips missing, opted-out, unsubscribed, bounced and email-less contacts", () => {
    expect(mailableSkipReason(undefined)?.status).toBe("skipped");
    expect(mailableSkipReason({ email: "a@x.com", status: "active", optedOutEmail: true })).toEqual({ status: "unsubscribed", reason: "Contact opted out of email" });
    expect(mailableSkipReason({ email: "a@x.com", status: "unsubscribed", optedOutEmail: false })?.status).toBe("unsubscribed");
    expect(mailableSkipReason({ email: "a@x.com", status: "bounced", optedOutEmail: false })?.status).toBe("skipped");
    expect(mailableSkipReason({ email: " ", status: "active", optedOutEmail: false })?.reason).toBe("Contact has no email address");
    expect(mailableSkipReason({ email: "a@x.com", status: "active", optedOutEmail: null })).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  it("never exceeds the limit and preserves order", async () => {
    let inFlight = 0, peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});

describe("sendCampaign", () => {
  it("sends each pending recipient once with rendered content and records per-recipient status", async () => {
    const recs = setup(
      [
        { id: 1, contactId: 1, email: "c1@x.com", status: "pending" },
        { id: 2, contactId: 2, email: "c2@x.com", status: "pending" },
        { id: 3, contactId: 3, email: "c3@x.com", status: "pending" },
        { id: 4, contactId: 4, email: "old@x.com", status: "sent" },
        { id: 5, contactId: 5, email: "c5@x.com", status: "pending" },
      ],
      [contact(1, { firstName: "<Ann>" }), contact(2, { optedOutEmail: true }), contact(3, { email: null }), contact(4), contact(5)],
    );
    vi.mocked(sendEmail).mockImplementation(async (o) => (o.to === "c5@x.com" ? { success: false, error: "550 mailbox full" } : { success: true, messageId: "m-" + o.to }));

    const res = await sendCampaign(7, { now: () => NOW });

    expect(res).toMatchObject({ claimed: true, status: "partially_failed", sent: 1, failed: 1, skipped: 2, totalRecipients: 5, sentCount: 2 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith({ to: "c1@x.com", subject: "Hi <Ann>", html: "<p>Hello &lt;Ann&gt; from Acme</p>", text: "Hello <Ann>" });
    expect(recs.map((r) => r.status)).toEqual(["sent", "unsubscribed", "skipped", "sent", "failed"]);
    expect(recs[0]).toMatchObject({ sentAt: NOW, messageId: "m-c1@x.com", error: null });
    expect(recs[4]).toMatchObject({ error: "550 mailbox full" });
    expect(recs[2]).toMatchObject({ error: "Contact has no email address" });
    expect(db.updateCrmEmailCampaign).toHaveBeenCalledWith(7, { status: "partially_failed", sentAt: NOW, sentCount: 2, totalRecipients: 5, unsubscribedCount: 1 });
  });

  it("is idempotent: a re-send only retries failed recipients, never already-sent ones", async () => {
    const recs = setup(
      [
        { id: 1, contactId: 1, email: "c1@x.com", status: "sent" },
        { id: 2, contactId: 2, email: "c2@x.com", status: "failed", error: "timeout" },
      ],
      [contact(1), contact(2)],
    );
    const res = await sendCampaign(7, { now: () => NOW });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("c2@x.com");
    expect(recs.map((r) => r.status)).toEqual(["sent", "sent"]);
    expect(res.status).toBe("sent");
    expect(db.updateCrmEmailCampaign).toHaveBeenLastCalledWith(7, expect.objectContaining({ status: "sent", sentCount: 2 }));
  });

  it("does nothing when the campaign cannot be claimed (already sending elsewhere)", async () => {
    setup([{ id: 1, contactId: 1, email: "c1@x.com", status: "pending" }], [contact(1)]);
    vi.mocked(db.claimCrmEmailCampaignForSend).mockResolvedValue(false);
    const res = await sendCampaign(7);
    expect(res).toMatchObject({ claimed: false, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.updateCrmEmailCampaign).not.toHaveBeenCalled();
  });

  it("skips recipients another sender already claimed", async () => {
    const recs = setup([{ id: 1, contactId: 1, email: "c1@x.com", status: "pending" }], [contact(1)]);
    vi.mocked(db.claimCrmCampaignRecipient).mockResolvedValue(false);
    await sendCampaign(7);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recs[0].status).toBe("pending");
  });

  it("treats a throwing mailer as a failed recipient", async () => {
    const recs = setup([{ id: 1, contactId: 1, email: "c1@x.com", status: "pending" }], [contact(1)]);
    vi.mocked(sendEmail).mockRejectedValue(new Error("socket hang up"));
    const res = await sendCampaign(7);
    expect(res).toMatchObject({ failed: 1, status: "partially_failed" });
    expect(recs[0]).toMatchObject({ status: "failed", error: "socket hang up" });
  });

  it("returns unclaimed for an unknown campaign", async () => {
    vi.mocked(db.getCrmEmailCampaignById).mockResolvedValue(undefined);
    expect(await sendCampaign(99)).toMatchObject({ claimed: false, status: null });
    expect(db.claimCrmEmailCampaignForSend).not.toHaveBeenCalled();
  });
});

describe("sendCampaignTest / runDueCampaigns", () => {
  it("sends a [TEST] copy rendered with the sample contact", async () => {
    await sendCampaignTest(campaign as never, "me@x.com", { firstName: "Sam", organization: "Us" });
    expect(sendEmail).toHaveBeenCalledWith({ to: "me@x.com", subject: "[TEST] Hi Sam", html: "<p>Hello Sam from Us</p>", text: "Hello Sam" });
  });

  it("sends due scheduled campaigns, claiming only from scheduled", async () => {
    setup([{ id: 1, contactId: 1, email: "c1@x.com", status: "pending" }], [contact(1)]);
    vi.mocked(db.getDueScheduledCrmEmailCampaigns).mockResolvedValue([{ id: 7 }] as never);
    const out = await runDueCampaigns(NOW);
    expect(db.getDueScheduledCrmEmailCampaigns).toHaveBeenCalledWith(NOW);
    expect(db.claimCrmEmailCampaignForSend).toHaveBeenCalledWith(7, ["scheduled"], expect.any(Date));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ claimed: true, sent: 1, status: "sent" });
  });
});
