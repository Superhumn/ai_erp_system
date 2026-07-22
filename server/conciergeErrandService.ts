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
    parsed = JSON.parse(task.taskData);
  } catch (e: any) {
    return { success: false, error: `Invalid errand data: ${e.message}` };
  }

  const { title, goal, steps = [], riskLevel } = parsed;
  if (!goal) {
    return { success: false, error: "Errand has no goal to execute" };
  }

  // Act on behalf of the user who submitted the errand so user-scoped tools
  // (calendar, Gmail, etc.) resolve the right credentials. `executingErrand`
  // guards against the agent recursively planning a new errand mid-execution.
  const ctx: AIAgentContext = {
    userId: parsed.submittedByUserId ?? 0,
    userName: parsed.userName ?? "Concierge",
    userRole: parsed.userRole ?? "admin",
    companyId: parsed.companyId,
    executingErrand: true,
  };

  const planText = Array.isArray(steps) && steps.length
    ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
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
