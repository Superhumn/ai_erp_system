import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiAgentTasks } from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn(), createWorkOrder: vi.fn(), createFreightRfq: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), invokeLLMStream: vi.fn() }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(), formatEmailHtml: vi.fn() }));
vi.mock("./routers/middleware", () => ({ getValidGoogleToken: vi.fn() }));

import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { processAIAgentRequest, type AIAgentContext } from "./aiAgentService";

type Table = object;
function createFakeDb() {
  const inserts: Array<{ table: Table; values: any; id: number }> = [];
  let nextId = 100;
  return {
    inserts,
    select() {
      const chain: any = {};
      for (const m of ["from", "where", "limit", "orderBy", "groupBy", "offset", "innerJoin", "leftJoin"]) {
        chain[m] = () => chain;
      }
      chain.then = (res: any, rej: any) => Promise.resolve([{ count: 0 }]).then(res, rej);
      return chain;
    },
    insert(table: Table) {
      return {
        values: (values: any) => {
          const id = nextId++;
          inserts.push({ table, values, id });
          return {
            $returningId: async () => [{ id }],
            then: (res: any, rej: any) => Promise.resolve([{ insertId: id }]).then(res, rej),
          };
        },
      };
    },
  };
}

function llmCreatesTask(args: Record<string, unknown>) {
  vi.mocked(invokeLLM)
    .mockResolvedValueOnce({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "call_1", type: "function", function: { name: "create_task", arguments: JSON.stringify(args) } }],
          },
          finish_reason: "tool_calls",
        },
      ],
    } as any)
    .mockResolvedValueOnce({
      choices: [{ index: 0, message: { role: "assistant", content: "Done." }, finish_reason: "stop" }],
    } as any);
}

const taskArgs = { taskType: "generate_po", description: "Reorder flour", taskData: { vendorId: 9 }, requiresApproval: false };

describe("AI agent create_task tool", () => {
  let db: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createFakeDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
  });

  it("refuses to create a task for a non-mutation role", async () => {
    llmCreatesTask(taskArgs);
    const ctx: AIAgentContext = { userId: 1, userName: "Sam", userRole: "sales" };

    const result = await processAIAgentRequest("queue a PO", [], ctx);

    expect(db.inserts.filter((i) => i.table === aiAgentTasks)).toHaveLength(0);
    const action = result.actions?.find((a) => a.type === "create_task");
    expect(action).toBeDefined();
    expect(action!.status).toBe("failed");
    expect(action!.error).toMatch(/Not authorized/);
  });

  it("lets an ops user skip approval only because ops is a mutation role", async () => {
    llmCreatesTask(taskArgs);
    const ctx: AIAgentContext = { userId: 2, userName: "Olive", userRole: "ops" };

    await processAIAgentRequest("queue a PO", [], ctx);

    const task = db.inserts.find((i) => i.table === aiAgentTasks);
    expect(task).toBeDefined();
    expect(task!.values).toMatchObject({ taskType: "generate_po", status: "approved", requiresApproval: false });
  });

  it("defaults to pending_approval when requiresApproval is not explicitly false", async () => {
    llmCreatesTask({ ...taskArgs, requiresApproval: undefined });
    const ctx: AIAgentContext = { userId: 3, userName: "Ada", userRole: "admin" };

    await processAIAgentRequest("queue a PO", [], ctx);

    const task = db.inserts.find((i) => i.table === aiAgentTasks);
    expect(task!.values).toMatchObject({ status: "pending_approval", requiresApproval: true });
  });
});
