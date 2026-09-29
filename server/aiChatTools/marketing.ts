/**
 * manage_marketing — AI Assistant chat tool for CRM email campaigns.
 *
 * Reads and drafting: any internal role (crm.campaigns.create is
 * protectedProcedure). add_recipients: internal. schedule_campaign: admin /
 * sales / exec, mirroring campaignSendProcedure. Recipient collection and the
 * scheduling rules come from campaignService.ts; sending never happens here —
 * a scheduled campaign is picked up by runDueCampaigns later.
 */
import * as db from "../db";
import { addCampaignRecipients, scheduleCampaign, CampaignError, CONTACT_TYPES, PIPELINE_STAGES } from "../campaignService";
import { escapeHtml } from "../campaignSender";
import type { CrmEmailCampaign } from "../../drizzle/schema";
import {
  type ChatToolModule,
  type ChatToolParams,
  type AIAgentContext,
  SALES_ROLES,
  ChatToolError,
  defineTool,
  requireInternal,
  requireRole,
  companyIdOf,
  inCompany,
  filterByCompany,
  notFound,
  requireNumber,
  requireString,
  requireDate,
  optionalNumber,
  optionalString,
  countBy,
  unknownAction,
} from "./types";

export const MARKETING_ACTIONS = [
  "list_campaigns",
  "campaign_stats",
  "create_campaign_draft",
  "add_recipients",
  "schedule_campaign",
] as const;

const CAMPAIGN_TYPES = ["newsletter", "drip", "announcement", "follow_up", "custom"] as const;

export const marketingTool = defineTool(
  "manage_marketing",
  "Marketing module: list email campaigns, get a campaign's send/open/click stats, draft a new campaign (never sends), add recipients by contact IDs or a segment (contact types, pipeline stages, tag IDs), or schedule a campaign for a future time. Sending is done by the scheduler after review, never by this tool.",
  MARKETING_ACTIONS,
  {
    campaignId: { type: "number", description: "Campaign ID (campaign_stats, add_recipients, schedule_campaign)" },
    status: { type: "string", description: "Status filter (list_campaigns)" },
    limit: { type: "number", description: "Max rows (list_campaigns)" },
    name: { type: "string", description: "Campaign name (create_campaign_draft)" },
    subject: { type: "string", description: "Email subject; supports {{firstName}} style merge fields (create_campaign_draft)" },
    bodyHtml: { type: "string", description: "HTML body (create_campaign_draft); bodyText is used when omitted" },
    bodyText: { type: "string", description: "Plain-text body (create_campaign_draft)" },
    type: { type: "string", enum: [...CAMPAIGN_TYPES], description: "Campaign type (create_campaign_draft)" },
    contactIds: { type: "array", items: { type: "number" }, description: "Explicit CRM contact IDs (add_recipients)" },
    contactTypes: { type: "array", items: { type: "string", enum: [...CONTACT_TYPES] }, description: "Segment by contact type (add_recipients)" },
    pipelineStages: { type: "array", items: { type: "string", enum: [...PIPELINE_STAGES] }, description: "Segment by pipeline stage (add_recipients)" },
    tagIds: { type: "array", items: { type: "number" }, description: "Segment by CRM tag IDs (add_recipients)" },
    useCampaignTargeting: { type: "boolean", description: "Also apply the campaign's own saved targeting (add_recipients)" },
    scheduledAt: { type: "string", description: "ISO datetime to send at (schedule_campaign)" },
  },
);

function compactCampaign(c: CrmEmailCampaign) {
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    type: c.type,
    status: c.status,
    scheduledAt: c.scheduledAt,
    sentAt: c.sentAt,
    totalRecipients: c.totalRecipients,
    sentCount: c.sentCount,
    openedCount: c.openedCount,
    clickedCount: c.clickedCount,
  };
}

async function loadCampaign(ctx: AIAgentContext, id: number): Promise<CrmEmailCampaign> {
  const c = await db.getCrmEmailCampaignById(id);
  if (!c || !inCompany(ctx, c.companyId)) return notFound("Campaign");
  return c;
}

function rethrow(err: unknown): never {
  if (err instanceof CampaignError) throw new ChatToolError(err.message);
  throw err;
}

async function listCampaigns(params: ChatToolParams, ctx: AIAgentContext) {
  const rows = filterByCompany(ctx, await db.getCrmEmailCampaigns({ status: optionalString(params.status), limit: optionalNumber(params.limit) ?? 50 }));
  return { campaigns: rows.map(compactCampaign), total: rows.length, byStatus: countBy(rows, (c) => c.status) };
}

async function campaignStats(params: ChatToolParams, ctx: AIAgentContext) {
  const campaign = await loadCampaign(ctx, requireNumber(params.campaignId, "campaignId"));
  const recipients = await db.getCrmCampaignRecipients(campaign.id);
  const sent = campaign.sentCount ?? 0;
  const pct = (n: number | null | undefined) => (sent > 0 ? Math.round(((n ?? 0) / sent) * 1000) / 10 : 0);
  return {
    campaign: compactCampaign(campaign),
    recipients: { total: recipients.length, byStatus: countBy(recipients, (r) => r.status) },
    rates: { openRate: pct(campaign.openedCount), clickRate: pct(campaign.clickedCount), bounceRate: pct(campaign.bouncedCount), unsubscribeRate: pct(campaign.unsubscribedCount) },
  };
}

async function createCampaignDraft(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "create campaign draft");
  const name = requireString(params.name, "name");
  const subject = requireString(params.subject, "subject");
  const bodyText = optionalString(params.bodyText);
  // Plain text from the chat is escaped before it becomes HTML so a "<" in the
  // copy can never turn into markup in the sent email.
  const bodyHtml = optionalString(params.bodyHtml) ?? (bodyText ? bodyText.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("") : undefined);
  if (!bodyHtml) throw new ChatToolError("bodyHtml or bodyText is required");
  const type = optionalString(params.type) as (typeof CAMPAIGN_TYPES)[number] | undefined;
  if (type && !CAMPAIGN_TYPES.includes(type)) throw new ChatToolError(`Unknown campaign type: ${type}`);
  const companyId = companyIdOf(ctx);

  // Same insert as crm.campaigns.create with status pinned to draft and no scheduledAt.
  const id = await db.createCrmEmailCampaign({
    name,
    subject,
    bodyHtml,
    bodyText,
    type,
    status: "draft",
    companyId: companyId ?? null,
    createdBy: ctx.userId,
  });
  await db.createAuditLog({ companyId, userId: ctx.userId, action: "create", entityType: "crm_campaign", entityId: id, entityName: name, newValues: { status: "draft", via: "ai_chat" } });
  return { created: true, campaignId: id, name, subject, status: "draft", message: "Draft saved. Add recipients, then review it in CRM > Marketing before scheduling." };
}

function numberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map((v) => (typeof v === "string" ? Number(v) : v)).filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0);
  return out.length ? out : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  return out.length ? out : undefined;
}

async function addRecipients(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "add campaign recipients");
  const campaign = await loadCampaign(ctx, requireNumber(params.campaignId, "campaignId"));
  const contactIds = numberList(params.contactIds);
  const contactTypes = stringList(params.contactTypes);
  const pipelineStages = stringList(params.pipelineStages);
  const tagIds = numberList(params.tagIds);
  const useCampaignTargeting = params.useCampaignTargeting === true;
  const segment = contactTypes || pipelineStages || tagIds || useCampaignTargeting
    ? { contactTypes, pipelineStages, tagIds, useCampaignTargeting }
    : undefined;
  if (!contactIds && !segment) throw new ChatToolError("Provide contactIds or a segment (contactTypes / pipelineStages / tagIds / useCampaignTargeting)");

  try {
    const result = await addCampaignRecipients({ campaign, contactIds, segment, companyIds: ctx.companyId != null ? [ctx.companyId] : null });
    await db.createAuditLog({ companyId: campaign.companyId ?? companyIdOf(ctx), userId: ctx.userId, action: "update", entityType: "crm_campaign", entityId: campaign.id, entityName: `added ${result.added} recipients`, newValues: { via: "ai_chat" } });
    return { campaignId: campaign.id, ...result, skippedCount: result.skipped.length, skipped: result.skipped.slice(0, 20) };
  } catch (err) {
    return rethrow(err);
  }
}

async function scheduleCampaignAction(params: ChatToolParams, ctx: AIAgentContext) {
  requireRole(ctx, SALES_ROLES, "schedule campaign");
  const campaign = await loadCampaign(ctx, requireNumber(params.campaignId, "campaignId"));
  const scheduledAt = requireDate(params.scheduledAt, "scheduledAt");
  try {
    await scheduleCampaign(campaign, scheduledAt);
  } catch (err) {
    return rethrow(err);
  }
  await db.createAuditLog({ companyId: campaign.companyId ?? companyIdOf(ctx), userId: ctx.userId, action: "update", entityType: "crm_campaign", entityId: campaign.id, entityName: `scheduled for ${scheduledAt.toISOString()}`, newValues: { status: "scheduled", via: "ai_chat" } });
  return { scheduled: true, campaignId: campaign.id, name: campaign.name, scheduledAt, message: "Campaign scheduled; the campaign scheduler will send it at that time. Use CRM > Marketing to unschedule." };
}

export async function executeMarketing(name: string, params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  if (name !== "manage_marketing") throw new ChatToolError(`Unknown tool: ${name}`);
  requireInternal(ctx, "use marketing tools");
  switch (params.action) {
    case "list_campaigns": return listCampaigns(params, ctx);
    case "campaign_stats": return campaignStats(params, ctx);
    case "create_campaign_draft": return createCampaignDraft(params, ctx);
    case "add_recipients": return addRecipients(params, ctx);
    case "schedule_campaign": return scheduleCampaignAction(params, ctx);
    default: return unknownAction("manage_marketing", params.action);
  }
}

export const marketingModule: ChatToolModule = {
  name: "marketing",
  tools: [marketingTool],
  execute: executeMarketing,
};
