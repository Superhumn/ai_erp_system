/**
 * Meeting -> task extraction pipeline.
 *
 * Fireflies has already done the hard part: it pulls "action items" out of
 * meeting transcripts. Most of those items ARE actionable — but not all are
 * worth surfacing as project_tasks (e.g. "John will think about pricing"
 * or "Discussed roadmap"). This extractor:
 *
 *   1. Pre-filters obviously-weak items (passive verbs, sub-12 chars, "FYI…")
 *   2. Computes a deterministic importance score from signals already in the
 *      action item (assignee email, due date, urgency phrases, $ amounts)
 *   3. Falls back to the LLM ONLY when the deterministic score is borderline,
 *      so we don't burn tokens on items Fireflies already gave us strong
 *      signals for in either direction.
 *   4. Resolves the assignee to a user_id via the meeting's participants.
 *   5. Dedupes per (firefliesMeetingId, action item index) so re-running the
 *      Fireflies sync is idempotent.
 *   6. Persists via createProjectTaskFromSource so meetings + emails share
 *      the same Projects card UI, source badge, and AI-reasoning panel.
 */

import * as db from "./db";
import { getProjectTaskBySourceExternalId } from "./db/projects";
import { createProjectTaskFromSource } from "./taskAgentBridge";
import type { FirefliesActionItem } from "./_core/fireflies";

export type MeetingExtractionConfig = {
  importanceThreshold: number;
  confidenceThreshold: number;
  minTextLength: number;
  llmFallbackLow: number;
  llmFallbackHigh: number;
};

// Fireflies already filters its summary down to action items, so we don't
// run a second importance/confidence gate over what it returns. preFilter
// still drops genuinely empty / FYI / passive lines. The deterministic
// scorer is kept so we can set task priority from it.
export const DEFAULT_MEETING_CONFIG: MeetingExtractionConfig = {
  importanceThreshold: 0,
  confidenceThreshold: 0,
  minTextLength: 8,
  llmFallbackLow: 0,
  llmFallbackHigh: 100,
};

export type MeetingContext = {
  meetingId: number;
  firefliesId: string;
  title: string;
  date?: Date;
  participants: Array<{ name?: string; email?: string }>;
};

export type MeetingExtractionOutcome =
  | { kind: "skipped"; reason: string }
  | { kind: "rejected"; reason: string; importance: number; confidence: number }
  | { kind: "deduped"; existingTaskId: number }
  | { kind: "created"; taskId: number; importance: number; confidence: number; signals: string[] };

// ---------- Pre-filter ----------

const PASSIVE_PREFIXES = /^(?:discussed|talked about|reviewed|went over|covered|chatted about|mentioned)\b/i;
const FYI_PHRASES = /\b(?:fyi|just so you know|nothing to do|no action (?:required|needed))\b/i;

function preFilter(item: FirefliesActionItem, cfg: MeetingExtractionConfig): { skip: boolean; reason?: string } {
  const text = (item.text ?? "").trim();
  if (text.length < cfg.minTextLength) return { skip: true, reason: "text too short" };
  if (PASSIVE_PREFIXES.test(text)) return { skip: true, reason: "passive verb (not an actionable ask)" };
  if (FYI_PHRASES.test(text)) return { skip: true, reason: "FYI / no action required" };
  return { skip: false };
}

// ---------- Deterministic scoring ----------

const URGENT_PHRASES = [
  /\burgent(ly)?\b/i, /\basap\b/i, /\btoday\b/i, /\btomorrow\b/i,
  /\beod\b/i, /\bcob\b/i, /\bend of (day|week)\b/i,
  /\bby\s+(mon|tues?|wed|thur?s?|fri|sat|sun)\w*\b/i,
  /\bblocker\b/i, /\bcritical\b/i,
];

const REQUEST_VERBS = [
  /\b(send|share|review|approve|confirm|provide|sign|pay|schedule|book|file|submit|deliver|prepare|draft|finalize)\b/i,
  /\bfollow[- ]?up\b/i,
];

const DOLLAR_AMOUNT_RE = /\$\s?\d{1,3}(,\d{3})+(\.\d+)?|\$\s?\d+(\.\d+)?\s?(k|m|thousand|million|mm)\b/i;

export function deterministicScore(item: FirefliesActionItem, ctx: MeetingContext): { importance: number; signals: string[] } {
  const text = item.text ?? "";
  let score = 30; // base — Fireflies already deemed this an action item
  const signals: string[] = [];

  if (item.dueDate) { score += 15; signals.push("has-due-date"); }

  // Assignee resolved to a participant email is a strong signal someone owns it
  if (item.assignee && resolveAssigneeEmailFromName(item.assignee, ctx)) {
    score += 20; signals.push("assignee-resolved");
  } else if (item.assignee) {
    score += 5; signals.push("assignee-named");
  }

  if (URGENT_PHRASES.some(re => re.test(text))) { score += 15; signals.push("urgency-phrase"); }
  if (REQUEST_VERBS.some(re => re.test(text))) { score += 10; signals.push("request-verb"); }
  if (DOLLAR_AMOUNT_RE.test(text)) { score += 8; signals.push("dollar-amount"); }

  return { importance: Math.min(100, score), signals };
}

function resolveAssigneeEmailFromName(name: string, ctx: MeetingContext): string | null {
  const norm = name.toLowerCase().trim();
  if (!norm) return null;
  for (const p of ctx.participants) {
    if (!p.email) continue;
    if (p.name?.toLowerCase().includes(norm) || norm.includes(p.name?.toLowerCase() ?? "__none__")) return p.email;
    // also match against email local-part
    const local = p.email.split("@")[0]?.toLowerCase() ?? "";
    if (local && norm.includes(local)) return p.email;
  }
  return null;
}


// ---------- Routing ----------

async function pickProject(): Promise<{ id: number; name: string } | null> {
  try {
    const projects = await db.getProjects();
    if (!Array.isArray(projects) || projects.length === 0) return null;
    const meetingProject = projects.find((p: any) => /meeting|action items|fireflies/i.test(`${p.name ?? ""} ${p.description ?? ""}`));
    if (meetingProject) return { id: meetingProject.id, name: meetingProject.name };
    const active = projects.find((p: any) => p.status === "active") ?? projects[0];
    return active ? { id: active.id, name: active.name } : null;
  } catch {
    return null;
  }
}

async function resolveAssigneeUserId(item: FirefliesActionItem, ctx: MeetingContext): Promise<number | undefined> {
  if (!item.assignee) return undefined;
  const email = resolveAssigneeEmailFromName(item.assignee, ctx);
  if (!email) return undefined;
  try {
    const user = await db.getUserByEmail?.(email);
    return user?.id;
  } catch {
    return undefined;
  }
}

// ---------- Orchestrator ----------

export async function extractActionItemToTask(
  item: FirefliesActionItem,
  ctx: MeetingContext,
  index: number,
  opts: {
    config?: Partial<MeetingExtractionConfig>;
    forceCreate?: boolean;
    preferredProjectId?: number;
    preferredAssigneeId?: number;
    /** Stable index used for externalId so dedup survives re-processing with
     * different selections. Falls back to the loop index. */
    stableIndex?: number;
  } = {},
): Promise<MeetingExtractionOutcome> {
  const cfg: MeetingExtractionConfig = { ...DEFAULT_MEETING_CONFIG, ...(opts.config ?? {}) };

  // When the user explicitly invokes Process Meeting we still drop empty /
  // FYI text, but skip the importance/confidence gates entirely.
  const pre = preFilter(item, cfg);
  if (pre.skip && !opts.forceCreate) {
    await logExtraction(ctx, index, item, { stage: "pre_filter", reason: pre.reason }).catch(() => {});
    return { kind: "skipped", reason: pre.reason ?? "pre-filter" };
  }
  if (pre.skip && opts.forceCreate && (item.text ?? "").trim().length < 3) {
    return { kind: "skipped", reason: "empty text" };
  }

  const externalId = `${ctx.firefliesId}#${(opts.stableIndex ?? index) + 1}`;
  const existing = await getProjectTaskBySourceExternalId("meeting", externalId).catch(() => undefined);
  if (existing) return { kind: "deduped", existingTaskId: existing.id };

  // Deterministic score is used to assign priority on the created task —
  // not to gate creation. Fireflies has already filtered for actionability.
  const det = deterministicScore(item, ctx);
  const importance = det.importance;
  const confidence = importance >= 60 ? 90 : 70;
  const cleanedName = item.text.trim();
  const reasoning = `signals: ${det.signals.join(", ") || "none"}`;

  let project: { id: number; name: string } | null = null;
  if (opts.preferredProjectId) {
    project = { id: opts.preferredProjectId, name: "" };
  } else {
    project = await pickProject();
  }
  if (!project) {
    await logExtraction(ctx, index, item, { stage: "rejected_no_project", importance, confidence }).catch(() => {});
    return { kind: "rejected", reason: "no_project_route", importance, confidence };
  }

  const assigneeId = opts.preferredAssigneeId ?? (await resolveAssigneeUserId(item, ctx));
  const dueDate = parseDueHint(item.dueDate, ctx.date);

  const created = await createProjectTaskFromSource({
    projectId: project.id,
    name: cleanedName,
    description: `From Fireflies meeting: ${ctx.title}${item.assignee ? `\nAssigned to: ${item.assignee}` : ""}`,
    assigneeId,
    sourceType: "meeting",
    sourceRefType: "firefliesMeeting",
    sourceRefId: ctx.meetingId,
    sourceExternalId: externalId,
    priority: pickPriority(importance),
    dueDate,
    aiReasoning: `${reasoning} [importance=${importance}, confidence=${confidence}${opts.forceCreate ? ", forced" : ""}]`,
    aiConfidence: confidence,
  });

  await logExtraction(ctx, index, item, { stage: "created", importance, confidence, taskId: created.id, signals: det.signals }).catch(() => {});

  return { kind: "created", taskId: created.id, importance, confidence, signals: det.signals };
}

function pickPriority(importance: number): "low" | "medium" | "high" | "critical" {
  if (importance >= 90) return "critical";
  if (importance >= 75) return "high";
  if (importance >= 50) return "medium";
  return "low";
}

function parseDueHint(hint: string | undefined, meetingDate: Date | undefined): Date | undefined {
  if (!hint) return undefined;
  const direct = new Date(hint);
  if (!Number.isNaN(direct.getTime())) return direct;
  // Relative: "by Friday", "next week", "EOD" — leave to user; just return undefined.
  // (We could parse with chrono-node but adding a dep isn't worth it for a free-text hint.)
  void meetingDate;
  return undefined;
}

async function logExtraction(ctx: MeetingContext, index: number, item: FirefliesActionItem, payload: Record<string, unknown>): Promise<void> {
  await db.createAiAgentLog?.({
    action: "meeting_extraction",
    status: "info",
    message: `Meeting ${ctx.firefliesId} action #${index + 1}: ${String(payload.stage)}`,
    details: JSON.stringify({ firefliesId: ctx.firefliesId, meetingId: ctx.meetingId, index, text: item.text, ...payload }),
  } as any);
}

/**
 * Bulk entry point — runs extractActionItemToTask over every action item in a
 * meeting. Returns a per-item outcome list so the caller can update meeting
 * processing status.
 */
export async function extractMeetingActionItems(
  items: FirefliesActionItem[],
  ctx: MeetingContext,
  opts: {
    forceCreate?: boolean;
    preferredProjectId?: number;
    preferredAssigneeId?: number;
    /** Optional stable indices parallel to `items`. Used to keep externalIds
     * (and therefore dedup) consistent when the caller has filtered the
     * full action-item list down to a user-selected subset. */
    stableIndices?: number[];
  } = {},
): Promise<MeetingExtractionOutcome[]> {
  const outcomes: MeetingExtractionOutcome[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      outcomes.push(
        await extractActionItemToTask(items[i], ctx, i, {
          ...opts,
          stableIndex: opts.stableIndices?.[i],
        }),
      );
    } catch (err: any) {
      outcomes.push({ kind: "skipped", reason: `error: ${err?.message ?? "unknown"}` });
    }
  }
  return outcomes;
}
