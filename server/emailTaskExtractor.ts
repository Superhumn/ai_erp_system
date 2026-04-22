/**
 * Email -> task extraction pipeline.
 *
 * Multi-stage so the expensive LLM call only runs on plausibly-actionable
 * emails, and so low-importance chatter never lands on the Kanban.
 *
 * Stages:
 *   1. Pre-filter  (deterministic, free) — drops auto-replies, bounces,
 *      marketing, too-short bodies, self-thread replies.
 *   2. LLM classify — one call per surviving thread, returns structured JSON
 *      with is_actionable / importance / confidence / category / tasks.
 *   3. Signal boost (deterministic) — bumps importance when we see urgency
 *      phrases, request verbs, dollar amounts, or a known customer/deal.
 *   4. Threshold  — only create tasks above IMPORTANCE + CONFIDENCE cutoffs.
 *   5. Dedupe  — skip if a task already exists for this messageId.
 *   6. Persist  — createProjectTaskFromSource + log reasoning for tuning.
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { getProjectTaskBySourceExternalId } from "./db/projects";
import { createProjectTaskFromSource } from "./taskAgentBridge";

export type ExtractedTaskCandidate = {
  name: string;
  description?: string;
  suggestedPriority: "low" | "medium" | "high" | "critical";
  dueHint?: string;
};

export type ExtractionCategory =
  | "sales" | "vendor" | "support" | "internal"
  | "financial" | "legal" | "operations" | "other";

export type ExtractionResult = {
  isActionable: boolean;
  importance: number;
  confidence: number;
  category: ExtractionCategory;
  tasks: ExtractedTaskCandidate[];
  reasoning: string;
  signals: string[];
  skipReason?: string;
};

export type ExtractionConfig = {
  importanceThreshold: number;
  confidenceThreshold: number;
  autoPublishImportance: number;
  autoPublishConfidence: number;
  minBodyLength: number;
  maxBodyChars: number;
};

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  importanceThreshold: 60,
  confidenceThreshold: 65,
  autoPublishImportance: 85,
  autoPublishConfidence: 85,
  minBodyLength: 40,
  maxBodyChars: 3000,
};

type EmailLike = {
  messageId: string;
  from: { address: string; name?: string };
  subject: string;
  bodyText: string;
  date?: Date;
};

// ---------- Stage 1: pre-filter ----------

const AUTO_SENDER_RE = /(?:auto-?reply|no-?reply|noreply|bounces?|mailer-daemon|postmaster|donotreply|do-not-reply)/i;
const MARKETING_BODY_RE = /unsubscribe|you received this (email|message) because|email preferences|manage your (subscription|preferences)|view this email in your browser|©\s*\d{4}.*?(rights reserved|newsletter)/i;

export function preFilter(email: EmailLike, cfg: ExtractionConfig = DEFAULT_EXTRACTION_CONFIG): { skip: boolean; reason?: string } {
  const addr = email.from?.address ?? "";
  if (AUTO_SENDER_RE.test(addr)) return { skip: true, reason: "auto/no-reply sender" };

  const body = (email.bodyText ?? "").trim();
  if (body.length < cfg.minBodyLength) return { skip: true, reason: "body too short" };
  if (MARKETING_BODY_RE.test(body)) return { skip: true, reason: "marketing/list email" };

  return { skip: false };
}

// ---------- Stage 3: signal boost ----------

const URGENT_PHRASES = [
  /\burgent(ly)?\b/i,
  /\basap\b/i,
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\beod\b/i,
  /\bcob\b/i,
  /\bend of (day|week)\b/i,
  /\bby\s+(mon|tues?|wed|thur?s?|fri|sat|sun)\w*\b/i,
  /\bby\s+\d{1,2}(st|nd|rd|th)?\b/i,
  /\bblocker\b/i,
  /\bproduction\s+(down|issue|outage)\b/i,
  /\bcritical\b/i,
];

const REQUEST_VERBS = [
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bwould you\b/i,
  /\bplease\s+(send|share|review|approve|confirm|provide|sign|pay|schedule)\b/i,
  /\bneed (you )?to\b/i,
  /\bwaiting on\b/i,
  /\bfollow[- ]?up\b/i,
  /\bawaiting\b/i,
];

const DOLLAR_AMOUNT_RE = /\$\s?\d{1,3}(,\d{3})+(\.\d+)?|\$\s?\d+(\.\d+)?\s?(k|m|thousand|million|mm)\b/i;

export type BoostInput = {
  email: EmailLike;
  knownCustomer?: { id: number; name?: string } | null;
  hasOpenDeal?: boolean;
};

export function computeSignalBoost(input: BoostInput): { boost: number; signals: string[] } {
  const body = `${input.email.subject} ${input.email.bodyText ?? ""}`;
  let boost = 0;
  const signals: string[] = [];

  if (URGENT_PHRASES.some(re => re.test(body))) { boost += 15; signals.push("urgency-phrase"); }
  if (REQUEST_VERBS.some(re => re.test(body))) { boost += 10; signals.push("explicit-request"); }
  if (DOLLAR_AMOUNT_RE.test(body)) { boost += 8; signals.push("dollar-amount"); }
  if (input.knownCustomer) { boost += 10; signals.push("known-customer"); }
  if (input.hasOpenDeal) { boost += 12; signals.push("open-deal"); }

  return { boost: Math.min(boost, 40), signals };
}

// ---------- Stage 2: LLM classify ----------

const CLASSIFY_SYSTEM_PROMPT = `You triage inbound business emails for an ERP. Your job is to decide
whether the email requires human follow-up (a "task") and, if so, what that
task is.

Be strict. Most emails are NOT tasks. Skip:
- social acknowledgements ("thanks!", "got it", "sounds good")
- FYI / informational updates with no ask
- auto-generated notifications already handled elsewhere
- newsletters / digests / summaries
- meeting invites (handled separately)

Mark as actionable only when there is a concrete ask, deliverable, decision,
or commitment the recipient owes back. One email can produce multiple tasks,
but keep each task narrow and actionable (imperative voice, one verb).

Return JSON only, matching the schema.`;

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    is_actionable: { type: "boolean" },
    importance: { type: "integer", minimum: 0, maximum: 100, description: "business importance 0-100" },
    confidence: { type: "integer", minimum: 0, maximum: 100, description: "your confidence in the assessment" },
    category: { type: "string", enum: ["sales", "vendor", "support", "internal", "financial", "legal", "operations", "other"] },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "imperative short task title (<80 chars)" },
          description: { type: "string" },
          suggested_priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          due_hint: { type: "string", description: "natural language due hint if email implies one, else empty" },
        },
        required: ["name", "suggested_priority"],
        additionalProperties: false,
      },
    },
    reasoning: { type: "string", description: "one-sentence why" },
  },
  required: ["is_actionable", "importance", "confidence", "category", "tasks", "reasoning"],
  additionalProperties: false,
};

export async function classifyEmail(email: EmailLike, cfg: ExtractionConfig = DEFAULT_EXTRACTION_CONFIG): Promise<Omit<ExtractionResult, "signals">> {
  const body = (email.bodyText ?? "").slice(0, cfg.maxBodyChars);
  const userContent = `From: ${email.from.name ?? ""} <${email.from.address}>
Subject: ${email.subject}
${email.date ? `Date: ${email.date.toISOString()}` : ""}

${body}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "email_task_extraction", strict: true, schema: CLASSIFY_SCHEMA },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw.replace(/```json\n?|\n?```/g, "").trim() : "{}";
  const parsed = JSON.parse(text);

  return {
    isActionable: Boolean(parsed.is_actionable),
    importance: clamp(parsed.importance ?? 0, 0, 100),
    confidence: clamp(parsed.confidence ?? 0, 0, 100),
    category: (parsed.category ?? "other") as ExtractionCategory,
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map((t: any) => ({
      name: String(t.name ?? "").slice(0, 255),
      description: t.description ? String(t.description) : undefined,
      suggestedPriority: normalizePriority(t.suggested_priority),
      dueHint: t.due_hint ? String(t.due_hint) : undefined,
    })) : [],
    reasoning: String(parsed.reasoning ?? ""),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function normalizePriority(p: any): "low" | "medium" | "high" | "critical" {
  const s = String(p ?? "").toLowerCase();
  if (s === "critical" || s === "urgent") return "critical";
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

// ---------- Category -> project routing ----------

async function routeToProject(category: ExtractionCategory): Promise<{ id: number; name: string } | null> {
  try {
    const projects = await db.getProjects();
    if (!Array.isArray(projects) || projects.length === 0) return null;

    // Prefer a project whose name/description mentions the category.
    const catLower = category.toLowerCase();
    const matched = projects.find((p: any) => {
      const hay = `${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
      return hay.includes(catLower);
    });
    if (matched) return { id: matched.id, name: matched.name };

    // Fall back to the first active project so tasks aren't dropped silently.
    const active = projects.find((p: any) => p.status === "active") ?? projects[0];
    return active ? { id: active.id, name: active.name } : null;
  } catch {
    return null;
  }
}

// ---------- Orchestrator ----------

export type ExtractionOutcome =
  | { kind: "skipped"; reason: string }
  | { kind: "rejected"; result: ExtractionResult; reason: string }
  | { kind: "deduped"; existingTaskId: number }
  | { kind: "created"; result: ExtractionResult; taskIds: number[]; projectId: number; autoPublished: boolean };

export async function extractAndCreateTasks(
  email: EmailLike,
  opts: { config?: ExtractionConfig } = {},
): Promise<ExtractionOutcome> {
  const cfg = { ...DEFAULT_EXTRACTION_CONFIG, ...(opts.config ?? {}) };

  // 1. Pre-filter
  const pre = preFilter(email, cfg);
  if (pre.skip) {
    await logExtraction(email, { stage: "pre_filter", reason: pre.reason }).catch(() => {});
    return { kind: "skipped", reason: pre.reason ?? "pre-filter" };
  }

  // Dedup early: if we already processed this messageId, bail before spending LLM tokens.
  if (email.messageId) {
    const existing = await getProjectTaskBySourceExternalId("email", email.messageId).catch(() => undefined);
    if (existing) return { kind: "deduped", existingTaskId: existing.id };
  }

  // Resolve sender to a customer (for CRM linkage + boost)
  const customer = await resolveCustomer(email.from.address);

  // 2. LLM classify
  let classified: Omit<ExtractionResult, "signals">;
  try {
    classified = await classifyEmail(email, cfg);
  } catch (err: any) {
    await logExtraction(email, { stage: "llm_error", error: err?.message }).catch(() => {});
    return { kind: "skipped", reason: `llm_error: ${err?.message ?? "unknown"}` };
  }

  // 3. Signal boost
  const { boost, signals } = computeSignalBoost({ email, knownCustomer: customer });
  const boostedImportance = Math.min(100, classified.importance + boost);
  const result: ExtractionResult = { ...classified, importance: boostedImportance, signals };

  // 4. Threshold
  if (!result.isActionable) {
    await logExtraction(email, { stage: "rejected_not_actionable", result }).catch(() => {});
    return { kind: "rejected", result, reason: "not_actionable" };
  }
  if (result.importance < cfg.importanceThreshold) {
    await logExtraction(email, { stage: "rejected_importance", result }).catch(() => {});
    return { kind: "rejected", result, reason: `importance_below_threshold (${result.importance} < ${cfg.importanceThreshold})` };
  }
  if (result.confidence < cfg.confidenceThreshold) {
    await logExtraction(email, { stage: "rejected_confidence", result }).catch(() => {});
    return { kind: "rejected", result, reason: `confidence_below_threshold (${result.confidence} < ${cfg.confidenceThreshold})` };
  }
  if (result.tasks.length === 0) {
    await logExtraction(email, { stage: "rejected_no_tasks", result }).catch(() => {});
    return { kind: "rejected", result, reason: "no_task_candidates" };
  }

  // 5. Route
  const project = await routeToProject(result.category);
  if (!project) {
    await logExtraction(email, { stage: "rejected_no_project", result }).catch(() => {});
    return { kind: "rejected", result, reason: "no_project_route" };
  }

  // 6. Persist — one project_tasks row per candidate
  const autoPublished = result.importance >= cfg.autoPublishImportance && result.confidence >= cfg.autoPublishConfidence;
  const fromLine = email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address;
  const taskIds: number[] = [];

  for (const [idx, cand] of result.tasks.entries()) {
    // Per-candidate dedup by external id + candidate index
    const externalId = result.tasks.length === 1 ? email.messageId : `${email.messageId}#${idx + 1}`;
    if (externalId) {
      const existing = await getProjectTaskBySourceExternalId("email", externalId).catch(() => undefined);
      if (existing) { taskIds.push(existing.id); continue; }
    }

    const created = await createProjectTaskFromSource({
      projectId: project.id,
      name: cand.name,
      description: [cand.description, `— from ${fromLine}: ${email.subject}`].filter(Boolean).join("\n\n"),
      accountId: customer?.id,
      sourceType: "email",
      sourceRefType: "emailMessage",
      sourceExternalId: externalId,
      priority: cand.suggestedPriority,
      aiReasoning: `${result.reasoning} [importance=${result.importance}, confidence=${result.confidence}, signals=${signals.join(",") || "none"}]`,
      aiConfidence: result.confidence,
    });
    taskIds.push(created.id);
  }

  await logExtraction(email, { stage: "created", result, projectId: project.id, taskIds, autoPublished }).catch(() => {});

  return { kind: "created", result, taskIds, projectId: project.id, autoPublished };
}

async function resolveCustomer(emailAddress: string): Promise<{ id: number; name?: string } | null> {
  if (!emailAddress) return null;
  try {
    const c = await db.getCustomerByEmail?.(emailAddress);
    if (c?.id) return { id: c.id, name: c.name };
  } catch { /* ignore */ }
  return null;
}

async function logExtraction(email: EmailLike, payload: Record<string, unknown>): Promise<void> {
  await db.createAiAgentLog?.({
    action: "email_extraction",
    status: "info",
    message: `Email ${email.messageId || "(no id)"}: ${String(payload.stage)}`,
    details: JSON.stringify({ messageId: email.messageId, subject: email.subject, from: email.from.address, ...payload }),
  } as any);
}
