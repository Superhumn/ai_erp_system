import type { AgentLogEntry } from "./types";

const PREFIX = "[Agent]";

/**
 * Structured logger for agent runs.
 * Uses the same console-based bracket prefix pattern as the rest of the codebase.
 */
export function logAgent(entry: AgentLogEntry): void {
  const parts = [PREFIX];

  if (entry.runId != null) parts.push(`run=${entry.runId}`);
  if (entry.iteration != null) parts.push(`iter=${entry.iteration}`);
  if (entry.toolName) parts.push(`tool=${entry.toolName}`);
  if (entry.durationMs != null) parts.push(`${entry.durationMs}ms`);

  const prefix = parts.join(" ");
  const message = `${prefix} ${entry.message}`;

  switch (entry.level) {
    case "error":
      console.error(message, entry.meta ?? "");
      break;
    case "warn":
      console.warn(message, entry.meta ?? "");
      break;
    case "debug":
      if (process.env.NODE_ENV === "development") {
        console.log(message, entry.meta ?? "");
      }
      break;
    default:
      console.log(message);
      break;
  }
}
