// ============================================================================
// Planner — shared types for the universal NL quick-add, the auto-scheduler,
// and the unified Today planner. Imported by both client and server.
// ============================================================================

// ---- Universal NL quick-add -------------------------------------------------

// A single natural-language line resolves to exactly one of these kinds.
export type QuickAddKind = "task" | "event" | "reminder" | "note";

export type QuickAddPriority = "low" | "medium" | "high" | "critical";

export interface QuickAddIntent {
  kind: QuickAddKind;
  title: string;
  description?: string | null;
  /** Wall-clock ISO (no offset), interpreted in the planner timezone. Start for events, due for tasks/reminders. */
  datetime?: string | null;
  /** Wall-clock ISO end for events. */
  endDatetime?: string | null;
  /** Duration in minutes (events, or tasks you want time-blocked). */
  durationMinutes?: number | null;
  /** All-day event / date-only task. */
  allDay?: boolean;
  priority?: QuickAddPriority | null;
  location?: string | null;
  attendees?: string[];
  /** Human-readable recurrence hint (informational, e.g. "every Monday"). */
  recurrence?: string | null;
}

// JSON schema handed to the LLM so it returns a validated QuickAddIntent.
export const QUICK_ADD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title"],
  properties: {
    kind: { type: "string", enum: ["task", "event", "reminder", "note"] },
    title: { type: "string" },
    description: { type: ["string", "null"] },
    datetime: { type: ["string", "null"], description: "Wall-clock ISO 8601 with no timezone offset, e.g. 2026-07-31T14:00:00" },
    endDatetime: { type: ["string", "null"] },
    durationMinutes: { type: ["number", "null"] },
    allDay: { type: "boolean" },
    priority: { type: ["string", "null"], enum: ["low", "medium", "high", "critical", null] },
    location: { type: ["string", "null"] },
    attendees: { type: "array", items: { type: "string" } },
    recurrence: { type: ["string", "null"] },
  },
} as const;

// What committing an intent actually created.
export interface QuickAddResult {
  kind: QuickAddKind;
  title: string;
  /** Human-readable summary of what was created / where. */
  detail: string;
  /** True when an event was requested but Google Calendar wasn't connected and we fell back to a task. */
  fellBackToTask?: boolean;
}

// ---- Auto-scheduler ---------------------------------------------------------

export interface TimeInterval {
  /** epoch ms */
  start: number;
  /** epoch ms */
  end: number;
}

export interface ScheduleSlot {
  startIso: string; // absolute ISO (with offset)
  endIso: string;
  startMs: number;
  endMs: number;
  label: string; // e.g. "Thu, Jul 31 · 2:00–2:30 PM"
}

export interface WorkingHours {
  /** Days of week that count as working days (0=Sun … 6=Sat). */
  days: number[];
  startHour: number; // 0-23, local to tz
  endHour: number;   // 0-23, local to tz
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
};

export const DEFAULT_PLANNER_TIMEZONE = "America/New_York";

// ---- Today planner ----------------------------------------------------------

// A unified item on the day timeline — either a calendar event or a task.
export interface PlannerItem {
  id: string;
  source: "calendar" | "task";
  title: string;
  /** absolute ISO, present when the item has a specific time. */
  startIso?: string | null;
  endIso?: string | null;
  allDay?: boolean;
  status?: string | null;
  priority?: QuickAddPriority | null;
  location?: string | null;
  /** For tasks: the underlying task id (number as string). */
  refId?: string;
}
