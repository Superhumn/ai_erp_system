import { describe, expect, it } from "vitest";
import {
  campaignStatusLabel, canEditRecipients, canSendCampaign, enrollSummary, parseDateTimeLocal,
  recipientStatusCounts, toDateTimeLocalValue, unsentRecipientCount,
} from "./emailOutreach";

describe("emailOutreach helpers", () => {
  it("gates recipient edits and sends by campaign status", () => {
    for (const s of ["draft", "scheduled", "paused", "partially_failed", null]) {
      expect(canEditRecipients(s)).toBe(true);
      expect(canSendCampaign(s)).toBe(true);
    }
    for (const s of ["sending", "sent", "cancelled"]) {
      expect(canEditRecipients(s)).toBe(false);
      expect(canSendCampaign(s)).toBe(false);
    }
    expect(campaignStatusLabel("partially_failed")).toBe("partially failed");
    expect(campaignStatusLabel(undefined)).toBe("draft");
  });

  it("counts unsent recipients and summarises statuses in display order", () => {
    const rs = [{ status: "sent" }, { status: "failed" }, { status: "pending" }, { status: "sent" }, { status: null }, { status: "weird" }];
    expect(unsentRecipientCount(rs)).toBe(2);
    expect(recipientStatusCounts(rs)).toEqual([["pending", 2], ["sent", 2], ["failed", 1], ["weird", 1]]);
  });

  it("round-trips datetime-local values in local time", () => {
    const d = new Date(2026, 9, 5, 14, 30);
    expect(toDateTimeLocalValue(d)).toBe("2026-10-05T14:30");
    expect(parseDateTimeLocal("2026-10-05T14:30")).toEqual(d);
    expect(parseDateTimeLocal("2026-10-05T14:30:15")?.getSeconds()).toBe(15);
    expect(parseDateTimeLocal("")).toBeUndefined();
    expect(parseDateTimeLocal("2026-10-05")).toBeUndefined();
    expect(toDateTimeLocalValue(new Date("nope"))).toBe("");
  });

  it("summarises enroll results", () => {
    expect(enrollSummary({ enrolled: 1, skipped: [] })).toBe("Enrolled 1 contact");
    expect(enrollSummary({ enrolled: 2, skipped: [{ reason: "Already enrolled" }, { reason: "Already enrolled" }, { reason: "Contact not found" }] }))
      .toBe("Enrolled 2 contacts; skipped 2 (already enrolled), 1 (contact not found)");
  });
});
