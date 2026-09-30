/**
 * Email sequence runner. Every tick (server/_core/index.ts, every 5 minutes):
 *
 *  1. For each active enrollment whose nextSendAt has passed, claim it with a
 *     guarded UPDATE (pushes nextSendAt out by a lease), so an overlapping
 *     tick or a second server instance skips it.
 *  2. Send the step after currentStepOrder, rendered with the shared
 *     merge-field renderer, then advance currentStepOrder and schedule the
 *     following step from its delayDays — or mark the enrollment completed.
 *  3. A failed send is retried on later ticks; after MAX_SEND_ATTEMPTS the
 *     enrollment is marked failed.
 *
 * The same tick also sends CRM campaigns whose scheduledAt has passed.
 */
import * as db from "./db";
import { sendEmail } from "./_core/email";
import type { EmailSequence, EmailSequenceEnrollment, EmailSequenceStep } from "../drizzle/schema";
import { createLogger } from "./_core/logger";
import { mailableSkipReason, renderSubject, renderTemplate, runDueCampaigns, textToHtml, type SendCampaignResult } from "./campaignSender";

const logger = createLogger("SequenceRunner");

export const MAX_SEND_ATTEMPTS = 3;
/** How long a claimed enrollment is held before another tick may retry it. */
export const CLAIM_LEASE_MS = 10 * 60 * 1000;
/** Wait before retrying a failed send. */
export const RETRY_DELAY_MS = 15 * 60 * 1000;
export const RUNNER_INTERVAL_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + Math.max(0, days) * DAY_MS);
}

/** Step after `currentStepOrder` in send order, or undefined when the sequence is done. */
export function nextStep(steps: EmailSequenceStep[], currentStepOrder: number): EmailSequenceStep | undefined {
  return [...steps].sort((a, b) => a.stepOrder - b.stepOrder || a.id - b.id).find((s) => s.stepOrder > currentStepOrder);
}

/**
 * Why an enrollment must stop before its next send, or null to keep going:
 * the contact opted out of email, or replied after being enrolled (a reply
 * means a human takes over the conversation).
 */
export function enrollmentStopReason(
  contact: { optedOutEmail?: boolean | null; lastRepliedAt?: Date | string | null } | null | undefined,
  enrollment: { createdAt?: Date | string | null },
): string | null {
  if (!contact) return null;
  if (contact.optedOutEmail) return "Contact opted out of email";
  if (contact.lastRepliedAt && enrollment.createdAt) {
    const replied = new Date(contact.lastRepliedAt).getTime();
    const enrolled = new Date(enrollment.createdAt).getTime();
    if (Number.isFinite(replied) && Number.isFinite(enrolled) && replied > enrolled) return "Contact replied";
  }
  return null;
}

/** When a newly enrolled contact receives the first step. */
export function firstSendAt(steps: EmailSequenceStep[], now: Date): Date | null {
  const first = nextStep(steps, 0);
  return first ? addDays(now, first.delayDays) : null;
}

export interface SequenceRunResult {
  due: number;
  claimed: number;
  sent: number;
  completed: number;
  retried: number;
  failed: number;
  stopped: number;
  deferred: number;
}

export async function runDueSequenceSteps(now: Date = new Date()): Promise<SequenceRunResult> {
  const result: SequenceRunResult = { due: 0, claimed: 0, sent: 0, completed: 0, retried: 0, failed: 0, stopped: 0, deferred: 0 };
  const due = await db.getDueEmailSequenceEnrollments(now);
  result.due = due.length;

  const sequences = new Map<number, EmailSequence | undefined>();
  const stepsBySequence = new Map<number, EmailSequenceStep[]>();
  const loadSequence = async (id: number) => {
    if (!sequences.has(id)) sequences.set(id, await db.getEmailSequenceById(id));
    return sequences.get(id);
  };
  const loadSteps = async (id: number) => {
    let steps = stepsBySequence.get(id);
    if (!steps) { steps = await db.getEmailSequenceSteps(id); stepsBySequence.set(id, steps); }
    return steps;
  };

  for (const enrollment of due) {
    try {
      if (!(await db.claimEmailSequenceEnrollment(enrollment.id, now, new Date(now.getTime() + CLAIM_LEASE_MS)))) continue;
      result.claimed++;
      await processEnrollment(enrollment, now, loadSequence, loadSteps, result);
    } catch (e) {
      logger.error("Enrollment failed", { enrollmentId: enrollment.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

async function processEnrollment(
  enrollment: EmailSequenceEnrollment,
  now: Date,
  loadSequence: (id: number) => Promise<EmailSequence | undefined>,
  loadSteps: (id: number) => Promise<EmailSequenceStep[]>,
  result: SequenceRunResult,
): Promise<void> {
  const stop = async (reason: string) => {
    result.stopped++;
    await db.updateEmailSequenceEnrollment(enrollment.id, { status: "stopped", stoppedReason: reason, nextSendAt: null });
  };

  const sequence = await loadSequence(enrollment.sequenceId);
  if (!sequence) return stop("Sequence was deleted");
  if (sequence.status === "archived") return stop("Sequence was archived");
  if (sequence.status !== "active") {
    // Draft/paused sequence: hold the enrollment; the claim lease already
    // pushed nextSendAt out, so it is looked at again later.
    result.deferred++;
    return;
  }

  const steps = await loadSteps(enrollment.sequenceId);
  const step = nextStep(steps, enrollment.currentStepOrder);
  if (!step) {
    result.completed++;
    await db.updateEmailSequenceEnrollment(enrollment.id, { status: "completed", nextSendAt: null });
    return;
  }

  const contact = await db.getCrmContactById(enrollment.contactId);
  const stopReason = enrollmentStopReason(contact, enrollment);
  if (stopReason) return stop(stopReason);
  const skip = mailableSkipReason(contact);
  if (skip || !contact?.email) return stop(skip?.reason ?? "Contact has no email address");

  const subject = renderSubject(step.subject, contact);
  const text = renderTemplate(step.body, contact, { html: false });
  let res: { success: boolean; error?: string };
  try {
    res = await sendEmail({ to: contact.email.trim(), subject, text, html: textToHtml(text) });
  } catch (e) {
    res = { success: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (res.success) {
    result.sent++;
    const following = nextStep(steps, step.stepOrder);
    // Status is only written when completing, so a pause made while this
    // send was in flight is not overwritten back to active.
    await db.updateEmailSequenceEnrollment(enrollment.id, {
      currentStepOrder: step.stepOrder,
      lastSentAt: now,
      attempts: 0,
      lastError: null,
      nextSendAt: following ? addDays(now, following.delayDays) : null,
      ...(following ? {} : { status: "completed" as const }),
    });
    if (!following) result.completed++;
    return;
  }

  const attempts = (enrollment.attempts ?? 0) + 1;
  const error = res.error ?? "Send failed";
  if (attempts >= MAX_SEND_ATTEMPTS) {
    result.failed++;
    await db.updateEmailSequenceEnrollment(enrollment.id, {
      status: "failed",
      attempts,
      lastError: error,
      stoppedReason: `Send failed after ${attempts} attempts: ${error}`.slice(0, 255),
      nextSendAt: null,
    });
  } else {
    result.retried++;
    await db.updateEmailSequenceEnrollment(enrollment.id, {
      attempts,
      lastError: error,
      nextSendAt: new Date(now.getTime() + RETRY_DELAY_MS),
    });
  }
}

/** One scheduler tick: due sequence steps, then due scheduled campaigns. */
export async function runEmailOutreachTick(now: Date = new Date()): Promise<{
  sequences: SequenceRunResult;
  campaigns: SendCampaignResult[];
}> {
  const sequences = await runDueSequenceSteps(now);
  const campaigns = await runDueCampaigns(now);
  return { sequences, campaigns };
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the 5-minute outreach tick. Safe to call twice; ticks never overlap in-process. */
export function startSequenceRunner(intervalMs: number = RUNNER_INTERVAL_MS): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runEmailOutreachTick();
      if (r.sequences.claimed > 0 || r.campaigns.length > 0) {
        logger.info("Tick", { ...r.sequences, campaignsSent: r.campaigns.filter((c) => c.claimed).length });
      }
    } catch (e) {
      logger.warn("Tick failed", { error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => { void tick(); }, intervalMs);
}

export function stopSequenceRunner(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
