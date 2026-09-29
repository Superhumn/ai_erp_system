// ============================================================================
// Ad platform adapters — Meta (Instagram/Facebook), LinkedIn, Reddit
// ----------------------------------------------------------------------------
// Each adapter turns one platform's reporting API into the same shape:
// one DailySpendRow per campaign per day. Lead intake is separate: Meta and
// LinkedIn deliver lead-form submissions (webhook / poll), Reddit sends people
// to our landing page whose form posts to /webhooks/ads/leads.
//
// Hosts are fixed constants, never user input, so the third-party fetch guard
// is not needed here. Account ids are validated before they reach a URL.
//
// API references (versions pinned below; bump deliberately):
//   Meta   https://developers.facebook.com/docs/marketing-api/insights
//          https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
//   LinkedIn https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ads-reporting
//            https://learn.microsoft.com/linkedin/marketing/integrations/lead-sync/leadsync
//   Reddit https://ads-api.reddit.com/docs/v3/ (reports)
// ============================================================================

import type { AdPlatformName } from "../../shared/adMarketing";

export const META_GRAPH_VERSION = "v21.0";
export const LINKEDIN_API_VERSION = "202409";
export const REDDIT_ADS_BASE = "https://ads-api.reddit.com/api/v3";

export interface DailySpendRow {
  /** Campaign id on the platform. */
  externalCampaignId: string;
  campaignName?: string;
  /** YYYY-MM-DD */
  date: string;
  spendUsd: number;
  impressions: number;
  clicks: number;
  /** Lead-form submissions / signups reported by the platform. */
  signups: number;
}

export interface PlatformLead {
  externalLeadId: string;
  externalCampaignId?: string;
  campaignName?: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  organization?: string;
  jobTitle?: string;
  receivedAt: Date;
  /** Raw answers, exactly as the platform sent them. */
  answers: Record<string, unknown>;
}

export interface PlatformCredentials {
  accountId: string;
  accessToken: string;
  pageId?: string | null;
}

export type FetchFn = typeof fetch;

export class AdPlatformError extends Error {
  constructor(public platform: AdPlatformName, message: string, public status?: number) {
    super(`${platform}: ${message}`);
    this.name = "AdPlatformError";
  }
}

const ACCOUNT_ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;

function assertAccountId(platform: AdPlatformName, accountId: string): string {
  const id = accountId.trim();
  if (!ACCOUNT_ID_RE.test(id)) throw new AdPlatformError(platform, "Account id has unexpected characters");
  return id;
}

async function readJson(platform: AdPlatformName, res: Response): Promise<any> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const detail = body?.error?.message || body?.message || body?.error || text.slice(0, 200) || res.statusText;
    throw new AdPlatformError(platform, `HTTP ${res.status} — ${detail}`, res.status);
  }
  return body;
}

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Meta (Instagram + Facebook ads) — Marketing API insights
// ---------------------------------------------------------------------------

/** Action types Meta reports for a lead-form submission. */
const META_LEAD_ACTION_TYPES = new Set(["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "onsite_web_lead"]);

export function parseMetaInsights(payload: any): DailySpendRow[] {
  const data: any[] = Array.isArray(payload?.data) ? payload.data : [];
  return data.map((r) => {
    const actions: any[] = Array.isArray(r.actions) ? r.actions : [];
    const signups = actions
      .filter((a) => META_LEAD_ACTION_TYPES.has(String(a.action_type)))
      .reduce((max, a) => Math.max(max, toNum(a.value)), 0);
    return {
      externalCampaignId: String(r.campaign_id ?? ""),
      campaignName: r.campaign_name ? String(r.campaign_name) : undefined,
      date: String(r.date_start ?? ""),
      spendUsd: toNum(r.spend),
      impressions: Math.round(toNum(r.impressions)),
      clicks: Math.round(toNum(r.clicks)),
      signups: Math.round(signups),
    };
  }).filter((r) => r.externalCampaignId && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export async function fetchMetaDailySpend(creds: PlatformCredentials, from: string, to: string, fetchImpl: FetchFn = fetch): Promise<DailySpendRow[]> {
  const account = assertAccountId("meta", creds.accountId);
  const actId = account.startsWith("act_") ? account : `act_${account}`;
  const rows: DailySpendRow[] = [];
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,date_start",
    time_increment: "1",
    time_range: JSON.stringify({ since: from, until: to }),
    limit: "500",
    access_token: creds.accessToken,
  });
  let url: string | null = `https://graph.facebook.com/${META_GRAPH_VERSION}/${actId}/insights?${params}`;
  let guard = 0;
  while (url && guard++ < 20) {
    const res = await fetchImpl(url);
    const body = await readJson("meta", res);
    rows.push(...parseMetaInsights(body));
    url = typeof body?.paging?.next === "string" ? body.paging.next : null;
  }
  return rows;
}

/** Normalize Meta's field_data array ([{name, values:[..]}]) into a flat answers object. */
export function parseMetaLeadFieldData(fieldData: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(fieldData)) return out;
  for (const f of fieldData) {
    const name = String(f?.name ?? "").trim();
    const values: any[] = Array.isArray(f?.values) ? f.values : [];
    if (name && values.length) out[name] = values.map((v) => String(v)).join(", ");
  }
  return out;
}

export function metaLeadFromFieldData(leadgenId: string, node: any): PlatformLead {
  const answers = parseMetaLeadFieldData(node?.field_data);
  const lower = (k: string) => Object.entries(answers).find(([n]) => n.toLowerCase().replace(/[\s_-]/g, "") === k)?.[1];
  const fullName = lower("fullname") || lower("name");
  const firstName = lower("firstname");
  const lastName = lower("lastname");
  return {
    externalLeadId: leadgenId,
    externalCampaignId: node?.campaign_id ? String(node.campaign_id) : undefined,
    campaignName: node?.campaign_name ? String(node.campaign_name) : undefined,
    email: lower("email") || lower("workemail"),
    fullName: fullName || [firstName, lastName].filter(Boolean).join(" ") || undefined,
    firstName,
    lastName,
    phone: lower("phonenumber") || lower("phone"),
    organization: lower("companyname") || lower("company"),
    jobTitle: lower("jobtitle"),
    receivedAt: node?.created_time ? new Date(node.created_time) : new Date(),
    answers,
  };
}

/** Fetch one lead by the leadgen_id from a Meta webhook. */
export async function fetchMetaLead(creds: PlatformCredentials, leadgenId: string, fetchImpl: FetchFn = fetch): Promise<PlatformLead> {
  if (!/^\d{1,32}$/.test(leadgenId)) throw new AdPlatformError("meta", "Bad leadgen id");
  const params = new URLSearchParams({
    fields: "id,created_time,field_data,campaign_id,campaign_name,ad_id,form_id",
    access_token: creds.accessToken,
  });
  const res = await fetchImpl(`https://graph.facebook.com/${META_GRAPH_VERSION}/${leadgenId}?${params}`);
  const node = await readJson("meta", res);
  return metaLeadFromFieldData(leadgenId, node);
}

/** leadgen ids referenced in a Meta webhook body (object: "page"). */
export function extractMetaLeadgenIds(body: any): Array<{ leadgenId: string; pageId?: string; formId?: string; adId?: string; createdTime?: number }> {
  if (body?.object !== "page" || !Array.isArray(body?.entry)) return [];
  const out: Array<{ leadgenId: string; pageId?: string; formId?: string; adId?: string; createdTime?: number }> = [];
  for (const entry of body.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "leadgen") continue;
      const v = change.value ?? {};
      if (v.leadgen_id) {
        out.push({
          leadgenId: String(v.leadgen_id),
          pageId: v.page_id ? String(v.page_id) : undefined,
          formId: v.form_id ? String(v.form_id) : undefined,
          adId: v.ad_id ? String(v.ad_id) : undefined,
          createdTime: typeof v.created_time === "number" ? v.created_time : undefined,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LinkedIn — Ads Reporting (adAnalytics) + Lead Sync (leadFormResponses)
// ---------------------------------------------------------------------------

function liDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return `(year:${y},month:${m},day:${d})`;
}

function liHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

const LI_CAMPAIGN_URN_RE = /urn:li:sponsoredCampaign:(\d+)/;

export function parseLinkedInAnalytics(payload: any): DailySpendRow[] {
  const elements: any[] = Array.isArray(payload?.elements) ? payload.elements : [];
  const rows: DailySpendRow[] = [];
  for (const e of elements) {
    const pivots: string[] = Array.isArray(e.pivotValues) ? e.pivotValues.map(String) : [];
    const urn = pivots.find((p) => LI_CAMPAIGN_URN_RE.test(p));
    const id = urn?.match(LI_CAMPAIGN_URN_RE)?.[1];
    const start = e?.dateRange?.start;
    if (!id || !start) continue;
    const date = `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;
    rows.push({
      externalCampaignId: id,
      date,
      spendUsd: toNum(e.costInUsd ?? e.costInLocalCurrency),
      impressions: Math.round(toNum(e.impressions)),
      clicks: Math.round(toNum(e.clicks)),
      signups: Math.round(toNum(e.oneClickLeads)),
    });
  }
  return rows;
}

export async function fetchLinkedInDailySpend(creds: PlatformCredentials, from: string, to: string, fetchImpl: FetchFn = fetch): Promise<DailySpendRow[]> {
  const account = assertAccountId("linkedin", creds.accountId);
  const url =
    `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY` +
    `&dateRange=(start:${liDate(from)},end:${liDate(to)})` +
    `&accounts=List(urn%3Ali%3AsponsoredAccount%3A${account})` +
    `&fields=impressions,clicks,costInUsd,costInLocalCurrency,oneClickLeads,pivotValues,dateRange`;
  const res = await fetchImpl(url, { headers: liHeaders(creds.accessToken) });
  return parseLinkedInAnalytics(await readJson("linkedin", res));
}

export function parseLinkedInLeadResponses(payload: any): PlatformLead[] {
  const elements: any[] = Array.isArray(payload?.elements) ? payload.elements : [];
  return elements.map((e) => {
    const answers: Record<string, unknown> = {};
    const list: any[] = Array.isArray(e?.formResponse?.answers) ? e.formResponse.answers : [];
    for (const a of list) {
      const key = String(a?.questionId ?? a?.question ?? "");
      const ans = a?.answer ?? {};
      const val = ans.textQuestionAnswer?.answer ?? ans.multipleChoiceAnswer?.value ?? ans.value ?? ans;
      if (key) answers[key] = val;
    }
    const byQuestion = (kind: string): string | undefined => {
      const hit = list.find((a) => String(a?.predefinedQuestion ?? a?.questionId ?? "").toUpperCase().includes(kind));
      const ans = hit?.answer?.textQuestionAnswer?.answer;
      return typeof ans === "string" && ans.trim() ? ans.trim() : undefined;
    };
    const firstName = byQuestion("FIRST_NAME");
    const lastName = byQuestion("LAST_NAME");
    const campaignUrn = String(e?.leadMetadata?.sponsoredLeadMetadata?.campaign ?? e?.campaign ?? "");
    return {
      externalLeadId: String(e?.id ?? ""),
      externalCampaignId: campaignUrn.match(LI_CAMPAIGN_URN_RE)?.[1],
      email: byQuestion("EMAIL"),
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      phone: byQuestion("PHONE"),
      organization: byQuestion("COMPANY"),
      jobTitle: byQuestion("JOB_TITLE") || byQuestion("TITLE"),
      receivedAt: typeof e?.submittedAt === "number" ? new Date(e.submittedAt) : new Date(),
      answers,
    };
  }).filter((l) => l.externalLeadId);
}

export async function fetchLinkedInLeads(creds: PlatformCredentials, sinceMs: number, untilMs: number, fetchImpl: FetchFn = fetch): Promise<PlatformLead[]> {
  const account = assertAccountId("linkedin", creds.accountId);
  const url =
    `https://api.linkedin.com/rest/leadFormResponses?q=owner` +
    `&owner=(sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A${account})` +
    `&leadType=(leadType:SPONSORED)` +
    `&submittedAtTimeRange=(start:${Math.floor(sinceMs)},end:${Math.floor(untilMs)})`;
  const res = await fetchImpl(url, { headers: liHeaders(creds.accessToken) });
  return parseLinkedInLeadResponses(await readJson("linkedin", res));
}

// ---------------------------------------------------------------------------
// Reddit Ads — reports (spend in micro-currency: 1 USD = 1,000,000)
// ---------------------------------------------------------------------------

export function parseRedditReport(payload: any): DailySpendRow[] {
  const metrics: any[] = Array.isArray(payload?.data?.metrics) ? payload.data.metrics : Array.isArray(payload?.data) ? payload.data : [];
  return metrics.map((m) => ({
    externalCampaignId: String(m.campaign_id ?? ""),
    date: String(m.date ?? "").slice(0, 10),
    spendUsd: Math.round(toNum(m.spend) / 1_000_000 * 100) / 100,
    impressions: Math.round(toNum(m.impressions)),
    clicks: Math.round(toNum(m.clicks)),
    signups: Math.round(toNum(m.conversion_signup_total ?? m.conversion_lead_total ?? 0)),
  })).filter((r) => r.externalCampaignId && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export async function fetchRedditDailySpend(creds: PlatformCredentials, from: string, to: string, fetchImpl: FetchFn = fetch): Promise<DailySpendRow[]> {
  const account = assertAccountId("reddit", creds.accountId);
  const res = await fetchImpl(`${REDDIT_ADS_BASE}/ad_accounts/${account}/reports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        breakdowns: ["campaign_id", "date"],
        fields: ["spend", "impressions", "clicks", "conversion_signup_total"],
        starts_at: `${from}T00:00:00Z`,
        ends_at: `${to}T23:59:59Z`,
        time_zone_id: "UTC",
      },
    }),
  });
  return parseRedditReport(await readJson("reddit", res));
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export const SPEND_SYNC_PLATFORMS: ReadonlySet<AdPlatformName> = new Set(["meta", "linkedin", "reddit"]);
export const LEAD_POLL_PLATFORMS: ReadonlySet<AdPlatformName> = new Set(["linkedin"]);

export async function fetchDailySpend(platform: AdPlatformName, creds: PlatformCredentials, from: string, to: string, fetchImpl: FetchFn = fetch): Promise<DailySpendRow[]> {
  switch (platform) {
    case "meta": return fetchMetaDailySpend(creds, from, to, fetchImpl);
    case "linkedin": return fetchLinkedInDailySpend(creds, from, to, fetchImpl);
    case "reddit": return fetchRedditDailySpend(creds, from, to, fetchImpl);
    default: throw new AdPlatformError(platform, "Spend sync is not supported for this platform");
  }
}

export async function fetchLeads(platform: AdPlatformName, creds: PlatformCredentials, sinceMs: number, untilMs: number, fetchImpl: FetchFn = fetch): Promise<PlatformLead[]> {
  switch (platform) {
    case "linkedin": return fetchLinkedInLeads(creds, sinceMs, untilMs, fetchImpl);
    default: throw new AdPlatformError(platform, "Lead polling is not supported for this platform");
  }
}
