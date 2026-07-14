import { describe, it, expect } from "vitest";
import {
  planStep,
  evaluateStopConditions,
  isPaused,
  detectOutOfOffice,
  parseLooseDate,
  generateNudgeBody,
  BANNED_PHRASES,
  runThreadFollowUpJob,
  type ThreadFollowUpDeps,
} from "./threadFollowUp";
import { zonedWallTimeToUtc } from "./_core/businessDays";
import type { EmailThreadFollowup } from "../drizzle/schema";

const NY = "America/New_York";

// ─── Cadence planning ───────────────────────────────────────────────────────

describe("planStep", () => {
  it("gives a non-vendor one nudge then a drop", () => {
    expect(planStep(false, 0)).toMatchObject({ action: "send", nudgeNumber: 1, gapBusinessDays: 5 });
    expect(planStep(false, 1)).toMatchObject({ action: "drop", gapBusinessDays: 5 });
    expect(planStep(false, 2)).toBeNull();
  });

  it("gives an active vendor 4 nudges then escalation, never a drop", () => {
    expect(planStep(true, 0)).toMatchObject({ action: "send", nudgeNumber: 1, gapBusinessDays: 3 });
    expect(planStep(true, 1)).toMatchObject({ action: "send", nudgeNumber: 2, gapBusinessDays: 5 });
    expect(planStep(true, 2)).toMatchObject({ action: "send", nudgeNumber: 3, gapBusinessDays: 5, ccThreadOwner: true });
    expect(planStep(true, 3)).toMatchObject({ action: "send", nudgeNumber: 4, gapBusinessDays: 5, toManager: true });
    expect(planStep(true, 4)).toMatchObject({ action: "escalate", gapBusinessDays: 5 });
    expect(planStep(true, 5)).toBeNull();
    // no "drop" anywhere in the active-vendor path
    for (let n = 0; n <= 5; n++) expect(planStep(true, n)?.action).not.toBe("drop");
  });
});

// ─── Stop conditions ────────────────────────────────────────────────────────

function threadStub(over: Partial<EmailThreadFollowup>): any {
  return {
    status: "active", optedOut: false, lastInboundAt: null, lastOutboundAt: null,
    manualReplyAt: null, pausedUntil: null, ...over,
  };
}

describe("evaluateStopConditions", () => {
  const t0 = new Date("2026-01-06T15:00:00Z");
  const later = new Date("2026-01-07T15:00:00Z");

  it("does not stop an untouched active thread", () => {
    expect(evaluateStopConditions(threadStub({ lastOutboundAt: t0 }), false)).toEqual({ stop: false });
  });

  it("stops when they reply after our last message", () => {
    expect(evaluateStopConditions(threadStub({ lastOutboundAt: t0, lastInboundAt: later }), false))
      .toMatchObject({ stop: true, reason: "reply_received" });
  });

  it("does not treat a stale earlier inbound as a fresh reply", () => {
    expect(evaluateStopConditions(threadStub({ lastInboundAt: t0, lastOutboundAt: later }), false))
      .toEqual({ stop: false });
  });

  it("stops on a manual reply from our side", () => {
    expect(evaluateStopConditions(threadStub({ lastOutboundAt: t0, manualReplyAt: later }), false))
      .toMatchObject({ stop: true, reason: "manual_reply" });
  });

  it("stops on opt-out and on a closed linked entity", () => {
    expect(evaluateStopConditions(threadStub({ optedOut: true }), false)).toMatchObject({ stop: true, reason: "opted_out" });
    expect(evaluateStopConditions(threadStub({ lastOutboundAt: t0 }), true)).toMatchObject({ stop: true, reason: "linked_entity_closed" });
  });

  it("reports already-terminal threads", () => {
    expect(evaluateStopConditions(threadStub({ status: "dropped_no_response" }), false))
      .toMatchObject({ stop: true, reason: "already_dropped_no_response" });
  });
});

describe("isPaused", () => {
  const now = new Date("2026-01-06T15:00:00Z");
  it("is paused only while pausedUntil is in the future", () => {
    expect(isPaused({ pausedUntil: new Date("2026-01-10T00:00:00Z") } as any, now)).toBe(true);
    expect(isPaused({ pausedUntil: new Date("2026-01-01T00:00:00Z") } as any, now)).toBe(false);
    expect(isPaused({ pausedUntil: null } as any, now)).toBe(false);
  });
});

// ─── Out-of-office detection ────────────────────────────────────────────────

describe("detectOutOfOffice", () => {
  it("detects OOO and extracts a return date", () => {
    const r = detectOutOfOffice("I am currently out of office and will be back on January 5, 2026.");
    expect(r.isOoo).toBe(true);
    expect(r.until?.getUTCMonth()).toBe(0);
    expect(r.until?.getUTCDate()).toBe(5);
  });

  it("detects OOO without a parseable date", () => {
    expect(detectOutOfOffice("On vacation, limited email access.")).toMatchObject({ isOoo: true });
  });

  it("ignores ordinary messages", () => {
    expect(detectOutOfOffice("Thanks, I'll review and get back to you.")).toEqual({ isOoo: false });
    expect(detectOutOfOffice(null)).toEqual({ isOoo: false });
  });
});

describe("parseLooseDate", () => {
  it("parses common date shapes", () => {
    expect(parseLooseDate("January 5, 2026")?.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(parseLooseDate("5 January 2026")?.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(parseLooseDate("3/10/2026")?.toISOString().slice(0, 10)).toBe("2026-03-10");
    expect(parseLooseDate("nonsense")).toBeUndefined();
  });
});

// ─── Nudge body / tone ──────────────────────────────────────────────────────

describe("generateNudgeBody", () => {
  it("stays under 4 sentences, restates the ask, and avoids banned phrases", () => {
    for (const nudgeNumber of [1, 2, 3, 4]) {
      const { text } = generateNudgeBody({
        contactName: "Dana", askSummary: "the signed MSA", holdingUp: "kickoff scheduling",
        nudgeNumber, isActiveVendor: true,
      });
      const sentences = (text.match(/[.!?]/g) || []).length;
      expect(sentences).toBeLessThan(4);
      expect(text.toLowerCase()).toContain("signed msa");
      for (const banned of BANNED_PHRASES) {
        expect(text.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it("names what the item is holding up on later nudges", () => {
    const { text } = generateNudgeBody({
      contactName: null, askSummary: "the COA", holdingUp: "the shipment release",
      nudgeNumber: 3, isActiveVendor: true,
    });
    expect(text.toLowerCase()).toContain("holding up the shipment release");
  });
});

// ─── Job orchestration (dependency-injected) ────────────────────────────────

function makeThread(over: Partial<EmailThreadFollowup>): EmailThreadFollowup {
  return {
    id: 1, threadId: "thread-1", subject: "Order 42", contactEmail: "v@acme.com",
    contactName: "Sam", country: "US", timezone: null, managerEmail: null,
    vendorId: 10, threadOwnerId: 7, relatedEntityType: null, relatedEntityId: null,
    askSummary: "the delivery date", holdingUp: null, isActiveVendor: true,
    nudgeCount: 0, nextNudgeAt: new Date("2026-01-06T14:00:00Z"),
    status: "active", pausedUntil: null, lastInboundAt: null,
    lastOutboundAt: new Date("2026-01-01T14:00:00Z"), lastNudgeAt: null,
    optedOut: false, manualReplyAt: null, escalatedTaskId: null, resolvedReason: null,
    createdAt: new Date("2026-01-01T14:00:00Z"), updatedAt: new Date("2026-01-01T14:00:00Z"),
    ...over,
  } as EmailThreadFollowup;
}

interface Harness {
  thread: EmailThreadFollowup;
  updates: Partial<EmailThreadFollowup>[];
  logs: any[];
  sends: any[];
  tasks: any[];
  deps: Partial<ThreadFollowUpDeps>;
}

function harness(thread: EmailThreadFollowup, now: Date, over?: Partial<ThreadFollowUpDeps>): Harness {
  const h: Harness = { thread, updates: [], logs: [], sends: [], tasks: [], deps: {} };
  h.deps = {
    now: () => now,
    getDueThreadFollowups: async () => [thread],
    updateThreadFollowup: async (_id, updates) => { h.updates.push(updates); Object.assign(thread, updates); },
    insertLog: async (log) => { h.logs.push(log); },
    determineActiveVendor: async (t) => ({ isActiveVendor: t.isActiveVendor, vendorId: t.vendorId ?? undefined }),
    isLinkedEntityClosed: async () => false,
    getUserEmail: async () => "owner@superhumn.co",
    sendThreadReply: async (input) => { h.sends.push(input); },
    createEscalationTask: async (input) => { h.tasks.push(input); return { id: 99 }; },
    ...over,
  };
  return h;
}

const IN_WINDOW = zonedWallTimeToUtc(2026, 1, 6, 10, 0, NY); // Tue 10:00 NY
const OUT_OF_WINDOW = zonedWallTimeToUtc(2026, 1, 9, 10, 0, NY); // Fri 10:00 NY

describe("runThreadFollowUpJob", () => {
  it("sends nudge 1 to an active vendor in-window and advances state", async () => {
    const thread = makeThread({ nudgeCount: 0 });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.sent).toBe(1);
    expect(h.sends).toHaveLength(1);
    expect(h.sends[0].to).toBe("v@acme.com");
    expect(thread.nudgeCount).toBe(1);
    expect(thread.nextNudgeAt).toBeInstanceOf(Date);
    expect(h.logs.some(l => l.action === "nudge_sent" && l.nudgeNumber === 1)).toBe(true);
  });

  it("in dry-run: advances state and logs, but sends nothing", async () => {
    const thread = makeThread({ nudgeCount: 0 });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: true, deps: h.deps });

    expect(r.dryRun).toBe(true);
    expect(r.sent).toBe(1);
    expect(h.sends).toHaveLength(0); // nothing actually sent
    expect(thread.nudgeCount).toBe(1);
    expect(h.logs.some(l => l.action === "nudge_sent" && l.dryRun === true)).toBe(true);
  });

  it("reschedules instead of sending when outside the send window", async () => {
    const thread = makeThread({ nudgeCount: 0 });
    const h = harness(thread, OUT_OF_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(1);
    expect(h.sends).toHaveLength(0);
    expect(thread.nudgeCount).toBe(0); // unchanged
    expect(h.logs.some(l => l.action === "nudge_skipped" && l.reason === "outside_send_window")).toBe(true);
  });

  it("cc's the thread owner on nudge 3", async () => {
    const thread = makeThread({ nudgeCount: 2 });
    const h = harness(thread, IN_WINDOW);
    await runThreadFollowUpJob({ dryRun: false, deps: h.deps });
    expect(h.sends[0].cc).toBe("owner@superhumn.co");
  });

  it("sends nudge 4 to the manager / alternate contact when on record", async () => {
    const thread = makeThread({ nudgeCount: 3, managerEmail: "boss@acme.com" });
    const h = harness(thread, IN_WINDOW);
    await runThreadFollowUpJob({ dryRun: false, deps: h.deps });
    expect(h.sends[0].to).toBe("boss@acme.com");
  });

  it("escalates an active vendor after nudge 4 and creates a high-priority task", async () => {
    const thread = makeThread({ nudgeCount: 4 });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.escalated).toBe(1);
    expect(h.tasks).toHaveLength(1);
    expect(h.tasks[0].title).toMatch(/not responding - \d+ days/);
    expect(thread.status).toBe("escalated_to_human");
    expect(thread.escalatedTaskId).toBe(99);
    expect(h.sends).toHaveLength(0);
  });

  it("does not create a task in dry-run escalation", async () => {
    const thread = makeThread({ nudgeCount: 4 });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: true, deps: h.deps });
    expect(r.escalated).toBe(1);
    expect(h.tasks).toHaveLength(0);
    expect(thread.status).toBe("escalated_to_human");
  });

  it("drops a non-vendor after its single nudge", async () => {
    const thread = makeThread({ isActiveVendor: false, nudgeCount: 1 });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.dropped).toBe(1);
    expect(thread.status).toBe("dropped_no_response");
    expect(h.sends).toHaveLength(0);
    expect(h.logs.some(l => l.action === "dropped")).toBe(true);
  });

  it("stops (resolves) when a reply arrived after scheduling — re-checked at send time", async () => {
    const thread = makeThread({
      nudgeCount: 1,
      lastOutboundAt: new Date("2026-01-01T14:00:00Z"),
      lastInboundAt: new Date("2026-01-05T14:00:00Z"), // replied after we scheduled
    });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.stopped).toBe(1);
    expect(thread.status).toBe("resolved");
    expect(thread.resolvedReason).toBe("reply_received");
    expect(h.sends).toHaveLength(0);
  });

  it("skips a paused (OOO) thread and reschedules to the resume date", async () => {
    const resumeAt = new Date("2026-01-20T14:00:00Z");
    const thread = makeThread({ nudgeCount: 1, pausedUntil: resumeAt });
    const h = harness(thread, IN_WINDOW);
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.skipped).toBe(1);
    expect(h.sends).toHaveLength(0);
    expect(thread.nextNudgeAt?.getTime()).toBe(resumeAt.getTime());
    expect(h.logs.some(l => l.action === "nudge_skipped" && l.reason === "paused_ooo")).toBe(true);
  });

  it("stops when the linked PO/deal is closed", async () => {
    const thread = makeThread({ nudgeCount: 1, relatedEntityType: "purchase_order", relatedEntityId: 5 });
    const h = harness(thread, IN_WINDOW, { isLinkedEntityClosed: async () => true });
    const r = await runThreadFollowUpJob({ dryRun: false, deps: h.deps });

    expect(r.stopped).toBe(1);
    expect(thread.status).toBe("resolved");
    expect(thread.resolvedReason).toBe("linked_entity_closed");
  });
});
