import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import {
  supplyChainWorkflows,
  workflowRuns,
  workflowSteps,
  workflowApprovalQueue,
  autonomousDecisions,
  supplyChainEvents,
  workflowMetrics,
  approvalThresholds,
  exceptionRules,
  exceptionLog,
  supplierPerformance,
  workflowNotifications,
} from "../drizzle/schema";
import { eq, and, lt, lte, gte, desc, asc, sql, isNull, or, inArray } from "drizzle-orm";
import { sendEmail } from "./_core/email";

// ============================================
// AUTONOMOUS WORKFLOW ENGINE
// Core orchestration for supply chain automation
// ============================================

export interface WorkflowContext {
  workflowId: number;
  runId: number;
  config: Record<string, any>;
  inputData: Record<string, any>;
  stepResults: Map<number, any>;
  decisions: any[];
  exceptions: any[];
}

export interface StepResult {
  success: boolean;
  data?: any;
  error?: string;
  aiResponse?: any;
  confidence?: number;
  tokensUsed?: number;
  createdEntities?: Array<{ type: string; id: number }>;
  modifiedEntities?: Array<{ type: string; id: number }>;
  requiresApproval?: boolean;
  approvalData?: any;
}

export interface WorkflowResult {
  success: boolean;
  runId: number;
  status: string;
  itemsProcessed: number;
  itemsSucceeded: number;
  itemsFailed: number;
  totalValue?: number;
  outputData?: any;
  error?: string;
  pendingApprovals?: number;
}

// ============================================
// WORKFLOW EXECUTION ENGINE
// ============================================

export class WorkflowEngine {
  private db: any;
  private isInitialized = false;

  async initialize(): Promise<void> {
    this.db = await getDb();
    if (this.db) {
      this.isInitialized = true;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.db) {
      throw new Error("WorkflowEngine not initialized. Call initialize() first.");
    }
  }

  // Start a new workflow run
  async startWorkflow(
    workflowId: number,
    triggeredBy: "schedule" | "event" | "threshold" | "manual" | "dependency",
    inputData: Record<string, any> = {},
    triggeredByUserId?: number
  ): Promise<WorkflowResult> {
    this.ensureInitialized();

    // Get workflow definition
    const [workflow] = await this.db
      .select()
      .from(supplyChainWorkflows)
      .where(eq(supplyChainWorkflows.id, workflowId));

    if (!workflow) {
      return { success: false, runId: 0, status: "failed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, error: "Workflow not found" };
    }

    if (!workflow.isActive) {
      return { success: false, runId: 0, status: "failed", itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, error: "Workflow is disabled" };
    }

    // Generate run number
    const runNumber = `WF-${workflow.workflowType.toUpperCase().slice(0, 4)}-${Date.now().toString(36).toUpperCase()}`;

    // Create workflow run
    const [run] = await this.db
      .insert(workflowRuns)
      .values({
        workflowId,
        runNumber,
        status: "running",
        triggeredBy,
        triggerData: JSON.stringify({ triggeredAt: new Date().toISOString(), ...inputData }),
        triggeredByUserId,
        startedAt: new Date(),
        inputData: JSON.stringify(inputData),
        attemptNumber: 1,
      })
      .$returningId();

    const runId = run.id;

    console.log(`[WorkflowEngine] Starting workflow ${workflow.name} (run ${runNumber})`);

    // Create workflow context
    const context: WorkflowContext = {
      workflowId,
      runId,
      config: workflow.executionConfig ? JSON.parse(workflow.executionConfig) : {},
      inputData,
      stepResults: new Map(),
      decisions: [],
      exceptions: [],
    };

    try {
      // Execute workflow based on type
      const result = await this.executeWorkflowByType(workflow, context);

      // Update workflow run with results
      await this.db
        .update(workflowRuns)
        .set({
          status: result.success ? "completed" : (result.pendingApprovals ? "awaiting_approval" : "failed"),
          completedAt: new Date(),
          durationMs: Date.now() - new Date(run.startedAt || Date.now()).getTime(),
          outputData: JSON.stringify(result.outputData),
          itemsProcessed: result.itemsProcessed,
          itemsSucceeded: result.itemsSucceeded,
          itemsFailed: result.itemsFailed,
          totalValue: result.totalValue?.toString(),
          errorMessage: result.error,
        })
        .where(eq(workflowRuns.id, runId));

      // Update workflow metadata
      await this.db
        .update(supplyChainWorkflows)
        .set({
          lastRunAt: new Date(),
          successCount: result.success ? sql`${supplyChainWorkflows.successCount} + 1` : supplyChainWorkflows.successCount,
          failureCount: result.success ? supplyChainWorkflows.failureCount : sql`${supplyChainWorkflows.failureCount} + 1`,
        })
        .where(eq(supplyChainWorkflows.id, workflowId));

      // Emit completion event
      await this.emitEvent(
        result.success ? "workflow_completed" : "workflow_failed",
        result.success ? "info" : "error",
        "workflow",
        "workflow_run",
        runId,
        { workflowType: workflow.workflowType, ...result }
      );

      return { ...result, runId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.db
        .update(workflowRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage,
          errorDetails: JSON.stringify({ stack: err instanceof Error ? err.stack : undefined }),
        })
        .where(eq(workflowRuns.id, runId));

      await this.db
        .update(supplyChainWorkflows)
        .set({ failureCount: sql`${supplyChainWorkflows.failureCount} + 1` })
        .where(eq(supplyChainWorkflows.id, workflowId));

      return {
        success: false,
        runId,
        status: "failed",
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        error: errorMessage,
      };
    }
  }

  // Route to appropriate workflow executor
  private async executeWorkflowByType(
    workflow: typeof supplyChainWorkflows.$inferSelect,
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    const { workflowProcessors } = await import("./workflowProcessors");

    switch (workflow.workflowType) {
      case "demand_forecasting":
        return workflowProcessors.demandForecasting.execute(this, context);
      case "production_planning":
        return workflowProcessors.productionPlanning.execute(this, context);
      case "material_requirements":
        return workflowProcessors.materialRequirements.execute(this, context);
      case "procurement":
        return workflowProcessors.procurement.execute(this, context);
      case "inventory_reorder":
        return workflowProcessors.inventoryReorder.execute(this, context);
      case "inventory_transfer":
        return workflowProcessors.inventoryTransfer.execute(this, context);
      case "inventory_optimization":
        return workflowProcessors.inventoryOptimization.execute(this, context);
      case "work_order_generation":
        return workflowProcessors.workOrderGeneration.execute(this, context);
      case "production_scheduling":
        return workflowProcessors.productionScheduling.execute(this, context);
      case "freight_procurement":
        return workflowProcessors.freightProcurement.execute(this, context);
      case "shipment_tracking":
        return workflowProcessors.shipmentTracking.execute(this, context);
      case "order_fulfillment":
        return workflowProcessors.orderFulfillment.execute(this, context);
      case "supplier_management":
        return workflowProcessors.supplierManagement.execute(this, context);
      case "quality_inspection":
        return workflowProcessors.qualityInspection.execute(this, context);
      case "invoice_matching":
        return workflowProcessors.invoiceMatching.execute(this, context);
      case "payment_processing":
        return workflowProcessors.paymentProcessing.execute(this, context);
      case "exception_handling":
        return workflowProcessors.exceptionHandling.execute(this, context);
      case "vendor_quote_procurement":
        return workflowProcessors.vendorQuoteProcurement.execute(this, context);
      case "vendor_quote_analysis":
        return workflowProcessors.vendorQuoteAnalysis.execute(this, context);
      default:
        throw new Error(`Unknown workflow type: ${workflow.workflowType}`);
    }
  }

  // ============================================
  // STEP MANAGEMENT
  // ============================================

  async recordStep(
    context: WorkflowContext,
    stepNumber: number,
    stepName: string,
    stepType: string,
    executor: () => Promise<StepResult>
  ): Promise<StepResult> {
    this.ensureInitialized();

    // Create step record
    const [step] = await this.db
      .insert(workflowSteps)
      .values({
        runId: context.runId,
        stepNumber,
        stepName,
        stepType,
        status: "running",
        startedAt: new Date(),
        inputData: JSON.stringify(context.inputData),
      })
      .$returningId();

    // Update run progress
    await this.db
      .update(workflowRuns)
      .set({
        currentStepName: stepName,
        completedSteps: stepNumber - 1,
      })
      .where(eq(workflowRuns.id, context.runId));

    const startTime = Date.now();

    try {
      const result = await executor();

      await this.db
        .update(workflowSteps)
        .set({
          status: result.success ? "completed" : "failed",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          outputData: JSON.stringify(result.data),
          errorMessage: result.error,
          aiResponse: result.aiResponse ? JSON.stringify(result.aiResponse) : null,
          aiConfidence: result.confidence?.toString(),
          aiTokensUsed: result.tokensUsed,
          createdEntityType: result.createdEntities?.[0]?.type,
          createdEntityId: result.createdEntities?.[0]?.id,
          modifiedEntityType: result.modifiedEntities?.[0]?.type,
          modifiedEntityId: result.modifiedEntities?.[0]?.id,
        })
        .where(eq(workflowSteps.id, step.id));

      context.stepResults.set(stepNumber, result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.db
        .update(workflowSteps)
        .set({
          status: "failed",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorMessage,
        })
        .where(eq(workflowSteps.id, step.id));

      return { success: false, error: errorMessage };
    }
  }

  // ============================================
  // AI DECISION MAKING
  // ============================================

  async makeAIDecision(
    context: WorkflowContext,
    decisionType: string,
    prompt: string,
    options: any[],
    responseSchema: any
  ): Promise<{ decision: any; reasoning: string; confidence: number }> {
    this.ensureInitialized();

    const startTime = Date.now();

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert supply chain AI making autonomous decisions for an ERP system.
You must analyze the data provided and make the best decision based on:
- Cost optimization
- Lead time efficiency
- Quality/reliability scores
- Risk minimization
- Business rules and constraints

Always provide clear reasoning for your decision.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "decision_response",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    const content = response.choices[0].message.content;
    const decision = JSON.parse(typeof content === "string" ? content : "{}");

    // Log the decision
    await this.db.insert(autonomousDecisions).values({
      runId: context.runId,
      decisionType,
      decisionContext: prompt,
      optionsConsidered: JSON.stringify(options),
      chosenOption: JSON.stringify(decision.choice || decision),
      aiReasoning: decision.reasoning || "",
      confidence: (decision.confidence || 85).toString(),
    });

    context.decisions.push({
      type: decisionType,
      decision: decision.choice || decision,
      reasoning: decision.reasoning,
      confidence: decision.confidence || 85,
    });

    return {
      decision: decision.choice || decision,
      reasoning: decision.reasoning || "",
      confidence: decision.confidence || 85,
    };
  }

  // ============================================
  // APPROVAL MANAGEMENT
  // ============================================

  async checkApprovalRequired(
    entityType: string,
    amount: number
  ): Promise<{ required: boolean; autoApprove: boolean; level?: number; roles?: string[] }> {
    this.ensureInitialized();

    const [threshold] = await this.db
      .select()
      .from(approvalThresholds)
      .where(
        and(
          eq(approvalThresholds.entityType, entityType as any),
          eq(approvalThresholds.isActive, true)
        )
      );

    if (!threshold) {
      // No threshold configured, default to auto-approve for small amounts
      return { required: amount > 500, autoApprove: amount <= 500 };
    }

    const autoApproveMax = parseFloat(threshold.autoApproveMaxAmount || "0");
    const level1Max = parseFloat(threshold.level1MaxAmount || "0");
    const level2Max = parseFloat(threshold.level2MaxAmount || "0");
    const level3Max = parseFloat(threshold.level3MaxAmount || "0");

    if (amount <= autoApproveMax) {
      return { required: false, autoApprove: true };
    }

    if (amount <= level1Max) {
      return {
        required: true,
        autoApprove: false,
        level: 1,
        roles: threshold.level1Roles ? JSON.parse(threshold.level1Roles) : ["ops"],
      };
    }

    if (amount <= level2Max) {
      return {
        required: true,
        autoApprove: false,
        level: 2,
        roles: threshold.level2Roles ? JSON.parse(threshold.level2Roles) : ["admin"],
      };
    }

    if (amount <= level3Max) {
      return {
        required: true,
        autoApprove: false,
        level: 3,
        roles: threshold.level3Roles ? JSON.parse(threshold.level3Roles) : ["exec"],
      };
    }

    return {
      required: true,
      autoApprove: false,
      level: 4,
      roles: threshold.execRoles ? JSON.parse(threshold.execRoles) : ["exec"],
    };
  }

  async requestApproval(
    context: WorkflowContext,
    approvalType: string,
    title: string,
    description: string,
    amount: number,
    relatedEntityType: string,
    relatedEntityId: number,
    aiRecommendation: string,
    confidence: number
  ): Promise<{ approvalId: number; autoApproved: boolean }> {
    this.ensureInitialized();

    const approvalCheck = await this.checkApprovalRequired(approvalType, amount);

    if (approvalCheck.autoApprove) {
      // Auto-approve
      const [approval] = await this.db
        .insert(workflowApprovalQueue)
        .values({
          runId: context.runId,
          approvalType: approvalType as any,
          title,
          description,
          monetaryValue: amount.toString(),
          contextData: JSON.stringify(context.inputData),
          aiRecommendation,
          aiConfidence: confidence.toString(),
          riskAssessment: confidence > 80 ? "low" : confidence > 60 ? "medium" : "high",
          relatedEntityType,
          relatedEntityId,
          status: "auto_approved",
          wasAutoApproved: true,
          autoApprovalReason: `Amount $${amount} is below auto-approve threshold`,
          resolvedAt: new Date(),
        })
        .$returningId();

      return { approvalId: approval.id, autoApproved: true };
    }

    // Require manual approval
    const escalateAt = new Date();
    escalateAt.setMinutes(escalateAt.getMinutes() + 60); // Default 60 min escalation

    const [approval] = await this.db
      .insert(workflowApprovalQueue)
      .values({
        runId: context.runId,
        approvalType: approvalType as any,
        title,
        description,
        monetaryValue: amount.toString(),
        contextData: JSON.stringify(context.inputData),
        aiRecommendation,
        aiConfidence: confidence.toString(),
        riskAssessment: confidence > 80 ? "low" : confidence > 60 ? "medium" : "high",
        relatedEntityType,
        relatedEntityId,
        status: "pending",
        assignedToRoles: JSON.stringify(approvalCheck.roles),
        escalateAt,
        escalationLevel: 0,
      })
      .$returningId();

    // Update run status
    await this.db
      .update(workflowRuns)
      .set({
        status: "awaiting_approval",
        approvalRequestedAt: new Date(),
      })
      .where(eq(workflowRuns.id, context.runId));

    // Send notification
    await this.sendNotification(
      context.runId,
      "approval_needed",
      title,
      `Approval required for ${approvalType}: ${description}. Amount: $${amount.toFixed(2)}`,
      approvalCheck.roles || [],
      true, // send email
      `/approvals/${approval.id}`
    );

    return { approvalId: approval.id, autoApproved: false };
  }

  async processApproval(
    approvalId: number,
    approved: boolean,
    resolvedBy: number,
    notes?: string
  ): Promise<{ success: boolean; runResumed: boolean }> {
    this.ensureInitialized();

    const [approval] = await this.db
      .select()
      .from(workflowApprovalQueue)
      .where(eq(workflowApprovalQueue.id, approvalId));

    if (!approval) {
      return { success: false, runResumed: false };
    }

    await this.db
      .update(workflowApprovalQueue)
      .set({
        status: approved ? "approved" : "rejected",
        resolvedBy,
        resolvedAt: new Date(),
        resolutionNotes: notes,
      })
      .where(eq(workflowApprovalQueue.id, approvalId));

    // Update workflow run
    await this.db
      .update(workflowRuns)
      .set({
        status: approved ? "approved" : "rejected",
        approvedBy: approved ? resolvedBy : undefined,
        approvedAt: approved ? new Date() : undefined,
        rejectedBy: approved ? undefined : resolvedBy,
        rejectedAt: approved ? undefined : new Date(),
        rejectionReason: approved ? undefined : notes,
      })
      .where(eq(workflowRuns.id, approval.runId));

    if (approved) {
      // Resume workflow execution
      // This would trigger continuation of the workflow from where it paused
      // For now, we'll mark it as approved and let the scheduler pick it up
    }

    // Send notification about resolution
    await this.sendNotification(
      approval.runId,
      "approval_completed",
      `${approved ? "Approved" : "Rejected"}: ${approval.title}`,
      `The approval request has been ${approved ? "approved" : "rejected"} by the reviewer.${notes ? ` Notes: ${notes}` : ""}`,
      [],
      false
    );

    return { success: true, runResumed: approved };
  }

  // ============================================
  // EXCEPTION HANDLING
  // ============================================

  async handleException(
    context: WorkflowContext,
    exceptionType: string,
    title: string,
    description: string,
    exceptionData: any,
    entityType?: string,
    entityId?: number
  ): Promise<{ handled: boolean; action: string; requiresHuman: boolean }> {
    this.ensureInitialized();

    // Find matching exception rule
    const rules = await this.db
      .select()
      .from(exceptionRules)
      .where(
        and(
          eq(exceptionRules.exceptionType, exceptionType as any),
          eq(exceptionRules.isActive, true)
        )
      )
      .orderBy(asc(exceptionRules.priority));

    let matchedRule = rules[0]; // Use first matching rule

    // Log the exception
    const [exception] = await this.db
      .insert(exceptionLog)
      .values({
        runId: context.runId,
        ruleId: matchedRule?.id,
        exceptionType,
        severity: matchedRule ? "medium" : "high",
        title,
        description,
        exceptionData: JSON.stringify(exceptionData),
        entityType,
        entityId,
        status: "open",
      })
      .$returningId();

    context.exceptions.push({
      id: exception.id,
      type: exceptionType,
      title,
      handled: false,
    });

    if (!matchedRule) {
      // No rule found, route to human
      await this.sendNotification(
        context.runId,
        "exception",
        `Exception: ${title}`,
        description,
        ["ops", "admin"],
        true,
        `/exceptions/${exception.id}`
      );

      return { handled: false, action: "routed_to_human", requiresHuman: true };
    }

    // Apply resolution strategy
    switch (matchedRule.resolutionStrategy) {
      case "auto_resolve":
        const autoAction = matchedRule.autoResolutionAction
          ? JSON.parse(matchedRule.autoResolutionAction)
          : { action: "ignore" };

        await this.db
          .update(exceptionLog)
          .set({
            status: "resolved",
            resolutionType: "auto_resolved",
            resolutionAction: JSON.stringify(autoAction),
            resolvedAt: new Date(),
          })
          .where(eq(exceptionLog.id, exception.id));

        return { handled: true, action: autoAction.action, requiresHuman: false };

      case "ai_decide":
        // Use AI to decide resolution
        const aiDecision = await this.makeAIDecision(
          context,
          "exception_handling",
          `An exception occurred in the supply chain workflow:
Type: ${exceptionType}
Title: ${title}
Description: ${description}
Data: ${JSON.stringify(exceptionData)}

Decide the best resolution action from: accept_variance, reject_and_reorder, escalate, ignore, retry`,
          ["accept_variance", "reject_and_reorder", "escalate", "ignore", "retry"],
          {
            type: "object",
            properties: {
              choice: { type: "string" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["choice", "reasoning", "confidence"],
            additionalProperties: false,
          }
        );

        await this.db
          .update(exceptionLog)
          .set({
            status: aiDecision.confidence > 70 ? "resolved" : "in_progress",
            resolutionType: "ai_resolved",
            resolutionAction: JSON.stringify({ action: aiDecision.decision, reasoning: aiDecision.reasoning }),
            resolvedAt: aiDecision.confidence > 70 ? new Date() : null,
          })
          .where(eq(exceptionLog.id, exception.id));

        return {
          handled: aiDecision.confidence > 70,
          action: aiDecision.decision,
          requiresHuman: aiDecision.confidence <= 70,
        };

      case "route_to_human":
        await this.sendNotification(
          context.runId,
          "exception",
          `Action Required: ${title}`,
          description,
          matchedRule.notifyRoles ? JSON.parse(matchedRule.notifyRoles) : ["ops"],
          true,
          `/exceptions/${exception.id}`
        );

        return { handled: false, action: "routed_to_human", requiresHuman: true };

      case "escalate":
        await this.db
          .update(exceptionLog)
          .set({
            status: "escalated",
            severity: "high",
            escalatedAt: new Date(),
          })
          .where(eq(exceptionLog.id, exception.id));

        await this.sendNotification(
          context.runId,
          "exception",
          `ESCALATED: ${title}`,
          `This exception has been automatically escalated: ${description}`,
          ["admin", "exec"],
          true,
          `/exceptions/${exception.id}`
        );

        return { handled: false, action: "escalated", requiresHuman: true };

      case "notify_and_continue":
        await this.sendNotification(
          context.runId,
          "warning",
          title,
          description,
          matchedRule.notifyRoles ? JSON.parse(matchedRule.notifyRoles) : ["ops"],
          false
        );

        await this.db
          .update(exceptionLog)
          .set({ status: "resolved", resolutionType: "auto_resolved" })
          .where(eq(exceptionLog.id, exception.id));

        return { handled: true, action: "notified_and_continued", requiresHuman: false };

      case "halt_workflow":
        await this.db
          .update(workflowRuns)
          .set({
            status: "failed",
            errorMessage: `Workflow halted due to exception: ${title}`,
          })
          .where(eq(workflowRuns.id, context.runId));

        return { handled: false, action: "workflow_halted", requiresHuman: true };

      default:
        return { handled: false, action: "unknown_strategy", requiresHuman: true };
    }
  }

  // ============================================
  // EVENT EMISSION
  // ============================================

  async emitEvent(
    eventType: string,
    severity: "info" | "warning" | "error" | "critical",
    sourceSystem: string,
    sourceEntityType: string,
    sourceEntityId: number,
    eventData: any
  ): Promise<number> {
    this.ensureInitialized();

    const [event] = await this.db
      .insert(supplyChainEvents)
      .values({
        eventType: eventType as any,
        severity,
        sourceSystem,
        sourceEntityType,
        sourceEntityId,
        eventData: JSON.stringify(eventData),
        summary: `${eventType}: ${sourceEntityType} #${sourceEntityId}`,
      })
      .$returningId();

    return event.id;
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  async sendNotification(
    runId: number,
    notificationType: string,
    title: string,
    message: string,
    targetRoles: string[],
    sendEmailNotification: boolean,
    actionUrl?: string
  ): Promise<void> {
    this.ensureInitialized();

    await this.db.insert(workflowNotifications).values({
      runId,
      notificationType: notificationType as any,
      title,
      message,
      targetRoles: JSON.stringify(targetRoles),
      sendEmail: sendEmailNotification,
      sendInApp: true,
      actionUrl,
      actionLabel: actionUrl ? "View Details" : undefined,
    });

    // TODO: Actually send email if configured
    // if (sendEmailNotification) {
    //   await sendEmail({ ... });
    // }
  }

  // ============================================
  // METRICS
  // ============================================

  async recordMetrics(
    workflowId: number,
    runResult: WorkflowResult,
    durationMs: number,
    aiDecisions: number,
    tokensUsed: number
  ): Promise<void> {
    this.ensureInitialized();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert metrics for today
    const [existing] = await this.db
      .select()
      .from(workflowMetrics)
      .where(
        and(
          eq(workflowMetrics.workflowId, workflowId),
          eq(workflowMetrics.metricDate, today)
        )
      );

    if (existing) {
      await this.db
        .update(workflowMetrics)
        .set({
          totalRuns: sql`${workflowMetrics.totalRuns} + 1`,
          successfulRuns: runResult.success
            ? sql`${workflowMetrics.successfulRuns} + 1`
            : workflowMetrics.successfulRuns,
          failedRuns: runResult.success
            ? workflowMetrics.failedRuns
            : sql`${workflowMetrics.failedRuns} + 1`,
          itemsProcessed: sql`${workflowMetrics.itemsProcessed} + ${runResult.itemsProcessed}`,
          totalValueProcessed: runResult.totalValue
            ? sql`${workflowMetrics.totalValueProcessed} + ${runResult.totalValue}`
            : workflowMetrics.totalValueProcessed,
          aiDecisionCount: sql`${workflowMetrics.aiDecisionCount} + ${aiDecisions}`,
          totalTokensUsed: sql`${workflowMetrics.totalTokensUsed} + ${tokensUsed}`,
        })
        .where(eq(workflowMetrics.id, existing.id));
    } else {
      await this.db.insert(workflowMetrics).values({
        workflowId,
        metricDate: today,
        totalRuns: 1,
        successfulRuns: runResult.success ? 1 : 0,
        failedRuns: runResult.success ? 0 : 1,
        averageDurationMs: durationMs,
        itemsProcessed: runResult.itemsProcessed,
        totalValueProcessed: runResult.totalValue?.toString(),
        aiDecisionCount: aiDecisions,
        totalTokensUsed: tokensUsed,
      });
    }
  }

  // ============================================
  // DATABASE ACCESS (for workflow processors)
  // ============================================

  getDb() {
    return this.db;
  }
}

// Singleton instance
let workflowEngineInstance: WorkflowEngine | null = null;

export async function getWorkflowEngine(): Promise<WorkflowEngine> {
  if (!workflowEngineInstance) {
    workflowEngineInstance = new WorkflowEngine();
    await workflowEngineInstance.initialize();
  }
  return workflowEngineInstance;
}
