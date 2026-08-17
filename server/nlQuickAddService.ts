// ============================================================================
// Universal natural-language quick-add. One free-text line is classified by the
// LLM into a task / event / reminder / note with a resolved date/time, so the
// planner can create the right record without domain-specific parsing.
// ============================================================================

import { invokeLLM } from "./_core/llm";
import { QUICK_ADD_JSON_SCHEMA, type QuickAddIntent } from "@shared/planner";

const SYSTEM_PROMPT = `You convert a single natural-language line into ONE structured item for a personal planner.

Today is {today} (timezone {tz}). Resolve all relative dates/times ("tomorrow", "next Monday", "in 2 hours", "Friday at 3pm") against that.

Classify "kind" as exactly one of:
- "event": something happening at a specific time, usually with other people or a place (meetings, calls, appointments, lunches). Set datetime (start) and either endDatetime or durationMinutes (default 30 if unknown). Include location/attendees if mentioned.
- "task": a to-do or action item. Set datetime = due date/time if one is implied, else null. Set priority if urgency is expressed ("urgent" -> high/critical).
- "reminder": a time-based nudge to remember something ("remind me to ...", "don't forget ..."). Always set datetime.
- "note": pure information to capture with no action and no time ("idea: ...", "note that ...").

Rules:
- datetime/endDatetime MUST be wall-clock ISO 8601 with NO timezone offset, e.g. 2026-07-31T14:00:00. Never include a "Z" or "+00:00".
- If only a date is given (no time) for a task/reminder, use 09:00 as the time and keep it, or set allDay=true for an all-day event.
- title is a short, clean summary WITHOUT the date words.
- Prefer "task" when ambiguous between task and note; prefer "event" only when a specific time + meeting/appointment nature is clear.
- attendees are bare names or emails as written.`;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Quick-add LLM did not return JSON");
    return JSON.parse(match[0]);
  }
}

const VALID_KINDS = new Set(["task", "event", "reminder", "note"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

/** Parse a free-text line into a normalized QuickAddIntent. */
export async function parseQuickAdd(
  text: string,
  nowIso: string,
  tz: string,
): Promise<QuickAddIntent> {
  const system = SYSTEM_PROMPT.replace("{today}", nowIso).replace("{tz}", tz);
  const response = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    maxTokens: 512,
    outputSchema: {
      name: "quick_add_intent",
      schema: QUICK_ADD_JSON_SCHEMA as unknown as Record<string, unknown>,
      strict: true,
    },
  });
  const raw = response.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? raw : "";
  if (!content.trim()) {
    // Degrade gracefully to a plain task.
    return { kind: "task", title: text.trim().slice(0, 255) };
  }
  const parsed = extractJson(content) as Partial<QuickAddIntent>;
  return normalizeIntent(parsed, text);
}

/** Defensive normalization so downstream creation never sees a bad shape. */
export function normalizeIntent(parsed: Partial<QuickAddIntent>, originalText: string): QuickAddIntent {
  const kind = VALID_KINDS.has(parsed?.kind as string) ? (parsed!.kind as QuickAddIntent["kind"]) : "task";
  const title = (parsed?.title && String(parsed.title).trim()) || originalText.trim().slice(0, 255) || "Untitled";

  const intent: QuickAddIntent = { kind, title };
  if (parsed?.description) intent.description = String(parsed.description);
  if (parsed?.datetime) intent.datetime = String(parsed.datetime);
  if (parsed?.endDatetime) intent.endDatetime = String(parsed.endDatetime);
  if (typeof parsed?.durationMinutes === "number" && parsed.durationMinutes > 0) {
    intent.durationMinutes = Math.min(parsed.durationMinutes, 24 * 60);
  }
  if (parsed?.allDay) intent.allDay = true;
  if (parsed?.priority && VALID_PRIORITIES.has(parsed.priority as string)) {
    intent.priority = parsed.priority as QuickAddIntent["priority"];
  }
  if (parsed?.location) intent.location = String(parsed.location);
  if (Array.isArray(parsed?.attendees)) {
    intent.attendees = parsed.attendees.map((a) => String(a)).filter(Boolean).slice(0, 25);
  }
  if (parsed?.recurrence) intent.recurrence = String(parsed.recurrence);

  // Events need an end; default to 30 min after start when only start is known.
  if (intent.kind === "event" && intent.datetime && !intent.endDatetime && !intent.durationMinutes) {
    intent.durationMinutes = 30;
  }
  return intent;
}
