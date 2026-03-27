import type Anthropic from "@anthropic-ai/sdk";

// ============================================
// AGENT TYPES
// ============================================

export interface AgentContext {
  userId: string;
  companyId?: number;
  activeDealCount?: number;
  openInvoiceCount?: number;
  pendingPOCount?: number;
  openWorkOrders?: number;
  timestamp: string;
  [key: string]: unknown;
}

export interface AgentRunOptions {
  goal: string;
  userId: string;
  companyId?: number;
  maxIterations?: number;
  context?: Record<string, unknown>;
}

export interface AgentRunResult {
  runId: number;
  status: "completed" | "failed" | "max_iterations";
  iterations: number;
  summary: string | null;
  messages: Anthropic.MessageParam[];
  toolCallCount: number;
  totalDurationMs: number;
  error?: string;
}

export interface ToolAdapterInput {
  action?: string;
  payload?: Record<string, unknown>;
  table?: string;
  filters?: Record<string, unknown>;
  limit?: number;
  [key: string]: unknown;
}

export interface ToolAdapterResult {
  success: boolean;
  data?: unknown;
  error?: string;
  rowCount?: number;
}

export interface AgentLogEntry {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  runId?: number;
  iteration?: number;
  toolName?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}
