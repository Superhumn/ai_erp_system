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
  // FP&A tables
  budgets,
  budgetLineItems,
  cashFlowForecasts,
  performancePacing,
  inventoryAgingSnapshots,
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
    // FP&A rule types
    case "price_alert":
      return await checkPriceAlertCondition(condition);
    case "quality_check":
      return await checkQualityCheckCondition(condition);
    case "budget_variance_alert":
      return await checkBudgetVarianceCondition(condition);
    case "cash_flow_alert":
      return await checkCashFlowAlertCondition(condition);
    case "pacing_alert":
      return await checkPacingAlertCondition(condition);
    case "inventory_aging_alert":
      return await checkInventoryAgingAlertCondition(condition);
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
  // Placeholder - check for overdue invoices
  return false;
}

async function checkShipmentTrackingCondition(condition: RuleCondition): Promise<boolean> {
  // Placeholder - check for shipments needing tracking updates
  return false;
}

async function checkPriceAlertCondition(condition: RuleCondition): Promise<boolean> {
  // Placeholder - check for price changes exceeding threshold
  return false;
}

async function checkQualityCheckCondition(condition: RuleCondition): Promise<boolean> {
  // Placeholder - check for quality issues
  return false;
}

// ============================================
// FP&A RULE CONDITION CHECKERS
// ============================================

async function checkBudgetVarianceCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for active budgets with line items exceeding variance threshold
  const activeBudgets = await db.select().from(budgets).where(eq(budgets.status, "active"));
  if (activeBudgets.length === 0) return false;

  for (const budget of activeBudgets) {
    const lineItems = await db.select().from(budgetLineItems).where(eq(budgetLineItems.budgetId, budget.id));

    // Check if any category has variance exceeding threshold (default 20%)
    const varianceThreshold = parseFloat(condition.value || "20");
    for (const li of lineItems) {
      const budgeted = parseFloat(li.budgetedAmount || "0");
      const actual = parseFloat(li.actualAmount || "0");
      if (budgeted > 0) {
        const variancePct = Math.abs(((actual - budgeted) / budgeted) * 100);
        if (variancePct >= varianceThreshold) {
          return true;
        }
      }
    }
  }

  return false;
}

async function checkCashFlowAlertCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check if projected closing balance falls below minimum threshold
  const latest = await db.select().from(cashFlowForecasts)
    .where(eq(cashFlowForecasts.status, "active"))
    .orderBy(desc(cashFlowForecasts.forecastDate))
    .limit(1);

  if (latest.length === 0) return false;

  const closingBalance = parseFloat(latest[0].projectedClosingBalance || "0");
  const minCashThreshold = parseFloat(condition.value || "50000"); // Default $50k minimum

  return closingBalance < minCashThreshold;
}

async function checkPacingAlertCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check if pacing status is "behind" or "at_risk"
  const latest = await db.select().from(performancePacing)
    .orderBy(desc(performancePacing.snapshotDate))
    .limit(1);

  if (latest.length === 0) return false;

  return latest[0].overallStatus === "behind" || latest[0].overallStatus === "at_risk";
}

async function checkInventoryAgingAlertCondition(condition: RuleCondition): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Check for high/critical risk inventory items
  const latestSnapshots = await db.select().from(inventoryAgingSnapshots)
    .orderBy(desc(inventoryAgingSnapshots.snapshotDate))
    .limit(200);

  if (latestSnapshots.length === 0) return false;

  // Get latest date's snapshots
  const latestDate = latestSnapshots[0].snapshotDate;
  const snapshot = latestSnapshots.filter(s =>
    s.snapshotDate?.getTime() === latestDate?.getTime()
  );

  const criticalItems = snapshot.filter(s =>
    s.riskLevel === "high" || s.riskLevel === "critical"
  );

  return criticalItems.length > 0;
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
    // FP&A rule task creation
    case "budget_variance_alert":
      return await createBudgetVarianceAlertTask(rule, actionConfig);
    case "cash_flow_alert":
      return await createCashFlowAlertTask(rule, actionConfig);
    case "pacing_alert":
      return await createPacingAlertTask(rule, actionConfig);
    case "inventory_aging_alert":
      return await createInventoryAgingAlertTask(rule, actionConfig);
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

// ============================================
// FP&A TASK CREATION FROM RULES
// ============================================

async function createBudgetVarianceAlertTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const activeBudgets = await db.select().from(budgets).where(eq(budgets.status, "active"));
  if (activeBudgets.length === 0) return null;

  const budget = activeBudgets[0];
  const lineItems = await db.select().from(budgetLineItems).where(eq(budgetLineItems.budgetId, budget.id));

  // Find categories with significant variance
  const varianceThreshold = parseFloat(actionConfig.params?.varianceThreshold || "20");
  const significantVariances: { category: string; budgeted: string; actual: string; variancePct: string }[] = [];

  for (const li of lineItems) {
    const budgeted = parseFloat(li.budgetedAmount || "0");
    const actual = parseFloat(li.actualAmount || "0");
    if (budgeted > 0) {
      const variancePct = ((actual - budgeted) / budgeted) * 100;
      if (Math.abs(variancePct) >= varianceThreshold) {
        significantVariances.push({
          category: li.category,
          budgeted: budgeted.toFixed(2),
          actual: actual.toFixed(2),
          variancePct: variancePct.toFixed(1),
        });
      }
    }
  }

  if (significantVariances.length === 0) return null;

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "query",
      status: "pending_approval",
      priority: "high",
      taskData: JSON.stringify({
        title: `Budget Variance Alert: ${significantVariances.length} categories exceed ${varianceThreshold}% threshold`,
        description: `Budget "${budget.name}" (FY${budget.fiscalYear}) has ${significantVariances.length} line item categories with variance exceeding ${varianceThreshold}%`,
        budgetId: budget.id,
        budgetName: budget.name,
        significantVariances,
      }),
      aiReasoning: `Detected ${significantVariances.length} budget categories with variance exceeding the ${varianceThreshold}% threshold. Largest variance: ${significantVariances[0]?.category} at ${significantVariances[0]?.variancePct}%. Review recommended.`,
      aiConfidence: "0.90",
      relatedEntityType: "budget",
      relatedEntityId: budget.id,
      requiresApproval: false, // Alert only, no action needed
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

async function createCashFlowAlertTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const latest = await db.select().from(cashFlowForecasts)
    .where(eq(cashFlowForecasts.status, "active"))
    .orderBy(desc(cashFlowForecasts.forecastDate))
    .limit(1);

  if (latest.length === 0) return null;

  const forecast = latest[0];
  const closingBalance = parseFloat(forecast.projectedClosingBalance || "0");
  const minThreshold = parseFloat(actionConfig.params?.minCashThreshold || "50000");

  const monthlyBurn = (
    parseFloat(forecast.projectedSupplierPayments || "0") +
    parseFloat(forecast.projectedPayroll || "0") +
    parseFloat(forecast.projectedRent || "0") +
    parseFloat(forecast.projectedMarketingSpend || "0") +
    parseFloat(forecast.projectedOtherOutflows || "0")
  );
  const runwayMonths = monthlyBurn > 0 ? closingBalance / monthlyBurn : Infinity;

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "query",
      status: "pending_approval",
      priority: runwayMonths < 3 ? "urgent" : "high",
      taskData: JSON.stringify({
        title: `Cash Flow Alert: Projected balance $${closingBalance.toFixed(0)} below $${minThreshold.toFixed(0)} threshold`,
        description: `Cash flow forecast "${forecast.name}" projects closing balance below minimum threshold`,
        forecastId: forecast.id,
        forecastName: forecast.name,
        closingBalance: closingBalance.toFixed(2),
        minThreshold: minThreshold.toFixed(2),
        monthlyBurnRate: monthlyBurn.toFixed(2),
        estimatedRunwayMonths: runwayMonths === Infinity ? "N/A" : runwayMonths.toFixed(1),
      }),
      aiReasoning: `Projected closing cash balance of $${closingBalance.toFixed(0)} is below the $${minThreshold.toFixed(0)} minimum threshold. Estimated runway: ${runwayMonths === Infinity ? "N/A" : runwayMonths.toFixed(1) + " months"}. Immediate attention recommended.`,
      aiConfidence: "0.95",
      relatedEntityType: "cash_flow_forecast",
      requiresApproval: false,
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

async function createPacingAlertTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const latest = await db.select().from(performancePacing)
    .orderBy(desc(performancePacing.snapshotDate))
    .limit(1);

  if (latest.length === 0) return null;

  const p = latest[0];

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "query",
      status: "pending_approval",
      priority: p.overallStatus === "at_risk" ? "urgent" : "high",
      taskData: JSON.stringify({
        title: `Pacing Alert: ${p.periodYear}-${String(p.periodMonth).padStart(2, "0")} status is "${p.overallStatus}"`,
        description: `Performance pacing shows ${p.overallStatus} status for the current period`,
        budgetId: p.budgetId,
        period: `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
        daysElapsedPct: p.daysElapsedPct,
        revenuePacePercent: p.revenuePacePercent,
        actualRevenue: p.actualRevenue,
        budgetedRevenue: p.budgetedRevenue,
        projectedMonthEndRevenue: p.projectedMonthEndRevenue,
        actualEbitda: p.actualEbitda,
        budgetedEbitda: p.budgetedEbitda,
        overallStatus: p.overallStatus,
      }),
      aiReasoning: `Performance pacing for ${p.periodYear}-${String(p.periodMonth).padStart(2, "0")} is "${p.overallStatus}". Revenue pace: ${p.revenuePacePercent}%. With ${p.daysElapsedPct}% of the month elapsed, projected month-end revenue is $${p.projectedMonthEndRevenue || "N/A"} vs budget of $${p.budgetedRevenue || "N/A"}.`,
      aiConfidence: "0.88",
      relatedEntityType: "performance_pacing",
      requiresApproval: false,
    })
    .$returningId();

  const [createdTask] = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.id, task.id));

  return createdTask;
}

async function createInventoryAgingAlertTask(
  rule: typeof aiAgentRules.$inferSelect,
  actionConfig: RuleAction
): Promise<typeof aiAgentTasks.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const latestSnapshots = await db.select().from(inventoryAgingSnapshots)
    .orderBy(desc(inventoryAgingSnapshots.snapshotDate))
    .limit(200);

  if (latestSnapshots.length === 0) return null;

  const latestDate = latestSnapshots[0].snapshotDate;
  const snapshot = latestSnapshots.filter(s =>
    s.snapshotDate?.getTime() === latestDate?.getTime()
  );

  const criticalItems = snapshot.filter(s =>
    s.riskLevel === "high" || s.riskLevel === "critical"
  );

  if (criticalItems.length === 0) return null;

  const totalExposure = criticalItems.reduce((s, i) =>
    s + parseFloat(i.val181plus || "0") + parseFloat(i.val121to180 || "0"), 0
  );

  const [task] = await db
    .insert(aiAgentTasks)
    .values({
      taskType: "query",
      status: "pending_approval",
      priority: criticalItems.some(i => i.riskLevel === "critical") ? "urgent" : "high",
      taskData: JSON.stringify({
        title: `Inventory Aging Alert: ${criticalItems.length} items at high/critical risk`,
        description: `${criticalItems.length} products flagged with high or critical aging risk. Total exposure: $${totalExposure.toFixed(2)}`,
        snapshotDate: latestDate,
        criticalItemCount: criticalItems.length,
        totalExposureValue: totalExposure.toFixed(2),
        items: criticalItems.slice(0, 10).map(i => ({
          productId: i.productId,
          sku: i.sku,
          totalValue: i.totalValue,
          averageAgeDays: i.averageAgeDays,
          riskLevel: i.riskLevel,
          val181plus: i.val181plus,
        })),
      }),
      aiReasoning: `${criticalItems.length} inventory items flagged at high/critical risk level. Total write-off exposure (121+ days): $${totalExposure.toFixed(2)}. Consider markdowns, promotions, or write-offs for aged inventory.`,
      aiConfidence: "0.92",
      relatedEntityType: "inventory_aging",
      requiresApproval: false,
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
