// Cross-boundary types for the AI chat / agent, shared by the server agent loop
// (server/aiAgentService.ts) and the client chat surfaces (AICommandBar, the /ai
// page). Kept here so the client can type streamed responses without importing a
// server-only module.

export interface AIAgentAction {
  type: string;
  description: string;
  status: "pending" | "completed" | "failed";
  result?: any;
  error?: string;
}

export interface AIAgentResponse {
  message: string;
  actions?: AIAgentAction[];
  data?: Record<string, any>;
  suggestions?: string[];
  /** True when `message` is a proposed plan awaiting user approval (plan-first mode). */
  isPlan?: boolean;
}

/** An incremental event emitted while the agent streams a response. */
export type AgentStreamEvent =
  // Live progress label shown while a tool runs (e.g. "Creating shipment…").
  | { type: "status"; label: string }
  // A chunk of the assistant's answer, to append to the in-progress message.
  | { type: "token"; text: string }
  // Discard tokens streamed so far this response — the turn turned out to be a
  // tool call, so any preamble text was not the actual answer.
  | { type: "reset" }
  // A tool finished (completed or failed); mirrors AIAgentResponse.actions.
  | { type: "action"; action: AIAgentAction }
  // Terminal event carrying the same payload as the non-streaming response.
  | { type: "done"; response: AIAgentResponse };
