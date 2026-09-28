import { describe, it, expect, vi } from "vitest";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: vi.fn() }));

import { workflowProcessors } from "./workflowProcessors";
import type { WorkflowEngine, WorkflowContext } from "./autonomousWorkflowEngine";

function fakeEngine() {
  const recordStep = vi.fn(async (_ctx: unknown, _n: number, _name: string, _type: string, fn: () => Promise<any>) => fn());
  const getDb = vi.fn(() => {
    throw new Error("processor must not touch the database");
  });
  const engine = {
    recordStep,
    getDb,
    handleException: vi.fn(),
    requestApproval: vi.fn(),
  } as unknown as WorkflowEngine;
  return { engine, recordStep, getDb };
}

const context: WorkflowContext = {
  workflowId: 1,
  runId: 10,
  config: {},
  inputData: {},
  stepResults: new Map(),
  decisions: [],
  exceptions: [],
};

// The `invoices` table is customer AR; there is no vendor bills table. Both AP
// processors must therefore be no-ops that never read or mutate `invoices`.
describe.each([
  ["invoiceMatching", "Fetch Pending Vendor Invoices"],
  ["paymentProcessing", "Fetch Due Payables"],
] as const)("workflowProcessors.%s", (name, stepName) => {
  it("returns a skipped no-op result without touching the database", async () => {
    const { engine, recordStep, getDb } = fakeEngine();

    const result = await workflowProcessors[name].execute(engine, context);

    expect(getDb).not.toHaveBeenCalled();
    expect(engine.handleException).not.toHaveBeenCalled();
    expect(engine.requestApproval).not.toHaveBeenCalled();

    expect(recordStep).toHaveBeenCalledTimes(1);
    expect(recordStep.mock.calls[0].slice(1, 4)).toEqual([1, stepName, "data_fetch"]);

    expect(result).toMatchObject({
      success: true,
      runId: 10,
      status: "skipped",
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      totalValue: 0,
    });
    expect(result.outputData.skipped).toBe(true);
    expect(result.outputData.reason).toMatch(/customer receivables/);
    expect(result.pendingApprovals).toBeUndefined();
  });
});
