import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiAgentTasks, type AiAgentTask } from "../drizzle/schema";

// Every db.ts helper the executor can reach, stubbed with a plausible row so
// each task type can run to completion. Writes are recorded on the mocks.
vi.mock("./db", () => ({
  updateAiAgentTask: vi.fn(async () => 1),
  getRawMaterialById: vi.fn(async (id: number) => ({ id, name: "Flour", sku: "FLR", unit: "kg", unitCost: "2.50", preferredVendorId: 9, quantityOnOrder: "0", leadTimeDays: 5 })),
  getRawMaterials: vi.fn(async () => [{ id: 1, name: "Flour", sku: "FLR", unit: "kg", unitCost: "2.50", preferredVendorId: 9, quantityOnOrder: "0" }]),
  getVendorById: vi.fn(async (id: number) => ({ id, name: "Acme", contactName: "Sam", email: `vendor${id}@acme.test`, defaultLeadTimeDays: 7 })),
  getVendorsByIds: vi.fn(async (ids: number[]) => ids.map((id) => ({ id, name: `Vendor ${id}`, email: `vendor${id}@acme.test` }))),
  createPurchaseOrder: vi.fn(async () => ({ id: 100 })),
  createPurchaseOrderItem: vi.fn(async () => ({ id: 200 })),
  createPurchaseOrderRawMaterialLink: vi.fn(async () => ({ id: 300 })),
  updateRawMaterial: vi.fn(async () => undefined),
  updateFreightRfq: vi.fn(async () => ({ success: true })),
  getBomById: vi.fn(async (id: number) => ({ id, productId: 4, name: "Bread" })),
  getBomComponents: vi.fn(async () => [{ rawMaterialId: 1, productId: null, name: "Flour", quantity: "2", unit: "kg" }]),
  createWorkOrder: vi.fn(async () => ({ id: 50, workOrderNumber: "WO-1" })),
  createWorkOrderMaterial: vi.fn(async () => ({ id: 60 })),
  upsertRawMaterialInventory: vi.fn(async () => undefined),
  getPurchaseOrderById: vi.fn(async (id: number) => ({ id, poNumber: "PO-1" })),
  updatePurchaseOrder: vi.fn(async () => undefined),
  getInvoiceById: vi.fn(async (id: number) => ({ id, invoiceNumber: "INV-1" })),
  updateInvoice: vi.fn(async () => undefined),
  createVendor: vi.fn(async () => ({ id: 11 })),
  createRawMaterial: vi.fn(async () => ({ id: 12 })),
  createProduct: vi.fn(async () => ({ id: 13 })),
  createBom: vi.fn(async () => ({ id: 14 })),
  createCustomer: vi.fn(async () => ({ id: 15 })),
  getCrmContactById: vi.fn(async (id: number) => ({ id, fullName: "Jo Buyer", organization: "Globex" })),
  findCrmDealByCompany: vi.fn(async () => null),
  createCrmDeal: vi.fn(async () => 77),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/email", () => ({
  sendEmail: vi.fn(async () => ({ success: true, messageId: "msg-1" })),
  formatEmailHtml: (text: string) => `<p>${text}</p>`,
}));
vi.mock("./emailReplyService", () => ({
  processEmailReply: vi.fn(async () => ({ success: true, emailSent: true, messageId: "ai-msg", generatedReply: { subject: "Re: hi", body: "Thanks" } })),
}));
vi.mock("./taskAgentBridge", () => ({
  createProjectTaskFromSource: vi.fn(async () => ({ id: 501 })),
}));
vi.mock("./conciergeErrandService", () => ({
  executeConciergeErrand: vi.fn(async () => ({ success: true, data: { summary: "Errand done", actionsRun: 2 } })),
}));
vi.mock("./ingredientQuoteService", () => ({
  monitorIngredientCosts: vi.fn(async () => ({ checked: 3, requestsCreated: 1 })),
  sendIngredientRfqToVendors: vi.fn(async () => ({ sent: 2 })),
}));
vi.mock("./db/manufacturing", () => ({
  getIngredientQuoteRequests: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
}));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import { processEmailReply } from "./emailReplyService";
import { createProjectTaskFromSource } from "./taskAgentBridge";
import { executeConciergeErrand } from "./conciergeErrandService";
import {
  executeAgentTask,
  claimAgentTask,
  NO_EXECUTOR_TASK_TYPES,
  noExecutorNote,
} from "./aiAgentTaskExecutor";

const TASK_TYPES = aiAgentTasks.taskType.enumValues;

function task(taskType: string, taskData: unknown, extra: Partial<AiAgentTask> = {}): AiAgentTask {
  return {
    id: 42,
    companyId: 1,
    taskType,
    status: "approved",
    priority: "medium",
    taskData: typeof taskData === "string" ? taskData : JSON.stringify(taskData),
    aiReasoning: "because",
    aiConfidence: "80.00",
    approvedBy: 4,
    retryCount: 0,
    ...extra,
  } as AiAgentTask;
}

/** A payload each type can execute successfully against the stubs above. */
const PAYLOADS: Record<string, unknown> = {
  generate_po: { rawMaterialId: 1, vendorId: 9, quantity: 10, unitCost: "2.50" },
  send_rfq: { rawMaterialId: 1, vendorIds: [9, 10], quantity: 10 },
  send_quote_request: { vendorId: 9 },
  send_email: { to: "a@b.test", subject: "Hi", body: "Hello" },
  update_inventory: { rawMaterialId: 1, quantity: 5 },
  create_shipment: { orderId: 1 },
  generate_invoice: { orderId: 1 },
  reconcile_payment: { paymentId: 1 },
  reorder_materials: { bomId: 3, quantity: 2 },
  vendor_followup: { vendorId: 9, poNumber: "PO-1" },
  create_work_order: { bomId: 3, quantity: 1 },
  query: { action: "create_project_task", projectId: 7, name: "Send the contract" },
  reply_email: { to: "c@d.test", body: "Pre-written reply", generateWithAI: false },
  approve_po: { purchaseOrderId: 4 },
  approve_invoice: { invoiceId: 2 },
  create_vendor: { name: "Pacific Foods", email: "sales@pacific.test" },
  create_material: { name: "Cocoa" },
  create_product: { name: "Hemp Bar" },
  create_bom: { productId: 4, name: "Bread v2" },
  create_customer: { name: "Whole Foods" },
  create_crm_deal: { contactId: 1, pipelineId: 2 },
  ingredient_rfq: { thresholdPct: 20 },
  invoice_price_review: {},
  concierge_errand: { goal: "Translate copy", submittedByUserId: 2 },
};

describe("executeAgentTask covers every taskType in the enum", () => {
  beforeEach(() => vi.clearAllMocks());

  it("the payload table covers the enum exactly (a new enum value needs a row here and a case in the executor)", () => {
    expect(Object.keys(PAYLOADS).sort()).toEqual([...TASK_TYPES].sort());
  });

  it.each(TASK_TYPES)("%s executes or completes as an explicit no-op — never 'Unknown task type'", async (taskType) => {
    const outcome = await executeAgentTask(task(taskType, PAYLOADS[taskType]), { executedBy: 1, executedByName: "Ada" });

    expect(outcome.success).toBe(true);
    if (outcome.success === false) return;
    expect(JSON.stringify(outcome)).not.toMatch(/unknown task type/i);
    if (NO_EXECUTOR_TASK_TYPES.includes(taskType)) {
      expect(outcome.data).toEqual({ executed: false, noop: true, taskType, note: noExecutorNote(taskType) });
    } else {
      expect(outcome.data.note).toBeUndefined();
    }
  });

  it("no-op types touch nothing", async () => {
    for (const taskType of NO_EXECUTOR_TASK_TYPES) {
      await executeAgentTask(task(taskType, PAYLOADS[taskType]));
    }
    for (const fn of Object.values(db)) {
      if (typeof fn === "function" && "mock" in fn) expect(fn).not.toHaveBeenCalled();
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a query with no create_project_task action completes as a no-op with a note", async () => {
    const outcome = await executeAgentTask(task("query", { action: "summarize_sales" }));
    expect(outcome).toEqual({ success: true, data: { executed: false, noop: true, taskType: "query", note: expect.stringContaining('"summarize_sales"') } });
    expect(createProjectTaskFromSource).not.toHaveBeenCalled();
  });

  it("returns a failure outcome (does not throw) when a handler throws", async () => {
    vi.mocked(db.getBomById).mockResolvedValueOnce(undefined as any);
    await expect(executeAgentTask(task("create_work_order", { bomId: 99 }))).resolves.toEqual({ success: false, error: "BOM not found" });
  });

  it("rejects malformed taskData without running anything", async () => {
    await expect(executeAgentTask(task("create_vendor", "{not json"))).resolves.toEqual({ success: false, error: "Task data is not valid JSON" });
    expect(db.createVendor).not.toHaveBeenCalled();
  });
});

describe("executeAgentTask tolerates both payload spellings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("vendor_followup: vendorId resolves the vendor's email (router spelling)", async () => {
    const outcome = await executeAgentTask(task("vendor_followup", { vendorId: 9, poNumber: "PO-7" }));
    expect(outcome).toMatchObject({ success: true, data: { emailSent: true, vendorEmail: "vendor9@acme.test" } });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "vendor9@acme.test", subject: "Follow-up: PO-7" }));
  });

  it("vendor_followup: vendorEmail / emailSubject / emailBody (scheduler spelling) send without a lookup", async () => {
    const outcome = await executeAgentTask(task("vendor_followup", { vendorEmail: "ops@acme.test", emailSubject: "Where is PO-7?", emailBody: "Line 1\nLine 2" }));
    expect(outcome).toMatchObject({ success: true, data: { emailSent: true, vendorEmail: "ops@acme.test" } });
    expect(db.getVendorById).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith({ to: "ops@acme.test", subject: "Where is PO-7?", html: "<p>Line 1\nLine 2</p>" });
  });

  it("vendor_followup: no vendor email anywhere is reported, not thrown", async () => {
    vi.mocked(db.getVendorById).mockResolvedValueOnce({ id: 9, name: "Acme", email: null } as any);
    await expect(executeAgentTask(task("vendor_followup", { vendorId: 9 }))).resolves.toEqual({ success: true, data: { emailSent: false, error: "Vendor email not found" } });
  });

  it("reply_email: `to` + generateWithAI drafts through the LLM (router spelling)", async () => {
    const outcome = await executeAgentTask(task("reply_email", { to: "c@d.test", originalSubject: "Pricing", originalBody: "How much?", generateWithAI: true }), { executedByName: "Ada" });
    expect(outcome).toMatchObject({ success: true, data: { emailSent: true, to: "c@d.test", aiGenerated: true } });
    expect(processEmailReply).toHaveBeenCalledWith(expect.objectContaining({ originalEmail: expect.objectContaining({ from: "c@d.test", subject: "Pricing" }), senderName: "Ada", autoSend: true }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reply_email: recipientEmail + pre-written body sends as-is (scheduler spelling, no flag)", async () => {
    const outcome = await executeAgentTask(task("reply_email", { recipientEmail: "c@d.test", subject: "Re: Pricing", body: "See attached" }));
    expect(outcome).toEqual({ success: true, data: { emailSent: true, messageId: "msg-1", to: "c@d.test", aiGenerated: false } });
    expect(processEmailReply).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith({ to: "c@d.test", subject: "Re: Pricing", html: "<p>See attached</p>" });
  });

  it("send_email: recipientEmail is accepted in place of `to`", async () => {
    await executeAgentTask(task("send_email", { recipientEmail: "x@y.test", emailSubject: "S", emailBody: "B" }));
    expect(sendEmail).toHaveBeenCalledWith({ to: "x@y.test", subject: "S", html: "B" });
  });

  it("send_email / reply_email without any recipient fail clearly", async () => {
    await expect(executeAgentTask(task("send_email", { subject: "S" }))).resolves.toEqual({ success: false, error: "Email task has no recipient (to / recipientEmail)" });
    await expect(executeAgentTask(task("reply_email", { body: "B" }))).resolves.toEqual({ success: false, error: "Reply task has no recipient (to / recipientEmail)" });
  });

  it("send_rfq: rfqId (freight RFQ from the rule engine) marks the RFQ sent", async () => {
    const outcome = await executeAgentTask(task("send_rfq", { rfqId: 3 }));
    expect(outcome).toEqual({ success: true, data: { rfqSent: true, vendorCount: 0, emailsSent: [], rfqId: 3, status: "sent" } });
    expect(db.updateFreightRfq).toHaveBeenCalledWith(3, { status: "sent" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("send_rfq: vendorIds email each vendor a quote request", async () => {
    const outcome = await executeAgentTask(task("send_rfq", { rawMaterialId: 1, vendorIds: [9, 10], quantity: 10 }));
    expect(outcome).toEqual({ success: true, data: { rfqSent: true, vendorCount: 2, emailsSent: ["vendor9@acme.test", "vendor10@acme.test"] } });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(db.updateFreightRfq).not.toHaveBeenCalled();
  });

  it("send_rfq: with neither vendorIds nor rfqId fails instead of silently succeeding", async () => {
    await expect(executeAgentTask(task("send_rfq", {}))).resolves.toEqual({ success: false, error: "RFQ task has neither vendorIds nor an rfqId to send" });
  });

  it("generate_po: rule-generated `materials` payload creates one multi-line draft PO", async () => {
    const outcome = await executeAgentTask(task("generate_po", {
      vendorId: 9,
      materials: [{ id: 1, name: "Flour", quantity: "50", unitCost: "2.5", unit: "kg" }, { id: 2, name: "Sugar", quantity: "10", unitCost: "1", unit: "kg" }],
      totalValue: 135,
    }));
    expect(outcome).toEqual({ success: true, data: { poId: 100, poNumber: expect.stringMatching(/^PO-[0-9A-Z]+$/) } });
    expect(db.createPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 9, status: "draft", subtotal: "135", totalAmount: "135", currency: "USD", notes: "Auto-generated by AI Agent. Task ID: 42" }));
    expect(db.createPurchaseOrderItem).toHaveBeenCalledTimes(2);
    expect(db.createPurchaseOrderRawMaterialLink).toHaveBeenNthCalledWith(2, { purchaseOrderItemId: 200, rawMaterialId: 2, orderedQuantity: "10", unit: "kg", unitCost: "1" });
    expect(db.updateRawMaterial).not.toHaveBeenCalled();
  });

  it("generate_po: rule-generated payload without a vendor fails with the actionable message", async () => {
    await expect(executeAgentTask(task("generate_po", { materials: [{ id: 1, name: "Flour", quantity: "5", unitCost: "1" }] })))
      .resolves.toEqual({ success: false, error: "PO generation task has no vendorId — select a vendor for this task before approving it" });
    expect(db.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("generate_po: single-material payload falls back to the material's preferred vendor and bumps on-order quantity", async () => {
    const outcome = await executeAgentTask(task("generate_po", { rawMaterialId: 1, quantity: 20, unitCost: "2.50", notes: "From chat" }));
    expect(outcome).toEqual({ success: true, data: { purchaseOrderId: 100, poNumber: expect.stringMatching(/^PO-\d{4}-\d{4}$/), expectedDate: expect.any(String), totalAmount: "50.00" } });
    expect(db.getVendorById).toHaveBeenCalledWith(9);
    expect(db.createPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 9, status: "draft", subtotal: "50.00", totalAmount: "50.00", notes: "From chat" }));
    expect(db.createPurchaseOrderRawMaterialLink).toHaveBeenCalledWith({ purchaseOrderItemId: 200, rawMaterialId: 1, orderedQuantity: "20", unit: "kg" });
    expect(db.updateRawMaterial).toHaveBeenCalledWith(1, expect.objectContaining({ quantityOnOrder: "20", receivingStatus: "ordered", lastPoId: 100 }));
  });

  it("generate_po: single-material payload with no vendor at all fails instead of writing an invalid status", async () => {
    vi.mocked(db.getRawMaterialById).mockResolvedValueOnce({ id: 1, name: "Flour", preferredVendorId: null } as any);
    await expect(executeAgentTask(task("generate_po", { rawMaterialId: 1, quantity: 5 })))
      .resolves.toEqual({ success: false, error: expect.stringMatching(/requires vendor selection for Flour/) });
    expect(db.updateAiAgentTask).not.toHaveBeenCalled();
    expect(db.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("query create_project_task: the executing user is the creator; the scheduler falls back to the approver", async () => {
    await executeAgentTask(task("query", PAYLOADS.query), { executedBy: 1 });
    expect(createProjectTaskFromSource).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: 7, name: "Send the contract", sourceType: "meeting", createdBy: 1, aiConfidence: 80 }));
    await executeAgentTask(task("query", PAYLOADS.query));
    expect(createProjectTaskFromSource).toHaveBeenLastCalledWith(expect.objectContaining({ createdBy: 4 }));
  });

  it("concierge_errand delegates to the errand service and surfaces its error", async () => {
    const t = task("concierge_errand", PAYLOADS.concierge_errand);
    await expect(executeAgentTask(t)).resolves.toEqual({ success: true, data: { summary: "Errand done", actionsRun: 2 } });
    expect(executeConciergeErrand).toHaveBeenCalledWith(t);
    vi.mocked(executeConciergeErrand).mockResolvedValueOnce({ success: false, error: "No photographer vendors on file" });
    await expect(executeAgentTask(t)).resolves.toEqual({ success: false, error: "No photographer vendors on file" });
  });

  it("ingredient_rfq / invoice_price_review monitor costs then send every pending RFQ", async () => {
    await expect(executeAgentTask(task("invoice_price_review", {}))).resolves.toEqual({ success: true, data: { checked: 3, requestsCreated: 1, rfqsSent: 2 } });
  });
});

describe("claimAgentTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a compare-and-set from approved to in_progress", async () => {
    await expect(claimAgentTask(5)).resolves.toBe(true);
    expect(db.updateAiAgentTask).toHaveBeenCalledWith(5, { status: "in_progress", executedAt: expect.any(Date) }, { onlyIfStatus: "approved" });
  });

  it("carries approval fields when claiming straight from pending_approval (inline approval)", async () => {
    const approvedAt = new Date("2026-09-29T10:00:00Z");
    await claimAgentTask(5, "pending_approval", { approvedBy: 1, approvedAt });
    expect(db.updateAiAgentTask).toHaveBeenCalledWith(5, { status: "in_progress", executedAt: expect.any(Date), approvedBy: 1, approvedAt }, { onlyIfStatus: "pending_approval" });
  });

  it("only one of two racing executors wins the claim, so the task runs once", async () => {
    // The first UPDATE ... WHERE status='approved' flips the row (1 row); the
    // second finds it already in_progress (0 rows).
    vi.mocked(db.updateAiAgentTask).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const t = task("create_vendor", PAYLOADS.create_vendor);

    const runIfClaimed = async () => ((await claimAgentTask(t.id)) ? executeAgentTask(t) : null);
    const [admin, scheduler] = await Promise.all([runIfClaimed(), runIfClaimed()]);

    expect(admin).toEqual({ success: true, data: { created: true, vendorId: 11, vendorName: "Pacific Foods" } });
    expect(scheduler).toBeNull();
    expect(db.createVendor).toHaveBeenCalledTimes(1);
  });

  it("treats a stub that reports no row count as claimed (only an explicit 0 loses)", async () => {
    vi.mocked(db.updateAiAgentTask).mockResolvedValueOnce(undefined as any);
    await expect(claimAgentTask(5)).resolves.toBe(true);
  });
});
