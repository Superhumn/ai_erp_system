import { runAgent } from "./loop";
import { buildWorkingContext } from "./memory/working";
import type { AgentRunOptions, AgentRunResult } from "./types";

/**
 * Main entry point for triggering an agent run.
 * Builds working context from live DB state, then starts the reasoning loop.
 */
export async function triggerAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { goal, userId, companyId, maxIterations, context: extraContext } = options;

  const workingContext = await buildWorkingContext(userId, companyId);

  // Merge any extra context from the caller
  if (extraContext) {
    Object.assign(workingContext, extraContext);
  }

  return runAgent(goal, workingContext, {
    maxIterations,
    userId: userId ? parseInt(userId, 10) : undefined,
    companyId,
  });
}
