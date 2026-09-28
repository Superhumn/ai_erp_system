import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aiAgentRules,
  aiAgentTasks,
  aiAgentLogs,
  rawMaterials,
  purchaseOrders,
  purchaseOrderItems,
  purchaseOrderRawMaterials,
  notifications,
} from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn() }));
vi.mock("./ingredientQuoteService", () => ({}));
vi.mock("./db/manufacturing", () => ({}));

import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { evaluateRules, executeApprovedTasks } from "./aiAgentScheduler";

// ---------------------------------------------------------------------------
// Minimal Drizzle-shaped fake: every select chain is thenable and resolves via
// `resolveSelect(table, joins)`; inserts/updates are recorded for assertions.
// ---------------------------------------------------------------------------
type Table = object;
type SelectState = { table: Table; joins: Table[]; calls: string[] };

function createFakeDb(resolveSelect: (table: Table, joins: Table[]) => any[]) {
  const inserts: Array<{ table: Table; values: any; id: number }> = [];
  const updates: Array<{ table: Table; set: any }> = [];
  const selects: SelectState[] = [];
  let nextId = 100;
  return {
    inserts,
    updates,
    selects,
    select() {
      const state: SelectState = { table: {}, joins: [], calls: [] };
      selects.push(state);
      const chain: any = {};
      for (const m of ["where", "limit", "orderBy", "groupBy", "offset"]) {
        chain[m] = () => {
          state.calls.push(m);
          return chain;
        };
      }
      chain.from = (t: Table) => {
        state.table = t;
        return chain;
      };
      chain.innerJoin = (t: Table) => {
        state.joins.push(t);
        return chain;
      };
      chain.leftJoin = chain.innerJoin;
      chain.then = (res: any, rej: any) =>
        Promise.resolve()
          .then(() => resolveSelect(state.table, state.joins))
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

const poRule = {
  id: 7,
  name: "Auto PO",
  ruleType: "po_auto_generate",
  triggerCondition: "{}",
  actionConfig: JSON.stringify({ type: "generate_po", params: {} }),
  requiresApproval: true,
  autoApproveThreshold: null,
  isActive: true,
  lastTriggeredAt: null,
  checkFrequencyMinutes: 15,
};

const flour = {
  id: 1,
  name: "Flour",
  quantityOnOrder: "0",
  minOrderQty: "50",
  preferredVendorId: 9,
  unitCost: "2.5",
  unit: "kg",
  status: "active",
};

describe("aiAgentScheduler.evaluateRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ summary: "Reorder flour", urgency: "high", notes: "asap" }) } }],
    } as any);
  });

  it("skips a rule that already has an open (pending/approved) task", async () => {
    const db = createFakeDb((table, joins) => {
      if (table === aiAgentRules) return [poRule];
      // rule_triggered log joined to an open task
      if (table === aiAgentLogs && joins.includes(aiAgentTasks)) return [{ id: 3 }];
      return [];
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await evaluateRules();

    expect(result).toEqual({ triggeredRules: 0, tasksCreated: 0, errors: [] });
    expect(db.inserts).toHaveLength(0);
    // The condition itself was never evaluated
    expect(db.selects.some((s) => s.table === rawMaterials)).toBe(false);
  });

  it("does not trigger PO generation when every low-stock material is already on an open PO", async () => {
    const db = createFakeDb((table, joins) => {
      if (table === aiAgentRules) return [poRule];
      if (table === rawMaterials) return [{ id: flour.id }];
      if (table === purchaseOrderRawMaterials) return [{ rawMaterialId: flour.id }];
      return [];
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await evaluateRules();

    expect(result).toEqual({ triggeredRules: 0, tasksCreated: 0, errors: [] });
    expect(db.inserts.filter((i) => i.table === aiAgentTasks)).toHaveLength(0);

    // Coverage is determined through the real junction table joined to PO lines and POs
    const covered = db.selects.find((s) => s.table === purchaseOrderRawMaterials);
    expect(covered).toBeDefined();
    expect(covered!.joins).toEqual([purchaseOrderItems, purchaseOrders]);
  });

  it("creates one PO task for uncovered low-stock materials and logs it against the rule", async () => {
    const taskSelects: any[][] = [
      [], // hasOpenTaskForEntity: no open generate_po task for this vendor
      [{ id: 100, taskType: "generate_po", status: "pending_approval" }], // re-read of the created task
    ];
    const db = createFakeDb((table) => {
      if (table === aiAgentRules) return [poRule];
      if (table === rawMaterials) return [flour];
      if (table === purchaseOrderRawMaterials) return [];
      if (table === aiAgentTasks) return taskSelects.shift() ?? [];
      return [];
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await evaluateRules();

    expect(result).toEqual({ triggeredRules: 1, tasksCreated: 1, errors: [] });

    const taskInsert = db.inserts.find((i) => i.table === aiAgentTasks);
    expect(taskInsert).toBeDefined();
    expect(taskInsert!.values.status).toBe("pending_approval");
    const taskData = JSON.parse(taskInsert!.values.taskData);
    expect(taskData.vendorId).toBe(9);
    expect(taskData.materials).toEqual([{ id: 1, name: "Flour", quantity: "50", unitCost: "2.5", unit: "kg" }]);

    const log = db.inserts.find((i) => i.table === aiAgentLogs);
    expect(log!.values).toMatchObject({ ruleId: 7, taskId: 100, action: "rule_triggered" });
  });

  it("does not queue a second PO task for a vendor that already has one open", async () => {
    const db = createFakeDb((table) => {
      if (table === aiAgentRules) return [poRule];
      if (table === rawMaterials) return [flour];
      if (table === purchaseOrderRawMaterials) return [];
      if (table === aiAgentTasks) return [{ id: 55 }]; // open generate_po task for vendor 9
      return [];
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await evaluateRules();

    expect(result.tasksCreated).toBe(0);
    expect(db.inserts.filter((i) => i.table === aiAgentTasks)).toHaveLength(0);
  });
});

describe("aiAgentScheduler.executeApprovedTasks (generate_po)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links PO lines to raw materials through purchaseOrderRawMaterials instead of productId", async () => {
    const task = {
      id: 5,
      taskType: "generate_po",
      status: "approved",
      priority: "high",
      approvedBy: 4,
      taskData: JSON.stringify({
        vendorId: 9,
        materials: [{ id: 1, name: "Flour", quantity: "50", unitCost: "2.5", unit: "kg" }],
        totalValue: 125,
      }),
    };
    const db = createFakeDb((table) => (table === aiAgentTasks ? [task] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await executeApprovedTasks();

    expect(result).toEqual({ executed: 1, failed: 0, errors: [] });

    const poInsert = db.inserts.find((i) => i.table === purchaseOrders);
    expect(poInsert!.values).toMatchObject({ vendorId: 9, status: "draft" });

    const lineInsert = db.inserts.find((i) => i.table === purchaseOrderItems);
    expect(lineInsert).toBeDefined();
    expect(lineInsert!.values.productId).toBeNull();
    expect(lineInsert!.values).toMatchObject({
      purchaseOrderId: poInsert!.id,
      description: "Flour",
      quantity: "50",
      unitPrice: "2.5",
      totalAmount: "125",
    });

    const link = db.inserts.find((i) => i.table === purchaseOrderRawMaterials);
    expect(link).toBeDefined();
    expect(link!.values).toMatchObject({
      purchaseOrderItemId: lineInsert!.id,
      rawMaterialId: 1,
      orderedQuantity: "50",
      unit: "kg",
      unitCost: "2.5",
      status: "ordered",
    });

    const completed = db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "completed");
    expect(completed).toBeDefined();

    // The approver is told the task ran.
    const note = db.inserts.find((i) => i.table === notifications);
    expect(note).toBeDefined();
    expect(note!.values).toEqual([expect.objectContaining({
      userId: 4, type: "success", entityType: "ai_agent_task", entityId: 5, link: "/ai/approvals", isRead: false,
      title: "AI task completed: generate po", message: `Task #5 created draft purchase order ${poInsert!.values.poNumber}.`,
    })]);
  });

  it("fails a task that names no vendor instead of defaulting to vendor 1", async () => {
    const task = {
      id: 6,
      taskType: "generate_po",
      status: "approved",
      priority: "high",
      approvedBy: 4,
      taskData: JSON.stringify({
        materials: [{ id: 1, name: "Flour", quantity: "50", unitCost: "2.5", unit: "kg" }],
        totalValue: 125,
      }),
    };
    const db = createFakeDb((table) => (table === aiAgentTasks ? [task] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await executeApprovedTasks();

    expect(result).toEqual({ executed: 0, failed: 1, errors: ["Task 6 failed: PO generation task has no vendorId — select a vendor for this task before approving it"] });
    expect(db.inserts.find((i) => i.table === purchaseOrders)).toBeUndefined();
    expect(db.inserts.find((i) => i.table === notifications)).toBeUndefined();
    const failed = db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "failed");
    expect(failed!.set.errorMessage).toContain("no vendorId");
    expect(db.inserts.find((i) => i.table === aiAgentLogs)!.values).toMatchObject({ taskId: 6, action: "task_executed", status: "error" });
  });
});
