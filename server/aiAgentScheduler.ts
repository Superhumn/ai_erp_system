import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import {
  aiAgentTasks,
  aiAgentRules,
  aiAgentLogs,
  rawMaterials,
  vendors,
  purchaseOrders,
  purchaseOrderItems,
  purchaseOrderRawMaterials,
  inventory,
  freightRfqs,
  freightCarriers,
  notifications,
  users,
} from "../drizzle/schema";
import { eq, and, desc, sql, inArray, like } from "drizzle-orm";
import * as manufacturingDb from "./db/manufacturing";
import { claimAgentTask, executeAgentTask } from "./aiAgentTaskExecutor";

// ============================================
// AI AGENT SCHEDULER - Autonomous Task System
// ============================================

interface SchedulerConfig {
  checkIntervalMs: number;
  maxConcurrentTasks: number;
  autoApproveThreshold: number;
}

const defaultConfig: SchedulerConfig = {
  checkIntervalMs: 15 * 60 * 1000, // Check every 15 minutes
  maxConcurrentTasks: 5,
  autoApproveThreshold: 500, // Auto-approve POs under $500
};

// ============================================
// RULE EVALUATION ENGINE
// ============================================

interface RuleCondition {
  field: string;
  operator: "lt" | "gt" | "eq" | "lte" | "gte" | "contains";
  value: any;
}

interface RuleAction {
  type: string;
  params: Record<string, any>;
}

export async function evaluateRules(): Promise<{
  triggeredRules: number;
  tasksCreated: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) return { triggeredRules: 0, tasksCreated: 0, errors: ["Database not available"] };

  const errors: string[] = [];
  let triggeredRules = 0;
  let tasksCreated = 0;

  try {
    // Get all active rules
    const activeRules = await db
      .select()
      .from(aiAgentRules)
      .where(eq(aiAgentRules.isActive, true));

    for (const rule of activeRules) {
      try {
        // Check per-rule frequency — skip if not enough time has passed
        const freqMinutes = (rule as any).checkFrequencyMinutes || 15;
        if (rule.lastTriggeredAt) {
          const minutesSinceLastTrigger = (Date.now() - new Date(rule.lastTriggeredAt).getTime()) / (1000 * 60);
          if (minutesSinceLastTrigger < freqMinutes) continue; // Skip — too soon
        }

        // Skip rules that already have an open (pending/approved) task — every
        // scheduler cycle would otherwise create a duplicate task for the same
        // condition, flooding the approval queue.
        if (await hasOpenTaskForRule(db, rule.id)) continue;

        const shouldTrigger = await evaluateRuleCondition(rule);
        
        if (shouldTrigger) {
          triggeredRules++;
          const task = await createTaskFromRule(rule);
          if (task) {
            tasksCreated++;
            
            // Log the trigger
            await db.insert(aiAgentLogs).values({
              ruleId: rule.id,
              taskId: task.id,
              action: "rule_triggered",
              status: "success",
              message: `Rule "${rule.name}" triggered, task created`,
              details: JSON.stringify({ ruleType: rule.ruleType }),
            });

            // Update rule trigger count
            await db
              .update(aiAgentRules)
              .set({
                lastTriggeredAt: new Date(),
                triggerCount: sql`${aiAgentRules.triggerCount} + 1`,
              })
              .where(eq(aiAgentRules.id, rule.id));
          }
        }
      } catch (err) {
        const errorMsg = `Error evaluating rule ${rule.id}: ${err}`;
        errors.push(errorMsg);
        await db.insert(aiAgentLogs).values({
          ruleId: rule.id,
          action: "rule_evaluation_error",
          status: "error",
          message: errorMsg,
        });
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch rules: ${err}`);
  }

  return { triggeredRules, tasksCreated, errors };
}

type SchedulerDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const OPEN_TASK_STATUSES = ["pending_approval", "approved"] as const;

/**
 * True when a task created by this rule is still waiting for approval or
 * execution. Tasks do not carry a ruleId, but the "rule_triggered" log row
 * written at creation links ruleId -> taskId.
 */
async function hasOpenTaskForRule(db: SchedulerDb, ruleId: number): Promise<boolean> {
  const rows = await db
    .select({ id: aiAgentTasks.id })
    .from(aiAgentLogs)
    .innerJoin(aiAgentTasks, eq(aiAgentLogs.taskId, aiAgentTasks.id))
    .where(
      and(
        eq(aiAgentLogs.ruleId, ruleId),
        eq(aiAgentLogs.action, "rule_triggered"),
        inArray(aiAgentTasks.status, [...OPEN_TASK_STATUSES])
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * True when an open task of the given type already targets the same entity.
 * `relatedEntityId` matches the task's relatedEntityId column; `taskDataLike`
 * matches a JSON fragment inside taskData for tasks without an entity id.
 */
async function hasOpenTaskForEntity(
  db: SchedulerDb,
  taskType: typeof aiAgentTasks.$inferSelect["taskType"],
  target: { relatedEntityId?: number; taskDataLike?: string }
): Promise<boolean> {
  const conditions = [
    eq(aiAgentTasks.taskType, taskType),
    inArray(aiAgentTasks.status, [...OPEN_TASK_STATUSES]),
  ];
  if (target.relatedEntityId !== undefined) conditions.push(eq(aiAgentTasks.relatedEntityId, target.relatedEntityId));
  if (target.taskDataLike) conditions.push(like(aiAgentTasks.taskData, `%${target.taskDataLike}%`));

  const rows = await db
    .select({ id: aiAgentTasks.id })
    .from(aiAgentTasks)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

async function evaluateRuleCondition(rule: typeof aiAgentRules.$inferSelect): Promise<boolean> {
  const condition = JSON.parse(rule.triggerCondition) as RuleCondition;

  switch (rule.ruleType) {
    case "inventory_reorder":
      return await checkInventoryReorderCondition(condition);
    case "po_auto_generate":
      return await checkPOAutoGenerateCondition(condition);
    case "rfq_auto_send":
      return await checkRFQAutoSendCondition(condition);
    case "vendor_followup":
      return await checkVendorFollowupCondition(condition);
    case "payment_reminder":
      return await checkPaymentReminderCondition(condition);
    case "shipment_tracking":
      return await checkShipmentTrackingCondition(condition);
    case "ingredient_requote":
      return await checkIngredientRequoteCondition(condition);
    case "invoice_price_check":
      return await checkIngredientRequoteCondition(condition);
    default:
      return false;
  }
}

async function checkInventoryReorderCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check if any materials have low stock based on quantityOnOrder
  const lowStockMaterials = await db
    .select()
    .from(rawMaterials)
    .where(
      and(
        sql`CAST(${rawMaterials.quantityOnOrder} AS DECIMAL) < 10`,
        eq(rawMaterials.status, "active")
      )
    );
  
  return lowStockMaterials.length > 0;
}

async function checkPOAutoGenerateCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Materials needing reorder (same low-stock definition createPOGenerationTask
  // uses) that are not already covered by an open PO. PO lines link to raw
  // materials through the purchaseOrderRawMaterials junction table.
  const lowStock = await db
    .select({ id: rawMaterials.id })
    .from(rawMaterials)
    .where(
      and(
        sql`CAST(${rawMaterials.quantityOnOrder} AS DECIMAL) < 10`,
        eq(rawMaterials.status, "active")
      )
    )
    .limit(50);
  if (lowStock.length === 0) return false;

  const lowStockIds = lowStock.map((m) => m.id);
  const covered = await db
    .select({ rawMaterialId: purchaseOrderRawMaterials.rawMaterialId })
    .from(purchaseOrderRawMaterials)
    .innerJoin(purchaseOrderItems, eq(purchaseOrderRawMaterials.purchaseOrderItemId, purchaseOrderItems.id))
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .where(
      and(
        inArray(purchaseOrderRawMaterials.rawMaterialId, lowStockIds),
        inArray(purchaseOrders.status, ["draft", "sent", "confirmed", "partial"])
      )
    );
  const coveredIds = new Set(covered.map((c) => c.rawMaterialId));

  return lowStockIds.some((id) => !coveredIds.has(id));
}

async function checkRFQAutoSendCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for pending RFQs that haven't been sent
  const pendingRFQs = await db
    .select()
    .from(freightRfqs)
    .where(eq(freightRfqs.status, "draft"));
  
  return pendingRFQs.length > 0;
}

async function checkVendorFollowupCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for POs sent more than 3 days ago without response
  const stalePOs = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.status, "sent"));
  
  return stalePOs.length > 0;
}

async function checkPaymentReminderCondition(condition: RuleCondition): Promise<boolean> {
  // Placeholder - check for overdue invoices
  return false;
}

async function checkShipmentTrackingCondition(condition: RuleCondition): Promise<boolean> {
  // Placeholder - check for shipments needing tracking updates
  return false;
}

async function checkIngredientRequoteCondition(condition: RuleCondition): Promise<boolean> {
  const thresholdPct = typeof condition.value === "number" ? condition.value : 15;
  const spiked = await manufacturingDb.getIngredientsAboveCostThreshold(thresholdPct);
  if (spiked.length > 0) return true;
  const expiring = await manufacturingDb.getIngredientsWithExpiringContracts(30);
  return expiring.length > 0;
}

// ============================================
// TASK CREATION FROM RULES
// ============================================

async function createTaskFromRule(rule: typeof aiAgentRules.$inferSelect): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const actionConfig = JSON.parse(rule.actionConfig) as RuleAction;

  switch (rule.ruleType) {
    case "inventory_reorder":
    case "po_auto_generate":
      return await createPOGenerationTask(rule, actionConfig);
    case "rfq_auto_send":
      return await createRFQTask(rule, actionConfig);
    case "vendor_followup":
      return await createVendorFollowupTask(rule, actionConfig);
    case "ingredient_requote":
    case "invoice_price_check":
      return await createIngredientRequoteTask(rule, actionConfig);
    default:
      return null;
  }
}

async function createPOGenerationTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  // Find materials needing reorder
  const lowStockMaterials = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      quantityOnOrder: rawMaterials.quantityOnOrder,
      minOrderQty: rawMaterials.minOrderQty,
      preferredVendorId: rawMaterials.preferredVendorId,
      unitCost: rawMaterials.unitCost,
      unit: rawMaterials.unit,
    })
    .from(rawMaterials)
    .where(
      and(
        sql`CAST(${rawMaterials.quantityOnOrder} AS DECIMAL) < 10`,
        eq(rawMaterials.status, "active")
      )
    )
    .limit(10);

  if (lowStockMaterials.length === 0) return null;

  // Group by vendor
  const vendorGroups = new Map<number, typeof lowStockMaterials>();
  for (const material of lowStockMaterials) {
    const vendorId = material.preferredVendorId || 0;
    if (!vendorGroups.has(vendorId)) {
      vendorGroups.set(vendorId, []);
    }
    vendorGroups.get(vendorId)!.push(material);
  }

  // Create task for first vendor group
  const firstEntry = vendorGroups.entries().next().value;
  if (!firstEntry) return null;
  const [vendorId, materials] = firstEntry;

  // Don't queue a second PO for a vendor that already has one awaiting approval/execution
  if (await hasOpenTaskForEntity(db, "generate_po", { taskDataLike: `"vendorId":${vendorId},` })) return null;
  
  const totalValue = materials.reduce((sum: number, m: any) => {
    const qty = parseFloat(m.minOrderQty || "0");
    const cost = parseFloat(m.unitCost || "0");
    return sum + (qty * cost);
  }, 0);

  // Use AI to generate PO details
  const aiResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an ERP assistant generating purchase orders. Create a professional PO summary.`,
      },
      {
        role: "user",
        content: `Generate a PO summary for these materials needing reorder:
${materials.map((m: any) => `- ${m.name}: On order ${m.quantityOnOrder}, Min order qty ${m.minOrderQty}`).join("\n")}

Respond with JSON: { "summary": "brief description", "urgency": "low|medium|high", "notes": "any special instructions" }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "po_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            urgency: { type: "string" },
            notes: { type: "string" },
          },
          required: ["summary", "urgency", "notes"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = aiResponse.choices[0].message.content;
  const aiSummary = JSON.parse(typeof content === 'string' ? content : "{}");

  // Determine if auto-approve
  const shouldAutoApprove = !rule.requiresApproval || 
    (rule.autoApproveThreshold && totalValue <= parseFloat(rule.autoApproveThreshold));

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "generate_po",
      status: shouldAutoApprove ? "approved" : "pending_approval",
      priority: aiSummary.urgency === "high" ? "high" : aiSummary.urgency === "medium" ? "medium" : "low",
      taskData: JSON.stringify({
        title: `Auto-generate PO for ${materials.length} material(s)`,
        description: aiSummary.summary,
        vendorId,
        materials: materials.map((m: any) => ({
          id: m.id,
          name: m.name,
          quantity: m.minOrderQty,
          unitCost: m.unitCost,
          unit: m.unit,
        })),
        totalValue,
      }),
      aiReasoning: aiSummary.notes,
      aiConfidence: "0.85",
      relatedEntityType: "raw_material",
      requiresApproval: !shouldAutoApprove,
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

async function createRFQTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  // Find pending RFQs
  const pendingRFQs = await db
    .select()
    .from(freightRfqs)
    .where(eq(freightRfqs.status, "draft"))
    .limit(1);

  if (pendingRFQs.length === 0) return null;

  const rfq = pendingRFQs[0];

  if (await hasOpenTaskForEntity(db, "send_rfq", { relatedEntityId: rfq.id })) return null;

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "send_rfq",
      status: "pending_approval",
      priority: "medium",
      taskData: JSON.stringify({
        title: `Send freight RFQ for ${rfq.originCity || rfq.originCountry} → ${rfq.destinationCity || rfq.destinationCountry}`,
        description: `Auto-send RFQ to carriers for freight quote`,
        rfqId: rfq.id,
      }),
      aiReasoning: "RFQ is ready to be sent to carriers for quotes",
      aiConfidence: "0.9",
      relatedEntityType: "freight_rfq",
      relatedEntityId: rfq.id,
      requiresApproval: rule.requiresApproval,
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

async function createVendorFollowupTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  // Find stale POs
  const stalePOs = await db
    .select({
      po: purchaseOrders,
      vendor: vendors,
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(eq(purchaseOrders.status, "sent"))
    .limit(1);

  if (stalePOs.length === 0) return null;

  const { po, vendor } = stalePOs[0];

  if (await hasOpenTaskForEntity(db, "vendor_followup", { relatedEntityId: po.id })) return null;

  // Generate follow-up email content
  const aiResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an ERP assistant drafting professional follow-up emails to vendors about purchase orders.`,
      },
      {
        role: "user",
        content: `Draft a polite follow-up email for PO #${po.poNumber} sent to ${vendor?.name || "vendor"}.
Total value: $${po.totalAmount}

Respond with JSON: { "subject": "email subject", "body": "email body text" }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "followup_email",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
          additionalProperties: false,
        },
      },
    },
  });

  const emailContentStr = aiResponse.choices[0].message.content;
  const emailContent = JSON.parse(typeof emailContentStr === 'string' ? emailContentStr : "{}");

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "vendor_followup",
      status: "pending_approval",
      priority: "medium",
      taskData: JSON.stringify({
        title: `Follow up on PO #${po.poNumber} with ${vendor?.name || "vendor"}`,
        description: `PO sent several days ago, no response received`,
        poId: po.id,
        vendorId: vendor?.id,
        vendorEmail: vendor?.email,
        emailSubject: emailContent.subject,
        emailBody: emailContent.body,
        generatedEmail: emailContent,
      }),
      aiReasoning: `Vendor has not responded to PO. Follow-up recommended.`,
      aiConfidence: "0.9",
      relatedEntityType: "purchase_order",
      relatedEntityId: po.id,
      requiresApproval: true,
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

async function createIngredientRequoteTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction,
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const thresholdPct = actionConfig.params?.thresholdPct || 15;
  const spiked = await manufacturingDb.getIngredientsAboveCostThreshold(thresholdPct);
  const expiring = await manufacturingDb.getIngredientsWithExpiringContracts(actionConfig.params?.expiryDays || 30);

  if (spiked.length === 0 && expiring.length === 0) return null;

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "ingredient_rfq",
      status: "pending_approval",
      priority: spiked.some(s => s.pctAbove > 30) ? "high" : "medium",
      taskData: JSON.stringify({
        title: `Ingredient re-quote: ${spiked.length} price spike(s), ${expiring.length} expiring contract(s)`,
        spikedIngredients: spiked,
        expiringContracts: expiring.map(e => ({
          ingredientId: e.ingredientVendor.ingredientId,
          ingredientName: e.ingredientName,
          vendorName: e.vendorName,
          contractEndDate: e.ingredientVendor.contractEndDate,
        })),
        thresholdPct,
      }),
      aiReasoning: `Detected ${spiked.length} ingredient(s) with costs >${thresholdPct}% above average and ${expiring.length} expiring vendor contract(s). Automated re-quoting recommended.`,
      aiConfidence: "0.85",
      relatedEntityType: "ingredient",
      requiresApproval: true,
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

// ============================================
// TASK EXECUTION ENGINE
// ============================================

export async function executeApprovedTasks(): Promise<{
  executed: number;
  failed: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) return { executed: 0, failed: 0, errors: ["Database not available"] };

  const errors: string[] = [];
  let executed = 0;
  let failed = 0;

  // Get approved tasks ready for execution
  const approvedTasks = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "approved"))
    .orderBy(desc(aiAgentTasks.priority))
    .limit(defaultConfig.maxConcurrentTasks);

  for (const task of approvedTasks) {
    // Compare-and-set approved -> in_progress. An admin clicking Execute in
    // the Approval Queue races this loop for the same row; whoever loses the
    // claim skips the task instead of running it a second time.
    let claimed = false;
    try {
      claimed = await claimAgentTask(task.id, "approved");
    } catch (err) {
      failed++;
      errors.push(`Exception claiming task ${task.id}: ${err}`);
      continue;
    }
    if (!claimed) continue;

    try {
      // Execute based on task type
      const result = await executeAgentTask(task, { executedBy: task.approvedBy ?? undefined });

      if (result.success === false) {
        await db
          .update(aiAgentTasks)
          .set({
            status: "failed",
            errorMessage: result.error,
          })
          .where(eq(aiAgentTasks.id, task.id));
        failed++;
        errors.push(`Task ${task.id} failed: ${result.error}`);
      } else {
        await db
          .update(aiAgentTasks)
          .set({
            status: "completed",
            executionResult: JSON.stringify(result.data),
          })
          .where(eq(aiAgentTasks.id, task.id));
        executed++;
        await notifyTaskCompleted(db, task, result.data);
      }

      // Log execution
      await db.insert(aiAgentLogs).values({
        taskId: task.id,
        action: "task_executed",
        status: result.success ? "success" : "error",
        message: result.success === false ? (result.error || "Unknown error") : "Task completed successfully",
        details: JSON.stringify(result),
      });
    } catch (err) {
      failed++;
      const errorMsg = `Exception executing task ${task.id}: ${err}`;
      errors.push(errorMsg);
      
      await db
        .update(aiAgentTasks)
        .set({ status: "failed", errorMessage: errorMsg })
        .where(eq(aiAgentTasks.id, task.id));
    }

    // Project tasks handed to the agent pick up the result now, not on the
    // next read of the project page. Never fails the scheduler run.
    try {
      const { syncAgentStatusToProjectTask } = await import("./taskAgentBridge");
      await syncAgentStatusToProjectTask(task.id);
    } catch (err) {
      console.warn(`[AIAgentScheduler] project-task write-back failed for task ${task.id}:`, err);
    }
  }

  return { executed, failed, errors };
}

/**
 * Tell the person who approved (or requested) a task that it ran. Tasks the
 * scheduler auto-approved have neither, so those fall back to the admins.
 * Never fails the (already completed) task.
 */
async function notifyTaskCompleted(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  task: typeof aiAgentTasks.$inferSelect,
  data: unknown,
): Promise<void> {
  try {
    let inputData: Record<string, unknown> = {};
    try { inputData = JSON.parse(task.taskData || "{}"); } catch { /* malformed taskData: no requester */ }
    let userIds: number[] = [];
    const requester = Number(inputData.createdBy ?? inputData.requestedBy) || null;
    if (task.approvedBy) userIds = [task.approvedBy];
    else if (requester) userIds = [requester];
    else {
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      userIds = admins.map((a) => a.id);
    }
    if (userIds.length === 0) return;
    const label = task.taskType.replace(/_/g, " ");
    const poNumber = data && typeof data === "object" && "poNumber" in data ? String((data as { poNumber: unknown }).poNumber) : null;
    await db.insert(notifications).values(userIds.map((userId) => ({
      userId,
      type: "success" as const,
      title: `AI task completed: ${label}`,
      message: poNumber
        ? `Task #${task.id} created draft purchase order ${poNumber}.`
        : `Task #${task.id} (${label}) executed successfully.`,
      entityType: "ai_agent_task",
      entityId: task.id,
      severity: "info" as const,
      link: "/ai/approvals",
      metadata: { taskType: task.taskType, result: data ?? null },
      isRead: false,
    })));
  } catch (err) {
    console.warn(`[AIAgentScheduler] Could not notify completion of task ${task.id}:`, err);
  }
}

// ============================================
// SCHEDULER MAIN LOOP
// ============================================

let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(config: Partial<SchedulerConfig> = {}): void {
  const finalConfig = { ...defaultConfig, ...config };

  if (schedulerInterval) {
    console.log("[AI Agent Scheduler] Already running");
    return;
  }

  console.log("[AI Agent Scheduler] Starting with config:", finalConfig);

  schedulerInterval = setInterval(async () => {
    try {
      // Evaluate rules and create tasks
      const ruleResults = await evaluateRules();
      if (ruleResults.triggeredRules > 0) {
        console.log(`[AI Agent Scheduler] Triggered ${ruleResults.triggeredRules} rules, created ${ruleResults.tasksCreated} tasks`);
      }

      // Execute approved tasks
      const execResults = await executeApprovedTasks();
      if (execResults.executed > 0 || execResults.failed > 0) {
        console.log(`[AI Agent Scheduler] Executed ${execResults.executed} tasks, ${execResults.failed} failed`);
      }
    } catch (err) {
      console.error("[AI Agent Scheduler] Error in main loop:", err);
    }
  }, finalConfig.checkIntervalMs);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[AI Agent Scheduler] Stopped");
  }
}

export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
