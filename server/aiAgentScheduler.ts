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
  inventory,
  freightRfqs,
  freightCarriers,
} from "../drizzle/schema";
import { eq, and, lt, gte, desc, sql, isNull, or } from "drizzle-orm";
import { sendEmail } from "./_core/email";

// ============================================
// AI AGENT SCHEDULER - Autonomous Task System
// ============================================

interface SchedulerConfig {
  checkIntervalMs: number;
  maxConcurrentTasks: number;
  autoApproveThreshold: number;
}

const defaultConfig: SchedulerConfig = {
  checkIntervalMs: 60000, // Check every minute
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

  // Check for materials needing reorder without pending POs
  const materialsNeedingPO = await db.execute(sql`
    SELECT rm.id, rm.name
    FROM rawMaterials rm
    LEFT JOIN purchaseOrderItems poi ON poi.rawMaterialId = rm.id
    LEFT JOIN purchase_orders po ON po.id = poi.purchaseOrderId AND po.status IN ('draft', 'pending', 'approved', 'sent')
    WHERE rm.status = 'active'
    AND po.id IS NULL
    LIMIT 10
  `);
  
  return (materialsNeedingPO as any[]).length > 0;
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
  const db = await getDb();
  if (!db) return false;

  // Check for invoices past their due date that haven't been paid
  const { invoices } = await import("../drizzle/schema");
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "sent" as any),
        lt(invoices.dueDate, new Date())
      )
    )
    .limit(10);

  return overdueInvoices.length > 0;
}

async function checkShipmentTrackingCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for shipments in transit that haven't been updated recently
  const { shipments } = await import("../drizzle/schema");
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const staleShipments = await db
    .select()
    .from(shipments)
    .where(
      and(
        eq(shipments.status, "in_transit"),
        lt(shipments.updatedAt, threeDaysAgo)
      )
    )
    .limit(10);

  return staleShipments.length > 0;
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
    case "payment_reminder":
      return await createPaymentReminderTask(rule, actionConfig);
    case "shipment_tracking":
      return await createShipmentTrackingTask(rule, actionConfig);
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

async function createPaymentReminderTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const { invoices, customers } = await import("../drizzle/schema");

  // Find overdue invoices
  const overdueInvoices = await db
    .select({ invoice: invoices, customer: customers })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(
      and(
        eq(invoices.status, "sent" as any),
        lt(invoices.dueDate, new Date())
      )
    )
    .limit(1);

  if (overdueInvoices.length === 0) return null;

  const { invoice, customer } = overdueInvoices[0];
  const daysOverdue = Math.floor((Date.now() - (invoice.dueDate?.getTime() || Date.now())) / (1000 * 60 * 60 * 24));

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "send_email",
      status: "pending_approval",
      priority: daysOverdue > 14 ? "high" : "medium",
      taskData: JSON.stringify({
        title: `Payment reminder for Invoice ${invoice.invoiceNumber}`,
        description: `Invoice ${invoice.invoiceNumber} is ${daysOverdue} days overdue. Total: $${invoice.totalAmount}`,
        invoiceId: invoice.id,
        customerId: customer?.id,
        customerEmail: customer?.email,
        to: customer?.email,
        subject: `Payment Reminder: Invoice ${invoice.invoiceNumber} - ${daysOverdue} Days Overdue`,
        body: `Dear ${customer?.name || 'Customer'},\n\nThis is a friendly reminder that Invoice ${invoice.invoiceNumber} for $${invoice.totalAmount} was due on ${invoice.dueDate?.toLocaleDateString()}.\n\nPlease process this payment at your earliest convenience.\n\nBest regards`,
      }),
      aiReasoning: `Invoice ${invoice.invoiceNumber} is ${daysOverdue} days past due. Payment reminder recommended.`,
      aiConfidence: "0.95",
      relatedEntityType: "invoice",
      relatedEntityId: invoice.id,
      requiresApproval: true,
    })
    .$returningId();

  const [createdTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, task.id));
  return createdTask;
}

async function createShipmentTrackingTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const { shipments } = await import("../drizzle/schema");
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Find stale in-transit shipments
  const staleShipments = await db
    .select()
    .from(shipments)
    .where(
      and(
        eq(shipments.status, "in_transit"),
        lt(shipments.updatedAt, threeDaysAgo)
      )
    )
    .limit(1);

  if (staleShipments.length === 0) return null;

  const shipment = staleShipments[0];
  const daysSinceUpdate = Math.floor((Date.now() - shipment.updatedAt.getTime()) / (1000 * 60 * 60 * 24));

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "send_email",
      status: "pending_approval",
      priority: daysSinceUpdate > 7 ? "high" : "medium",
      taskData: JSON.stringify({
        title: `Shipment tracking follow-up: ${shipment.shipmentNumber}`,
        description: `Shipment ${shipment.shipmentNumber} (${shipment.carrier || 'Unknown carrier'}) has not been updated for ${daysSinceUpdate} days.`,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
      }),
      aiReasoning: `Shipment ${shipment.shipmentNumber} has been in transit for ${daysSinceUpdate} days without update. Follow-up recommended.`,
      aiConfidence: "0.85",
      relatedEntityType: "shipment",
      relatedEntityId: shipment.id,
      requiresApproval: true,
    })
    .$returningId();

  const [createdTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, task.id));
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
    try {
      // Mark as in progress
      await db
        .update(aiAgentTasks)
        .set({ status: "in_progress", executedAt: new Date() })
        .where(eq(aiAgentTasks.id, task.id));

      // Execute based on task type
      const result = await executeTask(task);

      if (result.success) {
        await db
          .update(aiAgentTasks)
          .set({
            status: "completed",
            executionResult: JSON.stringify(result.data),
          })
          .where(eq(aiAgentTasks.id, task.id));
        executed++;
      } else {
        await db
          .update(aiAgentTasks)
          .set({
            status: "failed",
            errorMessage: result.error,
          })
          .where(eq(aiAgentTasks.id, task.id));
        failed++;
        errors.push(`Task ${task.id} failed: ${result.error}`);
      }

      // Log execution
      await db.insert(aiAgentLogs).values({
        taskId: task.id,
        action: "task_executed",
        status: result.success ? "success" : "error",
        message: result.success ? "Task completed successfully" : (result.error || "Unknown error"),
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
  }

  return { executed, failed, errors };
}

async function executeTask(task: typeof aiAgentTasks.$inferSelect): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  switch (task.taskType) {
    case "generate_po":
      return await executePOGeneration(task);
    case "send_rfq":
      return await executeRFQSend(task);
    case "vendor_followup":
      return await executeVendorFollowup(task);
    case "reply_email":
      return await executeEmailReply(task);
    default:
      return { success: false, error: `Unknown task type: ${task.taskType}` };
  }
}

async function executePOGeneration(task: typeof aiAgentTasks.$inferSelect): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const inputData = JSON.parse(task.taskData || "{}");
    const { vendorId, materials, totalValue } = inputData;

    // Generate PO number
    const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

    // Create purchase order
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber,
        vendorId: vendorId || 1, // Default to vendor 1 if not specified
        status: "draft",
        orderDate: new Date(),
        subtotal: totalValue?.toString() || "0",
        totalAmount: totalValue?.toString() || "0",
        currency: "USD",
        notes: `Auto-generated by AI Agent. Task ID: ${task.id}`,
      })
      .$returningId();

    // Create line items
    for (const material of materials || []) {
      const qty = parseFloat(material.quantity || "1");
      const price = parseFloat(material.unitCost || "0");
      await db.insert(purchaseOrderItems).values({
        purchaseOrderId: po.id,
        productId: material.id,
        description: material.name,
        quantity: qty.toString(),
        unitPrice: price.toString(),
        totalAmount: (qty * price).toString(),
      });
    }

    return {
      success: true,
      data: { poId: po.id, poNumber },
    };
  } catch (err) {
    return { success: false, error: `Failed to generate PO: ${err}` };
  }
}

async function executeRFQSend(task: typeof aiAgentTasks.$inferSelect): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const inputData = JSON.parse(task.taskData || "{}");
    const { rfqId } = inputData;

    // Update RFQ status
    await db
      .update(freightRfqs)
      .set({ status: "sent" })
      .where(eq(freightRfqs.id, rfqId));

    return {
      success: true,
      data: { rfqId, status: "sent" },
    };
  } catch (err) {
    return { success: false, error: `Failed to send RFQ: ${err}` };
  }
}

async function executeVendorFollowup(task: typeof aiAgentTasks.$inferSelect): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const inputData = JSON.parse(task.taskData || "{}");
    const { vendorEmail, emailSubject, emailBody } = inputData;

    if (!vendorEmail) {
      return { success: false, error: "No vendor email address" };
    }

    // Send email via SendGrid
    const emailResult = await sendEmail({
      to: vendorEmail,
      subject: emailSubject,
      text: emailBody,
    });

    return {
      success: emailResult.success,
      data: { emailSent: true, messageId: emailResult.messageId },
      error: emailResult.error,
    };
  } catch (err) {
    return { success: false, error: `Failed to send follow-up email: ${err}` };
  }
}

async function executeEmailReply(task: typeof aiAgentTasks.$inferSelect): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const inputData = JSON.parse(task.taskData || "{}");
    const { recipientEmail, subject, body } = inputData;

    if (!recipientEmail) {
      return { success: false, error: "No recipient email address" };
    }

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject,
      text: body,
    });

    return {
      success: emailResult.success,
      data: { emailSent: true, messageId: emailResult.messageId },
      error: emailResult.error,
    };
  } catch (err) {
    return { success: false, error: `Failed to send email reply: ${err}` };
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
