/**
 * Campaign recipient + scheduling logic shared by the CRM router
 * (crm.campaigns.addRecipients / schedule) and the AI Assistant chat tool
 * (aiChatTools/marketing.ts). Nothing in here sends mail: sending lives in
 * campaignSender.ts and is only reached through crm.campaigns.send/sendTest
 * and runDueCampaigns.
 */
import * as db from "./db";
import { mailableSkipReason, type CampaignStatus } from "./campaignSender";
import type { CrmEmailCampaign, CrmCampaignRecipient } from "../drizzle/schema";

export const CONTACT_TYPES = ["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"] as const;
export const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

/** Recipients can only be changed before the campaign goes out. */
export const RECIPIENT_EDITABLE_STATUSES: readonly CampaignStatus[] = ["draft", "scheduled", "paused", "partially_failed"];
export const SCHEDULABLE_STATUSES: readonly CampaignStatus[] = ["draft", "scheduled", "paused", "partially_failed"];

export class CampaignError extends Error {
  constructor(message: string, public readonly code: "NOT_FOUND" | "PRECONDITION_FAILED" | "BAD_REQUEST") {
    super(message);
    this.name = "CampaignError";
  }
}

/** Parses a JSON-array targeting column; tolerates null / malformed values. */
export function parseTargetList(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export interface RecipientSegment {
  useCampaignTargeting?: boolean;
  contactTypes?: string[];
  pipelineStages?: string[];
  tagIds?: number[];
}

export interface CollectRecipientsInput {
  campaign: Pick<CrmEmailCampaign, "id" | "status" | "targetContactTypes" | "targetPipelineStages" | "targetTags">;
  contactIds?: number[];
  segment?: RecipientSegment;
  /** Entities the caller may see; null = unrestricted. Contacts outside are reported as not found. */
  companyIds: number[] | null;
}

export interface RecipientCandidate { contactId: number; email: string }
export interface SkippedRecipient { contactId: number; reason: string }

function allows(companyIds: number[] | null, companyId: number | null | undefined): boolean {
  if (companyIds === null) return true;
  return companyId != null && companyIds.includes(companyId);
}

/**
 * Resolves explicit contacts and/or a segment into mailable recipient rows.
 * Contacts with no email, opted out, bounced or outside `companyIds` are skipped.
 */
export async function collectCampaignRecipients(input: CollectRecipientsInput): Promise<{ candidates: RecipientCandidate[]; skipped: SkippedRecipient[] }> {
  const { campaign } = input;
  if (!RECIPIENT_EDITABLE_STATUSES.includes(campaign.status ?? "draft")) {
    throw new CampaignError(`Recipients cannot be changed while the campaign is ${campaign.status}`, "PRECONDITION_FAILED");
  }
  if (!(input.contactIds?.length) && !input.segment) {
    throw new CampaignError("Provide contactIds or a segment", "BAD_REQUEST");
  }

  const skipped: SkippedRecipient[] = [];
  const candidates: RecipientCandidate[] = [];

  if (input.contactIds?.length) {
    const ids = Array.from(new Set(input.contactIds));
    const found = new Map((await db.getCrmContactsByIds(ids)).map((c) => [c.id, c]));
    for (const id of ids) {
      const c = found.get(id);
      if (!c || !allows(input.companyIds, c.companyId)) { skipped.push({ contactId: id, reason: "Contact not found" }); continue; }
      const skip = mailableSkipReason(c);
      if (skip || !c.email) { skipped.push({ contactId: id, reason: skip?.reason ?? "Contact has no email address" }); continue; }
      candidates.push({ contactId: c.id, email: c.email.trim() });
    }
  }

  if (input.segment) {
    const seg = input.segment;
    const contactTypes: string[] = (seg.contactTypes ?? []).filter((t) => (CONTACT_TYPES as readonly string[]).includes(t));
    const pipelineStages: string[] = (seg.pipelineStages ?? []).filter((s) => (PIPELINE_STAGES as readonly string[]).includes(s));
    const tagIds: number[] = (seg.tagIds ?? []).filter((n) => Number.isInteger(n) && n > 0);
    if (seg.useCampaignTargeting) {
      for (const v of parseTargetList(campaign.targetContactTypes)) if ((CONTACT_TYPES as readonly string[]).includes(String(v))) contactTypes.push(String(v));
      for (const v of parseTargetList(campaign.targetPipelineStages)) if ((PIPELINE_STAGES as readonly string[]).includes(String(v))) pipelineStages.push(String(v));
      for (const v of parseTargetList(campaign.targetTags)) { const n = Number(v); if (Number.isInteger(n) && n > 0) tagIds.push(n); }
    }
    if (!contactTypes.length && !pipelineStages.length && !tagIds.length) {
      throw new CampaignError("The segment has no criteria (set contact types, pipeline stages or tags)", "BAD_REQUEST");
    }
    const matches = await db.getCrmContactsForSegment({ contactTypes, pipelineStages, tagIds, companyIds: input.companyIds });
    for (const c of matches) {
      if (c.email && !mailableSkipReason(c)) candidates.push({ contactId: c.id, email: c.email.trim() });
    }
  }

  return { candidates, skipped };
}

export interface AddRecipientsResult {
  added: number;
  alreadyAdded: number;
  skipped: SkippedRecipient[];
  totalRecipients: number;
}

/** Collects + persists recipients; returns the same shape crm.campaigns.addRecipients does. */
export async function addCampaignRecipients(input: CollectRecipientsInput): Promise<AddRecipientsResult> {
  const { candidates, skipped } = await collectCampaignRecipients(input);
  const added = await db.addCrmCampaignRecipients(input.campaign.id, candidates);
  const refreshed = await db.getCrmEmailCampaignById(input.campaign.id);
  return {
    added,
    alreadyAdded: new Set(candidates.map((c) => c.contactId)).size - added,
    skipped,
    totalRecipients: refreshed?.totalRecipients ?? 0,
  };
}

/** Throws unless the campaign may be scheduled for `scheduledAt` (same rules as crm.campaigns.schedule). */
export function assertCampaignSchedulable(
  campaign: Pick<CrmEmailCampaign, "status">,
  recipients: readonly Pick<CrmCampaignRecipient, "status">[],
  scheduledAt: Date,
  now: Date = new Date(),
): void {
  if (!SCHEDULABLE_STATUSES.includes(campaign.status ?? "draft")) {
    throw new CampaignError(`Campaign is ${campaign.status}`, "PRECONDITION_FAILED");
  }
  if (scheduledAt.getTime() < now.getTime() - 60_000) {
    throw new CampaignError("Schedule time is in the past", "BAD_REQUEST");
  }
  if (!recipients.some((r) => r.status === "pending" || r.status === "failed")) {
    throw new CampaignError("No unsent recipients — add recipients first", "PRECONDITION_FAILED");
  }
}

/** Marks a campaign scheduled. The scheduler (runDueCampaigns) sends it later; this never sends. */
export async function scheduleCampaign(campaign: Pick<CrmEmailCampaign, "id" | "status">, scheduledAt: Date, now: Date = new Date()): Promise<{ scheduledAt: Date }> {
  const recipients = await db.getCrmCampaignRecipients(campaign.id);
  assertCampaignSchedulable(campaign, recipients, scheduledAt, now);
  await db.updateCrmEmailCampaign(campaign.id, { status: "scheduled", scheduledAt });
  return { scheduledAt };
}
