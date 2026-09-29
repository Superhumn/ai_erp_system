import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({}));

import { registerAllChatTools, allChatTools } from "./index";
import { listChatToolNames, executeTool } from "../aiAgentService";

describe("registerAllChatTools", () => {
  it("adds every module tool to the assistant and routes calls to it", async () => {
    const before = listChatToolNames();
    const result = await registerAllChatTools();
    const after = listChatToolNames();

    expect(result.tools).toBe(allChatTools().length);
    expect(after.length).toBe(before.length + result.tools);
    for (const t of allChatTools()) expect(after).toContain(t.function.name);

    // A registered tool is reachable through the dispatcher and enforces its own gate.
    await expect(
      executeTool("manage_finance", { action: "list_bills" }, { userId: 1, userName: "v", userRole: "vendor", companyId: 1 })
    ).rejects.toThrow(/not available|Not authorized|internal/i);
  });

  it("refuses to register twice", async () => {
    await expect(registerAllChatTools()).rejects.toThrow(/already registered/);
  });
});
