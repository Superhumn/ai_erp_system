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

// The scheduler itself talks to Drizzle through getDb(); the shared executor
// (aiAgentTaskExecutor) and its claim go through the db.ts helpers, so those
// are stubbed here too. Every write is recorded for assertions.
vi.mock("./db", () => {
  let nextId = 500;
  return {
    getDb: vi.fn(),
    // Compare-and-set claim: resolves to the affected-row count.
    updateAiAgentTask: vi.fn(async () => 1),
    createPurchaseOrder: vi.fn(async () => ({ id: nextId++ })),
    createPurchaseOrderItem: vi.fn(async () => ({ id: nextId++ })),
    createPurchaseOrderRawMaterialLink: vi.fn(async () => ({ id: nextId++ })),
    createVendor: vi.fn(async () => ({ id: nextId++ })),
  };
});
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(), formatEmailHtml: (t: string) => t }));
vi.mock("./ingredientQuoteService", () => ({}));
vi.mock("./db/manufacturing", () => ({}));
vi.mock("./emailReplyService", () => ({ processEmailReply: vi.fn() }));
vi.mock("./taskAgentBridge", () => ({
  createProjectTaskFromSource: vi.fn(),
  syncAgentStatusToProjectTask: vi.fn(async () => "none"),
}));

import * as dbHelpers from "./db";
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

    // The task was claimed approved -> in_progress before anything ran.
    expect(dbHelpers.updateAiAgentTask).toHaveBeenCalledWith(
      5, expect.objectContaining({ status: "in_progress" }), { onlyIfStatus: "approved" },
    );

    expect(dbHelpers.createPurchaseOrder).toHaveBeenCalledTimes(1);
    const poValues = vi.mocked(dbHelpers.createPurchaseOrder).mock.calls[0][0];
    expect(poValues).toMatchObject({ vendorId: 9, status: "draft", subtotal: "125", totalAmount: "125", currency: "USD", notes: "Auto-generated by AI Agent. Task ID: 5" });
    const poId = (await vi.mocked(dbHelpers.createPurchaseOrder).mock.results[0].value).id;

    expect(dbHelpers.createPurchaseOrderItem).toHaveBeenCalledTimes(1);
    const lineValues = vi.mocked(dbHelpers.createPurchaseOrderItem).mock.calls[0][0];
    expect(lineValues.productId).toBeNull();
    expect(lineValues).toMatchObject({
      purchaseOrderId: poId,
      description: "Flour",
      quantity: "50",
      unitPrice: "2.5",
      totalAmount: "125",
    });
    const lineId = (await vi.mocked(dbHelpers.createPurchaseOrderItem).mock.results[0].value).id;

    expect(dbHelpers.createPurchaseOrderRawMaterialLink).toHaveBeenCalledWith({
      purchaseOrderItemId: lineId,
      rawMaterialId: 1,
      orderedQuantity: "50",
      unit: "kg",
      unitCost: "2.5",
    });

    const completed = db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "completed");
    expect(completed).toBeDefined();
    expect(JSON.parse(completed!.set.executionResult)).toEqual({ poId, poNumber: poValues.poNumber });

    // The approver is told the task ran.
    const note = db.inserts.find((i) => i.table === notifications);
    expect(note).toBeDefined();
    expect(note!.values).toEqual([expect.objectContaining({
      userId: 4, type: "success", entityType: "ai_agent_task", entityId: 5, link: "/ai/approvals", isRead: false,
      title: "AI task completed: generate po", message: `Task #5 created draft purchase order ${poValues.poNumber}.`,
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
    expect(dbHelpers.createPurchaseOrder).not.toHaveBeenCalled();
    expect(db.inserts.find((i) => i.table === notifications)).toBeUndefined();
    const failed = db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "failed");
    expect(failed!.set.errorMessage).toContain("no vendorId");
    expect(db.inserts.find((i) => i.table === aiAgentLogs)!.values).toMatchObject({ taskId: 6, action: "task_executed", status: "error" });
  });
});

describe("aiAgentScheduler.executeApprovedTasks (every approved task type runs)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes an approved create_vendor task instead of failing it with 'Unknown task type'", async () => {
    const task = {
      id: 7,
      taskType: "create_vendor",
      status: "approved",
      priority: "medium",
      approvedBy: 4,
      taskData: JSON.stringify({ name: "Pacific Foods", email: "sales@pacific.test" }),
    };
    const db = createFakeDb((table) => (table === aiAgentTasks ? [task] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await executeApprovedTasks();

    expect(result).toEqual({ executed: 1, failed: 0, errors: [] });
    expect(db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "failed")).toBeUndefined();
    const completed = db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "completed");
    expect(completed).toBeDefined();
    expect(JSON.parse(completed!.set.executionResult)).toMatchObject({ created: true, vendorName: "Pacific Foods" });
    expect(dbHelpers.createVendor).toHaveBeenCalledWith(expect.objectContaining({ name: "Pacific Foods", email: "sales@pacific.test", status: "active" }));
  });

  it("skips a task whose claim is lost (an admin executed it first) without running or failing it", async () => {
    const task = {
      id: 8,
      taskType: "create_vendor",
      status: "approved",
      priority: "medium",
      approvedBy: 4,
      taskData: JSON.stringify({ name: "Pacific Foods" }),
    };
    const db = createFakeDb((table) => (table === aiAgentTasks ? [task] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);
    // 0 affected rows: the row was no longer `approved` when the UPDATE ran.
    vi.mocked(dbHelpers.updateAiAgentTask).mockResolvedValueOnce(0);

    const result = await executeApprovedTasks();

    expect(result).toEqual({ executed: 0, failed: 0, errors: [] });
    expect(dbHelpers.createVendor).not.toHaveBeenCalled();
    expect(db.updates.filter((u) => u.table === aiAgentTasks)).toEqual([]);
    expect(db.inserts.filter((i) => i.table === aiAgentLogs)).toEqual([]);
  });

  it("completes a task type that has no automated executor with a note instead of failing it", async () => {
    const task = {
      id: 9,
      taskType: "generate_invoice",
      status: "approved",
      priority: "low",
      approvedBy: 4,
      taskData: JSON.stringify({ orderId: 12 }),
    };
    const db = createFakeDb((table) => (table === aiAgentTasks ? [task] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await executeApprovedTasks();

    expect(result).toEqual({ executed: 1, failed: 0, errors: [] });
    const completed = db.updates.find((u) => u.table === aiAgentTasks && u.set.status === "completed");
    expect(JSON.parse(completed!.set.executionResult)).toMatchObject({ noop: true, taskType: "generate_invoice", note: expect.stringContaining("no automated executor") });
  });
});
