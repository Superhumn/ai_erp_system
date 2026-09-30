/**
 * Registry for the module chat tools. `registerAllChatTools()` hands every
 * module's tool definitions plus one combined executor to aiAgentService's
 * `registerChatTools`. Nothing here calls it: the lead wires it at boot.
 */
import type { Tool } from "../_core/llm";
import type { AIAgentContext, ChatToolExecutor, ChatToolModule, ChatToolParams } from "./types";
import { ChatToolError } from "./types";
import { financeModule } from "./finance";
import { hrModule } from "./hr";
import { projectModule } from "./projects";
import { marketingModule } from "./marketing";
import { growthModule } from "./growth";

export type { ChatToolModule, ChatToolExecutor } from "./types";

export const chatToolModules: ChatToolModule[] = [
  financeModule,
  hrModule,
  projectModule,
  marketingModule,
  growthModule,
];

/** Every tool definition across the modules, in registration order. */
export function allChatTools(modules: readonly ChatToolModule[] = chatToolModules): Tool[] {
  return modules.flatMap((m) => m.tools);
}

/** One executor that routes a tool name to the module that declared it. */
export function buildChatToolExecutor(modules: readonly ChatToolModule[] = chatToolModules): ChatToolExecutor {
  const owners = new Map<string, ChatToolModule>();
  for (const m of modules) {
    for (const t of m.tools) {
      const existing = owners.get(t.function.name);
      if (existing) throw new Error(`Chat tool "${t.function.name}" is declared by both "${existing.name}" and "${m.name}"`);
      owners.set(t.function.name, m);
    }
  }
  return async (name: string, params: ChatToolParams, ctx: AIAgentContext) => {
    const owner = owners.get(name);
    if (!owner) throw new ChatToolError(`Unknown tool: ${name}`);
    return owner.execute(name, params ?? {}, ctx);
  };
}

type RegisterChatTools = (tools: Tool[], executor: ChatToolExecutor) => void;

/**
 * Registers every module with aiAgentService. Resolved at call time so this
 * file typechecks whether or not `registerChatTools` has landed yet; a missing
 * export fails loudly instead of silently registering nothing.
 */
export async function registerAllChatTools(modules: readonly ChatToolModule[] = chatToolModules): Promise<{ tools: number; modules: string[] }> {
  const svc = (await import("../aiAgentService")) as unknown as { registerChatTools?: RegisterChatTools };
  if (typeof svc.registerChatTools !== "function") {
    throw new Error("aiAgentService.registerChatTools is not available; chat tool modules were not registered");
  }
  const tools = allChatTools(modules);
  svc.registerChatTools(tools, buildChatToolExecutor(modules));
  return { tools: tools.length, modules: modules.map((m) => m.name) };
}
