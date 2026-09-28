import { describe, it, expect, vi, beforeEach } from "vitest";
import { supplyChainWorkflows, workflowRuns } from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn() }));

const PROCESSOR_DELAY_MS = 40;
vi.mock("./workflowProcessors", () => ({
  workflowProcessors: {
    invoiceMatching: {
      execute: vi.fn(async (_engine: unknown, context: { runId: number }) => {
        await new Promise((r) => setTimeout(r, PROCESSOR_DELAY_MS));
        return {
          success: true,
          runId: context.runId,
          status: "completed",
          itemsProcessed: 0,
          itemsSucceeded: 0,
          itemsFailed: 0,
        };
      }),
    },
  },
}));

import { getDb } from "./db";
import { WorkflowEngine } from "./autonomousWorkflowEngine";

type Table = object;

function createFakeDb(resolveSelect: (table: Table) => any[]) {
  const inserts: Array<{ table: Table; values: any; id: number }> = [];
  const updates: Array<{ table: Table; set: any }> = [];
  let nextId = 100;
  return {
    inserts,
    updates,
    select() {
      let table: Table = {};
      const chain: any = {};
      for (const m of ["where", "limit", "orderBy", "groupBy", "offset", "innerJoin", "leftJoin"]) {
        chain[m] = () => chain;
      }
      chain.from = (t: Table) => {
        table = t;
        return chain;
      };
      chain.then = (res: any, rej: any) =>
        Promise.resolve()
          .then(() => resolveSelect(table))
          .then(res, rej);
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
    update(table: Table) {
      return {
        set: (set: any) => {
          updates.push({ table, set });
          const done: any = { where: async () => undefined };
          done.then = (res: any, rej: any) => Promise.resolve(undefined).then(res, rej);
          return done;
        },
      };
    },
  };
}

describe("WorkflowEngine.startWorkflow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records durationMs from the run's own start time (not from the $returningId row)", async () => {
    const workflow = {
      id: 1,
      name: "Invoice matching",
      workflowType: "invoice_matching",
      isActive: true,
      executionConfig: null,
    };
    const db = createFakeDb((table) => (table === supplyChainWorkflows ? [workflow] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);

    const engine = new WorkflowEngine();
    await engine.initialize();
    const before = Date.now();
    const result = await engine.startWorkflow(1, "manual");
    const elapsed = Date.now() - before;

    expect(result.success).toBe(true);

    const runInsert = db.inserts.find((i) => i.table === workflowRuns);
    expect(runInsert!.values.startedAt).toBeInstanceOf(Date);
    expect(result.runId).toBe(runInsert!.id);

    const completion = db.updates.find((u) => u.table === workflowRuns && u.set.status === "completed");
    expect(completion).toBeDefined();
    const { durationMs } = completion!.set;
    expect(Number.isFinite(durationMs)).toBe(true);
    // The processor slept for PROCESSOR_DELAY_MS, so a duration measured from
    // the real start must reflect at least that (timer slop tolerated).
    expect(durationMs).toBeGreaterThanOrEqual(PROCESSOR_DELAY_MS - 5);
    expect(durationMs).toBeLessThanOrEqual(elapsed + 5);
  });
});
