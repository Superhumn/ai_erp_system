// ============================================================================
// B2B Rocket integration
// ----------------------------------------------------------------------------
// B2B Rocket has no usable public REST API — its only supported outbound hook
// is the Zapier "New Lead" trigger. So we receive leads as a webhook: Zapier's
// "Webhooks by Zapier" action POSTs each new lead to /webhooks/b2brocket/leads.
//
// This module owns the work once a payload arrives:
//   1. extractLeadFields()  — normalize Zapier's free-form field mapping
//   2. scoreLead()          — AI scores the lead + picks a pipeline stage
//   3. ingestB2BRocketLead() — orchestrate + upsert into crmContacts (dedup'd)
//
// The Express route in _core/index.ts stays thin and just calls ingest.
// ============================================================================

import { invokeLLM } from "./llm";
import * as db from "../db";

/** Raw Zapier payload — shape depends entirely on the user's field mapping. */
export type B2BRocketLeadPayload = Record<string, unknown>;

export interface NormalizedLead {
  email?: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  organization?: string;
  jobTitle?: string;
  phone?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
}

type PipelineStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export interface LeadScore {
  score: number; // 0-100
  pipelineStage: PipelineStage;
  summary: string;
}

// Pull the first non-empty string value across a list of candidate keys.
// Zapier field names vary by how the user maps them (email / Email / lead_email
// / "Lead Email"), so we check a generous set of aliases case-insensitively.
function pick(payload: B2BRocketLeadPayload, keys: string[]): string | undefined {
  const lowerMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(payload)) {
    lowerMap.set(k.toLowerCase().replace(/[\s_-]+/g, ""), v);
  }
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[\s_-]+/g, "");
    const v = lowerMap.get(norm);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/**
 * Normalize a Zapier/B2B Rocket payload into crmContacts-shaped fields.
 * Tolerant of missing names — falls back so the NOT NULL firstName/fullName
 * columns are always satisfied.
 */
export function extractLeadFields(payload: B2BRocketLeadPayload): NormalizedLead {
  const email = pick(payload, ["email", "emailAddress", "leadEmail", "workEmail", "contactEmail"]);
  let firstName = pick(payload, ["firstName", "first", "givenName", "fname"]);
  let lastName = pick(payload, ["lastName", "last", "familyName", "surname", "lname"]);
  const fullNameRaw = pick(payload, ["fullName", "name", "contactName", "leadName"]);

  // Derive first/last from a single full-name field when needed.
  if ((!firstName || !lastName) && fullNameRaw) {
    const parts = fullNameRaw.split(/\s+/).filter(Boolean);
    if (!firstName && parts.length) firstName = parts[0];
    if (!lastName && parts.length > 1) lastName = parts.slice(1).join(" ");
  }
  // Last-resort first name so the NOT NULL column is always satisfied.
  if (!firstName) firstName = email ? email.split("@")[0] : "Lead";

  const fullName =
    fullNameRaw || [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;

  return {
    email,
    firstName,
    lastName,
    fullName,
    organization: pick(payload, ["organization", "company", "companyName", "account", "businessName"]),
    jobTitle: pick(payload, ["jobTitle", "title", "position", "role"]),
    phone: pick(payload, ["phone", "phoneNumber", "mobile", "telephone"]),
    linkedinUrl: pick(payload, ["linkedinUrl", "linkedin", "linkedInProfile", "liUrl"]),
    city: pick(payload, ["city", "town"]),
    state: pick(payload, ["state", "region", "province"]),
    country: pick(payload, ["country"]),
  };
}

const FALLBACK_SCORE: LeadScore = {
  score: 0,
  pipelineStage: "new",
  summary: "AI scoring unavailable; queued for manual review.",
};

/**
 * Ask the LLM to score the lead 0-100 and assign a starting pipeline stage.
 * Never throws — on any LLM error we fall back to an unscored "new" lead so a
 * scoring outage can't drop an incoming lead on the floor.
 */
export async function scoreLead(
  lead: NormalizedLead,
  rawPayload: B2BRocketLeadPayload,
): Promise<LeadScore> {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a B2B sales development expert scoring inbound cold-outreach " +
            "leads sourced by B2B Rocket. Judge fit and buying intent from the data " +
            "available (title/seniority, company, contactability). Return a score " +
            "0-100 (0 = junk/no email, 100 = ideal decision-maker), a starting " +
            "pipeline stage, and a one-sentence summary a rep can read at a glance.",
        },
        {
          role: "user",
          content:
            `Normalized lead:\n${JSON.stringify(lead, null, 2)}\n\n` +
            `Raw payload:\n${JSON.stringify(rawPayload, null, 2)}`,
        },
      ],
      outputSchema: {
        name: "LeadScore",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 100 },
            pipelineStage: {
              type: "string",
              enum: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
            },
            summary: { type: "string" },
          },
          required: ["score", "pipelineStage", "summary"],
        },
        strict: true,
      },
    });

    const raw = result.choices[0]?.message?.content;
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const parsed = JSON.parse(text) as Partial<LeadScore>;

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score ?? 0))));
    const stage = (parsed.pipelineStage ?? "new") as PipelineStage;
    return {
      score,
      pipelineStage: stage,
      summary: parsed.summary?.trim() || FALLBACK_SCORE.summary,
    };
  } catch (err) {
    console.error("[B2B Rocket] Lead scoring failed:", err);
    return FALLBACK_SCORE;
  }
}

export interface IngestResult {
  contactId: number;
  created: boolean;
  score: number;
  pipelineStage: PipelineStage;
}

/**
 * Full intake pipeline for one B2B Rocket lead: normalize → AI score → upsert
 * into crmContacts (dedup'd by email/phone/linkedin via findOrCreateCrmContact).
 * The raw payload is preserved in captureData for auditing.
 */
export async function ingestB2BRocketLead(
  payload: B2BRocketLeadPayload,
): Promise<IngestResult> {
  const lead = extractLeadFields(payload);
  const scored = await scoreLead(lead, payload);

  const { id, created } = await db.findOrCreateCrmContact({
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    linkedinUrl: lead.linkedinUrl,
    organization: lead.organization,
    jobTitle: lead.jobTitle,
    city: lead.city,
    state: lead.state,
    country: lead.country,
    contactType: "lead",
    source: "b2brocket",
    pipelineStage: scored.pipelineStage,
    leadScore: scored.score,
    notes: scored.summary,
    captureData: JSON.stringify(payload),
  });

  return { contactId: id, created, score: scored.score, pipelineStage: scored.pipelineStage };
}
