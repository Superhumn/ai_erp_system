import { getDb } from "./db";
import { getWorkflowEngine } from "./autonomousWorkflowEngine";
import {
  supplyChainWorkflows,
  workflowRuns,
  workflowApprovalQueue,
  supplyChainEvents,
  approvalThresholds,
  workflowNotifications,
  users,
} from "../drizzle/schema";
import { eq, and, lt, lte, gte, desc, asc, sql, isNull, or, inArray } from "drizzle-orm";
import { sendEmail } from "./_core/email";

// ============================================
// AUTONOMOUS SUPPLY CHAIN ORCHESTRATOR
// Master controller for all supply chain automation
// ============================================

interface OrchestratorConfig {
  schedulerIntervalMs: number;    // How often to check for scheduled workflows
  eventPollingIntervalMs: number; // How often to poll for new events
  escalationCheckIntervalMs: number; // How often to check for escalations
  maxConcurrentWorkflows: number;
  enableAutoStart: boolean;
}

const defaultConfig: OrchestratorConfig = {
  schedulerIntervalMs: 60000,       // 1 minute
  eventPollingIntervalMs: 30000,    // 30 seconds
  escalationCheckIntervalMs: 300000, // 5 minutes
  maxConcurrentWorkflows: 5,
  enableAutoStart: true,
};

class SupplyChainOrchestrator {
  private config: OrchestratorConfig;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private eventInterval: NodeJS.Timeout | null = null;
  private escalationInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeWorkflows = 0;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // ============================================
  // LIFECYCLE MANAGEMENT
  // ============================================

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[Orchestrator] Already running");
      return;
    }

    console.log("[Orchestrator] Starting autonomous supply chain orchestrator...");
    this.isRunning = true;

    // Initialize workflow engine
    const engine = await getWorkflowEngine();

    // Start scheduler loop
    this.schedulerInterval = setInterval(async () => {
      try {
        await this.runScheduledWorkflows();
      } catch (err) {
        console.error("[Orchestrator] Scheduler error:", err);
      }
    }, this.config.schedulerIntervalMs);

    // Start event processing loop
    this.eventInterval = setInterval(async () => {
      try {
        await this.processEvents();
      } catch (err) {
        console.error("[Orchestrator] Event processing error:", err);
      }
    }, this.config.eventPollingIntervalMs);

    // Start escalation check loop
    this.escalationInterval = setInterval(async () => {
      try {
        await this.checkEscalations();
      } catch (err) {
        console.error("[Orchestrator] Escalation check error:", err);
      }
    }, this.config.escalationCheckIntervalMs);

    // Run initial checks
    await this.runScheduledWorkflows();
    await this.processEvents();

    console.log("[Orchestrator] All loops started. Supply chain is now autonomous.");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log("[Orchestrator] Not running");
      return;
    }

    console.log("[Orchestrator] Stopping...");

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    if (this.eventInterval) {
      clearInterval(this.eventInterval);
      this.eventInterval = null;
    }

    if (this.escalationInterval) {
      clearInterval(this.escalationInterval);
      this.escalationInterval = null;
    }

    this.isRunning = false;
    console.log("[Orchestrator] Stopped");
  }

  getStatus(): { isRunning: boolean; activeWorkflows: number } {
    return {
      isRunning: this.isRunning,
      activeWorkflows: this.activeWorkflows,
    };
  }

  // ============================================
  // SCHEDULED WORKFLOW EXECUTION
  // ============================================

  private async runScheduledWorkflows(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // Check capacity
    if (this.activeWorkflows >= this.config.maxConcurrentWorkflows) {
      console.log(`[Orchestrator] At max capacity (${this.activeWorkflows}/${this.config.maxConcurrentWorkflows})`);
      return;
    }

    const now = new Date();

    // Get workflows due for execution
    const dueWorkflows = await db
      .select()
      .from(supplyChainWorkflows)
      .where(
        and(
          eq(supplyChainWorkflows.isActive, true),
          eq(supplyChainWorkflows.triggerType, "scheduled"),
          or(
            isNull(supplyChainWorkflows.nextScheduledRun),
            lte(supplyChainWorkflows.nextScheduledRun, now)
          )
        )
      )
      .limit(this.config.maxConcurrentWorkflows - this.activeWorkflows);

    for (const workflow of dueWorkflows) {
      // Check if already running
      const [runningInstance] = await db
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.workflowId, workflow.id),
            eq(workflowRuns.status, "running")
          )
        );

      if (runningInstance && workflow.maxConcurrentRuns === 1) {
        continue; // Skip if already running
      }

      // Execute workflow
      this.executeWorkflowAsync(workflow, "schedule");

      // Calculate next run time based on cron schedule
      const nextRun = this.calculateNextRun(workflow.cronSchedule || "0 0 * * *");
      await db
        .update(supplyChainWorkflows)
        .set({ nextScheduledRun: nextRun })
        .where(eq(supplyChainWorkflows.id, workflow.id));
    }
  }

  private calculateNextRun(cronSchedule: string): Date {
    // Simplified cron parsing - in production, use a cron library
    const next = new Date();

    // Default: run at next hour
    const parts = cronSchedule.split(" ");
    if (parts.length >= 2) {
      const minute = parseInt(parts[0]) || 0;
      const hour = parts[1] === "*" ? next.getHours() + 1 : parseInt(parts[1]) || 0;

      next.setHours(hour, minute, 0, 0);
      if (next <= new Date()) {
        next.setDate(next.getDate() + 1);
      }
    } else {
      next.setHours(next.getHours() + 1, 0, 0, 0);
    }

    return next;
  }

  // ============================================
  // EVENT-DRIVEN WORKFLOW TRIGGERING
  // ============================================

  private async processEvents(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // Get unprocessed events
    const unprocessedEvents = await db
      .select()
      .from(supplyChainEvents)
      .where(eq(supplyChainEvents.isProcessed, false))
      .orderBy(asc(supplyChainEvents.createdAt))
      .limit(50);

    for (const event of unprocessedEvents) {
      // Find workflows triggered by this event type
      const triggeredWorkflows = await db
        .select()
        .from(supplyChainWorkflows)
        .where(
          and(
            eq(supplyChainWorkflows.isActive, true),
            eq(supplyChainWorkflows.triggerType, "event")
          )
        );

      for (const workflow of triggeredWorkflows) {
        const triggerEvents = workflow.triggerEvents ? JSON.parse(workflow.triggerEvents) : [];

        if (triggerEvents.includes(event.eventType)) {
          // Trigger the workflow
          const eventData = event.eventData ? JSON.parse(event.eventData) : {};
          this.executeWorkflowAsync(workflow, "event", {
            eventId: event.id,
            eventType: event.eventType,
            ...eventData,
          });
        }
      }

      // Mark event as processed
      await db
        .update(supplyChainEvents)
        .set({ isProcessed: true, processedAt: new Date() })
        .where(eq(supplyChainEvents.id, event.id));
    }
  }

  // ============================================
  // THRESHOLD-BASED TRIGGERING
  // ============================================

  async checkThresholds(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // Get threshold-triggered workflows
    const thresholdWorkflows = await db
      .select()
      .from(supplyChainWorkflows)
      .where(
        and(
          eq(supplyChainWorkflows.isActive, true),
          eq(supplyChainWorkflows.triggerType, "threshold")
        )
      );

    for (const workflow of thresholdWorkflows) {
      const thresholdConfig = workflow.thresholdConfig ? JSON.parse(workflow.thresholdConfig) : null;
      if (!thresholdConfig) continue;

      const shouldTrigger = await this.evaluateThreshold(thresholdConfig);

      if (shouldTrigger) {
        this.executeWorkflowAsync(workflow, "threshold", { thresholdConfig });
      }
    }
  }

  private async evaluateThreshold(config: any): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    switch (config.type) {
      case "inventory_below":
        // Check if any inventory is below threshold
        const { inventory } = await import("../drizzle/schema");
        const [lowStock] = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM inventory
          WHERE CAST(quantity AS DECIMAL) - CAST(reservedQuantity AS DECIMAL) < CAST(reorderLevel AS DECIMAL)
        `);
        return ((lowStock as unknown as any[])[0]?.count || 0) > 0;

      case "pending_approvals":
        // Check pending approval count
        const [pendingCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(workflowApprovalQueue)
          .where(eq(workflowApprovalQueue.status, "pending"));
        return (pendingCount?.count || 0) >= (config.threshold || 10);

      case "exception_count":
        // Check open exception count
        const { exceptionLog } = await import("../drizzle/schema");
        const [exceptionCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(exceptionLog)
          .where(eq(exceptionLog.status, "open"));
        return (exceptionCount?.count || 0) >= (config.threshold || 5);

      default:
        return false;
    }
  }

  // ============================================
  // WORKFLOW EXECUTION
  // ============================================

  private async executeWorkflowAsync(
    workflow: typeof supplyChainWorkflows.$inferSelect,
    triggeredBy: "schedule" | "event" | "threshold" | "manual" | "dependency",
    inputData: Record<string, any> = {}
  ): Promise<void> {
    this.activeWorkflows++;

    try {
      console.log(`[Orchestrator] Starting workflow: ${workflow.name} (${workflow.workflowType})`);

      const engine = await getWorkflowEngine();
      const result = await engine.startWorkflow(workflow.id, triggeredBy, inputData);

      console.log(`[Orchestrator] Workflow ${workflow.name} completed: ${result.status}`);
      console.log(`  - Items processed: ${result.itemsProcessed}`);
      console.log(`  - Succeeded: ${result.itemsSucceeded}`);
      console.log(`  - Failed: ${result.itemsFailed}`);
      if (result.totalValue) {
        console.log(`  - Total value: $${result.totalValue.toFixed(2)}`);
      }

      // Check for dependent workflows
      if (result.success) {
        await this.triggerDependentWorkflows(workflow.id);
      }
    } catch (err) {
      console.error(`[Orchestrator] Workflow ${workflow.name} failed:`, err);
    } finally {
      this.activeWorkflows--;
    }
  }

  private async triggerDependentWorkflows(completedWorkflowId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // Find workflows that depend on the completed one
    const dependentWorkflows = await db
      .select()
      .from(supplyChainWorkflows)
      .where(eq(supplyChainWorkflows.isActive, true));

    for (const workflow of dependentWorkflows) {
      const dependencies = workflow.dependsOnWorkflows ? JSON.parse(workflow.dependsOnWorkflows) : [];

      if (dependencies.includes(completedWorkflowId)) {
        console.log(`[Orchestrator] Triggering dependent workflow: ${workflow.name}`);
        this.executeWorkflowAsync(workflow, "dependency", { triggeredByWorkflowId: completedWorkflowId });
      }
    }
  }

  // Manual workflow trigger
  async triggerWorkflow(
    workflowId: number,
    inputData: Record<string, any> = {},
    userId?: number
  ): Promise<{ success: boolean; runId?: number; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };

    const [workflow] = await db
      .select()
      .from(supplyChainWorkflows)
      .where(eq(supplyChainWorkflows.id, workflowId));

    if (!workflow) {
      return { success: false, error: "Workflow not found" };
    }

    if (!workflow.isActive) {
      return { success: false, error: "Workflow is disabled" };
    }

    try {
      const engine = await getWorkflowEngine();
      const result = await engine.startWorkflow(workflowId, "manual", inputData, userId);
      return { success: result.success, runId: result.runId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ============================================
  // APPROVAL & ESCALATION MANAGEMENT
  // ============================================

  private async checkEscalations(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const now = new Date();

    // Get approvals past their escalation time
    const toEscalate = await db
      .select()
      .from(workflowApprovalQueue)
      .where(
        and(
          eq(workflowApprovalQueue.status, "pending"),
          lte(workflowApprovalQueue.escalateAt, now),
          isNull(workflowApprovalQueue.escalatedAt)
        )
      );

    for (const approval of toEscalate) {
      await this.escalateApproval(approval);
    }

    // Check for stale "escalated" items that need further escalation
    const staleEscalated = await db
      .select()
      .from(workflowApprovalQueue)
      .where(
        and(
          eq(workflowApprovalQueue.status, "escalated"),
          lt(workflowApprovalQueue.escalationLevel, 3) // Max 3 levels of escalation
        )
      );

    for (const approval of staleEscalated) {
      const escalatedAt = approval.escalatedAt ? new Date(approval.escalatedAt) : new Date();
      const hoursSinceEscalation = (now.getTime() - escalatedAt.getTime()) / (1000 * 60 * 60);

      // Escalate again after 2 hours at each level
      if (hoursSinceEscalation > 2) {
        await this.escalateApproval(approval);
      }
    }
  }

  private async escalateApproval(approval: typeof workflowApprovalQueue.$inferSelect): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const newLevel = (approval.escalationLevel || 0) + 1;

    // Determine escalation targets based on level
    let escalationRoles: string[];
    switch (newLevel) {
      case 1:
        escalationRoles = ["ops", "admin"];
        break;
      case 2:
        escalationRoles = ["admin", "exec"];
        break;
      case 3:
        escalationRoles = ["exec"];
        break;
      default:
        escalationRoles = ["exec"];
    }

    // Get users with escalation roles
    const escalationUsers = await db
      .select()
      .from(users)
      .where(inArray(users.role, escalationRoles as any[]));

    const userIds = escalationUsers.map(u => u.id);

    await db
      .update(workflowApprovalQueue)
      .set({
        status: "escalated",
        escalatedAt: new Date(),
        escalationLevel: newLevel,
        assignedToRoles: JSON.stringify(escalationRoles),
        assignedToUsers: JSON.stringify(userIds),
      })
      .where(eq(workflowApprovalQueue.id, approval.id));

    // Create escalation notification
    await db.insert(workflowNotifications).values({
      runId: approval.runId,
      notificationType: "warning",
      title: `ESCALATED (Level ${newLevel}): ${approval.title}`,
      message: `This approval has been waiting and requires immediate attention. Value: $${approval.monetaryValue}`,
      targetRoles: JSON.stringify(escalationRoles),
      targetUserIds: JSON.stringify(userIds),
      sendEmail: true,
      sendInApp: true,
      actionUrl: `/approvals/${approval.id}`,
      actionLabel: "Review Now",
    });

    // Send escalation email
    for (const user of escalationUsers) {
      if (user.email) {
        try {
          await sendEmail({
            to: user.email,
            subject: `[ESCALATED] Approval Required: ${approval.title}`,
            text: `An approval request has been escalated to you and requires immediate attention.

Title: ${approval.title}
Description: ${approval.description || "N/A"}
Value: $${approval.monetaryValue}
Escalation Level: ${newLevel}

Please review and approve/reject at your earliest convenience.`,
          });
        } catch (err) {
          console.error(`Failed to send escalation email to ${user.email}:`, err);
        }
      }
    }

    console.log(`[Orchestrator] Escalated approval ${approval.id} to level ${newLevel}`);
  }

  // Process approval decision
  async processApprovalDecision(
    approvalId: number,
    approved: boolean,
    userId: number,
    notes?: string
  ): Promise<{ success: boolean; workflowResumed: boolean }> {
    const db = await getDb();
    if (!db) return { success: false, workflowResumed: false };

    const engine = await getWorkflowEngine();
    const result = await engine.processApproval(approvalId, approved, userId, notes);
    return { success: result.success, workflowResumed: result.runResumed };
  }

  // Get pending approvals for a user
  async getPendingApprovals(userId: number, role: string): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    const approvals = await db
      .select()
      .from(workflowApprovalQueue)
      .where(
        and(
          or(
            eq(workflowApprovalQueue.status, "pending"),
            eq(workflowApprovalQueue.status, "escalated")
          ),
          or(
            sql`JSON_CONTAINS(${workflowApprovalQueue.assignedToUsers}, CAST(${userId} AS JSON))`,
            sql`JSON_CONTAINS(${workflowApprovalQueue.assignedToRoles}, JSON_QUOTE(${role}))`
          )
        )
      )
      .orderBy(desc(workflowApprovalQueue.escalationLevel), asc(workflowApprovalQueue.requestedAt));

    return approvals;
  }

  // ============================================
  // WORKFLOW CONFIGURATION
  // ============================================

  async configureDefaultWorkflows(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const defaultWorkflows = [
      {
        name: "Daily Demand Forecasting",
        workflowType: "demand_forecasting" as const,
        description: "Generate daily demand forecasts for all active products",
        triggerType: "scheduled" as const,
        cronSchedule: "0 6 * * *", // 6 AM daily
        requiresApproval: false,
      },
      {
        name: "Production Planning",
        workflowType: "production_planning" as const,
        description: "Create production plans from forecasts",
        triggerType: "scheduled" as const,
        cronSchedule: "0 7 * * *", // 7 AM daily
        dependsOnWorkflows: "[]", // Will be updated after demand_forecasting is created
        requiresApproval: false,
      },
      {
        name: "Material Requirements Planning",
        workflowType: "material_requirements" as const,
        description: "Calculate material needs and generate suggested POs",
        triggerType: "scheduled" as const,
        cronSchedule: "0 8 * * *", // 8 AM daily
        requiresApproval: true,
        autoApproveThreshold: "1000",
      },
      {
        name: "Procurement Processing",
        workflowType: "procurement" as const,
        description: "Convert approved suggested POs to actual POs",
        triggerType: "event" as const,
        triggerEvents: JSON.stringify(["approval_completed"]),
        requiresApproval: false,
      },
      {
        name: "Inventory Reorder Check",
        workflowType: "inventory_reorder" as const,
        description: "Check inventory levels and trigger reorders",
        triggerType: "threshold" as const,
        thresholdConfig: JSON.stringify({ type: "inventory_below" }),
        requiresApproval: true,
        autoApproveThreshold: "500",
      },
      {
        name: "Inventory Optimization",
        workflowType: "inventory_optimization" as const,
        description: "Analyze and optimize inventory distribution",
        triggerType: "scheduled" as const,
        cronSchedule: "0 2 * * 0", // 2 AM Sunday
        requiresApproval: false,
      },
      {
        name: "Work Order Generation",
        workflowType: "work_order_generation" as const,
        description: "Generate work orders from approved production plans",
        triggerType: "event" as const,
        triggerEvents: JSON.stringify(["production_planning"]),
        requiresApproval: false,
      },
      {
        name: "Production Scheduling",
        workflowType: "production_scheduling" as const,
        description: "Schedule work orders based on capacity and materials",
        triggerType: "scheduled" as const,
        cronSchedule: "0 5 * * *", // 5 AM daily
        requiresApproval: false,
      },
      {
        name: "Order Fulfillment",
        workflowType: "order_fulfillment" as const,
        description: "Process and fulfill confirmed orders",
        triggerType: "event" as const,
        triggerEvents: JSON.stringify(["order_confirmed"]),
        requiresApproval: false,
      },
      {
        name: "Shipment Tracking",
        workflowType: "shipment_tracking" as const,
        description: "Track in-transit shipments and detect delays",
        triggerType: "scheduled" as const,
        cronSchedule: "0 */2 * * *", // Every 2 hours
        requiresApproval: false,
      },
      {
        name: "Supplier Performance Review",
        workflowType: "supplier_management" as const,
        description: "Calculate supplier performance metrics",
        triggerType: "scheduled" as const,
        cronSchedule: "0 0 1 * *", // 1st of each month
        requiresApproval: false,
      },
      {
        name: "Invoice Matching",
        workflowType: "invoice_matching" as const,
        description: "Match vendor invoices to purchase orders",
        triggerType: "event" as const,
        triggerEvents: JSON.stringify(["invoice_received"]),
        requiresApproval: false,
      },
      {
        name: "Payment Processing",
        workflowType: "payment_processing" as const,
        description: "Process approved invoices for payment",
        triggerType: "scheduled" as const,
        cronSchedule: "0 10 * * 1,3,5", // 10 AM Mon/Wed/Fri
        requiresApproval: true,
        autoApproveThreshold: "2000",
      },
      {
        name: "Exception Handling",
        workflowType: "exception_handling" as const,
        description: "Triage and resolve open exceptions",
        triggerType: "threshold" as const,
        thresholdConfig: JSON.stringify({ type: "exception_count", threshold: 3 }),
        requiresApproval: false,
      },
    ];

    for (const wf of defaultWorkflows) {
      // Check if already exists
      const [existing] = await db
        .select()
        .from(supplyChainWorkflows)
        .where(eq(supplyChainWorkflows.workflowType, wf.workflowType));

      if (!existing) {
        await db.insert(supplyChainWorkflows).values({
          ...wf,
          isActive: true,
          maxConcurrentRuns: 1,
          timeoutMinutes: 60,
          retryAttempts: 3,
          retryDelayMinutes: 5,
          escalationMinutes: 60,
          approvalRoles: JSON.stringify(["ops", "admin"]),
          escalationRoles: JSON.stringify(["admin", "exec"]),
        });
        console.log(`[Orchestrator] Created default workflow: ${wf.name}`);
      }
    }

    // Configure default approval thresholds
    const defaultThresholds = [
      {
        name: "Purchase Order Approval",
        entityType: "purchase_order" as const,
        autoApproveMaxAmount: "500",
        level1MaxAmount: "5000",
        level2MaxAmount: "25000",
        level3MaxAmount: "100000",
        level1Roles: JSON.stringify(["ops"]),
        level2Roles: JSON.stringify(["admin"]),
        level3Roles: JSON.stringify(["exec"]),
        execRoles: JSON.stringify(["exec"]),
      },
      {
        name: "Payment Approval",
        entityType: "payment" as const,
        autoApproveMaxAmount: "1000",
        level1MaxAmount: "10000",
        level2MaxAmount: "50000",
        level3MaxAmount: "200000",
        level1Roles: JSON.stringify(["finance"]),
        level2Roles: JSON.stringify(["admin"]),
        level3Roles: JSON.stringify(["exec"]),
        execRoles: JSON.stringify(["exec"]),
      },
      {
        name: "Inventory Transfer Approval",
        entityType: "inventory_transfer" as const,
        autoApproveMaxAmount: "10000",
        level1MaxAmount: "50000",
        level2MaxAmount: "100000",
        level3MaxAmount: "500000",
        level1Roles: JSON.stringify(["ops"]),
        level2Roles: JSON.stringify(["admin"]),
        level3Roles: JSON.stringify(["exec"]),
        execRoles: JSON.stringify(["exec"]),
      },
    ];

    for (const threshold of defaultThresholds) {
      const [existing] = await db
        .select()
        .from(approvalThresholds)
        .where(eq(approvalThresholds.entityType, threshold.entityType));

      if (!existing) {
        await db.insert(approvalThresholds).values({
          ...threshold,
          isActive: true,
          level1EscalationMinutes: 60,
          level2EscalationMinutes: 120,
          level3EscalationMinutes: 240,
        });
        console.log(`[Orchestrator] Created default threshold: ${threshold.name}`);
      }
    }
  }

  // ============================================
  // MONITORING & METRICS
  // ============================================

  async getSystemStatus(): Promise<{
    isRunning: boolean;
    activeWorkflows: number;
    pendingApprovals: number;
    openExceptions: number;
    todayMetrics: any;
  }> {
    const db = await getDb();
    if (!db) {
      return {
        isRunning: this.isRunning,
        activeWorkflows: this.activeWorkflows,
        pendingApprovals: 0,
        openExceptions: 0,
        todayMetrics: null,
      };
    }

    const [pendingCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(workflowApprovalQueue)
      .where(
        or(
          eq(workflowApprovalQueue.status, "pending"),
          eq(workflowApprovalQueue.status, "escalated")
        )
      );

    const { exceptionLog } = await import("../drizzle/schema");
    const [exceptionCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(exceptionLog)
      .where(eq(exceptionLog.status, "open"));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayRuns] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(workflowRuns)
      .where(gte(workflowRuns.createdAt, today));

    return {
      isRunning: this.isRunning,
      activeWorkflows: this.activeWorkflows,
      pendingApprovals: pendingCount?.count || 0,
      openExceptions: exceptionCount?.count || 0,
      todayMetrics: {
        totalRuns: todayRuns?.total || 0,
        completed: todayRuns?.completed || 0,
        failed: todayRuns?.failed || 0,
      },
    };
  }

  async getWorkflowHistory(limit: number = 50): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    const runs = await db
      .select({
        run: workflowRuns,
        workflow: supplyChainWorkflows,
      })
      .from(workflowRuns)
      .innerJoin(supplyChainWorkflows, eq(workflowRuns.workflowId, supplyChainWorkflows.id))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(limit);

    return runs;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let orchestratorInstance: SupplyChainOrchestrator | null = null;

export function getOrchestrator(): SupplyChainOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SupplyChainOrchestrator();
  }
  return orchestratorInstance;
}

export async function startOrchestrator(): Promise<void> {
  const orchestrator = getOrchestrator();
  await orchestrator.configureDefaultWorkflows();
  await orchestrator.start();
}

export async function stopOrchestrator(): Promise<void> {
  const orchestrator = getOrchestrator();
  await orchestrator.stop();
}

export { SupplyChainOrchestrator };
