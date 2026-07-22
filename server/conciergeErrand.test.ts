import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the main agent loop so we can exercise the errand executor in isolation
// (no DB, no LLM). Both the router execute switch and the scheduler delegate
// concierge_errand execution to executeConciergeErrand, so this covers the
// shared execution logic behind both paths.
const processAIAgentRequest = vi.fn();
vi.mock("./aiAgentService", () => ({
  processAIAgentRequest: (...args: any[]) => processAIAgentRequest(...args),
}));

import { executeConciergeErrand } from "./conciergeErrandService";

const validData = {
  title: "Chase Acme invoice",
  goal: "Chase the overdue invoice from Acme",
  steps: ["Look up Acme open invoices", "Draft a reminder email", "Send it"],
  riskLevel: "medium",
  submittedByUserId: 42,
  userName: "Jade",
  userRole: "admin",
  companyId: 7,
};

const taskWith = (data: Record<string, any>) =>
  ({ id: 1, taskType: "concierge_errand", taskData: JSON.stringify(data) }) as any;

describe("executeConciergeErrand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replays the approved plan as the submitting user and reports completed actions", async () => {
    processAIAgentRequest.mockResolvedValue({
      message: "Sent the reminder email to Acme.",
      actions: [{ type: "send_email", status: "completed", result: { sent: true } }],
    });

    const result = await executeConciergeErrand(taskWith(validData));

    expect(result.success).toBe(true);
    expect(result.data.summary).toContain("reminder");
    expect(result.data.actionsRun).toBe(1);
    expect(result.data.completedActions).toHaveLength(1);
    expect(result.data.failedActions).toHaveLength(0);

    // Acts on behalf of the submitting user, with the re-planning guard set.
    const ctx = processAIAgentRequest.mock.calls[0][2];
    expect(ctx.userId).toBe(42);
    expect(ctx.executingErrand).toBe(true);
  });

  it("surfaces failed steps without failing the whole errand", async () => {
    processAIAgentRequest.mockResolvedValue({
      message: "Partially done.",
      actions: [
        { type: "query_system", status: "completed", result: {} },
        { type: "send_email", status: "failed", error: "SMTP unavailable" },
      ],
    });

    const result = await executeConciergeErrand(taskWith(validData));

    expect(result.success).toBe(true);
    expect(result.data.failedActions).toEqual([{ type: "send_email", error: "SMTP unavailable" }]);
  });

  it("sanitizes non-string / blank steps out of the plan directive", async () => {
    processAIAgentRequest.mockResolvedValue({ message: "done", actions: [] });

    await executeConciergeErrand(
      taskWith({ ...validData, steps: ["Look up invoice", { bad: 1 }, "  ", "Send it"] }),
    );

    const directive = processAIAgentRequest.mock.calls[0][0] as string;
    expect(directive).not.toContain("[object Object]");
    expect(directive).toContain("1. Look up invoice");
    expect(directive).toContain("2. Send it");
  });

  it("fails cleanly when taskData is not valid JSON", async () => {
    const result = await executeConciergeErrand({ id: 1, taskType: "concierge_errand", taskData: "{not json" } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid errand data");
    expect(processAIAgentRequest).not.toHaveBeenCalled();
  });

  it("refuses to execute an errand with no goal", async () => {
    const { goal, ...noGoal } = validData;
    const result = await executeConciergeErrand(taskWith(noGoal));
    expect(result.success).toBe(false);
    expect(result.error).toContain("no goal");
    expect(processAIAgentRequest).not.toHaveBeenCalled();
  });

  it("refuses to execute without a submitting user rather than defaulting to admin", async () => {
    const { submittedByUserId, ...noUser } = validData;
    const result = await executeConciergeErrand(taskWith(noUser));
    expect(result.success).toBe(false);
    expect(result.error).toContain("submitting user");
    expect(processAIAgentRequest).not.toHaveBeenCalled();
  });

  it("returns a failure result when the agent loop throws", async () => {
    processAIAgentRequest.mockRejectedValue(new Error("LLM timeout"));
    const result = await executeConciergeErrand(taskWith(validData));
    expect(result.success).toBe(false);
    expect(result.error).toBe("LLM timeout");
  });
});
