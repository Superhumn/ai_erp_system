/**
 * Paid-ads marketing service. The paperwork behind paid ads:
 *
 *  - ingestAdLead()         a signup from any platform → CRM contact + ad_leads
 *                           row + welcome email + notification (dedup'd by
 *                           platform lead id).
 *  - syncSpendForPlatform() one platform's daily spend rows → ad_spend_daily.
 *  - runDailySpendSync()    every morning, yesterday's spend for each
 *                           connected platform; failed syncs are logged and
 *                           raise an alert.
 *  - runLeadPoll()          platforms without webhooks (LinkedIn) are polled.
 *  - runAlertChecks()       cost per signup above target 3 days running,
 *                           budget reached, credit 14 days from expiry.
 *  - runWeeklySummary()     Monday: spend, signups, cost per signup by platform.
 *
 * Cost per signup is spend ÷ signups (shared/adMarketing.ts), never stored.
 * The scheduler (adMarketingScheduler.ts) decides when each runs; the tRPC
 * router lets an admin run any of them by hand.
 */
import * as db from "./db";
import { sendEmail } from "./_core/email";
import { encrypt, safeDecryptToken } from "./_core/crypto";
import { createLogger } from "./_core/logger";
import type { AdCampaign, AdCredit, AdLead, AdPlatform, InsertCrmContact } from "../drizzle/schema";
import {
  AD_PLATFORM_LABELS,
  addIsoDays,
  costPerSignup,
  cpsAboveTargetStreak,
  creditNeedsExpiryWarning,
  creditRemainingUsd,
  daysUntil,
  sumSpend,
  sumSpendBy,
  toIsoDate,
  type AdPlatformName,
  type SpendTotals,
} from "../shared/adMarketing";
import {
  fetchDailySpend,
  fetchLeads,
  type DailySpendRow,
  type FetchFn,
  type PlatformCredentials,
  type PlatformLead,
} from "./_core/adPlatforms";

const logger = createLogger("AdMarketing");

/** Roles that get the "new lead" and alert notifications. */
export const ALERT_ROLES = ["admin", "exec", "sales"];

// ---------------------------------------------------------------------------
// Pure helpers (tested directly)
// ---------------------------------------------------------------------------

/** Parse a tags JSON column; anything unreadable becomes an empty list. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Existing tags plus new ones, deduplicated, order kept. */
export function mergeTags(existing: string | null | undefined, add: string[]): string {
  const out = parseTags(existing);
  for (const t of add) if (t && !out.includes(t)) out.push(t);
  return JSON.stringify(out);
}

/** Tags an ad lead carries into the CRM: the platform and the campaign. */
export function leadTags(platform: AdPlatformName | "landing_page" | "manual" | "other", campaignName?: string | null): string[] {
  const tags = [`ad:${platform}`];
  if (campaignName) tags.push(`campaign:${campaignName}`);
  return tags;
}

/** Split a display name into first/last for crm_contacts' NOT NULL firstName. */
export function splitName(fullName?: string | null, firstName?: string | null, lastName?: string | null): { firstName: string; lastName?: string; fullName: string } {
  const f = firstName?.trim();
  const l = lastName?.trim();
  if (f) return { firstName: f, lastName: l || undefined, fullName: [f, l].filter(Boolean).join(" ") };
  const full = fullName?.trim();
  if (full) {
    const parts = full.split(/\s+/);
    return { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined, fullName: full };
  }
  return { firstName: "Unknown", fullName: "Unknown" };
}

/** A campaign's lifetime spend has reached its total budget (or the daily budget times its run length). */
export function budgetReached(campaign: Pick<AdCampaign, "totalBudgetUsd" | "dailyBudgetUsd" | "startDate" | "endDate">, spendUsd: number): { reached: boolean; budgetUsd: number | null } {
  const total = campaign.totalBudgetUsd != null ? parseFloat(String(campaign.totalBudgetUsd)) : NaN;
  if (Number.isFinite(total) && total > 0) return { reached: spendUsd >= total, budgetUsd: total };
  const daily = campaign.dailyBudgetUsd != null ? parseFloat(String(campaign.dailyBudgetUsd)) : NaN;
  if (Number.isFinite(daily) && daily > 0 && campaign.startDate && campaign.endDate) {
    const days = Math.max(1, daysUntil(campaign.endDate, campaign.startDate) + 1);
    const budget = Math.round(daily * days * 100) / 100;
    return { reached: spendUsd >= budget, budgetUsd: budget };
  }
  return { reached: false, budgetUsd: null };
}

/** Render `{{firstName}}`, `{{name}}`, `{{campaign}}` in a welcome email. */
export function renderWelcome(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

export interface WeeklySummaryLine {
  platform: string;
  totals: SpendTotals;
}

/** Plain-text weekly summary. Used for both the notification and the email. */
export function weeklySummaryText(from: string, to: string, lines: WeeklySummaryLine[]): string {
  if (lines.length === 0) return `No ad spend recorded ${from} to ${to}.`;
  const all = sumSpend(lines.map((l) => l.totals));
  const rows = lines.map((l) => `${l.platform}: spend ${usd(l.totals.spendUsd)}, signups ${l.totals.signups}, cost per signup ${usd(l.totals.costPerSignup)}`);
  rows.push(`Total: spend ${usd(all.spendUsd)}, signups ${all.signups}, cost per signup ${usd(all.costPerSignup)}`);
  return `Ads ${from} to ${to}\n${rows.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function notifyTeam(input: { title: string; message: string; severity?: "info" | "warning" | "critical"; entityType?: string; entityId?: number; link?: string; email?: boolean }) {
  const users = await db.getUsersByRoles(ALERT_ROLES);
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await db.createNotificationsForAllUsers(
      { type: "alert", title: input.title, message: input.message, severity: input.severity ?? "info", entityType: input.entityType, entityId: input.entityId, link: input.link ?? "/marketing/ads" },
      ids,
    );
  }
  if (input.email) {
    for (const u of users) {
      if (!u.email) continue;
      try {
        await sendEmail({ to: u.email, subject: input.title, text: input.message });
      } catch (e) {
        logger.warn("Summary email failed", { to: u.email, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lead intake
// ---------------------------------------------------------------------------

export interface IngestLeadInput {
  source: "meta" | "linkedin" | "reddit" | "google" | "tiktok" | "landing_page" | "manual" | "other";
  platformId?: number | null;
  /** Resolve the campaign by internal id, platform id, or utm_campaign — first match wins. */
  campaignId?: number | null;
  externalCampaignId?: string | null;
  externalLeadId?: string | null;
  email?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  organization?: string | null;
  jobTitle?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string };
  answers?: Record<string, unknown>;
  receivedAt?: Date;
  companyId?: number | null;
  /** Skip the welcome email (manual entry, backfills). */
  skipWelcome?: boolean;
}

export interface IngestLeadResult {
  leadId: number;
  contactId: number | null;
  contactCreated: boolean;
  duplicate: boolean;
  campaignId: number | null;
  welcomeSent: boolean;
}

async function resolveCampaign(input: IngestLeadInput): Promise<AdCampaign | undefined> {
  if (input.campaignId) {
    const c = await db.getAdCampaignById(input.campaignId);
    if (c) return c;
  }
  if (input.platformId && input.externalCampaignId) {
    const c = await db.getAdCampaignByExternalId(input.platformId, input.externalCampaignId);
    if (c) return c;
  }
  if (input.utm?.campaign) return db.getAdCampaignByUtm(input.utm.campaign);
  return undefined;
}

export async function ingestAdLead(input: IngestLeadInput): Promise<IngestLeadResult> {
  // Retried webhooks and overlapping polls must not double-count.
  if (input.platformId && input.externalLeadId) {
    const existing = await db.getAdLeadByExternalId(input.platformId, input.externalLeadId);
    if (existing) {
      return { leadId: existing.id, contactId: existing.contactId, contactCreated: false, duplicate: true, campaignId: existing.campaignId, welcomeSent: !!existing.welcomeEmailSentAt };
    }
  }

  const campaign = await resolveCampaign(input);
  const platformId = input.platformId ?? campaign?.platformId ?? null;
  const platform = platformId ? await db.getAdPlatformById(platformId) : undefined;
  const platformKey = platform?.name ?? (input.source === "landing_page" || input.source === "manual" || input.source === "other" ? input.source : input.source);
  const companyId = input.companyId ?? campaign?.companyId ?? platform?.companyId ?? null;
  const name = splitName(input.fullName, input.firstName, input.lastName);
  const email = input.email?.trim().toLowerCase() || undefined;
  const tags = leadTags(platformKey, campaign?.name);

  // CRM contact: create or match on email/phone, then make sure the ad tags are on it.
  let contactId: number | null = null;
  let contactCreated = false;
  try {
    const contactData: InsertCrmContact = {
      companyId: companyId ?? undefined,
      firstName: name.firstName,
      lastName: name.lastName,
      fullName: name.fullName,
      email,
      phone: input.phone?.trim() || undefined,
      organization: input.organization?.trim() || undefined,
      jobTitle: input.jobTitle?.trim() || undefined,
      contactType: "lead",
      source: "paid_ad",
      pipelineStage: "new",
      tags: JSON.stringify(tags),
      captureData: input.answers ? JSON.stringify(input.answers) : undefined,
      notes: campaign ? `Signed up via ${AD_PLATFORM_LABELS[platformKey as AdPlatformName] ?? platformKey} ad "${campaign.name}"` : undefined,
    };
    const r = await db.findOrCreateCrmContact(contactData);
    contactId = r.id;
    contactCreated = r.created;
    if (!r.created) {
      const existing = await db.getCrmContactById(r.id);
      await db.updateCrmContact(r.id, { tags: mergeTags(existing?.tags, tags) });
    }
  } catch (e) {
    // A lead is still recorded even when the CRM write fails; it shows up unlinked.
    logger.error("CRM contact upsert failed for ad lead", { error: e instanceof Error ? e.message : String(e) });
  }

  const receivedAt = input.receivedAt ?? new Date();
  const leadId = await db.createAdLead({
    companyId: companyId ?? undefined,
    campaignId: campaign?.id ?? null,
    platformId,
    contactId,
    source: input.source,
    externalLeadId: input.externalLeadId ?? null,
    email: email ?? null,
    fullName: name.fullName,
    utmSource: input.utm?.source ?? (platform ? platform.name : null),
    utmMedium: input.utm?.medium ?? null,
    utmCampaign: input.utm?.campaign ?? campaign?.utmCampaign ?? null,
    utmContent: input.utm?.content ?? null,
    answersJson: input.answers ? JSON.stringify(input.answers) : null,
    receivedAt,
  });

  // Welcome email — only when the campaign has one configured and we have an address.
  let welcomeSent = false;
  if (!input.skipWelcome && email && campaign?.welcomeSubject && campaign?.welcomeBody) {
    const vars = { firstName: name.firstName === "Unknown" ? "" : name.firstName, name: name.fullName, campaign: campaign.name };
    try {
      const r = await sendEmail({
        to: email,
        subject: renderWelcome(campaign.welcomeSubject, vars),
        text: renderWelcome(campaign.welcomeBody, vars),
      });
      if (r.success) {
        welcomeSent = true;
        await db.updateAdLead(leadId, { welcomeEmailSentAt: new Date() });
      } else {
        await db.updateAdLead(leadId, { welcomeEmailError: r.error ?? "Email not sent" });
      }
    } catch (e) {
      await db.updateAdLead(leadId, { welcomeEmailError: e instanceof Error ? e.message : String(e) });
    }
  }

  await notifyTeam({
    title: "New ad lead",
    message: `${name.fullName}${email ? ` <${email}>` : ""} signed up via ${AD_PLATFORM_LABELS[platformKey as AdPlatformName] ?? platformKey}${campaign ? ` — ${campaign.name}` : ""}.`,
    entityType: "adLead",
    entityId: leadId,
    link: contactId ? `/crm/contacts/${contactId}` : "/marketing/ads",
  });

  return { leadId, contactId, contactCreated, duplicate: false, campaignId: campaign?.id ?? null, welcomeSent };
}

/** Ingest a lead fetched from a platform (webhook or poll). */
export async function ingestPlatformLead(platform: AdPlatform, lead: PlatformLead): Promise<IngestLeadResult> {
  return ingestAdLead({
    source: platform.name,
    platformId: platform.id,
    externalCampaignId: lead.externalCampaignId ?? null,
    externalLeadId: lead.externalLeadId,
    email: lead.email,
    fullName: lead.fullName,
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone,
    organization: lead.organization,
    jobTitle: lead.jobTitle,
    answers: lead.answers,
    receivedAt: lead.receivedAt,
    companyId: platform.companyId,
  });
}

// ---------------------------------------------------------------------------
// Platform credentials
// ---------------------------------------------------------------------------

export function platformCredentials(platform: AdPlatform): PlatformCredentials | null {
  if (!platform.accountId || !platform.accessToken) return null;
  return { accountId: platform.accountId, accessToken: safeDecryptToken(platform.accessToken), pageId: platform.pageId };
}

export function encryptToken(token: string): string {
  return encrypt(token);
}

// ---------------------------------------------------------------------------
// Spend sync
// ---------------------------------------------------------------------------

export interface SpendSyncResult {
  platformId: number;
  platform: AdPlatformName;
  rows: number;
  campaignsCreated: number;
  error?: string;
}

/** Write platform rows into ad_spend_daily, creating a campaign row for any campaign id we have not seen. */
export async function applySpendRows(platform: AdPlatform, rows: DailySpendRow[]): Promise<{ rows: number; campaignsCreated: number }> {
  let written = 0;
  let campaignsCreated = 0;
  const cache = new Map<string, number>();
  for (const r of rows) {
    let campaignId = cache.get(r.externalCampaignId);
    if (!campaignId) {
      const existing = await db.getAdCampaignByExternalId(platform.id, r.externalCampaignId);
      if (existing) {
        campaignId = existing.id;
      } else {
        campaignId = await db.createAdCampaign({
          companyId: platform.companyId ?? undefined,
          platformId: platform.id,
          externalId: r.externalCampaignId,
          name: r.campaignName || `${AD_PLATFORM_LABELS[platform.name]} campaign ${r.externalCampaignId}`,
          status: "active",
          notes: "Created automatically from the platform's spend report.",
        });
        campaignsCreated++;
      }
      cache.set(r.externalCampaignId, campaignId);
    }
    await db.upsertAdSpendDaily({
      campaignId,
      date: r.date,
      spendUsd: r.spendUsd.toFixed(2),
      impressions: r.impressions,
      clicks: r.clicks,
      signups: r.signups,
      source: "sync",
    });
    written++;
  }
  return { rows: written, campaignsCreated };
}

export async function syncSpendForPlatform(platform: AdPlatform, from: string, to: string, fetchImpl?: FetchFn): Promise<SpendSyncResult> {
  const creds = platformCredentials(platform);
  const base = { platformId: platform.id, platform: platform.name, rows: 0, campaignsCreated: 0 };
  if (!creds) {
    const error = "Not connected — add the account id and access token first";
    await db.createAdSyncLog({ platformId: platform.id, kind: "spend_sync", period: to, status: "skipped", message: error });
    return { ...base, error };
  }
  try {
    const rows = await fetchDailySpend(platform.name, creds, from, to, fetchImpl);
    const applied = await applySpendRows(platform, rows);
    await db.updateAdPlatform(platform.id, { connectionStatus: "connected", lastSyncAt: new Date(), lastSyncError: null });
    await db.createAdSyncLog({ platformId: platform.id, kind: "spend_sync", period: to, status: "success", rowsAffected: applied.rows, message: `${applied.rows} rows, ${applied.campaignsCreated} new campaigns` });
    return { ...base, ...applied };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error("Spend sync failed", { platform: platform.name, error });
    await db.updateAdPlatform(platform.id, { connectionStatus: "error", lastSyncError: error });
    await db.createAdSyncLog({ platformId: platform.id, kind: "spend_sync", period: to, status: "failed", message: error });
    await notifyTeam({
      title: `${AD_PLATFORM_LABELS[platform.name]} spend sync failed`,
      message: `${error}. Spend for ${to} was not recorded. Check the connection on the Platforms tab.`,
      severity: "warning",
      entityType: "adPlatform",
      entityId: platform.id,
    });
    return { ...base, error };
  }
}

/** Yesterday's spend for every connected platform. `date` defaults to yesterday (UTC). */
export async function runDailySpendSync(date?: string, fetchImpl?: FetchFn): Promise<SpendSyncResult[]> {
  const day = date ?? addIsoDays(toIsoDate(new Date()), -1);
  const platforms = await db.getAdPlatforms(null);
  const results: SpendSyncResult[] = [];
  for (const p of platforms) {
    if (p.connectionStatus === "disconnected" && !p.accessToken) continue;
    results.push(await syncSpendForPlatform(p, day, day, fetchImpl));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Lead polling (platforms that don't push leads to us)
// ---------------------------------------------------------------------------

export async function runLeadPoll(now: Date = new Date(), fetchImpl?: FetchFn): Promise<Array<{ platformId: number; leads: number; error?: string }>> {
  const platforms = (await db.getAdPlatforms(null)).filter((p) => p.name === "linkedin");
  const out: Array<{ platformId: number; leads: number; error?: string }> = [];
  for (const p of platforms) {
    const creds = platformCredentials(p);
    if (!creds) continue;
    // Look back 2 days; duplicates are dropped on the platform lead id.
    const since = now.getTime() - 2 * 24 * 60 * 60 * 1000;
    try {
      const leads = await fetchLeads(p.name, creds, since, now.getTime(), fetchImpl);
      let fresh = 0;
      for (const l of leads) {
        const r = await ingestPlatformLead(p, l);
        if (!r.duplicate) fresh++;
      }
      if (fresh > 0) await db.createAdSyncLog({ platformId: p.id, kind: "lead_sync", period: toIsoDate(now), status: "success", rowsAffected: fresh });
      out.push({ platformId: p.id, leads: fresh });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      logger.error("Lead poll failed", { platform: p.name, error });
      await db.createAdSyncLog({ platformId: p.id, kind: "lead_sync", period: toIsoDate(now), status: "failed", message: error });
      await notifyTeam({ title: `${AD_PLATFORM_LABELS[p.name]} lead sync failed`, message: error, severity: "warning", entityType: "adPlatform", entityId: p.id });
      out.push({ platformId: p.id, leads: 0, error });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface AlertCheckResult {
  cpsAlerts: number;
  budgetAlerts: number;
  creditAlerts: number;
}

/** Re-fire the same alert for a campaign at most once a week. */
const ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const cooledDown = (last: Date | null, now: Date) => !last || now.getTime() - last.getTime() > ALERT_COOLDOWN_MS;

export async function runAlertChecks(now: Date = new Date()): Promise<AlertCheckResult> {
  const result: AlertCheckResult = { cpsAlerts: 0, budgetAlerts: 0, creditAlerts: 0 };
  const yesterday = addIsoDays(toIsoDate(now), -1);
  const campaigns = (await db.getAdCampaigns({ status: "active" })) as AdCampaign[];
  const ids = campaigns.map((c) => c.id);
  const recent = await db.getAdSpend({ campaignIds: ids, from: addIsoDays(yesterday, -6), to: yesterday });
  const totals = await db.getAdSpendTotalsByCampaign(ids);
  const platforms = new Map((await db.getAdPlatforms(null)).map((p) => [p.id, p]));

  for (const c of campaigns) {
    const label = platforms.get(c.platformId)?.name;
    const platformLabel = label ? AD_PLATFORM_LABELS[label] : "Ads";
    const rows = recent.filter((r) => r.campaignId === c.id);

    // Cost per signup above target for 3 days in a row.
    const target = c.targetCostPerSignupUsd != null ? parseFloat(String(c.targetCostPerSignupUsd)) : null;
    if (cpsAboveTargetStreak(rows, target, yesterday) && cooledDown(c.cpsAlertAt, now)) {
      const last3 = sumSpend(rows.filter((r) => r.date > addIsoDays(yesterday, -3)));
      await notifyTeam({
        title: `Cost per signup above target: ${c.name}`,
        message: `${platformLabel} — last 3 days: spend ${usd(last3.spendUsd)}, signups ${last3.signups}, cost per signup ${usd(last3.costPerSignup)} vs target ${usd(target)}.`,
        severity: "warning",
        entityType: "adCampaign",
        entityId: c.id,
      });
      await db.updateAdCampaign(c.id, { cpsAlertAt: now });
      result.cpsAlerts++;
    }

    // Spend reached the budget.
    const t = totals.find((x) => x.campaignId === c.id);
    const spend = t?.spendUsd ?? 0;
    const budget = budgetReached(c, spend);
    if (budget.reached && cooledDown(c.budgetAlertAt, now)) {
      await notifyTeam({
        title: `Budget reached: ${c.name}`,
        message: `${platformLabel} — spend ${usd(spend)} has reached the budget of ${usd(budget.budgetUsd)}. Pause the campaign on the platform to avoid overspend.`,
        severity: "critical",
        entityType: "adCampaign",
        entityId: c.id,
      });
      await db.updateAdCampaign(c.id, { budgetAlertAt: now });
      result.budgetAlerts++;
    }
  }

  // Credits 14 days from expiry.
  const credits = (await db.getAdCredits()) as AdCredit[];
  for (const cr of credits) {
    if (!creditNeedsExpiryWarning(cr, now) || cr.expiryWarnedAt) continue;
    const remaining = creditRemainingUsd(cr.amountUsd, cr.amountUsedUsd);
    const days = cr.expiresAt ? daysUntil(cr.expiresAt, now) : 0;
    const platformName = cr.platformId ? platforms.get(cr.platformId)?.name : undefined;
    await notifyTeam({
      title: `Ad credit expiring: ${cr.offer}`,
      message: `${platformName ? AD_PLATFORM_LABELS[platformName] + " — " : ""}${usd(remaining)} remaining, expires ${cr.expiresAt ? toIsoDate(cr.expiresAt) : "soon"} (${days <= 0 ? "today" : `${days} days`}).`,
      severity: days <= 3 ? "critical" : "warning",
      entityType: "adCredit",
      entityId: cr.id,
    });
    await db.updateAdCredit(cr.id, { expiryWarnedAt: now });
    result.creditAlerts++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Weekly summary
// ---------------------------------------------------------------------------

export async function buildWeeklySummary(now: Date = new Date()): Promise<{ from: string; to: string; lines: WeeklySummaryLine[]; text: string }> {
  const to = addIsoDays(toIsoDate(now), -1);
  const from = addIsoDays(to, -6);
  const campaigns = (await db.getAdCampaigns()) as AdCampaign[];
  const platforms = new Map((await db.getAdPlatforms(null)).map((p) => [p.id, p]));
  const rows = await db.getAdSpend({ campaignIds: campaigns.map((c) => c.id), from, to });
  const platformOf = new Map(campaigns.map((c) => [c.id, platforms.get(c.platformId)?.name ?? "other"]));
  const lines = sumSpendBy(rows, (r) => platformOf.get(r.campaignId) ?? "other").map((g) => ({
    platform: AD_PLATFORM_LABELS[g.key as AdPlatformName] ?? g.key,
    totals: g.totals,
  }));
  return { from, to, lines, text: weeklySummaryText(from, to, lines) };
}

export async function runWeeklySummary(now: Date = new Date()): Promise<{ text: string }> {
  const s = await buildWeeklySummary(now);
  await notifyTeam({ title: `Weekly ads summary ${s.from} to ${s.to}`, message: s.text, entityType: "adSummary", email: true });
  return { text: s.text };
}

// ---------------------------------------------------------------------------
// Cost per signup screen
// ---------------------------------------------------------------------------

export async function spendSummary(campaigns: AdCampaign[], from: string, to: string) {
  const platforms = new Map((await db.getAdPlatforms(null)).map((p) => [p.id, p]));
  const rows = await db.getAdSpend({ campaignIds: campaigns.map((c) => c.id), from, to });
  const byCampaign = new Map(campaigns.map((c) => [c.id, c]));
  const platformKey = (campaignId: number) => {
    const c = byCampaign.get(campaignId);
    return c ? platforms.get(c.platformId)?.name ?? "other" : "other";
  };
  const byPlatform = sumSpendBy(rows, (r) => platformKey(r.campaignId)).map((g) => ({
    platform: g.key as AdPlatformName,
    label: AD_PLATFORM_LABELS[g.key as AdPlatformName] ?? g.key,
    ...g.totals,
  }));
  const perCampaign = sumSpendBy(rows, (r) => String(r.campaignId)).map((g) => {
    const c = byCampaign.get(Number(g.key));
    return { campaignId: Number(g.key), name: c?.name ?? `#${g.key}`, platform: platformKey(Number(g.key)), targetCostPerSignupUsd: c?.targetCostPerSignupUsd ?? null, ...g.totals };
  });
  const byDate = sumSpendBy(rows, (r) => r.date).map((g) => ({ date: g.key, ...g.totals }));
  return { from, to, total: sumSpend(rows), byPlatform, byCampaign: perCampaign, byDate };
}

export { costPerSignup };
export type { AdLead };
