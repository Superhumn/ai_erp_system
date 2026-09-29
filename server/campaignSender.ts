/**
 * CRM email campaign sending, plus the merge-field renderer shared with
 * server/sequenceRunner.ts.
 *
 * Idempotency: a campaign is moved into `sending` with a guarded UPDATE (only
 * one sender wins), and every recipient is claimed pending → sending with a
 * guarded UPDATE before its email goes out. A recipient that reached
 * `sending` or `sent` is never mailed again; only `failed` ones are retried
 * when the campaign is re-sent.
 */
import * as db from "./db";
import { sendEmail, type EmailResult } from "./_core/email";
import type { CrmContact, CrmEmailCampaign } from "../drizzle/schema";
import { createLogger } from "./_core/logger";

const logger = createLogger("CampaignSender");

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type MergeContact = Partial<Pick<CrmContact,
  "firstName" | "lastName" | "fullName" | "email" | "organization" | "jobTitle" | "city" | "country">>;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Merge-field name (lower-cased) → contact value. */
function mergeValue(contact: MergeContact, key: string): string {
  switch (key.toLowerCase()) {
    case "firstname": return contact.firstName ?? "";
    case "lastname": return contact.lastName ?? "";
    case "fullname":
    case "name": return contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    case "email": return contact.email ?? "";
    case "company":
    case "organization": return contact.organization ?? "";
    case "jobtitle":
    case "title": return contact.jobTitle ?? "";
    case "city": return contact.city ?? "";
    case "country": return contact.country ?? "";
    default: return "";
  }
}

export const MERGE_FIELDS = ["firstName", "lastName", "fullName", "email", "company", "jobTitle", "city", "country"] as const;

/**
 * Replaces `{{field}}` / `{{ field | fallback }}` placeholders. In html mode
 * the substituted values (and fallbacks) are HTML-escaped; the template
 * itself is trusted author content and left as is. Unknown fields render as
 * their fallback or empty.
 */
export function renderTemplate(template: string, contact: MergeContact, opts: { html: boolean }): string {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_m, key: string, fallback?: string) => {
    const value = mergeValue(contact, key).trim() || (fallback ?? "");
    return opts.html ? escapeHtml(value) : value;
  });
}

/** Subject lines are a header: no CR/LF, whatever the contact data holds. */
export function renderSubject(template: string, contact: MergeContact): string {
  return renderTemplate(template, contact, { html: false }).replace(/[\r\n]+/g, " ").trim();
}

/** Plain text → minimal HTML (escaped, line breaks kept). */
export function textToHtml(text: string): string {
  return `<div style="font-family: sans-serif; line-height: 1.5;">${escapeHtml(text).replace(/\r?\n/g, "<br>")}</div>`;
}

export interface RenderedEmail { subject: string; html: string; text?: string }

export function renderCampaignEmail(
  campaign: Pick<CrmEmailCampaign, "subject" | "bodyHtml" | "bodyText">,
  contact: MergeContact,
): RenderedEmail {
  return {
    subject: renderSubject(campaign.subject, contact),
    html: renderTemplate(campaign.bodyHtml, contact, { html: true }),
    text: campaign.bodyText ? renderTemplate(campaign.bodyText, contact, { html: false }) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type SkipReason = { status: "skipped" | "unsubscribed"; reason: string };

/** Why a contact must not be mailed, or null if it may be. */
export function mailableSkipReason(
  contact: Pick<CrmContact, "email" | "status" | "optedOutEmail"> | undefined | null,
): SkipReason | null {
  if (!contact) return { status: "skipped", reason: "Contact no longer exists" };
  if (contact.optedOutEmail || contact.status === "unsubscribed") {
    return { status: "unsubscribed", reason: "Contact opted out of email" };
  }
  if (contact.status === "bounced") return { status: "skipped", reason: "Email address previously bounced" };
  if (!contact.email || !contact.email.trim()) return { status: "skipped", reason: "Contact has no email address" };
  return null;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

async function safeSend(options: Parameters<typeof sendEmail>[0]): Promise<EmailResult> {
  try {
    return await sendEmail(options);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const SEND_CONCURRENCY = 5;
/** A campaign stuck in `sending` this long (sender crashed) may be claimed again. */
export const STALE_SENDING_MS = 30 * 60 * 1000;

const DELIVERED_STATUSES = new Set(["sent", "delivered", "opened", "clicked"]);

export type CampaignStatus = NonNullable<CrmEmailCampaign["status"]>;

export interface SendCampaignResult {
  campaignId: number;
  /** false when another sender holds the campaign or it is not in a sendable status. */
  claimed: boolean;
  status: CampaignStatus | null;
  sent: number;
  failed: number;
  skipped: number;
  totalRecipients: number;
  sentCount: number;
}

export async function sendCampaign(
  campaignId: number,
  opts: { fromStatuses?: CampaignStatus[]; concurrency?: number; now?: () => Date } = {},
): Promise<SendCampaignResult> {
  const now = opts.now ?? (() => new Date());
  const fromStatuses = opts.fromStatuses ?? ["draft", "scheduled", "partially_failed", "paused"];
  const empty = (claimed: boolean, status: CampaignStatus | null): SendCampaignResult => ({
    campaignId, claimed, status, sent: 0, failed: 0, skipped: 0, totalRecipients: 0, sentCount: 0,
  });

  const campaign = await db.getCrmEmailCampaignById(campaignId);
  if (!campaign) return empty(false, null);

  const staleBefore = new Date(now().getTime() - STALE_SENDING_MS);
  if (!(await db.claimCrmEmailCampaignForSend(campaignId, fromStatuses, staleBefore))) {
    return empty(false, campaign.status ?? null);
  }

  let sent = 0, failed = 0, skipped = 0;
  try {
    await db.resetFailedCrmCampaignRecipients(campaignId);
    const pending = (await db.getCrmCampaignRecipients(campaignId)).filter((r) => r.status === "pending");
    const contacts = new Map((await db.getCrmContactsByIds(Array.from(new Set(pending.map((r) => r.contactId))))).map((c) => [c.id, c]));

    await mapWithConcurrency(pending, opts.concurrency ?? SEND_CONCURRENCY, async (recipient) => {
      if (!(await db.claimCrmCampaignRecipient(recipient.id))) return; // another sender has it
      const contact = contacts.get(recipient.contactId);
      const skip = mailableSkipReason(contact);
      if (skip || !contact?.email) {
        skipped++;
        await db.updateCrmCampaignRecipient(recipient.id, { status: skip?.status ?? "skipped", error: skip?.reason ?? "Contact has no email address" });
        return;
      }
      const to = contact.email.trim();
      const email = renderCampaignEmail(campaign, contact);
      const res = await safeSend({ to, subject: email.subject, html: email.html, text: email.text });
      if (res.success) {
        sent++;
        await db.updateCrmCampaignRecipient(recipient.id, { status: "sent", sentAt: now(), messageId: res.messageId ?? null, error: null, email: to });
      } else {
        failed++;
        await db.updateCrmCampaignRecipient(recipient.id, { status: "failed", error: res.error ?? "Send failed" });
      }
    });
  } catch (e) {
    // Leave the campaign retryable rather than stuck in `sending`.
    await db.updateCrmEmailCampaign(campaignId, { status: "partially_failed" });
    throw e;
  }

  const all = await db.getCrmCampaignRecipients(campaignId);
  const sentCount = all.filter((r) => DELIVERED_STATUSES.has(r.status ?? "")).length;
  const anyFailed = all.some((r) => r.status === "failed");
  const status: CampaignStatus = anyFailed ? "partially_failed" : "sent";
  await db.updateCrmEmailCampaign(campaignId, {
    status,
    sentAt: now(),
    sentCount,
    totalRecipients: all.length,
    unsubscribedCount: all.filter((r) => r.status === "unsubscribed").length,
  });
  return { campaignId, claimed: true, status, sent, failed, skipped, totalRecipients: all.length, sentCount };
}

/** Sends one rendered copy of the campaign to `to`, tagged [TEST]. Touches no recipient rows. */
export async function sendCampaignTest(
  campaign: Pick<CrmEmailCampaign, "subject" | "bodyHtml" | "bodyText">,
  to: string,
  sample: MergeContact,
): Promise<EmailResult> {
  const email = renderCampaignEmail(campaign, sample);
  return safeSend({ to, subject: `[TEST] ${email.subject}`, html: email.html, text: email.text });
}

/** Sends every campaign whose scheduledAt has passed. Called from the outreach tick. */
export async function runDueCampaigns(now: Date = new Date()): Promise<SendCampaignResult[]> {
  const due = await db.getDueScheduledCrmEmailCampaigns(now);
  const results: SendCampaignResult[] = [];
  for (const c of due) {
    try {
      results.push(await sendCampaign(c.id, { fromStatuses: ["scheduled"], now: () => now }));
    } catch (e) {
      logger.error("Scheduled campaign send failed", { campaignId: c.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
