import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDueEmailSequenceEnrollments: vi.fn(),
  claimEmailSequenceEnrollment: vi.fn(),
  getEmailSequenceById: vi.fn(),
  getEmailSequenceSteps: vi.fn(),
  getCrmContactById: vi.fn(),
  updateEmailSequenceEnrollment: vi.fn(),
  getDueScheduledCrmEmailCampaigns: vi.fn(async () => []),
}));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn() }));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import {
  CLAIM_LEASE_MS, MAX_SEND_ATTEMPTS, RETRY_DELAY_MS, addDays, enrollmentStopReason, firstSendAt, nextStep, runDueSequenceSteps, runEmailOutreachTick,
} from "./sequenceRunner";

type Row = Record<string, any> & { id: number };
const NOW = new Date("2026-09-28T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const steps = [
  { id: 11, sequenceId: 1, stepOrder: 1, subject: "Hi {{firstName}}", body: "Hello {{firstName}}\nfrom us", delayDays: 0 },
  { id: 13, sequenceId: 1, stepOrder: 3, subject: "Last", body: "Bye", delayDays: 7 },
  { id: 12, sequenceId: 1, stepOrder: 2, subject: "Again", body: "<b>{{company}}</b>", delayDays: 2 },
];
const jane = { id: 5, firstName: "Jane", organization: "A&B", email: "jane@x.com", status: "active", optedOutEmail: false };

/** In-memory enrollments with a claim that behaves like the guarded UPDATE. */
function setup(enrollments: Row[]) {
  const rows = enrollments.map((e) => ({ attempts: 0, status: "active", ...e }));
  vi.mocked(db.getDueEmailSequenceEnrollments).mockImplementation(async (now: Date) =>
    rows.filter((r) => r.status === "active" && r.nextSendAt && r.nextSendAt <= now).map((r) => ({ ...r })) as never);
  vi.mocked(db.claimEmailSequenceEnrollment).mockImplementation(async (id: number, now: Date, lease: Date) => {
    const r = rows.find((x) => x.id === id);
    if (!r || r.status !== "active" || !r.nextSendAt || r.nextSendAt > now) return false;
    r.nextSendAt = lease;
    return true;
  });
  vi.mocked(db.updateEmailSequenceEnrollment).mockImplementation(async (id: number, patch: object) => {
    Object.assign(rows.find((x) => x.id === id)!, patch);
  });
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getEmailSequenceById).mockResolvedValue({ id: 1, userId: 1, status: "active" } as never);
  vi.mocked(db.getEmailSequenceSteps).mockResolvedValue(steps as never);
  vi.mocked(db.getCrmContactById).mockResolvedValue(jane as never);
  vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "m" });
});

describe("step helpers", () => {
  it("orders steps by stepOrder and finds the next one", () => {
    expect(nextStep(steps as never, 0)?.id).toBe(11);
    expect(nextStep(steps as never, 1)?.id).toBe(12);
    expect(nextStep(steps as never, 3)).toBeUndefined();
    expect(firstSendAt(steps as never, NOW)).toEqual(NOW);
    expect(firstSendAt([], NOW)).toBeNull();
    expect(addDays(NOW, 2).getTime() - NOW.getTime()).toBe(2 * DAY);
  });
});

describe("runDueSequenceSteps", () => {
  it("sends the current step with merge fields, advances and schedules the next step", async () => {
    const rows = setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW }]);
    const r = await runDueSequenceSteps(NOW);
    expect(r).toMatchObject({ due: 1, claimed: 1, sent: 1, completed: 0 });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "jane@x.com", subject: "Hi Jane", text: "Hello Jane\nfrom us",
      html: expect.stringContaining("Hello Jane<br>from us"),
    });
    expect(rows[0]).toMatchObject({ status: "active", currentStepOrder: 1, lastSentAt: NOW, attempts: 0, nextSendAt: new Date(NOW.getTime() + 2 * DAY) });
  });

  it("escapes contact data in the HTML body", async () => {
    setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 1, nextSendAt: NOW }]);
    await runDueSequenceSteps(NOW);
    const html = vi.mocked(sendEmail).mock.calls[0][0].html!;
    expect(html).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("marks the enrollment completed after the last step", async () => {
    const rows = setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 2, nextSendAt: NOW }]);
    const r = await runDueSequenceSteps(NOW);
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toBe("Last");
    expect(r).toMatchObject({ sent: 1, completed: 1 });
    expect(rows[0]).toMatchObject({ status: "completed", currentStepOrder: 3, nextSendAt: null });
  });

  it("walks a contact through every step across ticks", async () => {
    const rows = setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW }]);
    let t = NOW;
    for (let i = 0; i < 5 && rows[0].status === "active"; i++) {
      await runDueSequenceSteps(t);
      t = new Date(t.getTime() + 10 * DAY);
    }
    expect(vi.mocked(sendEmail).mock.calls.map((c) => c[0].subject)).toEqual(["Hi Jane", "Again", "Last"]);
    expect(rows[0].status).toBe("completed");
  });

  it("does not send enrollments that are not yet due, paused, or already claimed", async () => {
    setup([
      { id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: new Date(NOW.getTime() + 1000) },
      { id: 2, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW, status: "paused" },
    ]);
    expect(await runDueSequenceSteps(NOW)).toMatchObject({ due: 0, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("two overlapping runs never double-send (row claim)", async () => {
    const rows = setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW }]);
    const [a, b] = await Promise.all([runDueSequenceSteps(NOW), runDueSequenceSteps(NOW)]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(a.claimed + b.claimed).toBe(1);
    expect(rows[0].currentStepOrder).toBe(1);
  });

  it("claims with a lease so a crashed run is retried later", async () => {
    setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW }]);
    vi.mocked(sendEmail).mockImplementation(() => new Promise(() => {})); // never settles
    void runDueSequenceSteps(NOW);
    await new Promise((r) => setTimeout(r, 5));
    expect(db.claimEmailSequenceEnrollment).toHaveBeenCalledWith(1, NOW, new Date(NOW.getTime() + CLAIM_LEASE_MS));
  });

  it("retries a failed send and marks the enrollment failed after the attempt cap", async () => {
    const rows = setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW }]);
    vi.mocked(sendEmail).mockResolvedValue({ success: false, error: "SendGrid 500" });

    let t = NOW;
    for (let i = 1; i < MAX_SEND_ATTEMPTS; i++) {
      const r = await runDueSequenceSteps(t);
      expect(r.retried).toBe(1);
      expect(rows[0]).toMatchObject({ status: "active", attempts: i, lastError: "SendGrid 500", currentStepOrder: 0, nextSendAt: new Date(t.getTime() + RETRY_DELAY_MS) });
      t = rows[0].nextSendAt;
    }
    const r = await runDueSequenceSteps(t);
    expect(r.failed).toBe(1);
    expect(rows[0]).toMatchObject({ status: "failed", attempts: MAX_SEND_ATTEMPTS, nextSendAt: null, stoppedReason: "Send failed after 3 attempts: SendGrid 500" });
    expect(sendEmail).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
    expect(await runDueSequenceSteps(new Date(t.getTime() + DAY))).toMatchObject({ due: 0 });
  });

  it("resets the attempt counter after a successful retry", async () => {
    const rows = setup([{ id: 1, sequenceId: 1, contactId: 5, currentStepOrder: 0, nextSendAt: NOW, attempts: 2, lastError: "x" }]);
    await runDueSequenceSteps(NOW);
    expect(rows[0]).toMatchObject({ attempts: 0, lastError: null, currentStepOrder: 1 });
  });

  it("stops enrollments for opted-out contacts and deleted/archived sequences; defers paused sequences", async () => {
    const rows = setup([
      { id: 1, sequenceId: 1, contactId: 6, currentStepOrder: 0, nextSendAt: NOW },
      { id: 2, sequenceId: 2, contactId: 5, currentStepOrder: 0, nextSendAt: NOW },
      { id: 3, sequenceId: 3, contactId: 5, currentStepOrder: 0, nextSendAt: NOW },
      { id: 4, sequenceId: 4, contactId: 5, currentStepOrder: 0, nextSendAt: NOW },
    ]);
    vi.mocked(db.getCrmContactById).mockImplementation(async (id: number) => (id === 6 ? { ...jane, id: 6, optedOutEmail: true } : jane) as never);
    vi.mocked(db.getEmailSequenceById).mockImplementation(async (id: number) =>
      (id === 1 ? { id, status: "active" } : id === 3 ? { id, status: "archived" } : id === 4 ? { id, status: "paused" } : undefined) as never);

    const r = await runDueSequenceSteps(NOW);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(r).toMatchObject({ stopped: 3, deferred: 1 });
    expect(rows.map((x) => [x.status, x.stoppedReason ?? null])).toEqual([
      ["stopped", "Contact opted out of email"],
      ["stopped", "Sequence was deleted"],
      ["stopped", "Sequence was archived"],
      ["active", null],
    ]);
    expect(rows[3].nextSendAt).toEqual(new Date(NOW.getTime() + CLAIM_LEASE_MS));
  });

  it("stops an enrollment before sending when the contact replied after enrolling", async () => {
    const enrolledAt = new Date(NOW.getTime() - 3 * DAY);
    const rows = setup([
      { id: 1, sequenceId: 1, contactId: 7, currentStepOrder: 1, nextSendAt: NOW, createdAt: enrolledAt },
      { id: 2, sequenceId: 1, contactId: 8, currentStepOrder: 1, nextSendAt: NOW, createdAt: enrolledAt },
    ]);
    vi.mocked(db.getCrmContactById).mockImplementation(async (id: number) =>
      (id === 7
        ? { ...jane, id: 7, lastRepliedAt: new Date(NOW.getTime() - DAY) } // replied after enrolling
        : { ...jane, id: 8, lastRepliedAt: new Date(enrolledAt.getTime() - DAY) }) as never); // replied before

    const r = await runDueSequenceSteps(NOW);
    expect(r).toMatchObject({ stopped: 1, sent: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: "stopped", stoppedReason: "Contact replied", nextSendAt: null });
    expect(rows[1].status).toBe("active");
  });

  it("enrollmentStopReason: opt-out wins, reply only counts after enrollment", () => {
    const enrolled = { createdAt: new Date("2026-09-01T00:00:00Z") };
    expect(enrollmentStopReason({ optedOutEmail: true }, enrolled)).toBe("Contact opted out of email");
    expect(enrollmentStopReason({ lastRepliedAt: new Date("2026-09-02T00:00:00Z") }, enrolled)).toBe("Contact replied");
    expect(enrollmentStopReason({ lastRepliedAt: new Date("2026-08-30T00:00:00Z") }, enrolled)).toBeNull();
    expect(enrollmentStopReason({ lastRepliedAt: null }, enrolled)).toBeNull();
    expect(enrollmentStopReason(undefined, enrolled)).toBeNull();
  });

  it("the outreach tick also sends due scheduled campaigns", async () => {
    setup([]);
    const r = await runEmailOutreachTick(NOW);
    expect(db.getDueScheduledCrmEmailCampaigns).toHaveBeenCalledWith(NOW);
    expect(r).toEqual({ sequences: expect.objectContaining({ due: 0 }), campaigns: [] });
  });
});
