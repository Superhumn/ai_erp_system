// ============================================
// CONCIERGE ERRAND SERVICE
// ============================================
//
// "Duckbill-style" delegated errands: the user hands the toolbar AI a chore in
// plain language, the AI writes a step-by-step plan and (for anything non-trivial)
// parks it in the approval queue as an `aiAgentTasks` row of type
// `concierge_errand`. Once the plan is approved — either automatically for
// low-risk errands or by a human in the Approval Queue — the errand is executed
// here by replaying the approved plan through the main AI agent loop, which has
// full access to the ERP action tools.
//
// This module is the single execution path shared by:
//   - `aiAgent.tasks.execute` (manual admin execution in server/routers.ts)
//   - `executeApprovedTasks()` (background scheduler in server/aiAgentScheduler.ts)

import type { AiAgentTask } from "../drizzle/schema";
import { processAIAgentRequest, type AIAgentContext } from "./aiAgentService";

// Valid user roles (mirrors the `users.role` enum in drizzle/schema.ts). Used to
// clamp the role read from persisted errand data so a malformed task can't
// introduce an unexpected role string into the execution context.
const KNOWN_ROLES = new Set([
  "user", "admin", "finance", "ops", "legal", "exec",
  "sales", "copacker", "vendor", "contractor", "investor",
]);

export interface ConciergeErrandData {
  title: string;
  goal: string;
  steps: string[];
  riskLevel: "low" | "medium" | "high";
  submittedByUserId?: number;
  userName?: string;
  userRole?: string;
  companyId?: number;
}

export interface ErrandExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Execute an already-approved concierge errand by replaying its plan through the
 * main AI agent loop. Returns the `{ success, data, error }` shape expected by
 * both the router execute switch and the scheduler's `executeTask`.
 */
export async function executeConciergeErrand(task: AiAgentTask): Promise<ErrandExecutionResult> {
  let parsed: ConciergeErrandData;
  try {
    const raw = JSON.parse(task.taskData);
    // JSON.parse can legally return null/array/primitive — guard before
    // destructuring so a malformed row fails cleanly instead of 500-ing.
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return { success: false, error: "Invalid errand data: expected a JSON object" };
    }
    parsed = raw;
  } catch (e: any) {
    return { success: false, error: `Invalid errand data: ${e.message}` };
  }

  const { title, goal, steps = [] } = parsed;
  if (!goal || typeof goal !== "string") {
    return { success: false, error: "Errand has no goal to execute" };
  }
  // Refuse to run an errand with no submitting user rather than silently
  // executing under a fabricated (and potentially over-privileged) identity.
  if (parsed.submittedByUserId == null) {
    return { success: false, error: "Errand is missing the submitting user context; refusing to execute" };
  }

  // Tenancy comes solely from the immutable aiAgentTasks.companyId column, never
  // the mutable taskData JSON. If taskData carries a companyId that disagrees
  // with the row, treat it as tampering and refuse. If the column is null the
  // errand simply runs untenanted — we never fall back to the JSON value, so the
  // "row column is authoritative" guarantee holds.
  if (parsed.companyId != null && task.companyId != null && Number(parsed.companyId) !== Number(task.companyId)) {
    return { success: false, error: "Errand company mismatch between task row and taskData; refusing to execute" };
  }
  const companyId = task.companyId ?? undefined;

  // Act on behalf of the user who submitted the errand so user-scoped tools
  // (calendar, Gmail, etc.) resolve the right credentials. `executingErrand`
  // guards against the agent recursively planning a new errand mid-execution.
  // Sanitize identity fields read from persisted JSON: collapse whitespace /
  // newlines in the name (avoid injecting extra lines into the directive) and
  // clamp the role to a known enum value, defaulting to lowest-privilege "user".
  const sanitizedName = typeof parsed.userName === "string"
    ? parsed.userName.replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  const ctx: AIAgentContext = {
    userId: parsed.submittedByUserId,
    userName: sanitizedName || "Concierge",
    userRole: typeof parsed.userRole === "string" && KNOWN_ROLES.has(parsed.userRole) ? parsed.userRole : "user",
    companyId,
    executingErrand: true,
  };

  // steps come from persisted JSON — sanitize to trimmed strings so a malformed
  // task can't inject "[object Object]" / blank lines into the plan directive.
  const cleanSteps = Array.isArray(steps)
    ? steps.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
    : [];
  const planText = cleanSteps.length
    ? cleanSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "(no explicit steps were provided — carry out the goal directly)";

  const directive = `You are EXECUTING an already-approved errand on behalf of ${ctx.userName}. This plan has been reviewed and approved — carry it out now using your action tools (send emails, create/update records, book freight, etc.). Do NOT ask for confirmation and do NOT call plan_errand again; approval has already happened.

Errand: ${title || goal}
Original request: ${goal}

Approved plan:
${planText}

Execute every step you can. If a step is impossible (missing data, a disconnected integration, etc.), skip it and note why rather than failing the whole errand. When finished, briefly summarise what you actually did and flag anything you could not complete.`;

  try {
    const response = await processAIAgentRequest(directive, [], ctx);

    const allActions = response.actions ?? [];
    const completedActions = allActions.filter((a) => a.status === "completed");
    const failedActions = allActions.filter((a) => a.status === "failed");

    return {
      success: true,
      data: {
        summary: response.message,
        actionsRun: allActions.length,
        completedActions: completedActions.map((a) => ({ type: a.type, result: a.result })),
        failedActions: failedActions.map((a) => ({ type: a.type, error: a.error })),
      },
    };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}
