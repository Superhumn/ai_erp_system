/**
 * Thread Follow-Up workflow.
 *
 * Automates polite, timezone-aware follow-up ("nudge") emails on outbound asks
 * that are awaiting a reply, with two behaviors depending on whether the
 * contact is an ACTIVE VENDOR (looked up from our records, never inferred from
 * the email):
 *
 *   NOT an active vendor (prospects, cold outreach, unknown companies):
 *     - One nudge, 5 business days after our unanswered ask.
 *     - 5 business days later, still nothing -> mark "dropped_no_response". Stop.
 *
 *   ACTIVE vendor (never drops; up to 4 automated emails, then a human):
 *     - Nudge 1: 3 business days after our unanswered message
 *     - Nudge 2: 5 business days later
 *     - Nudge 3: 5 business days later, cc our thread owner
 *     - Nudge 4: 5 business days later, to their manager / alternate contact
 *     - After Nudge 4: create a HIGH priority task for the thread owner and stop
 *       automated email — a human takes over.
 *
 * Stop conditions (cancel immediately, all cases): they reply at all; a manual
 * reply from our side; the linked task/PO/deal is closed/cancelled; they ask us
 * not to follow up. Out-of-office pauses the clock until their return date.
 *
 * Timing: send Tue–Thu only, 09:00–16:00 recipient-local, skipping public
 * holidays (US/IN/ZA/CO). See server/_core/businessDays.ts.
 *
 * A daily job scans for nextNudgeAt <= now and RE-CHECKS all stop conditions at
 * send time (not schedule time). Dry-run mode is default ON: it logs what it
 * would send and sends nothing.
 */
import {
  computeNextNudgeAt,
  isWithinSendWindow,
  nextSendSlot,
  resolveTimezone,
} from "./_core/businessDays";
import * as followupDb from "./db/threadFollowUp";
import type { EmailThreadFollowup } from "../drizzle/schema";

// ─── Cadence / step planning ────────────────────────────────────────────────

export interface FollowUpStep {
  action: "send" | "drop" | "escalate";
  nudgeNumber?: number; // 1-4 for sends
  gapBusinessDays: number; // business days from the cadence anchor (last outbound)
  ccThreadOwner?: boolean; // nudge 3
  toManager?: boolean; // nudge 4
}

export const MAX_AUTOMATED_EMAILS = 4;

/**
 * Given whether the contact is an active vendor and how many nudges have been
 * sent, return the next action (or null if the sequence is exhausted).
 *
 * `gapBusinessDays` is measured from the cadence anchor (our last outbound
 * message: the original ask before nudge 1, or the previous nudge thereafter).
 */
export function planStep(isActiveVendor: boolean, nudgeCount: number): FollowUpStep | null {
  if (!isActiveVendor) {
    // One nudge, then drop.
    if (nudgeCount === 0) return { action: "send", nudgeNumber: 1, gapBusinessDays: 5 };
    if (nudgeCount === 1) return { action: "drop", gapBusinessDays: 5 };
    return null;
  }
  // Active vendor: never drops.
  switch (nudgeCount) {
    case 0: return { action: "send", nudgeNumber: 1, gapBusinessDays: 3 };
    case 1: return { action: "send", nudgeNumber: 2, gapBusinessDays: 5 };
    case 2: return { action: "send", nudgeNumber: 3, gapBusinessDays: 5, ccThreadOwner: true };
    case 3: return { action: "send", nudgeNumber: 4, gapBusinessDays: 5, toManager: true };
    case 4: return { action: "escalate", gapBusinessDays: 5 };
    default: return null;
  }
}

// ─── Stop-condition evaluation ──────────────────────────────────────────────

export interface StopResult {
  stop: boolean;
  reason?: string;
}

/**
 * Evaluate hard stop conditions from thread state. Pure: `linkedEntityClosed`
 * (whether the linked task/PO/deal is closed/cancelled) is resolved by the
 * caller and passed in. OOO is handled separately (it pauses, not stops).
 */
export function evaluateStopConditions(
  thread: Pick<
    EmailThreadFollowup,
    "status" | "optedOut" | "lastInboundAt" | "lastOutboundAt" | "manualReplyAt"
  >,
  linkedEntityClosed: boolean,
): StopResult {
  if (thread.status !== "active") return { stop: true, reason: `already_${thread.status}` };
  if (thread.optedOut) return { stop: true, reason: "opted_out" };

  const outbound = thread.lastOutboundAt ? new Date(thread.lastOutboundAt).getTime() : 0;

  // They replied at all (after our last message, or we never sent).
  if (thread.lastInboundAt) {
    const inbound = new Date(thread.lastInboundAt).getTime();
    if (!thread.lastOutboundAt || inbound > outbound) return { stop: true, reason: "reply_received" };
  }
  // A human on our side sent a manual reply after our last automated message.
  if (thread.manualReplyAt) {
    const manual = new Date(thread.manualReplyAt).getTime();
    if (!thread.lastOutboundAt || manual >= outbound) return { stop: true, reason: "manual_reply" };
  }
  if (linkedEntityClosed) return { stop: true, reason: "linked_entity_closed" };
  return { stop: false };
}

/** True if the thread's clock is paused (OOO) at `now`. */
export function isPaused(thread: Pick<EmailThreadFollowup, "pausedUntil">, now: Date): boolean {
  return !!thread.pausedUntil && new Date(thread.pausedUntil).getTime() > now.getTime();
}

// ─── Out-of-office detection ────────────────────────────────────────────────

const OOO_RE = /\b(out of (the )?office|out-of-office|\booo\b|on (annual |sick )?leave|on vacation|on holiday|away from (the )?office|currently (away|unavailable))\b/i;
const OOO_RETURN_RE = /\b(?:back|return(?:ing)?|available again|reachable)\b[^.\n]*?\b(?:on|from|after|as of)\b\s*([A-Za-z0-9,\/\-\s]{3,40})/i;

/**
 * Detect an auto-reply / out-of-office message and, if present, the return
 * date to resume on. Pure and dependency-free so it is easy to unit-test.
 */
export function detectOutOfOffice(text?: string | null): { isOoo: boolean; until?: Date } {
  if (!text) return { isOoo: false };
  if (!OOO_RE.test(text)) return { isOoo: false };

  const m = OOO_RETURN_RE.exec(text);
  if (m && m[1]) {
    const parsed = parseLooseDate(m[1]);
    if (parsed) return { isOoo: true, until: parsed };
  }
  return { isOoo: true };
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Best-effort parse of a short date phrase like "Jan 5", "5 January 2026", "1/5/2026". */
export function parseLooseDate(raw: string): Date | undefined {
  const s = raw.trim().replace(/(\d+)(st|nd|rd|th)/gi, "$1");

  // Month-name forms: "January 5[, 2026]" or "5 January[ 2026]". The
  // (?!\d) guards stop a day token from swallowing the leading digits of a year.
  const mName = /([A-Za-z]{3,9})\s+(\d{1,2})(?!\d)(?:,?\s*(\d{4}))?/.exec(s)
    || /(\d{1,2})(?!\d)\s+([A-Za-z]{3,9})(?:,?\s*(\d{4}))?/.exec(s);
  if (mName) {
    const monthTok = /[A-Za-z]/.test(mName[1]) ? mName[1] : mName[2];
    const dayTok = /[A-Za-z]/.test(mName[1]) ? mName[2] : mName[1];
    const month = MONTHS[monthTok.slice(0, 3).toLowerCase()];
    const day = Number(dayTok);
    if (month != null && day >= 1 && day <= 31) {
      const year = mName[3] ? Number(mName[3]) : inferYear(month, day);
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    }
  }

  // Numeric forms: M/D[/YYYY] (US-style, the primary locale here)
  const mNum = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/.exec(s);
  if (mNum) {
    const month = Number(mNum[1]) - 1;
    const day = Number(mNum[2]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let year = mNum[3] ? Number(mNum[3]) : inferYear(month, day);
      if (year < 100) year += 2000;
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    }
  }
  return undefined;
}

// Without a year, assume the next occurrence of month/day (this year or next).
function inferYear(month: number, day: number): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  const candidate = Date.UTC(y, month, day, 12, 0, 0);
  return candidate >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) ? y : y + 1;
}

// ─── Nudge body generation ──────────────────────────────────────────────────
// Deterministic (no LLM) so tone rules are enforceable and testable: reply in
// the existing thread, under 4 sentences, restate the ask in one line, no
// guilt/urgency, later nudges are more specific (not more aggressive).

/** Phrases the tone guide forbids. Enforced by tests. */
export const BANNED_PHRASES = [
  "just circling back",
  "circling back",
  "bumping this",
  "just bumping",
  "gentle reminder",
  "as soon as possible",
  "asap",
  "urgent",
  "please respond immediately",
];

export function generateNudgeBody(opts: {
  contactName?: string | null;
  askSummary?: string | null;
  holdingUp?: string | null;
  nudgeNumber: number;
  isActiveVendor: boolean;
}): { text: string } {
  const ask = (opts.askSummary || "the item we asked about").trim().replace(/\.$/, "");
  const name = opts.contactName?.trim().split(/\s+/)[0];
  const greeting = name ? `Hi ${name},` : "Hi,";

  const sentences: string[] = [];
  // 1) Restate the ask in one line (more specific as nudges progress).
  if (opts.nudgeNumber <= 1) {
    sentences.push(`We're still waiting on ${ask}.`);
  } else if (opts.holdingUp) {
    sentences.push(`We're still waiting on ${ask}, which is holding up ${opts.holdingUp.trim().replace(/\.$/, "")}.`);
  } else {
    sentences.push(`We're still waiting on ${ask} to move this forward.`);
  }
  // 2) Low-key, specific ask for a status — never urgency or guilt.
  if (opts.nudgeNumber >= 3) {
    sentences.push(`If you can share where this stands or point me to the right person, that would help.`);
  } else {
    sentences.push(`A quick note on where this stands would help us plan.`);
  }

  const text = `${greeting}\n\n${sentences.join(" ")}\n\nThanks.`;
  return { text };
}

// ─── Dependency injection (testable) ────────────────────────────────────────

export interface SendThreadReplyInput {
  followupId: number;
  threadId: string;
  gmailThreadId?: string | null; // present => true in-thread Gmail reply with cc
  gmailMessageId?: string | null; // latest message in the thread (In-Reply-To/References)
  subject: string | null;
  to: string;
  cc?: string;
  bodyText: string;
  vendorId?: number | null;
  threadOwnerId?: number | null;
}

/** A send may return the provider message id of the message it just sent, so
 * the next nudge can reply to the most recent message in the thread. */
export interface SendThreadReplyResult {
  providerMessageId?: string;
  via: "gmail" | "queue";
}

export interface CreateEscalationTaskInput {
  threadOwnerId?: number | null;
  title: string;
  description: string;
  vendorId?: number | null;
  threadId: string;
}

export interface ThreadFollowUpDeps {
  now: () => Date;
  getDueThreadFollowups: (now: Date) => Promise<EmailThreadFollowup[]>;
  updateThreadFollowup: (id: number, updates: Partial<EmailThreadFollowup>) => Promise<void>;
  insertLog: (log: {
    followupId?: number | null;
    threadId?: string | null;
    action: string;
    reason?: string | null;
    nudgeNumber?: number | null;
    dryRun: boolean;
    detail?: unknown;
  }) => Promise<void>;
  /** Re-derive active-vendor status from our records at send time. */
  determineActiveVendor: (thread: EmailThreadFollowup) => Promise<{ isActiveVendor: boolean; vendorId?: number }>;
  /** Whether the linked task/PO/deal is closed or cancelled. */
  isLinkedEntityClosed: (thread: EmailThreadFollowup) => Promise<boolean>;
  getUserEmail: (userId: number) => Promise<string | null>;
  sendThreadReply: (input: SendThreadReplyInput) => Promise<SendThreadReplyResult | void>;
  createEscalationTask: (input: CreateEscalationTaskInput) => Promise<{ id: number } | null>;
}

// ─── The daily job ──────────────────────────────────────────────────────────

export interface JobResult {
  scanned: number;
  sent: number;
  skipped: number;
  dropped: number;
  escalated: number;
  stopped: number;
  errors: number;
  dryRun: boolean;
}

/** Dry-run default is ON: only THREAD_FOLLOWUP_DRY_RUN="false" turns it off. */
export function dryRunDefault(): boolean {
  return process.env.THREAD_FOLLOWUP_DRY_RUN !== "false";
}

/**
 * Scan for due follow-up threads and act on each. Re-checks ALL stop conditions
 * at send time. Safe to run repeatedly (idempotent per due window).
 */
export async function runThreadFollowUpJob(opts?: {
  dryRun?: boolean;
  deps?: Partial<ThreadFollowUpDeps>;
}): Promise<JobResult> {
  const deps = { ...buildDefaultDeps(), ...(opts?.deps || {}) };
  const dryRun = opts?.dryRun ?? dryRunDefault();
  const now = deps.now();

  const result: JobResult = {
    scanned: 0, sent: 0, skipped: 0, dropped: 0, escalated: 0, stopped: 0, errors: 0, dryRun,
  };

  const due = await deps.getDueThreadFollowups(now);
  result.scanned = due.length;

  for (const thread of due) {
    try {
      await processThread(thread, now, dryRun, deps, result);
    } catch (err) {
      result.errors++;
      await deps.insertLog({
        followupId: thread.id,
        threadId: thread.threadId,
        action: "error",
        reason: err instanceof Error ? err.message.slice(0, 120) : "unknown",
        dryRun,
      });
    }
  }
  return result;
}

async function processThread(
  thread: EmailThreadFollowup,
  now: Date,
  dryRun: boolean,
  deps: ThreadFollowUpDeps,
  result: JobResult,
): Promise<void> {
  const tz = resolveTimezone(thread.timezone, thread.country);

  // 1) Paused for OOO? Skip and ensure we resume on/after the return date.
  if (isPaused(thread, now)) {
    const resumeAt = new Date(thread.pausedUntil!);
    if (!thread.nextNudgeAt || new Date(thread.nextNudgeAt).getTime() < resumeAt.getTime()) {
      await deps.updateThreadFollowup(thread.id, { nextNudgeAt: resumeAt });
    }
    result.skipped++;
    await deps.insertLog({
      followupId: thread.id, threadId: thread.threadId, action: "nudge_skipped",
      reason: "paused_ooo", dryRun, detail: { pausedUntil: thread.pausedUntil },
    });
    return;
  }

  // 2) Re-derive active-vendor status from our records (never from the email).
  const vendorInfo = await deps.determineActiveVendor(thread);
  if (vendorInfo.isActiveVendor !== thread.isActiveVendor || (vendorInfo.vendorId && vendorInfo.vendorId !== thread.vendorId)) {
    thread.isActiveVendor = vendorInfo.isActiveVendor;
    if (vendorInfo.vendorId) thread.vendorId = vendorInfo.vendorId;
    await deps.updateThreadFollowup(thread.id, {
      isActiveVendor: vendorInfo.isActiveVendor,
      vendorId: vendorInfo.vendorId ?? thread.vendorId ?? undefined,
    });
  }

  // 3) Re-check ALL hard stop conditions AT SEND TIME.
  const linkedClosed = await deps.isLinkedEntityClosed(thread);
  const stop = evaluateStopConditions(thread, linkedClosed);
  if (stop.stop) {
    result.stopped++;
    // Terminal states already logged when set; only transition still-active ones.
    if (thread.status === "active") {
      await deps.updateThreadFollowup(thread.id, {
        status: "resolved", resolvedReason: stop.reason, nextNudgeAt: null,
      });
    }
    await deps.insertLog({
      followupId: thread.id, threadId: thread.threadId, action: "resolved",
      reason: stop.reason, dryRun,
    });
    return;
  }

  // 4) Plan the next step from cadence.
  const step = planStep(thread.isActiveVendor, thread.nudgeCount);
  if (!step) {
    // Sequence exhausted with no terminal transition — shouldn't happen; log.
    result.errors++;
    await deps.insertLog({
      followupId: thread.id, threadId: thread.threadId, action: "error",
      reason: "no_step", dryRun, detail: { nudgeCount: thread.nudgeCount, isActiveVendor: thread.isActiveVendor },
    });
    return;
  }

  if (step.action === "drop") {
    result.dropped++;
    await deps.updateThreadFollowup(thread.id, {
      status: "dropped_no_response", resolvedReason: "no_response", nextNudgeAt: null,
    });
    await deps.insertLog({
      followupId: thread.id, threadId: thread.threadId, action: "dropped",
      reason: "no_response", dryRun,
    });
    return;
  }

  if (step.action === "escalate") {
    await escalate(thread, now, dryRun, deps, result);
    return;
  }

  // step.action === "send"
  await sendNudge(thread, step, now, tz, dryRun, deps, result);
}

async function sendNudge(
  thread: EmailThreadFollowup,
  step: FollowUpStep,
  now: Date,
  tz: string,
  dryRun: boolean,
  deps: ThreadFollowUpDeps,
  result: JobResult,
): Promise<void> {
  // Re-check the send window at send time. If we're outside it (e.g. the daily
  // job runs at 6am, or on a Friday), reschedule to the next valid slot.
  if (!isWithinSendWindow(now, tz, thread.country)) {
    const nextSlot = nextSendSlot(now, tz, thread.country);
    await deps.updateThreadFollowup(thread.id, { nextNudgeAt: nextSlot });
    result.skipped++;
    await deps.insertLog({
      followupId: thread.id, threadId: thread.threadId, action: "nudge_skipped",
      reason: "outside_send_window", nudgeNumber: step.nudgeNumber, dryRun,
      detail: { rescheduledTo: nextSlot.toISOString(), timezone: tz },
    });
    return;
  }

  // Resolve recipient + cc.
  let to = thread.contactEmail;
  let recipientKind = "contact";
  if (step.toManager && thread.managerEmail) {
    to = thread.managerEmail;
    recipientKind = "manager";
  }
  let cc: string | undefined;
  if (step.ccThreadOwner && thread.threadOwnerId) {
    cc = (await deps.getUserEmail(thread.threadOwnerId)) || undefined;
  }

  const body = generateNudgeBody({
    contactName: recipientKind === "manager" ? null : thread.contactName,
    askSummary: thread.askSummary,
    holdingUp: thread.holdingUp,
    nudgeNumber: step.nudgeNumber!,
    isActiveVendor: thread.isActiveVendor,
  });

  const detail = {
    to, cc: cc || null, recipientKind,
    subject: thread.subject, // never a new subject line — reply in-thread
    bodyPreview: body.text,
    timezone: tz,
  };

  let sendResult: SendThreadReplyResult | void;
  if (!dryRun) {
    sendResult = await deps.sendThreadReply({
      followupId: thread.id,
      threadId: thread.threadId,
      gmailThreadId: thread.gmailThreadId,
      gmailMessageId: thread.gmailMessageId,
      subject: thread.subject,
      to,
      cc,
      bodyText: body.text,
      vendorId: thread.vendorId,
      threadOwnerId: thread.threadOwnerId,
    });
  }

  // Advance state: count this nudge and schedule the following action.
  const newCount = thread.nudgeCount + 1;
  const nextStep = planStep(thread.isActiveVendor, newCount);
  const nextNudgeAt = nextStep
    ? computeNextNudgeAt(now, nextStep.gapBusinessDays, tz, thread.country)
    : null;

  const stateUpdate: Partial<EmailThreadFollowup> = {
    nudgeCount: newCount,
    lastOutboundAt: now,
    lastNudgeAt: now,
    nextNudgeAt,
  };
  // If we sent a real Gmail reply, the message we just sent becomes the latest
  // message in the thread — the next nudge replies to it.
  if (sendResult && sendResult.providerMessageId) {
    stateUpdate.gmailMessageId = sendResult.providerMessageId;
  }
  await deps.updateThreadFollowup(thread.id, stateUpdate);

  result.sent++;
  await deps.insertLog({
    followupId: thread.id, threadId: thread.threadId, action: "nudge_sent",
    nudgeNumber: step.nudgeNumber, dryRun,
    detail: { ...detail, via: (sendResult && sendResult.via) || (dryRun ? null : "queue") },
  });
}

async function escalate(
  thread: EmailThreadFollowup,
  now: Date,
  dryRun: boolean,
  deps: ThreadFollowUpDeps,
  result: JobResult,
): Promise<void> {
  const vendorLabel = thread.contactName || thread.contactEmail || "Vendor";
  const days = daysSince(thread.lastOutboundAt || thread.createdAt, now);
  const title = `[Vendor] ${vendorLabel} not responding - ${days} days`;
  const description = buildThreadHistory(thread, days);

  let taskId: number | null = null;
  if (!dryRun) {
    const created = await deps.createEscalationTask({
      threadOwnerId: thread.threadOwnerId,
      title,
      description,
      vendorId: thread.vendorId,
      threadId: thread.threadId,
    });
    taskId = created?.id ?? null;
  }

  await deps.updateThreadFollowup(thread.id, {
    status: "escalated_to_human",
    resolvedReason: "escalated",
    nextNudgeAt: null,
    escalatedTaskId: taskId ?? undefined,
  });

  result.escalated++;
  await deps.insertLog({
    followupId: thread.id, threadId: thread.threadId, action: "escalated",
    reason: "max_nudges_no_response", dryRun,
    detail: { title, taskId, threadOwnerId: thread.threadOwnerId },
  });
}

function daysSince(from: Date | null, now: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / (24 * 3600 * 1000)));
}

function buildThreadHistory(thread: EmailThreadFollowup, days: number): string {
  return [
    `Automated follow-up exhausted for active vendor: ${thread.contactName || thread.contactEmail}.`,
    `${thread.nudgeCount} nudge(s) sent over ${days} days with no reply. A human should take over.`,
    ``,
    `Contact: ${thread.contactName || "-"} <${thread.contactEmail}>`,
    `Subject: ${thread.subject || "-"}`,
    thread.askSummary ? `Waiting on: ${thread.askSummary}` : "",
    thread.holdingUp ? `Holding up: ${thread.holdingUp}` : "",
    thread.managerEmail ? `Alternate/manager contact: ${thread.managerEmail}` : "",
    thread.relatedEntityType ? `Linked: ${thread.relatedEntityType} #${thread.relatedEntityId}` : "",
    `First contact: ${thread.createdAt ? new Date(thread.createdAt).toISOString() : "-"}`,
    `Last outbound: ${thread.lastOutboundAt ? new Date(thread.lastOutboundAt).toISOString() : "-"}`,
  ].filter(Boolean).join("\n");
}

// ─── Default (production) dependency implementations ────────────────────────

function buildDefaultDeps(): ThreadFollowUpDeps {
  return {
    now: () => new Date(),
    getDueThreadFollowups: (now) => followupDb.getDueThreadFollowups(now) as any,
    updateThreadFollowup: async (id, updates) => { await followupDb.updateThreadFollowup(id, updates as any); },
    insertLog: async (log) => {
      await followupDb.insertThreadFollowupLog({
        followupId: log.followupId ?? undefined,
        threadId: log.threadId ?? undefined,
        action: log.action as any,
        reason: log.reason ?? undefined,
        nudgeNumber: log.nudgeNumber ?? undefined,
        dryRun: log.dryRun,
        detail: (log.detail ?? undefined) as any,
      });
      // Also emit to stdout for live tailing / operator visibility.
      console.log(`[Thread Follow-Up]${log.dryRun ? " [dry-run]" : ""} ${log.action}` +
        `${log.reason ? ` (${log.reason})` : ""} thread=${log.threadId ?? "?"}`);
    },
    determineActiveVendor: defaultDetermineActiveVendor,
    isLinkedEntityClosed: defaultIsLinkedEntityClosed,
    getUserEmail: defaultGetUserEmail,
    sendThreadReply: defaultSendThreadReply,
    createEscalationTask: defaultCreateEscalationTask,
  };
}

/**
 * ACTIVE VENDOR = we have an existing relationship: an active contract, a PO, a
 * completed vendor payment, or the vendor is marked active in our vendor table.
 * Looked up from records, never inferred from the email.
 */
async function defaultDetermineActiveVendor(
  thread: EmailThreadFollowup,
): Promise<{ isActiveVendor: boolean; vendorId?: number }> {
  const procurement = await import("./db/procurement");
  const vendor = await procurement.findVendorByEmailOrName(thread.contactEmail || undefined, thread.contactName || undefined);
  if (!vendor) return { isActiveVendor: false };

  if ((vendor as any).status === "active") return { isActiveVendor: true, vendorId: vendor.id };

  const pos = await procurement.getPurchaseOrders({ vendorId: vendor.id });
  if (pos.some((p: any) => p.status !== "cancelled")) return { isActiveVendor: true, vendorId: vendor.id };

  try {
    const legal = await import("./db/legal");
    const contracts = await legal.getContracts({ type: "vendor" });
    if (contracts.some((c: any) => c.partyId === vendor.id && c.status === "active")) {
      return { isActiveVendor: true, vendorId: vendor.id };
    }
  } catch { /* legal helpers optional */ }

  try {
    if (await vendorHasCompletedPayment(vendor.id)) return { isActiveVendor: true, vendorId: vendor.id };
  } catch { /* payments optional */ }

  return { isActiveVendor: false, vendorId: vendor.id };
}

async function vendorHasCompletedPayment(vendorId: number): Promise<boolean> {
  const { getDb } = await import("./db/connection");
  const { payments } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.vendorId, vendorId), eq(payments.status, "completed" as any)))
    .limit(1);
  return rows.length > 0;
}

async function defaultIsLinkedEntityClosed(thread: EmailThreadFollowup): Promise<boolean> {
  if (!thread.relatedEntityType || !thread.relatedEntityId) return false;
  try {
    if (thread.relatedEntityType === "purchase_order") {
      const { getPurchaseOrderById } = await import("./db/procurement");
      const po = await getPurchaseOrderById(thread.relatedEntityId);
      if (!po) return false;
      return po.status === "cancelled" || po.status === "received";
    }
  } catch { /* best effort */ }
  return false;
}

async function defaultGetUserEmail(userId: number): Promise<string | null> {
  try {
    const { getUserById } = await import("./db/auth");
    const user = await getUserById(userId);
    return (user as any)?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a nudge as a reply inside the existing thread. The original subject is
 * preserved (never a new subject line).
 *
 * Preferred path: when we have the Gmail thread + message ids and the thread
 * owner has a connected Google account, reply via Gmail — this sets real
 * In-Reply-To/References headers and delivers cc/alternate recipients natively
 * (server/_core/gmail.ts replyToGmailMessage). Otherwise fall back to the
 * transactional email queue, recording cc/threading intent in metadata.
 */
async function defaultSendThreadReply(input: SendThreadReplyInput): Promise<SendThreadReplyResult> {
  const htmlBody = input.bodyText.replace(/\n/g, "<br>");

  if (input.gmailThreadId && input.gmailMessageId && input.threadOwnerId) {
    try {
      const { getValidGoogleAccessToken } = await import("./_core/googleToken");
      const { accessToken, error } = await getValidGoogleAccessToken(input.threadOwnerId);
      if (accessToken && !error) {
        const { replyToGmailMessage } = await import("./_core/gmail");
        const res = await replyToGmailMessage(accessToken, input.gmailThreadId, input.gmailMessageId, {
          to: input.to,
          cc: input.cc,
          subject: input.subject || "Following up",
          body: htmlBody,
          html: true,
        });
        if (res.success) return { via: "gmail", providerMessageId: res.messageId };
        console.warn(`[Thread Follow-Up] Gmail reply failed (${res.error}); falling back to queue`);
      } else if (error) {
        console.warn(`[Thread Follow-Up] No Gmail token (${error}); falling back to queue`);
      }
    } catch (err) {
      console.warn("[Thread Follow-Up] Gmail reply errored; falling back to queue:", err);
    }
  }

  // Fallback: transactional email queue (no native cc/threading — recorded in metadata).
  const emailService = await import("./_core/emailService");
  await emailService.queueEmail({
    templateName: "GENERAL" as any,
    to: { email: input.to, name: input.threadId },
    subject: input.subject || "Following up",
    payload: {
      htmlBody,
      cc: input.cc,
      inThreadReply: true,
      threadId: input.threadId,
    },
    relatedEntityType: "thread_followup",
    relatedEntityId: input.followupId,
    aiGenerated: true,
  });
  return { via: "queue" };
}

async function defaultCreateEscalationTask(
  input: CreateEscalationTaskInput,
): Promise<{ id: number } | null> {
  try {
    const projectId = await resolveEscalationProjectId(input.threadOwnerId);
    if (!projectId) return null;
    const { createProjectTaskFromSource } = await import("./taskAgentBridge");
    return await createProjectTaskFromSource({
      projectId,
      name: input.title,
      description: input.description,
      assigneeId: input.threadOwnerId ?? undefined,
      sourceType: "email",
      sourceRefType: "thread_followup",
      sourceExternalId: input.threadId,
      priority: "high",
      createdBy: input.threadOwnerId ?? undefined,
    });
  } catch (err) {
    console.warn("[Thread Follow-Up] Failed to create escalation task:", err);
    return null;
  }
}

async function resolveEscalationProjectId(ownerId?: number | null): Promise<number | null> {
  const projectsDb = await import("./db/projects");
  if (ownerId) {
    const owned = await projectsDb.getProjects({ ownerId });
    if (owned.length > 0) return owned[0].id;
  }
  const all = await projectsDb.getProjects();
  if (all.length > 0) return all[0].id;
  return null;
}

// ─── Enrollment & stop-condition hooks ──────────────────────────────────────

export interface EnrollThreadInput {
  threadId: string;
  gmailThreadId?: string; // enable true in-thread Gmail replies with cc
  gmailMessageId?: string; // latest message in the thread (In-Reply-To/References)
  contactEmail: string;
  contactName?: string;
  subject?: string;
  askSummary?: string; // one-line restatement of what we're waiting on
  holdingUp?: string; // what the outstanding item is holding up (later nudges name it)
  country?: string; // recipient country -> holiday calendar
  timezone?: string; // recipient IANA tz -> send window
  managerEmail?: string; // alternate contact for nudge 4
  threadOwnerId?: number; // our user who owns the thread
  relatedEntityType?: string;
  relatedEntityId?: number;
  /** When we sent the unanswered ask. Cadence is measured from here. */
  askSentAt: Date;
  deps?: Partial<ThreadFollowUpDeps>;
}

/**
 * Enroll (or refresh) a thread into the follow-up workflow. Looks up
 * active-vendor status from our records and schedules the first nudge:
 * 3 business days out for active vendors, 5 for everyone else.
 */
export async function enrollThread(input: EnrollThreadInput): Promise<{ id: number }> {
  const deps = { ...buildDefaultDeps(), ...(input.deps || {}) };

  const existing = await followupDb.getThreadFollowupByThreadId(input.threadId);

  const vendorInfo = await deps.determineActiveVendor({
    contactEmail: input.contactEmail,
    contactName: input.contactName ?? null,
  } as EmailThreadFollowup);

  const tz = resolveTimezone(input.timezone, input.country);
  const firstStep = planStep(vendorInfo.isActiveVendor, 0)!; // always a "send"
  const nextNudgeAt = computeNextNudgeAt(input.askSentAt, firstStep.gapBusinessDays, tz, input.country);

  const values: Partial<EmailThreadFollowup> = {
    threadId: input.threadId,
    gmailThreadId: input.gmailThreadId ?? null,
    gmailMessageId: input.gmailMessageId ?? null,
    contactEmail: input.contactEmail,
    contactName: input.contactName ?? null,
    subject: input.subject ?? null,
    askSummary: input.askSummary ?? null,
    holdingUp: input.holdingUp ?? null,
    country: input.country ?? null,
    timezone: input.timezone ?? null,
    managerEmail: input.managerEmail ?? null,
    threadOwnerId: input.threadOwnerId ?? null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    vendorId: vendorInfo.vendorId ?? null,
    isActiveVendor: vendorInfo.isActiveVendor,
    lastOutboundAt: input.askSentAt,
    nextNudgeAt,
    status: "active",
  };

  let id: number;
  if (existing) {
    await deps.updateThreadFollowup(existing.id, values);
    id = existing.id;
  } else {
    const created = await followupDb.createThreadFollowup({ ...values, nudgeCount: 0 } as any);
    id = Number(created.id);
  }

  await deps.insertLog({
    followupId: id, threadId: input.threadId, action: "enrolled",
    reason: vendorInfo.isActiveVendor ? "active_vendor" : "not_active_vendor",
    dryRun: false,
    detail: { nextNudgeAt: nextNudgeAt.toISOString(), timezone: tz },
  });

  return { id };
}

/** Record an inbound reply on a thread — a hard stop (they replied at all). */
export async function recordInboundReply(threadId: string, at: Date = new Date()): Promise<void> {
  const thread = await followupDb.getThreadFollowupByThreadId(threadId);
  if (!thread) return;

  // Out-of-office auto-reply pauses the clock instead of stopping.
  // (Callers that have the message body can pass it via pauseForOutOfOffice.)
  await followupDb.updateThreadFollowup(thread.id, {
    lastInboundAt: at,
    status: thread.status === "active" ? "resolved" : thread.status,
    resolvedReason: thread.status === "active" ? "reply_received" : thread.resolvedReason,
    nextNudgeAt: null,
  });
  await followupDb.insertThreadFollowupLog({
    followupId: thread.id, threadId, action: "resolved", reason: "reply_received", dryRun: false,
  });
}

/** Pause the clock for an out-of-office; resume on/after `until` (or +7d). */
export async function pauseForOutOfOffice(
  threadId: string, until?: Date, at: Date = new Date(),
): Promise<void> {
  const thread = await followupDb.getThreadFollowupByThreadId(threadId);
  if (!thread) return;
  const resumeAt = until ?? new Date(at.getTime() + 7 * 24 * 3600 * 1000);
  await followupDb.updateThreadFollowup(thread.id, {
    pausedUntil: resumeAt,
    lastInboundAt: at,
    nextNudgeAt: resumeAt,
  });
  await followupDb.insertThreadFollowupLog({
    followupId: thread.id, threadId, action: "paused", reason: "out_of_office",
    dryRun: false, detail: { resumeAt: resumeAt.toISOString() },
  });
}

/** A human on our side replied manually — a hard stop. */
export async function recordManualReply(threadId: string, at: Date = new Date()): Promise<void> {
  const thread = await followupDb.getThreadFollowupByThreadId(threadId);
  if (!thread) return;
  await followupDb.updateThreadFollowup(thread.id, {
    manualReplyAt: at,
    status: thread.status === "active" ? "resolved" : thread.status,
    resolvedReason: thread.status === "active" ? "manual_reply" : thread.resolvedReason,
    nextNudgeAt: null,
  });
  await followupDb.insertThreadFollowupLog({
    followupId: thread.id, threadId, action: "resolved", reason: "manual_reply", dryRun: false,
  });
}

/** They asked us not to follow up — a hard stop. */
export async function optOutThread(threadId: string): Promise<void> {
  const thread = await followupDb.getThreadFollowupByThreadId(threadId);
  if (!thread) return;
  await followupDb.updateThreadFollowup(thread.id, {
    optedOut: true,
    status: thread.status === "active" ? "resolved" : thread.status,
    resolvedReason: "opted_out",
    nextNudgeAt: null,
  });
  await followupDb.insertThreadFollowupLog({
    followupId: thread.id, threadId, action: "resolved", reason: "opted_out", dryRun: false,
  });
}
