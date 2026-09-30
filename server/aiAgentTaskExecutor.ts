/**
 * AI agent task executor — the ONE place an approved `aiAgentTasks` row is
 * turned into side effects.
 *
 * Two callers share it: the manual path (`aiAgent.tasks.execute` /
 * `approveAndExecute` in routers/aiAgent.ts, an admin clicking Execute) and the
 * background path (`executeApprovedTasks` in aiAgentScheduler.ts, every
 * 15 min). They used to carry separate switch statements that disagreed on
 * which task types exist and which payload fields to read, so an approved task
 * could be marked failed as "Unknown task type" by the scheduler before an
 * admin ever clicked Execute.
 *
 * Contract:
 * - `claimAgentTask` is the compare-and-set that moves a task into
 *   `in_progress`. Whoever gets 1 affected row runs the task; the other caller
 *   gets 0 and skips. Call it before `executeAgentTask`.
 * - `executeAgentTask` performs the task's side effects and reports an
 *   outcome. It never throws for a task-level failure; callers persist the
 *   status/result/log/notification and the project-task write-back.
 * - Every `taskType` in the enum is handled. Types with no automation yet
 *   succeed as an explicit no-op with `data.note`, never "Unknown task type".
 * - Payload fields accept both spellings the two legacy paths used
 *   (`vendorId` or `vendorEmail`, `to` or `recipientEmail`,
 *   `subject` or `emailSubject`, `body` or `emailBody`).
 * - Company scope: `task.companyId` is the tenancy of the task. A scoped task
 *   only reads rows in that company (any other row is "not found in this
 *   company" and nothing is written) and every row it creates is stamped with
 *   it. A task with no company runs globally, as before.
 * - A send that the provider reports as failed (`success: false` /
 *   `emailSent: false`) fails the task; it is never a completed task. For a
 *   multi-recipient send, all-failed fails the task and a partial failure
 *   succeeds with `data.failed` and `data.note`.
 */
import { randomInt } from "node:crypto";
import type { AiAgentTask } from "../drizzle/schema";
import * as db from "./db";
import { sendEmail, formatEmailHtml, type EmailResult } from "./_core/email";
import { scopeAllows, type Scope } from "./_core/scope";
import { processEmailReply } from "./emailReplyService";
import { createProjectTaskFromSource } from "./taskAgentBridge";

export type AgentTaskStatus = AiAgentTask["status"];
export type AgentTaskType = AiAgentTask["taskType"];

// `data` is what gets persisted as executionResult and returned to the client
// (`tasks.execute().result`); its shape is per task type, so it stays loose.
export type AgentTaskExecutionData = Record<string, any>;

export type AgentTaskExecutionOutcome =
  | { success: true; data: AgentTaskExecutionData }
  | { success: false; error: string };

export interface ExecuteAgentTaskOptions {
  /** User id running the task (the admin who clicked Execute). Absent for the scheduler. */
  executedBy?: number;
  /** Display name of that user, used as the email sender name fallback. */
  executedByName?: string;
}

/** Task types that are accepted into the queue but have no automation behind them yet. */
export const NO_EXECUTOR_TASK_TYPES: readonly AgentTaskType[] = [
  "send_quote_request",
  "create_shipment",
  "generate_invoice",
  "reconcile_payment",
];

/** Message carried in `data.note` for a task type that has no automated executor. */
export function noExecutorNote(taskType: string): string {
  return `Task type "${taskType}" has no automated executor yet; the task was marked complete without side effects. Carry it out manually.`;
}

// Same shape as routers/_shared.generateNumber (`PO-2609-0421`). Copied rather
// than imported so a service module does not depend on the router layer.
function generateNumber(prefix: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const random = randomInt(10000).toString().padStart(4, "0");
  return `${prefix}-${year}${month}-${random}`;
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

/**
 * Atomically move a task from `from` (default `approved`) to `in_progress`.
 * Returns false when the row was not in `from` any more — another executor
 * claimed it first, or it was rejected/cancelled meanwhile — in which case the
 * caller must not run it.
 *
 * `updateAiAgentTask` reports the affected-row count; a stub that does not
 * implement the guard resolves to `undefined`, which is deliberately not
 * treated as a lost race (only an explicit 0 is).
 */
export async function claimAgentTask(
  taskId: number,
  from: AgentTaskStatus = "approved",
  extra: Partial<{ approvedBy: number; approvedAt: Date }> = {},
): Promise<boolean> {
  const affected = await db.updateAiAgentTask(
    taskId,
    { status: "in_progress", executedAt: new Date(), ...extra },
    { onlyIfStatus: from },
  );
  return affected !== 0;
}

// ---------------------------------------------------------------------------
// Company scope
// ---------------------------------------------------------------------------

/** What a handler needs from the task row besides its payload. */
interface TaskContext {
  task: AiAgentTask;
  /** Rows visible to this task: the task's company, or everything for a task with no company. */
  scope: Scope;
  /** Spread into every insert: `{ companyId }` for a scoped task, `{}` for a global one. */
  stamp: { companyId?: number };
}

function taskContext(task: AiAgentTask): TaskContext {
  const companyId = task.companyId;
  return companyId != null
    ? { task, scope: { mode: "entity", companyIds: [companyId] }, stamp: { companyId } }
    : { task, scope: { mode: "global", companyIds: "all" }, stamp: {} };
}

/**
 * A row read by id must exist and be visible under the task's scope, else the
 * task fails before anything is written. For a scoped task a missing row and
 * another company's row get the same message (a scoped db lookup such as
 * `getVendorById(id, scope)` cannot tell them apart either), and it says
 * "not found" rather than "forbidden": confirming another company's row
 * exists would leak it.
 */
function requireInScope<T extends { companyId?: number | null }>(
  ctx: TaskContext,
  row: T | null | undefined,
  label: string,
): T {
  const scoped = ctx.scope.companyIds !== "all";
  if (!row) throw new Error(scoped ? `${label} not found in this company` : `${label} not found`);
  if (!scopeAllows(ctx.scope, row.companyId)) throw new Error(`${label} not found in this company`);
  return row;
}

/**
 * Scope check for a row the handler only references by id (never reads
 * otherwise). A global task skips the lookup, keeping its behaviour unchanged.
 */
async function assertInScope(
  ctx: TaskContext,
  label: string,
  fetch: () => Promise<{ companyId?: number | null } | null | undefined>,
): Promise<void> {
  if (ctx.scope.companyIds === "all") return;
  requireInScope(ctx, await fetch(), label);
}

// ---------------------------------------------------------------------------
// Send results
// ---------------------------------------------------------------------------

/** A single send either succeeded or fails the task with the provider's reason. */
function requireSent(result: Pick<EmailResult, "success" | "error">, what: string): void {
  if (!result.success) throw new Error(`${what} was not sent: ${result.error || "email provider reported a failure"}`);
}

/**
 * Outcome fields for a multi-recipient send: all failed → the task fails;
 * some failed → `failed` + `note` for the reader; none failed → nothing extra.
 */
function multiSendReport<F>(
  what: string,
  attempted: number,
  failed: F[],
  errorOf: (f: F) => string,
): { failed?: F[]; note?: string } {
  if (failed.length === 0) return {};
  if (failed.length >= attempted) {
    const reasons = Array.from(new Set(failed.map(errorOf))).join("; ");
    throw new Error(`No ${what} was sent (${failed.length} of ${attempted} failed): ${reasons}`);
  }
  return { failed, note: `${failed.length} of ${attempted} ${what}s failed to send; see \`failed\`.` };
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

type TaskData = Record<string, any>;

function parseTaskData(raw: string | null | undefined): TaskData | null {
  if (raw == null || raw === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

/** First non-empty value among the accepted spellings of a payload field. */
function pick<T = any>(data: TaskData, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const v = data[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

const toPositiveInt = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export async function executeAgentTask(
  task: AiAgentTask,
  opts: ExecuteAgentTaskOptions = {},
): Promise<AgentTaskExecutionOutcome> {
  const taskData = parseTaskData(task.taskData);
  if (!taskData) return { success: false, error: "Task data is not valid JSON" };

  try {
    const data = await runTaskType(taskContext(task), taskData, opts);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message ? String(err.message) : String(err) };
  }
}

async function runTaskType(
  ctx: TaskContext,
  taskData: TaskData,
  opts: ExecuteAgentTaskOptions,
): Promise<AgentTaskExecutionData> {
  const { task } = ctx;
  const taskType = task.taskType as AgentTaskType;
  switch (taskType) {
    case "generate_po":
      return executeGeneratePo(ctx, taskData);
    case "send_rfq":
      return executeSendRfq(ctx, taskData);
    case "send_email":
      return executeSendEmail(taskData);
    case "vendor_followup":
      return executeVendorFollowup(ctx, taskData);
    case "reorder_materials":
      return executeWorkOrderFromBom(ctx, taskData, { withMaterials: true });
    case "create_work_order":
      return executeWorkOrderFromBom(ctx, taskData, { withMaterials: false });
    case "update_inventory":
      return executeUpdateInventory(ctx, taskData);
    case "reply_email":
      return executeReplyEmail(taskData, opts);
    case "approve_po":
      return executeApprovePo(ctx, taskData);
    case "approve_invoice":
      return executeApproveInvoice(ctx, taskData);
    case "create_vendor":
      return executeCreateVendor(ctx, taskData);
    case "create_material":
      return executeCreateMaterial(ctx, taskData);
    case "create_product":
      return executeCreateProduct(ctx, taskData);
    case "create_bom":
      return executeCreateBom(ctx, taskData);
    case "create_customer":
      return executeCreateCustomer(ctx, taskData);
    case "create_crm_deal":
      return executeCreateCrmDeal(ctx, taskData);
    case "concierge_errand":
      return executeConciergeErrand(task);
    case "ingredient_rfq":
    case "invoice_price_review":
      return executeIngredientRfq(taskData);
    case "query":
      return executeQuery(task, taskData, opts);
    case "send_quote_request":
    case "create_shipment":
    case "generate_invoice":
    case "reconcile_payment":
      return { executed: false, noop: true, taskType, note: noExecutorNote(taskType) };
    default: {
      // Exhaustiveness: a new enum value must be routed above.
      const unhandled: never = taskType;
      throw new Error(`Unsupported task type: ${String(unhandled)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-type handlers
// ---------------------------------------------------------------------------

/**
 * Two payload shapes reach generate_po:
 * - rule-generated (scheduler): `{ vendorId, materials: [{ id, name, quantity, unitCost, unit }], totalValue }`
 *   → one draft PO with a line per material, vendor is mandatory.
 * - request-generated (command bar / chat): `{ rawMaterialId | rawMaterialName, vendorId?, quantity, unitCost?, notes? }`
 *   → one draft PO for one material; the vendor falls back to the material's
 *   preferred vendor and the material's on-order quantity is bumped.
 */
async function executeGeneratePo(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  if (Array.isArray(taskData.materials)) return executeBulkPoGeneration(ctx, taskData);

  let material: Awaited<ReturnType<typeof db.getRawMaterialById>> | null = null;
  if (taskData.rawMaterialId) {
    material = requireInScope(ctx, await db.getRawMaterialById(taskData.rawMaterialId), `Raw material #${taskData.rawMaterialId}`);
  } else if (taskData.rawMaterialName) {
    const wanted = String(taskData.rawMaterialName).toLowerCase();
    const allMaterials = await db.getRawMaterials();
    material = allMaterials
      .filter((m) => scopeAllows(ctx.scope, m.companyId))
      .find((m) => m.name?.toLowerCase().includes(wanted) || m.sku?.toLowerCase() === wanted) || null;
  }

  let vendor: Awaited<ReturnType<typeof db.getVendorById>> | null = null;
  let vendorId: number | undefined = toPositiveInt(taskData.vendorId);
  if (vendorId) {
    vendor = requireInScope(ctx, await db.getVendorById(vendorId, ctx.scope), `Vendor #${vendorId}`);
  } else if (material?.preferredVendorId) {
    // A preferred vendor outside the task's company is simply not a candidate.
    const preferred = await db.getVendorById(material.preferredVendorId, ctx.scope);
    if (preferred && scopeAllows(ctx.scope, preferred.companyId)) {
      vendor = preferred;
      vendorId = preferred.id;
    }
  }
  if (!vendorId) {
    // `needs_vendor` is not a valid aiAgentTasks.status, so this surfaces as a
    // failure with an actionable message instead of a status the DB rejects.
    throw new Error(
      `PO generation requires vendor selection for ${material?.name || taskData.rawMaterialName || "material"} — add a vendorId to the task and re-approve it`,
    );
  }

  const leadDays = vendor?.defaultLeadTimeDays || material?.leadTimeDays || 14;
  const expectedDate = new Date();
  expectedDate.setDate(expectedDate.getDate() + leadDays);

  const unitCost = parseFloat(taskData.unitCost || material?.unitCost || "0");
  const quantity = parseFloat(taskData.quantity || "0");
  const subtotal = unitCost * quantity;
  const totalAmount = subtotal;
  const poNumber = generateNumber("PO");

  const po = await db.createPurchaseOrder({
    ...ctx.stamp,
    poNumber,
    vendorId,
    orderDate: new Date(),
    expectedDate,
    notes: taskData.notes || `AI-generated PO for ${material?.name || "materials"}`,
    subtotal: subtotal.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    status: "draft",
  });

  // `material.id` is a rawMaterials id (purchaseOrderItems.productId references
  // products), so the line carries no productId and is linked to the material
  // through purchaseOrderRawMaterials — the same shape purchaseOrders.create produces.
  // Neither line table carries a company column (both are scope-exempt).
  if (material) {
    const poItem = await db.createPurchaseOrderItem({
      purchaseOrderId: po.id,
      description: material.name,
      quantity: quantity.toString(),
      unitPrice: unitCost.toFixed(2),
      totalAmount: subtotal.toFixed(2),
    });
    await db.createPurchaseOrderRawMaterialLink({
      purchaseOrderItemId: poItem.id,
      rawMaterialId: material.id,
      orderedQuantity: quantity.toString(),
      unit: material.unit || "EA",
    });
    await db.updateRawMaterial(material.id, {
      quantityOnOrder: (parseFloat(material.quantityOnOrder?.toString() || "0") + quantity).toString(),
      receivingStatus: "ordered",
      expectedDeliveryDate: expectedDate,
      lastPoId: po.id,
    });
  }

  return { purchaseOrderId: po.id, poNumber, expectedDate: expectedDate.toISOString(), totalAmount: totalAmount.toFixed(2) };
}

async function executeBulkPoGeneration(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const { materials, totalValue } = taskData as { materials: TaskData[]; totalValue?: number | string };
  // A task without a vendor cannot be turned into an order for anyone: fail it
  // so a person picks the vendor, instead of quietly buying from vendor 1.
  const vendorId = Number(taskData.vendorId) || null;
  if (!vendorId) {
    throw new Error("PO generation task has no vendorId — select a vendor for this task before approving it");
  }
  await assertInScope(ctx, `Vendor #${vendorId}`, () => db.getVendorById(vendorId, ctx.scope));
  for (const material of materials) {
    if (material.id) await assertInScope(ctx, `Raw material #${material.id}`, () => db.getRawMaterialById(material.id));
  }

  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
  const po = await db.createPurchaseOrder({
    ...ctx.stamp,
    poNumber,
    vendorId,
    status: "draft",
    orderDate: new Date(),
    subtotal: totalValue?.toString() || "0",
    totalAmount: totalValue?.toString() || "0",
    currency: "USD",
    notes: `Auto-generated by AI Agent. Task ID: ${ctx.task.id}`,
  });

  for (const material of materials) {
    const qty = parseFloat(material.quantity || "1") || 1;
    const price = parseFloat(material.unitCost || "0") || 0;
    const item = await db.createPurchaseOrderItem({
      purchaseOrderId: po.id,
      productId: null,
      description: material.name,
      quantity: qty.toString(),
      unitPrice: price.toString(),
      totalAmount: (qty * price).toString(),
    });
    if (material.id) {
      await db.createPurchaseOrderRawMaterialLink({
        purchaseOrderItemId: item.id,
        rawMaterialId: material.id,
        orderedQuantity: qty.toString(),
        unit: material.unit || "EA",
        unitCost: price.toString(),
      });
    }
  }

  return { poId: po.id, poNumber };
}

/**
 * `{ rawMaterialId?, vendorIds: number[], quantity, requiredDate? }` emails
 * each vendor a quote request; `{ rfqId }` (freight RFQ from the rule engine)
 * marks that RFQ sent. A payload can carry both.
 */
async function executeSendRfq(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const vendorIds: number[] = Array.isArray(taskData.vendorIds) ? taskData.vendorIds : [];
  const rfqId = toPositiveInt(taskData.rfqId);
  if (vendorIds.length === 0 && !rfqId) {
    throw new Error("RFQ task has neither vendorIds nor an rfqId to send");
  }

  const emailsSent: string[] = [];
  let report: { failed?: { vendorId: number; email: string; error: string }[]; note?: string } = {};
  if (vendorIds.length > 0) {
    const material = taskData.rawMaterialId
      ? requireInScope(ctx, await db.getRawMaterialById(taskData.rawMaterialId), `Raw material #${taskData.rawMaterialId}`)
      : null;
    const vendorsForRfq = await db.getVendorsByIds(vendorIds);
    for (const vendor of vendorsForRfq) requireInScope(ctx, vendor, `Vendor #${vendor.id}`);
    const reachable = vendorsForRfq.filter((vendor) => vendor.email);
    if (reachable.length === 0) {
      throw new Error("None of the selected vendors has an email address to send the RFQ to");
    }
    const results = await Promise.all(
      reachable.map(async (vendor) => {
        const email = vendor.email!;
        const result = await sendEmail({
          to: email,
          subject: `Request for Quote: ${material?.name || "Materials"}`,
          html: `
            <p>Dear ${vendor.contactName || vendor.name},</p>
            <p>We are requesting a quote for the following:</p>
            <ul>
              <li><strong>Material:</strong> ${material?.name || "Various materials"}</li>
              <li><strong>SKU:</strong> ${material?.sku || "N/A"}</li>
              <li><strong>Quantity:</strong> ${taskData.quantity} ${material?.unit || "units"}</li>
              <li><strong>Required By:</strong> ${taskData.requiredDate || "ASAP"}</li>
            </ul>
            <p>Please reply with your best price and lead time.</p>
            <p>Best regards,<br/>Procurement Team</p>
          `,
        });
        return { vendorId: vendor.id, email, result };
      }),
    );
    const failed = results
      .filter((r) => !r.result.success)
      .map((r) => ({ vendorId: r.vendorId, email: r.email, error: r.result.error || "email provider reported a failure" }));
    report = multiSendReport("RFQ email", reachable.length, failed, (f) => f.error);
    emailsSent.push(...results.filter((r) => r.result.success).map((r) => r.email));
  }

  if (rfqId) {
    await assertInScope(ctx, `Freight RFQ #${rfqId}`, () => db.getFreightRfqById(rfqId));
    await db.updateFreightRfq(rfqId, { status: "sent" });
  }

  return {
    rfqSent: true,
    vendorCount: vendorIds.length,
    emailsSent,
    ...report,
    ...(rfqId ? { rfqId, status: "sent" } : {}),
  };
}

async function executeSendEmail(taskData: TaskData): Promise<AgentTaskExecutionData> {
  const to = pick<string>(taskData, "to", "recipientEmail");
  if (!to) throw new Error("Email task has no recipient (to / recipientEmail)");
  const emailResult = await sendEmail({
    to,
    subject: pick<string>(taskData, "subject", "emailSubject") || "",
    html: pick<string>(taskData, "body", "content", "emailBody") || "",
  });
  requireSent(emailResult, `Email to ${to}`);
  return { emailSent: true, messageId: emailResult.messageId };
}

/** Vendor resolved from `vendorId` when present, else the stored `vendorEmail`. */
async function executeVendorFollowup(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const vendorId = toPositiveInt(taskData.vendorId);
  const vendor = vendorId ? requireInScope(ctx, await db.getVendorById(vendorId, ctx.scope), `Vendor #${vendorId}`) : null;
  const vendorEmail = vendor?.email || pick<string>(taskData, "vendorEmail");
  if (!vendorEmail) throw new Error("Vendor email not found");
  const poNumber = taskData.poNumber;
  const body = pick<string>(taskData, "body", "emailBody");
  const emailResult = await sendEmail({
    to: vendorEmail,
    subject: pick<string>(taskData, "subject", "emailSubject") || `Follow-up: ${poNumber || "Order Status"}`,
    html: body ? formatEmailHtml(body) : `
      <p>Dear ${vendor?.contactName || vendor?.name || "Supplier"},</p>
      <p>We are following up on ${poNumber ? `PO ${poNumber}` : "our recent order"}.</p>
      <p>Could you please provide an update on the status and expected delivery date?</p>
      <p>Best regards,<br/>Procurement Team</p>
    `,
  });
  requireSent(emailResult, `Follow-up email to ${vendorEmail}`);
  return { emailSent: true, messageId: emailResult.messageId, vendorEmail };
}

async function executeWorkOrderFromBom(
  ctx: TaskContext,
  taskData: TaskData,
  { withMaterials }: { withMaterials: boolean },
): Promise<AgentTaskExecutionData> {
  const bom = requireInScope(ctx, taskData.bomId ? await db.getBomById(taskData.bomId) : null, `BOM #${taskData.bomId ?? "?"}`);

  const workOrder = await db.createWorkOrder({
    ...ctx.stamp,
    bomId: bom.id,
    productId: bom.productId,
    quantity: taskData.quantity?.toString() || "1",
    status: "draft",
    priority: taskData.priority || "medium",
    notes: taskData.notes || `AI-generated work order for ${bom.name}`,
  });

  if (!withMaterials) {
    return { created: true, workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber };
  }

  // workOrderMaterials is scope-exempt (no company column); it hangs off the stamped work order.
  const components = await db.getBomComponents(bom.id);
  for (const comp of components) {
    const requiredQty = parseFloat(comp.quantity?.toString() || "0") * parseFloat(taskData.quantity || "1");
    await db.createWorkOrderMaterial({
      workOrderId: workOrder.id,
      rawMaterialId: comp.rawMaterialId || undefined,
      productId: comp.productId || undefined,
      name: comp.name,
      requiredQuantity: requiredQty.toString(),
      unit: comp.unit || "EA",
      status: "pending",
    });
  }
  return { workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber, materialsCount: components.length };
}

async function executeUpdateInventory(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  if (taskData.rawMaterialId) {
    requireInScope(ctx, await db.getRawMaterialById(taskData.rawMaterialId), `Raw material #${taskData.rawMaterialId}`);
    await db.upsertRawMaterialInventory(taskData.rawMaterialId, taskData.warehouseId || 1, {
      quantity: taskData.quantity?.toString(),
      ...ctx.stamp,
    });
  }
  return { updated: true };
}

/**
 * `{ to | recipientEmail, originalSubject?, originalBody?, emailId?, generateWithAI?, body | content?, subject? }`.
 * The reply is drafted by the LLM unless the task says `generateWithAI: false`
 * or (flag absent) already carries a pre-written body.
 */
async function executeReplyEmail(taskData: TaskData, opts: ExecuteAgentTaskOptions): Promise<AgentTaskExecutionData> {
  const to = pick<string>(taskData, "to", "recipientEmail");
  if (!to) throw new Error("Reply task has no recipient (to / recipientEmail)");
  const preWritten = pick<string>(taskData, "body", "content", "emailBody");
  const generateWithAI = typeof taskData.generateWithAI === "boolean" ? taskData.generateWithAI : !preWritten;

  if (generateWithAI) {
    const emailReplyResult = await processEmailReply({
      originalEmail: {
        from: to,
        subject: taskData.originalSubject || "Your inquiry",
        body: taskData.originalBody || "",
        emailId: taskData.emailId,
      },
      autoSend: true,
      companyName: taskData.companyName || "Our Company",
      senderName: taskData.senderName || opts.executedByName,
      senderTitle: taskData.senderTitle,
    });
    // `emailSent: false` with no error means the provider is not configured, so
    // processEmailReply generated the draft but never attempted the send.
    requireSent(
      { success: emailReplyResult.emailSent === true, error: emailReplyResult.error || "email is not configured, the drafted reply was not sent" },
      `AI-drafted reply to ${to}`,
    );
    return {
      emailSent: true,
      messageId: emailReplyResult.messageId,
      to,
      generatedReply: emailReplyResult.generatedReply,
      aiGenerated: true,
    };
  }

  const replyResult = await sendEmail({
    to,
    subject: pick<string>(taskData, "subject", "emailSubject") || `Re: ${taskData.originalSubject || "Your inquiry"}`,
    html: formatEmailHtml(preWritten || ""),
  });
  requireSent(replyResult, `Reply to ${to}`);
  return { emailSent: true, messageId: replyResult.messageId, to, aiGenerated: false };
}

async function executeApprovePo(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const po = requireInScope(ctx, await db.getPurchaseOrderById(taskData.purchaseOrderId), `Purchase order #${taskData.purchaseOrderId}`);
  await db.updatePurchaseOrder(po.id, { status: "confirmed" });
  return { approved: true, poId: po.id, poNumber: po.poNumber };
}

async function executeApproveInvoice(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const invoice = requireInScope(ctx, await db.getInvoiceById(taskData.invoiceId), `Invoice #${taskData.invoiceId}`);
  await db.updateInvoice(invoice.id, { status: "sent" });
  return { approved: true, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
}

async function executeCreateVendor(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const vendor = await db.createVendor({
    ...ctx.stamp,
    name: taskData.name,
    email: taskData.email || undefined,
    phone: taskData.phone || undefined,
    address: taskData.address || undefined,
    defaultLeadTimeDays: taskData.leadTimeDays || undefined,
    status: "active",
  });
  return { created: true, vendorId: vendor.id, vendorName: taskData.name };
}

async function executeCreateMaterial(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const material = await db.createRawMaterial({
    ...ctx.stamp,
    name: taskData.name,
    sku: taskData.sku || undefined,
    unit: taskData.unit || "units",
    category: taskData.category || undefined,
    unitCost: taskData.unitCost || undefined,
    description: taskData.description || undefined,
  });
  return { created: true, materialId: material.id, materialName: taskData.name };
}

async function executeCreateProduct(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const product = await db.createProduct({
    ...ctx.stamp,
    name: taskData.name,
    // products.sku is NOT NULL — generate one when the task didn't supply it
    sku: taskData.sku || generateNumber("PROD"),
    category: taskData.category || undefined,
    unitPrice: taskData.price || taskData.unitPrice || undefined,
    description: taskData.description || undefined,
  });
  return { created: true, productId: product.id, productName: taskData.name };
}

async function executeCreateBom(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  await assertInScope(ctx, `Product #${taskData.productId}`, () => db.getProductById(taskData.productId));
  const bom = await db.createBom({
    ...ctx.stamp,
    productId: taskData.productId,
    name: taskData.name,
    batchSize: taskData.batchSize || undefined,
    batchUnit: taskData.batchUnit || undefined,
    notes: taskData.notes || undefined,
  });
  return { created: true, bomId: bom.id, bomName: taskData.name };
}

async function executeCreateCustomer(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  const customer = await db.createCustomer({
    ...ctx.stamp,
    name: taskData.name,
    email: taskData.email || undefined,
    phone: taskData.phone || undefined,
    address: taskData.address || undefined,
    type: taskData.type || "business",
  });
  return { created: true, customerId: customer.id, customerName: taskData.name };
}

async function executeCreateCrmDeal(ctx: TaskContext, taskData: TaskData): Promise<AgentTaskExecutionData> {
  // The deal is titled after the contact's organization.
  const contact = requireInScope(ctx, taskData.contactId ? await db.getCrmContactById(taskData.contactId) : null, `CRM contact #${taskData.contactId ?? "?"}`);
  const company = (contact.organization || "").trim();
  if (!company) throw new Error(`Cannot create deal: contact "${contact.fullName}" has no company set`);

  // Re-check duplicates at execution time in case another deal was approved
  // for the same company while this one was waiting. A same-named deal in
  // another entity is not a duplicate of this one (and must not be revealed).
  const existing = await db.findCrmDealByCompany(company);
  if (existing && scopeAllows(ctx.scope, existing.companyId)) {
    throw new Error(`A deal already exists for company "${company}" (deal #${existing.id})`);
  }
  // crmPipelines is scope-exempt (shared across entities), so pipelineId is not checked.
  if (!taskData.pipelineId) throw new Error("Pipeline required to create CRM deal");

  const dealId = await db.createCrmDeal({
    ...ctx.stamp,
    pipelineId: taskData.pipelineId,
    contactId: taskData.contactId,
    name: company,
    stage: taskData.stage || "discovery",
    amount: taskData.amount || undefined,
    source: taskData.source || undefined,
    notes: taskData.notes || undefined,
    assignedTo: taskData.assignedTo || undefined,
  });
  return { created: true, dealId, dealName: company };
}

/** Replay the approved plan through the main AI agent loop. */
async function executeConciergeErrand(task: AiAgentTask): Promise<AgentTaskExecutionData> {
  const { executeConciergeErrand: run } = await import("./conciergeErrandService");
  const errandResult = await run(task);
  if (!errandResult.success) throw new Error(errandResult.error || "Errand execution failed");
  return (errandResult.data ?? {}) as AgentTaskExecutionData;
}

/**
 * Re-quote ingredients whose cost spiked, then send every pending RFQ to its
 * vendors. `sendIngredientRfqToVendors` throws per request rather than
 * reporting per vendor, so a request is the unit of success here: every
 * request failing fails the task, some failing is reported in `failed`.
 */
async function executeIngredientRfq(taskData: TaskData): Promise<AgentTaskExecutionData> {
  const [ingredientQuoteService, manufacturingDb] = await Promise.all([
    import("./ingredientQuoteService"),
    import("./db/manufacturing"),
  ]);
  const result = await ingredientQuoteService.monitorIngredientCosts({
    priceSpikePct: taskData.thresholdPct || 15,
  });
  const requests = await manufacturingDb.getIngredientQuoteRequests({ status: "pending" });
  let rfqsSent = 0;
  const failed: { quoteRequestId: number; error: string }[] = [];
  for (const qr of requests) {
    try {
      await ingredientQuoteService.sendIngredientRfqToVendors(qr.id);
      rfqsSent++;
    } catch (err: any) {
      failed.push({ quoteRequestId: qr.id, error: err?.message ? String(err.message) : String(err) });
    }
  }
  const report = multiSendReport("ingredient RFQ", requests.length, failed, (f) => f.error);
  return { ...result, rfqsSent, ...report };
}

/**
 * Generic "query" tasks can carry a structured action. The meeting extractor
 * uses action=create_project_task to route a Fireflies action item through the
 * Approval Queue; executing the approved suggestion creates the real project
 * task here, preserving the meeting source so it keeps its "Meeting" badge.
 */
async function executeQuery(task: AiAgentTask, taskData: TaskData, opts: ExecuteAgentTaskOptions): Promise<AgentTaskExecutionData> {
  if (taskData.action !== "create_project_task") {
    return {
      executed: false,
      noop: true,
      taskType: task.taskType,
      note: taskData.action
        ? `Query action "${taskData.action}" has no automated executor yet; the task was marked complete without side effects.`
        : noExecutorNote(task.taskType),
    };
  }

  // taskData is untrusted JSON — validate every field before use.
  const projectId = toPositiveInt(taskData.projectId);
  const name = taskData.name ? String(taskData.name).trim() : "";
  if (!projectId || !name) throw new Error("Project task suggestion missing or invalid projectId or name");
  const assigneeId = toPositiveInt(taskData.assigneeId);
  // Keep the source ref pair consistent: both derive from meetingId.
  const meetingRefId = toPositiveInt(taskData.sourceMeeting?.meetingId);
  const priority = (["low", "medium", "high", "critical"] as const).includes(taskData.priority)
    ? taskData.priority
    : "medium";
  let dueDate: Date | undefined;
  if (taskData.dueDate) {
    const parsed = new Date(taskData.dueDate);
    if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
  }
  const aiConfidenceNum = task.aiConfidence != null && Number.isFinite(Number(task.aiConfidence))
    ? Number(task.aiConfidence)
    : undefined;
  const created = await createProjectTaskFromSource({
    projectId,
    name,
    description: taskData.description ? String(taskData.description) : undefined,
    assigneeId,
    priority,
    dueDate,
    sourceType: "meeting",
    sourceRefType: meetingRefId ? "firefliesMeeting" : undefined,
    sourceRefId: meetingRefId,
    sourceExternalId: taskData.sourceExternalId ? String(taskData.sourceExternalId) : undefined,
    aiReasoning: task.aiReasoning ?? undefined,
    aiConfidence: aiConfidenceNum,
    createdBy: opts.executedBy ?? task.approvedBy ?? undefined,
  });
  return { created: true, action: "create_project_task", projectTaskId: created.id, projectId, assigneeId: assigneeId ?? null };
}
