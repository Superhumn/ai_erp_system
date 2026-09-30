/**
 * Shared contract for the top-bar AI Assistant chat tools that live in this
 * directory. Each module exposes a set of OpenAI-style tool definitions plus an
 * `execute` dispatcher; `index.ts` registers them all with aiAgentService.
 *
 * Role helpers are deliberately local so the modules do not depend on
 * `assertRole` / `assertCanMutate` landing in aiAgentService first. Once those
 * exports exist, swap the bodies of `requireRole` / `requireInternal` for them.
 */
import { randomInt } from "node:crypto";
import type { Tool } from "../_core/llm";
import type { AIAgentContext } from "../aiAgentService";

export type { Tool, AIAgentContext };

export type ChatToolParams = Record<string, unknown>;

export interface ChatToolModule {
  /** Short module id, used in error messages and registration logs. */
  name: string;
  tools: Tool[];
  execute(name: string, params: ChatToolParams, ctx: AIAgentContext): Promise<unknown>;
}

export type ChatToolExecutor = (name: string, params: ChatToolParams, ctx: AIAgentContext) => Promise<unknown>;

// Mirrors EXTERNAL_ROLES in server/routers/_shared.ts (internalProcedure).
export const EXTERNAL_ROLES: readonly string[] = ["copacker", "vendor", "investor", "contractor"];

export const ADMIN_EXEC: readonly string[] = ["admin", "exec"];
export const FINANCE_ROLES: readonly string[] = ["admin", "exec", "finance"];
export const OPS_ROLES: readonly string[] = ["admin", "exec", "ops"];
export const LEGAL_ROLES: readonly string[] = ["admin", "exec", "legal"];
export const SALES_ROLES: readonly string[] = ["admin", "exec", "sales"];
// There is no dedicated "hr" role in the users.role enum today; keep the
// string so the gate widens automatically if one is added.
export const HR_ROLES: readonly string[] = ["admin", "exec", "hr"];

export class ChatToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatToolError";
  }
}

export function hasRole(ctx: AIAgentContext, roles: readonly string[]): boolean {
  return roles.includes(ctx.userRole);
}

/** External (portal) roles never drive the internal ERP tools. */
export function requireInternal(ctx: AIAgentContext, action: string): void {
  if (EXTERNAL_ROLES.includes(ctx.userRole)) {
    throw new ChatToolError(`Not authorized: "${action}" is only available to internal team members.`);
  }
}

/** Role gate for a specific action. Always implies `requireInternal`. */
export function requireRole(ctx: AIAgentContext, roles: readonly string[], action: string): void {
  requireInternal(ctx, action);
  if (!roles.includes(ctx.userRole)) {
    throw new ChatToolError(`Not authorized: "${action}" requires one of these roles: ${roles.join(", ")}.`);
  }
}

/** Entity filter for helpers that take a single `companyId`. */
export function companyIdOf(ctx: AIAgentContext): number | undefined {
  return ctx.companyId ?? undefined;
}

/** Entity filter for helpers that take `companyIds` (undefined = unrestricted). */
export function companyIdsOf(ctx: AIAgentContext): number[] | undefined {
  return ctx.companyId != null ? [ctx.companyId] : undefined;
}

/**
 * Row-level visibility for by-id reads and client-side filtering. Mirrors
 * `scopeAllows` in server/_core/scope.ts: a caller pinned to an entity only
 * sees rows stamped with that entity; a caller with no entity sees everything.
 */
export function inCompany(ctx: AIAgentContext, rowCompanyId: number | null | undefined): boolean {
  if (ctx.companyId == null) return true;
  return rowCompanyId != null && rowCompanyId === ctx.companyId;
}

export function filterByCompany<T extends { companyId?: number | null }>(ctx: AIAgentContext, rows: readonly T[]): T[] {
  return rows.filter((r) => inCompany(ctx, r.companyId));
}

export function notFound(what: string): never {
  throw new ChatToolError(`${what} not found`);
}

export function requireNumber(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new ChatToolError(`${label} is required`);
  return n;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ChatToolError(`${label} is required`);
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function optionalDate(value: unknown, label: string): Date | undefined {
  if (value == null || value === "") return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new ChatToolError(`${label} is not a valid date`);
  return d;
}

export function requireDate(value: unknown, label: string): Date {
  const d = optionalDate(value, label);
  if (!d) throw new ChatToolError(`${label} is required`);
  return d;
}

export function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function daysFromNow(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

/** Same shape as `generateNumber` in routers/_shared.ts (PREFIX-YYMM-NNNN). */
export function makeNumber(prefix: string, now: Date = new Date()): string {
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const random = randomInt(10000).toString().padStart(4, "0");
  return `${prefix}-${year}${month}-${random}`;
}

export function countBy<T>(rows: readonly T[], key: (row: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) ?? "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function includesText(haystack: Array<string | null | undefined>, needle: string): boolean {
  const q = needle.toLowerCase();
  return haystack.some((h) => typeof h === "string" && h.toLowerCase().includes(q));
}

type JsonSchema = Record<string, unknown>;

/** Builds a single-tool definition in the shape aiAgentService's AI_TOOLS use. */
export function defineTool(
  name: string,
  description: string,
  actions: readonly string[],
  properties: Record<string, JsonSchema>,
): Tool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: [...actions], description: "Action to perform" },
          ...properties,
        },
        required: ["action"],
      },
    },
  };
}

export function unknownAction(tool: string, action: unknown): never {
  throw new ChatToolError(`Unknown ${tool} action: ${String(action)}`);
}
