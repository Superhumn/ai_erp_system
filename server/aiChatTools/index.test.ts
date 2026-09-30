import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({}));

import { allChatTools, buildChatToolExecutor, chatToolModules } from "./index";
import type { ChatToolModule } from "./types";

describe("chat tool registry", () => {
  it("declares each expected tool exactly once", () => {
    const names = allChatTools().map((t) => t.function.name);
    expect(names).toEqual(["manage_finance", "manage_hr", "manage_project", "manage_marketing", "manage_grants", "manage_fundraising", "manage_recruiting", "manage_sops", "manage_legal"]);
    expect(new Set(names).size).toBe(names.length);
    for (const t of allChatTools()) {
      expect(t.type).toBe("function");
      const params = t.function.parameters as { required: string[]; properties: { action: { enum: string[] } } };
      expect(params.required).toEqual(["action"]);
      expect(params.properties.action.enum.length).toBeGreaterThan(0);
    }
  });

  it("routes a tool name to the module that declared it", async () => {
    const calls: string[] = [];
    const mk = (name: string, tool: string): ChatToolModule => ({
      name,
      tools: [{ type: "function", function: { name: tool, parameters: { type: "object", properties: {} } } }],
      execute: async (n, p) => { calls.push(`${name}:${n}:${String(p.action)}`); return { ok: name }; },
    });
    const exec = buildChatToolExecutor([mk("a", "tool_a"), mk("b", "tool_b")]);
    const ctx = { userId: 1, userName: "x", userRole: "admin" };
    await expect(exec("tool_b", { action: "go" }, ctx)).resolves.toEqual({ ok: "b" });
    expect(calls).toEqual(["b:tool_b:go"]);
    await expect(exec("tool_c", {}, ctx)).rejects.toThrow(/Unknown tool: tool_c/);
  });

  it("refuses two modules declaring the same tool name", () => {
    const dup = chatToolModules[0];
    expect(() => buildChatToolExecutor([dup, { ...dup, name: "copy" }])).toThrow(/declared by both/);
  });

  it("gates every tool for external roles", async () => {
    const exec = buildChatToolExecutor();
    for (const t of allChatTools()) {
      const params = t.function.parameters as { properties: { action: { enum: string[] } } };
      await expect(exec(t.function.name, { action: params.properties.action.enum[0] }, { userId: 1, userName: "v", userRole: "vendor", companyId: 1 })).rejects.toThrow(/Not authorized/);
    }
  });
});
