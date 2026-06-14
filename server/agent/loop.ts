import Anthropic from "@anthropic-ai/sdk";
import { getTools } from "./tools";
import { buildSystemPrompt } from "./prompts/system";
import { dispatchTool } from "./tools/dispatch";
import { MessageHistory } from "./memory/short";
import { logAgent } from "./logger";
import { createAgentRun, recordAgentStep, completeAgentRun } from "./persistence";
import type { AgentContext, AgentRunResult } from "./types";
import { ENV } from "../_core/env";

const client = new Anthropic();
const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_AGENT_MODEL = "claude-sonnet-4-20250514";

function resolveAgentModel(): string {
  const configured = ENV.llmModel;
  if (!configured) return DEFAULT_AGENT_MODEL;
  if (configured.startsWith("claude-")) return configured;
  return DEFAULT_AGENT_MODEL;
}

const AGENT_MODEL = resolveAgentModel();

/**
 * Core reasoning loop. Sends the goal to Claude, dispatches tool calls,
 * feeds results back, and repeats until the model stops or max iterations.
 */
export async function runAgent(
  goal: string,
  context: AgentContext,
  options: { maxIterations?: number; userId?: number; companyId?: number } = {},
): Promise<AgentRunResult> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tools = getTools();
  const history = new MessageHistory();
  const startTime = Date.now();

  // Persist the run
  const runId = await createAgentRun({
    userId: options.userId,
    companyId: options.companyId,
    goal,
    maxIterations,
    context,
  });

  logAgent({ level: "info", runId, message: `Starting agent run — goal: "${goal.slice(0, 120)}"` });

  history.push({ role: "user", content: goal });

  let iterations = 0;
  let totalTokens = 0;
  let toolCallCount = 0;
  let lastError: string | undefined;

  try {
    while (iterations < maxIterations) {
      iterations++;
      const iterStart = Date.now();

      logAgent({ level: "debug", runId, iteration: iterations, message: "Sending request to Claude" });

      const response = await client.messages.create({
        model: AGENT_MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(context),
        tools,
        messages: history.getMessages(),
      });

      const iterDuration = Date.now() - iterStart;
      const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      totalTokens += tokensUsed;

      // Extract text content for logging
      const textContent = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      // Append assistant turn
      history.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        logAgent({ level: "info", runId, iteration: iterations, durationMs: iterDuration, message: "Agent finished (end_turn)" });

        await recordAgentStep({
          runId,
          iteration: iterations,
          assistantMessage: textContent,
          stopReason: "end_turn",
          tokensUsed,
          durationMs: iterDuration,
        });
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of toolBlocks) {
          toolCallCount++;
          const toolStart = Date.now();
          let result: string;
          let isError = false;

          logAgent({ level: "info", runId, iteration: iterations, toolName: block.name, message: `Calling tool` });

          try {
            result = await dispatchTool(block.name, block.input);
          } catch (err) {
            result = `ERROR: ${(err as Error).message}`;
            isError = true;
            logAgent({ level: "error", runId, iteration: iterations, toolName: block.name, message: `Tool error: ${(err as Error).message}` });
          }

          const toolDuration = Date.now() - toolStart;

          await recordAgentStep({
            runId,
            iteration: iterations,
            toolName: block.name,
            toolInput: JSON.stringify(block.input),
            toolResult: result,
            stopReason: "tool_use",
            tokensUsed,
            durationMs: toolDuration,
            isError,
          });

          logAgent({ level: "debug", runId, iteration: iterations, toolName: block.name, durationMs: toolDuration, message: "Tool completed" });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }

        history.push({ role: "user", content: toolResults });
      }
    }

    const totalDuration = Date.now() - startTime;
    const isMaxIter = iterations >= maxIterations;

    if (isMaxIter) {
      logAgent({ level: "warn", runId, message: `Max iterations (${maxIterations}) reached` });
    }

    // Extract final summary from last assistant message
    const messages = history.getMessages();
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    let summary: string | null = null;
    if (lastAssistant && Array.isArray(lastAssistant.content)) {
      summary = (lastAssistant.content as any[])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n") || null;
    } else if (lastAssistant && typeof lastAssistant.content === "string") {
      summary = lastAssistant.content;
    }

    const status = isMaxIter ? "max_iterations" : "completed";

    await completeAgentRun({
      runId,
      status,
      iterations,
      summary: summary ?? undefined,
      totalTokensUsed: totalTokens,
      totalDurationMs: totalDuration,
      toolCallCount,
      messageHistory: history.serialize(),
    });

    logAgent({ level: "info", runId, durationMs: totalDuration, message: `Run ${status} — ${iterations} iterations, ${toolCallCount} tool calls` });

    return {
      runId,
      status,
      iterations,
      summary,
      messages: history.getMessages(),
      toolCallCount,
      totalDurationMs: totalDuration,
    };
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    lastError = (err as Error).message;

    logAgent({ level: "error", runId, message: `Run failed: ${lastError}` });

    await completeAgentRun({
      runId,
      status: "failed",
      iterations,
      error: lastError,
      totalTokensUsed: totalTokens,
      totalDurationMs: totalDuration,
      toolCallCount,
      messageHistory: history.serialize(),
    });

    return {
      runId,
      status: "failed",
      iterations,
      summary: null,
      messages: history.getMessages(),
      toolCallCount,
      totalDurationMs: totalDuration,
      error: lastError,
    };
  }
}
