import { getDb } from "../db";
import { agentRuns, agentRunSteps } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { AgentRunResult } from "./types";

/**
 * Creates a new agent run record in the database.
 * Returns the run ID for subsequent step logging.
 */
export async function createAgentRun(params: {
  userId?: number;
  companyId?: number;
  goal: string;
  maxIterations: number;
  context: Record<string, unknown>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  const [result] = await db.insert(agentRuns).values({
    userId: params.userId,
    companyId: params.companyId,
    goal: params.goal,
    maxIterations: params.maxIterations,
    context: JSON.stringify(params.context),
    status: "running",
  }).$returningId();

  return result.id;
}

/**
 * Records a single step (iteration) of an agent run.
 */
export async function recordAgentStep(params: {
  runId: number;
  iteration: number;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  assistantMessage?: string;
  stopReason?: string;
  tokensUsed?: number;
  durationMs?: number;
  isError?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  await db.insert(agentRunSteps).values({
    runId: params.runId,
    iteration: params.iteration,
    toolName: params.toolName,
    toolInput: params.toolInput,
    toolResult: params.toolResult ? params.toolResult.slice(0, 65000) : undefined,
    assistantMessage: params.assistantMessage ? params.assistantMessage.slice(0, 65000) : undefined,
    stopReason: params.stopReason,
    tokensUsed: params.tokensUsed,
    durationMs: params.durationMs,
    isError: params.isError ?? false,
  });
}

/**
 * Completes an agent run, updating its final status and summary.
 */
export async function completeAgentRun(params: {
  runId: number;
  status: "completed" | "failed" | "max_iterations";
  iterations: number;
  summary?: string;
  error?: string;
  totalTokensUsed?: number;
  totalDurationMs?: number;
  toolCallCount?: number;
  messageHistory?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  await db
    .update(agentRuns)
    .set({
      status: params.status,
      iterations: params.iterations,
      summary: params.summary,
      errorMessage: params.error,
      totalTokensUsed: params.totalTokensUsed ?? 0,
      totalDurationMs: params.totalDurationMs,
      toolCallCount: params.toolCallCount ?? 0,
      messageHistory: params.messageHistory,
      completedAt: new Date(),
    })
    .where(eq(agentRuns.id, params.runId));
}

/**
 * Retrieves an agent run by ID with its steps.
 */
export async function getAgentRunWithSteps(runId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId));

  if (!run) return null;

  const steps = await db
    .select()
    .from(agentRunSteps)
    .where(eq(agentRunSteps.runId, runId));

  return { run, steps };
}
