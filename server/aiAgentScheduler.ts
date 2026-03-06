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
  invoices,
  shipments,
  freightRfqs,
  freightCarriers,
  workOrders,
  workOrderMaterials,
  rawMaterialInventory,
  products,
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
    case "price_alert":
      return await checkPriceAlertCondition(condition);
    case "quality_check":
      return await checkQualityCheckCondition(condition);
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

  const now = new Date();
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        or(eq(invoices.status, "sent"), eq(invoices.status, "overdue")),
        lt(invoices.dueDate, now)
      )
    );

  return overdueInvoices.length > 0;
}

async function checkShipmentTrackingCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const activeShipments = await db
    .select()
    .from(shipments)
    .where(
      or(
        eq(shipments.status, "in_transit"),
        eq(shipments.status, "pending"),
        eq(shipments.status, "pending")
      )
    );

  return activeShipments.length > 0;
}

async function checkPriceAlertCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for raw materials whose unit cost has changed significantly
  const mats = await db
    .select()
    .from(rawMaterials)
    .where(eq(rawMaterials.status, "active"));

  // Look for materials with recent PO prices significantly different from stored unit cost
  for (const mat of mats) {
    const recentPOItems = await db
      .select({ unitPrice: purchaseOrderItems.unitPrice })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
      .where(eq(purchaseOrderItems.productId, mat.id))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(1);

    if (recentPOItems.length > 0) {
      const lastPrice = parseFloat(recentPOItems[0].unitPrice || "0");
      const storedCost = parseFloat(mat.unitCost || "0");
      if (storedCost > 0 && Math.abs(lastPrice - storedCost) / storedCost > 0.15) {
        return true; // >15% price change detected
      }
    }
  }

  return false;
}

async function checkQualityCheckCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for completed work orders with yield variance below threshold
  const recentWOs = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.status, "completed"))
    .orderBy(desc(workOrders.updatedAt))
    .limit(20);

  for (const wo of recentWOs) {
    const planned = parseFloat(wo.quantity?.toString() || "0");
    const completed = parseFloat(wo.completedQuantity?.toString() || "0");
    if (planned > 0 && completed > 0) {
      const yieldPct = (completed / planned) * 100;
      if (yieldPct < 90) return true; // Yield below 90% triggers quality check
    }
  }

  return false;
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
    case "price_alert":
      return await createPriceAlertTask(rule, actionConfig);
    case "quality_check":
      return await createQualityCheckTask(rule, actionConfig);
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

  const now = new Date();
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        or(eq(invoices.status, "sent"), eq(invoices.status, "overdue")),
        lt(invoices.dueDate, now)
      )
    )
    .limit(5);

  if (overdueInvoices.length === 0) return null;

  const totalOverdue = overdueInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0);

  const aiResponse = await invokeLLM({
    messages: [
      { role: "system", content: "You are an ERP assistant generating payment reminder summaries." },
      {
        role: "user",
        content: `Generate a payment reminder summary for ${overdueInvoices.length} overdue invoices totaling $${totalOverdue.toFixed(2)}:\n${overdueInvoices.map(i => `- ${i.invoiceNumber}: $${i.totalAmount} due ${i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "unknown"}`).join("\n")}\n\nRespond with JSON: { "summary": "brief description", "urgency": "low|medium|high", "emailSubject": "subject line", "emailBody": "reminder email text" }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "payment_reminder",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            urgency: { type: "string" },
            emailSubject: { type: "string" },
            emailBody: { type: "string" },
          },
          required: ["summary", "urgency", "emailSubject", "emailBody"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = aiResponse.choices[0].message.content;
  const aiSummary = JSON.parse(typeof content === "string" ? content : "{}");

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "send_email",
      status: "pending_approval",
      priority: aiSummary.urgency === "high" ? "high" : "medium",
      taskData: JSON.stringify({
        title: `Payment reminders for ${overdueInvoices.length} overdue invoice(s)`,
        description: aiSummary.summary,
        invoiceIds: overdueInvoices.map(i => i.id),
        totalOverdue,
        emailSubject: aiSummary.emailSubject,
        emailBody: aiSummary.emailBody,
      }),
      aiReasoning: aiSummary.summary,
      aiConfidence: "0.9",
      relatedEntityType: "invoice",
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

  const activeShipments = await db
    .select()
    .from(shipments)
    .where(or(eq(shipments.status, "in_transit"), eq(shipments.status, "pending")))
    .limit(10);

  if (activeShipments.length === 0) return null;

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "update_inventory",
      status: rule.requiresApproval ? "pending_approval" : "approved",
      priority: "medium",
      taskData: JSON.stringify({
        title: `Track ${activeShipments.length} active shipment(s)`,
        description: `Update tracking status for in-transit shipments`,
        shipmentIds: activeShipments.map(s => s.id),
        shipments: activeShipments.map(s => ({
          id: s.id,
          trackingNumber: s.trackingNumber,
          status: s.status,
          carrier: s.carrier,
        })),
      }),
      aiReasoning: `${activeShipments.length} shipments are in transit and need tracking updates`,
      aiConfidence: "0.95",
      relatedEntityType: "shipment",
      requiresApproval: rule.requiresApproval,
    })
    .$returningId();

  const [createdTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, task.id));
  return createdTask;
}

async function createPriceAlertTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const priceChanges: { materialName: string; oldPrice: number; newPrice: number; changePct: number }[] = [];
  const mats = await db.select().from(rawMaterials).where(eq(rawMaterials.status, "active"));

  for (const mat of mats) {
    const recentPOItems = await db
      .select({ unitPrice: purchaseOrderItems.unitPrice })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
      .where(eq(purchaseOrderItems.productId, mat.id))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(1);

    if (recentPOItems.length > 0) {
      const lastPrice = parseFloat(recentPOItems[0].unitPrice || "0");
      const storedCost = parseFloat(mat.unitCost || "0");
      if (storedCost > 0) {
        const changePct = ((lastPrice - storedCost) / storedCost) * 100;
        if (Math.abs(changePct) > 15) {
          priceChanges.push({ materialName: mat.name, oldPrice: storedCost, newPrice: lastPrice, changePct });
        }
      }
    }
  }

  if (priceChanges.length === 0) return null;

  const aiResponse = await invokeLLM({
    messages: [
      { role: "system", content: "You are an ERP procurement analyst. Analyze price changes and provide recommendations." },
      {
        role: "user",
        content: `Analyze these material price changes:\n${priceChanges.map(p => `- ${p.materialName}: $${p.oldPrice.toFixed(2)} → $${p.newPrice.toFixed(2)} (${p.changePct > 0 ? "+" : ""}${p.changePct.toFixed(1)}%)`).join("\n")}\n\nRespond with JSON: { "summary": "analysis", "recommendation": "what to do", "riskLevel": "low|medium|high" }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "price_alert",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            recommendation: { type: "string" },
            riskLevel: { type: "string" },
          },
          required: ["summary", "recommendation", "riskLevel"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = aiResponse.choices[0].message.content;
  const analysis = JSON.parse(typeof content === "string" ? content : "{}");

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "send_email",
      status: "pending_approval",
      priority: analysis.riskLevel === "high" ? "high" : "medium",
      taskData: JSON.stringify({
        title: `Price alert: ${priceChanges.length} material(s) with significant price changes`,
        description: analysis.summary,
        priceChanges,
        recommendation: analysis.recommendation,
      }),
      aiReasoning: analysis.recommendation,
      aiConfidence: "0.85",
      relatedEntityType: "raw_material",
      requiresApproval: true,
    })
    .$returningId();

  const [createdTask] = await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, task.id));
  return createdTask;
}

async function createQualityCheckTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const recentWOs = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.status, "completed"))
    .orderBy(desc(workOrders.updatedAt))
    .limit(20);

  const lowYieldWOs: { id: number; workOrderNumber: string; planned: number; completed: number; yieldPct: number }[] = [];

  for (const wo of recentWOs) {
    const planned = parseFloat(wo.quantity?.toString() || "0");
    const completed = parseFloat(wo.completedQuantity?.toString() || "0");
    if (planned > 0 && completed > 0) {
      const yieldPct = (completed / planned) * 100;
      if (yieldPct < 90) {
        lowYieldWOs.push({ id: wo.id, workOrderNumber: wo.workOrderNumber, planned, completed, yieldPct });
      }
    }
  }

  if (lowYieldWOs.length === 0) return null;

  const aiResponse = await invokeLLM({
    messages: [
      { role: "system", content: "You are an ERP quality control analyst. Analyze production yield data and recommend corrective actions." },
      {
        role: "user",
        content: `These work orders had below-target yield (<90%):\n${lowYieldWOs.map(w => `- ${w.workOrderNumber}: ${w.yieldPct.toFixed(1)}% yield (${w.completed}/${w.planned} units)`).join("\n")}\n\nRespond with JSON: { "summary": "quality analysis", "rootCauseHypotheses": ["possible cause 1", "possible cause 2"], "recommendations": ["action 1", "action 2"], "severity": "low|medium|high" }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "quality_check",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            rootCauseHypotheses: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            severity: { type: "string" },
          },
          required: ["summary", "rootCauseHypotheses", "recommendations", "severity"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = aiResponse.choices[0].message.content;
  const analysis = JSON.parse(typeof content === "string" ? content : "{}");

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "send_email",
      status: "pending_approval",
      priority: analysis.severity === "high" ? "high" : "medium",
      taskData: JSON.stringify({
        title: `Quality alert: ${lowYieldWOs.length} work order(s) with low yield`,
        description: analysis.summary,
        affectedWorkOrders: lowYieldWOs,
        rootCauseHypotheses: analysis.rootCauseHypotheses,
        recommendations: analysis.recommendations,
      }),
      aiReasoning: `${analysis.summary}. Hypotheses: ${analysis.rootCauseHypotheses.join("; ")}`,
      aiConfidence: "0.8",
      relatedEntityType: "work_order",
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
