/**
 * Flow test — AI agent approval loop.
 *
 * Drives the real aiAgent + purchaseOrders routers and the real scheduler
 * (evaluateRules / executeApprovedTasks) against one stateful in-memory store.
 * The scheduler talks to Drizzle directly, so the store is the in-memory
 * Drizzle-shaped engine from ./_fakeDrizzle (every `where` clause is evaluated
 * against the rows), which keeps the dedupe and coverage checks honest.
 */
import { describe, it, expect, vi } from "vitest";
import { ctxFor } from "./_harness";
import {
  aiAgentRules, aiAgentTasks, aiAgentLogs, rawMaterials, vendors,
  purchaseOrders, purchaseOrderItems, purchaseOrderRawMaterials, notifications, auditLogs,
} from "../../drizzle/schema";

type Row = { id: number } & Record<string, any>;

const { store, fakeDb } = await vi.hoisted(async () => (await import("./_fakeDrizzle")).createFakeDrizzle());

vi.mock("../db", async () => {
  const schema = await import("../../drizzle/schema");
  const R = (tbl: object) => store.rows(tbl);
  const withStamps = (data: Row) => ({ ...data, id: undefined as unknown as number });
  return {
    getDb: vi.fn(async () => fakeDb),
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    createAuditLog: vi.fn(async (data: Row) => { R(schema.auditLogs).insert(data); }),
    createNotification: vi.fn(async (input: Row) => R(schema.notifications).insert({ ...input, isRead: false }).id),

    // ---- AI agent (db.ts AI AGENT SYSTEM) ----
    createAiAgentRule: vi.fn(async (data: Row) => ({ id: R(schema.aiAgentRules).insert({ isActive: true, triggerCount: 0, lastTriggeredAt: null, ...withStamps(data) }).id, ...data })),
    getAiAgentRules: vi.fn(async (filters?: { ruleType?: string; isActive?: boolean }) =>
      R(schema.aiAgentRules).filter((r) => (!filters?.ruleType || r.ruleType === filters.ruleType) && (filters?.isActive === undefined || r.isActive === filters.isActive)).reverse()),
    createAiAgentTask: vi.fn(async (data: Row) => ({ id: R(schema.aiAgentTasks).insert({ requiresApproval: true, retryCount: 0, ...withStamps(data) }).id, ...data })),
    getAiAgentTaskById: vi.fn(async (id: number) => R(schema.aiAgentTasks).get(id) || null),
    updateAiAgentTask: vi.fn(async (id: number, data: Row) => { R(schema.aiAgentTasks).update(id, data); }),
    getAiAgentTasks: vi.fn(async (filters?: { status?: string; taskType?: string; priority?: string }) =>
      R(schema.aiAgentTasks).filter((t) => (!filters?.status || t.status === filters.status) && (!filters?.taskType || t.taskType === filters.taskType) && (!filters?.priority || t.priority === filters.priority)).reverse()),
    getPendingApprovalTasks: vi.fn(async () => R(schema.aiAgentTasks).filter((t) => t.status === "pending_approval").reverse()),
    bulkDeleteAiAgentTasks: vi.fn(async (filters?: { taskType?: string; status?: string }) => {
      const victims = R(schema.aiAgentTasks).filter((t) => {
        if (!filters?.taskType && !filters?.status) return t.taskType === "reply_email" || t.taskType === "send_email";
        return (!filters.taskType || t.taskType === filters.taskType) && (!filters.status || t.status === filters.status);
      });
      for (const v of victims) R(schema.aiAgentTasks).remove(v.id);
      return victims.length;
    }),
    createAiAgentLog: vi.fn(async (data: Row) => ({ id: R(schema.aiAgentLogs).insert(withStamps(data)).id, ...data })),
    getAiAgentLogs: vi.fn(async (filters?: { taskId?: number; ruleId?: number; status?: string }, limit = 100) =>
      R(schema.aiAgentLogs).filter((l) => (!filters?.taskId || l.taskId === filters.taskId) && (!filters?.ruleId || l.ruleId === filters.ruleId) && (!filters?.status || l.status === filters.status)).reverse().slice(0, limit)),

    // ---- materials / vendors / POs ----
    getRawMaterialById: vi.fn(async (id: number) => R(schema.rawMaterials).get(id)),
    getRawMaterials: vi.fn(async (filters?: { searchTerm?: string; limit?: number }) => {
      let rows = R(schema.rawMaterials).all();
      if (filters?.searchTerm) rows = rows.filter((r) => String(r.name).toLowerCase().includes(filters.searchTerm!.toLowerCase()));
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return filters?.limit ? rows.slice(0, filters.limit) : rows;
    }),
    getRawMaterialByNameOrSku: vi.fn(async (name: string, sku: string) => R(schema.rawMaterials).find((r) => r.name === name || r.sku === sku)),
    updateRawMaterial: vi.fn(async (id: number, data: Row) => { R(schema.rawMaterials).update(id, data); }),
    getVendorById: vi.fn(async (id: number) => R(schema.vendors).get(id)),
    getVendors: vi.fn(async () => R(schema.vendors).all().reverse()),
    createPurchaseOrder: vi.fn(async (data: Row) => ({ id: R(schema.purchaseOrders).insert(data).id })),
    createPurchaseOrderItem: vi.fn(async (data: Row) => ({ id: R(schema.purchaseOrderItems).insert(data).id })),
    createPurchaseOrderRawMaterialLink: vi.fn(async (data: Row) => ({ id: R(schema.purchaseOrderRawMaterials).insert({ ...data, receivedQuantity: "0", status: "ordered" }).id })),
  };
});

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_core/email")>()),
  sendEmail: vi.fn(async () => ({ success: true, messageId: "msg-1" })),
  isEmailConfigured: () => true,
}));

import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { evaluateRules, executeApprovedTasks } from "../aiAgentScheduler";
import { appRouter } from "../routers";

const llmReply = (payload: unknown) =>
  vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(payload) } }] } as any);

const admin = appRouter.createCaller(ctxFor("admin", { id: 1, name: "Ada Admin" }));
const ops = appRouter.createCaller(ctxFor("ops", { id: 2, name: "Oscar Ops" }));
const rules = () => store.rows(aiAgentRules).all();
const tasks = () => store.rows(aiAgentTasks).all();
const logs = () => store.rows(aiAgentLogs).all();

// Seed: one vendor, one material that is low on stock (quantityOnOrder < 10 is
// the scheduler's low-stock definition) with a preferred vendor and MOQ.
const acme = store.rows(vendors).insert({ name: "Acme Sugar Co", email: "sales@acme.test", status: "active", type: "supplier", defaultLeadTimeDays: 7 });
const sugar = store.rows(rawMaterials).insert({
  name: "Cane Sugar", sku: "SUG-1", status: "active", unit: "kg", quantityOnOrder: "0", minOrderQty: "500", unitCost: "1.50",
  preferredVendorId: acme.id, quantityReceived: "0", companyId: 1,
});

describe("AI agent approval loop", () => {
  let ruleId: number;
  let taskId: number;

  it("1. admin creates a po_auto_generate rule (ops cannot)", async () => {
    const input = {
      name: "Auto PO for low stock", ruleType: "po_auto_generate" as const,
      triggerCondition: JSON.stringify({ field: "quantityOnOrder", operator: "lt", value: 10 }),
      actionConfig: JSON.stringify({ type: "generate_po", params: {} }),
      requiresApproval: true,
    };
    await expect(ops.aiAgent.rules.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await admin.aiAgent.rules.create(input);
    ruleId = created.id;
    expect(rules()).toHaveLength(1);
    expect(rules()[0]).toMatchObject({ name: "Auto PO for low stock", ruleType: "po_auto_generate", requiresApproval: true, isActive: true, createdBy: 1, triggerCount: 0 });
    expect(await ops.aiAgent.rules.list({ isActive: true })).toHaveLength(1);
  });

  it("2. the scheduler turns the low-stock material into ONE pending_approval PO task; re-evaluating creates no duplicate (#420)", async () => {
    llmReply({ summary: "Reorder 500 kg of cane sugar from Acme", urgency: "high", notes: "MOQ applies" });
    const first = await evaluateRules();
    expect(first).toEqual({ triggeredRules: 1, tasksCreated: 1, errors: [] });

    expect(tasks()).toHaveLength(1);
    const task = tasks()[0];
    taskId = task.id;
    expect(task).toMatchObject({ taskType: "generate_po", status: "pending_approval", priority: "high", aiReasoning: "MOQ applies", aiConfidence: "0.85", relatedEntityType: "raw_material", requiresApproval: true });
    expect(JSON.parse(task.taskData)).toEqual({
      title: "Auto-generate PO for 1 material(s)",
      description: "Reorder 500 kg of cane sugar from Acme",
      vendorId: acme.id,
      materials: [{ id: sugar.id, name: "Cane Sugar", quantity: "500", unitCost: "1.50", unit: "kg" }],
      totalValue: 750,
    });
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({ ruleId, taskId, action: "rule_triggered", status: "success", message: 'Rule "Auto PO for low stock" triggered, task created' });
    expect(rules()[0].triggerCount).toBe(1);
    expect(rules()[0].lastTriggeredAt).toBeInstanceOf(Date);

    // The approval queue shows it.
    const pending = await ops.aiAgent.tasks.pendingApprovals();
    expect(pending.map((t) => t.id)).toEqual([taskId]);

    // Regression #420: even once the per-rule cooldown has elapsed, an open
    // task for the rule blocks a second evaluation from queueing a duplicate.
    store.rows(aiAgentRules).update(ruleId, { lastTriggeredAt: new Date(Date.now() - 60 * 60 * 1000) });
    vi.mocked(invokeLLM).mockClear();
    const second = await evaluateRules();
    expect(second).toEqual({ triggeredRules: 0, tasksCreated: 0, errors: [] });
    expect(tasks()).toHaveLength(1);
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(rules()[0].triggerCount).toBe(1);
  });

  it("3. ops cannot approve; admin approves and the scheduler executes it into a draft PO linked to the raw material (no productId), completes the task and logs it", async () => {
    await expect(ops.aiAgent.tasks.approve({ id: taskId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ops.aiAgent.tasks.execute({ id: taskId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tasks()[0].status).toBe("pending_approval");

    // Not executable before approval either.
    await expect(admin.aiAgent.tasks.execute({ id: taskId })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Task must be approved before execution" });

    expect(await admin.aiAgent.tasks.approve({ id: taskId })).toEqual({ success: true });
    expect(tasks()[0]).toMatchObject({ status: "approved", approvedBy: 1 });
    expect(tasks()[0].approvedAt).toBeInstanceOf(Date);
    expect(logs().at(-1)).toMatchObject({ taskId, action: "task_approved", status: "success", message: "Task approved by Ada Admin" });
    expect(await ops.aiAgent.tasks.pendingApprovals()).toEqual([]);

    // Still counts as open for the dedupe guard.
    store.rows(aiAgentRules).update(ruleId, { lastTriggeredAt: new Date(Date.now() - 60 * 60 * 1000) });
    expect(await evaluateRules()).toEqual({ triggeredRules: 0, tasksCreated: 0, errors: [] });

    const run = await executeApprovedTasks();
    expect(run).toEqual({ executed: 1, failed: 0, errors: [] });

    const pos = store.rows(purchaseOrders).all();
    expect(pos).toHaveLength(1);
    expect(pos[0]).toMatchObject({ vendorId: acme.id, status: "draft", subtotal: "750", totalAmount: "750", currency: "USD", notes: `Auto-generated by AI Agent. Task ID: ${taskId}` });
    expect(pos[0].poNumber).toMatch(/^PO-[0-9A-Z]+$/);

    const items = store.rows(purchaseOrderItems).all();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ purchaseOrderId: pos[0].id, productId: null, description: "Cane Sugar", quantity: "500", unitPrice: "1.5", totalAmount: "750" });

    const links = store.rows(purchaseOrderRawMaterials).all();
    expect(links).toEqual([expect.objectContaining({
      purchaseOrderItemId: items[0].id, rawMaterialId: sugar.id, orderedQuantity: "500", receivedQuantity: "0", unit: "kg", unitCost: "1.5", status: "ordered",
    })]);

    const done = tasks()[0];
    expect(done.status).toBe("completed");
    expect(done.executedAt).toBeInstanceOf(Date);
    expect(JSON.parse(done.executionResult)).toEqual({ poId: pos[0].id, poNumber: pos[0].poNumber });
    expect(logs().at(-1)).toMatchObject({ taskId, action: "task_executed", status: "success", message: "Task completed successfully" });
    expect(await ops.aiAgent.logs.list({ taskId })).toHaveLength(3);

    // The material is now covered by an open PO, so the rule no longer fires
    // even though the task is closed and the cooldown has passed.
    store.rows(aiAgentRules).update(ruleId, { lastTriggeredAt: new Date(Date.now() - 60 * 60 * 1000) });
    expect(await evaluateRules()).toEqual({ triggeredRules: 0, tasksCreated: 0, errors: [] });
    expect(tasks()).toHaveLength(1);

    // The approver is told the task ran (the scheduler writes the row directly).
    const notes = store.rows(notifications).all();
    expect(notes).toEqual([expect.objectContaining({
      userId: 1, type: "success", severity: "info", entityType: "ai_agent_task", entityId: taskId, link: "/ai/approvals", isRead: false,
      title: "AI task completed: generate po", message: `Task #${taskId} created draft purchase order ${pos[0].poNumber}.`,
    })]);
    expect(notes[0].metadata).toEqual({ taskType: "generate_po", result: { poId: pos[0].id, poNumber: pos[0].poNumber } });
  });

  it("4. rejecting records the reason; bulkDelete is admin-only and removes only what it was asked to", async () => {
    const t2 = await admin.aiAgent.tasks.create({ taskType: "send_email", taskData: JSON.stringify({ to: "v@x.test" }) });
    const t3 = await admin.aiAgent.tasks.create({ taskType: "vendor_followup", taskData: JSON.stringify({ poId: 1 }) });

    expect(await admin.aiAgent.tasks.reject({ id: t2.id, reason: "Vendor already replied" })).toEqual({ success: true });
    const rejected = store.rows(aiAgentTasks).get(t2.id)!;
    expect(rejected).toMatchObject({ status: "rejected", rejectedBy: 1, rejectionReason: "Vendor already replied" });
    expect(rejected.rejectedAt).toBeInstanceOf(Date);
    expect(logs().at(-1)).toMatchObject({ taskId: t2.id, action: "task_rejected", status: "warning", message: "Task rejected by Ada Admin: Vendor already replied" });

    await expect(ops.aiAgent.tasks.bulkDelete({ status: "rejected" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tasks()).toHaveLength(3);

    expect(await admin.aiAgent.tasks.bulkDelete({ status: "rejected" })).toEqual({ deleted: 1 });
    expect(tasks().map((t) => t.id)).toEqual([taskId, t3.id]);
    expect(store.rows(auditLogs).all().at(-1)).toMatchObject({ userId: 1, action: "delete", entityType: "ai_agent_task", entityName: "Bulk delete tasks" });
  });

  it("5. natural language: 'order 500 kg of sugar from Acme' becomes a pending draft-PO task for an ops user, not an executed PO; admin then approves and executes it", async () => {
    // Text → structured request (LLM) → vendor/material preview, all read-only.
    llmReply({ materialName: "sugar", quantity: 500, unit: "kg", shipTo: "Acme" });
    const { parsed, preview } = await ops.purchaseOrders.parseText({ text: "order 500 kg of sugar from Acme" });
    expect(parsed).toEqual({ materialName: "sugar", quantity: 500, unit: "kg", shipTo: "Acme" });
    expect(preview).toMatchObject({ vendorId: acme.id, vendorName: "Acme Sugar Co", rawMaterialId: sugar.id, subtotal: "750.00", totalAmount: "750.00", suggested: false, isPriceEstimated: false });
    expect(preview.items).toEqual([{ description: "sugar (500 kg)", quantity: "500", unitPrice: "1.50", totalAmount: "750.00", rawMaterialId: sugar.id }]);
    const posBefore = store.rows(purchaseOrders).all().length;

    // Ops has no approval bypass: the request is queued as a task, nothing is ordered.
    const task = await ops.aiAgent.tasks.create({
      taskType: "generate_po", priority: "medium",
      taskData: JSON.stringify({ rawMaterialId: sugar.id, vendorId: preview.vendorId, quantity: 500, unitCost: "1.50", notes: "From command bar" }),
      aiReasoning: "Ops asked: order 500 kg of sugar from Acme",
    });
    const stored = store.rows(aiAgentTasks).get(task.id)!;
    expect(stored).toMatchObject({ taskType: "generate_po", status: "pending_approval", priority: "medium", aiConfidence: "100.00", aiReasoning: "Ops asked: order 500 kg of sugar from Acme" });
    expect(logs().at(-1)).toMatchObject({ taskId: task.id, action: "task_created", message: "Task created by Oscar Ops" });
    expect(store.rows(purchaseOrders).all()).toHaveLength(posBefore);
    expect((await ops.aiAgent.tasks.pendingApprovals()).map((t) => t.id)).toContain(task.id);
    await expect(ops.aiAgent.tasks.approve({ id: task.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Admin approves and executes through the router path.
    await admin.aiAgent.tasks.approve({ id: task.id });
    const result = await admin.aiAgent.tasks.execute({ id: task.id });
    expect(result.success).toBe(true);
    const pos = store.rows(purchaseOrders).all();
    expect(pos).toHaveLength(posBefore + 1);
    const po = pos.at(-1)!;
    expect(po).toMatchObject({ vendorId: acme.id, status: "draft", subtotal: "750.00", totalAmount: "750.00", notes: "From command bar" });
    expect(po.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);
    const expected = new Date(); expected.setDate(expected.getDate() + 7); // vendor lead time
    expect(Math.abs(po.expectedDate.getTime() - expected.getTime())).toBeLessThan(5000);
    expect(result.result).toEqual({ purchaseOrderId: po.id, poNumber: po.poNumber, expectedDate: po.expectedDate.toISOString(), totalAmount: "750.00" });

    const item = store.rows(purchaseOrderItems).all().at(-1)!;
    expect(item).toMatchObject({ purchaseOrderId: po.id, description: "Cane Sugar", quantity: "500", unitPrice: "1.50", totalAmount: "750.00" });
    expect(item.productId ?? null).toBeNull(); // never a raw-material id in the product FK
    // The router path links the line to the material through the junction, as the scheduler does.
    expect(db.createPurchaseOrderRawMaterialLink).toHaveBeenCalledWith({ purchaseOrderItemId: item.id, rawMaterialId: sugar.id, orderedQuantity: "500", unit: "kg" });
    expect(store.rows(purchaseOrderRawMaterials).all().at(-1)).toMatchObject({ purchaseOrderItemId: item.id, rawMaterialId: sugar.id, orderedQuantity: "500", unit: "kg", status: "ordered" });
    expect(store.rows(rawMaterials).get(sugar.id)).toMatchObject({ quantityOnOrder: "500", receivingStatus: "ordered", lastPoId: po.id });
    expect(store.rows(aiAgentTasks).get(task.id)).toMatchObject({ status: "completed" });

    // ...and the approver (admin 1) is notified of the completion.
    expect(db.createNotification).toHaveBeenCalledTimes(1);
    expect(db.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, type: "success", entityType: "ai_agent_task", entityId: task.id, link: "/ai/approvals",
      title: "AI task completed: generate po", message: `Task #${task.id} created draft purchase order ${po.poNumber}.`,
    }));
    expect(store.rows(notifications).filter((n) => n.entityId === task.id)).toHaveLength(1);
  });

  it("6. the scheduler fails a generate_po task that names no vendor instead of buying from vendor 1", async () => {
    const orphan = store.rows(aiAgentTasks).insert({
      taskType: "generate_po", status: "approved", priority: "medium", requiresApproval: true, retryCount: 0, approvedBy: 1,
      taskData: JSON.stringify({ materials: [{ id: sugar.id, name: "Cane Sugar", quantity: "10", unitCost: "1.50", unit: "kg" }], totalValue: 15 }),
    });
    const posBefore = store.rows(purchaseOrders).all().length;

    const run = await executeApprovedTasks();
    expect(run).toEqual({ executed: 0, failed: 1, errors: [`Task ${orphan.id} failed: PO generation task has no vendorId — select a vendor for this task before approving it`] });

    expect(store.rows(purchaseOrders).all()).toHaveLength(posBefore); // nothing ordered from vendor 1 (Acme)
    expect(store.rows(aiAgentTasks).get(orphan.id)).toMatchObject({ status: "failed", errorMessage: expect.stringContaining("no vendorId") });
    expect(logs().at(-1)).toMatchObject({ taskId: orphan.id, action: "task_executed", status: "error", message: expect.stringContaining("no vendorId") });
    expect(store.rows(notifications).filter((n) => n.entityId === orphan.id)).toEqual([]);
  });
});
